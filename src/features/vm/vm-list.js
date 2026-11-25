import { h, icon, cx } from '../../lib/dom.js';
import { t } from '../../lib/i18n.js';
import { api } from '../../lib/api.js';
import { on } from '../../lib/events.js';
import { onCleanup } from '../../lib/router.js';
import { useAuth } from '../../lib/auth.js';
import { formatIdle } from '../../lib/format.js';
import { OS } from '../../mock/vms.js';
import {
  getVmState,
  getVisibleVms,
  subscribeVms,
  refreshVms,
} from '../../lib/vm-store.js';
import { button } from '../../components/ui/button.js';
import { searchInput, select } from '../../components/ui/input.js';
import { table } from '../../components/ui/table.js';
import { dropdown } from '../../components/ui/dropdown.js';
import { skeletonRows } from '../../components/ui/skeleton.js';
import { emptyState, errorState } from '../../components/ui/empty-state.js';
import { statusDot, liveStatusIndicator, dockerWarningBanner } from '../../components/ui/status-dot.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { PageContainer } from '../../components/layout/page-container.js';
import { toast } from '../../components/ui/toast.js';
import { osTile, runVmAction, runOrphanCleanup, specsText, vmMenuItems } from './vm-actions.js';
import { openVmRequestModal } from './vm-request-modal.js';

const PAGE_SIZE = 25;

function columns(showOwner, isAdmin) {
  const cols = [
    {
      key: 'name', label: t('vm.col.name'),
      render: (vm) => h('div', { class: 'flex items-center gap-3', 'data-vm-row': vm.id }, osTile(vm.os),
        h('div', { class: 'min-w-0' },
          h('div', { class: 'truncate font-medium' }, vm.name),
          h('div', { class: 't-caption' }, OS[vm.os]?.label || vm.os)))
    },
    { key: 'status', label: t('vm.col.status'), render: (vm) => statusDot(vm) },
    { key: 'specs', label: t('vm.col.specs'), class: 'hidden text-muted md:table-cell', render: specsText },
    { key: 'ip', label: t('vm.col.ip'), render: (vm) => h('span', { class: 'font-mono text-muted' }, vm.ip || '—') },
    {
      key: 'idle', label: t('vm.col.idle'), class: 'hidden sm:table-cell',
      render: (vm) => vm.status === 'running' && !vm.stale && vm.idleSeconds != null
        ? h('span', { class: 'num font-mono', 'data-idle': vm.id }, formatIdle(vm.idleSeconds))
        : h('span', { class: 'text-subtle' }, '—')
    }
  ];
  if (showOwner) {
    cols.splice(2, 0, {
      key: 'owner',
      label: t('vm.col.owner'),
      class: 'hidden text-muted lg:table-cell',
      render: (vm) => vm.ownerName || vm.owner
    });
  }
  cols.push({
    key: 'actions', label: t('vm.col.actions'), srOnly: true, class: 'w-44',
    render: (vm) => {
      const running = vm.status === 'running' && !vm.stale;
      const busy = vm.status === 'starting' || vm.status === 'stopping';
      const staleOrUnknown = vm.stale || vm.status === 'unknown';
      const isMissing = vm.status === 'missing';
      const canStart = !staleOrUnknown && !busy && (vm.status === 'stopped' || vm.status === 'paused' || (vm.status === 'error' && Boolean(vm.containerId)));

      const more = h('button', {
        type: 'button', 'aria-label': `${t('vm.act.more')}: ${vm.name}`,
        class: 'flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-raised hover:text-fg cursor-pointer'
      }, icon('ellipsis', 'w-4 h-4'));

      let primaryControl = null;
      if (busy) {
        primaryControl = h('span', {
          class: 'inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-raised px-2.5 text-xs font-medium text-muted',
          'aria-live': 'polite',
          'data-vm-busy': vm.status,
        },
          icon('loader-2', 'w-3.5 h-3.5 motion-safe:animate-spin'),
          t(`vm.status.${vm.status}`)
        );
      } else if (isMissing && !staleOrUnknown) {
        primaryControl = button({
          label: t('vm.act.recreate'),
          icon: 'refresh-cw',
          variant: 'secondary',
          size: 'xs',
          attrs: { 'data-vm-action': 'recreate' },
          onClick: () => runVmAction(vm, 'recreate')
        });
      } else if (canStart) {
        primaryControl = button({
          label: t('vm.act.start'),
          icon: 'play',
          variant: 'secondary',
          size: 'xs',
          attrs: { 'data-vm-action': 'start' },
          onClick: () => runVmAction(vm, 'start')
        });
      } else if (running) {
        primaryControl = h('div', { class: 'flex items-center gap-0.5' },
          button({
            icon: 'monitor', variant: 'ghost', size: 'icon',
            ariaLabel: `${t('vm.act.gui')}: ${vm.name}`,
            attrs: { 'data-vm-action': 'gui' },
            disabled: !running,
            onClick: () => runVmAction(vm, 'gui')
          }),
          button({
            icon: 'terminal', variant: 'ghost', size: 'icon',
            ariaLabel: `${t('vm.act.terminal')}: ${vm.name}`,
            attrs: { 'data-vm-action': 'terminal' },
            disabled: !running,
            onClick: () => runVmAction(vm, 'terminal')
          })
        );
      }

      return h('div', { class: 'flex items-center justify-end gap-1' },
        primaryControl,
        dropdown({ trigger: more, items: () => vmMenuItems(vm, { isAdmin }) })
      );
    }
  });
  return cols;
}

