import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createVisualDrafts, readVisualDraft, restoreVisualDraft, isCurrentVisualGroup,
} from '../public/js/visual-draft.js';

const options = [
  { key: 'first', size: '1024x1536', build: (hint) => ({ prompt: `first ${hint}`.trim(), locks: ['first'] }) },
  { key: 'second', size: '1024x1024', build: (hint) => ({ prompt: `second ${hint}`.trim(), locks: ['second'] }) },
];

function panel(values) {
  const nodes = {
    '[data-opt].on': { dataset: { opt: String(values.opt) } },
    '#vh-prompt': { value: values.prompt },
    '#vh-hint': { value: values.hint },
    '#vh-size': { value: values.size },
    '#vh-quality': { value: values.quality },
    '#vh-useref': { checked: values.useRef },
  };
  return { querySelector: (selector) => nodes[selector] };
}

test('same subject keeps manual prompt, hint, template and generation settings after style rerender', () => {
  const store = createVisualDrafts();
  const scope = { groupId: 'one', target: 'A', cat: 'look', optionKeys: options.map((o) => o.key), generatedPrompt: 'second blue light' };
  store.set(scope, readVisualDraft(panel({ opt: 1, prompt: 'manual prompt', hint: 'blue light', size: '1536x1024', quality: 'high', useRef: false }), scope));
  const restored = restoreVisualDraft(options, store.get(scope), '1024x1536');
  assert.equal(restored.selected.key, 'second');
  assert.equal(restored.prompt, 'manual prompt');
  assert.equal(restored.hint, 'blue light');
  assert.equal(restored.draft.prompt, 'second blue light');
  assert.deepEqual(restored.draft.locks, ['second']);
  assert.equal(restored.size, '1536x1024');
  assert.equal(restored.quality, 'high');
  assert.equal(restored.useRef, false);
});

test('drafts are isolated by project, subject and category', () => {
  const store = createVisualDrafts();
  const scope = { groupId: 'one', target: 'A', cat: 'look' };
  store.set(scope, { optionKey: 'second', prompt: 'A manual', hint: 'A hint' });
  for (const other of [
    { groupId: 'one', target: 'B', cat: 'look' },
    { groupId: 'one', target: 'A', cat: 'stage' },
    { groupId: 'two', target: 'A', cat: 'look' },
  ]) {
    assert.equal(store.get(other), undefined);
    assert.equal(restoreVisualDraft(options, store.get(other), '1024x1536').selected.key, 'first');
  }
  assert.equal(store.get(scope).prompt, 'A manual');
});

test('stale save callback cannot claim a different current project', () => {
  const old = { id: 'one' };
  assert.equal(isCurrentVisualGroup(old, old), true);
  assert.equal(isCurrentVisualGroup({ id: 'two' }, old), false);
  assert.equal(isCurrentVisualGroup({ id: 'one' }, old), false);
});

test('explicit template choice starts its template text while later rerender keeps it selected', () => {
  const store = createVisualDrafts();
  const scope = { groupId: 'one', target: 'A', cat: 'look', optionKeys: options.map((o) => o.key), generatedPrompt: 'second hint' };
  store.set(scope, readVisualDraft(panel({ opt: 1, prompt: 'second hint', hint: 'hint', size: '1024x1024', quality: 'medium', useRef: true }), scope));
  const restored = restoreVisualDraft(options, store.get(scope), '1024x1536');
  assert.equal(restored.selected.key, 'second');
  assert.equal(restored.prompt, 'second hint');
});

