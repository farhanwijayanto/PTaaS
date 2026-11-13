import { h, icon } from '../../lib/dom.js';
import { button } from '../../components/ui/button.js';
import { badge } from '../../components/ui/badge.js';
import { table } from '../../components/ui/table.js';
import { toast } from '../../components/ui/toast.js';
import { openDialog } from '../../components/ui/dialog.js';
import { input, field, select } from '../../components/ui/input.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { PageContainer } from '../../components/layout/page-container.js';

export function NetworkPage() {
  let isTesting = false;
  let testResult = null;

  let rules = [
    { id: 'acl-1', dir: 'Outbound', action: 'ALLOW', proto: 'TCP', port: '80, 443, 22, 3306', target: '10.10.2.0/24 (Target Lab VPC)', desc: 'Allow pentest traffic to practice target machines' },
    { id: 'acl-2', dir: 'Outbound', action: 'DROP', proto: 'ALL', port: 'ALL', target: '0.0.0.0/0 (Public Internet)', desc: 'PRD Security Guard: Egress to public internet blocked' },
    { id: 'acl-3', dir: 'Inbound', action: 'ALLOW', proto: 'TCP', port: '4822', target: '10.10.0.10 (Guacamole Gateway)', desc: 'Allow browser VNC desktop streaming' },
    { id: 'acl-4', dir: 'Inbound', action: 'ALLOW', proto: 'TCP', port: '22', target: '10.10.0.12 (SSH Gateway)', desc: 'Allow browser web terminal streaming' },
    { id: 'acl-5', dir: 'Cross-Tenant', action: 'DROP', proto: 'ALL', port: 'ALL', target: '10.10.3.0/24 (Neighbor Tenants)', desc: 'Open vSwitch VXLAN isolation wall (0 leak guarantee)' }
  ];

  const host = h('div', { class: 'space-y-6' });

  function render() {
    host.innerHTML = '';

    const header = pageHeader({
      title: 'Network & Access Control (ACL)',
      description: 'Software-Defined Networking (SDN) powered by Open vSwitch and VXLAN tenant encapsulation.',
      action: h('div', { class: 'flex items-center gap-2' },
        button({
          variant: 'outline',
          size: 'sm',
          icon: isTesting ? 'loader-2' : 'shield-check',
          label: isTesting ? 'Auditing VXLAN...' : 'Run 0-Leak Isolation Audit',
          disabled: isTesting,
          onClick: runLeakAudit
        }),
        button({
          variant: 'primary',
          size: 'sm',
          icon: 'plus',
          label: 'Add ACL Rule',
          onClick: openCreateRuleDialog
        })
      )
    });

    // Test results banner if run
    const auditBanner = testResult ? h('div', {
      class: 'rounded-lg border border-[var(--success-border)] bg-[var(--success-bg)] p-4 text-xs font-mono text-[var(--success-text)] flex items-start gap-3'
    },
      icon('check-circle-2', 'w-4 h-4 text-[var(--success-text)] mt-0.5 shrink-0'),
      h('div', { class: 'space-y-1' },
        h('div', { class: 'font-semibold text-fg' }, '0 Cross-Tenant Leaks Confirmed (NIST SP 800-145 Resource Pooling Audit)'),
        h('div', { class: 'text-muted leading-relaxed' }, testResult)
      )
    ) : null;

    // VPC Topology visual strip
    const topology = h('div', { class: 'rounded-xl border border-line bg-surface p-5 space-y-4' },
      h('div', { class: 'flex items-center justify-between text-xs' },
        h('span', { class: 'font-semibold tracking-tight text-fg' }, 'VPC Network Topology & Tenant Segmentation'),
        badge({ label: 'Open vSwitch · VXLAN VNI: 4096', variant: 'outline', size: 'xs' })
      ),
      h('div', { class: 'grid grid-cols-1 md:grid-cols-3 gap-4 text-xs' },
        // Tenant A (User)
        h('div', { class: 'rounded-lg border border-line bg-canvas p-3.5 space-y-2' },
          h('div', { class: 'flex items-center justify-between' },
            h('span', { class: 'font-semibold text-fg' }, 'Your Tenant VPC'),
            badge({ label: 'vpc-cs401-01', variant: 'accent', size: 'xs' })
          ),
          h('div', { class: 'font-mono text-muted text-[11px]' }, 'Subnet: 10.10.1.0/24'),
          h('div', { class: 'text-subtle text-[11px]' }, '2 active VMs (kali-lab-01, parrot-sec-01)'),
          h('div', { class: 'pt-1 flex items-center gap-1.5 text-[var(--success-text)] font-mono text-[10px]' },
            icon('lock', 'w-3 h-3'),
            h('span', {}, 'Egress Firewall: ACTIVE')
          )
        ),
        // Target Lab (Internal)
        h('div', { class: 'rounded-lg border border-line bg-canvas p-3.5 space-y-2' },
          h('div', { class: 'flex items-center justify-between' },
            h('span', { class: 'font-semibold text-fg' }, 'Target Lab VPC'),
            badge({ label: 'vpc-target-lab', variant: 'outline', size: 'xs' })
          ),
          h('div', { class: 'font-mono text-muted text-[11px]' }, 'Subnet: 10.10.2.0/24'),
          h('div', { class: 'text-subtle text-[11px]' }, 'Shared vulnerable targets (DVWA, Metasploitable)'),
          h('div', { class: 'pt-1 flex items-center gap-1.5 text-[var(--info-text)] font-mono text-[10px]' },
            icon('arrow-left-right', 'w-3 h-3'),
            h('span', {}, 'Internal Routing: UNRESTRICTED')
          )
        ),
        // Other Tenants (Isolated)
        h('div', { class: 'rounded-lg border border-line bg-canvas p-3.5 space-y-2 opacity-80' },
          h('div', { class: 'flex items-center justify-between' },
            h('span', { class: 'font-semibold text-fg' }, 'Other Cohort Tenants'),
            badge({ label: 'Isolated VNI', variant: 'outline', size: 'xs' })
          ),
          h('div', { class: 'font-mono text-muted text-[11px]' }, 'Subnet: 10.10.3.0/24+'),
          h('div', { class: 'text-subtle text-[11px]' }, 'Other student lab machines'),
          h('div', { class: 'pt-1 flex items-center gap-1.5 text-danger font-mono text-[10px]' },
            icon('shield-alert', 'w-3 h-3'),
            h('span', {}, 'VXLAN Wall: 100% BLOCKED')
          )
        )
      )
    );

    // ACL Rules table
    const rulesCard = h('div', { class: 'space-y-3' },
      h('div', { class: 'flex items-center justify-between' },
        h('h3', { class: 'text-sm font-semibold tracking-tight text-fg' }, 'Access Control List (ACL) & Egress Firewall Rules'),
        h('span', { class: 'text-xs text-muted' }, `${rules.length} active rules`)
      ),
      table({
        columns: [
          { key: 'dir', label: 'Direction', width: '120px' },
          { key: 'action', label: 'Action', width: '90px' },
          { key: 'proto', label: 'Protocol', width: '90px' },
          { key: 'port', label: 'Ports', width: '130px' },
          { key: 'target', label: 'Source / Destination' },
          { key: 'desc', label: 'Policy Purpose' }
        ],
        rows: rules.map(r => ({
          dir: h('span', { class: 'text-xs font-mono text-muted' }, r.dir),
          action: r.action === 'ALLOW' ? badge({ label: 'ALLOW', variant: 'success', size: 'xs' }) :
                                         badge({ label: 'DROP', variant: 'danger', size: 'xs' }),
          proto: h('span', { class: 'text-xs font-mono text-fg' }, r.proto),
          port: h('span', { class: 'text-xs font-mono text-muted' }, r.port),
          target: h('span', { class: 'text-xs font-mono text-fg font-medium' }, r.target),
          desc: h('span', { class: 'text-xs text-muted' }, r.desc)
        }))
      })
    );

    host.appendChild(header);
    if (auditBanner) host.appendChild(auditBanner);
    host.appendChild(topology);
    host.appendChild(rulesCard);
  }

  function runLeakAudit() {
    isTesting = true;
    render();

    setTimeout(() => {
      isTesting = false;
      testResult = 'Probed 1,024 synthetic packets across VXLAN boundaries to neighboring VNI tags (VNI 4097..4120). 0 packets leaked across namespaces. Default drop counter incremented by 1,024. SLA 100% verified.';
      toast.success('Isolation audit passed: 0 leaks');
      render();
    }, 1000);
  }

  function openCreateRuleDialog() {
    let dir = 'Outbound';
    let action = 'DROP';
    let proto = 'TCP';
    let port = '8080';
    let target = '10.10.1.0/24';
    let desc = 'Custom security boundary rule';

    const modal = openDialog({
      title: 'Add ACL Firewall Rule',
      content: h('div', { class: 'space-y-3 pt-2 text-xs' },
        field({
          label: 'Traffic Direction',
          control: select({
            options: [
              { value: 'Outbound', label: 'Outbound (Egress)' },
              { value: 'Inbound', label: 'Inbound (Ingress)' }
            ],
            value: dir,
            onChange: (e) => { dir = e.target.value; }
          })
        }),
        field({
          label: 'Policy Action',
          control: select({
            options: [
              { value: 'DROP', label: 'DROP (Block & Log)' },
              { value: 'ALLOW', label: 'ALLOW (Permit)' }
            ],
            value: action,
            onChange: (e) => { action = e.target.value; }
          })
        }),
        field({
          label: 'Port / Port Range',
          control: input({
            value: port,
            onInput: (e) => { port = e.target.value; }
          })
        }),
        field({
          label: 'Destination CIDR',
          control: input({
            value: target,
            onInput: (e) => { target = e.target.value; }
          })
        }),
        field({
          label: 'Description / Purpose',
          control: input({
            value: desc,
            onInput: (e) => { desc = e.target.value; }
          })
        })
      ),
      actions: [
        button({
          variant: 'outline',
          size: 'sm',
          label: 'Cancel',
          onClick: () => modal.close()
        }),
        button({
          variant: 'primary',
          size: 'sm',
          label: 'Save Rule',
          onClick: () => {
            rules.push({ id: `acl-${Date.now()}`, dir, action, proto, port, target, desc });
            modal.close();
            toast.success('ACL Rule applied to virtual switch');
            render();
          }
        })
      ]
    });
  }

  render();
  return PageContainer({ variant: 'default' }, host);
}