function orphansSection(orphans) {
  if (!orphans || !orphans.length) return null;

  const cols = [
    {
      key: 'name', label: t('vm.col.name'),
      render: (o) => h('div', { class: 'space-y-0.5' },
        h('div', { class: 'flex items-center gap-2' },
          h('span', { class: 'font-medium text-fg' }, o.name),
          h('span', {
            class: 'rounded-full border border-[var(--warning-border)] bg-[var(--warning-bg)] px-2 py-0.5 font-mono text-[10px] font-medium text-[var(--warning-text)]'
          }, t('vm.orphans.badge'))
        ),
        h('div', { class: 'font-mono text-[11px] text-muted' }, `${o.containerId.slice(0, 12)} · ${o.image}`)
      )
    },
    { key: 'status', label: t('vm.col.status'), render: (o) => statusDot(o.status) },
    { key: 'owner', label: t('vm.col.owner'), class: 'hidden md:table-cell', render: (o) => h('span', { class: 'font-mono text-xs text-muted' }, o.owner || '—') },
    {
      key: 'actions', label: t('vm.col.actions'), srOnly: true, class: 'w-32 text-right',
      render: (o) => button({
        label: t('vm.act.cleanup'),
        icon: 'trash-2',
        variant: 'danger-ghost',
        size: 'xs',
        onClick: () => runOrphanCleanup(o)
      })
    }
  ];

  return h('section', { class: 'mt-8 space-y-3', 'data-orphans-section': 'true' },
    h('div', { class: 'space-y-0.5' },
      h('h2', { class: 't-section' }, `${t('vm.orphans.title')} (${orphans.length})`),
      h('p', { class: 'text-xs text-muted' }, t('vm.orphans.desc'))
    ),
    table({ columns: cols, rows: orphans, caption: t('vm.orphans.title') })
  );
}

