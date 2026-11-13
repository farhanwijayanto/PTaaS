#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'gateway', 'docs']);
const SKIP_FILES = new Set([
  'scripts/check-no-host-access.mjs',
  'tests/test-terminal-security.js',
  'package-lock.json',
  'tsconfig.tsbuildinfo',
]);
const SKIP_PREFIXES = ['src/lib/xterm/', 'src/lib/vendor/', 'src/lib/guacamole-common.js'];
const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.pdf', '.zip']);

const BANNED = [
  { name: 'node-pty', re: /\bnode-pty\b/i },
  { name: 'child_process', re: /\bchild_process\b/ },
  { name: 'spawn(', re: /\bspawn\s*\(/ },
  { name: 'execSync', re: /\bexecSync\b/ },
  { name: 'execFile', re: /\bexecFile\b/ },
  { name: 'fork(', re: /\bfork\s*\(/ },
  { name: 'wsl.exe', re: /\bwsl\.exe\b/i },
  { name: '/mnt/c', re: /\/mnt\/c\b/i },
  { name: 'bash -c', re: /\bbash\s+-c\b/i },
  { name: 'cmd.exe', re: /\bcmd\.exe\b/i },
  { name: 'process.env.SHELL', re: /process\.env\.SHELL\b/ },
  { name: 'ssh2', re: /\bssh2\b/ },
  { name: 'dockerode', re: /\bdockerode\b/i },
  { name: 'WebSocketServer', re: /\bWebSocketServer\b/ },
  { name: 'upgrade handler', re: /\.on\(['"]upgrade['"]/ },
  { name: 'eval(', re: /\beval\s*\(/ },
  { name: 'new Function(', re: /\bnew\s+Function\s*\(/ },
];

// Exclude QA scripts in tests/ that spawn headless chrome locally for screenshots
const TEST_SPAWN_ALLOW = new Set([
  'tests/capture-deliverables.js',
  'tests/landing-decor-qa.js',
]);

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
  if (SKIP_PREFIXES.some((p) => rel.startsWith(p))) continue;
  if (BINARY_EXT.has(path.extname(rel).toLowerCase())) continue;

  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, idx) => {
    for (const rule of BANNED) {
      if ((rule.name === 'child_process' || rule.name === 'spawn(') && TEST_SPAWN_ALLOW.has(rel)) continue;
      if (rel === 'README.md' && (rule.name === 'ssh2' || rule.name === '/mnt/c')) continue;
      if (rule.re.test(line)) {
        violations.push(`${rel}:${idx + 1} [${rule.name}] ${line.trim().slice(0, 100)}`);
      }
    }
  });
}

if (violations.length > 0) {
  console.error(`[FAILED] check-no-host-access found ${violations.length} banned pattern(s):`);
  violations.forEach((v) => console.error('  -', v));
  process.exit(1);
}
console.log('[PASSED] check-no-host-access: 0 host-shell/gateway patterns in deployable app.');
