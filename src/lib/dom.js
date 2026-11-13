// Tiny hyperscript helper: h('div', { class: 'x', onClick }, child, [children])
// Text is always inserted as text nodes, so there is no HTML injection path.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return el;
}

// Lucide icon placeholder; the observer in app/main.js swaps it for an <svg>.
export function icon(name, cls = 'w-4 h-4') {
  return h('i', { 'data-lucide': name, class: cls, 'aria-hidden': 'true' });
}

export const cx = (...parts) => parts.filter(Boolean).join(' ');

let uidCounter = 0;
export const uid = (prefix = 'id') => `${prefix}-${++uidCounter}`;
