export const DRAFT_KEY = 'starform.wizard.draft';
const VERSION = 1;
const PHASES = ['concept', 'members', 'relations'];

function newSessionId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function beginWizardSession(wiz, storage) {
  wiz.sessionId = newSessionId();
  wiz.saveToken = 0;
  if (wiz.input) saveWizardDraft(wiz, storage);
  return wiz;
}

export function updateEditorField(data, path, value) {
  const keys = path.split('.');
  const parent = keys.slice(0, -1).reduce((node, key) => node?.[key], data);
  if (!parent || typeof parent !== 'object') return false;
  parent[keys.at(-1)] = value;
  const match = path.match(/^(?:concept\.members|members)\.(\d+)\.codename$/);
  if (match) {
    const index = Number(match[1]);
    const other = path.startsWith('concept.') ? data.members?.[index] : data.concept?.members?.[index];
    if (other && typeof other === 'object') other.codename = value;
  }
  return true;
}

function storageOrNull(storage) {
  try { return storage ?? globalThis.localStorage; } catch { return null; }
}

export function saveWizardDraft(wiz, storage) {
  try {
    const target = storageOrNull(storage);
    if (!target) return false;
    const revision = (wiz.revision || 0) + 1;
    target.setItem(DRAFT_KEY, JSON.stringify({
      version: VERSION, step: wiz.step, input: wiz.input, options: wiz.options,
      chosenIndex: wiz.options?.indexOf(wiz.chosen) ?? -1,
      state: wiz.state, locked: [...wiz.locked], sessionId: wiz.sessionId,
      revision,
    }));
    wiz.revision = revision;
    return true;
  } catch { return false; }
}

export function loadWizardDraft(storage) {
  try {
    const raw = storageOrNull(storage)?.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d.version !== VERSION || ![1, 2, 3].includes(d.step) ||
        !d.input || typeof d.input !== 'object' || Array.isArray(d.input) ||
        (d.input.memberCount != null && (!Number.isInteger(d.input.memberCount) || d.input.memberCount < 1 || d.input.memberCount > 5)) ||
        (d.options != null && (!Array.isArray(d.options) || !d.options.every((o) => o && typeof o === 'object'))) ||
        !d.state || typeof d.state !== 'object' || Array.isArray(d.state) ||
        !Array.isArray(d.locked) || !d.locked.every((k) => PHASES.includes(k))) return null;
    if (d.step >= 2 && !d.input.theme) return null;
    if (d.step === 3 && (!Number.isInteger(d.chosenIndex) || !d.options?.[d.chosenIndex] ||
        !Number.isInteger(d.input.memberCount))) return null;
    const allowed = d.input.memberCount === 1 ? PHASES.slice(0, 2) : PHASES;
    if (d.locked.some((k, i) => !allowed.includes(k) || allowed.indexOf(k) !== i || !d.state[k])) return null;
    if (d.state.concept && (!Array.isArray(d.state.concept.members) || !d.state.concept.name ||
        !d.state.concept.members.every((m) => m && typeof m === 'object'))) return null;
    if (d.state.members && (!Array.isArray(d.state.members) ||
        !d.state.members.every((m) => m && typeof m === 'object'))) return null;
    if (d.state.relations && (!d.state.relations || typeof d.state.relations !== 'object' ||
        (d.state.relations.pairs != null && (!Array.isArray(d.state.relations.pairs) ||
          !d.state.relations.pairs.every((p) => p && typeof p === 'object'))))) return null;
    return {
      step: d.step, input: d.input, options: d.options,
      chosen: d.options?.[d.chosenIndex] ?? null, state: d.state,
      locked: new Set(d.locked), gen: 0,
      sessionId: d.sessionId, revision: d.revision || 0,
    };
  } catch { return null; }
}

export function clearWizardDraft(storage) {
  try { storageOrNull(storage)?.removeItem(DRAFT_KEY); return true; } catch { return false; }
}

export function completeWizardSave(current, session, token, revision, storage) {
  if (current !== session || session.saveToken !== token || session.revision !== revision) return false;
  const target = storageOrNull(storage);
  if (!target) return true;
  let raw;
  try { raw = target.getItem(DRAFT_KEY); } catch { return true; }
  if (!raw) return true;
  try {
    const draft = JSON.parse(raw);
    if (draft.sessionId !== session.sessionId || draft.revision !== revision) return false;
    try { target.removeItem(DRAFT_KEY); } catch { return true; }
    return true;
  } catch { return false; }
}
