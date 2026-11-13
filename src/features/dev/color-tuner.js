import { h } from '../../lib/dom.js';
import { getTheme, setTheme } from '../../lib/theme.js';

export function isDevEnvironment() {
  if (typeof window === 'undefined') return false;
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') return false;
  return (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.search.includes('tune=1')
  );
}

// Color math for WCAG 2.1 contrast ratio
function parseHex(hex) {
  if (!hex) return null;
  let clean = hex.trim().replace('#', '');
  if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
  if (clean.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16)
  ];
}

function rgbStringToTuple(str) {
  const m = String(str).match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (m) return [+m[1], +m[2], +m[3]];
  if (str?.trim().startsWith('#')) return parseHex(str);
  return null;
}

function luminance([r, g, b]) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function contrastRatio(fgStr, bgStr) {
  const fg = rgbStringToTuple(fgStr);
  const bg = rgbStringToTuple(bgStr);
  if (!fg || !bg) return null;
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export function tupleToHex([r, g, b]) {
  return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
}

const TOKEN_GROUPS = [
  {
    title: 'Surfaces & Backgrounds',
    tokens: [
      { name: '--bg', label: 'Page Background', rgbVar: '--canvas' },
      { name: '--surface-1', label: 'Card Surface', rgbVar: '--surface' },
      { name: '--surface-2', label: 'Raised Surface', rgbVar: '--raised' },
      { name: '--surface-3', label: 'Hover / Active' }
    ]
  },
  {
    title: 'Text Hierarchy',
    tokens: [
      { name: '--text-primary', label: 'Primary Ink', rgbVar: '--fg' },
      { name: '--text-secondary', label: 'Secondary Ink', rgbVar: '--muted' },
      { name: '--text-muted', label: 'Muted / Meta', rgbVar: '--subtle' }
    ]
  },
  {
    title: 'Borders & Accent',
    tokens: [
      { name: '--border-subtle', label: 'Subtle Border' },
      { name: '--border-default', label: 'Default Border', rgbVar: '--line' },
      { name: '--border-strong', label: 'Strong Border', rgbVar: '--line-strong' },
      { name: '--accent', label: 'Accent Fill', rgbVar: '--accent-rgb' },
      { name: '--accent-text', label: 'Accent Text' }
    ]
  },
  {
    title: 'Status',
    tokens: [
      { name: '--success-text', label: 'Success Text' },
      { name: '--warning-text', label: 'Warning Text' },
      { name: '--danger-text', label: 'Danger Text' },
      { name: '--info-text', label: 'Info Text' }
    ]
  },
  {
    title: 'Ink Scale (Dark Tiers)',
    tokens: [
      { name: '--ink-950', label: 'Ink 950 (Deepest)' },
      { name: '--ink-900', label: 'Ink 900 (Canvas)' },
      { name: '--ink-850', label: 'Ink 850 (Dark Band)' },
      { name: '--ink-800', label: 'Ink 800 (Raised)' },
      { name: '--ink-700', label: 'Ink 700 (Hover)' }
    ]
  }
];

let panelEl = null;
let isOpen = false;
const overrides = new Map();

function readComputedHex(varName) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  const tuple = rgbStringToTuple(raw);
  return tuple ? tupleToHex(tuple) : '#000000';
}

function applyToken(token, hex) {
  overrides.set(token.name, hex);
  document.documentElement.style.setProperty(token.name, hex);
  if (token.rgbVar) {
    const tuple = parseHex(hex);
    if (tuple) {
      document.documentElement.style.setProperty(token.rgbVar, `${tuple[0]} ${tuple[1]} ${tuple[2]}`);
    }
  }
}

function resetAll() {
  for (const group of TOKEN_GROUPS) {
    for (const t of group.tokens) {
      document.documentElement.style.removeProperty(t.name);
      if (t.rgbVar) document.documentElement.style.removeProperty(t.rgbVar);
    }
  }
  overrides.clear();
  renderPanel();
}

function buildCssSnippet() {
  const theme = getTheme();
  const lines = [`/* Custom overrides for [data-theme="${theme}"] */`, `:root[data-theme="${theme}"] {`];
  for (const [k, v] of overrides.entries()) {
    lines.push(`  ${k}: ${v};`);
  }
  lines.push('}');
  return lines.join('\n');
}

