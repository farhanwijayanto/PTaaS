import { h } from '../../lib/dom.js';
import { t } from '../../lib/i18n.js';
import { api } from '../../lib/api.js';
import { on } from '../../lib/events.js';
import { onCleanup } from '../../lib/router.js';
import { useAuth } from '../../lib/auth.js';
import { button } from '../../components/ui/button.js';
import { table } from '../../components/ui/table.js';
import { skeletonRows } from '../../components/ui/skeleton.js';
import { emptyState, errorState } from '../../components/ui/empty-state.js';
import { openDialog } from '../../components/ui/dialog.js';
import { input, field, select } from '../../components/ui/input.js';
import { toast } from '../../components/ui/toast.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { PageContainer } from '../../components/layout/page-container.js';
import { userById, users } from '../../mock/users.js';

export function CohortsPage() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  let list = [];
  let state = 'loading';
  const host = h('div', {});

  const newBtn = isAdmin && button({
    label: t('cohorts.new'), icon: 'plus', variant: 'primary',
    onClick: openCreateCohortModal
  });

  const columns = [
    { key: 'id', label: t('cohorts.col.id'), render: (c) => h('span', { class: 'font-mono font-medium text-accent' }, c.id) },
    { key: 'name', label: t('cohorts.col.name'), render: (c) => h('span', { class: 'font-medium text-fg' }, c.name) },
    { key: 'instructor', label: t('cohorts.col.instructor'), render: (c) => userById(c.instructor)?.name || c.instructor || 'Unassigned' },
    { key: 'students', label: t('cohorts.col.students'), class: 'text-right font-mono', render: (c) => c.studentCount || 0 },
    {
      key: 'quota', label: 'Default Quota', class: 'hidden md:table-cell text-muted font-mono text-xs',
      render: (c) => `${c.defaultQuota?.vcpu || 8} vCPU · ${c.defaultQuota?.ram || 16} GB · ${c.defaultQuota?.storage || 150} GB`
    }
  ];

  function draw() {
    if (state === 'loading') return host.replaceChildren(skeletonRows(3));
    if (state === 'error') return host.replaceChildren(errorState({ onRetry: load }));
    if (!list.length) return host.replaceChildren(emptyState({ icon: 'graduation-cap', title: 'No cohorts yet' }));
    host.replaceChildren(table({ columns, rows: list, caption: t('cohorts.title') }));
  }

  async function load({ silent = false } = {}) {
    if (!silent) { state = 'loading'; draw(); }
    try {
      list = await api.cohorts.list();
      state = 'ready';
    } catch {
      if (silent) return;
      state = 'error';
    }
    draw();
  }

  function openCreateCohortModal() {
    let dialog;
    const instructors = users.filter((u) => u.role === 'instructor');
    const idInp = input({ id: 'c-id', placeholder: 'SEC-302', mono: true });
    const nameInp = input({ id: 'c-name', placeholder: 'Acme University - SEC-302 (Web Security)' });
    const instSelect = select({
      ariaLabel: t('cohorts.col.instructor'),
      value: instructors[0]?.id || '',
      options: instructors.map((i) => ({ value: i.id, label: i.name }))
    });

    const submit = async () => {
      const cid = idInp.value.trim();
      const cname = nameInp.value.trim();
      if (!cid || !cname) return;
      try {
        await api.cohorts.create({ id: cid, name: cname, instructor: instSelect.control.value });
        dialog.close();
        toast({ title: 'Cohort created successfully', kind: 'success' });
        load({ silent: true });
      } catch (err) {
        toast({ title: t('common.error'), description: err.message, kind: 'error' });
      }
    };

    dialog = openDialog({
      title: t('cohorts.new'),
      description: 'Create a new academic laboratory cohort.',
      body: h('div', { class: 'space-y-4' },
        field({ label: t('cohorts.col.id'), id: 'c-id', control: idInp }),
        field({ label: t('cohorts.col.name'), id: 'c-name', control: nameInp }),
        field({ label: t('cohorts.col.instructor'), id: 'c-inst', control: instSelect })),
      actions: [
        button({ label: t('common.cancel'), variant: 'secondary', onClick: () => dialog.close() }),
        button({ label: t('common.confirm'), variant: 'primary', onClick: submit })
      ]
    });
  }

  onCleanup(on('cohorts:changed', () => load({ silent: true })));
  load();

  return PageContainer({ variant: 'default' },
    pageHeader({ title: t('cohorts.title'), description: t('cohorts.desc'), actions: newBtn }),
    host);
}
