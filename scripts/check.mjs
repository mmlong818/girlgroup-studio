import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SKIP_DIRS = new Set(['data', 'node_modules', 'design-ref', '.git']);
const EXTENSIONS = new Set(['.js', '.mjs']);

function collect(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) collect(full, files);
    else if (EXTENSIONS.has(path.extname(name))) files.push(full);
  }
  return files;
}

let failed = false;
for (const file of collect(ROOT)) {
  const rel = path.relative(ROOT, file);
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status === 0) {
    console.log(`ok ${rel}`);
    continue;
  }

  failed = true;
  console.error(`fail ${rel}`);
  if (result.stdout) console.error(result.stdout.trim());
  if (result.stderr) console.error(result.stderr.trim());
}

if (failed) process.exit(1);
