// 数据层 — Node 内置 SQLite，零外部依赖
// 单机模式：无账号体系，数据独立存储在 data/starform.db
// user_id 字段保留默认值 'local'，未来加账号时可平滑迁移
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.STARFORM_DATA_DIR
  ? path.resolve(process.env.STARFORM_DATA_DIR)
  : path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'starform.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'local',
  share_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  member TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,
  filename TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS studio (
  group_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (group_id, kind)
);
CREATE TABLE IF NOT EXISTS works (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'short_video',
  title TEXT NOT NULL,
  members TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'idea',
  publish_at TEXT,
  content TEXT NOT NULL DEFAULT '{}',
  stats TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

// 迁移：旧库补 images.archived 列（归档标记）
if (!db.prepare("SELECT 1 FROM pragma_table_info('images') WHERE name = 'archived'").get()) {
  db.exec('ALTER TABLE images ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
}

export const uid = (n = 12) => crypto.randomBytes(n).toString('base64url').slice(0, n);
const now = () => new Date().toISOString();

function transaction(run) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = run();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const AppSettings = {
  get(key) {
    const row = db.prepare('SELECT data FROM app_settings WHERE key = ?').get(key);
    if (!row) return null;
    try { return JSON.parse(row.data); } catch { return null; }
  },
  set(key, data) {
    db.prepare(`INSERT INTO app_settings (key, data, updated_at) VALUES (?,?,?)
      ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
      .run(key, JSON.stringify(data), now());
  },
};

export function closeDatabase() {
  db.close();
}

// ── 企划（女团） ──
export const Groups = {
  create(name, data) {
    const id = uid();
    const shareId = uid(10);
    db.prepare('INSERT INTO groups (id, share_id, name, data, created_at, updated_at) VALUES (?,?,?,?,?,?)')
      .run(id, shareId, name, JSON.stringify(data), now(), now());
    return this.byId(id);
  },
  byId: (id) => db.prepare('SELECT * FROM groups WHERE id = ?').get(id),
  byShareId: (sid) => db.prepare('SELECT * FROM groups WHERE share_id = ?').get(sid),
  list: () => db.prepare('SELECT * FROM groups ORDER BY updated_at DESC').all(),
  update(id, data, name) {
    db.prepare('UPDATE groups SET data = ?, name = COALESCE(?, name), updated_at = ? WHERE id = ?')
      .run(JSON.stringify(data), name ?? null, now(), id);
  },
  delete(id) {
    transaction(() => {
      db.prepare('DELETE FROM images WHERE group_id = ?').run(id);
      db.prepare('DELETE FROM works WHERE group_id = ?').run(id);
      db.prepare('DELETE FROM studio WHERE group_id = ?').run(id);
      db.prepare('DELETE FROM groups WHERE id = ?').run(id);
    });
  },
};

// ── 作品（运营中心的原子单位） ──
const WORK_FIELDS = ['type', 'title', 'members', 'channel', 'status', 'publish_at', 'content', 'stats'];
export const Works = {
  create(groupId, fields) {
    const id = uid();
    db.prepare(`INSERT INTO works (id, group_id, type, title, members, channel, status, publish_at, content, stats, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, groupId,
        fields.type || 'short_video', fields.title || '未命名作品', fields.members || '',
        fields.channel || '', fields.status || 'idea', fields.publish_at || null,
        JSON.stringify(fields.content || {}), JSON.stringify(fields.stats || {}), now(), now());
    return this.byId(id);
  },
  byId: (id) => db.prepare('SELECT * FROM works WHERE id = ?').get(id),
  listByGroup: (groupId) => db.prepare('SELECT * FROM works WHERE group_id = ? ORDER BY COALESCE(publish_at, created_at) DESC').all(groupId),
  update(id, fields) {
    const sets = [];
    const vals = [];
    for (const k of WORK_FIELDS) {
      if (fields[k] !== undefined) {
        sets.push(`${k} = ?`);
        vals.push(k === 'content' || k === 'stats' ? JSON.stringify(fields[k]) : fields[k]);
      }
    }
    if (!sets.length) return this.byId(id);
    db.prepare(`UPDATE works SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).run(...vals, now(), id);
    return this.byId(id);
  },
  delete: (id) => db.prepare('DELETE FROM works WHERE id = ?').run(id),
  deleteByGroup: (groupId) => db.prepare('DELETE FROM works WHERE group_id = ?').run(groupId),
  createBatch(groupId, works) {
    return transaction(() => works.map((work) => this.create(groupId, work)));
  },
};

// ── 创作间选题（按团+工坊持久化） ──
export const Studio = {
  getAll(groupId) {
    const out = {};
    for (const row of db.prepare('SELECT kind, data FROM studio WHERE group_id = ?').all(groupId)) {
      try { out[row.kind] = JSON.parse(row.data); } catch { /* 损坏数据跳过 */ }
    }
    return out;
  },
  set(groupId, kind, data) {
    db.prepare(`INSERT INTO studio (group_id, kind, data, updated_at) VALUES (?,?,?,?)
      ON CONFLICT(group_id, kind) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
      .run(groupId, kind, JSON.stringify(data || []), now());
  },
};

// ── 图片 ──
export const Images = {
  create(groupId, member, kind, filename) {
    const id = uid();
    const hasPrimary = db.prepare('SELECT COUNT(*) AS n FROM images WHERE group_id = ? AND member = ? AND is_primary = 1')
      .get(groupId, member).n > 0;
    db.prepare('INSERT INTO images (id, group_id, member, kind, filename, is_primary, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(id, groupId, member, kind, filename, hasPrimary ? 0 : 1, now());
    return this.byId(id);
  },
  byId: (id) => db.prepare('SELECT * FROM images WHERE id = ?').get(id),
  listByGroup: (groupId) => db.prepare('SELECT * FROM images WHERE group_id = ? ORDER BY is_primary DESC, created_at DESC').all(groupId),
  setPrimary(id) {
    const img = this.byId(id);
    if (!img) return;
    transaction(() => {
      db.prepare('UPDATE images SET is_primary = 0 WHERE group_id = ? AND member = ?').run(img.group_id, img.member);
      db.prepare('UPDATE images SET is_primary = 1 WHERE id = ?').run(id);
    });
  },
  renameMember: (groupId, from, to) => db.prepare('UPDATE images SET member = ? WHERE group_id = ? AND member = ?').run(to, groupId, from),
  setArchived: (id, archived) => db.prepare('UPDATE images SET archived = ? WHERE id = ?').run(archived ? 1 : 0, id),
  delete: (id) => db.prepare('DELETE FROM images WHERE id = ?').run(id),
};
