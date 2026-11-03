// Static Lucide assets in /icons; the accompanying license is kept there.
const ICONS = new Set([
  'arrow-left', 'arrow-right', 'check', 'file-up', 'folder-open',
  'lock-keyhole', 'pencil', 'plus', 'refresh-cw', 'rotate-ccw',
  'settings-2', 'sparkles', 'wand-sparkles',
]);

export function icon(name) {
  if (!ICONS.has(name)) throw new Error(`Unknown icon: ${name}`);
  return `<img class="ui-icon" src="/icons/${name}.svg" width="16" height="16" alt="" aria-hidden="true">`;
}

export function iconLabel(label) {
  return label.replace(/^[^\p{L}\p{N}]+/u, '');
}
