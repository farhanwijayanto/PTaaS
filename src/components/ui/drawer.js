import { h, uid } from '../../lib/dom.js';
import { t } from '../../lib/i18n.js';
import { button } from './button.js';
import { mountOverlay } from './overlay.js';

// Right-side drawer. `body` and `footer` are Nodes. Returns { close, body } so callers can swap steps.
export function openDrawer({ title, description, body, footer, width = 'max-w-[480px]', onClose }) {
  const id = uid('drw');
  let overlay;
  const bodyHost = h('div', { class: 'flex-1 overflow-y-auto px-6 py-6' }, body);
  const footerHost = h('div', { class: 'border-t border-line px-6 py-4' }, footer);

  const panel = h('aside', {
    role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': `${id}-title`,
    class: `slide-in flex h-full w-full ${width} flex-col border-l border-line bg-surface`
  },
    h('header', { class: 'flex items-start justify-between gap-4 border-b border-line px-6 py-4' },
      h('div', {},
        h('h2', { id: `${id}-title`, class: 't-section' }, title),
        description && h('p', { class: 'mt-1 text-sm text-muted' }, description)),
      button({ icon: 'x', variant: 'ghost', size: 'icon', ariaLabel: t('common.close'), onClick: () => overlay.close() })),
    bodyHost,
    footer ? footerHost : null);

  overlay = mountOverlay({ content: panel, variant: 'drawer', onClose });
  return {
    close: overlay.close,
    setBody: (node) => bodyHost.replaceChildren(node),
    setFooter: (node) => footerHost.replaceChildren(node)
  };
}
