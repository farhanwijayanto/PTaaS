#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'gateway']);
const SKIP_FILES = new Set([
  'scripts/check-denylist.mjs',
  'scripts/check-demo-data.js',
  'scripts/check-no-host-access.mjs',
  'package-lock.json',
]);
const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.pdf', '.zip']);

const DENYLIST = [
  { name: 'personal_name', re: /\bfarh?an\w*|\bwijayanto\b|han㉿hann/i },
  { name: 'win_user_path', re: /[A-Za-z]:[\\/]Users[\\/]/i },
  { name: 'wsl_mount_path', re: /\/mnt\/[a-z]\//i },
];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const violations = [];
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (SKIP_FILES.has(rel)) continue;
  if (BINARY_EXT.has(path.extname(rel).toLowerCase())) continue;

  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, idx) => {
    for (const rule of DENYLIST) {
      if (rule.re.test(line)) {
        violations.push(`${rel}:${idx + 1} [${rule.name}] ${line.trim().slice(0, 100)}`);
      }
    }
  });
}

if (violations.length > 0) {
  console.error(`[FAILED] check-denylist found ${violations.length} match(es):`);
  violations.forEach((v) => console.error('  -', v));
  process.exit(1);
}
console.log('[PASSED] check-denylist: zero personal names or local Windows/WSL paths.');
