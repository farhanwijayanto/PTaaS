import { h, icon } from '../../../lib/dom.js';
import { isReducedOrLow } from './config.js';

/**
 * <FloatingChip> — Compact status pill partially overlapping the terminal card edges.
 * Decorative only (aria-hidden="true", pointer-events: none, non-focusable).
 * Fades in with stagger after terminal starts typing and floats +/- 6px.
 */
export function FloatingChip({
  iconName = 'check-circle-2',
  text,
  positionStyle = '',
  duration = '6.2s',
  delay = '0s',
  revealDelayMs = 600
}) {
  const chip = h('div', {
    class: 'floating-chip shadow-sm',
    'aria-hidden': 'true',
    'data-decor': 'floating-chip',
    'data-decor-anim': 'chip-float',
    style: `${positionStyle}; --chip-dur: ${duration}; --chip-delay: ${delay}; pointer-events: none;`
  },
    h('span', {
      class: 'inline-flex h-4 w-4 items-center justify-center rounded-full shrink-0',
      style: 'background-color: var(--accent-bg); color: var(--accent-text);'
    }, icon(iconName, 'w-2.5 h-2.5')),
    h('span', { class: 'font-medium tracking-tight' }, text)
  );

  let timer = null;
  if (isReducedOrLow()) {
    chip.style.opacity = '1';
    chip.style.transform = 'translate3d(0, 0, 0)';
  } else {
    timer = setTimeout(() => {
      chip.classList.add('is-visible');
    }, revealDelayMs);
  }

  return {
    element: chip,
    destroy() {
      if (timer) clearTimeout(timer);
    }
  };
}
