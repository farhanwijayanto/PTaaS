import { h, icon, cx } from '../../lib/dom.js';

const control =
  'h-9 w-full rounded-lg border bg-surface px-3 text-sm text-fg placeholder:text-subtle ' +
  'transition-colors duration-150 hover:border-line-strong disabled:opacity-50';

export function input({
  id, name, type = 'text', placeholder, value = '', required, autocomplete,
  invalid, ariaLabel, describedBy, mono, onInput, attrs = {}
}) {
  const el = h('input', {
    id, name, type, placeholder, required, autocomplete,
    'aria-label': ariaLabel,
    'aria-invalid': invalid ? 'true' : undefined,
    'aria-describedby': describedBy,
    class: cx(control, invalid ? 'border-danger' : 'border-line', mono && 'font-mono'),
    ...attrs
  });
  el.value = value;
  if (onInput) el.addEventListener('input', () => onInput(el.value, el));
  return el;
}

export function searchInput({ placeholder, ariaLabel, onInput, class: extra }) {
  const control_ = input({ type: 'search', placeholder, ariaLabel, onInput, class: '', attrs: { class: cx(control, 'border-line pl-9') } });
  const wrapper = h('div', { class: cx('relative w-full sm:w-64', extra) },
    icon('search', 'pointer-events-none absolute left-3 top-2.5 w-4 h-4 text-subtle'), control_);
  wrapper.control = control_;
  return wrapper;
}

export function select({ id, options, value, onChange, ariaLabel, class: extra }) {
  const el = h('select', {
    id, 'aria-label': ariaLabel,
    class: cx(control, 'cursor-pointer appearance-none border-line pr-9')
  }, options.map((o) => h('option', { value: o.value }, o.label)));
  el.value = value ?? options[0]?.value;
  if (onChange) el.addEventListener('change', () => onChange(el.value));
  const wrapper = h('div', { class: cx('relative w-full sm:w-44', extra) },
    el, icon('chevron-down', 'pointer-events-none absolute right-3 top-2.5 w-4 h-4 text-subtle'));
  wrapper.control = el;
  return wrapper;
}

// Label + control + hint/error. Pass the control's id as `id` and set aria-describedby yourself.
export function field({ label, id, hint, error, control: ctl, optional }) {
  return h('div', { class: 'space-y-1.5' },
    label && h('label', { for: id, class: 'block text-sm font-medium text-fg' }, label,
      optional && h('span', { class: 'ml-1 font-normal text-subtle' }, `(${optional})`)),
    ctl,
    hint && !error && h('p', { id: `${id}-hint`, class: 't-caption' }, hint),
    error && h('p', { id: `${id}-err`, class: 'text-xs text-danger', role: 'alert' }, error));
}
