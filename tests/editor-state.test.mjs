import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAFT_KEY, updateEditorField, saveWizardDraft, loadWizardDraft, clearWizardDraft,
  beginWizardSession, completeWizardSave,
} from '../public/js/editor-state.js';

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function state() {
  return {
    concept: { name: 'Team', members: [{ id: 'sk-1', codename: 'A', color: 'red' }, { id: 'sk-2', codename: 'B' }] },
    members: [{ id: 'profile-1', codename: 'A', secret: 'kept' }, { id: 'profile-2', codename: 'B' }],
    relations: { overview: 'close' },
  };
}

test('manual and AI paths both synchronize only the matching codename', () => {
  const data = state();
  assert.equal(updateEditorField(data, 'concept.members.0.codename', 'New A'), true);
  assert.equal(data.members[0].codename, 'New A');
  assert.equal(updateEditorField(data, 'members.1.codename', 'New B'), true);
  assert.equal(data.concept.members[1].codename, 'New B');
  assert.equal(data.concept.members[0].id, 'sk-1');
  assert.equal(data.members[0].id, 'profile-1');
  assert.equal(data.members[0].secret, 'kept');
  assert.equal(data.concept.members[0].color, 'red');
  assert.equal(data.members[0].codename, 'New A');
  assert.equal(updateEditorField(data, 'members.0.secret', 'updated'), true);
  assert.equal(data.concept.members[0].codename, 'New A');
  assert.equal(data.members[0].secret, 'updated');
});

test('draft roundtrip restores candidates, edits, stage and Set locks', () => {
  const store = storage();
  const options = [{ name: 'One' }, { name: 'Two' }];
  const data = state();
  updateEditorField(data, 'members.0.codename', 'Changed');
  const draft = {
    step: 3, input: { theme: 'test', memberCount: 2 }, options, chosen: options[1],
    state: data, locked: new Set(['concept', 'members']), gen: 42, pending: true,
  };
  assert.equal(saveWizardDraft(draft, store), true);
  const restored = loadWizardDraft(store);
  assert.equal(restored.step, 3);
  assert.deepEqual(restored.options, options);
  assert.strictEqual(restored.chosen, restored.options[1]);
  assert.deepEqual([...restored.locked], ['concept', 'members']);
  assert.equal(restored.state.concept.members[0].codename, 'Changed');
  assert.equal(restored.state.members[0].codename, 'Changed');
  assert.equal(restored.gen, 0);
  assert.equal('pending' in restored, false);
  assert.equal(clearWizardDraft(store), true);
  assert.equal(loadWizardDraft(store), null);
});

test('unfinished concept request restores without inventing an option', () => {
  const store = storage();
  saveWizardDraft({ step: 2, input: { theme: 'test', memberCount: 3 }, options: null, chosen: null, state: {}, locked: new Set() }, store);
  assert.equal(loadWizardDraft(store).chosen, null);
  assert.equal(loadWizardDraft(store).options, null);
});

test('old pending save cannot clear a new session draft after leaving and reentering', () => {
  const store = storage();
  const old = beginWizardSession({ step: 1, input: { theme: 'old', memberCount: 2 },
    options: null, chosen: null, state: {}, locked: new Set() }, store);
  const oldToken = ++old.saveToken;
  const oldRevision = old.revision;
  const current = beginWizardSession(loadWizardDraft(store), store);
  current.input.theme = 'new';
  saveWizardDraft(current, store);

  assert.equal(completeWizardSave(current, old, oldToken, oldRevision, store), false);
  assert.equal(loadWizardDraft(store).input.theme, 'new');
  assert.equal(loadWizardDraft(store).sessionId, current.sessionId);
  assert.notEqual(current.sessionId, old.sessionId);
});

test('current successful save clears only its unchanged draft', () => {
  const store = storage();
  const current = beginWizardSession({ step: 1, input: { theme: 'current', memberCount: 2 },
    options: null, chosen: null, state: {}, locked: new Set() }, store);
  const token = ++current.saveToken;
  const revision = current.revision;
  assert.equal(completeWizardSave(current, current, token, revision, store), true);
  assert.equal(loadWizardDraft(store), null);
});

test('a later edit or save attempt invalidates an earlier save completion', () => {
  const store = storage();
  const current = beginWizardSession({ step: 1, input: { theme: 'current', memberCount: 2 },
    options: null, chosen: null, state: {}, locked: new Set() }, store);
  const token = ++current.saveToken;
  const revision = current.revision;
  current.input.theme = 'revised';
  saveWizardDraft(current, store);
  assert.equal(completeWizardSave(current, current, token, revision, store), false);
  assert.equal(loadWizardDraft(store).input.theme, 'revised');
  const newerToken = ++current.saveToken;
  assert.equal(completeWizardSave(current, current, token, current.revision, store), false);
  assert.equal(completeWizardSave(current, current, newerToken, current.revision, store), true);
});

test('a current successful save can finish when browser storage is unavailable', () => {
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  const current = beginWizardSession({ step: 1, input: { theme: 'current', memberCount: 2 },
    options: null, chosen: null, state: {}, locked: new Set() }, blocked);
  const token = ++current.saveToken;
  assert.equal(completeWizardSave(current, current, token, current.revision, blocked), true);
});

