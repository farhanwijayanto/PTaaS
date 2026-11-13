import { h } from '../../lib/dom.js';
import { t } from '../../lib/i18n.js';
import { api } from '../../lib/api.js';
import { navigate } from '../../lib/router.js';
import { OS } from '../../mock/vms.js';
import { confirmDialog } from '../../components/ui/dialog.js';
import { toast } from '../../components/ui/toast.js';

// Monogram tile instead of distro logos (Lucide has none) — keeps one consistent icon language.
export function osTile(os) {
  return h('span', {
    class: 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-raised text-sm font-semibold text-muted',
    title: OS[os]?.label, 'aria-hidden': 'true'
  }, OS[os]?.mono ?? '?');
}

export const specsText = (vm) => `${vm.vcpu} vCPU · ${vm.ram} GB · ${vm.disk} GB`;

// Single entry point for every VM action so confirm dialogs, toasts and errors behave the same everywhere.
export async function runVmAction(vm, action) {
  try {
    if (action === 'gui') return navigate(`/desktop?vm=${vm.id}`);
    if (action === 'terminal') return navigate(`/terminal?vm=${vm.id}`);
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
    toast({ title: t(`vm.toast.${action}`, { name: vm.name }), kind: action === 'delete' ? 'info' : 'success' });
  } catch (err) {
    toast({ title: t('common.error'), description: err.message, kind: 'error' });
  }
}

// Items for the row "more actions" menu.
export function vmMenuItems(vm) {
  const running = vm.status === 'running';
  return [
    { label: t('vm.act.gui'), icon: 'monitor', disabled: !running, onSelect: () => runVmAction(vm, 'gui') },
    { label: t('vm.act.terminal'), icon: 'terminal', disabled: !running, onSelect: () => runVmAction(vm, 'terminal') },
    { type: 'separator' },
    running
      ? { label: t('vm.act.stop'), icon: 'square', onSelect: () => runVmAction(vm, 'stop') }
      : { label: t('vm.act.start'), icon: 'play', disabled: vm.status === 'restarting', onSelect: () => runVmAction(vm, 'start') },
    { label: t('vm.act.restart'), icon: 'rotate-cw', disabled: !running, onSelect: () => runVmAction(vm, 'restart') },
    { label: t('vm.act.reset'), icon: 'timer-reset', disabled: !running, onSelect: () => runVmAction(vm, 'reset') },
    { type: 'separator' },
    { label: t('vm.act.delete'), icon: 'trash-2', danger: true, onSelect: () => runVmAction(vm, 'delete') }
  ];
}
