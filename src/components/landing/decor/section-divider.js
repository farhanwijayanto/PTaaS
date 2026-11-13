import { h } from '../../../lib/dom.js';
import { useInView } from './hooks.js';
import { isReducedOrLow } from './config.js';

/**
 * <SectionDivider> — Simple hairline divider that draws from center outward on view.
 * No plus marks or endpoint dots.
 */
export function SectionDivider() {
  const wrap = h('div', {
    class: 'section-divider-wrap landing-container my-2 py-2 flex items-center justify-center relative pointer-events-none select-none',
    'aria-hidden': 'true',
    'data-decor': 'section-divider',
    style: 'pointer-events: none;'
  });

  const line = h('div', {
    class: 'section-divider-line w-full h-px pointer-events-none',
    style: 'background: linear-gradient(90deg, transparent 0%, var(--border-default) 50%, transparent 100%);'
  });

  wrap.appendChild(line);

  if (isReducedOrLow()) {
    wrap.classList.add('is-revealed');
  } else {
    useInView(wrap, (visible) => {
      if (visible) wrap.classList.add('is-revealed');
    }, { once: true });
  }

  return wrap;
}
