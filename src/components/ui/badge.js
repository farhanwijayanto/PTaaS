import { h, cx } from '../../lib/dom.js';

const tones = {
  neutral: 'bg-raised text-muted',
  accent: 'bg-accent/10 text-accent',
  warn: 'bg-warn/10 text-warn',
  danger: 'bg-danger/10 text-danger'
};

export function badge({ label, tone = 'neutral', dot = false }) {
  return h(
    'span',
    { class: cx('inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-xs font-medium', tones[tone]) },
    dot && h('span', { class: 'h-1.5 w-1.5 rounded-full bg-current', 'aria-hidden': 'true' }),
    label
  );
}