test('damaged, incompatible and unavailable storage fail closed', () => {
  const store = storage();
  store.setItem(DRAFT_KEY, '{broken');
  assert.equal(loadWizardDraft(store), null);
  store.setItem(DRAFT_KEY, JSON.stringify({ version: 99, step: 1 }));
  assert.equal(loadWizardDraft(store), null);
  store.setItem(DRAFT_KEY, JSON.stringify({ version: 1, step: 3, input: { theme: 't', memberCount: 2 }, options: [{}], chosenIndex: 0, state: {}, locked: ['concept'] }));
  assert.equal(loadWizardDraft(store), null);
  store.setItem(DRAFT_KEY, JSON.stringify({ version: 1, step: 3, input: { theme: 't', memberCount: 2 }, options: [{}], chosenIndex: 0, state: { concept: { name: 'T', members: [null] } }, locked: ['concept'] }));
  assert.equal(loadWizardDraft(store), null);
  const broken = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); }, removeItem() { throw Error('blocked'); } };
  assert.equal(loadWizardDraft(broken), null);
  assert.equal(saveWizardDraft({ step: 1, input: {}, options: null, state: {}, locked: new Set() }, broken), false);
  assert.equal(clearWizardDraft(broken), false);
});

test('stale wizard modal callbacks cannot mutate a reentered draft', async () => {
  const store = storage();
  const body = { children: [], appendChild(el) { el.parent = this; this.children.push(el); }, querySelector(selector) {
    return [...this.children].reverse().map((el) => el.querySelector(selector)).find(Boolean) || null;
  } };
  class Element {
    constructor() { this.children = []; this.dataset = {}; this.className = ''; this.value = ''; this.disabled = false; }
    set innerHTML(html) {
      this.html = html;
      this.children = [];
      const tags = /<(button|input|textarea|div|span|nav)\b([^>]*)>/g;
      for (const match of html.matchAll(tags)) {
        const child = new Element();
        child.parent = this;
        for (const attr of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
          if (attr[1] === 'id') child.id = attr[2];
          else if (attr[1] === 'class') child.className = attr[2] || '';
          else if (attr[1].startsWith('data-')) child.dataset[attr[1].slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = attr[2] || '';
          else if (attr[1] === 'value') child.value = attr[2] || '';
        }
        child.classList = {
          contains: (name) => child.className.split(' ').includes(name),
          toggle: (name, force) => {
            const classes = new Set(child.className.split(' ').filter(Boolean));
            const on = force ?? !classes.has(name);
            if (on) classes.add(name); else classes.delete(name);
            child.className = [...classes].join(' ');
            return on;
          },
        };
        this.children.push(child);
      }
    }
    get innerHTML() { return this.html || ''; }
    querySelectorAll(selector) {
      const match = (el) => selector.startsWith('#') ? el.id === selector.slice(1)
        : selector.startsWith('.') ? el.className.split(' ').includes(selector.slice(1))
          : selector.startsWith('[data-') ? Object.hasOwn(el.dataset, selector.slice(6, -1).replace(/-([a-z])/g, (_, c) => c.toUpperCase())) : false;
      return this.children.flatMap((child) => [
        ...(match(child) ? [child] : []), ...child.querySelectorAll(selector),
      ]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    addEventListener(event, callback) { this[`on${event}`] = callback; }
    remove() { if (this.parent?.children) this.parent.children = this.parent.children.filter((x) => x !== this); }
  }
  const app = new Element();
  globalThis.document = {
    documentElement: {}, body,
    createElement: () => new Element(),
    addEventListener() {},
    querySelector: (selector) => app.querySelector(selector) || app.children.map((el) => el.querySelector(selector)).find(Boolean) || body.querySelector(selector),
    querySelectorAll: (selector) => app.children.flatMap((el) => el.querySelectorAll(selector)),
  };
  globalThis.window = { localStorage: store };
  globalThis.localStorage = store;
  globalThis.location = { hash: '#/new' };
  let releaseNames;
  globalThis.fetch = () => new Promise((resolve) => { releaseNames = resolve; });
  const { renderWizard } = await import('../public/js/wizard.js');

  const options = [{ name: 'Chosen', concept: 'concept' }];
  saveWizardDraft({ step: 3, input: { theme: 'old', memberCount: 1 }, options,
    chosen: options[0], state: { concept: { name: 'Old', members: [{ codename: 'A' }] } }, locked: new Set() }, store);
  renderWizard(app);
  document.querySelectorAll('[data-edit-path]')[0].onclick();
  const editMask = body.children.at(-1);
  editMask.querySelector('#ed-ta').value = 'Changed';
  document.querySelectorAll('[data-rename]')[0].onclick();
  const renameMask = body.children.at(-1);
  document.querySelector('#ph-restart').onclick();
  const restartMask = body.children.at(-1);

  location.hash = '#/';
  clearWizardDraft(store);
  saveWizardDraft({ step: 1, input: { theme: 'new', memberCount: 1 },
    options: null, chosen: null, state: {}, locked: new Set() }, store);
  location.hash = '#/new';
  renderWizard(app);
  const before = store.getItem(DRAFT_KEY);

  editMask.querySelector('[data-ok]').onclick();
  restartMask.querySelector('[data-ok]').onclick();
  await Promise.resolve();
  releaseNames({ json: async () => ({ ok: true, result: { options: [{ name: 'Late', reason: 'mock' }] } }) });
  await new Promise((resolve) => setTimeout(resolve, 0));
  renameMask.querySelector('.rn-item').onclick();
  renameMask.querySelector('[data-ok]').onclick();
  assert.equal(store.getItem(DRAFT_KEY), before);
  assert.equal(loadWizardDraft(store).step, 1);
  assert.equal(loadWizardDraft(store).input.theme, 'new');

  document.querySelector('#btn-fresh').onclick();
  const freshMask = body.children.at(-1);
  location.hash = '#/';
  renderWizard(app);
  location.hash = '#/new';
  renderWizard(app);
  const secondBefore = store.getItem(DRAFT_KEY);
  freshMask.querySelector('[data-ok]').onclick();
  await Promise.resolve();
  assert.equal(store.getItem(DRAFT_KEY), secondBefore);
});
