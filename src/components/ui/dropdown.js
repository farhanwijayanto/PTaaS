import { h, icon, cx } from '../../lib/dom.js';

let active = null;

export const closeMenus = () => active?.close();

// items: [{ label, icon?, onSelect, danger?, disabled?, checked? } | { type: 'separator' } | { type: 'label', label }]
// `items` may be a function so the menu reflects current state each time it opens.
export function dropdown({ trigger, items, align = 'end' }) {
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (active && active.anchor === trigger) { active.close(); return; }
    trigger.setAttribute('aria-expanded', 'true');
    active = openMenu(trigger, typeof items === 'function' ? items() : items, {
      align,
      onClose: () => trigger.setAttribute('aria-expanded', 'false')
    });
  });
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && !active) { e.preventDefault(); trigger.click(); }
  });
  return trigger;
}

function openMenu(anchor, items, { align, onClose }) {
  closeMenus();
  const menu = h('div', {
    role: 'menu', tabindex: '-1',
    class: 'menu-pop fixed z-[70] min-w-[200px] rounded-lg border border-line bg-surface p-1'
  });
  const buttons = [];

  for (const item of items) {
    if (item.type === 'separator') { menu.append(h('div', { role: 'separator', class: 'my-1 h-px bg-line' })); continue; }
    if (item.type === 'label') { menu.append(h('div', { class: 'px-2.5 py-1.5 text-xs text-subtle' }, item.label)); continue; }
    const radio = item.checked !== undefined;
    const btn = h('button', {
      type: 'button', role: radio ? 'menuitemradio' : 'menuitem',
      'aria-checked': radio ? String(!!item.checked) : undefined, disabled: item.disabled,
      class: cx(
        'flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors duration-150',
        'hover:bg-raised focus-visible:bg-raised focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40',
        item.danger ? 'text-danger' : 'text-fg'),
      onClick: () => close(true, item.onSelect)
    },
      item.icon && icon(item.icon, cx('w-4 h-4 shrink-0', item.danger ? 'text-danger' : 'text-muted')),
      h('span', { class: 'flex-1' }, item.label),
      item.checked && icon('check', 'w-4 h-4 text-accent'));
    buttons.push(btn);
    menu.append(btn);
  }

  document.body.append(menu);
  const rect = anchor.getBoundingClientRect();
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  let left = align === 'end' ? rect.right - width : rect.left;
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
  let top = rect.bottom + 4;
  if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 4);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  buttons.find((b) => !b.disabled)?.focus();

  const onPointerDown = (e) => { if (!menu.contains(e.target) && !anchor.contains(e.target)) close(); };
  const onKeyDown = (e) => {
    const enabled = buttons.filter((b) => !b.disabled);
    const index = enabled.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'Tab') close();
    else if (e.key === 'ArrowDown') { e.preventDefault(); enabled[(index + 1) % enabled.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); enabled[(index - 1 + enabled.length) % enabled.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); enabled[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); enabled[enabled.length - 1]?.focus(); }
  };
  const onDismiss = () => close();
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', onDismiss);
  window.addEventListener('scroll', onDismiss, true);

  function close(restoreFocus = false, after) {
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', onDismiss);
    window.removeEventListener('scroll', onDismiss, true);
    menu.remove();
    if (active?.menu === menu) active = null;
    onClose?.();
    if (restoreFocus && document.contains(anchor)) anchor.focus();
    after?.();
  }

  return { close, anchor, menu };
}
