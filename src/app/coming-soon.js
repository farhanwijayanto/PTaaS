import { t } from '../lib/i18n.js';
import { pageHeader } from '../components/layout/page-header.js';
import { emptyState } from '../components/ui/empty-state.js';
import { h } from '../lib/dom.js';

// Placeholder for pages that are restyled in a later step. Same shell, no dead links.
export function comingSoon({ page, step }) {
  return h('div', {},
    pageHeader({ title: t(page) }),
    emptyState({ icon: 'hammer', title: t('soon.title', { page: t(page) }), description: t('soon.desc', { n: step }) }));
}
