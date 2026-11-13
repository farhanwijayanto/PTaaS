import { h, cx } from '../../lib/dom.js';

// columns: [{ key, label, render?(row), class?, srOnly? }]
export function table({ columns, rows, rowKey = (r) => r.id, caption }) {
  const head = h('thead', { class: 'border-b border-line' },
    h('tr', {}, columns.map((c) =>
      h('th', { scope: 'col', class: cx('px-4 py-2.5 text-left text-xs font-medium text-subtle', c.class) },
        c.srOnly ? h('span', { class: 'sr-only' }, c.label) : c.label))));

  const body = h('tbody', { class: 'divide-y divide-line' },
    rows.map((row) =>
      h('tr', { class: 'transition-colors duration-150 hover:bg-raised/60', 'data-row': rowKey(row) },
        columns.map((c) => h('td', { class: cx('px-4 py-3 align-middle text-sm', c.class) }, c.render ? c.render(row) : row[c.key])))));

  return h('div', { class: 'overflow-x-auto rounded-xl border border-line bg-surface' },
    h('table', { class: 'w-full min-w-[560px] border-collapse' },
      caption && h('caption', { class: 'sr-only' }, caption), head, body));
}
