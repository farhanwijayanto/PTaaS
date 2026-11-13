import { h, cx, uid } from '../../lib/dom.js';

// items: [{ id, label, count? }]. Arrow keys move between tabs (roving tabindex).
export function tabs({ items, value, onChange, ariaLabel }) {
  const group = uid('tabs');
  let current = value ?? items[0].id;
  const list = h('div', { role: 'tablist', 'aria-label': ariaLabel, class: 'flex gap-1 border-b border-line' });

  const render = () => {
    list.replaceChildren(...items.map((item) => {
      const selected = item.id === current;
      return h('button', {
        type: 'button', role: 'tab', id: `${group}-${item.id}`,
        'aria-selected': String(selected), tabindex: selected ? '0' : '-1',
        class: cx(
          '-mb-px flex h-9 items-center gap-2 border-b-2 px-3 text-sm transition-colors duration-150',
          selected ? 'border-fg text-fg' : 'border-transparent text-muted hover:text-fg'),
        onClick: () => select(item.id)
      }, item.label, item.count != null && h('span', { class: 'rounded-full bg-raised px-1.5 text-xs text-muted' }, item.count));
    }));
  };

  function select(id, focus = false) {
    current = id;
    render();
    if (focus) list.querySelector('[aria-selected="true"]')?.focus();
    onChange?.(id);
  }

  list.addEventListener('keydown', (e) => {
    const index = items.findIndex((i) => i.id === current);
    let next = null;
    if (e.key === 'ArrowRight') next = items[(index + 1) % items.length];
    if (e.key === 'ArrowLeft') next = items[(index - 1 + items.length) % items.length];
    if (e.key === 'Home') next = items[0];
    if (e.key === 'End') next = items[items.length - 1];
    if (next) { e.preventDefault(); select(next.id, true); }
  });

  render();
  list.setCount = (id, count) => { items.find((i) => i.id === id).count = count; render(); };
  return list;
}
