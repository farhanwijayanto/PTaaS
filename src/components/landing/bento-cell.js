import { h } from '../../lib/dom.js';

export function bentoCell({ size = '1x1', eyebrow, title, description, visual, class: extraClass = '' }) {
  let spanClass = 'col-span-1';
  if (size === '2x1') spanClass = 'col-span-1 md:col-span-2';
  if (size === '2x2') spanClass = 'col-span-1 md:col-span-2 md:row-span-2';
  if (size === '3x1') spanClass = 'col-span-1 md:col-span-3';

  const spotlight = h('div', {
    class: 'bento-spotlight',
    'aria-hidden': 'true',
    'data-decor': 'bento-spotlight'
  });

  const cell = h('div', {
    class: `bento-cell flex flex-col justify-between p-6 sm:p-7 ${spanClass} ${extraClass}`
  },
    spotlight,
    h('div', { class: 'relative z-10 space-y-2 mb-4' },
      eyebrow
        ? h('span', {
            class: 'text-xs font-mono tracking-[0.06em] uppercase font-semibold block',
            style: 'color: var(--accent-text);'
          }, eyebrow)
        : null,
      h('h3', { class: 'text-base font-semibold tracking-tight', style: 'color: var(--text-primary);' }, title),
      description
        ? h('p', { class: 'text-xs leading-relaxed max-w-md', style: 'color: var(--text-secondary);' }, description)
        : null
    ),
    h('div', { class: 'relative z-10 flex-1 flex flex-col justify-end' }, visual)
  );

  // Spotlight effect tracking cursor
  cell.addEventListener('mousemove', (e) => {
    const rect = cell.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    cell.style.setProperty('--mouse-x', `${x}px`);
    cell.style.setProperty('--mouse-y', `${y}px`);
  }, { passive: true });

  return cell;
}