export function VmListPage() {
  const auth = useAuth();
  const showOwner = auth.role !== 'student';
  const isStudent = auth.role === 'student';
  const isAdmin = auth.role === 'admin';

  let requests = [];
  let currentTab = 'vms';
  let query = '';
  let statusFilter = 'all';
  let page = 1;

  const headerHost = h('div', {});
  const bannerHost = h('div', {});
  const tabsHost = h('div', {});
  const controlsHost = h('div', {});
  const host = h('div', { 'aria-live': 'polite' });
  const orphansHost = h('div', {});
  const container = h('div', { class: 'space-y-4' }, headerHost, bannerHost, tabsHost, controlsHost, host, orphansHost);

  const search = searchInput({
    placeholder: t('vm.search'),
    ariaLabel: t('vm.search'),
    onInput: (v) => { query = v.trim().toLowerCase(); page = 1; drawTable(); }
  });

  const filter = select({
    ariaLabel: t('vm.filter.label'),
    value: 'all',
    onChange: (v) => { statusFilter = v; page = 1; drawTable(); },
    options: [
      { value: 'all', label: t('vm.filter.all') },
      { value: 'running', label: t('vm.status.running') },
      { value: 'starting', label: t('vm.status.starting') },
      { value: 'stopping', label: t('vm.status.stopping') },
      { value: 'stopped', label: t('vm.status.stopped') },
      { value: 'paused', label: t('vm.status.paused') },
      { value: 'missing', label: t('vm.status.missing') },
      { value: 'error', label: t('vm.status.error') },
      { value: 'unknown', label: t('vm.status.unknown') }
    ]
  });

  function renderSlotMeter(used, limit) {
    return h('div', { class: 'flex items-center gap-2.5 rounded-xl border border-line bg-surface/70 backdrop-blur px-3 py-1.5 text-xs select-none' },
      h('div', { class: 'flex items-center gap-1' },
        Array.from({ length: limit }).map((_, i) =>
          h('span', {
            class: cx(
              'w-2.5 h-4 rounded-sm transition-all',
              i < used ? (used >= limit ? 'bg-[var(--warning)]' : 'bg-accent') : 'bg-raised border border-line'
            )
          })
        )
      ),
      h('div', { class: 'flex items-center gap-1.5' },
        h('span', { class: 'font-mono font-semibold text-fg text-xs' }, `${used} / ${limit} VM`),
        used >= limit
          ? h('span', { class: 'rounded-md bg-[var(--warning-bg)] border border-[var(--warning-border)] px-1.5 py-0.2 font-mono text-[10px] text-[var(--warning-text)] font-semibold' }, 'LIMIT')
          : h('span', { class: 'rounded-md bg-[var(--accent-bg)] border border-[var(--accent-border)] px-1.5 py-0.2 font-mono text-[10px] text-[var(--accent-text)] font-semibold' }, `${limit - used} FREE`)
      )
    );
  }

  function renderRequestsTab() {
    if (!requests.length) {
      return emptyState({
        icon: 'clipboard-list',
        title: 'No VM requests yet',
        description: 'You have not submitted a request for additional VMs.',
        action: button({
          label: 'Request Additional VM',
          icon: 'send',
          variant: 'primary',
          onClick: () => openVmRequestModal({ onSuccess: loadRequests })
        })
      });
    }

    const requestCols = [
      {
        key: 'vm',
        label: 'VM / Specs',
        render: (r) => h('div', { class: 'space-y-0.5' },
          h('div', { class: 'font-medium text-fg font-mono text-xs' }, r.requestedSpecs.name),
          h('div', { class: 'text-[11px] text-muted' }, `${OS[r.requestedSpecs.os]?.label || r.requestedSpecs.os} · ${r.requestedSpecs.vcpu} vCPU / ${r.requestedSpecs.ram}GB`)
        )
      },
      {
        key: 'purpose',
        label: 'Purpose',
        render: (r) => h('div', { class: 'max-w-xs text-xs text-muted leading-relaxed line-clamp-2' }, r.purpose)
      },
      {
        key: 'status',
        label: 'Status',
        render: (r) => {
          let badgeClass = 'bg-[var(--warning-bg)] text-[var(--warning-text)] border-[var(--warning-border)]';
          let label = 'Pending';
          if (r.status === 'approved') {
            badgeClass = 'bg-[var(--success-bg)] text-[var(--success-text)] border-[var(--success-border)]';
            label = 'Approved';
          } else if (r.status === 'rejected') {
            badgeClass = 'bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-border)]';
            label = 'Rejected';
          } else if (r.status === 'fulfilled') {
            badgeClass = 'bg-raised text-muted border-line';
            label = 'Fulfilled';
          } else if (r.status === 'cancelled') {
            badgeClass = 'bg-raised text-subtle border-line';
            label = 'Cancelled';
          }
          return h('span', { class: cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium font-mono', badgeClass) },
            h('span', { class: 'w-1.5 h-1.5 rounded-full bg-current' }),
            label
          );
        }
      },
      {
        key: 'actions',
        label: '',
        srOnly: true,
        class: 'w-32 text-right',
        render: (r) => {
          if (r.status === 'approved' && r.grantId) {
            return button({
              label: t('vm.active.launch'),
              icon: 'play',
              size: 'xs',
              variant: 'primary',
              onClick: async () => {
                try {
                  await api.vms.create({
                    name: r.requestedSpecs.name,
                    os: r.requestedSpecs.os,
                    vcpu: r.requestedSpecs.vcpu,
                    ram: r.requestedSpecs.ram,
                    disk: r.requestedSpecs.disk,
                    grantId: r.grantId
                  });
                  toast({ title: `${r.requestedSpecs.name} created`, kind: 'success' });
                  loadRequests();
                } catch (err) {
                  toast({ title: t('common.error'), description: err.message, kind: 'error' });
                }
              }
            });
          }
          if (r.status === 'pending') {
            return button({
              label: t('common.cancel'),
              size: 'xs',
              variant: 'ghost',
              onClick: async () => {
                try {
                  await api.vmRequests.cancel(r.id);
                  toast({ title: 'Request cancelled', kind: 'info' });
                  loadRequests();
                } catch (err) {
                  toast({ title: t('common.error'), description: err.message, kind: 'error' });
                }
              }
            });
          }
          return h('span', { class: 'text-subtle text-xs' }, '—');
        }
      }
    ];

    return table({ columns: requestCols, rows: requests, caption: 'VM Requests' });
  }

  function drawChrome(vmState, allVms) {
    const studentVmsCount = isStudent ? allVms.filter((v) => v.owner === auth.user?.id).length : allVms.length;
    const studentLimit = auth.user?.maxSelfServiceVms || 3;
    const isAtLimit = isStudent && studentVmsCount >= studentLimit;
    const pendingReqsCount = requests.filter((r) => r.status === 'pending').length;

    headerHost.replaceChildren(
      pageHeader({
        title: t('vm.title'),
        description: t('vm.desc'),
        actions: h('div', { class: 'flex flex-wrap items-center gap-2.5' },
          liveStatusIndicator(vmState),
          isStudent && renderSlotMeter(studentVmsCount, studentLimit),
          isAtLimit
            ? button({
                label: 'Request VM',
                icon: 'send',
                variant: 'primary',
                onClick: () => openVmRequestModal({ onSuccess: loadRequests })
              })
            : button({
                label: t('vm.new'),
                icon: 'plus',
                variant: 'primary',
                href: '/vms/new'
              })
        )
      })
    );

    const banner = dockerWarningBanner(vmState, { onRetry: () => refreshVms({ force: true }) });
    bannerHost.replaceChildren(...(banner ? [banner] : []));

    tabsHost.replaceChildren(
      h('div', { class: 'flex items-center gap-2 border-b border-line pb-2 text-xs select-none' },
        h('button', {
          type: 'button',
          class: cx(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer',
            currentTab === 'vms' ? 'bg-raised text-fg font-semibold shadow-sm' : 'text-muted hover:text-fg hover:bg-surface'
          ),
          onClick: () => { currentTab = 'vms'; drawAll(); }
        },
          icon('server', 'w-3.5 h-3.5'),
          h('span', {}, `${t('nav.vms')} (${allVms.length})`)
        ),
        h('button', {
          type: 'button',
          class: cx(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer',
            currentTab === 'requests' ? 'bg-raised text-fg font-semibold shadow-sm' : 'text-muted hover:text-fg hover:bg-surface'
          ),
          onClick: () => { currentTab = 'requests'; drawAll(); }
        },
          icon('clipboard-list', 'w-3.5 h-3.5'),
          h('span', {}, `Requests (${requests.length})`),
          pendingReqsCount > 0 && h('span', { class: 'rounded-full bg-[var(--warning-bg)] text-[var(--warning-text)] font-mono text-[10px] px-1.5 py-0.2 font-semibold' }, String(pendingReqsCount))
        )
      )
    );

    if (currentTab === 'vms') {
      if (!controlsHost.firstChild) {
        controlsHost.replaceChildren(h('div', { class: 'flex flex-wrap items-center gap-2' }, search, filter));
      }
    } else {
      controlsHost.replaceChildren();
    }
  }

  function drawTable() {
    const vmState = getVmState();
    const allVms = getVisibleVms();

    if (vmState.loading && !vmState.initialized) {
      host.replaceChildren(skeletonRows(4));
      orphansHost.replaceChildren();
      return;
    }
    if (vmState.error && !vmState.initialized) {
      host.replaceChildren(errorState({ title: t('vm.error.title'), onRetry: () => refreshVms({ force: true }) }));
      orphansHost.replaceChildren();
      return;
    }

    if (currentTab === 'requests') {
      host.replaceChildren(renderRequestsTab());
      orphansHost.replaceChildren();
      return;
    }

    if (!allVms.length) {
      host.replaceChildren(emptyState({
        icon: 'server',
        title: t('vm.empty.title'),
        description: t('vm.empty.desc'),
        action: button({ label: t('vm.new'), icon: 'plus', variant: 'primary', href: '/vms/new' })
      }));
    } else {
      const filtered = allVms.filter((vm) =>
        (statusFilter === 'all' || vm.status === statusFilter) &&
        (!query || vm.name.toLowerCase().includes(query) || (vm.ip || '').includes(query))
      );

      if (!filtered.length) {
        host.replaceChildren(emptyState({
          icon: 'search',
          title: t('vm.empty.filtered'),
          description: t('vm.empty.filteredDesc')
        }));
      } else {
        const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        if (page > totalPages) page = totalPages;
        const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

        const pager = totalPages > 1
          ? h('div', { class: 'mt-3 flex items-center justify-between text-xs text-muted' },
              h('span', {}, t('vm.page.info', { page, total: totalPages })),
              h('div', { class: 'flex gap-2' },
                button({ label: t('vm.page.prev'), size: 'xs', variant: 'secondary', disabled: page <= 1, onClick: () => { page--; drawTable(); } }),
                button({ label: t('vm.page.next'), size: 'xs', variant: 'secondary', disabled: page >= totalPages, onClick: () => { page++; drawTable(); } })
              )
            )
          : null;

        host.replaceChildren(
          h('div', {}, table({ columns: columns(showOwner, isAdmin), rows: pageRows, caption: t('vm.title') }), pager)
        );
      }
    }

    const orphanEl = isAdmin ? orphansSection(vmState.orphans) : null;
    orphansHost.replaceChildren(...(orphanEl ? [orphanEl] : []));
  }

  function drawAll() {
    const vmState = getVmState();
    const allVms = getVisibleVms();
    drawChrome(vmState, allVms);
    drawTable();
  }

  async function loadRequests() {
    requests = await api.vmRequests.list().catch(() => []);
    drawAll();
  }

  onCleanup(subscribeVms(() => drawAll()));
  onCleanup(on('requests:changed', () => loadRequests()));

  drawAll();
  void refreshVms({ force: false, silent: true });
  void loadRequests();

  return PageContainer({ variant: 'default' }, container);
}
