// Centralized Motion tokens, guardrails, and lazy loaders.
// Keeps initial landing route <= 15 KB gzip by using motion-mini.mjs (3.19 KB gzip)
// on the critical path and lazy-loading motion-core.mjs (27.80 KB gzip) after first paint.

export const DURATIONS = {
  fast: 0.15,
  base: 0.25,
  slow: 0.6,
  hero: 0.5,
  countUp: 1.2,
};

export const EASINGS = {
  expoOut: [0.22, 1, 0.36, 1],
  easeOut: 'easeOut',
  easeInOut: 'easeInOut',
  linear: 'linear',
};

export const SPRINGS = {
  ui: { type: 'spring', stiffness: 380, damping: 34 },
  tilt: { stiffness: 150, damping: 20 },
  scroll: { stiffness: 120, damping: 28, mass: 0.4 },
  progress: { stiffness: 200, damping: 30 },
};

export const STAGGER = {
  tight: 0.04,
  base: 0.06,
  hero: 0.07,
  slow: 0.1,
};

export const REVEAL_PRESETS = {
  fadeUp: { y: 16, opacity: 0.001, duration: DURATIONS.slow, ease: EASINGS.expoOut },
  heroFadeUp: { y: 12, opacity: 0.001, duration: DURATIONS.hero, ease: EASINGS.expoOut },
  fadeIn: { y: 0, opacity: 0.001, duration: DURATIONS.base, ease: EASINGS.expoOut },
  scaleIn: { scale: 0.98, opacity: 0.001, duration: DURATIONS.base, ease: EASINGS.expoOut },
};

let sessionDowngraded = false;
const levelListeners = new Set();

export function isReducedMotion() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

export function isFinePointer() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches ?? false;
}

export function isDesktopMotionEnabled() {
  return isFinePointer() && !isReducedMotion() && getMotionLevel() === 'balanced';
}

export function getMotionLevel() {
  if (isReducedMotion() || sessionDowngraded) return 'low';
  if (typeof window !== 'undefined' && window.__PTAAS_DECOR_LEVEL) {
    return window.__PTAAS_DECOR_LEVEL;
  }
  return 'balanced';
}

export function downgradeMotionForSession(reason) {
  if (sessionDowngraded) return;
  sessionDowngraded = true;
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-decor-level', 'low');
  }
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    console.info(`[motion] Adaptive quality downgraded to 'low': ${reason}`);
  }
  for (const cb of levelListeners) {
    try { cb('low'); } catch {}
  }
}

export function onMotionLevelChange(cb) {
  levelListeners.add(cb);
  return () => levelListeners.delete(cb);
}

let miniPromise = null;
export function loadMotionMini() {
  if (!miniPromise) {
    miniPromise = import('./vendor/motion-mini.mjs');
  }
  return miniPromise;
}

let corePromise = null;
export function loadMotionCore() {
  if (!corePromise) {
    corePromise = import('./vendor/motion-core.mjs');
  }
  return corePromise;
}

// Schedule non-critical work after first paint
export function afterFirstPaint(fn, timeout = 350) {
  if (typeof window === 'undefined') return () => {};
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(fn, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 60);
  return () => clearTimeout(id);
}

// Hydration-safe Reveal helper using Motion's inView + animate (transform + opacity only).
// Content is visible by default if JS fails; hidden state is applied only right before animating.
export function attachReveal(el, { preset = 'fadeUp', delay = 0, margin = '0px 0px -12% 0px' } = {}) {
  if (!el || isReducedMotion() || getMotionLevel() === 'off') return () => {};
  const cfg = REVEAL_PRESETS[preset] || REVEAL_PRESETS.fadeUp;
  let stopInView = null;
  let cancelled = false;

  // If already in viewport on load or hash jump, render final state immediately
  const rect = el.getBoundingClientRect();
  if (rect.top < window.innerHeight * 0.96 && rect.bottom > 0) {
    return () => {};
  }

  // Apply initial offset only after mount so SSR/no-JS stays visible
  el.style.opacity = String(cfg.opacity);
  if (cfg.y) el.style.transform = `translate3d(0, ${cfg.y}px, 0)`;
  else if (cfg.scale) el.style.transform = `scale(${cfg.scale})`;

  loadMotionCore().then(({ inView, animate }) => {
    if (cancelled || !el.isConnected) return;
    stopInView = inView(
      el,
      () => {
        const target = { opacity: [cfg.opacity, 1] };
        if (cfg.y) target.y = [cfg.y, 0];
        if (cfg.scale) target.scale = [cfg.scale, 1];
        animate(el, target, {
          duration: cfg.duration,
          delay,
          ease: cfg.ease,
        });
      },
      { margin }
    );
  }).catch(() => {
    el.style.opacity = '1';
    el.style.transform = 'none';
  });

  return () => {
    cancelled = true;
    stopInView?.();
  };
}
