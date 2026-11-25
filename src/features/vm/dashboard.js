import { h } from '../../lib/dom.js';
import { t } from '../../lib/i18n.js';
import { api } from '../../lib/api.js';
import { onCleanup } from '../../lib/router.js';
import { useAuth } from '../../lib/auth.js';
import { formatIdle, timeAgo } from '../../lib/format.js';
import { OS } from '../../mock/vms.js';
import {
  getVmState,
  getVisibleVms,
  getRunningVms,
  subscribeVms,
  refreshVms,
} from '../../lib/vm-store.js';
import { button } from '../../components/ui/button.js';
import { sparkline } from '../../components/ui/sparkline.js';
import { skeleton } from '../../components/ui/skeleton.js';
import { emptyState, errorState } from '../../components/ui/empty-state.js';
import { statusDot, liveStatusIndicator, dockerWarningBanner } from '../../components/ui/status-dot.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { PageContainer } from '../../components/layout/page-container.js';
import { runVmAction, specsText } from './vm-actions.js';

const POOL = { vcpu: 64, ram: 128, storage: 1000, vms: 40 };

const sum = (list, key) => list.reduce((total, item) => total + (Number(item[key]) || 0), 0);

function kpi({ label, value, unit, hint, series, testId }) {
  return h('div', { class: 'space-y-3 py-6 sm:px-8 sm:first:pl-0 sm:last:pr-0', 'data-kpi': testId },
    h('p', { class: 'text-sm text-muted' }, label),
    h('div', { class: 'flex items-baseline gap-1.5' },
      h('span', { class: 't-display num', 'data-kpi-value': testId }, value),
      unit && h('span', { class: 'text-sm text-muted' }, unit)),
    sparkline(series),
    h('p', { class: 't-caption' }, hint));
}

function activeVmRow(vm) {
  const running = vm.status === 'running' && !vm.stale;
  return h('li', { class: 'flex items-center gap-4 py-3', 'data-active-vm-row': vm.id },
    h('div', { class: 'min-w-0 flex-1' },
      h('div', { class: 'flex items-center gap-3' },
        statusDot(vm),
        h('span', { class: 'truncate text-sm font-medium' }, vm.name)),
      h('p', { class: 't-caption mt-0.5 pl-4' }, `${OS[vm.os]?.label || vm.os} · ${specsText(vm)}`)),
    h('span', { class: 'hidden font-mono text-sm text-muted md:block' }, vm.ip || '—'),
    h('span', {
      class: 'w-14 text-right font-mono text-sm text-muted num',
      'data-idle': running ? vm.id : undefined,
      title: t('vm.col.idle')
    }, running && vm.idleSeconds != null ? formatIdle(vm.idleSeconds) : '—'),
    h('div', { class: 'flex gap-1' },
      button({ icon: 'monitor', variant: 'ghost', size: 'icon', ariaLabel: `${t('vm.act.gui')}: ${vm.name}`, disabled: !running, onClick: () => runVmAction(vm, 'gui') }),
      button({ icon: 'terminal', variant: 'ghost', size: 'icon', ariaLabel: `${t('vm.act.terminal')}: ${vm.name}`, disabled: !running, onClick: () => runVmAction(vm, 'terminal') })));
}

function activeVmSection(runningVms, totalVms) {
  return h('section', { 'aria-labelledby': 'dash-vms', 'data-active-vms-section': 'true' },
    h('div', { class: 'mb-2 flex items-center justify-between gap-2' },
      h('div', { class: 'flex items-center gap-2.5' },
        h('h2', { id: 'dash-vms', class: 't-section' }, t('vm.active.title')),
        runningVms.length > 0
          ? h('span', {
              'data-dashboard-running-badge': 'true',
              class: 'inline-flex items-center gap-1.5 rounded-full border border-[var(--success-border)] bg-[var(--success-bg)] px-2.5 py-0.5 text-xs font-mono font-medium text-[var(--success-text)]'
            }, t('vm.runningBadge', { n: runningVms.length }))
          : null
      ),
      h('a', { href: '/vms', 'data-link': true, class: 'text-sm text-muted transition-colors duration-150 hover:text-fg' }, t('dash.viewAll'))),
    runningVms.length
      ? h('ul', { class: 'divide-y divide-line border-y border-line' }, runningVms.slice(0, 5).map(activeVmRow))
      : emptyState({
          icon: 'server',
          title: t('vm.active.emptyTitle'),
          description: totalVms > 0
            ? `${totalVms} VM(s) currently stopped or unavailable. ${t('vm.active.emptyDesc')}`
            : t('vm.active.emptyDesc'),
          compact: true,
          action: h('div', { class: 'flex flex-wrap items-center justify-center gap-2' },
            button({ label: t('vm.active.launch'), icon: 'plus', variant: 'primary', href: '/vms/new' }),
            totalVms > 0
              ? button({ label: t('dash.viewAll'), variant: 'secondary', href: '/vms' })
              : null
          )
        }));
}

