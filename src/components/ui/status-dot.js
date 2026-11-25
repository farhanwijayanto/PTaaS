import { h, cx, icon } from '../../lib/dom.js';
import { t } from '../../lib/i18n.js';
import { timeAgo } from '../../lib/format.js';

const STATUS_STYLE = {
  running: {
    dot: 'bg-accent',
    text: 'text-fg',
    badge: 'bg-[var(--success-bg)] text-[var(--success-text)] border-[var(--success-border)]',
  },
  starting: {
    dot: 'bg-warn motion-safe:animate-pulse',
    text: 'text-[var(--warning-text)]',
    badge: 'bg-[var(--warning-bg)] text-[var(--warning-text)] border-[var(--warning-border)]',
  },
  stopping: {
    dot: 'bg-warn',
    text: 'text-[var(--warning-text)]',
    badge: 'bg-[var(--warning-bg)] text-[var(--warning-text)] border-[var(--warning-border)]',
  },
  restarting: {
    dot: 'bg-warn motion-safe:animate-pulse',
    text: 'text-[var(--warning-text)]',
    badge: 'bg-[var(--warning-bg)] text-[var(--warning-text)] border-[var(--warning-border)]',
  },
  stopped: {
    dot: 'bg-subtle',
    text: 'text-muted',
    badge: 'bg-raised text-muted border-line',
  },
  paused: {
    dot: 'bg-[var(--info-text)]',
    text: 'text-[var(--info-text)]',
    badge: 'bg-[var(--info-bg)] text-[var(--info-text)] border-[var(--info-border)]',
  },
  missing: {
    dot: 'border border-[var(--danger-border)] bg-transparent',
    text: 'text-muted',
    badge: 'bg-surface text-muted border-[var(--danger-border)]',
  },
  error: {
    dot: 'bg-danger',
    text: 'text-[var(--danger-text)]',
    badge: 'bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-border)]',
  },
  unknown: {
    dot: 'bg-subtle opacity-60',
    text: 'text-muted',
    badge: 'bg-raised text-muted border-line',
  },
};

function labelForStatus(status) {
  const key = `vm.status.${status}`;
  const translated = t(key);
  return translated === key ? String(status || 'unknown') : translated;
}

/**
 * Accessible VM status indicator (dot + text label, never color alone).
 * Accepts either a status string or a full VM object for rich tooltips/reasons.
 */
export function statusDot(statusOrVm, opts = {}) {
  const isObj = statusOrVm && typeof statusOrVm === 'object';
  const status = isObj ? statusOrVm.status || 'unknown' : String(statusOrVm || 'unknown');
  const stale = isObj ? Boolean(statusOrVm.stale) : Boolean(opts.stale);
  const reason = isObj ? statusOrVm.statusReason : opts.reason;
  const restarting = isObj ? Boolean(statusOrVm.restarting) : Boolean(opts.restarting);
  const lastKnownStatus = isObj ? statusOrVm.lastKnownStatus : opts.lastKnownStatus;
  const updatedAt = isObj ? statusOrVm.statusUpdatedAt : opts.statusUpdatedAt;

  const effectiveKey = stale ? 'unknown' : status;
  const style = STATUS_STYLE[effectiveKey] || STATUS_STYLE.unknown;

  const tooltipParts = [];
  if (stale) {
    tooltipParts.push(t('vm.status.staleTooltip', {
      last: lastKnownStatus ? labelForStatus(lastKnownStatus) : labelForStatus('unknown'),
      time: updatedAt ? timeAgo(updatedAt) : '—'
    }));
  } else if (reason) {
    tooltipParts.push(reason);
  }
  if (updatedAt && !stale) {
    tooltipParts.push(t('vm.live.lastUpdated', { time: timeAgo(updatedAt) }));
  }

  const label = stale && lastKnownStatus
    ? `${labelForStatus(lastKnownStatus)} (${t('vm.status.stale')})`
    : labelForStatus(status);

  return h(
    'div',
    {
      class: cx('inline-flex flex-col gap-0.5', stale ? 'opacity-70' : ''),
      title: tooltipParts.join(' · ') || undefined,
      'data-vm-status': status,
      'data-stale': stale ? 'true' : 'false',
    },
    h(
      'span',
      { class: 'inline-flex items-center gap-2 text-sm' },
      h('span', { class: cx('h-2 w-2 shrink-0 rounded-full', style.dot), 'aria-hidden': 'true' }),
      h('span', { class: cx('font-medium', style.text) }, label),
      restarting && status === 'error'
        ? h('span', {
            class: 'rounded border border-[var(--warning-border)] bg-[var(--warning-bg)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--warning-text)]'
          }, t('vm.status.restarting'))
        : null,
      stale
        ? h('span', {
            class: 'rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[10px] text-muted'
          }, t('vm.status.stale'))
        : null
    ),
    !stale && status === 'error' && reason
      ? h('span', { class: 'pl-4 text-[11px] text-[var(--danger-text)] max-w-[240px] truncate' }, reason)
      : null
  );
}

