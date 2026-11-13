import { h } from '../../../lib/dom.js';
import { getLang } from '../../../lib/i18n.js';
import { on } from '../../../lib/events.js';
import { NAV_CONFIG } from './nav-config.js';
import { createPlatformMenu } from './platform-menu.js';
import { subscribeActiveSection } from '../../../lib/active-section.js';
import { loadMotionCore, SPRINGS, isReducedMotion, isFinePointer } from '../../../lib/motion.js';

export function createNavLinks({ onNavigate }) {
  const currentLang = () => getLang();
  let activeNavId = null;
  let activeEl = null;
  let hoveredEl = null;
  let pillVisible = false;

  const track = h('nav', {
    class: 'nav-pill-track hidden lg:flex items-center gap-1 p-1 rounded-full border border-line/60 bg-surface/50 backdrop-blur-md relative select-none',
    'aria-label': 'Primary'
  });

  // Hover pill (desktop fine-pointer only; never changes activeNavId)
  const hoverIndicator = h('div', {
    class: 'nav-pill-hover absolute top-1 bottom-1 rounded-full bg-raised/50 pointer-events-none opacity-0',
    'aria-hidden': 'true',
    style: 'left: 0; z-index: 0; transform-origin: 0 50%; transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1), width 200ms cubic-bezier(0.16, 1, 0.3, 1), opacity 140ms ease-out;'
  });

  // Active pill (decorative, animated with UI spring-like curve)
  const indicator = h('div', {
    class: 'nav-pill-indicator opacity-0 pointer-events-none',
    'aria-hidden': 'true',
    style: 'left: 0; transform-origin: 0 50%; transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1), width 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 160ms ease-out;'
  });

  track.appendChild(hoverIndicator);
  track.appendChild(indicator);

  const elementsMap = new Map();
  const metricsCache = new Map();
  let platformMenuRef = null;
  let animateFn = null;
  let activeAnim = null;
  let hoverAnim = null;

  loadMotionCore().then(({ animate }) => {
    animateFn = animate;
    if (activeEl) moveActivePill(activeEl, true);
  }).catch(() => {});

  function measureAll() {
    metricsCache.clear();
    const trackRect = track.getBoundingClientRect();
    if (trackRect.width === 0) return;
    elementsMap.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0) {
        metricsCache.set(el, { left: Math.round(r.left - trackRect.left), width: Math.round(r.width) });
      }
    });
  }

  function getMetrics(el) {
    if (!el) return null;
    let m = metricsCache.get(el);
    if (!m || m.width === 0) {
      const trackRect = track.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (trackRect.width > 0 && r.width > 0) {
        m = { left: Math.round(r.left - trackRect.left), width: Math.round(r.width) };
        metricsCache.set(el, m);
      }
    }
    return m && m.width > 0 ? m : null;
  }

  function moveActivePill(el, instant = false) {
    const noMotion = instant || isReducedMotion();
    indicator.style.transition = noMotion
      ? 'none'
      : 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1), width 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 160ms ease-out';

    if (!el) {
      pillVisible = false;
      indicator.style.opacity = '0';
      return;
    }

    const m = getMetrics(el);
    if (!m) {
      pillVisible = false;
      indicator.style.opacity = '0';
      return;
    }

    const wasHidden = !pillVisible;
    pillVisible = true;

    if (wasHidden && !noMotion) {
      // First show: place instantly, then fade in without jumping
      indicator.style.transition = 'none';
      indicator.style.transform = `translateX(${m.left}px)`;
      indicator.style.width = `${m.width}px`;
      void indicator.offsetWidth;
      indicator.style.transition = 'opacity 180ms ease-out';
    } else {
      indicator.style.transform = `translateX(${m.left}px)`;
      indicator.style.width = `${m.width}px`;
    }
    indicator.style.opacity = '1';
  }

  function moveHoverPill(el) {
    if (!isFinePointer()) return;
    const noMotion = isReducedMotion();
    hoverIndicator.style.transition = noMotion
      ? 'none'
      : 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1), width 200ms cubic-bezier(0.16, 1, 0.3, 1), opacity 140ms ease-out';

    if (!el || el === activeEl) {
      hoverIndicator.style.opacity = '0';
      return;
    }
    const m = getMetrics(el);
    if (!m) {
      hoverIndicator.style.opacity = '0';
      return;
    }
    const wasHidden = parseFloat(getComputedStyle(hoverIndicator).opacity) < 0.05;
    if (wasHidden && !noMotion) {
      hoverIndicator.style.transition = 'none';
      hoverIndicator.style.transform = `translateX(${m.left}px)`;
      hoverIndicator.style.width = `${m.width}px`;
      void hoverIndicator.offsetWidth;
      hoverIndicator.style.transition = 'opacity 140ms ease-out';
    } else {
      hoverIndicator.style.transform = `translateX(${m.left}px)`;
      hoverIndicator.style.width = `${m.width}px`;
    }
    hoverIndicator.style.opacity = '1';
  }

  const ro = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => {
        measureAll();
        if (activeEl) moveActivePill(activeEl, true);
        if (hoveredEl && hoveredEl !== activeEl) moveHoverPill(hoveredEl);
      })
    : null;
  ro?.observe(track);

  NAV_CONFIG.forEach((item) => {
    if (item.hasDropdown) {
      const platformMenu = createPlatformMenu({
        item,
        onSelect: (href) => {
          if (onNavigate) onNavigate(href);
        }
      });
      platformMenuRef = platformMenu;
      const el = platformMenu.element;
      const trigger = platformMenu.trigger;

      if (isFinePointer()) {
        trigger.addEventListener('mouseenter', () => { hoveredEl = trigger; moveHoverPill(trigger); });
        trigger.addEventListener('focus', () => { hoveredEl = trigger; moveHoverPill(trigger); });
        trigger.addEventListener('blur', () => { hoveredEl = null; moveHoverPill(null); });
      }
      track.appendChild(el);
      ro?.observe(trigger);
      elementsMap.set(item.id, trigger);
    } else {
      const a = h('a', {
        href: item.href,
        class: 'nav-item-btn touch-target h-9 px-3.5 text-sm font-medium text-muted hover:text-fg transition-colors duration-150 flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-full relative z-10',
        onClick: (e) => {
          if (!item.isRoute) {
            e.preventDefault();
            if (onNavigate) onNavigate(item.href);
          }
        }
      },
        h('span', {}, currentLang() === 'id' ? item.labelId : item.labelEn)
      );

      if (isFinePointer()) {
        a.addEventListener('mouseenter', () => { hoveredEl = a; moveHoverPill(a); });
        a.addEventListener('focus', () => { hoveredEl = a; moveHoverPill(a); });
        a.addEventListener('blur', () => { hoveredEl = null; moveHoverPill(null); });
      }
      track.appendChild(a);
      ro?.observe(a);
      elementsMap.set(item.id, a);
    }
  });

  if (isFinePointer()) {
    track.addEventListener('mouseleave', () => {
      hoveredEl = null;
      moveHoverPill(null);
    });
  }

  function applyActiveState({ sectionId, navId }) {
    activeNavId = navId;
    if (platformMenuRef) {
      platformMenuRef.setActive(navId === 'platform', sectionId);
    }

    let nextActiveEl = null;
    elementsMap.forEach((el, key) => {
      if (key === navId) {
        el.classList.remove('text-muted');
        el.classList.add('text-fg', 'font-semibold');
        el.setAttribute('aria-current', 'location');
        nextActiveEl = el;
      } else {
        el.classList.remove('text-fg', 'font-semibold');
        el.classList.add('text-muted');
        el.removeAttribute('aria-current');
      }
    });

    activeEl = nextActiveEl;
    moveActivePill(activeEl);
    if (hoveredEl && hoveredEl === activeEl) moveHoverPill(null);
  }

  const unsubActive = subscribeActiveSection(applyActiveState);

  const remeasure = () => {
    requestAnimationFrame(() => {
      measureAll();
      if (activeEl) moveActivePill(activeEl, true);
    });
  };
  document.fonts?.ready?.then(remeasure).catch(() => {});
  const unsubLang = on('lang', remeasure);
  const unsubTheme = on('theme', remeasure);

  return {
    element: track,
    setActive: (id) => {
      // Kept only for compatibility; active state is driven by active-section.js
      applyActiveState({ sectionId: id, navId: id });
    },
    destroy: () => {
      unsubActive?.();
      unsubLang?.();
      unsubTheme?.();
      ro?.disconnect();
      activeAnim?.stop?.();
      hoverAnim?.stop?.();
    }
  };
}
