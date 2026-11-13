import { h } from '../../lib/dom.js';
import { t } from '../../lib/i18n.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { PageContainer } from '../../components/layout/page-container.js';

const TARGETS = [
  { metric: 'comp.m.boot', target: '< 3 min', current: '18.4 s' },
  { metric: 'comp.m.connect', target: '< 30 s', current: '1.8 s' },
  { metric: 'comp.m.leaks', target: '0', current: '0' },
  { metric: 'comp.m.egress', target: '100%', current: '100%' }
];

// The NIST block that used to crowd the dashboard.
export function CompliancePage() {
  return PageContainer({ variant: 'default' },
    pageHeader({ title: t('comp.title'), description: t('comp.desc') }),

    h('section', { 'aria-labelledby': 'comp-targets' },
      h('h2', { id: 'comp-targets', class: 't-section mb-3' }, t('comp.targets')),
      h('div', { class: 'overflow-x-auto' },
        h('table', { class: 'w-full min-w-[420px] border-y border-line text-sm' },
          h('thead', {}, h('tr', { class: 'border-b border-line text-left text-xs text-subtle' },
            h('th', { class: 'py-2.5 pr-4 font-medium', scope: 'col' }, t('comp.col.metric')),
            h('th', { class: 'px-4 py-2.5 font-medium', scope: 'col' }, t('comp.col.target')),
            h('th', { class: 'py-2.5 pl-4 font-medium', scope: 'col' }, t('comp.col.current')))),
          h('tbody', { class: 'divide-y divide-line' }, TARGETS.map((row) =>
            h('tr', {},
              h('td', { class: 'py-3 pr-4' }, t(row.metric)),
              h('td', { class: 'px-4 py-3 font-mono text-muted' }, row.target),
              h('td', { class: 'py-3 pl-4 font-mono text-accent' }, row.current))))))),

    h('section', { class: 'mt-12', 'aria-labelledby': 'comp-nist' },
      h('h2', { id: 'comp-nist', class: 't-section mb-3' }, t('comp.nist')),
      h('ol', { class: 'divide-y divide-line border-y border-line' }, [1, 2, 3, 4, 5].map((n) =>
        h('li', { class: 'grid gap-1 py-4 sm:grid-cols-[220px_1fr] sm:gap-8' },
          h('p', { class: 'text-sm font-medium' }, `${n}. ${t(`comp.c${n}`)}`),
          h('p', { class: 'text-sm text-muted' }, t(`comp.c${n}d`)))))));
}
