// Session-only editor drafts, scoped to the project, subject, and category.
export function createVisualDrafts() {
  const drafts = new Map();
  const key = ({ groupId, target, cat }) => JSON.stringify([groupId, target, cat]);
  return {
    get(scope) { return drafts.get(key(scope)); },
    set(scope, draft) { drafts.set(key(scope), { ...draft }); },
  };
}

export function selectedDraftOption(options, saved) {
  return options.find((option) => option.key === saved?.optionKey) || options[0];
}

export function readVisualDraft(panel, scope) {
  const selected = panel.querySelector('[data-opt].on');
  return {
    optionKey: scope.optionKeys[Number(selected?.dataset.opt || 0)],
    prompt: panel.querySelector('#vh-prompt').value,
    hint: panel.querySelector('#vh-hint').value,
    generatedPrompt: scope.generatedPrompt,
    size: panel.querySelector('#vh-size').value,
    quality: panel.querySelector('#vh-quality').value,
    useRef: panel.querySelector('#vh-useref')?.checked,
  };
}

export function restoreVisualDraft(options, saved, defaultSize) {
  const selected = selectedDraftOption(options, saved);
  const hint = saved?.hint || '';
  const draft = selected ? selected.build(hint.trim()) : { prompt: '', locks: [] };
  if (saved) draft.prompt = saved.generatedPrompt;
  return {
    selected, draft, hint,
    prompt: saved ? saved.prompt : draft.prompt,
    size: saved?.size || defaultSize,
    quality: saved?.quality || 'medium',
    useRef: saved?.useRef,
  };
}

export function isCurrentVisualGroup(current, savedGroup) {
  return current === savedGroup;
}
