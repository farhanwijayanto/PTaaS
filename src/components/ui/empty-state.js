import { h, icon } from '../../lib/dom.js';
import { t } from '../../lib/i18n.js';
import { button } from './button.js';

export function emptyState({ icon: iconName = 'inbox', title, description, action, compact = false }) {
  return h(
    'div',
    { class: `flex flex-col items-center text-center ${compact ? 'py-10' : 'py-16'}` },
    h('div', { class: 'mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-raised text-muted' }, icon(iconName, 'w-5 h-5')),
    h('h3', { class: 't-section' }, title),
    description && h('p', { class: 'mt-1.5 max-w-sm text-sm text-muted' }, description),
    action && h('div', { class: 'mt-5' }, action)
  );
}

export function errorState({ title, description, onRetry }) {
  return emptyState({
    icon: 'circle-alert',
    title: title ?? t('common.error'),
    description: description ?? t('common.errorDesc'),
    action: onRetry && button({ label: t('common.retry'), icon: 'refresh-cw', onClick: onRetry })
  });
}
