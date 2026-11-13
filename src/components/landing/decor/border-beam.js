import { h } from '../../../lib/dom.js';

/**
 * <BorderBeam> — A 1px emerald accent line that sweeps around a card's border.
 * To stay strictly within the 3-continuous-loop motion budget in the Hero,
 * it sweeps once on initial load and replays on hover, never adding a 4th continuous loop.
 */
export function BorderBeam({ class: extraClass = '' } = {}) {
  const wrap = h('div', {
    class: `absolute inset-0 rounded-[inherit] overflow-hidden pointer-events-none select-none ${extraClass}`,
    'aria-hidden': 'true',
    'data-decor': 'border-beam',
    style: 'z-index: 2; pointer-events: none;'
  });

  // Top edge sweeping segment (1px thin)
  const beam = h('div', {
    class: 'absolute top-0 left-0 h-[1px] w-28 pointer-events-none',
    style: 'background: linear-gradient(90deg, transparent, var(--accent), transparent); transform: translateX(-120%); transition: transform 1.6s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.4s ease; opacity: 0;'
  });

  wrap.appendChild(beam);

  const triggerSweep = () => {
    if (document.documentElement.getAttribute('data-decor-level') !== 'balanced') return;
    beam.style.transition = 'none';
    beam.style.transform = 'translateX(-120%)';
    beam.style.opacity = '1';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        beam.style.transition = 'transform 1.8s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.4s ease 1.4s';
        beam.style.transform = 'translateX(520%)';
        beam.style.opacity = '0';
      });
    });
  };

  // Initial one-shot sweep after terminal appears
  setTimeout(triggerSweep, 700);

  return {
    element: wrap,
    triggerSweep
  };
}
