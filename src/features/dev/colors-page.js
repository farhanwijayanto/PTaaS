import { h } from '../../lib/dom.js';
import { getTheme, setTheme } from '../../lib/theme.js';
import { contrastRatio, tupleToHex } from './color-tuner.js';

const INK_SCALE = ['--ink-950', '--ink-900', '--ink-850', '--ink-800', '--ink-700', '--ink-600', '--ink-500', '--ink-400'];
const PAPER_SCALE = ['--paper-50', '--paper-100', '--paper-150', '--paper-200', '--paper-300', '--paper-400'];

const PAIRS = [
  { group: 'Text on Page Background (--bg)', fg: '--text-primary', bg: '--bg', min: 4.5 },
  { group: 'Text on Page Background (--bg)', fg: '--text-secondary', bg: '--bg', min: 4.5 },
  { group: 'Text on Page Background (--bg)', fg: '--text-muted', bg: '--bg', min: 4.5 },
  { group: 'Text on Page Background (--bg)', fg: '--accent-text', bg: '--bg', min: 4.5 },
  { group: 'Text on Card Surface (--surface-1)', fg: '--text-primary', bg: '--surface-1', min: 4.5 },
  { group: 'Text on Card Surface (--surface-1)', fg: '--text-secondary', bg: '--surface-1', min: 4.5 },
  { group: 'Text on Card Surface (--surface-1)', fg: '--text-muted', bg: '--surface-1', min: 4.5 },
  { group: 'Text on Card Surface (--surface-1)', fg: '--accent-text', bg: '--surface-1', min: 4.5 },
  { group: 'Buttons & Accents', fg: '--text-inverse', bg: '--accent-text', min: 4.5 },
  { group: 'Status Tokens on Page Background', fg: '--success-text', bg: '--bg', min: 4.5 },
  { group: 'Status Tokens on Page Background', fg: '--warning-text', bg: '--bg', min: 4.5 },
  { group: 'Status Tokens on Page Background', fg: '--danger-text', bg: '--bg', min: 4.5 },
  { group: 'Status Tokens on Page Background', fg: '--info-text', bg: '--bg', min: 4.5 }
];

function getComputedColor(el, varName) {
  const raw = getComputedStyle(el).getPropertyValue(varName).trim();
  const m = raw.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (m) return tupleToHex([+m[1], +m[2], +m[3]]);
  if (raw.startsWith('#')) return raw;
  return raw || '#000000';
}

