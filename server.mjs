// 虚拟女团工坊「成团 StarForm」V2 — 本地服务器
// 形态：无账号单机版 + 独立 SQLite 数据存储 + GLM 文字生成 + gpt-image-2 生图/上传
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config.mjs';
import { STAGES } from './prompts.mjs';
import { runJSON } from './glm.mjs';
import { Groups, Images, Works, Studio, UPLOAD_DIR } from './db.mjs';
import { saveDataUrl, generateImage, generateWithReferences, imageGenAvailable } from './images.mjs';
import { publicView, save as saveSettings, getImage, getText } from './settings.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(env.PORT || 3210);
const HOST = env.HOST || '127.0.0.1';

function textGenAvailable() {
  const k = getText().apiKey;
  return Boolean(k && !k.includes('your-'));
}

if (!textGenAvailable()) {
  console.warn('⚠️ 未配置文字模型 API Key，服务仍会启动；配置前 AI 文字生成不可用，可在设置页补充。');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
};

function readBody(req, limit = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const json = (res, status, obj) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
};
const ok = (res, result) => json(res, 200, { ok: true, ...result });
const fail = (res, status, error) => json(res, status, { ok: false, error });

async function readJSONBody(req) {
  try {
    return JSON.parse((await readBody(req)) || '{}');
  } catch (err) {
    err.statusCode = err.message === '请求体过大' ? 413 : 400;
    throw err;
  }
}

function groupSummary(row) {
  let d = {};
  try { d = JSON.parse(row.data); } catch { /* 损坏数据按空处理 */ }
  const imgs = Images.listByGroup(row.id);
  const cover = imgs.find((i) => i.member === '' && i.is_primary) || imgs.find((i) => i.is_primary) || null;
  return {
    cover: cover ? `/uploads/${cover.filename}` : null,
    id: row.id,
    shareId: row.share_id,
    name: row.name,
    isPublic: !!row.is_public,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    theme: d.input?.theme || '',
    concept: d.concept?.concept || '',
    mainColor: d.concept?.mainColor || '#7c5cff',
    vibe: d.concept?.vibe || '',
    members: (d.concept?.members || []).map((m) => ({ codename: m.codename, color: m.color, archetype: m.archetype })),
  };
}

