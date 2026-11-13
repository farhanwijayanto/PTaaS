import { h } from '../../../lib/dom.js';

/**
 * <ScanLine> — Thin horizontal 1px scan line at the bottom of the Hero
 * (accent at ~20-45%) that sweeps from left to right once on load, then rests.
 */
export function ScanLine() {
  return h('div', {
    class: 'hero-scan-line',
    'aria-hidden': 'true',
    'data-decor': 'scan-line',
    style: 'pointer-events: none;'
  });
}
