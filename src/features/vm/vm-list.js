import { h, icon, cx } from '../../lib/dom.js';
import { t } from '../../lib/i18n.js';
import { api } from '../../lib/api.js';
import { on } from '../../lib/events.js';
import { onCleanup } from '../../lib/router.js';
import { useAuth } from '../../lib/auth.js';
import { formatIdle } from '../../lib/format.js';
import { OS } from '../../mock/vms.js';
import { button } from '../../components/ui/button.js';
import { searchInput, select } from '../../components/ui/input.js';
import { table } from '../../components/ui/table.js';
import { dropdown } from '../../components/ui/dropdown.js';
import { skeletonRows } from '../../components/ui/skeleton.js';
import { emptyState, errorState } from '../../components/ui/empty-state.js';
import { statusDot } from '../../components/ui/status-dot.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { PageContainer } from '../../components/layout/page-container.js';
import { toast } from '../../components/ui/toast.js';
import { osTile, runVmAction, specsText, vmMenuItems } from './vm-actions.js';
import { openVmRequestModal } from './vm-request-modal.js';

function columns(showOwner) {
  const cols = [
    {
      key: 'name', label: t('vm.col.name'),
      render: (vm) => h('div', { class: 'flex items-center gap-3' }, osTile(vm.os),
        h('div', { class: 'min-w-0' },
          h('div', { class: 'truncate font-medium' }, vm.name),
          h('div', { class: 't-caption' }, OS[vm.os]?.label)))
    },
    { key: 'status', label: t('vm.col.status'), render: (vm) => statusDot(vm.status) },
    { key: 'specs', label: t('vm.col.specs'), class: 'hidden text-muted md:table-cell', render: specsText },
    { key: 'ip', label: t('vm.col.ip'), render: (vm) => h('span', { class: 'font-mono text-muted' }, vm.ip) },
    {
      key: 'idle', label: t('vm.col.idle'), class: 'hidden sm:table-cell',
      render: (vm) => vm.status === 'running'
        ? h('span', { class: 'num font-mono', 'data-idle': vm.id }, formatIdle(vm.idleSeconds))
        : h('span', { class: 'text-subtle' }, '—')
    }
  ];
  if (showOwner) cols.splice(2, 0, { key: 'owner', label: t('vm.col.owner'), class: 'hidden text-muted lg:table-cell', render: (vm) => vm.ownerName });
  cols.push({
    key: 'actions', label: t('vm.col.actions'), srOnly: true, class: 'w-28',
    render: (vm) => {
      const running = vm.status === 'running';
      const more = h('button', {
        type: 'button', 'aria-label': `${t('vm.act.more')}: ${vm.name}`,
        class: 'flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-raised hover:text-fg'
      }, icon('ellipsis', 'w-4 h-4'));
      return h('div', { class: 'flex justify-end gap-0.5' },
        button({ icon: 'monitor', variant: 'ghost', size: 'icon', ariaLabel: `${t('vm.act.gui')}: ${vm.name}`, disabled: !running, onClick: () => runVmAction(vm, 'gui') }),
        button({ icon: 'terminal', variant: 'ghost', size: 'icon', ariaLabel: `${t('vm.act.terminal')}: ${vm.name}`, disabled: !running, onClick: () => runVmAction(vm, 'terminal') }),
        dropdown({ trigger: more, items: () => vmMenuItems(vm) }));
    }
  });
  return cols;
}

