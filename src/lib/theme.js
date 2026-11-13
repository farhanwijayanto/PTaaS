// Single Source of Truth Theme Architecture for PTaaS
// Supports: 'light' | 'dark' | 'system' modes.
// Provides localStorage persistence, cross-tab sync, media-query live updates,
// and temporary transition styling.

import { emit } from './events.js';

const KEY = 'ptaas.theme';
const subscribers = new Set();
let transitionTimer = null;

function getStoredMode() {
  try {
    return localStorage.getItem(KEY) || 'system';
  } catch {
    return 'system';
  }
}

function getSystemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(mode) {
  if (mode === 'system') return getSystemTheme();
  return mode === 'light' ? 'light' : 'dark';
}

let currentMode = getStoredMode();
let resolvedTheme = resolveTheme(currentMode);

/**
 * Apply the resolved theme to <html> via data-theme and color-scheme
 */
function applyToDom(theme, animate = false) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  if (animate) {
    if (transitionTimer) clearTimeout(transitionTimer);
    root.classList.add('theme-transitioning');
    transitionTimer = setTimeout(() => {
      root.classList.remove('theme-transitioning');
      transitionTimer = null;
    }, 260);
  }

  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

/**
 * Notify all subscribed UI components
 */
function notifySubscribers() {
  const state = {
    mode: currentMode,
    theme: resolvedTheme,
    resolvedTheme,
    isDark: resolvedTheme === 'dark'
  };
  subscribers.forEach((fn) => {
    try {
      fn(state);
    } catch (e) {
      console.error('Theme subscriber error:', e);
    }
  });
  emit('theme:changed', state);
}

// Media Query change listener for 'system' mode
if (typeof window !== 'undefined' && window.matchMedia) {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const handleMediaChange = () => {
    if (currentMode === 'system') {
      const nextResolved = getSystemTheme();
      if (nextResolved !== resolvedTheme) {
        resolvedTheme = nextResolved;
        applyToDom(resolvedTheme, true);
        notifySubscribers();
      }
    }
  };
  if (mql.addEventListener) mql.addEventListener('change', handleMediaChange);
  else if (mql.addListener) mql.addListener(handleMediaChange);
}

// Cross-tab synchronization via storage event
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      const newMode = e.newValue || 'system';
      if (newMode !== currentMode) {
        currentMode = newMode;
        resolvedTheme = resolveTheme(currentMode);
        applyToDom(resolvedTheme, true);
        notifySubscribers();
      }
    }
  });
}

// Initial apply
applyToDom(resolvedTheme, false);

/**
 * Get current mode: 'light' | 'dark' | 'system'
 */
export function getThemeMode() {
  return currentMode;
}

/**
 * Get resolved theme: 'light' | 'dark'
 */
export function getTheme() {
  return resolvedTheme;
}

/**
 * Set theme mode ('light' | 'dark' | 'system') or functional update
 */
export function setTheme(modeOrFn, { animate = true } = {}) {
  const nextMode = typeof modeOrFn === 'function' ? modeOrFn(currentMode) : modeOrFn;
  if (!['light', 'dark', 'system'].includes(nextMode)) return;

  currentMode = nextMode;
  try {
    localStorage.setItem(KEY, currentMode);
  } catch {}

  const nextResolved = resolveTheme(currentMode);
  const changed = nextResolved !== resolvedTheme;
  resolvedTheme = nextResolved;

  applyToDom(resolvedTheme, animate && changed);
  notifySubscribers();
  return resolvedTheme;
}

/**
 * Toggle between 'light' and 'dark'
 */
export function toggleTheme({ animate = true } = {}) {
  const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
  return setTheme(nextTheme, { animate });
}

/**
 * Subscribe to theme updates. Returns unsubscribe function.
 */
export function subscribeTheme(callback) {
  subscribers.add(callback);
  // Immediately call with current state
  try {
    callback({
      mode: currentMode,
      theme: resolvedTheme,
      resolvedTheme,
      isDark: resolvedTheme === 'dark'
    });
  } catch {}

  return () => subscribers.delete(callback);
}

/**
 * Hook-style helper for components
 */
export function useTheme() {
  return {
    mode: currentMode,
    theme: resolvedTheme,
    resolvedTheme,
    isDark: resolvedTheme === 'dark',
    setTheme,
    toggleTheme,
    subscribe: subscribeTheme
  };
}
