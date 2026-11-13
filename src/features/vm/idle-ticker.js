import { vmDb } from '../../mock/vms.js';
import { logEvent } from '../../mock/audit.js';
import { emit } from '../../lib/events.js';
import { formatIdle } from '../../lib/format.js';
import { useAuth } from '../../lib/auth.js';
import { t } from '../../lib/i18n.js';
import { toast } from '../../components/ui/toast.js';

// Counts idle timers down once a second and updates every [data-idle] node in place
// (no re-render). A VM that reaches 00:00 is stopped, which is the PRD's auto-stop rule.
export function startIdleTicker() {
  setInterval(() => {
    let changed = false;
    for (const vm of vmDb) {
      if (vm.status !== 'running') continue;
      vm.idleSeconds = Math.max(0, vm.idleSeconds - 1);
      if (vm.idleSeconds === 0) {
        vm.status = 'stopped';
        changed = true;
        logEvent('AUTO_STOP', vm.name, 'AUTO_STOPPED');
        const { user } = useAuth();
        if (user && (user.role !== 'student' || vm.owner === user.id)) {
          toast({ title: t('vm.autostop', { name: vm.name }), kind: 'info' });
        }
      }
    }
    document.querySelectorAll('[data-idle]').forEach((el) => {
      const vm = vmDb.find((v) => v.id === el.dataset.idle);
      if (vm?.status === 'running') el.textContent = formatIdle(vm.idleSeconds);
    });
    if (changed) emit('vms:changed');
  }, 1000);
}
