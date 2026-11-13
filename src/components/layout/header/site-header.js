import { h, icon } from '../../../lib/dom.js';
import { t, getLang } from '../../../lib/i18n.js';
import { button } from '../../ui/button.js';
import { createNavLinks } from './nav-links.js';
import { createLangMenu } from './lang-menu.js';
import { createThemeToggle } from './theme-toggle.js';
import { createMobileMenu } from './mobile-menu.js';
import { createScrollProgress } from './scroll-progress.js';
import { loadMotionMini, loadMotionCore, DURATIONS, EASINGS, isReducedMotion } from '../../../lib/motion.js';
import { scrollToNavTarget } from '../../../lib/active-section.js';

export function createSiteHeader() {
  const currentLang = () => getLang();
  let isScrolled = false;
  let isProgrammaticScroll = false;
  let programmaticTimer = null;

  // Header Root Element — always pinned (sticky/fixed)
  const header = h('header', {
    class: 'site-header',
    'data-scrolled': 'false'
  });

  // Dedicated Blur/Background Layer underneath content (fade opacity 0 -> 1)
  const bgLayer = h('div', {
    class: 'site-header-bg',
    'aria-hidden': 'true'
  });
  header.appendChild(bgLayer);

  // Inner Container sharing exact page grid (landing-container)
  const container = h('div', { class: 'landing-container h-full relative z-1' });
  const grid = h('div', { class: 'header-grid' });

  // 1. LEFT ZONE: 28px logo mark + wordmark in one line
  const logoMark = h('span', {
    class: 'header-logo-mark flex h-7 w-7 items-center justify-center rounded-lg bg-fg text-canvas font-mono font-bold text-xs shrink-0 select-none'
  }, 'PT');

  const logo = h('a', {
    href: '/',
    'data-link': true,
    class: 'site-header-logo flex items-center gap-2.5 font-semibold text-fg tracking-tight select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg justify-self-start shrink-0',
    onClick: (e) => {
      if (location.pathname === '/' || location.pathname === '') {
        e.preventDefault();
        scrollToNavTarget('top');
      }
    }
  },
    logoMark,
    h('span', { class: 'text-base font-semibold tracking-tight whitespace-nowrap' }, 'PTaaS Cloud')
  );

  // 2. CENTER ZONE: Nav links with sliding pill indicator
  const navLinks = createNavLinks({
    onNavigate: (href, isRoute) => {
      if (isRoute) {
        window.location.href = href;
      } else {
        const id = href.replace('#', '');
        scrollToSection(id);
      }
    }
  });

  // 3. RIGHT ZONE: Utilities & CTA
  const rightGroup = h('div', {
    class: 'flex items-center gap-3 justify-self-end shrink-0'
  });

  // Pulsing system health indicator dot (only visible >= 1280px)
  const healthDot = h('div', {
    class: 'hidden xl:flex items-center gap-1.5 px-2 py-1 text-xs font-mono text-muted select-none',
    title: 'All systems operational, 99.98% uptime',
    'aria-label': 'All systems operational, 99.98% uptime'
  },
    h('span', { class: 'h-2 w-2 rounded-full bg-accent shadow-[0_0_8px_rgb(var(--accent)/0.6)]' })
  );

  const langMenu = createLangMenu();
  const themeToggle = createThemeToggle();

  // Primary CTA Button: "Sign in"
  const ctaBtn = button({
    label: currentLang() === 'id' ? 'Masuk' : 'Sign in',
    ariaLabel: currentLang() === 'id' ? 'Masuk ke platform' : 'Sign in to platform',
    variant: 'primary',
    size: 'sm',
    href: '/login',
    class: 'hidden sm:inline-flex h-9 px-4 text-xs font-medium shrink-0 cursor-pointer'
  });

  // Mobile menu sheet & hamburger
  const mobileMenu = createMobileMenu({
    onNavigate: (href, isRoute) => {
      if (isRoute) {
        window.location.href = href;
      } else {
        const id = href.replace('#', '');
        scrollToSection(id);
      }
    }
  });

  // Assembly of Right Zone
  rightGroup.appendChild(healthDot);
  rightGroup.appendChild(langMenu);
  rightGroup.appendChild(themeToggle);
  rightGroup.appendChild(ctaBtn);
  rightGroup.appendChild(mobileMenu.hamburgerBtn);

  // Assembly of Header Grid
  grid.appendChild(logo);
  grid.appendChild(navLinks.element);
  grid.appendChild(rightGroup);

  container.appendChild(grid);
  header.appendChild(container);

  // 4. Scroll Progress Bar (2px at bottom edge, z-index 2)
  const scrollProgress = createScrollProgress();
  header.appendChild(scrollProgress.element);

  // Smooth Scroll Helper (delegates to shared single-source-of-truth scrollToNavTarget)
  function scrollToSection(id) {
    scrollToNavTarget(id);
  }

  // Entrance fade-down (y: -8 -> 0) once
  if (!isReducedMotion()) {
    loadMotionMini().then(({ animate }) => {
      animate(header, { y: [-8, 0], opacity: [0.001, 1] }, { duration: DURATIONS.base, ease: EASINGS.expoOut });
    }).catch(() => {});
  }

  // Scroll State via Motion's shared scroll() (no window scroll listener)
  let stopHeaderScroll = null;
  let stopDarkSpy = null;

  loadMotionCore().then(({ scroll, inView }) => {
    stopHeaderScroll = scroll((_progress, info) => {
      const nextScrolled = info.y.current >= 8;
      if (nextScrolled !== isScrolled) {
        isScrolled = nextScrolled;
        header.setAttribute('data-scrolled', isScrolled ? 'true' : 'false');
      }
    });

    const darkBand = document.getElementById('security');
    if (darkBand) {
      darkBand.setAttribute('data-header-theme', 'dark');
      stopDarkSpy = inView(
        darkBand,
        () => {
          header.setAttribute('data-header-theme', 'dark');
          return () => header.removeAttribute('data-header-theme');
        },
        { margin: '0px 0px -88% 0px' }
      );
    }
  }).catch(() => {});

  return {
    element: header,
    mobileSheet: mobileMenu.sheet,
    scrollToSection,
    destroy: () => {
      stopHeaderScroll?.();
      stopDarkSpy?.();
      navLinks.destroy?.();
      scrollProgress.destroy();
    }
  };
}
