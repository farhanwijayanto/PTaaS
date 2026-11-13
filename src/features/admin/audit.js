import { h } from '../../lib/dom.js';
import { t } from '../../lib/i18n.js';
import { api } from '../../lib/api.js';
import { on } from '../../lib/events.js';
import { onCleanup } from '../../lib/router.js';
import { button } from '../../components/ui/button.js';
import { searchInput, select } from '../../components/ui/input.js';
import { table } from '../../components/ui/table.js';
import { badge } from '../../components/ui/badge.js';
import { skeletonRows } from '../../components/ui/skeleton.js';
import { emptyState, errorState } from '../../components/ui/empty-state.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { PageContainer } from '../../components/layout/page-container.js';
import { toast } from '../../components/ui/toast.js';

export function AuditLogPage() {
  let allLogs = [];
  let state = 'loading';
  let query = '';
  let actionFilter = 'all';

  const host = h('div', { 'aria-live': 'polite' });

  const search = searchInput({
    placeholder: 'Filter by actor or target…',
    ariaLabel: 'Search audit log',
    onInput: (v) => { query = v.trim().toLowerCase(); draw(); }
  });

  const actionSelect = select({
    ariaLabel: 'Filter action', value: 'all',
    onChange: (v) => { actionFilter = v; draw(); },
    options: [
      { value: 'all', label: 'All actions' },
      { value: 'VM_START', label: 'VM_START' },
      { value: 'VM_STOP', label: 'VM_STOP' },
      { value: 'VM_DELETE', label: 'VM_DELETE' },
      { value: 'OUTBOUND_DROP', label: 'OUTBOUND_DROP' },
      { value: 'INTER_TENANT_BLOCK', label: 'INTER_TENANT_BLOCK' },
      { value: 'MFA_AUTH', label: 'MFA_AUTH' }
    ]
  });

  const exportBtn = button({
    label: t('audit.export'), icon: 'download', variant: 'secondary',
    onClick: exportCsv
  });

  const columns = [
    {
      key: 'time', label: t('audit.col.time'), class: 'w-48 font-mono text-xs text-muted',
      render: (e) => new Date(e.time).toLocaleString()
    },
    { key: 'actor', label: t('audit.col.actor'), render: (e) => h('span', { class: 'font-medium text-fg' }, e.actor) },
    { key: 'action', label: t('audit.col.action'), render: (e) => h('span', { class: 'font-mono text-xs text-accent' }, e.action) },
    { key: 'target', label: t('audit.col.target'), render: (e) => h('span', { class: 'font-mono text-xs text-muted' }, e.target) },
    { key: 'ip', label: t('audit.col.ip'), class: 'font-mono text-xs text-subtle', render: (e) => e.ip },
    {
      key: 'status', label: t('audit.col.status'), class: 'text-right',
      render: (e) => badge({
        label: e.status,
        tone: e.status === 'SUCCESS' ? 'accent' : e.status === 'BLOCKED' ? 'danger' : 'neutral'
      })
    }
  ];

  function draw() {
    if (state === 'loading') return host.replaceChildren(skeletonRows(5));
    if (state === 'error') return host.replaceChildren(errorState({ onRetry: load }));

    const rows = allLogs.filter((e) => {
      if (actionFilter !== 'all' && e.action !== actionFilter) return false;
      if (query && !e.actor.toLowerCase().includes(query) && !e.target.toLowerCase().includes(query) && !e.action.toLowerCase().includes(query)) return false;
      return true;
    });

    if (!rows.length) return host.replaceChildren(emptyState({ icon: 'scroll-text', title: 'No audit records match filters' }));
    host.replaceChildren(table({ columns, rows, caption: t('audit.title') }));
  }

  async function load({ silent = false } = {}) {
    if (!silent) { state = 'loading'; draw(); }
    try {
      allLogs = await api.audit.list();
      state = 'ready';
    } catch {
      if (silent) return;
      state = 'error';
    }
    draw();
  }

  function exportCsv() {
    const headers = ['Timestamp', 'Actor', 'Action', 'Target', 'IP', 'Status'];
    const rows = allLogs.map((e) => [
      `"${e.time}"`,
      `"${e.actor}"`,
      `"${e.action}"`,
      `"${e.target}"`,
      `"${e.ip}"`,
      `"${e.status}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encoded = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encoded);
    link.setAttribute('download', `ptaas-audit-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast({ title: 'Audit log exported to CSV', kind: 'success' });
  }

  onCleanup(on('audit:changed', () => load({ silent: true })));
  load();

  return PageContainer({ variant: 'default' },
    pageHeader({ title: t('audit.title'), description: t('audit.desc'), actions: exportBtn }),
    h('div', { class: 'flex flex-wrap items-center gap-2 mb-4' }, search, actionSelect),
    host);
}
