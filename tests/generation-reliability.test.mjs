import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = mkdtempSync(path.join(os.tmpdir(), 'starform-generation-'));
process.env.STARFORM_DATA_DIR = dataDir;
writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({
  image: { baseUrl: 'https://image.invalid/v1', apiKey: 'test-image-key', modelId: 'gpt-image-2' },
}));
const [{ generateImage, generateWithReferences }, { createServer }, db] = await Promise.all([
  import('../images.mjs'), import('../server.mjs'), import('../db.mjs'),
]);
const server = createServer();
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const port = server.address().port;
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const dataUrl = `data:image/png;base64,${png}`;
const groupData = { concept: { name: '测试', members: [{ codename: '星', archetype: '队长', color: '#123456' }] }, members: [{ codename: '星' }] };

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.closeDatabase();
  rmSync(dataDir, { recursive: true, force: true });
});

function request(method, url, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: url, headers: {
      Host: `127.0.0.1:${port}`, 'Content-Type': 'application/json',
    } }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

function slowBody(signal, status = 200) {
  const stream = new ReadableStream({
    start(controller) {
      signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
    },
  });
  return new Response(stream, { status });
}

test('成功响应头之后挂起的成功体按完整操作截止时间中断，不重试', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, { signal }) => { calls++; return slowBody(signal); };
  try {
    await assert.rejects(() => generateImage('test', { timeoutMs: 30 }), /生图 API 超时/);
    assert.equal(calls, 1);
    assert.deepEqual(readdirSync(db.UPLOAD_DIR), []);
  } finally { globalThis.fetch = original; }
});

test('错误响应体也受截止时间保护且不会被当成其它端点重试', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, { signal }) => { calls++; return slowBody(signal, 400); };
  try {
    await assert.rejects(() => generateImage('test', { timeoutMs: 30 }), /生图 API 超时/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('正常响应体保存图片并释放定时器', async () => {
  const original = globalThis.fetch;
  let signal;
  globalThis.fetch = async (_url, init) => {
    signal = init.signal;
    return Response.json({ data: [{ b64_json: png }] });
  };
  try {
    const filename = await generateImage('test', { timeoutMs: 30 });
    assert.ok(readdirSync(db.UPLOAD_DIR).includes(filename));
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(signal.aborted, false);
  } finally { globalThis.fetch = original; }
});

test('参考编辑的错误体按原状态返回，不重试到生图端点', async () => {
  const group = db.Groups.create('原图企划', groupData);
  const uploaded = await request('POST', '/api/images/upload', { groupId: group.id, member: '星', dataUrl });
  assert.equal(uploaded.status, 200);
  const ref = db.Images.listByGroup(group.id)[0];
  const original = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => { urls.push(url); return new Response('invalid reference', { status: 400 }); };
  try {
    await assert.rejects(() => generateWithReferences('test', [path.join(db.UPLOAD_DIR, ref.filename)]), /生图 API 400: invalid reference/);
    assert.deepEqual(urls, ['https://image.invalid/v1/images/edits']);
  } finally { globalThis.fetch = original; }
});

test('企划删除后参考生图完成不写入孤儿记录或文件，其他企划保持不变', async () => {
  const deleted = db.Groups.create('待删除', groupData);
  const kept = db.Groups.create('保留', groupData);
  const keptUpload = await request('POST', '/api/images/upload', { groupId: kept.id, member: '星', dataUrl });
  assert.equal(keptUpload.status, 200);
  const refUpload = await request('POST', '/api/images/upload', { groupId: deleted.id, member: '星', dataUrl });
  assert.equal(refUpload.status, 200);
  const keptFile = db.Images.listByGroup(kept.id)[0].filename;
  const deletedFile = db.Images.listByGroup(deleted.id)[0].filename;
  const filesBefore = readdirSync(db.UPLOAD_DIR);

  const original = globalThis.fetch;
  let release;
  const entered = new Promise((resolve) => { globalThis.fetch = async (url) => {
    assert.match(url, /\/images\/edits$/);
    resolve();
    return new Promise((done) => { release = () => done(Response.json({ data: [{ b64_json: png }] })); });
  }; });
  try {
    const pending = request('POST', '/api/images/generate', { groupId: deleted.id, member: '星', prompt: '角色新图' });
    await entered;
    assert.equal((await request('DELETE', `/api/groups/${deleted.id}`)).status, 200);
    release();
    const result = await pending;
    assert.equal(result.status, 404);
    assert.match(result.body.error, /企划已删除/);
    assert.deepEqual(db.Images.listByGroup(deleted.id), []);
    assert.deepEqual(readdirSync(db.UPLOAD_DIR), filesBefore.filter((file) => file !== deletedFile));
    assert.ok(readdirSync(db.UPLOAD_DIR).includes(keptFile));
    assert.equal(db.Images.listByGroup(kept.id).length, 1);
  } finally { globalThis.fetch = original; }
});

test('上传正常落盘；缺失企划的原子插入不会新增记录', async () => {
  const group = db.Groups.create('上传企划', groupData);
  const uploaded = await request('POST', '/api/images/upload', { groupId: group.id, dataUrl });
  assert.equal(uploaded.status, 200);
  const count = db.Images.listByGroup(group.id).length;
  assert.throws(() => db.Images.create('missing-group', '', 'upload', 'never.png'), (err) => err.statusCode === 404);
  assert.equal(db.Images.listByGroup(group.id).length, count);
});
