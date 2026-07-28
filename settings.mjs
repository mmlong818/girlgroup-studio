// 模型 API 绑定 — 文字 / 图像两套，存入 SQLite，运行时即时生效
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { AppSettings, DATA_DIR } from './db.mjs';
import { env } from './config.mjs';

const LEGACY_FILE = path.join(DATA_DIR, 'settings.json');
const SETTINGS_KEY = 'model_bindings';

function settingError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

// 出厂默认：文字用智谱 GLM-5.2（关闭思维模式），图像用 OpenAI 兼容
const DEFAULTS = {
  text: {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKey: env.ZHIPUAI_API_KEY || '',
    modelId: env.MODEL_ID || 'glm-5.2',
    thinking: false,
  },
  image: {
    baseUrl: env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    apiKey: env.OPENAI_API_KEY || '',
    modelId: env.IMAGE_MODEL_ID || 'gpt-image-2',
  },
};

function readLegacy() {
  if (!existsSync(LEGACY_FILE)) return null;
  try { return JSON.parse(readFileSync(LEGACY_FILE, 'utf8')); } catch { return null; }
}

function load() {
  const stored = AppSettings.get(SETTINGS_KEY);
  if (stored) return stored;
  const legacy = readLegacy();
  if (legacy) AppSettings.set(SETTINGS_KEY, legacy);
  return legacy || {};
}

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim().replace(/\/$/, '');
  let parsed;
  try { parsed = new URL(raw); } catch { throw settingError('API 地址格式无效'); }
  const loopback = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) {
    throw settingError('API 地址必须使用 HTTPS；本机 localhost 可使用 HTTP');
  }
  if (parsed.username || parsed.password) throw settingError('API 地址不能包含用户名或密码');
  return parsed.toString().replace(/\/$/, '');
}

function normalizeModelId(value) {
  const id = String(value || '').trim();
  if (!id || id.length > 200 || /[\r\n]/.test(id)) throw settingError('模型 ID 无效');
  return id;
}

export function getText() {
  const s = load().text || {};
  return { ...DEFAULTS.text, ...s };
}
export function getImage() {
  const s = load().image || {};
  return { ...DEFAULTS.image, ...s };
}

// 给前端的安全视图：不回传明文 key，只回传是否已设置
export function publicView() {
  const t = getText(), i = getImage();
  return {
    text: { baseUrl: t.baseUrl, modelId: t.modelId, thinking: t.thinking, hasKey: Boolean(t.apiKey) },
    image: { baseUrl: i.baseUrl, modelId: i.modelId, hasKey: Boolean(i.apiKey) },
  };
}

// 保存：apiKey 留空表示沿用旧值（不覆盖）
export function save(patch = {}) {
  const cur = load();
  const next = { text: { ...cur.text }, image: { ...cur.image } };
  for (const kind of ['text', 'image']) {
    const p = patch[kind];
    if (!p) continue;
    if (typeof p !== 'object' || Array.isArray(p)) throw settingError('模型设置格式无效');
    if (p.baseUrl !== undefined) {
      const baseUrl = normalizeBaseUrl(p.baseUrl);
      const oldBaseUrl = kind === 'text' ? getText().baseUrl : getImage().baseUrl;
      const hasNewKey = typeof p.apiKey === 'string' && p.apiKey.trim() && !p.apiKey.includes('•');
      if (baseUrl !== normalizeBaseUrl(oldBaseUrl) && !hasNewKey) {
        throw settingError('修改 API 地址时需要重新输入对应的 API Key');
      }
      next[kind].baseUrl = baseUrl;
    }
    if (p.modelId !== undefined) next[kind].modelId = normalizeModelId(p.modelId);
    if (kind === 'text' && p.thinking !== undefined) next[kind].thinking = Boolean(p.thinking);
    if (p.apiKey !== undefined && String(p.apiKey).trim() && !String(p.apiKey).includes('•')) {
      const apiKey = String(p.apiKey).trim();
      if (apiKey.length > 4096 || /[\r\n]/.test(apiKey)) throw settingError('API Key 格式无效');
      next[kind].apiKey = apiKey;
    }
  }
  AppSettings.set(SETTINGS_KEY, next);
  return publicView();
}
