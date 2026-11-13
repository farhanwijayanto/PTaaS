import { h, cx } from '../../lib/dom.js';

/**
 * Standard compact page header component for authenticated app views.
 * Replaces oversized marketing headings with clean, compact infrastructure titles.
 */
export function pageHeader({
  title,
  description,
  actions,
  tabs,
  class: extra = ''
}) {
  const titleEl = h('h1', {
    class: 'text-2xl sm:text-[26px] font-semibold tracking-tight text-fg truncate leading-tight',
    title: title
  }, title);

  const leftBlock = h('div', { class: 'min-w-0 max-w-2xl space-y-1' },
    titleEl,
    description && h('p', { class: 'text-sm text-muted leading-relaxed truncate-2 sm:truncate max-w-[640px]' }, description)
  );

  const topRow = h('div', {
    class: 'flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between'
  },
    leftBlock,
    actions && h('div', { class: 'flex items-center gap-2 shrink-0 self-start sm:self-auto' }, actions)
  );

  let tabsRow = null;
  if (tabs && tabs.length > 0) {
    tabsRow = h('nav', {
      class: 'flex items-center gap-6 border-b border-line -mb-6 mt-4 text-sm font-medium',
      'aria-label': 'Page sections'
    },
      tabs.map(tab => h('button', {
        type: 'button',
        class: cx(
          'pb-3 border-b-2 font-medium transition-colors cursor-pointer',
          tab.active
            ? 'border-accent text-fg font-semibold'
            : 'border-transparent text-muted hover:text-fg hover:border-line'
        ),
        onClick: tab.onClick
      }, tab.label))
    );
  }

  return h('div', { class: cx('pb-6 border-b border-line mb-6', extra) },
    topRow,
    tabsRow
  );
}

export const PageHeader = pageHeader;
