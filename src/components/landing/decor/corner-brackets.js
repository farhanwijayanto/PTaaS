import { h } from '../../../lib/dom.js';

/**
 * <CornerBrackets> — L-shaped blueprint registration marks placed on the 4 corners of key visuals.
 * Strictly aria-hidden="true" and pointer-events: none.
 */
export function CornerBrackets({
  size = 10,
  offset = -1,
  tone = 'neutral', // 'neutral' | 'accent' | 'mixed'
  hoverOnly = false,
  class: extraClass = ''
} = {}) {
  const colorStyle = tone === 'accent'
    ? 'rgb(var(--accent) / 0.55)'
    : 'rgb(var(--fg) / 0.24)';

  const accentColor = 'rgb(var(--accent) / 0.65)';

  const wrap = h('div', {
    class: `absolute inset-0 pointer-events-none select-none ${hoverOnly ? 'cell-corner-brackets' : ''} ${extraClass}`,
    'aria-hidden': 'true',
    'data-decor': 'corner-brackets',
    style: 'pointer-events: none;'
  });

  const px = `${size}px`;
  const off = `${offset}px`;

  // Top-left
  wrap.appendChild(h('span', {
    class: 'absolute pointer-events-none',
    style: `top: ${off}; left: ${off}; width: ${px}; height: ${px}; border-top: 1.5px solid ${tone === 'mixed' ? accentColor : colorStyle}; border-left: 1.5px solid ${tone === 'mixed' ? accentColor : colorStyle};`
  }));

  // Top-right
  wrap.appendChild(h('span', {
    class: 'absolute pointer-events-none',
    style: `top: ${off}; right: ${off}; width: ${px}; height: ${px}; border-top: 1.5px solid ${colorStyle}; border-right: 1.5px solid ${colorStyle};`
  }));

  // Bottom-left
  wrap.appendChild(h('span', {
    class: 'absolute pointer-events-none',
    style: `bottom: ${off}; left: ${off}; width: ${px}; height: ${px}; border-bottom: 1.5px solid ${colorStyle}; border-left: 1.5px solid ${colorStyle};`
  }));

  // Bottom-right
  wrap.appendChild(h('span', {
    class: 'absolute pointer-events-none',
    style: `bottom: ${off}; right: ${off}; width: ${px}; height: ${px}; border-bottom: 1.5px solid ${tone === 'mixed' ? accentColor : colorStyle}; border-right: 1.5px solid ${tone === 'mixed' ? accentColor : colorStyle};`
  }));

  return wrap;
}
