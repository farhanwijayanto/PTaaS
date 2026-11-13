import { h, icon } from '../../../lib/dom.js';
import { getLang, setLang } from '../../../lib/i18n.js';
import { loadMotionMini, isReducedMotion, EASINGS } from '../../../lib/motion.js';

export function createLangMenu() {
  const currentLang = () => getLang();
  let isOpen = false;

  const container = h('div', { class: 'relative inline-block' });

  const trigger = h('button', {
    type: 'button',
    'aria-label': currentLang() === 'id' ? 'Ubah bahasa (Sekarang: ID)' : 'Switch language (Current: EN)',
    'aria-haspopup': 'true',
    'aria-expanded': 'false',
    class: 'touch-target h-9 px-2.5 rounded-lg border border-line bg-surface/80 text-xs font-mono font-medium text-fg hover:bg-raised hover:border-line-strong transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent flex items-center gap-1.5 shrink-0'
  });

  const langIcon = icon('languages', 'w-3.5 h-3.5 text-muted');
  const labelSpan = h('span', { class: 'font-semibold uppercase tracking-wider' }, currentLang());
  const chevronIcon = icon('chevron-down', 'w-3 h-3 text-muted transition-transform duration-200');

  trigger.appendChild(langIcon);
  trigger.appendChild(labelSpan);
  trigger.appendChild(chevronIcon);

  // Small dropdown popover - display: none when closed
  const menu = h('div', {
    style: 'display: none;',
    'data-lenis-prevent': '',
    class: 'absolute right-0 top-full mt-1.5 w-28 rounded-lg border border-line bg-surface p-1 shadow-xl z-50 opacity-0 pointer-events-none origin-top-right',
    role: 'menu',
    'aria-label': 'Language choices'
  });

  const options = [
    { code: 'en', label: 'English', short: 'EN' },
    { code: 'id', label: 'Bahasa ID', short: 'ID' }
  ];

  options.forEach(opt => {
    const isCur = currentLang() === opt.code;
    const item = h('button', {
      type: 'button',
      role: 'menuitem',
      class: `w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
        isCur ? 'bg-raised text-fg font-semibold' : 'text-muted hover:text-fg hover:bg-raised/60'
      }`,
      onClick: () => {
        setLang(opt.code);
        labelSpan.textContent = opt.code.toUpperCase();
        closeMenu();
      }
    },
      h('span', {}, opt.label),
      isCur ? icon('check', 'w-3.5 h-3.5 text-accent') : null
    );
    menu.appendChild(item);
  });

  let menuAnim = null;
  function openMenu() {
    isOpen = true;
    menu.style.display = 'block';
    menu.classList.remove('pointer-events-none');
    menu.classList.add('pointer-events-auto');
    trigger.setAttribute('aria-expanded', 'true');
    chevronIcon.style.transform = 'rotate(180deg)';
    menuAnim?.stop?.();
    if (isReducedMotion()) {
      menu.style.opacity = '1';
      menu.style.transform = 'scale(1) translateY(0)';
    } else {
      loadMotionMini().then(({ animate }) => {
        if (!isOpen) return;
        menuAnim = animate(menu, { opacity: [0, 1], scale: [0.96, 1], y: [4, 0] }, { duration: 0.16, ease: EASINGS.expoOut });
      }).catch(() => {
        menu.style.opacity = '1';
      });
    }
    document.addEventListener('click', onOutsideClick);
    document.addEventListener('keydown', onEsc);
  }

  function closeMenu() {
    isOpen = false;
    menu.classList.add('pointer-events-none');
    menu.classList.remove('pointer-events-auto');
    trigger.setAttribute('aria-expanded', 'false');
    chevronIcon.style.transform = 'rotate(0deg)';
    document.removeEventListener('click', onOutsideClick);
    document.removeEventListener('keydown', onEsc);
    menuAnim?.stop?.();
    if (isReducedMotion()) {
      menu.style.opacity = '0';
      menu.style.display = 'none';
    } else {
      loadMotionMini().then(({ animate }) => {
        if (isOpen) return;
        menuAnim = animate(menu, { opacity: 0, scale: 0.96, y: 4 }, {
          duration: 0.14,
          ease: 'easeIn',
          onComplete: () => { if (!isOpen) menu.style.display = 'none'; }
        });
      }).catch(() => {
        menu.style.opacity = '0';
        menu.style.display = 'none';
      });
    }
  }

  function onOutsideClick(e) {
    if (!container.contains(e.target)) closeMenu();
  }

  function onEsc(e) {
    if (e.key === 'Escape') {
      closeMenu();
      trigger.focus();
    }
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isOpen) closeMenu();
    else openMenu();
  });

  container.appendChild(trigger);
  container.appendChild(menu);

  return container;
}
