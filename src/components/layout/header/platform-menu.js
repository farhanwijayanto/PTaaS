import { h, icon } from '../../../lib/dom.js';
import { getLang } from '../../../lib/i18n.js';
import { loadMotionMini, isReducedMotion, EASINGS } from '../../../lib/motion.js';

export function createPlatformMenu({ item, onSelect }) {
  const currentLang = () => getLang();
  let isOpen = false;
  let hoverTimer = null;

  const container = h('div', { class: 'relative inline-block' });

  // Trigger link / button
  const trigger = h('button', {
    type: 'button',
    'aria-haspopup': 'true',
    'aria-expanded': 'false',
    'aria-controls': 'platform-dropdown',
    class: 'nav-item-btn touch-target h-9 px-3 text-sm font-medium text-muted hover:text-fg transition-colors duration-150 flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg select-none'
  });

  const labelSpan = h('span', {}, currentLang() === 'id' ? item.labelId : item.labelEn);
  const chevron = icon('chevron-down', 'w-3.5 h-3.5 text-muted transition-transform duration-200');

  trigger.appendChild(labelSpan);
  trigger.appendChild(chevron);

  // Hover bridge so diagonal mouse travel doesn't close it
  const bridge = h('div', { class: 'hover-bridge' });

  // Dropdown panel
  const panel = h('div', {
    id: 'platform-dropdown',
    role: 'menu',
    'aria-label': 'Platform features menu',
    'data-lenis-prevent': '',
    class: 'absolute left-1/2 -translate-x-1/2 top-full mt-2 w-80 rounded-xl border border-line/80 bg-surface/85 backdrop-blur-xl p-2 shadow-2xl z-[60] opacity-0 pointer-events-none'
  });

  panel.appendChild(bridge);

  const childDots = new Map();
  const menuItems = item.children.map((child, index) => {
    const dot = h('span', {
      class: 'ml-auto mt-1 h-1.5 w-1.5 rounded-full bg-accent shrink-0 opacity-0 transition-opacity',
      'aria-hidden': 'true'
    });
    childDots.set(child.id, dot);
    const link = h('a', {
      href: child.href,
      role: 'menuitem',
      tabindex: '-1',
      class: 'flex items-start gap-3 p-2.5 rounded-lg text-left hover:bg-raised/70 transition-colors cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      onClick: (e) => {
        e.preventDefault();
        closeDropdown();
        if (onSelect) onSelect(child.href);
      },
      onKeyDown: (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const next = (index + 1) % menuItems.length;
          menuItems[next].focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = (index - 1 + menuItems.length) % menuItems.length;
          menuItems[prev].focus();
        } else if (e.key === 'Escape') {
          closeDropdown();
          trigger.focus();
        }
      }
    },
      h('div', { class: 'p-2 rounded-md bg-canvas border border-line group-hover:border-line-strong text-accent shrink-0' },
        icon(child.icon, 'w-4 h-4')
      ),
      h('div', { class: 'space-y-0.5 flex-1 min-w-0' },
        h('span', { class: 'text-xs font-semibold text-fg block tracking-tight group-hover:text-accent transition-colors' },
          currentLang() === 'id' ? child.labelId : child.labelEn
        ),
        h('span', { class: 'text-[11px] text-muted block leading-snug whitespace-normal' },
          currentLang() === 'id' ? child.descId : child.descEn
        )
      ),
      dot
    );
    panel.appendChild(link);
    return link;
  });

  let panelAnim = null;
  function openDropdown() {
    clearTimeout(hoverTimer);
    isOpen = true;
    panel.classList.remove('pointer-events-none');
    panel.classList.add('pointer-events-auto');
    trigger.setAttribute('aria-expanded', 'true');
    chevron.style.transform = 'rotate(180deg)';
    panelAnim?.stop?.();
    if (isReducedMotion()) {
      panel.style.opacity = '1';
      panel.style.transform = 'translateX(-50%) translateY(0) scale(1)';
    } else {
      loadMotionMini().then(({ animate }) => {
        if (!isOpen) return;
        panelAnim = animate(panel, { opacity: [0, 1], scale: [0.98, 1], y: [6, 0] }, { duration: 0.18, ease: EASINGS.expoOut });
      }).catch(() => {
        panel.style.opacity = '1';
      });
    }
    document.addEventListener('click', onOutsideClick);
    document.addEventListener('keydown', onEsc);
  }

  function closeDropdown() {
    clearTimeout(hoverTimer);
    isOpen = false;
    panel.classList.add('pointer-events-none');
    panel.classList.remove('pointer-events-auto');
    trigger.setAttribute('aria-expanded', 'false');
    chevron.style.transform = 'rotate(0deg)';
    panelAnim?.stop?.();
    if (isReducedMotion()) {
      panel.style.opacity = '0';
    } else {
      loadMotionMini().then(({ animate }) => {
        if (isOpen) return;
        panelAnim = animate(panel, { opacity: 0, scale: 0.98, y: 6 }, { duration: 0.14, ease: 'easeIn' });
      }).catch(() => {
        panel.style.opacity = '0';
      });
    }
    document.removeEventListener('click', onOutsideClick);
    document.removeEventListener('keydown', onEsc);
  }

  function onOutsideClick(e) {
    if (!container.contains(e.target)) closeDropdown();
  }

  function onEsc(e) {
    if (e.key === 'Escape') {
      closeDropdown();
      trigger.focus();
    }
  }

  // Hover with 120ms intent delay
  container.addEventListener('mouseenter', () => {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(openDropdown, 120);
  });
  container.addEventListener('mouseleave', () => {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(closeDropdown, 150);
  });

  // Click & keyboard activation
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isOpen) closeDropdown();
    else openDropdown();
  });

  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openDropdown();
      if (menuItems[0]) menuItems[0].focus();
    }
  });

  container.appendChild(trigger);
  container.appendChild(panel);

  return {
    element: container,
    trigger,
    setActive: (active, activeChildId = null) => {
      if (active) {
        trigger.classList.remove('text-muted');
        trigger.classList.add('text-fg', 'font-semibold');
      } else {
        trigger.classList.remove('text-fg', 'font-semibold');
        trigger.classList.add('text-muted');
      }
      childDots.forEach((dot, childId) => {
        dot.style.opacity = active && childId === activeChildId ? '1' : '0';
      });
    }
  };
}
