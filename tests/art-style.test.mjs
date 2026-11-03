import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = mkdtempSync(path.join(os.tmpdir(), 'starform-art-style-'));
process.env.STARFORM_DATA_DIR = dataDir;
const [{ createServer }, { closeDatabase }] = await Promise.all([
  import('../server.mjs'), import('../db.mjs'),
]);
const server = createServer();
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const base = `http://127.0.0.1:${server.address().port}`;

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  closeDatabase();
  rmSync(dataDir, { recursive: true, force: true });
});

async function request(method, route, body) {
  const response = await fetch(base + route, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
}

test('art-style patches preserve another field saved between queued A and B', async () => {
  const created = await request('POST', '/api/groups', {
    data: { concept: { name: 'Test group', mainColor: '#123456' }, extra: 'before' },
  });
  assert.equal(created.status, 200);
  const id = created.json.group.id;
  const route = `/api/groups/${id}`;

  const a = await request('PATCH', `${route}/art-style`, { artStyle: 'anime' });
  assert.equal(a.status, 200);
  const edit = await request('PATCH', route, {
    data: { ...created.json.group.data, extra: 'saved while B waits', artStyle: 'anime' },
  });
  assert.equal(edit.status, 200);
  const b = await request('PATCH', `${route}/art-style`, { artStyle: 'realistic' });
  assert.equal(b.status, 200);
  assert.deepEqual(b.json, { ok: true, artStyle: 'realistic' });
  const current = await request('GET', route);
  assert.equal(current.json.group.data.extra, 'saved while B waits');
  assert.equal(current.json.group.data.artStyle, 'realistic');

  const cleared = await request('PATCH', `${route}/art-style`, { artStyle: '' });
  assert.equal(cleared.status, 200);
  const afterClear = await request('GET', route);
  assert.equal(Object.hasOwn(afterClear.json.group.data, 'artStyle'), false);
  assert.equal(afterClear.json.group.data.extra, 'saved while B waits');
});

test('art-style patch rejects missing groups and invalid or extraneous input', async () => {
  assert.equal((await request('PATCH', '/api/groups/missing/art-style', { artStyle: 'anime' })).status, 404);
  const created = await request('POST', '/api/groups', { data: { concept: { name: 'Validation group' } } });
  const route = `/api/groups/${created.json.group.id}/art-style`;
  for (const body of [{}, { artStyle: 'unknown' }, { artStyle: 1 }, { artStyle: 'anime', concept: {} }, []]) {
    const result = await request('PATCH', route, body);
    assert.equal(result.status, 400);
  }
  assert.equal((await request('GET', `/api/groups/${created.json.group.id}`)).json.group.data.artStyle, undefined);
});
