import {
  isReducedMotion,
  isFinePointer,
  getMotionLevel,
  downgradeMotionForSession,
  onMotionLevelChange,
  loadMotionCore,
  afterFirstPaint,
} from './motion.js';

let lenisInstance = null;
let frameTask = null;
let cancelFrameFn = null;
let pausedCount = 0;
let isDestroyed = false;
let adaptiveStop = null;

function ensureLenisCss() {
  if (document.getElementById('lenis-base-css')) return;
  const style = document.createElement('style');
  style.id = 'lenis-base-css';
  style.textContent = `
    html.lenis, html.lenis body { height: auto; }
    .lenis:not(.lenis-autoToggle).lenis-stopped { overflow: clip; }
    .lenis [data-lenis-prevent], .lenis [data-lenis-prevent-wheel],
    .lenis [data-lenis-prevent-touch], .lenis [data-lenis-prevent-vertical] {
      overscroll-behavior: contain;
    }
  `;
  document.head.appendChild(style);
}

export function getLenis() {
  return lenisInstance;
}

export function pauseSmoothScroll() {
  pausedCount++;
  lenisInstance?.stop();
}

export function resumeSmoothScroll() {
  pausedCount = Math.max(0, pausedCount - 1);
  if (pausedCount === 0 && document.visibilityState === 'visible') {
    lenisInstance?.start();
  }
}

export function destroySmoothScroll() {
  isDestroyed = true;
  if (frameTask && cancelFrameFn) {
    cancelFrameFn(frameTask);
    frameTask = null;
  }
  if (lenisInstance) {
    lenisInstance.destroy();
    lenisInstance = null;
  }
  adaptiveStop?.();
  adaptiveStop = null;
}

const scrollListeners = new Set();
let motionScrollStop = null;
let nativeScrollAttached = false;

function emitSharedScroll(y) {
  scrollListeners.forEach((cb) => {
    try { cb(y); } catch {}
  });
}

function ensureFallbackScrollSource() {
  if (nativeScrollAttached || typeof window === 'undefined') return;
  nativeScrollAttached = true;
  window.addEventListener('scroll', () => {
    if (!lenisInstance) emitSharedScroll(window.scrollY);
  }, { passive: true });
}

export function onSharedScroll(cb) {
  scrollListeners.add(cb);
  ensureFallbackScrollSource();
  return () => scrollListeners.delete(cb);
}

export function getCurrentScrollY() {
  if (lenisInstance && typeof lenisInstance.scroll === 'number') return lenisInstance.scroll;
  return typeof window !== 'undefined' ? (window.scrollY || document.documentElement.scrollTop || 0) : 0;
}

