import { h, icon } from '../../../lib/dom.js';
import { getLang, toggleLang } from '../../../lib/i18n.js';
import { toggleTheme } from '../../../lib/theme.js';
import { button } from '../../ui/button.js';
import { createThemeToggle } from './theme-toggle.js';
import { NAV_CONFIG } from './nav-config.js';
import { loadMotionMini, isReducedMotion, EASINGS } from '../../../lib/motion.js';
import { pauseSmoothScroll, resumeSmoothScroll } from '../../../lib/scroll-controller.js';
import { getActiveSectionState } from '../../../lib/active-section.js';

export function createMobileMenu({ onNavigate }) {
  const currentLang = () => getLang();
  let isOpen = false;

  // Hamburger button (min 44x44px touch target)
  const hamburgerBtn = h('button', {
    type: 'button',
    'aria-label': 'Open navigation menu',
    'aria-expanded': 'false',
    'aria-controls': 'mobile-navigation-sheet',
    class: 'hamburger-btn touch-target lg:hidden p-2 rounded-lg border border-line bg-surface/80 text-fg hover:bg-raised transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent shrink-0'
  });

  const barTop = h('div', { class: 'hamburger-bar hamburger-bar-top' });
  const barBottom = h('div', { class: 'hamburger-bar hamburger-bar-bottom' });
  hamburgerBtn.appendChild(barTop);
  hamburgerBtn.appendChild(barBottom);

  // Full screen sheet overlay (100dvh) - strictly display: none when closed
  const sheet = h('div', {
    id: 'mobile-navigation-sheet',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Mobile site navigation',
    'data-lenis-prevent': '',
    style: 'display: none;',
    class: 'mobile-sheet-content fixed inset-0 z-[70] bg-canvas/92 backdrop-blur-2xl p-6 flex flex-col justify-between overflow-y-auto opacity-0 pointer-events-none'
  });

  function renderSheet() {
    sheet.innerHTML = '';

    // Sheet top bar
    const sheetHeader = h('div', { class: 'flex items-center justify-between pb-6 border-b border-line' },
      h('div', { class: 'flex items-center gap-2.5 font-semibold text-fg' },
        h('span', { class: 'flex h-7 w-7 items-center justify-center rounded-lg bg-fg text-canvas font-mono font-bold text-xs' }, 'PT'),
        h('span', { class: 'text-base font-semibold tracking-tight' }, 'PTaaS Cloud')
      ),
      h('button', {
        type: 'button',
        'aria-label': 'Close navigation menu',
        class: 'touch-target h-10 w-10 rounded-lg border border-line bg-surface flex items-center justify-center text-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-accent cursor-pointer',
        onClick: closeMenu
      }, icon('x', 'w-5 h-5'))
    );

    // Staggered Navigation Links
    const navList = h('nav', { class: 'flex flex-col gap-2 py-6 text-base font-medium' });
    const { sectionId: activeSectionId, navId: activeNavId } = getActiveSectionState();

    NAV_CONFIG.forEach((item) => {
      if (item.hasDropdown) {
        const isGroupActive = activeNavId === item.id;
        // Group header
        navList.appendChild(h('div', {
          class: `pt-2 pb-1 text-xs font-mono uppercase tracking-wider ${isGroupActive ? 'text-fg font-semibold' : 'text-muted'}`
        },
          currentLang() === 'id' ? item.labelId : item.labelEn
        ));
        item.children.forEach(child => {
          const isChildActive = activeSectionId === child.id;
          const a = h('a', {
            href: child.href,
            'aria-current': isChildActive ? 'location' : undefined,
            class: `flex items-center gap-3 py-2.5 px-3 rounded-lg transition-colors cursor-pointer ${
              isChildActive ? 'bg-raised text-fg font-semibold' : 'hover:bg-raised text-fg'
            }`,
            onClick: (e) => {
              e.preventDefault();
              closeMenu();
              if (onNavigate) onNavigate(child.href);
            }
          },
            icon(child.icon, 'w-4 h-4 text-accent shrink-0'),
            h('span', {}, currentLang() === 'id' ? child.labelId : child.labelEn),
            isChildActive ? h('span', { class: 'ml-auto h-1.5 w-1.5 rounded-full bg-accent', 'aria-hidden': 'true' }) : null
          );
          navList.appendChild(a);
        });
      } else {
        const isItemActive = activeNavId === item.id;
        const a = h('a', {
          href: item.href,
          'aria-current': isItemActive ? 'location' : undefined,
          class: `py-2.5 px-3 rounded-lg transition-colors cursor-pointer text-lg font-semibold flex items-center justify-between ${
            isItemActive ? 'bg-raised text-fg' : 'hover:bg-raised text-fg'
          }`,
          onClick: (e) => {
            if (!item.isRoute) e.preventDefault();
            closeMenu();
            if (onNavigate) onNavigate(item.href, item.isRoute);
          }
        },
          h('span', {}, currentLang() === 'id' ? item.labelId : item.labelEn),
          isItemActive ? h('span', { class: 'h-2 w-2 rounded-full bg-accent', 'aria-hidden': 'true' }) : null
        );
        navList.appendChild(a);
      }
    });

    // Sheet Bottom Controls (Toggles + Full-width CTA)
    const sheetBottom = h('div', { class: 'pt-6 border-t border-line space-y-4' },
      h('div', { class: 'flex items-center justify-between' },
        h('div', { class: 'flex items-center gap-2' },
          h('button', {
            type: 'button',
            class: 'touch-target h-9 px-3 rounded-lg border border-line bg-surface text-xs font-mono font-medium text-fg flex items-center gap-2 cursor-pointer',
            onClick: () => {
              toggleLang();
              renderSheet();
            }
          },
            icon('languages', 'w-3.5 h-3.5 text-muted'),
            h('span', {}, currentLang().toUpperCase())
          ),
          createThemeToggle()
        ),
        h('span', { class: 'text-xs font-mono text-muted flex items-center gap-1.5' },
          h('span', { class: 'h-2 w-2 rounded-full bg-accent animate-pulse' }),
          '99.98% uptime'
        )
      ),
      button({
        label: currentLang() === 'id' ? 'Masuk ke Platform' : 'Sign in to Platform',
        variant: 'primary',
        size: 'lg',
        href: '/login',
        class: 'w-full justify-center',
        onClick: closeMenu
      })
    );

    sheet.appendChild(sheetHeader);
    sheet.appendChild(navList);
    sheet.appendChild(sheetBottom);
  }

  let sheetAnim = null;
  function openMenu() {
    isOpen = true;
    renderSheet();
    sheet.style.display = 'flex';
    sheet.classList.remove('pointer-events-none');
    sheet.classList.add('pointer-events-auto');
    hamburgerBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    pauseSmoothScroll();
    sheetAnim?.stop?.();
    if (isReducedMotion()) {
      sheet.style.opacity = '1';
      sheet.style.transform = 'translateY(0)';
    } else {
      loadMotionMini().then(({ animate }) => {
        if (!isOpen) return;
        sheetAnim = animate(sheet, { opacity: [0, 1], y: [-16, 0] }, { duration: 0.24, ease: EASINGS.expoOut });
        const links = sheet.querySelectorAll('nav a');
        links.forEach((link, idx) => {
          animate(link, { opacity: [0.001, 1], y: [8, 0] }, { duration: 0.25, delay: 0.04 + idx * 0.04, ease: EASINGS.expoOut });
        });
      }).catch(() => {
        sheet.style.opacity = '1';
      });
    }
    document.addEventListener('keydown', onKey);
  }

  function closeMenu() {
    isOpen = false;
    sheet.classList.add('pointer-events-none');
    sheet.classList.remove('pointer-events-auto');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    resumeSmoothScroll();
    document.removeEventListener('keydown', onKey);
    sheetAnim?.stop?.();
    if (isReducedMotion()) {
      sheet.style.opacity = '0';
      sheet.style.display = 'none';
    } else {
      loadMotionMini().then(({ animate }) => {
        if (isOpen) return;
        sheetAnim = animate(sheet, { opacity: 0, y: -12 }, {
          duration: 0.18,
          ease: 'easeIn',
          onComplete: () => { if (!isOpen) sheet.style.display = 'none'; }
        });
      }).catch(() => {
        sheet.style.opacity = '0';
        sheet.style.display = 'none';
      });
    }
    hamburgerBtn.focus();
  }

  function onKey(e) {
    if (e.key === 'Escape') closeMenu();
  }

  hamburgerBtn.addEventListener('click', () => {
    if (isOpen) closeMenu();
    else openMenu();
  });

  return {
    hamburgerBtn,
    sheet,
    close: closeMenu
  };
}
