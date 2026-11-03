// 图片模块 — gpt-image-2 生成 + 用户上传，统一落盘到 data/uploads/
import { writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
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

const RETRY_DELAYS = [3_000, 10_000];
const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504]);
const IMAGE_TIMEOUT_MS = 300_000;

async function withDeadline(run, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } catch (err) {
    if (controller.signal.aborted) throw new Error('生图 API 超时（5 分钟无响应）', { cause: err });
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function postWithRetry(url, init, signal) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { ...init, signal });
    } catch (err) {
      if (signal.aborted) throw err;
      if (attempt >= RETRY_DELAYS.length) throw new Error(`无法连接生图服务，请检查网络或服务地址（已重试 ${RETRY_DELAYS.length} 次）`);
    }
    if (res?.ok) return res;
    if (res && (!RETRYABLE.has(res.status) || attempt >= RETRY_DELAYS.length)) {
      const body = await res.text();
      throw new Error(`生图 API ${res.status}: ${body.slice(0, 300)}`);
    }
    console.log(`[${new Date().toLocaleTimeString()}] 生图: ${res ? `接口返回 ${res.status}` : '网络错误'}，${RETRY_DELAYS[attempt] / 1000} 秒后第 ${attempt + 1} 次重试`);
    await sleep(RETRY_DELAYS[attempt], undefined, { signal });
  }
}

async function saveB64(res, signal) {
  const data = await res.json();
  signal.throwIfAborted();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('生图 API 未返回图片数据');
  const filename = uid(14) + '.png';
  const file = path.join(UPLOAD_DIR, filename);
  try {
    await writeFile(file, Buffer.from(b64, 'base64'), { signal });
    signal.throwIfAborted();
  } catch (err) {
    try { await unlink(file); } catch { /* 文件尚未创建 */ }
    throw err;
  }
  return filename;
}

// dataUrl: "data:image/png;base64,...."（前端上传）
export async function saveDataUrl(dataUrl) {
  const m = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s);
  if (!m || !/^[A-Za-z0-9+/]+={0,2}$/.test(m[2])) throw inputError('图片格式不支持，请上传 PNG / JPG / WebP');
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length) throw inputError('图片数据为空或损坏');
  if (buf.length > 15 * 1024 * 1024) throw inputError('图片超过 15MB');
  const filename = uid(14) + EXT[m[1]];
  const file = path.join(UPLOAD_DIR, filename);
  try {
    await writeFile(file, buf);
  } catch (err) {
    try { await unlink(file); } catch { /* 文件尚未创建 */ }
    throw err;
  }
  return filename;
}

// 带参考图的团体海报生成（gpt-image-2 edits 端点）
export async function generateWithReferences(prompt, refPaths, { size = '1536x1024', quality = 'medium', timeoutMs = IMAGE_TIMEOUT_MS } = {}) {
  if (!imageGenAvailable()) throw new Error('未配置图像模型 API Key，无法使用 AI 生图，可改用上传图片');
  const img = getImage();
  const base = (img.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  return withDeadline(async (signal) => {
    const form = new FormData();
    form.append('model', img.modelId || 'gpt-image-2');
    form.append('prompt', prompt);
    form.append('size', size);
    form.append('quality', quality);
    form.append('n', '1');
    for (const imgPath of refPaths) {
      const buf = await readFile(imgPath, { signal });
      const ext = path.extname(imgPath).toLowerCase();
      const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
      form.append('image[]', new Blob([buf], { type: mime }), path.basename(imgPath));
    }
    const res = await postWithRetry(`${base}/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${img.apiKey}` },
      body: form,
    }, signal);
    return saveB64(res, signal);
  }, timeoutMs);
}

export async function generateImage(prompt, { size = '1024x1536', quality = 'medium', timeoutMs = IMAGE_TIMEOUT_MS } = {}) {
  if (!imageGenAvailable()) throw new Error('未配置图像模型 API Key，无法使用 AI 生图，可改用上传图片');
  const img = getImage();
  const base = (img.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  return withDeadline(async (signal) => {
    const res = await postWithRetry(`${base}/images/generations`, {
      method: 'POST',
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
    }, signal);
    return saveB64(res, signal);
  }, timeoutMs);
}