function workOut(row) {
  return {
    id: row.id, groupId: row.group_id, type: row.type, title: row.title,
    members: row.members, channel: row.channel, status: row.status,
    publishAt: row.publish_at,
    content: JSON.parse(row.content || '{}'), stats: JSON.parse(row.stats || '{}'),
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function groupFull(row) {
  return {
    ...groupSummary(row),
    data: JSON.parse(row.data),
    images: Images.listByGroup(row.id).map((i) => ({
      id: i.id, member: i.member, kind: i.kind, url: `/uploads/${i.filename}`, isPrimary: !!i.is_primary,
    })),
  };
}

async function handleAPI(req, res, urlPath) {
  const seg = urlPath.split('/').filter(Boolean); // ['api', ...]
  const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readJSONBody(req);

  // ── 生成（含 concepts3 / reroll / 五大阶段） ──
  if (req.method === 'POST' && urlPath === '/api/stage') {
    if (!textGenAvailable()) return fail(res, 503, '未配置文字模型 API Key，请先在设置页配置');
    const stage = STAGES[body.stage];
    if (!stage) return fail(res, 400, `未知阶段: ${body.stage}`);
    console.log(`[${new Date().toLocaleTimeString()}] 生成: ${body.stage}${body.payload?.member?.codename ? ' / ' + body.payload.member.codename : ''}`);
    const result = await runJSON(stage.system, stage.buildUser(body.payload || {}), { model: stage.model });
    return ok(res, { result });
  }

  // ── 企划 CRUD ──
  if (urlPath === '/api/groups' && req.method === 'GET') {
    return ok(res, { groups: Groups.list().map(groupSummary) });
  }
  if (urlPath === '/api/groups' && req.method === 'POST') {
    if (!body.data?.concept?.name) return fail(res, 400, '数据不完整，缺少团体概念');
    const row = Groups.create(body.data.concept.name, body.data);
    return ok(res, { group: groupFull(row) });
  }
  if (seg[1] === 'groups' && seg[2] && !seg[3]) {
    const row = Groups.byId(seg[2]);
    if (!row) return fail(res, 404, '企划不存在');
    if (req.method === 'GET') return ok(res, { group: groupFull(row) });
    if (req.method === 'PATCH') {
      const data = body.data ?? JSON.parse(row.data);
      const name = body.name ?? data?.concept?.name ?? null;
      Groups.update(row.id, data, name);
      return ok(res, { group: groupFull(Groups.byId(row.id)) });
    }
    if (req.method === 'DELETE') {
      for (const img of Images.listByGroup(row.id)) {
        try { unlinkSync(path.join(UPLOAD_DIR, img.filename)); } catch { /* 文件已不存在则跳过 */ }
      }
      Groups.delete(row.id);
      return ok(res, {});
    }
  }

  // ── 作品（运营中心） ──
  if (seg[1] === 'groups' && seg[2] && seg[3] === 'works' && req.method === 'GET') {
    return ok(res, { works: Works.listByGroup(seg[2]).map(workOut) });
  }
  // ── 创作间选题持久化 ──
  if (seg[1] === 'groups' && seg[2] && seg[3] === 'studio' && req.method === 'GET') {
    return ok(res, { studio: Studio.getAll(seg[2]) });
  }
  if (urlPath === '/api/studio' && req.method === 'POST') {
    if (!Groups.byId(body.groupId)) return fail(res, 404, '企划不存在');
    Studio.set(body.groupId, body.kind, body.topics);
    return ok(res, {});
  }
  if (urlPath === '/api/works' && req.method === 'POST') {
    if (!Groups.byId(body.groupId)) return fail(res, 404, '企划不存在');
    return ok(res, { work: workOut(Works.create(body.groupId, body)) });
  }
  if (urlPath === '/api/works/batch' && req.method === 'POST') {
    if (!Groups.byId(body.groupId)) return fail(res, 404, '企划不存在');
    const created = (body.works || []).map((w) => workOut(Works.create(body.groupId, w)));
    return ok(res, { works: created });
  }
  if (seg[1] === 'works' && seg[2] && req.method === 'PATCH') {
    if (!Works.byId(seg[2])) return fail(res, 404, '作品不存在');
    return ok(res, { work: workOut(Works.update(seg[2], body)) });
  }
  if (seg[1] === 'works' && seg[2] && req.method === 'DELETE') {
    Works.delete(seg[2]);
    return ok(res, {});
  }

  // ── 公开出道页数据 ──
  if (seg[1] === 'public' && seg[2] && req.method === 'GET') {
    const row = Groups.byShareId(seg[2]);
    if (!row || !row.is_public) return fail(res, 404, '页面不存在或未公开');
    return ok(res, { group: groupFull(row) });
  }

  // ── 图片 ──
  if (urlPath === '/api/images/upload' && req.method === 'POST') {
    const row = Groups.byId(body.groupId);
    if (!row) return fail(res, 404, '企划不存在');
    const filename = await saveDataUrl(body.dataUrl);
    const img = Images.create(body.groupId, body.member || '', 'upload', filename);
    return ok(res, { image: { id: img.id, member: img.member, kind: img.kind, url: `/uploads/${img.filename}`, isPrimary: !!img.is_primary } });
  }
  if (urlPath === '/api/images/generate' && req.method === 'POST') {
    const row = Groups.byId(body.groupId);
    if (!row) return fail(res, 404, '企划不存在');
    const isPoster = !body.member;
    let filename;
    if (isPoster) {
      // 海报：收集成员主图作为参考（API 最多接受 4 张）
      const allImgs = Images.listByGroup(body.groupId);
      const refs = allImgs.filter((i) => i.member && i.is_primary).slice(0, 4);
      const refPaths = refs.map((i) => path.join(UPLOAD_DIR, i.filename));
      console.log(`[${new Date().toLocaleTimeString()}] 生图: 团体海报 (${body.size || '1536x1024'})${refs.length ? ` · 参考 ${refs.length} 位成员主图` : ''}`);
      filename = refs.length
        ? await generateWithReferences(body.prompt, refPaths, { size: body.size || '1536x1024', quality: body.quality })
        : await generateImage(body.prompt, { size: body.size || '1536x1024', quality: body.quality });
    } else {
      console.log(`[${new Date().toLocaleTimeString()}] 生图: ${body.member} (${body.size || '1024x1536'})`);
      filename = await generateImage(body.prompt, { size: body.size, quality: body.quality });
    }
    const img = Images.create(body.groupId, body.member || '', body.kind || 'gen', filename);
    return ok(res, { image: { id: img.id, member: img.member, kind: img.kind, url: `/uploads/${img.filename}`, isPrimary: !!img.is_primary } });
  }
  if (seg[1] === 'images' && seg[2] && seg[3] === 'primary' && req.method === 'POST') {
    Images.setPrimary(seg[2]);
    return ok(res, {});
  }
  if (seg[1] === 'images' && seg[2] && req.method === 'DELETE') {
    const img = Images.byId(seg[2]);
    if (img) {
      try { unlinkSync(path.join(UPLOAD_DIR, img.filename)); } catch { /* 文件已不存在则跳过 */ }
      Images.delete(img.id);
    }
    return ok(res, {});
  }

  // ── 配置探测 ──
  if (urlPath === '/api/config' && req.method === 'GET') {
    return ok(res, { textGen: textGenAvailable(), textModel: getText().modelId, imageGen: imageGenAvailable(), imageModel: getImage().modelId });
  }
  if (urlPath === '/api/settings') {
    if (req.method === 'GET') return ok(res, { settings: publicView() });
    if (req.method === 'POST') return ok(res, { settings: saveSettings(body) });
  }

  return fail(res, 404, '接口不存在');
}

async function serveStatic(res, dir, file) {
  const filePath = path.join(dir, path.normalize(file).replace(/^([.][.][\\/])+/, ''));
  if (!filePath.startsWith(dir) || !existsSync(filePath)) {
    res.writeHead(404); res.end('Not Found'); return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': dir === UPLOAD_DIR ? 'public, max-age=86400' : 'no-store, no-cache, must-revalidate, max-age=0',
  });
  res.end(await readFile(filePath));
}

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (urlPath.startsWith('/api/')) return await handleAPI(req, res, urlPath);
    if (urlPath.startsWith('/uploads/')) return await serveStatic(res, UPLOAD_DIR, urlPath.slice(9));
    if (urlPath.startsWith('/g/')) return await serveStatic(res, PUBLIC_DIR, 'g.html');
    return await serveStatic(res, PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
  } catch (err) {
    console.error('  ⚠️', err.message);
    if (!res.headersSent) fail(res, err.statusCode || 500, err.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ✨ 成团 StarForm · 虚拟偶像工坊已启动');
  console.log(`  👉 浏览器打开: http://${HOST === '127.0.0.1' ? 'localhost' : HOST}:${PORT}`);
  console.log(`  （文字: ${publicView().text.modelId} / 生图: ${imageGenAvailable() ? getImage().modelId : '未配置，仅支持上传'}，Ctrl+C 关闭）`);
  console.log('');
});