class Element {
  constructor(attrs = {}) {
    this.attrs = attrs;
    this.dataset = Object.fromEntries(Object.entries(attrs).filter(([key]) => key.startsWith('data-')).map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), value]));
    this.classes = new Set((attrs.class || '').split(/\s+/).filter(Boolean));
    this.classList = {
      contains: (name) => this.classes.has(name),
      add: (name) => this.classes.add(name),
      remove: (name) => this.classes.delete(name),
      toggle: (name, force) => {
        if (force ?? !this.classes.has(name)) this.classes.add(name);
        else this.classes.delete(name);
      },
    };
    this.value = attrs.value || '';
    this.checked = 'checked' in attrs;
    this.children = [];
    this.isConnected = true;
  }
  set innerHTML(html) {
    this.children = [];
    for (const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
      const attrs = {};
      for (const attr of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[attr[1]] = attr[2] ?? '';
      this.children.push(new Element(attrs));
    }
  }
  querySelectorAll(selector) {
    const matches = (node) => {
      if (selector.startsWith('#')) return node.attrs.id === selector.slice(1);
      const data = selector.match(/\[data-([\w-]+)(?:="([^"]*)")?\]/);
      if (data && (!(('data-' + data[1]) in node.attrs) || (data[2] !== undefined && node.attrs['data-' + data[1]] !== data[2]))) return false;
      const cls = selector.match(/\.([\w-]+)(?:$|\[)/);
      if (cls && !node.classes.has(cls[1])) return false;
      return Boolean(data || cls);
    };
    const result = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (matches(child)) result.push(child);
        walk(child);
      }
    };
    walk(this);
    return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  click() { return this.onclick?.(); }
  scrollIntoView() {}
  focus() {}
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function visualHarness() {
  const calls = [];
  const api = { groups: { updateArtStyle: (_id, artStyle) => {
    const wait = deferred();
    calls.push({ style: artStyle, ...wait });
    return wait.promise;
  } } };
  const source = readFileSync(new URL('../public/js/visual.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^export function /gm, 'function ');
  const load = new Function('deps', `
    const { api, $, esc, toast, modal, confirmModal, segmented, lightbox, appConfig,
      memberPresets, posterPresets, catOptions, refsFor, CATS, ART_STYLES, t,
      createVisualDrafts, readVisualDraft, restoreVisualDraft, isCurrentVisualGroup,
      window, sessionStorage, document } = deps;
    ${source}
    return { renderVisualTab };
  `);
  const visual = load({
    api, $: (selector, root) => root?.querySelector(selector), esc: (s) => String(s ?? ''),
    toast: () => {}, modal: () => {}, confirmModal: () => {}, lightbox: () => {},
    segmented: (id, opts, value) => `<span data-seg="${id}"><input id="${id}" value="${value}">${opts.map((o) => `<button class="seg-opt${o.value === value ? ' on' : ''}" data-val="${o.value}"></button>`).join('')}</span>`,
    appConfig: { imageGen: false }, memberPresets: () => [],
    posterPresets: () => [
      { key: 'first', label: 'first', prompt: 'first prompt', size: '1536x1024', locks: [] },
      { key: 'second', label: 'second', prompt: 'second prompt', size: '1024x1024', locks: [] },
    ],
    catOptions: () => [], refsFor: () => [], CATS: [],
    ART_STYLES: [{ key: 'A', label: 'A' }, { key: 'B', label: 'B' }], t: (s) => s,
    createVisualDrafts, readVisualDraft, restoreVisualDraft, isCurrentVisualGroup,
    window: { addEventListener: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {} }, document: {},
  });
  const root = new Element();
  const group = { id: 'group-one', data: { concept: { mainColor: '#000' }, members: [] }, images: [] };
  return { ...visual, root, group, calls };
}

test('renderVisualTab retains live control edits after host replaces the visual DOM', () => {
  const h = visualHarness();
  h.renderVisualTab(h.root, h.group, () => {});
  const panel = h.root.querySelector('#vis-panel');
  panel.querySelectorAll('[data-opt]')[1].click();
  panel.querySelector('#vh-prompt').value = 'manual prompt';
  panel.oninput();
  panel.querySelector('#vh-hint').value = 'neon';
  panel.oninput();
  panel.querySelector('#vh-size').value = '1024x1536';
  panel.onchange();
  panel.querySelector('#vh-quality').value = 'high';
  panel.onchange();
  h.root.innerHTML = '<section id="another-tab"></section>';
  h.renderVisualTab(h.root, h.group, () => {});
  const restored = h.root.querySelector('#vis-panel');
  assert.equal(restored.querySelector('#vh-prompt').value, 'manual prompt');
  assert.equal(restored.querySelector('#vh-hint').value, 'neon');
  assert.equal(restored.querySelectorAll('[data-opt]')[1].classList.contains('on'), true);
  assert.equal(restored.querySelector('#vh-size').value, '1024x1536');
  assert.equal(restored.querySelector('#vh-quality').value, 'high');
});

test('style controls serialize A then B; stale A failure cannot undo B', async () => {
  const h = visualHarness();
  h.renderVisualTab(h.root, h.group, () => {});
  const buttons = h.root.querySelector('#vis-panel').querySelectorAll('[data-artstyle]');
  const a = buttons[1].click();
  const b = buttons[2].click();
  assert.deepEqual(h.calls.map((call) => call.style), []);
  await Promise.resolve();
  assert.deepEqual(h.calls.map((call) => call.style), ['A']);
  h.calls[0].reject(new Error('A failed'));
  for (let i = 0; i < 8 && h.calls.length < 2; i++) await Promise.resolve();
  assert.deepEqual(h.calls.map((call) => call.style), ['A', 'B']);
  h.calls[1].resolve({});
  await Promise.all([a, b]);
  assert.equal(h.group.data.artStyle, 'B');
});

test('latest failed style rolls back to last committed style', async () => {
  const h = visualHarness();
  h.renderVisualTab(h.root, h.group, () => {});
  const buttons = h.root.querySelector('#vis-panel').querySelectorAll('[data-artstyle]');
  const a = buttons[1].click();
  await Promise.resolve();
  h.calls[0].resolve({});
  await a;
  const b = h.root.querySelector('#vis-panel').querySelectorAll('[data-artstyle]')[2].click();
  await Promise.resolve();
  h.calls[1].reject(new Error('B failed'));
  await b;
  assert.equal(h.group.data.artStyle, 'A');
});

test('old project style failure does not change the active project', async () => {
  const h = visualHarness();
  h.renderVisualTab(h.root, h.group, () => {});
  const oldSave = h.root.querySelector('#vis-panel').querySelectorAll('[data-artstyle]')[1].click();
  await Promise.resolve();
  const other = { id: 'group-two', data: { concept: { mainColor: '#fff' }, members: [] }, images: [] };
  h.renderVisualTab(h.root, other, () => {});
  const newSave = h.root.querySelector('#vis-panel').querySelectorAll('[data-artstyle]')[2].click();
  await Promise.resolve();
  assert.deepEqual(h.calls.map((call) => call.style), ['A', 'B']);
  h.calls[0].reject(new Error('old failed'));
  await oldSave;
  assert.equal(other.data.artStyle, 'B');
  h.calls[1].resolve({});
  await newSave;
  assert.equal(other.data.artStyle, 'B');
});
