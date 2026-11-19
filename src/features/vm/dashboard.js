import { h, icon } from '../../lib/dom.js';
import { t } from '../../lib/i18n.js';
import { api } from '../../lib/api.js';
import { on } from '../../lib/events.js';
import { onCleanup } from '../../lib/router.js';
import { useAuth } from '../../lib/auth.js';
import { formatIdle, timeAgo } from '../../lib/format.js';
import { OS } from '../../mock/vms.js';
import { button } from '../../components/ui/button.js';
import { sparkline } from '../../components/ui/sparkline.js';
import { skeleton } from '../../components/ui/skeleton.js';
import { emptyState, errorState } from '../../components/ui/empty-state.js';
import { statusDot } from '../../components/ui/status-dot.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { PageContainer } from '../../components/layout/page-container.js';
import { runVmAction, specsText } from './vm-actions.js';

const POOL = { vcpu: 64, ram: 128, storage: 1000, vms: 40 };

const sum = (list, key) => list.reduce((total, item) => total + item[key], 0);

function kpi({ label, value, unit, hint, series }) {
  return h('div', { class: 'space-y-3 py-6 sm:px-8 sm:first:pl-0 sm:last:pr-0' },
    h('p', { class: 'text-sm text-muted' }, label),
    h('div', { class: 'flex items-baseline gap-1.5' },
      h('span', { class: 't-display num' }, value),
      unit && h('span', { class: 'text-sm text-muted' }, unit)),
    sparkline(series),
    h('p', { class: 't-caption' }, hint));
}

function vmRow(vm) {
  const running = vm.status === 'running';
  return h('li', { class: 'flex items-center gap-4 py-3' },
    h('div', { class: 'min-w-0 flex-1' },
      h('div', { class: 'flex items-center gap-3' },
        h('span', { class: `h-2 w-2 shrink-0 rounded-full ${running ? 'bg-accent' : vm.status === 'restarting' ? 'bg-warn' : 'bg-subtle'}`, 'aria-hidden': 'true' }),
        h('span', { class: 'truncate text-sm font-medium' }, vm.name),
        h('span', { class: 'sr-only' }, t(`vm.status.${vm.status}`))),
      h('p', { class: 't-caption mt-0.5 pl-5' }, `${OS[vm.os]?.label} · ${specsText(vm)}`)),
    h('span', { class: 'hidden font-mono text-sm text-muted md:block' }, vm.ip),
    h('span', { class: 'w-14 text-right font-mono text-sm text-muted num', 'data-idle': running ? vm.id : undefined, title: t('vm.col.idle') },
      running ? formatIdle(vm.idleSeconds) : '—'),
    h('div', { class: 'flex gap-1' },
      button({ icon: 'monitor', variant: 'ghost', size: 'icon', ariaLabel: `${t('vm.act.gui')}: ${vm.name}`, disabled: !running, onClick: () => runVmAction(vm, 'gui') }),
      button({ icon: 'terminal', variant: 'ghost', size: 'icon', ariaLabel: `${t('vm.act.terminal')}: ${vm.name}`, disabled: !running, onClick: () => runVmAction(vm, 'terminal') })));
}

function vmSection(vms) {
  return h('section', { 'aria-labelledby': 'dash-vms' },
    h('div', { class: 'mb-2 flex items-center justify-between' },
      h('h2', { id: 'dash-vms', class: 't-section' }, t('dash.vms')),
      h('a', { href: '/vms', 'data-link': true, class: 'text-sm text-muted transition-colors duration-150 hover:text-fg' }, t('dash.viewAll'))),
    vms.length
      ? h('ul', { class: 'divide-y divide-line border-y border-line' }, vms.slice(0, 5).map(vmRow))
      : emptyState({
          icon: 'server', title: t('vm.empty.title'), description: t('vm.empty.desc'), compact: true,
          action: button({ label: t('vm.new'), icon: 'plus', variant: 'primary', href: '/vms/new' })
        }));
}

function quotaRow(label, used, limit, unit = '') {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return h('div', {},
    h('div', { class: 'flex items-baseline justify-between text-sm' },
      h('span', { class: 'text-muted' }, label),
      h('span', { class: 'num font-mono' }, `${used} / ${limit}${unit}`)),
    h('div', {
      class: 'mt-2 h-1 rounded-full bg-raised', role: 'progressbar',
      'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct)
    }, h('div', { class: 'h-1 rounded-full bg-accent transition-[width] duration-200 ease-out', style: `width:${pct}%` })));
}