export function VmListPage() {
  const auth = useAuth();
  const showOwner = auth.role !== 'student';
  const isStudent = auth.role === 'student';

  let all = [];
  let requests = [];
  let state = 'loading'; // loading | ready | error
  let currentTab = 'vms'; // 'vms' | 'requests'
  let query = '';
  let status = 'all';

  const host = h('div', { 'aria-live': 'polite' });
  const container = h('div', { class: 'space-y-4' });

  const search = searchInput({ placeholder: t('vm.search'), ariaLabel: t('vm.search'), onInput: (v) => { query = v.trim().toLowerCase(); draw(); } });
  const filter = select({
    ariaLabel: t('vm.filter.label'), value: 'all', onChange: (v) => { status = v; draw(); },
    options: [
      { value: 'all', label: t('vm.filter.all') },
      { value: 'running', label: t('vm.status.running') },
      { value: 'stopped', label: t('vm.status.stopped') }
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
        title: 'Belum Ada Permohonan VM',
        description: 'Anda belum mengajukan permohonan VM tambahan ke instruktur.',
        action: button({
          label: 'Ajukan VM Tambahan',
          icon: 'send',
          variant: 'primary',
          onClick: () => openVmRequestModal({ onSuccess: load })
        })
      });
    }

    const requestCols = [
      {
        key: 'vm',
        label: 'VM / SPESIFIKASI',
        render: (r) => h('div', { class: 'space-y-0.5' },
          h('div', { class: 'font-medium text-fg font-mono text-xs' }, r.requestedSpecs.name),
          h('div', { class: 'text-[11px] text-muted' }, `${OS[r.requestedSpecs.os]?.label || r.requestedSpecs.os} · ${r.requestedSpecs.vcpu} vCPU / ${r.requestedSpecs.ram}GB`)
        )
      },
      {
        key: 'purpose',
        label: 'ALASAN / TUJUAN',
        render: (r) => h('div', { class: 'max-w-xs text-xs text-muted leading-relaxed line-clamp-2' }, r.purpose)
      },
      {
        key: 'status',
        label: 'STATUS',
        render: (r) => {
          let badgeClass = 'bg-[var(--warning-bg)] text-[var(--warning-text)] border-[var(--warning-border)]';
          let label = 'Menunggu Persetujuan';
          if (r.status === 'approved') {
            badgeClass = 'bg-[var(--success-bg)] text-[var(--success-text)] border-[var(--success-border)]';
            label = 'Disetujui (Ready to Launch)';
          } else if (r.status === 'rejected') {
            badgeClass = 'bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-border)]';
            label = 'Ditolak';
          } else if (r.status === 'fulfilled') {
            badgeClass = 'bg-raised text-muted border-line';
            label = 'Selesai';
          } else if (r.status === 'cancelled') {
            badgeClass = 'bg-raised text-subtle border-line';
            label = 'Dibatalkan';
          }

          return h('div', { class: 'space-y-1' },
            h('span', { class: cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium font-mono', badgeClass) },
              h('span', { class: 'w-1.5 h-1.5 rounded-full bg-current' }),
              label
            ),
            r.reviewNote && h('p', { class: 'text-[10px] text-[var(--danger-text)] italic max-w-xs' }, `Catatan: "${r.reviewNote}"`)
          );
        }
      },
      {
        key: 'time',
        label: 'WAKTU',
        class: 'hidden sm:table-cell',
        render: (r) => h('span', { class: 'font-mono text-[11px] text-subtle' }, new Date(r.requestedAt).toLocaleDateString())
      },
      {
        key: 'actions',
        label: '',
        srOnly: true,
        class: 'w-36 text-right',
        render: (r) => {
          if (r.status === 'approved' && r.grantId) {
            return button({
              label: 'Launch VM',
              icon: 'play',
              size: 'xs',
              variant: 'primary',
              onClick: async () => {
                try {
                  toast.info(`Launching approved VM ${r.requestedSpecs.name}...`);
                  await api.vms.create({
                    name: r.requestedSpecs.name,
                    os: r.requestedSpecs.os,
                    vcpu: r.requestedSpecs.vcpu,
                    ram: r.requestedSpecs.ram,
                    disk: r.requestedSpecs.disk,
                    grantId: r.grantId
                  });
                  toast.success(`VM ${r.requestedSpecs.name} created successfully!`);
                  load();
                } catch (err) {
                  toast.error(err.message || 'Failed to create VM');
                }
              }
            });
          }
          if (r.status === 'pending') {
            return button({
              label: 'Batalkan',
              size: 'xs',
              variant: 'ghost',
              onClick: async () => {
                try {
                  await api.vmRequests.cancel(r.id);
                  toast.info('Permohonan VM dibatalkan');
                  load();
                } catch (err) {
                  toast.error(err.message);
                }
              }
            });
          }
          return h('span', { class: 'text-subtle text-xs' }, '—');
        }
      }
    ];

    return table({ columns: requestCols, rows: requests, caption: 'Permohonan VM Tambahan' });
  }

  function draw() {
    if (state === 'loading') return host.replaceChildren(skeletonRows(4));
    if (state === 'error') return host.replaceChildren(errorState({ title: t('vm.error.title'), onRetry: load }));

    if (currentTab === 'requests') {
      return host.replaceChildren(renderRequestsTab());
    }

    if (!all.length) {
      return host.replaceChildren(emptyState({
        icon: 'server', title: t('vm.empty.title'), description: t('vm.empty.desc'),
        action: button({ label: t('vm.new'), icon: 'plus', variant: 'primary', href: '/vms/new' })
      }));
    }
    const rows = all.filter((vm) =>
      (status === 'all' || vm.status === status) &&
      (!query || vm.name.toLowerCase().includes(query) || vm.ip.includes(query)));
    if (!rows.length) {
      return host.replaceChildren(emptyState({ icon: 'search', title: t('vm.empty.filtered'), description: t('vm.empty.filteredDesc') }));
    }
    host.replaceChildren(table({ columns: columns(showOwner), rows, caption: t('vm.title') }));
  }

  async function load({ silent = false } = {}) {
    if (!silent) { state = 'loading'; draw(); }
    try {
      all = await api.vms.list();
      requests = await api.vmRequests.list().catch(() => []);
      state = 'ready';
    } catch {
      if (silent) return;
      state = 'error';
    }
    renderHeaderAndContent();
    draw();
  }

  function renderHeaderAndContent() {
    container.innerHTML = '';

    const studentVmsCount = isStudent ? all.filter(v => v.owner === auth.user?.id).length : all.length;
    const studentLimit = 3;
    const isAtLimit = isStudent && studentVmsCount >= studentLimit;
    const pendingReqsCount = requests.filter(r => r.status === 'pending').length;

    // Header actions: Segmented meter + Primary CTA
    const headerActions = h('div', { class: 'flex items-center gap-3' },
      isStudent && renderSlotMeter(studentVmsCount, studentLimit),
      isAtLimit
        ? button({
            label: 'Ajukan VM tambahan',
            icon: 'send',
            variant: 'primary',
            onClick: () => openVmRequestModal({ onSuccess: load })
          })
        : button({
            label: t('vm.new'),
            icon: 'plus',
            variant: 'primary',
            href: '/vms/new'
          })
    );

    const header = pageHeader({
      title: t('vm.title'),
      description: t('vm.desc'),
      actions: headerActions
    });

    // Tab navigation (Virtual Machines vs Requests)
    const tabsBar = h('div', { class: 'flex items-center gap-2 border-b border-line pb-2 mb-4 text-xs select-none' },
      h('button', {
        type: 'button',
        class: cx(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer',
          currentTab === 'vms' ? 'bg-raised text-fg font-semibold shadow-sm' : 'text-muted hover:text-fg hover:bg-surface'
        ),
        onClick: () => { currentTab = 'vms'; renderHeaderAndContent(); draw(); }
      },
        icon('server', 'w-3.5 h-3.5'),
        h('span', {}, `Mesin Virtual (${all.length})`)
      ),
      h('button', {
        type: 'button',
        class: cx(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer',
          currentTab === 'requests' ? 'bg-raised text-fg font-semibold shadow-sm' : 'text-muted hover:text-fg hover:bg-surface'
        ),
        onClick: () => { currentTab = 'requests'; renderHeaderAndContent(); draw(); }
      },
        icon('clipboard-list', 'w-3.5 h-3.5'),
        h('span', {}, `Permintaan (${requests.length})`),
        pendingReqsCount > 0 && h('span', { class: 'rounded-full bg-[var(--warning-bg)] text-[var(--warning-text)] font-mono text-[10px] px-1.5 py-0.2 font-semibold' }, String(pendingReqsCount))
      )
    );

    const controlsRow = currentTab === 'vms'
      ? h('div', { class: 'mb-4 flex flex-wrap items-center gap-2' }, search, filter)
      : null;

    container.appendChild(header);
    container.appendChild(tabsBar);
    if (controlsRow) container.appendChild(controlsRow);
    container.appendChild(host);
  }

  onCleanup(on('vms:changed', () => load({ silent: true })));
  onCleanup(on('requests:changed', () => load({ silent: true })));
  load();

  return PageContainer({ variant: 'default' }, container);
}
