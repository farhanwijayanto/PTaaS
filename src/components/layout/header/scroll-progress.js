import { h } from '../../../lib/dom.js';
import { loadMotionCore, isReducedMotion } from '../../../lib/motion.js';

export function createScrollProgress() {
  const bar = h('div', {
    class: 'header-scroll-progress opacity-0',
    'aria-hidden': 'true',
    style: 'transform-origin: 0 50%; transform: scaleX(0);'
  });

  let stopScroll = null;
  let stopVis = null;
  let destroyed = false;

  loadMotionCore().then(({ scroll, animate }) => {
    if (destroyed || !bar.isConnected) return;
    if (isReducedMotion()) {
      stopVis = scroll((progress) => {
        bar.style.transform = `scaleX(${progress})`;
        bar.style.opacity = progress > 0.002 ? '1' : '0';
      });
      return;
    }
    const anim = animate(bar, { scaleX: [0, 1] }, { ease: 'linear' });
    stopScroll = scroll(anim);
    stopVis = scroll((progress) => {
      bar.style.opacity = progress > 0.002 ? '1' : '0';
    });
  }).catch(() => {});

  return {
    element: bar,
    destroy: () => {
      destroyed = true;
      stopScroll?.();
      stopVis?.();
    }
  };
}
