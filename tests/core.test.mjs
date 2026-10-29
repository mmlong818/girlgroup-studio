import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = mkdtempSync(path.join(os.tmpdir(), 'starform-test-'));
process.env.STARFORM_DATA_DIR = dataDir;
writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({
  text: {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKey: 'test-text-key',
    modelId: 'glm-5.2',
    thinking: false,
  },
  image: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'test-image-key',
    modelId: 'gpt-image-2',
  },
}));

const [{ createServer }, dbModule, settings, validation] = await Promise.all([
  import('../server.mjs'),
  import('../db.mjs'),
  import('../settings.mjs'),
  import('../validation.mjs'),
]);

const server = createServer();
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const port = server.address().port;
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  dbModule.closeDatabase();
  rmSync(dataDir, { recursive: true, force: true });
});

function request(method, pathname, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      method,
      path: pathname,
      headers,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json;
        try { json = JSON.parse(text); } catch { json = null; }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('旧设置迁移到 SQLite，且安全视图不返回密钥', () => {
  const stored = dbModule.AppSettings.get('model_bindings');
  assert.equal(stored.text.modelId, 'glm-5.2');
  const view = settings.publicView();
  assert.equal(view.text.hasKey, true);
  assert.equal(Object.hasOwn(view.text, 'apiKey'), false);
  assert.throws(
    () => settings.save({ text: { baseUrl: 'https://example.com/v1' } }),
    /重新输入对应的 API Key/,
  );
});

test('模型返回结构错误统一按上游错误处理', () => {
  assert.throws(
    () => validation.validateStageResult('concept', { name: 'A' }),
    (err) => err.statusCode === 502 && /模型返回结构无效/.test(err.message),
  );
});

test('HTTP 安全边界与 SQLite CRUD', async (t) => {
  let sourceGroup;
  await t.test('拒绝跨来源写请求', async () => {
    const res = await request('POST', '/api/groups', {
      headers: {
        Host: `127.0.0.1:${port}`,
        Origin: 'https://evil.example',
        'Content-Type': 'text/plain',
      },
      body: '{}',
    });
    assert.equal(res.status, 403);
  });

  await t.test('拒绝非 JSON 写请求', async () => {
    const res = await request('POST', '/api/groups', {
      headers: {
        Host: `127.0.0.1:${port}`,
        Origin: `http://127.0.0.1:${port}`,
        'Content-Type': 'text/plain',
      },
      body: '{}',
    });
    assert.equal(res.status, 415);
  });

  await t.test('拒绝未授权 Host', async () => {
    const res = await request('GET', '/api/groups', { headers: { Host: 'evil.example' } });
    assert.equal(res.status, 403);
  });

  await t.test('静态页面包含安全响应头并阻止目录穿越', async () => {
    const page = await request('GET', '/', { headers: { Host: `127.0.0.1:${port}` } });
    assert.equal(page.status, 200);
    assert.match(page.headers['content-security-policy'], /default-src 'self'/);
    assert.equal(page.headers['x-content-type-options'], 'nosniff');

    const traversal = await request('GET', '/%2e%2e/server.mjs', { headers: { Host: `127.0.0.1:${port}` } });
    assert.equal(traversal.status, 404);

    const legacyEntry = await request('GET', '/full.html', { headers: { Host: `127.0.0.1:${port}` } });
    assert.equal(legacyEntry.status, 200);
    assert.equal(legacyEntry.text, page.text);
  });

  await t.test('企划写入并从 SQLite 读取', async () => {
    const data = {
      concept: {
        name: '测试企划',
        members: [{ codename: '星', archetype: '队长', color: '#123456' }],
      },
      members: [{ codename: '星' }],
    };
    const created = await request('POST', '/api/groups', {
      headers: {
        Host: `127.0.0.1:${port}`,
        Origin: `http://127.0.0.1:${port}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ data }),
    });
    assert.equal(created.status, 200);
    assert.equal(created.json.group.name, '测试企划');
    sourceGroup = created.json.group;

    const listed = await request('GET', '/api/groups', { headers: { Host: `127.0.0.1:${port}` } });
    assert.equal(listed.status, 200);
    assert.equal(listed.json.groups.length, 1);
  });

  await t.test('完整备份可恢复作品、创作间和图片', async () => {
    const jsonHeaders = {
      Host: `127.0.0.1:${port}`,
      'Content-Type': 'application/json',
    };
    await request('POST', '/api/studio', {
      headers: jsonHeaders,
      body: JSON.stringify({ groupId: sourceGroup.id, kind: 'video', topics: [{ title: '测试选题' }] }),
    });
    await request('POST', '/api/works', {
      headers: jsonHeaders,
      body: JSON.stringify({ groupId: sourceGroup.id, type: 'short_video', title: '测试作品', content: { hook: '开场' } }),
    });
    await request('POST', '/api/images/upload', {
      headers: jsonHeaders,
      body: JSON.stringify({ groupId: sourceGroup.id, member: '星', dataUrl: TINY_PNG }),
    });

    const exported = await request('GET', `/api/groups/${sourceGroup.id}/export`, {
      headers: { Host: `127.0.0.1:${port}` },
    });
    assert.equal(exported.status, 200);
    assert.equal(exported.json.backup.works.length, 1);
    assert.equal(exported.json.backup.studio.video[0].title, '测试选题');
    assert.equal(exported.json.backup.images[0].dataUrl, TINY_PNG);

    const restored = await request('POST', '/api/import', {
      headers: jsonHeaders,
      body: JSON.stringify({ backup: exported.json.backup }),
    });
    assert.equal(restored.status, 200);
    assert.notEqual(restored.json.group.id, sourceGroup.id);
    assert.equal(restored.json.group.images.length, 1);

    const restoredWorks = await request('GET', `/api/groups/${restored.json.group.id}/works`, {
      headers: { Host: `127.0.0.1:${port}` },
    });
    const restoredStudio = await request('GET', `/api/groups/${restored.json.group.id}/studio`, {
      headers: { Host: `127.0.0.1:${port}` },
    });
    assert.equal(restoredWorks.json.works[0].title, '测试作品');
    assert.equal(restoredStudio.json.studio.video[0].title, '测试选题');

    const beforeFailure = await request('GET', '/api/groups', { headers: { Host: `127.0.0.1:${port}` } });
    const broken = structuredClone(exported.json.backup);
    broken.images[0].dataUrl = 'data:image/png;base64,not-valid!';
    const failed = await request('POST', '/api/import', {
      headers: jsonHeaders,
      body: JSON.stringify({ backup: broken }),
    });
    assert.equal(failed.status, 400);
    const afterFailure = await request('GET', '/api/groups', { headers: { Host: `127.0.0.1:${port}` } });
    assert.equal(afterFailure.json.groups.length, beforeFailure.json.groups.length);
  });

  await t.test('拒绝危险 JSON 字段', async () => {
    const res = await request('POST', '/api/groups', {
      headers: {
        Host: `127.0.0.1:${port}`,
        'Content-Type': 'application/json',
      },
      body: '{"data":{"__proto__":{"polluted":true}}}',
    });
    assert.equal(res.status, 400);
  });
});

test('生图提示词丢失的锁定片段会被补回', async () => {
  const { enforceLocks } = await import('../server.mjs');
  const lock = '[CHARACTER LOCK — silver hair]';
  assert.equal(enforceLocks(`a girl ${lock} on stage`, [lock]), `a girl ${lock} on stage`);
  assert.equal(enforceLocks('a girl on stage', [lock, '']), `${lock} a girl on stage`);
  assert.equal(enforceLocks('a girl', undefined), 'a girl');
});

test('换了服务地址不会把已保存的 Key 发出去', async () => {
  await assert.rejects(
    () => settings.fetchRemoteModels({ kind: 'text', baseUrl: 'https://other-provider.example/v1' }),
    (err) => /服务地址已更换/.test(err.message),
  );
});

test('图片归档、改艺名同步与公开页过滤', async (t) => {
  const headers = { Host: `127.0.0.1:${port}`, 'Content-Type': 'application/json' };
  const post = (url, body) => request('POST', url, { headers, body: JSON.stringify(body) });
  const data = {
    concept: { name: '归档测试', members: [{ codename: '星', archetype: '队长', color: '#123456' }] },
    members: [{ codename: '星' }],
  };
  const group = (await post('/api/groups', { data })).json.group;
  const first = (await post('/api/images/upload', { groupId: group.id, member: '星', dataUrl: TINY_PNG })).json.image;
  const second = (await post('/api/images/upload', { groupId: group.id, member: '星', dataUrl: TINY_PNG })).json.image;

  await t.test('主图不能归档，未归档不能删除', async () => {
    assert.equal(first.isPrimary, true);
    assert.equal((await post(`/api/images/${first.id}/archive`, { archived: true })).status, 400);
    assert.equal((await request('DELETE', `/api/images/${second.id}`, { headers })).status, 400);
  });

  await t.test('归档图不出现在公开页', async () => {
    assert.equal((await post(`/api/images/${second.id}/archive`, { archived: true })).status, 200);
    const pub = await request('GET', `/api/public/${group.shareId}`, { headers });
    assert.equal(pub.status, 200);
    assert.deepEqual(pub.json.group.images.map((i) => i.id), [first.id]);
  });

  await t.test('改艺名后图片跟随成员', async () => {
    const renamed = { ...data, concept: { ...data.concept, members: [{ ...data.concept.members[0], codename: '月' }] }, members: [{ codename: '月' }] };
    const res = await request('PATCH', `/api/groups/${group.id}`, { headers, body: JSON.stringify({ data: renamed }) });
    assert.equal(res.status, 200);
    assert.ok(res.json.group.images.every((i) => i.member === '月'));
  });
});
