import { h } from '../../../lib/dom.js';
import { onCleanup } from '../../../lib/router.js';
import { useInView, usePageVisibility } from '../decor/hooks.js';
import { isReducedOrLow } from '../decor/config.js';

export function createAuditCellVisual() {
  const container = h('div', {
    class: 'rounded-xl p-3 font-mono text-xs overflow-hidden',
    style: 'background-color: var(--surface-2); border: 1px solid var(--border-default);'
  });

  const stream = h('div', {
    class: 'mask-fade-y h-44 overflow-hidden relative space-y-2 text-[11px]'
  });

  const list = [
    { actor: 'student-41', act: 'VM_START', target: 'kali-lab-01', time: '10:14:02' },
    { actor: 'guard-acl', act: 'EGRESS_DROP', target: '8.8.8.8:53', time: '10:14:18' },
    { actor: 'student-41', act: 'GUI_CONNECT', target: '10.10.1.5', time: '10:14:22' },
    { actor: 'student-41', act: 'SCAN_BEGIN', target: '10.10.2.10', time: '10:15:01' },
    { actor: 'guard-ovs', act: 'VXLAN_ISOL', target: 'vpc-b-blocked', time: '10:15:33' },
    { actor: 'sys-timer', act: 'AUTO_STOP', target: 'ubuntu-dev-01', time: '10:16:00' },
    { actor: 'student-12', act: 'MFA_AUTH', target: 'Keycloak SSO', time: '10:16:40' }
  ];

  const logTrack = h('div', { class: 'space-y-1.5 transition-transform duration-500 ease-out' });
  list.forEach((item) => {
    logTrack.appendChild(renderLine(item));
  });

  stream.appendChild(logTrack);
  container.appendChild(stream);

  function renderLine(item) {
    const isDrop = item.act.includes('DROP') || item.act.includes('ISOL');
    return h('div', {
      class: 'flex items-center justify-between gap-2 p-1.5 rounded',
      style: 'background-color: var(--surface-1); border: 1px solid var(--border-subtle);'
    },
      h('div', { class: 'flex items-center gap-2' },
        h('span', {
          class: 'font-semibold',
          style: isDrop ? 'color: var(--warning-text);' : 'color: var(--accent-text);'
        }, item.act),
        h('span', { style: 'color: var(--text-secondary);' }, item.target)
      ),
      h('span', { class: 'text-[11px]', style: 'color: var(--text-muted);' }, item.time)
    );
  }

  // Strictly play 2 steps on reveal (one-shot) instead of an infinite interval to stay within motion budget
  let timer = null;
  const cleanupView = useInView(container, (visible) => {
    if (!visible || isReducedOrLow()) return;
    let step = 0;
    const advance = () => {
      if (step >= 2 || isReducedOrLow()) return;
      step++;
      logTrack.style.transform = `translate3d(0, -${step * 28}px, 0)`;
      timer = setTimeout(advance, 1200);
    };
    timer = setTimeout(advance, 600);
  }, { once: true });

  const cleanupVis = usePageVisibility((visible) => {
    if (!visible && timer) clearTimeout(timer);
  });

  onCleanup(() => {
    cleanupView();
    cleanupVis();
    if (timer) clearTimeout(timer);
  });

  return container;
}
