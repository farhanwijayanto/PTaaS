import { getVisibleVms } from '../../lib/vm-store.js';
import { formatIdle } from '../../lib/format.js';

// Updates visible [data-idle] countdown cells once a second using server-derived idleSeconds.
// Never mutates VM runtime status client-side; Docker remains the single source of truth.
export function startIdleTicker() {
  setInterval(() => {
    const nodes = document.querySelectorAll('[data-idle]');
    if (!nodes.length) return;
    const vms = getVisibleVms();
    const now = Date.now();
    nodes.forEach((el) => {
      const vm = vms.find((v) => v.id === el.dataset.idle);
      if (!vm || vm.status !== 'running' || vm.stale || vm.idleSeconds == null) {
        el.textContent = '—';
        return;
      }
      const updatedMs = vm.statusUpdatedAt ? Date.parse(vm.statusUpdatedAt) : now;
      const driftSec = Number.isFinite(updatedMs) ? Math.max(0, Math.floor((now - updatedMs) / 1000)) : 0;
      const remaining = Math.max(0, vm.idleSeconds - driftSec);
      el.textContent = formatIdle(remaining);
    });
  }, 1000);
}