function renderPanel() {
  if (!panelEl) return;
  if (!isOpen) {
    panelEl.style.display = 'none';
    panelEl.style.pointerEvents = 'none';
    return;
  }

  panelEl.style.display = 'flex';
  panelEl.style.pointerEvents = 'auto';

  const currentTheme = getTheme();
  const bgHex = readComputedHex('--bg');
  const surfHex = readComputedHex('--surface-1');
  const pairs = [
    { label: 'Primary / bg', fg: '--text-primary', bg: bgHex },
    { label: 'Secondary / bg', fg: '--text-secondary', bg: bgHex },
    { label: 'Muted / surface', fg: '--text-muted', bg: surfHex },
    { label: 'Accent Text / bg', fg: '--accent-text', bg: bgHex }
  ];

  panelEl.innerHTML = '';
  const header = h('div', {
    class: 'flex items-center justify-between border-b border-line px-4 py-3 shrink-0'
  },
    h('div', { class: 'space-y-0.5' },
      h('div', { class: 'text-xs font-semibold text-fg flex items-center gap-2' },
        'Dev Color Tuner',
        h('span', { class: 'rounded px-1.5 py-0.5 text-[10px] font-mono bg-[var(--accent-bg)] text-[var(--accent-text)]' }, currentTheme.toUpperCase())
      ),
      h('div', { class: 'text-[10px] text-muted font-mono' }, 'Ctrl+Shift+K · Live token preview')
    ),
    h('div', { class: 'flex items-center gap-1.5' },
      h('button', {
        type: 'button',
        class: 'rounded border border-line px-2 py-1 text-[11px] font-mono text-muted hover:text-fg cursor-pointer',
        onClick: () => {
          setTheme(currentTheme === 'dark' ? 'light' : 'dark');
          setTimeout(renderPanel, 30);
        }
      }, currentTheme === 'dark' ? 'Switch Light' : 'Switch Dark'),
      h('button', {
        type: 'button',
        class: 'rounded border border-line px-2 py-1 text-[11px] text-muted hover:text-fg cursor-pointer',
        onClick: () => { isOpen = false; renderPanel(); }
      }, '✕')
    )
  );

  const contrastBar = h('div', { class: 'grid grid-cols-2 gap-1.5 border-b border-line px-4 py-2.5 bg-surface shrink-0' },
    pairs.map(p => {
      const fgHex = readComputedHex(p.fg);
      const ratio = contrastRatio(fgHex, p.bg) || 0;
      const badge = ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : 'FAIL';
      const badgeColor = ratio >= 4.5 ? 'text-[var(--success-text)]' : 'text-[var(--danger-text)]';
      return h('div', { class: 'flex items-center justify-between rounded border border-line px-2 py-1 text-[10px] font-mono' },
        h('span', { class: 'text-muted truncate' }, p.label),
        h('span', { class: `font-bold ${badgeColor}` }, `${ratio.toFixed(1)} ${badge}`)
      );
    })
  );

  const body = h('div', { class: 'flex-1 overflow-y-auto px-4 py-3 space-y-4' },
    TOKEN_GROUPS.map(group =>
      h('div', { class: 'space-y-2' },
        h('div', { class: 'text-[10px] font-mono uppercase tracking-wider text-subtle font-semibold' }, group.title),
        h('div', { class: 'space-y-1.5' },
          group.tokens.map(token => {
            const val = readComputedHex(token.name);
            const hexInput = h('input', {
              type: 'text',
              value: val,
              class: 'w-20 rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-fg'
            });
            const colorInput = h('input', {
              type: 'color',
              value: val,
              class: 'h-6 w-7 cursor-pointer rounded border border-line bg-transparent p-0'
            });
            colorInput.addEventListener('input', (e) => {
              hexInput.value = e.target.value;
              applyToken(token, e.target.value);
            });
            hexInput.addEventListener('change', (e) => {
              if (parseHex(e.target.value)) {
                colorInput.value = e.target.value;
                applyToken(token, e.target.value);
              }
            });
            return h('div', { class: 'flex items-center justify-between gap-2 text-xs' },
              h('div', { class: 'min-w-0' },
                h('div', { class: 'text-[11px] text-fg truncate' }, token.label),
                h('div', { class: 'text-[10px] font-mono text-subtle' }, token.name)
              ),
              h('div', { class: 'flex items-center gap-1.5 shrink-0' }, colorInput, hexInput)
            );
          })
        )
      )
    )
  );

  const footer = h('div', { class: 'flex items-center justify-between gap-2 border-t border-line px-4 py-2.5 bg-surface shrink-0' },
    h('button', {
      type: 'button',
      class: 'rounded border border-line px-2.5 py-1 text-[11px] text-muted hover:text-fg cursor-pointer',
      onClick: resetAll
    }, 'Reset'),
    h('div', { class: 'flex items-center gap-1.5' },
      h('button', {
        type: 'button',
        class: 'rounded border border-line px-2.5 py-1 text-[11px] font-mono text-fg hover:bg-raised cursor-pointer',
        onClick: () => navigator.clipboard?.writeText(buildCssSnippet())
      }, 'Copy CSS'),
      h('button', {
        type: 'button',
        class: 'rounded bg-accent px-2.5 py-1 text-[11px] font-mono font-semibold text-[var(--text-inverse)] cursor-pointer',
        onClick: () => {
          const blob = new Blob([buildCssSnippet()], { type: 'text/css' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'tokens-overrides.css';
          a.click();
        }
      }, 'Download CSS')
    )
  );

  panelEl.append(header, contrastBar, body, footer);
}

export function initDevColorTuner() {
  if (!isDevEnvironment()) return;
  if (!panelEl) {
    panelEl = h('aside', {
      id: 'dev-color-tuner',
      'aria-label': 'Developer Color Tuner',
      class: 'fixed bottom-4 right-4 z-[9999] w-80 max-h-[82vh] flex-col rounded-xl border border-line-strong bg-canvas shadow-2xl overflow-hidden',
      style: 'display: none; pointer-events: none;'
    });
    document.body.appendChild(panelEl);
  }
  if (window.location.search.includes('tune=1')) {
    isOpen = true;
    renderPanel();
  }
}

export function toggleDevColorTuner() {
  if (!isDevEnvironment()) return;
  initDevColorTuner();
  isOpen = !isOpen;
  renderPanel();
}
