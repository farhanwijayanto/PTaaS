import { h, icon, cx } from '../../lib/dom.js';
import { t } from '../../lib/i18n.js';

const kinds = {
  success: { name: 'circle-check', color: 'text-accent' },
  error: { name: 'circle-alert', color: 'text-danger' },
  info: { name: 'info', color: 'text-muted' }
};

export function toast(opts) {
  if (typeof opts === 'string') opts = { title: opts };
  const { title, description, kind = 'info', duration = 4000 } = opts;
  const host = document.getElementById('toasts');
  if (!host) return;
  const k = kinds[kind] ?? kinds.info;

  const el = h('div', {
    class: 'pop-in pointer-events-auto flex w-80 max-w-[calc(100vw-2rem)] items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3'
  },
    icon(k.name, cx('mt-0.5 w-4 h-4 shrink-0', k.color)),
    h('div', { class: 'min-w-0 flex-1' },
      h('p', { class: 'text-sm font-medium' }, title),
      description && h('p', { class: 'mt-0.5 text-sm text-muted' }, description)),
    h('button', {
      type: 'button', 'aria-label': t('common.close'),
      class: 'rounded p-0.5 text-subtle transition-colors duration-150 hover:text-fg',
      onClick: () => dismiss()
    }, icon('x', 'w-4 h-4')));

  host.append(el);
  const timer = setTimeout(dismiss, duration);
  function dismiss() {
    clearTimeout(timer);
    el.style.transition = 'opacity 150ms ease-out';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 150);
  }
}

toast.success = (title, description) => toast({ title, description, kind: 'success' });
toast.error = (title, description) => toast({ title, description, kind: 'error' });
toast.info = (title, description) => toast({ title, description, kind: 'info' });
toast.warn = (title, description) => toast({ title, description, kind: 'error' });
