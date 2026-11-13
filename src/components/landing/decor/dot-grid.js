import { h } from '../../../lib/dom.js';

/**
 * <DotGrid> — Calm 1px dot grid (28px spacing) with radial mask for hero
 * or subtle surface grid for dark sections.
 * Strictly aria-hidden="true" and pointer-events: none.
 */
export function DotGrid({
  variant = 'hero', // 'hero' | 'section' | 'dark'
  class: extraClass = ''
} = {}) {
  const maskClass = variant === 'hero' ? 'hero-dot-grid' : 'dot-grid';

  const container = h('div', {
    class: `absolute inset-0 overflow-hidden pointer-events-none select-none ${extraClass}`,
    'aria-hidden': 'true',
    'data-decor': 'dot-grid',
    style: 'z-index: var(--z-bg); pointer-events: none;'
  });

  const gridLayer = h('div', {
    class: `absolute inset-0 ${maskClass} pointer-events-none`,
    'aria-hidden': 'true'
  });
  container.appendChild(gridLayer);

  return container;
}
