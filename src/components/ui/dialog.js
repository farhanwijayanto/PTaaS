import { h, uid } from '../../lib/dom.js';
import { t } from '../../lib/i18n.js';
import { button } from './button.js';
import { input } from './input.js';
import { mountOverlay } from './overlay.js';

// Resolves true only if the user confirms. Pass `confirmText` to require typing it first.
export function confirmDialog({ title, description, confirmLabel, cancelLabel, danger = false, confirmText }) {
  return new Promise((resolve) => {
    const id = uid('dlg');
    let overlay;

    const confirm = button({
      label: confirmLabel ?? t('common.confirm'),
      variant: danger ? 'danger' : 'primary',
      disabled: !!confirmText,
      onClick: () => overlay.close(true)
    });
    const cancel = button({ label: cancelLabel ?? t('common.cancel'), variant: 'secondary', onClick: () => overlay.close(false) });

    const typed = confirmText && input({
      id: `${id}-confirm`, placeholder: confirmText, autocomplete: 'off', mono: true,
      onInput: (value) => { confirm.disabled = value.trim() !== confirmText; }
    });

    const panel = h('div', {
      role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': `${id}-title`, 'aria-describedby': `${id}-desc`,
      class: 'pop-in w-full max-w-md rounded-xl border border-line bg-surface p-6'
    },
      h('h2', { id: `${id}-title`, class: 't-section' }, title),
      description && h('p', { id: `${id}-desc`, class: 'mt-2 text-sm text-muted' }, description),
      confirmText && h('div', { class: 'mt-4' },
        h('label', { for: `${id}-confirm`, class: 'mb-1.5 block text-xs text-subtle' }, t('dialog.typeToConfirm', { text: confirmText })),
        typed),
      h('div', { class: 'mt-6 flex justify-end gap-2' }, cancel, confirm));

    overlay = mountOverlay({ content: panel, onClose: (result) => resolve(result === true) });
  });
}

// General-purpose dialog. `body` is a Node; `actions` is an array of buttons built by the caller.
export function openDialog({ title, description, body, actions = [], width = 'max-w-md' }) {
  const id = uid('dlg');
  let overlay;
  const panel = h('div', {
    role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': `${id}-title`,
    class: `pop-in w-full ${width} rounded-xl border border-line bg-surface p-6`
  },
    h('h2', { id: `${id}-title`, class: 't-section' }, title),
    description && h('p', { class: 'mt-2 text-sm text-muted' }, description),
    body && h('div', { class: 'mt-4' }, body),
    actions.length ? h('div', { class: 'mt-6 flex justify-end gap-2' }, actions) : null);
  overlay = mountOverlay({ content: panel });
  return overlay;
}
