import { h } from '../../lib/dom.js';
import { t } from '../../lib/i18n.js';
import { api } from '../../lib/api.js';
import { navigate } from '../../lib/router.js';
import { OS } from '../../mock/vms.js';
import { confirmDialog, openDialog } from '../../components/ui/dialog.js';
import { button } from '../../components/ui/button.js';
import { toast } from '../../components/ui/toast.js';

export function osTile(os) {
  return h('span', {
    class: 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-raised text-sm font-semibold text-muted',
    title: OS[os]?.label, 'aria-hidden': 'true'
  }, OS[os]?.mono ?? '?');
}

export const specsText = (vm) => `${vm.vcpu} vCPU · ${vm.ram} GB · ${vm.disk} GB`;

export function openVmLogsDialog(vm) {
  const lines = Array.isArray(vm.lastLogs) && vm.lastLogs.length
    ? vm.lastLogs.join('\n')
    : 'No container log output available.';
  let dialog;
  dialog = openDialog({
    title: `${t('vm.logs.title')}: ${vm.name}`,
    description: vm.statusReason || undefined,
    body: h('pre', {
      'data-surface': 'dark',
      style: 'background-color: var(--ink-950);',
      class: 'max-h-72 overflow-auto rounded-lg border border-line p-3 font-mono text-xs text-fg whitespace-pre-wrap'
    }, lines),
    actions: [button({ label: t('common.close'), variant: 'primary', onClick: () => dialog.close() })]
  });
}

// Single entry point for every VM action so confirm dialogs, optimistic updates, toasts, and rollback behave identically everywhere.
export async function runVmAction(vm, action) {
  try {
    if (action === 'gui') return navigate(`/desktop?vm=${encodeURIComponent(vm.id)}`);
    if (action === 'terminal') return navigate(`/terminal?vm=${encodeURIComponent(vm.id)}`);
    if (action === 'logs') return openVmLogsDialog(vm);

    if (action === 'delete') {
      const ok = await confirmDialog({
        title: t('vm.delete.title', { name: vm.name }),
        description: t('vm.delete.desc'),
        confirmLabel: t('vm.act.delete'),
        danger: true
      });
      if (!ok) return;
    }

    await api.vms.action(vm.id, action);
    toast({
      title: t(`vm.toast.${action}`, { name: vm.name }),
      kind: action === 'delete' ? 'info' : 'success'
    });
  } catch (err) {
    toast({ title: t('common.error'), description: err.message, kind: 'error' });
  }
}

export async function runOrphanCleanup(orphan) {
  try {
    const ok = await confirmDialog({
      title: `${t('vm.act.cleanup')}: ${orphan.name}?`,
      description: t('vm.orphans.desc'),
      confirmLabel: t('vm.act.cleanup'),
      danger: true
    });
    if (!ok) return;
    await api.vms.cleanupOrphan(orphan.containerId);
    toast({ title: t('vm.toast.cleanup', { name: orphan.name }), kind: 'info' });
  } catch (err) {
    toast({ title: t('common.error'), description: err.message, kind: 'error' });
  }
}

// Row "more actions" menu derived strictly from Docker runtime status.
export function vmMenuItems(vm, { isAdmin = false } = {}) {
  const running = vm.status === 'running' && !vm.stale;
  const busy = vm.status === 'starting' || vm.status === 'stopping';
  const staleOrUnknown = vm.stale || vm.status === 'unknown';
  const isMissing = vm.status === 'missing';
  const canStart = !staleOrUnknown && !busy && (vm.status === 'stopped' || vm.status === 'paused' || (vm.status === 'error' && Boolean(vm.containerId)));
  const canRecreate = !staleOrUnknown && !busy && (isMissing || vm.status === 'error');

  const items = [
    { label: t('vm.act.gui'), icon: 'monitor', disabled: !running, onSelect: () => runVmAction(vm, 'gui') },
    { label: t('vm.act.terminal'), icon: 'terminal', disabled: !running, onSelect: () => runVmAction(vm, 'terminal') },
    { type: 'separator' },
  ];

  if (running) {
    items.push({ label: t('vm.act.stop'), icon: 'square', disabled: busy || staleOrUnknown, onSelect: () => runVmAction(vm, 'stop') });
  } else if (isMissing) {
    items.push({ label: t('vm.act.recreate'), icon: 'refresh-cw', disabled: !canRecreate, onSelect: () => runVmAction(vm, 'recreate') });
  } else {
    items.push({ label: t('vm.act.start'), icon: 'play', disabled: !canStart, onSelect: () => runVmAction(vm, 'start') });
    if (canRecreate) {
      items.push({ label: t('vm.act.recreate'), icon: 'refresh-cw', onSelect: () => runVmAction(vm, 'recreate') });
    }
  }

  items.push(
    { label: t('vm.act.restart'), icon: 'rotate-cw', disabled: !running, onSelect: () => runVmAction(vm, 'restart') },
    { label: t('vm.act.reset'), icon: 'timer-reset', disabled: !running, onSelect: () => runVmAction(vm, 'reset') }
  );

  if (isAdmin && Array.isArray(vm.lastLogs) && vm.lastLogs.length > 0) {
    items.push({ label: t('vm.logs.title'), icon: 'file-text', onSelect: () => runVmAction(vm, 'logs') });
  }

  items.push(
    { type: 'separator' },
    { label: t('vm.act.delete'), icon: 'trash-2', danger: true, disabled: busy, onSelect: () => runVmAction(vm, 'delete') }
  );

  return items;
}
