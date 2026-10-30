// API 封装
import { lang, t } from './i18n.js';

async function req(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({ ok: false, error: t('服务器返回了无法解析的内容') }));
  if (!data.ok) throw new Error(data.error || t('请求失败 ({status})', { status: res.status }));
  return data;
}

export const api = {
  stage: (stage, payload) => req('POST', '/api/stage', { stage, payload, lang }).then((d) => d.result),
  config: () => req('GET', '/api/config'),
  settings: {
    get: () => req('GET', '/api/settings').then((d) => d.settings),
    save: (patch) => req('POST', '/api/settings', patch).then((d) => d.settings),
    models: (body) => req('POST', '/api/settings/models', body).then((d) => d.models),
  },
  groups: {
    list: () => req('GET', '/api/groups').then((d) => d.groups),
    get: (id) => req('GET', `/api/groups/${id}`).then((d) => d.group),
    create: (data) => req('POST', '/api/groups', { data }).then((d) => d.group),
    update: (id, data, name) => req('PATCH', `/api/groups/${id}`, { data, name }).then((d) => d.group),
    remove: (id) => req('DELETE', `/api/groups/${id}`),
    setPublic: (id, isPublic) => req('POST', `/api/groups/${id}/public`, { isPublic }).then((d) => d.group),
  },
  backups: {
    get: (id) => req('GET', `/api/groups/${id}/export`).then((d) => d.backup),
    restore: (backup) => req('POST', '/api/import', { backup }).then((d) => d.group),
  },
  studio: {
    get: (groupId) => req('GET', `/api/groups/${groupId}/studio`).then((d) => d.studio),
    set: (groupId, kind, topics) => req('POST', '/api/studio', { groupId, kind, topics }),
  },
  works: {
    list: (groupId) => req('GET', `/api/groups/${groupId}/works`).then((d) => d.works),
    create: (groupId, fields) => req('POST', '/api/works', { groupId, ...fields }).then((d) => d.work),
    batch: (groupId, works) => req('POST', '/api/works/batch', { groupId, works }).then((d) => d.works),
    update: (id, fields) => req('PATCH', `/api/works/${id}`, fields).then((d) => d.work),
    remove: (id) => req('DELETE', `/api/works/${id}`),
  },
  images: {
    upload: (groupId, member, dataUrl) => req('POST', '/api/images/upload', { groupId, member, dataUrl }).then((d) => d.image),
    generate: (groupId, member, prompt, size, quality, kind, useRef) =>
      req('POST', '/api/images/generate', { groupId, member, prompt, size, quality, kind, useRef }).then((d) => d.image),
    setPrimary: (id) => req('POST', `/api/images/${id}/primary`, {}),
    archive: (id, archived) => req('POST', `/api/images/${id}/archive`, { archived }),
    remove: (id) => req('DELETE', `/api/images/${id}`),
  },
};

// 控制并发，避免触发 API 频率限制
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