export function DevColorsPage() {
  const root = h('div', { class: 'min-h-screen bg-canvas text-fg p-6 sm:p-10' });

  function render() {
    root.innerHTML = '';
    const theme = getTheme();

    const header = h('div', { class: 'max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-line' },
      h('div', { class: 'space-y-1' },
        h('div', { class: 'text-xs font-mono uppercase tracking-wider text-[var(--accent-text)] font-semibold' }, 'DEV ONLY · /dev/colors'),
        h('h1', { class: 'text-2xl font-semibold tracking-tight text-fg' }, 'PTaaS Design Token & Contrast Matrix'),
        h('p', { class: 'text-xs text-muted' }, 'Single source of truth from src/styles/tokens.css. Live computed WCAG 2.1 contrast ratios.')
      ),
      h('div', { class: 'flex items-center gap-2' },
        h('button', {
          type: 'button',
          class: 'rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-mono text-fg hover:border-line-strong cursor-pointer',
          onClick: () => {
            setTheme(theme === 'dark' ? 'light' : 'dark');
            setTimeout(render, 40);
          }
        }, `Active Theme: ${theme.toUpperCase()} (Toggle)`),
        h('a', {
          href: '/',
          'data-link': true,
          class: 'rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-muted hover:text-fg'
        }, '← Back to Landing')
      )
    );

    const scales = h('div', { class: 'max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 py-6' },
      h('div', { class: 'rounded-xl border border-line bg-surface p-5 space-y-3' },
        h('h2', { class: 'text-sm font-semibold text-fg' }, 'Ink Scale (Multi-tier Dark Neutrals)'),
        h('div', { class: 'grid grid-cols-2 sm:grid-cols-4 gap-2.5' },
          INK_SCALE.map(v => {
            const hex = getComputedColor(document.documentElement, v);
            return h('div', { class: 'rounded-lg border border-line overflow-hidden bg-canvas' },
              h('div', { class: 'h-10 w-full', style: `background-color: var(${v});` }),
              h('div', { class: 'p-2 text-[10px] font-mono' },
                h('div', { class: 'text-fg font-semibold' }, v),
                h('div', { class: 'text-muted' }, hex)
              )
            );
          })
        )
      ),
      h('div', { class: 'rounded-xl border border-line bg-surface p-5 space-y-3' },
        h('h2', { class: 'text-sm font-semibold text-fg' }, 'Paper Scale (Light Mode Tiers)'),
        h('div', { class: 'grid grid-cols-2 sm:grid-cols-3 gap-2.5' },
          PAPER_SCALE.map(v => {
            const hex = getComputedColor(document.documentElement, v);
            return h('div', { class: 'rounded-lg border border-line overflow-hidden bg-canvas' },
              h('div', { class: 'h-10 w-full border-b border-line', style: `background-color: var(${v});` }),
              h('div', { class: 'p-2 text-[10px] font-mono' },
                h('div', { class: 'text-fg font-semibold' }, v),
                h('div', { class: 'text-muted' }, hex)
              )
            );
          })
        )
      )
    );

    const matrix = h('div', { class: 'max-w-6xl mx-auto rounded-xl border border-line bg-surface p-5 space-y-4' },
      h('h2', { class: 'text-sm font-semibold text-fg' }, 'Semantic Token Pairs & WCAG Ratios'),
      h('div', { class: 'grid grid-cols-1 md:grid-cols-2 gap-3' },
        PAIRS.map(p => {
          const fgHex = getComputedColor(document.documentElement, p.fg);
          const bgHex = getComputedColor(document.documentElement, p.bg);
          const ratio = contrastRatio(fgHex, bgHex) || 0;
          const level = ratio >= 7 ? 'AAA' : ratio >= p.min ? 'AA' : 'FAIL';
          const pass = ratio >= p.min;
          return h('div', {
            class: 'rounded-lg border border-line p-3 flex items-center justify-between gap-3',
            style: `background-color: var(${p.bg}); color: var(${p.fg});`
          },
            h('div', { class: 'space-y-0.5' },
              h('div', { class: 'text-xs font-semibold' }, `${p.fg} on ${p.bg}`),
              h('div', { class: 'text-[10px] font-mono opacity-90' }, `${fgHex} / ${bgHex}`)
            ),
            h('span', {
              class: 'rounded px-2 py-0.5 text-[11px] font-mono font-bold border',
              style: `background-color: var(${pass ? '--success-bg' : '--danger-bg'}); color: var(${pass ? '--success-text' : '--danger-text'}); border-color: var(${pass ? '--success-border' : '--danger-border'});`
            }, `${ratio.toFixed(2)}:1 · ${level}`)
          );
        })
      )
    );

    const scopePreview = h('div', { class: 'max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 py-6' },
      ['dark', 'light'].map(scope =>
        h('div', {
          'data-surface': scope,
          class: 'rounded-xl border border-line bg-canvas p-5 space-y-3 text-fg'
        },
          h('div', { class: 'text-xs font-mono uppercase text-[var(--accent-text)] font-semibold' }, `[data-surface="${scope}"]`),
          h('h3', { class: 'text-base font-semibold text-fg' }, 'Nested Surface Isolation Test'),
          h('p', { class: 'text-xs text-muted' }, 'Secondary text remains readable inside forced surface scopes regardless of page theme.'),
          h('div', { class: 'rounded-lg border border-line bg-surface p-3 flex items-center justify-between text-xs' },
            h('span', { class: 'text-subtle font-mono' }, 'Muted metadata'),
            h('span', { class: 'rounded bg-[var(--success-bg)] text-[var(--success-text)] border border-[var(--success-border)] px-2 py-0.5 font-mono text-[10px]' }, 'PASS')
          )
        )
      )
    );

    root.append(header, scales, matrix, scopePreview);
  }

  render();
  return root;
}