/**
 * Subtle Live / Reconnecting / Demo simulation status pill with Last Updated tooltip.
 */
export function liveStatusIndicator(vmState) {
  if (!vmState) return null;

  const updatedLabel = vmState.statusUpdatedAt
    ? t('vm.live.lastUpdated', { time: timeAgo(vmState.statusUpdatedAt) })
    : t('vm.live.syncing');

  if (vmState.demoMode) {
    return h(
      'span',
      {
        class: 'inline-flex items-center gap-1.5 rounded-full border border-[var(--warning-border)] bg-[var(--warning-bg)] px-2.5 py-0.5 text-[11px] font-mono font-medium text-[var(--warning-text)]',
        title: updatedLabel,
        'data-demo-simulation': 'true',
      },
      h('span', { class: 'h-1.5 w-1.5 rounded-full bg-current', 'aria-hidden': 'true' }),
      t('vm.demo.label')
    );
  }

  if (!vmState.dockerReachable || vmState.stale) {
    return h(
      'span',
      {
        class: 'inline-flex items-center gap-1.5 rounded-full border border-[var(--danger-border)] bg-[var(--danger-bg)] px-2.5 py-0.5 text-[11px] font-mono font-medium text-[var(--danger-text)]',
        title: updatedLabel,
        'data-stream-state': 'unreachable',
      },
      h('span', { class: 'h-1.5 w-1.5 rounded-full bg-current', 'aria-hidden': 'true' }),
      t('vm.status.stale')
    );
  }

  const isLive = vmState.streamState === 'live';
  const isReconnecting = vmState.streamState === 'reconnecting';

  return h(
    'span',
    {
      class: cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-mono font-medium',
        isLive
          ? 'border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-text)]'
          : 'border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-text)]'
      ),
      title: updatedLabel,
      'data-stream-state': vmState.streamState,
    },
    h('span', {
      class: cx('h-1.5 w-1.5 rounded-full bg-current', isLive ? '' : 'motion-safe:animate-pulse'),
      'aria-hidden': 'true',
    }),
    isLive ? t('vm.live.connected') : isReconnecting ? t('vm.live.reconnecting') : t('vm.live.polling')
  );
}

/**
 * Warning banner displayed whenever Docker engine is unreachable in real mode.
 */
export function dockerWarningBanner(vmState, { onRetry } = {}) {
  if (!vmState || vmState.demoMode || vmState.dockerReachable) return null;

  return h(
    'div',
    {
      role: 'alert',
      'data-docker-unreachable': 'true',
      class: 'mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-xs text-[var(--danger-text)]',
    },
    h('div', { class: 'flex items-center gap-2.5 min-w-0' },
      icon('alert-triangle', 'w-4 h-4 shrink-0'),
      h('div', { class: 'space-y-0.5' },
        h('div', { class: 'font-semibold' }, t('vm.docker.unreachableTitle')),
        h('div', { class: 'opacity-90' }, t('vm.docker.unreachableDesc'))
      )
    ),
    onRetry
      ? h('button', {
          type: 'button',
          class: 'rounded-lg border border-[var(--danger-border)] bg-surface px-3 py-1.5 text-xs font-medium text-fg hover:bg-raised transition-colors cursor-pointer',
          onClick: onRetry,
        }, t('common.retry'))
      : null
  );
}
