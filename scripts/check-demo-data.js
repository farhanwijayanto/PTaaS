#!/usr/bin/env node
// CI Check: Verify that all demo identities, names, emails, and cohorts use strictly generic RFC 2606 placeholders.
// Fails if any real-looking names, unreserved domains, or old legacy test identities are found.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const DENYLIST_PATTERNS = [
  { pattern: /\bfarhan\b/i, label: 'Personal name: Farhan' },
  { pattern: /\bbudi\b/i, label: 'Legacy persona: Budi' },
  { pattern: /\bsinta\b/i, label: 'Legacy persona: Sinta' },
  { pattern: /\bandi\s+wijaya\b/i, label: 'Legacy persona: Andi Wijaya' },
  { pattern: /\bdewi\s+lestari\b/i, label: 'Legacy persona: Dewi Lestari' },
  { pattern: /\bstudent\.ac\.id\b/i, label: 'Non-RFC 2606 domain: student.ac.id' },
  { pattern: /\bkampus\.ac\.id\b/i, label: 'Non-RFC 2606 domain: kampus.ac.id' },
  { pattern: /\bptaas\.local\b/i, label: 'Legacy local domain: ptaas.local' },
  { pattern: /\bTI-2026-[AB]\b/i, label: 'Legacy cohort format: TI-2026-A/B' },
  { pattern: /\btenant-[ab]\b/i, label: 'Legacy tenant identifier: tenant-a/b' }
];

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
const ALLOWED_EMAIL_DOMAINS = ['example.com', 'example.org', 'example.edu'];

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.system_generated',
  'browser_evidence',
  'scratch',
  'dist',
  'build',
  'images',
  'tests'
]);

const IGNORE_FILES = new Set([
  'check-demo-data.js',
  'package-lock.json'
]);

let violations = [];

function scanFile(filePath) {
  const relPath = path.relative(ROOT, filePath);
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return;
  }

  const lines = content.split('\n');

  lines.forEach((line, lineIdx) => {
    // 1. Check denylist patterns
    for (const rule of DENYLIST_PATTERNS) {
      if (rule.pattern.test(line)) {
        violations.push({
          file: relPath,
          line: lineIdx + 1,
          issue: rule.label,
          text: line.trim()
        });
      }
    }

    // 2. Check email domains
    let match;
    const lineEmailRegex = new RegExp(EMAIL_REGEX);
    while ((match = lineEmailRegex.exec(line)) !== null) {
      const fullEmail = match[0];
      const domain = match[1].toLowerCase();
      const isAllowed = ALLOWED_EMAIL_DOMAINS.some(allowed => domain === allowed || domain.endsWith('.' + allowed));
      if (!isAllowed) {
        violations.push({
          file: relPath,
          line: lineIdx + 1,
          issue: `Disallowed email domain: ${fullEmail} (Only @example.com/org/edu permitted)`,
          text: line.trim()
        });
      }
    }
  });
}

function traverse(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) {
        traverse(path.join(dir, entry.name));
      }
    } else if (entry.isFile()) {
      if (!IGNORE_FILES.has(entry.name)) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.js', '.mjs', '.ts', '.html', '.json', '.md'].includes(ext)) {
          scanFile(path.join(dir, entry.name));
        }
      }
    }
  }
}

console.log('--- Checking demo data and identities (RFC 2606 compliance) ---');
traverse(ROOT);

if (violations.length > 0) {
  console.error(`\x1b[31m[FAILED] Found ${violations.length} violation(s):\x1b[0m\n`);
  violations.forEach((v, idx) => {
    console.error(`${idx + 1}. \x1b[33m${v.file}:${v.line}\x1b[0m - ${v.issue}`);
    console.error(`   "${v.text}"\n`);
  });
  process.exit(1);
} else {
  console.log('\x1b[32m[PASSED] All demo identities and email addresses are generic and strictly RFC 2606 compliant (@example.com|org|edu).\x1b[0m');
  process.exit(0);
}
