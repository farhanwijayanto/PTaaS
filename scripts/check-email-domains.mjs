#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'gateway']);
const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.pdf', '.zip']);
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

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
  if (rel === 'package-lock.json' || rel === 'scripts/check-email-domains.mjs') continue;
  if (BINARY_EXT.has(path.extname(rel).toLowerCase())) continue;

  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, idx) => {
    const matches = line.match(EMAIL_RE);
    if (!matches) return;
    for (const email of matches) {
      if (/@(?:[a-z0-9-]+\.)?example\.(com|org|edu)$/i.test(email)) continue;
      if (/users\.noreply\.github\.com$/i.test(email)) continue;
      violations.push(`${rel}:${idx + 1} -> ${email}`);
    }
  });
}

if (violations.length > 0) {
  console.error(`[FAILED] check-email-domains found ${violations.length} non-RFC2606 email(s):`);
  violations.forEach((v) => console.error('  -', v));
  process.exit(1);
}
console.log('[PASSED] check-email-domains: all emails use example.com / example.org / example.edu.');
