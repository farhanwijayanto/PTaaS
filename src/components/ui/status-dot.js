import { h, cx } from '../../lib/dom.js';
import { t } from '../../lib/i18n.js';

const colors = { running: 'bg-accent', restarting: 'bg-warn', stopped: 'bg-subtle' };

// Status dot + text label (never color alone).
export function statusDot(status) {
  return h(
    'span',
    { class: 'inline-flex items-center gap-2 text-sm' },
    h('span', { class: cx('h-2 w-2 rounded-full', colors[status] ?? 'bg-subtle'), 'aria-hidden': 'true' }),
    h('span', { class: status === 'stopped' ? 'text-muted' : 'text-fg' }, t(`vm.status.${status}`))
  );
}
