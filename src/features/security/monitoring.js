import { h, icon } from '../../lib/dom.js';
import { button } from '../../components/ui/button.js';
import { badge } from '../../components/ui/badge.js';
import { statusDot } from '../../components/ui/status-dot.js';
import { sparkline } from '../../components/ui/sparkline.js';
import { table } from '../../components/ui/table.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { PageContainer } from '../../components/layout/page-container.js';

export function MonitoringPage() {
  const host = h('div', { class: 'space-y-6' });

  const events = [
    { time: '02:58:12', type: 'SEC_DROP', source: '10.10.1.5:43912', dest: '8.8.8.8:53', proto: 'UDP', status: 'BLOCKED (Egress Policy)' },
    { time: '02:57:44', type: 'VNC_CONN', source: 'client-ip-session-41', dest: '10.10.1.5:4822', proto: 'WSS', status: 'ESTABLISHED (TLS 1.3)' },
    { time: '02:55:01', type: 'KVM_IO', source: 'vm-kali-lab-01', dest: 'nvme0n1p2', proto: 'SCSI', status: 'COW_SNAP_SYNC (0.8s)' },
    { time: '02:51:30', type: 'SDN_OVS', source: 'vif-cs-401', dest: 'vxlan-vni-4096', proto: 'VXLAN', status: 'ENCAP_OK (0 leaks)' },
    { time: '02:49:10', type: 'AUTH_MFA', source: 'john.doe@example.edu', dest: 'Keycloak SSO', proto: 'HTTPS', status: 'TOTP_VERIFIED' }
  ];

  function render() {
    host.innerHTML = '';

    const header = pageHeader({
      title: 'Infrastructure & Hypervisor Monitoring',
      description: 'Real-time telemetry from KVM/QEMU nodes, Open vSwitch virtual bridges, and WAF security filters.',
      action: h('div', { class: 'flex items-center gap-2' },
        badge({ label: 'Cluster: Node-01 (Active)', variant: 'success', size: 'sm' }),
        badge({ label: 'Kernel: Linux 6.6 KVM', variant: 'outline', size: 'sm' })
      )
    });

    // 4 KPI telemetry cards with sparklines
    const kpis = h('div', { class: 'grid grid-cols-1 md:grid-cols-4 gap-4 text-xs' },
      h('div', { class: 'rounded-xl border border-line bg-surface p-4 space-y-2' },
        h('div', { class: 'flex items-center justify-between text-muted' },
          h('span', { class: 'font-medium' }, 'Cluster CPU Load'),
          statusDot('running')
        ),
        h('div', { class: 'text-2xl font-semibold tracking-tight text-fg' }, '24.8%'),
        sparkline([18, 22, 20, 25, 29, 24, 25], { color: 'accent', height: 28 }),
        h('div', { class: 'text-[11px] text-muted' }, '16 / 64 Cores Active (AMD EPYC)')
      ),
      h('div', { class: 'rounded-xl border border-line bg-surface p-4 space-y-2' },
        h('div', { class: 'flex items-center justify-between text-muted' },
          h('span', { class: 'font-medium' }, 'Host Memory (RAM)'),
          statusDot('running')
        ),
        h('div', { class: 'text-2xl font-semibold tracking-tight text-fg' }, '112 GB'),
        sparkline([100, 104, 108, 110, 112, 112], { color: 'accent', height: 28 }),
        h('div', { class: 'text-[11px] text-muted' }, 'Allocated of 256 GB ECC DDR5')
      ),
      h('div', { class: 'rounded-xl border border-line bg-surface p-4 space-y-2' },
        h('div', { class: 'flex items-center justify-between text-muted' },
          h('span', { class: 'font-medium' }, 'Lab SDN Throughput'),
          icon('activity', 'w-3.5 h-3.5 text-[var(--info-text)]')
        ),
        h('div', { class: 'text-2xl font-semibold tracking-tight text-fg' }, '48.2 MB/s'),
        sparkline([32, 45, 41, 55, 48, 52, 48], { color: 'accent', height: 28 }),
        h('div', { class: 'text-[11px] text-muted' }, 'Open vSwitch · 12,400 pkts/s')
      ),
      h('div', { class: 'rounded-xl border border-line bg-surface p-4 space-y-2' },
        h('div', { class: 'flex items-center justify-between text-muted' },
          h('span', { class: 'font-medium' }, 'Public Egress Drop'),
          badge({ label: '100% BLOCKED', variant: 'success', size: 'xs' })
        ),
        h('div', { class: 'text-2xl font-semibold tracking-tight text-[var(--success-text)]' }, '0 Leaks'),
        sparkline([0, 0, 0, 0, 0, 0, 0], { color: 'accent', height: 28 }),
        h('div', { class: 'text-[11px] text-muted' }, 'NIST SP 800-145 Guard Active')
      )
    );

    // Live Event Stream Table
    const stream = h('div', { class: 'space-y-3' },
      h('div', { class: 'flex items-center justify-between' },
        h('h3', { class: 'text-sm font-semibold tracking-tight text-fg' }, 'Live Kernel & Security Telemetry Stream'),
        h('span', { class: 'text-xs text-muted' }, 'Streaming via sysfs / auditd')
      ),
      table({
        columns: [
          { key: 'time', label: 'Timestamp', width: '110px' },
          { key: 'type', label: 'Subsystem', width: '130px' },
          { key: 'source', label: 'Source', width: '170px' },
          { key: 'dest', label: 'Destination', width: '170px' },
          { key: 'proto', label: 'Proto', width: '80px' },
          { key: 'status', label: 'Action & Status' }
        ],
        rows: events.map(ev => ({
          time: h('span', { class: 'text-xs font-mono text-subtle' }, ev.time),
          type: badge({ label: ev.type, variant: ev.type === 'SEC_DROP' ? 'danger' : 'outline', size: 'xs' }),
          source: h('span', { class: 'text-xs font-mono text-muted' }, ev.source),
          dest: h('span', { class: 'text-xs font-mono text-fg font-medium' }, ev.dest),
          proto: h('span', { class: 'text-xs font-mono text-muted' }, ev.proto),
          status: h('span', {
            class: `text-xs font-mono ${ev.type === 'SEC_DROP' ? 'text-[var(--danger-text)] font-medium' : 'text-[var(--success-text)]'}`
          }, ev.status)
        }))
      })
    );

    host.appendChild(header);
    host.appendChild(kpis);
    host.appendChild(stream);
  }

  render();
  return PageContainer({ variant: 'wide' }, host);
}