function quotaRow(label, used, limit, unit = '', testKey = '') {
  const safeLimit = Math.max(1, limit || 1);
  const pct = Math.min(100, Math.round((used / safeLimit) * 100));
  return h('div', { 'data-quota-row': testKey },
    h('div', { class: 'flex items-baseline justify-between text-sm' },
      h('span', { class: 'text-muted' }, label),
      h('span', { class: 'num font-mono', 'data-quota-value': testKey }, `${used} / ${limit}${unit}`)),
    h('div', {
      class: 'mt-2 h-1 rounded-full bg-raised', role: 'progressbar',
      'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct)
    }, h('div', { class: 'h-1 rounded-full bg-accent transition-[width] duration-200 ease-out', style: `width:${pct}%` })));
}

function sidePanel({ vms, runningVms, activity, user }) {
  const isStudent = user.role === 'student';
  const limit = isStudent ? (user.quota || { vcpu: 8, ram: 16, storage: 150, vms: 4 }) : POOL;
  const timeout = user.idleTimeoutMin ?? 60;

  // Stopped/missing/error/unknown VMs consume 0 vCPU and 0 RAM; disk still counts across all VM records.
  return h('div', { class: 'space-y-10' },
    h('section', { 'aria-labelledby': 'dash-quota' },
      h('div', { class: 'mb-4 flex items-baseline justify-between' },
        h('h2', { id: 'dash-quota', class: 't-section' }, t('dash.quota')),
        h('span', { class: 't-caption' }, t(isStudent ? 'quota.you' : 'quota.pool'))),
      h('div', { class: 'space-y-4' },
        quotaRow(t('quota.vcpu'), sum(runningVms, 'vcpu'), limit.vcpu, '', 'vcpu'),
        quotaRow(t('quota.ram'), sum(runningVms, 'ram'), limit.ram, ' GB', 'ram'),
        quotaRow(t('quota.storage'), sum(vms, 'disk'), limit.storage, ' GB', 'storage'),
        quotaRow(t('quota.vms'), runningVms.length, limit.vms, '', 'vms')),
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

function roleQuickBar(user, runningVms) {
  const firstRunning = runningVms[0] || null;
  const vmParam = firstRunning ? `?vm=${encodeURIComponent(firstRunning.id)}` : '';

  if (user.role === 'admin') {
    return h('section', { class: 'mb-8 rounded-xl border border-line bg-surface p-4 flex flex-wrap items-center justify-between gap-4' },
      h('div', { class: 'space-y-0.5' },
        h('div', { class: 'text-sm font-semibold text-fg' }, 'Administrator Control Center'),
        h('p', { class: 'text-xs text-muted' }, 'Manage user accounts, review VM approvals, or open active Kali Linux lab sessions.')
      ),
      h('div', { class: 'flex flex-wrap items-center gap-2' },
        button({ label: 'Manage Users & Passwords', icon: 'users', variant: 'primary', size: 'sm', href: '/admin/users' }),
        button({ label: 'Approvals', icon: 'clipboard-check', variant: 'secondary', size: 'sm', href: '/approvals' }),
        button({ label: 'Kali Desktop', icon: 'monitor', variant: 'secondary', size: 'sm', href: `/desktop${vmParam}`, disabled: !firstRunning }),
        button({ label: 'Terminal', icon: 'terminal', variant: 'ghost', size: 'sm', href: `/terminal${vmParam}`, disabled: !firstRunning })
      )
    );
  }

  if (user.role === 'instructor') {
    return h('section', { class: 'mb-8 rounded-xl border border-line bg-surface p-4 flex flex-wrap items-center justify-between gap-4' },
      h('div', { class: 'space-y-0.5' },
        h('div', { class: 'text-sm font-semibold text-fg' }, 'Instructor Workspace'),
        h('p', { class: 'text-xs text-muted' }, 'Monitor cohort students, process VM approvals, and inspect active lab machines.')
      ),
      h('div', { class: 'flex flex-wrap items-center gap-2' },
        button({ label: 'Students', icon: 'users', variant: 'primary', size: 'sm', href: '/admin/users' }),
        button({ label: 'Approvals', icon: 'clipboard-check', variant: 'secondary', size: 'sm', href: '/approvals' }),
        button({ label: 'Kali Desktop', icon: 'monitor', variant: 'secondary', size: 'sm', href: `/desktop${vmParam}`, disabled: !firstRunning }),
        button({ label: 'Terminal', icon: 'terminal', variant: 'ghost', size: 'sm', href: `/terminal${vmParam}`, disabled: !firstRunning })
      )
    );
  }

  return h('section', { class: 'mb-8 rounded-xl border border-line bg-surface p-4 flex flex-wrap items-center justify-between gap-4' },
    h('div', { class: 'space-y-0.5' },
      h('div', { class: 'text-sm font-semibold text-fg' }, 'Kali Linux Lab Workspace'),
      h('p', { class: 'text-xs text-muted' },
        firstRunning
          ? `Active lab: ${firstRunning.name} (${firstRunning.ip}). Ready for Remote Desktop and Terminal.`
          : t('vm.active.emptyDesc')
      )
    ),
    h('div', { class: 'flex flex-wrap items-center gap-2' },
      button({ label: 'Open Kali Desktop', icon: 'monitor', variant: 'primary', size: 'sm', href: `/desktop${vmParam}`, disabled: !firstRunning }),
      button({ label: 'Open Terminal', icon: 'terminal', variant: 'secondary', size: 'sm', href: `/terminal${vmParam}`, disabled: !firstRunning }),
      button({ label: 'New Kali VM', icon: 'plus', variant: 'ghost', size: 'sm', href: '/vms/new' })
    )
  );
}

function content({ vmState, vms, runningVms, metrics, activity, user }) {
  return h('div', {},
    dockerWarningBanner(vmState, { onRetry: () => refreshVms({ force: true }) }),
    roleQuickBar(user, runningVms),
    h('section', { class: 'grid grid-cols-1 divide-y divide-line border-y border-line sm:grid-cols-3 sm:divide-x sm:divide-y-0' },
      kpi({ label: t('kpi.boot'), value: metrics.boot.value.toFixed(1), unit: 's', hint: t('kpi.boot.hint'), series: metrics.boot.series, testId: 'boot' }),
      kpi({ label: t('kpi.connect'), value: metrics.connect.value.toFixed(1), unit: 's', hint: t('kpi.connect.hint'), series: metrics.connect.series, testId: 'connect' }),
      kpi({ label: t('kpi.running'), value: String(runningVms.length), hint: t('kpi.running.hint', { n: vms.length }), series: metrics.running.series, testId: 'running' })),
    h('div', { class: 'grid gap-12 pt-10 lg:grid-cols-[minmax(0,1fr)_300px]' },
      activeVmSection(runningVms, vms.length), sidePanel({ vms, runningVms, activity, user })));
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
  const headerHost = h('div', {});
  const body = h('div', {});
  const page = h('div', {}, headerHost, body);

  let metricsCache = null;
  let activityCache = [];

  function drawHeader(vmState) {
    headerHost.replaceChildren(
      pageHeader({
        title: t('dash.title'),
        description: t('dash.desc'),
        actions: h('div', { class: 'flex items-center gap-2.5' },
          liveStatusIndicator(vmState),
          button({ label: t('vm.new'), icon: 'plus', variant: 'primary', href: '/vms/new' })
        )
      })
    );
  }

  function render() {
    const vmState = getVmState();
    const user = useAuth().user;
    drawHeader(vmState);

    if (!user) return;
    if ((vmState.loading && !vmState.initialized) || !metricsCache) {
      body.replaceChildren(loading());
      return;
    }
    if (vmState.error && !vmState.initialized) {
      body.replaceChildren(errorState({ title: t('dash.error.title'), onRetry: () => refreshVms({ force: true }) }));
      return;
    }

    const vms = getVisibleVms();
    const runningVms = getRunningVms();
    body.replaceChildren(content({
      vmState,
      vms,
      runningVms,
      metrics: metricsCache,
      activity: activityCache,
      user
    }));
  }

  async function init() {
    render();
    try {
      const [metrics, activity] = await Promise.all([api.metrics(), api.activity(), refreshVms({ force: false, silent: true })]);
      metricsCache = metrics;
      activityCache = activity;
      render();
    } catch {
      body.replaceChildren(errorState({ title: t('dash.error.title'), onRetry: () => init() }));
    }
  }

  onCleanup(subscribeVms(() => render()));
  init();
  return PageContainer({ variant: 'default' }, page);
}
