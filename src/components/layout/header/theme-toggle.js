// Canonical ThemeToggle Component for PTaaS
// Single robust implementation used in Landing Header, App Topbar, Mobile Menu, and Login.
// Strictly adheres to WCAG: role="switch", aria-checked, min 44x44px hit area,
// pointer-events: none on icons, and subscription to the central ThemeProvider.

import { h, icon, cx } from '../../../lib/dom.js';
import { getTheme, toggleTheme, subscribeTheme } from '../../../lib/theme.js';
import { getLang } from '../../../lib/i18n.js';

export function createThemeToggle(options = {}) {
  const {
    className = '',
    size = 'md'
  } = options;

  const currentTheme = () => getTheme();
  const isDark = () => currentTheme() === 'dark';

  const getLabel = () => {
    const lang = getLang();
    if (isDark()) {
      return lang === 'id' ? 'Beralih ke mode terang' : 'Switch to light theme';
    }
    return lang === 'id' ? 'Beralih ke mode gelap' : 'Switch to dark theme';
  };

  // Outer button: guaranteed minimum 44x44px touch target via padding
  const btn = h('button', {
    type: 'button',
    role: 'switch',
    'aria-checked': isDark() ? 'true' : 'false',
    'aria-label': getLabel(),
    title: getLabel(),
    class: cx(
      'touch-target relative flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface/80 p-2 text-muted',
      'hover:bg-raised hover:text-fg hover:border-line-strong transition-colors duration-150 cursor-pointer shrink-0',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent select-none',
      className
    )
  });

  // Inner icon container that receives transforms, keeping outer button rect fixed
  const iconWrapper = h('div', {
    class: 'relative h-4 w-4 flex items-center justify-center pointer-events-none'
  });

  // Both icons rendered in DOM; shown/hidden via CSS & classes
  const sunIcon = icon('sun', 'only-dark w-4 h-4 text-[var(--warning-text)] pointer-events-none transition-transform duration-200 rotate-0');
  const moonIcon = icon('moon', 'only-light w-4 h-4 text-[var(--info-text)] pointer-events-none transition-transform duration-200 rotate-0');

  iconWrapper.appendChild(sunIcon);
  iconWrapper.appendChild(moonIcon);
  btn.appendChild(iconWrapper);

  // Update DOM state based on theme changes
  function updateUi(state) {
    const dark = state.theme === 'dark';
    btn.setAttribute('aria-checked', dark ? 'true' : 'false');
    const label = getLabel();
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
  }

  // Subscribe to central theme provider
  const unsubscribe = subscribeTheme((state) => {
    updateUi(state);
  });

  // Guard against double fire from the same event tick
  let lastClickTime = 0;

  btn.addEventListener('click', (e) => {
    const now = Date.now();
    if (now - lastClickTime < 25) return; // Ignore synthetic duplicate within same frame
    lastClickTime = now;

    toggleTheme({ animate: true });
  });

  // Store unsubscribe on button node for cleanup if needed
  btn.__cleanupTheme = unsubscribe;

  return btn;
}

export const ThemeToggle = createThemeToggle;