function sidePanel({ vms, activity, user }) {
  const isStudent = user.role === 'student';
  const limit = isStudent ? user.quota : POOL;
  const active = vms.filter((vm) => vm.status !== 'stopped');
  const timeout = user.idleTimeoutMin ?? 60;

  return h('div', { class: 'space-y-10' },
    h('section', { 'aria-labelledby': 'dash-quota' },
      h('div', { class: 'mb-4 flex items-baseline justify-between' },
        h('h2', { id: 'dash-quota', class: 't-section' }, t('dash.quota')),
        h('span', { class: 't-caption' }, t(isStudent ? 'quota.you' : 'quota.pool'))),
      h('div', { class: 'space-y-4' },
        quotaRow(t('quota.vcpu'), sum(active, 'vcpu'), limit.vcpu),
        quotaRow(t('quota.ram'), sum(active, 'ram'), limit.ram, ' GB'),
        quotaRow(t('quota.storage'), sum(vms, 'disk'), limit.storage, ' GB'),
        quotaRow(t('quota.vms'), active.length, limit.vms)),
      h('div', { class: 'mt-5 flex items-baseline justify-between border-t border-line pt-4 text-sm' },
        h('span', { class: 'text-muted' }, t('quota.idle')),
        h('span', { class: 'font-mono' }, t('quota.idleValue', { n: timeout })))),
    h('section', { 'aria-labelledby': 'dash-activity' },
      h('h2', { id: 'dash-activity', class: 't-section mb-2' }, t('dash.activity')),
      activity.length
        ? h('ul', { class: 'divide-y divide-line border-y border-line' }, activity.slice(0, 4).map((event) =>
            h('li', { class: 'flex items-baseline justify-between gap-3 py-2.5 text-sm' },
              h('span', { class: 'min-w-0 truncate' }, `${t(`audit.${event.action}`)} `, h('span', { class: 'font-mono text-muted' }, event.target)),
              h('span', { class: 't-caption shrink-0' }, timeAgo(event.time)))))
        : h('p', { class: 'py-4 text-sm text-muted' }, t('dash.noActivity'))));
}

function roleQuickBar(user, vms) {
  const firstRunning = vms.find((v) => v.status === 'running');
  const vmParam = firstRunning ? `?vm=${encodeURIComponent(firstRunning.id)}` : '';

  if (user.role === 'admin') {
    return h('section', { class: 'mb-8 rounded-xl border border-line bg-surface p-4 flex flex-wrap items-center justify-between gap-4' },
      h('div', { class: 'space-y-0.5' },
        h('div', { class: 'text-sm font-semibold text-fg' }, 'Administrator Control Center'),
        h('p', { class: 'text-xs text-muted' }, 'Kelola akun & password user, setujui permohonan VM, atau akses langsung lab Kali Linux.')
      ),
      h('div', { class: 'flex flex-wrap items-center gap-2' },
        button({ label: 'Manage Users & Passwords', icon: 'users', variant: 'primary', size: 'sm', href: '/admin/users' }),
        button({ label: 'Approvals', icon: 'clipboard-check', variant: 'secondary', size: 'sm', href: '/approvals' }),
        button({ label: 'Kali Desktop', icon: 'monitor', variant: 'secondary', size: 'sm', href: `/desktop${vmParam}` }),
        button({ label: 'Terminal', icon: 'terminal', variant: 'ghost', size: 'sm', href: `/terminal${vmParam}` })
      )
    );
  }

  if (user.role === 'instructor') {
    return h('section', { class: 'mb-8 rounded-xl border border-line bg-surface p-4 flex flex-wrap items-center justify-between gap-4' },
      h('div', { class: 'space-y-0.5' },
        h('div', { class: 'text-sm font-semibold text-fg' }, 'Instructor Workspace'),
        h('p', { class: 'text-xs text-muted' }, 'Pantau mahasiswa cohort, proses persetujuan VM, dan akses lab Kali Linux.')
      ),
      h('div', { class: 'flex flex-wrap items-center gap-2' },
        button({ label: 'Students', icon: 'users', variant: 'primary', size: 'sm', href: '/admin/users' }),
        button({ label: 'Approvals', icon: 'clipboard-check', variant: 'secondary', size: 'sm', href: '/approvals' }),
        button({ label: 'Kali Desktop', icon: 'monitor', variant: 'secondary', size: 'sm', href: `/desktop${vmParam}` }),
        button({ label: 'Terminal', icon: 'terminal', variant: 'ghost', size: 'sm', href: `/terminal${vmParam}` })
      )
    );
  }

  return h('section', { class: 'mb-8 rounded-xl border border-line bg-surface p-4 flex flex-wrap items-center justify-between gap-4' },
    h('div', { class: 'space-y-0.5' },
      h('div', { class: 'text-sm font-semibold text-fg' }, 'Kali Linux Lab Workspace'),
      h('p', { class: 'text-xs text-muted' }, firstRunning ? `Lab aktif: ${firstRunning.name} (${firstRunning.ip}) — siap diakses lewat Remote Desktop & Terminal.` : 'Buat VM Kali Linux baru untuk memulai sesi pentesting.')
    ),
    h('div', { class: 'flex flex-wrap items-center gap-2' },
      button({ label: 'Open Kali Desktop', icon: 'monitor', variant: 'primary', size: 'sm', href: `/desktop${vmParam}`, disabled: !firstRunning }),
      button({ label: 'Open Terminal', icon: 'terminal', variant: 'secondary', size: 'sm', href: `/terminal${vmParam}`, disabled: !firstRunning }),
      button({ label: 'New Kali VM', icon: 'plus', variant: 'ghost', size: 'sm', href: '/vms/new' })
    )
  );
}

