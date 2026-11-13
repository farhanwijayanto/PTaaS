import fs from 'node:fs';
import path from 'node:path';

const SRC_DIR = path.resolve(process.cwd(), 'src');
const ALLOWED_FILES = new Set([
  path.resolve(SRC_DIR, 'styles/tokens.css'),
  path.resolve(SRC_DIR, 'features/dev/color-tuner.js'),
  path.resolve(SRC_DIR, 'features/dev/colors-page.js'),
  path.resolve(SRC_DIR, 'features/terminal/terminal-themes.js'),
]);

const CHECKS = [
  {
    name: 'Raw hex color',
    regex: /(?:^|[:\s'"(\[])#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g,
  },
  {
    name: 'Tailwind raw palette class',
    regex: /\b(?:text|bg|border|ring|fill|stroke)-(?:zinc|slate|gray|neutral|stone|emerald|green|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|red|orange|amber|yellow|lime|white|black)(?:-\d{2,3})?(?:\/\d{1,3})?\b/g,
  },
  {
    name: 'Opacity-based text color',
    regex: /\btext-(?:fg|muted|subtle|accent|white|black)\/\d+\b/g,
  },
  {
    name: 'Hard-coded numeric rgb/rgba',
    regex: /\brgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g,
  },
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full.includes(`${path.sep}lib${path.sep}xterm`) || full.includes(`${path.sep}lib${path.sep}vendor`)) continue;
      walk(full, out);
    } else if (/\.(js|mjs|css|html)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(SRC_DIR);
const violations = [];

for (const file of files) {
  if (ALLOWED_FILES.has(path.resolve(file))) continue;
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);
  lines.forEach((line, idx) => {
    // Ignore pure comments
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return;
    for (const check of CHECKS) {
      check.regex.lastIndex = 0;
      let m;
      while ((m = check.regex.exec(line)) !== null) {
        violations.push({
          file: path.relative(process.cwd(), file),
          line: idx + 1,
          rule: check.name,
          match: m[0].trim(),
        });
      }
    }
  });
}

if (violations.length > 0) {
  console.error(`Found ${violations.length} raw color / palette violations outside tokens.css:\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} [${v.rule}] -> ${v.match}`);
  }
  process.exit(1);
}

console.log(`check-colors: 0 violations across ${files.length} files.`);
