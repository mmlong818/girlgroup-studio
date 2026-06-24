// 模型 API 绑定 — 文字 / 图像两套，落盘 data/settings.json，运行时即时生效
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './db.mjs';
import { env } from './config.mjs';

const FILE = path.join(DATA_DIR, 'settings.json');

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

function load() {
  if (!existsSync(FILE)) return {};
  try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return {}; }
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
    if (p.baseUrl !== undefined) next[kind].baseUrl = String(p.baseUrl).trim();
    if (p.modelId !== undefined) next[kind].modelId = String(p.modelId).trim();
    if (kind === 'text' && p.thinking !== undefined) next[kind].thinking = Boolean(p.thinking);
    if (p.apiKey !== undefined && String(p.apiKey).trim() && !String(p.apiKey).includes('•')) {
      next[kind].apiKey = String(p.apiKey).trim();
    }
  }
  writeFileSync(FILE, JSON.stringify(next, null, 2));
  return publicView();
}
