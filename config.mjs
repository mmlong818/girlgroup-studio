// 配置 — 读取 .env
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const env = {};
const envPath = path.join(ROOT, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
}
for (const k of ['ZHIPUAI_API_KEY', 'MODEL_ID', 'PORT', 'HOST', 'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'IMAGE_MODEL_ID']) {
  if (process.env[k]) env[k] = process.env[k];
}
