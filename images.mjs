// 图片模块 — gpt-image-2 生成 + 用户上传，统一落盘到 data/uploads/
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { getImage } from './settings.mjs';
import { UPLOAD_DIR, uid } from './db.mjs';

const EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

function inputError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

export function imageGenAvailable() {
  const k = getImage().apiKey;
  return Boolean(k && !k.includes('your-'));
}

// dataUrl: "data:image/png;base64,...."（前端上传）
export async function saveDataUrl(dataUrl) {
  const m = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s);
  if (!m || !/^[A-Za-z0-9+/]+={0,2}$/.test(m[2])) throw inputError('图片格式不支持，请上传 PNG / JPG / WebP');
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length) throw inputError('图片数据为空或损坏');
  if (buf.length > 15 * 1024 * 1024) throw inputError('图片超过 15MB');
  const filename = uid(14) + EXT[m[1]];
  await writeFile(path.join(UPLOAD_DIR, filename), buf);
  return filename;
}

// 带参考图的团体海报生成（gpt-image-2 edits 端点）
export async function generateWithReferences(prompt, refPaths, { size = '1536x1024', quality = 'medium' } = {}) {
  if (!imageGenAvailable()) throw new Error('未配置图像模型 API Key，无法使用 AI 生图，可改用上传图片');
  const img = getImage();
  const base = (img.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const form = new FormData();
  form.append('model', img.modelId || 'gpt-image-2');
  form.append('prompt', prompt);
  form.append('size', size);
  form.append('quality', quality);
  form.append('n', '1');
  for (const imgPath of refPaths) {
    const buf = await readFile(imgPath);
    const ext = path.extname(imgPath).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
    form.append('image[]', new Blob([buf], { type: mime }), path.basename(imgPath));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300_000);
  try {
    const res = await fetch(`${base}/images/edits`, {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${img.apiKey}` },
      body: form,
    });
    if (!res.ok) { const b = await res.text(); throw new Error(`生图 API ${res.status}: ${b.slice(0, 300)}`); }
    const data = await res.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error('生图 API 未返回图片数据');
    const filename = uid(14) + '.png';
    await writeFile(path.join(UPLOAD_DIR, filename), Buffer.from(b64, 'base64'));
    return filename;
  } finally { clearTimeout(timer); }
}

export async function generateImage(prompt, { size = '1024x1536', quality = 'medium' } = {}) {
  if (!imageGenAvailable()) throw new Error('未配置图像模型 API Key，无法使用 AI 生图，可改用上传图片');
  const img = getImage();
  const base = (img.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300_000);
  try {
    const res = await fetch(`${base}/images/generations`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${img.apiKey}`,
      },
      body: JSON.stringify({
        model: img.modelId || 'gpt-image-2',
        prompt,
        size,
        quality,
        n: 1,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`生图 API ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error('生图 API 未返回图片数据');
    const filename = uid(14) + '.png';
    await writeFile(path.join(UPLOAD_DIR, filename), Buffer.from(b64, 'base64'));
    return filename;
  } finally {
    clearTimeout(timer);
  }
}
