import { h, cx } from '../../lib/dom.js';

export const skeleton = (cls = 'h-4 w-24') => h('div', { class: cx('skeleton rounded-md bg-raised', cls), 'aria-hidden': 'true' });

// Placeholder rows that mirror the table layout while data loads.
export function skeletonRows(count = 4) {
  return h(
    'div',
    { class: 'divide-y divide-line rounded-xl border border-line bg-surface', role: 'status', 'aria-busy': 'true' },
    Array.from({ length: count }, () =>
      h('div', { class: 'flex items-center gap-4 px-4 py-4' },
        skeleton('h-8 w-8 rounded-lg'),
        h('div', { class: 'flex-1 space-y-2' }, skeleton('h-3.5 w-40'), skeleton('h-3 w-24')),
        skeleton('hidden h-3.5 w-28 sm:block'),
        skeleton('h-3.5 w-16'))
    )
  );
}
