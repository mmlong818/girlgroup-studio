// 多语言 — gettext 风格：简体中文原文即 key，缺译自动回退中文
// t('原文 {n}', { n: 3 }) → 查当前语言字典 → 插值
import { ZH_TW } from './locales/zh-TW.js';
import { EN } from './locales/en.js';
import { JA } from './locales/ja.js';

export const LANG_OPTIONS = [
  ['zh-CN', '简体中文'],
  ['zh-TW', '繁體中文'],
  ['en', 'English'],
  ['ja', '日本語'],
];
const DICTS = { 'zh-TW': ZH_TW, en: EN, ja: JA };
const KEY = 'sf-lang';

function safeStorage() {
  try {
    const s = window.localStorage;
    s.setItem('__sf_lang_test__', '1');
    s.removeItem('__sf_lang_test__');
    return s;
  } catch { return null; }
}
const storage = safeStorage();

function detect() {
  const saved = storage?.getItem(KEY);
  if (saved && DICTS[saved]) return saved;
  if (saved === 'zh-CN') return 'zh-CN';
  const nav = navigator.language || '';
  if (/^zh-(TW|HK|Hant)/i.test(nav)) return 'zh-TW';
  if (/^ja/i.test(nav)) return 'ja';
  if (/^en/i.test(nav)) return 'en';
  return 'zh-CN';
}

export const lang = detect();
document.documentElement.lang = lang;

export function setLang(next) {
  try { storage?.setItem(KEY, next); } catch { /* 存储被禁用则本次会话内有效 */ }
  location.reload();
}

const dict = DICTS[lang] || null;

export function t(src, vars) {
  let out = (dict && dict[src]) || src;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}

// 日期本地化
export function fmtDate(value) {
  return new Date(value).toLocaleDateString(lang);
}

// 顶栏语言切换器
export function mountLangSwitch() {
  const bar = document.querySelector('.topbar-inner');
  if (!bar || document.getElementById('lang-switch')) return;
  const sel = document.createElement('select');
  sel.id = 'lang-switch';
  sel.title = 'Language';
  sel.innerHTML = LANG_OPTIONS.map(([v, l]) => `<option value="${v}"${v === lang ? ' selected' : ''}>${l}</option>`).join('');
  sel.addEventListener('change', () => setLang(sel.value));
  const actions = document.getElementById('topbar-actions');
  bar.insertBefore(sel, actions);
}