function content({ vms, metrics, activity, user }) {
  const running = vms.filter((vm) => vm.status === 'running').length;
  return h('div', {},
    roleQuickBar(user, vms),
    h('section', { class: 'grid grid-cols-1 divide-y divide-line border-y border-line sm:grid-cols-3 sm:divide-x sm:divide-y-0' },
      kpi({ label: t('kpi.boot'), value: metrics.boot.value.toFixed(1), unit: 's', hint: t('kpi.boot.hint'), series: metrics.boot.series }),
      kpi({ label: t('kpi.connect'), value: metrics.connect.value.toFixed(1), unit: 's', hint: t('kpi.connect.hint'), series: metrics.connect.series }),
      kpi({ label: t('kpi.running'), value: String(running), hint: t('kpi.running.hint', { n: vms.length }), series: metrics.running.series })),
    h('div', { class: 'grid gap-12 pt-10 lg:grid-cols-[minmax(0,1fr)_300px]' },
      vmSection(vms), sidePanel({ vms, activity, user })));
}

function loading() {
  return h('div', { role: 'status', 'aria-busy': 'true' },
    h('div', { class: 'grid grid-cols-1 gap-6 border-y border-line py-6 sm:grid-cols-3' },
      [0, 1, 2].map(() => h('div', { class: 'space-y-3' }, skeleton('h-3.5 w-28'), skeleton('h-9 w-20'), skeleton('h-7 w-32')))),
    h('div', { class: 'grid gap-12 pt-10 lg:grid-cols-[1fr_300px]' },
      h('div', { class: 'space-y-4' }, [0, 1, 2].map(() => skeleton('h-10 w-full'))),
      h('div', { class: 'space-y-4' }, [0, 1, 2, 3].map(() => skeleton('h-8 w-full')))));
}

export function DashboardPage() {
  const body = h('div', {});
  const page = h('div', {},
    pageHeader({
      title: t('dash.title'), description: t('dash.desc'),
      actions: button({ label: t('vm.new'), icon: 'plus', variant: 'primary', href: '/vms/new' })
    }),
    body);

  async function load({ silent = false } = {}) {
    if (!silent) body.replaceChildren(loading());
    try {
      const [vms, metrics, activity] = await Promise.all([api.vms.list(), api.metrics(), api.activity()]);
      body.replaceChildren(content({ vms, metrics, activity, user: useAuth().user }));
    } catch (err) {
      if (!silent) body.replaceChildren(errorState({ title: t('dash.error.title'), onRetry: () => load() }));
    }
  }

  onCleanup(on('vms:changed', () => load({ silent: true })));
  load();
  return PageContainer({ variant: 'default' }, page);
}
