// Central decoration configuration & adaptive capability detection for the Landing Page ("/")
// DECORATION_LEVEL: 'off' | 'low' | 'balanced'
// 'low' keeps only the dot grid + static glow.

export const DECOR_CONFIG = {
  DECORATION_LEVEL: 'balanced', // Default setting ('off' | 'low' | 'balanced')
  MAX_PACKETS: 1,
  CONSTELLATION_NODES: 9,
  INTERACTIVE_RADIUS_PX: 100,
  FRAME_BUDGET_MS: 24,
  ADAPTIVE_WINDOW_MS: 2000
};

export function resolveDecorationLevel() {
  if (typeof window === 'undefined') return DECOR_CONFIG.DECORATION_LEVEL;

  // Allow explicit runtime or query override
  try {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('decor');
    if (q === 'off' || q === 'low' || q === 'balanced') return q;
    if (q === 'full') return 'balanced';
    if (window.DECORATION_LEVEL === 'off' || window.DECORATION_LEVEL === 'low' || window.DECORATION_LEVEL === 'balanced') {
      return window.DECORATION_LEVEL;
    }
    const saved = localStorage.getItem('ptaas.decor');
    if (saved === 'off' || saved === 'low' || saved === 'balanced') return saved;
  } catch { /* ignore */ }

  if (DECOR_CONFIG.DECORATION_LEVEL === 'off') return 'off';

  // Auto-select 'low' on prefers-reduced-motion
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return 'low';
  }

  // Auto-select 'low' on Save-Data
  if (navigator.connection?.saveData === true) {
    return 'low';
  }

  // Auto-select 'low' on low-end devices (hardwareConcurrency <= 4)
  if (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4) {
    return 'low';
  }

  return DECOR_CONFIG.DECORATION_LEVEL;
}

export function applyDecorationLevelAttr() {
  if (typeof document === 'undefined') return 'full';
  const level = resolveDecorationLevel();
  document.documentElement.setAttribute('data-decor-level', level);

  // Watch prefers-reduced-motion changes dynamically
  const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  if (mq && !window.__ptaasReducedMotionBound) {
    window.__ptaasReducedMotionBound = true;
    mq.addEventListener?.('change', () => {
      const next = resolveDecorationLevel();
      document.documentElement.setAttribute('data-decor-level', next);
      window.dispatchEvent(new CustomEvent('ptaas:decor-level', { detail: next }));
    });
  }

  // Optional battery-saver check where supported
  if (navigator.getBattery && !window.__ptaasBatteryChecked) {
    window.__ptaasBatteryChecked = true;
    navigator.getBattery().then((battery) => {
      if (!battery.charging && battery.level <= 0.2) {
        document.documentElement.setAttribute('data-decor-level', 'low');
        window.dispatchEvent(new CustomEvent('ptaas:decor-level', { detail: 'low' }));
      }
    }).catch(() => {});
  }

  return level;
}

export function isReducedOrLow() {
  return resolveDecorationLevel() !== 'full';
}

export function isMobileOrTouch() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768 || window.matchMedia?.('(pointer: coarse)').matches;
}
