import { h, cx } from '../../lib/dom.js';
import { FOCUSABLE, trapFocus } from '../../lib/focus.js';

let locks = 0;

// Shared modal plumbing for Dialog, Drawer and CommandPalette:
// backdrop, focus trap, Escape, click-outside, scroll lock, focus restore.
export function mountOverlay({ content, variant = 'dialog', onClose }) {
  const layout = {
    dialog: 'grid place-items-center p-4',
    top: 'flex items-start justify-center p-4 pt-[14vh]',
    drawer: 'flex justify-end'
  }[variant];

  const backdrop = h('div', { class: cx('fixed inset-0 z-50 bg-[var(--scrim)] fade-in', layout) }, content);
  document.body.append(backdrop);
  if (locks++ === 0) document.body.style.overflow = 'hidden';

  let closed = false;
  const release = trapFocus(backdrop, { onEscape: () => close() });

  function close(result) {
    if (closed) return;
    closed = true;
    release();
    backdrop.remove();
    if (--locks === 0) document.body.style.overflow = '';
    onClose?.(result);
  }

  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) close();
  });
  queueMicrotask(() => (content.querySelector('[autofocus]') || content.querySelector(FOCUSABLE))?.focus());

  return { close, el: backdrop };
}
