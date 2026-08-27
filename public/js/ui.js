// 通用 UI 工具
import { t } from './i18n.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function toast(msg, ms = 2000) {
  $('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export function modal(html, { onMount } = {}) {
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `<div class="modal">${html}</div>`;
  const close = () => mask.remove();
  mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
  document.body.appendChild(mask);
  onMount?.(mask, close);
  return close;
}

export function confirmModal(title, text) {
  return new Promise((resolve) => {
    modal(`<h3>${esc(title)}</h3><p class="sub">${esc(text)}</p>
      <div class="m-foot"><button class="btn btn-ghost" data-x>${t('取消')}</button><button class="btn btn-danger" data-ok>${t('确认')}</button></div>`,
      { onMount: (mask, close) => {
        $('[data-x]', mask).onclick = () => { close(); resolve(false); };
        $('[data-ok]', mask).onclick = () => { close(); resolve(true); };
      } });
  });
}

// 图片灯箱：点击放大，再点任意处 / Esc 关闭
export function lightbox(url) {
  const mask = document.createElement('div');
  mask.className = 'lightbox-mask';
  mask.innerHTML = `<img src="${esc(url)}" alt="">`;
  const close = () => { mask.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  mask.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(mask);
}

export function copyText(text) {
  navigator.clipboard.writeText(text).then(() => toast(t('已复制到剪贴板')));
}

// 分段选项控件（替代 ≤5 项的下拉）。内含隐藏 input，故 $('#id').value 读取方式不变。
// options: [{ value, label }]
export function segmented(id, options, current) {
  return `<span class="seg" data-seg="${esc(id)}">
    <input type="hidden" id="${esc(id)}" value="${esc(current)}">
    ${options.map((o) => `<button type="button" class="seg-opt${o.value === current ? ' on' : ''}" data-val="${esc(o.value)}">${esc(o.label)}</button>`).join('')}
  </span>`;
}
document.addEventListener('click', (e) => {
  const opt = e.target.closest('.seg-opt');
  if (!opt) return;
  const seg = opt.closest('.seg');
  seg.querySelectorAll('.seg-opt').forEach((b) => b.classList.toggle('on', b === opt));
  const input = seg.querySelector('input[type=hidden]');
  if (input) { input.value = opt.dataset.val; input.dispatchEvent(new Event('change', { bubbles: true })); }
});

export function download(filename, content, mime) {
  const a = document.createElement('a');
  a.href = typeof content === 'string' && content.startsWith('data:') ? content : URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
  if (a.href.startsWith('blob:')) URL.revokeObjectURL(a.href);
}

// 按路径读写嵌套对象，如 'members.0.flaw'
export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}
export function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  target[last] = value;
}