export function resolveSectionAlias(idOrHash) {
  const clean = String(idOrHash || '').replace(/^#/, '');
  if (clean === 'how-it-works') return 'stepper';
  if (clean === 'platform') return 'lifecycle';
  return clean;
}

// Smooth anchor navigation with URL hash, focus management, and immediate cancel on user input
export function scrollToTarget(targetOrId, { immediate = false, updateHash = true, onCancel = null, onSettled = null } = {}) {
  const rawId = String(targetOrId).replace(/^#/, '');
  const id = resolveSectionAlias(rawId);
  const el = id === 'top' ? document.body : document.getElementById(id);
  if (!el) return null;

  const headerEl = document.querySelector('header');
  const measuredH = headerEl ? Math.round(headerEl.getBoundingClientRect().height) : 60;
  // Scrolled header is compact (60px); use compact height when scrolling away from top
  const headerH = id === 'top' ? measuredH : Math.min(measuredH, 60);
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const targetY = id === 'top'
    ? 0
    : Math.min(maxScroll, Math.max(0, Math.round(getCurrentScrollY() + el.getBoundingClientRect().top - (headerH + 16))));
  const instant = immediate || isReducedMotion();

  if (updateHash) {
    try {
      if (id === 'top') {
        history.replaceState(null, '', location.pathname + location.search);
      } else {
        history.pushState(null, '', `#${rawId || id}`);
      }
    } catch {}
  }

  if (lenisInstance && !instant) {
    const cleanupListeners = () => {
      window.removeEventListener('wheel', cancelOnInput);
      window.removeEventListener('touchstart', cancelOnInput);
      window.removeEventListener('keydown', cancelOnInput);
    };
    const cancelOnInput = () => {
      lenisInstance?.stop();
      lenisInstance?.start();
      cleanupListeners();
      onCancel?.();
    };
    window.addEventListener('wheel', cancelOnInput, { passive: true, once: true });
    window.addEventListener('touchstart', cancelOnInput, { passive: true, once: true });
    window.addEventListener('keydown', cancelOnInput, { passive: true, once: true });

    lenisInstance.scrollTo(targetY, {
      duration: 1.1,
      easing: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
      onComplete: () => {
        cleanupListeners();
        onSettled?.();
      },
    });
  } else {
    window.scrollTo({ top: targetY, behavior: instant ? 'auto' : 'smooth' });
    if (instant) onSettled?.();
  }

  // Move keyboard focus to section heading for accessibility
  if (id !== 'top') {
    const heading = el.querySelector('h1, h2, h3') || el;
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
  return targetY;
}

function startAdaptiveQualityMonitor() {
  let slowSince = 0;
  let lastTs = performance.now();
  let active = true;

  function sample(now) {
    if (!active) return;
    const dt = now - lastTs;
    lastTs = now;
    if (dt > 24 && dt < 250) {
      if (!slowSince) slowSince = now;
      else if (now - slowSince > 2000) {
        downgradeMotionForSession(`frame delta ${dt.toFixed(1)}ms > 24ms for >2s`);
        destroySmoothScroll();
        return;
      }
    } else {
      slowSince = 0;
    }
    requestAnimationFrame(sample);
  }
  const rafId = requestAnimationFrame(sample);
  return () => {
    active = false;
    cancelAnimationFrame(rafId);
  };
}

// Initialize Layer A (Lenis) after first paint, desktop fine-pointer only, tied to Motion's frame loop
export function initLandingSmoothScroll() {
  isDestroyed = false;

  if (!isFinePointer() || isReducedMotion() || getMotionLevel() !== 'balanced') {
    return () => {};
  }

  const cancelIdle = afterFirstPaint(async () => {
    if (isDestroyed || !isFinePointer() || isReducedMotion() || getMotionLevel() !== 'balanced') return;
    try {
      ensureLenisCss();
      const [{ default: Lenis }, { frame, cancelFrame }] = await Promise.all([
        import('./vendor/lenis.mjs'),
        loadMotionCore(),
      ]);
      if (isDestroyed) return;

      cancelFrameFn = cancelFrame;
      lenisInstance = new Lenis({
        lerp: 0.1,
        wheelMultiplier: 1,
        smoothWheel: true,
        syncTouch: false,
        orientation: 'vertical',
        autoRaf: false,
      });

      lenisInstance.on('scroll', ({ scroll }) => {
        emitSharedScroll(scroll);
      });

      // Single rAF loop: drive Lenis from Motion's frame.update
      frameTask = frame.update(({ timestamp }) => {
        if (lenisInstance && pausedCount === 0 && document.visibilityState === 'visible') {
          lenisInstance.raf(timestamp);
        }
      }, true);

      adaptiveStop = startAdaptiveQualityMonitor();
    } catch {}
  }, 400);

  const onVis = () => {
    if (document.visibilityState === 'hidden') lenisInstance?.stop();
    else if (pausedCount === 0) lenisInstance?.start();
  };
  document.addEventListener('visibilitychange', onVis);

  const unsubLevel = onMotionLevelChange((lvl) => {
    if (lvl !== 'balanced') destroySmoothScroll();
  });

  return () => {
    cancelIdle();
    document.removeEventListener('visibilitychange', onVis);
    unsubLevel();
    destroySmoothScroll();
  };
}
