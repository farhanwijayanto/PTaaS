import { h, icon, cx } from '../../lib/dom.js';
import { loadMotionMini, isFinePointer, isReducedMotion } from '../../lib/motion.js';

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap select-none cursor-pointer ' +
  'transition-all duration-150 ease-out disabled:opacity-50 disabled:pointer-events-none ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas';

const variants = {
  primary: 'bg-fg text-canvas hover:bg-fg/90 active:scale-[0.98]',
  secondary: 'bg-surface text-fg border border-line hover:bg-raised hover:border-line-strong active:scale-[0.98]',
  ghost: 'text-muted hover:text-fg hover:bg-raised active:scale-[0.98]',
  danger: 'bg-danger text-canvas hover:bg-danger/90 active:scale-[0.98]',
  'danger-ghost': 'text-danger border border-line hover:bg-danger/10 active:scale-[0.98]'
};

const sizes = {
  xs: 'min-h-[36px] px-2.5 text-xs',
  sm: 'min-h-[40px] px-3.5 text-xs',
  md: 'min-h-[44px] px-4 text-sm',
  lg: 'min-h-[48px] px-6 text-base',
  icon: 'min-h-[44px] min-w-[44px] p-2'
};

export function button({
  label, icon: iconName, variant = 'secondary', size = 'md', type = 'button',
  href, onClick, disabled, ariaLabel, title, class: extra, attrs = {}
}) {
  const common = {
    class: cx(base, variants[variant], sizes[size], extra),
    'aria-label': ariaLabel,
    title,
    ...attrs
  };
  const iconEl = iconName ? icon(iconName, 'w-4 h-4 shrink-0') : null;
  const kids = [iconEl, label && h('span', {}, label)];
  const el = href
    ? h('a', { ...common, href, 'data-link': true, onClick }, kids)
    : h('button', { ...common, type, disabled, onClick }, kids);

  if (!disabled && (variant === 'primary' || variant === 'secondary') && !isReducedMotion()) {
    const isArrow = iconName === 'arrow-right';
    if (isFinePointer()) {
      el.addEventListener('pointerenter', () => {
        loadMotionMini().then(({ animate }) => {
          animate(el, { y: -1 }, { duration: 0.15, ease: 'easeOut' });
          if (isArrow && iconEl) animate(iconEl, { x: 3 }, { duration: 0.15, ease: 'easeOut' });
        }).catch(() => {});
      });
      el.addEventListener('pointerleave', () => {
        loadMotionMini().then(({ animate }) => {
          animate(el, { y: 0, scale: 1 }, { duration: 0.15, ease: 'easeOut' });
          if (isArrow && iconEl) animate(iconEl, { x: 0 }, { duration: 0.15, ease: 'easeOut' });
        }).catch(() => {});
      });
    }
    el.addEventListener('pointerdown', () => {
      loadMotionMini().then(({ animate }) => {
        animate(el, { scale: 0.98 }, { duration: 0.1, ease: 'easeOut' });
      }).catch(() => {});
    });
    el.addEventListener('pointerup', () => {
      loadMotionMini().then(({ animate }) => {
        animate(el, { scale: 1 }, { duration: 0.12, ease: 'easeOut' });
      }).catch(() => {});
    });
  }

  return el;
}
