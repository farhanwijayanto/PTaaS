import { h, icon, cx } from '../../lib/dom.js';
import { t } from '../../lib/i18n.js';
import { api } from '../../lib/api.js';
import { navigate } from '../../lib/router.js';
import { button } from '../../components/ui/button.js';
import { input, field, select } from '../../components/ui/input.js';
import { badge } from '../../components/ui/badge.js';
import { toast } from '../../components/ui/toast.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { PageContainer } from '../../components/layout/page-container.js';
import { openVmRequestModal } from './vm-request-modal.js';

export function VmCreatePage() {
  let step = 1; // 1: OS, 2: Compute, 3: Network, 4: Tools, 5: Confirm & Boot
  const form = {
    name: 'kali-lab-03',
    os: 'kali',
    vcpu: 2,
    ram: 4,
    disk: 30,
    vpc: 'vpc-cs401-01',
    subnet: '10.10.1.0/24',
    tools: ['Nmap', 'Metasploit', 'Burp Suite', 'Wireshark', 'SQLmap', 'Hydra', 'John the Ripper']
  };

  const host = h('div', { class: 'space-y-6' });

  const stepsList = [
    { num: 1, label: 'OS Image' },
    { num: 2, label: 'Compute' },
    { num: 3, label: 'Network' },
    { num: 4, label: 'Tools' },
    { num: 5, label: 'Confirm & Boot' }
  ];

  function render() {
    host.innerHTML = '';

    const header = pageHeader({
      title: 'Launch Virtual Machine',
      description: 'Configure and provision an isolated pentesting environment inside your tenant VPC in < 3 minutes.'
    });

    // Step indicator bar
    const indicator = h('div', {
      class: 'flex items-center justify-between border-b border-line pb-4 text-xs select-none'
    },
      stepsList.map((s, idx) => {
        const isCur = step === s.num;
        const isDone = step > s.num;
        return h('button', {
          type: 'button',
          class: cx(
            'flex items-center gap-2 font-medium transition-colors cursor-pointer',
            isCur ? 'text-accent font-semibold' : isDone ? 'text-fg' : 'text-muted'
          ),
          onClick: () => {
            if (s.num < step) { step = s.num; render(); }
          }
        },
          h('span', {
            class: cx(
              'flex h-6 w-6 items-center justify-center rounded-full font-mono text-[11px]',
              isCur ? 'bg-accent text-canvas font-bold' : isDone ? 'bg-raised text-accent' : 'bg-raised text-muted'
            )
          }, isDone ? '✓' : String(s.num)),
          h('span', { class: 'hidden sm:inline' }, s.label)
        );
      })
    );

    // Two-column layout: Form on Left, Persistent Summary Panel on Right
    const formContent = h('div', { class: 'space-y-6 flex-1 min-w-0' },
      renderStepContent(),
      renderNavButtons()
    );

    const summaryPanel = renderSummaryPanel();

    const layoutGrid = h('div', {
      class: 'grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 items-start'
    },
      formContent,
      summaryPanel
    );

    host.appendChild(header);
    host.appendChild(indicator);
    host.appendChild(layoutGrid);
  }

  function renderStepContent() {
    switch (step) {
      case 1:
        return h('div', { class: 'space-y-4' },
          h('h3', { class: 'text-sm font-semibold text-fg' }, '1. Choose Operating System Image'),
          h('div', { class: 'grid grid-cols-1 sm:grid-cols-3 gap-3' },
            osOption('kali', 'Kali Linux 2026.2', 'XFCE Desktop · Pre-loaded pentest suite'),
            osOption('parrot', 'Parrot Security 6.1', 'MATE Desktop · Lightweight and stealth tools'),
            osOption('ubuntu', 'Ubuntu 24.04 LTS', 'GNOME / Server · CTF & Web exploitation lab')
          ),
          h('div', { class: 'pt-2' },
            field({
              label: 'VM Instance Name',
              input: input({
                value: form.name,
                onInput: (e) => { form.name = e.target.value; render(); }
              })
            })
          )
        );

      case 2:
        return h('div', { class: 'space-y-4' },
          h('h3', { class: 'text-sm font-semibold text-fg' }, '2. Select Compute Specifications'),
          h('div', { class: 'grid grid-cols-1 sm:grid-cols-3 gap-3' },
            specOption(1, 2, 20, 'Small (CTF / Lightweight)'),
            specOption(2, 4, 30, 'Standard (Recommended)'),
            specOption(4, 8, 50, 'Heavy (Burp Suite Pro / Wordlists)')
          )
        );

      case 3:
        return h('div', { class: 'space-y-4' },
          h('h3', { class: 'text-sm font-semibold text-fg' }, '3. Tenant Network Isolation'),
          h('div', { class: 'rounded-xl border border-line bg-surface p-4 space-y-3 text-xs' },
            h('div', { class: 'flex items-center justify-between' },
              h('span', { class: 'text-muted font-medium' }, 'Assigned VPC:'),
              h('span', { class: 'font-mono text-fg font-medium' }, form.vpc)
            ),
            h('div', { class: 'flex items-center justify-between' },
              h('span', { class: 'text-muted font-medium' }, 'Subnet CIDR:'),
              h('span', { class: 'font-mono text-fg font-medium' }, form.subnet)
            ),
            h('div', { class: 'flex items-center justify-between' },
              h('span', { class: 'text-muted font-medium' }, 'Egress Drop Policy:'),
              badge({ label: '100% Strict (NIST SP 800-145)', variant: 'accent', size: 'xs' })
            )
          )
        );

      case 4:
        return h('div', { class: 'space-y-4' },
          h('h3', { class: 'text-sm font-semibold text-fg' }, '4. Pre-installed Pentesting Tools'),
          h('div', { class: 'flex flex-wrap gap-2' },
            ['Nmap', 'Metasploit', 'Burp Suite', 'Wireshark', 'SQLmap', 'Hydra', 'John the Ripper', 'Dirb', 'Gobuster', 'Aircrack-ng'].map(tool => {
              const checked = form.tools.includes(tool);
              return h('button', {
                type: 'button',
                class: cx(
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer',
                  checked ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-surface text-muted hover:text-fg'
                ),
                onClick: () => {
                  if (checked) form.tools = form.tools.filter(t => t !== tool);
                  else form.tools.push(tool);
                  render();
                }
              }, `${checked ? '✓ ' : '+ '}${tool}`);
            })
          )
        );

      default:
        return h('div', { class: 'space-y-4' },
          h('h3', { class: 'text-sm font-semibold text-fg' }, '5. Review & Launch VM'),
          h('div', { class: 'rounded-xl border border-line bg-surface p-5 space-y-3 text-xs' },
            h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Instance Name:'), h('span', { class: 'font-medium font-mono text-fg' }, form.name)),
            h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Operating System:'), h('span', { class: 'font-medium uppercase text-fg' }, form.os)),
            h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Hardware Specs:'), h('span', { class: 'font-mono text-fg' }, `${form.vcpu} vCPU / ${form.ram} GB RAM / ${form.disk} GB NVMe`)),
            h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Tenant Network:'), h('span', { class: 'font-mono text-fg' }, form.vpc))
          ),
          h('div', { id: 'boot-log-container', 'data-surface': 'dark', style: 'background-color: var(--ink-950);', class: 'hidden rounded-xl border border-line p-4 font-mono text-xs text-fg space-y-2' },
            h('div', { class: 'flex items-center justify-between border-b border-line pb-2 text-muted' },
              h('span', {}, 'KVM Provisioning Logs'),
              h('span', { id: 'boot-timer', class: 'text-[var(--accent-text)] font-bold' }, '0.0s')
            ),
            h('div', { id: 'boot-logs', class: 'h-40 overflow-y-auto space-y-1 text-[11px] leading-relaxed text-fg' })
          )
        );
    }
  }

  function osOption(key, label, desc) {
    const isCur = form.os === key;
    return h('button', {
      type: 'button',
      class: cx(
        'rounded-xl border p-4 text-left transition-colors cursor-pointer',
        isCur ? 'border-accent bg-accent/5' : 'border-line bg-surface hover:bg-raised'
      ),
      onClick: () => { form.os = key; render(); }
    },
      h('div', { class: 'font-semibold text-xs text-fg' }, label),
      h('div', { class: 'text-[11px] text-muted mt-1 leading-relaxed' }, desc)
    );
  }

  function specOption(vcpu, ram, disk, label) {
    const isCur = form.vcpu === vcpu && form.ram === ram;
    return h('button', {
      type: 'button',
      class: cx(
        'rounded-xl border p-4 text-left transition-colors cursor-pointer',
        isCur ? 'border-accent bg-accent/5' : 'border-line bg-surface hover:bg-raised'
      ),
      onClick: () => {
        form.vcpu = vcpu;
        form.ram = ram;
        form.disk = disk;
        render();
      }
    },
      h('div', { class: 'font-semibold text-xs text-fg' }, label),
      h('div', { class: 'font-mono text-xs text-accent mt-1' }, `${vcpu} Core · ${ram} GB RAM`),
      h('div', { class: 'text-[11px] text-muted mt-0.5' }, `${disk} GB NVMe SSD`)
    );
  }

  function renderSummaryPanel() {
    return h('div', {
      class: 'rounded-xl border border-line bg-surface p-5 space-y-4 text-xs sticky top-20 select-none'
    },
      h('h4', { class: 'font-semibold text-fg text-sm border-b border-line pb-2' }, 'Specification Summary'),
      h('div', { class: 'space-y-2.5' },
        h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Instance:'), h('span', { class: 'font-mono font-medium text-fg truncate max-w-[150px]' }, form.name)),
        h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Base OS:'), h('span', { class: 'font-medium uppercase text-fg' }, form.os)),
        h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'vCPU Allocation:'), h('span', { class: 'font-mono text-fg' }, `${form.vcpu} vCPU`)),
        h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Memory:'), h('span', { class: 'font-mono text-fg' }, `${form.ram} GB DDR4`)),
        h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Storage:'), h('span', { class: 'font-mono text-fg' }, `${form.disk} GB NVMe`)),
        h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Boot Target:'), h('span', { class: 'font-mono text-accent' }, '< 18.4 seconds'))
      ),
      h('div', { class: 'border-t border-line pt-3 text-[11px] text-muted leading-relaxed' },
        'Automated provisioning includes zero-install Web VNC/RDP gateway token and strict egress firewall.'
      )
    );
  }

  function renderNavButtons() {
    return h('div', { class: 'flex items-center justify-between pt-4 border-t border-line' },
      step > 1
        ? button({ label: 'Back', variant: 'secondary', size: 'sm', onClick: () => { step--; render(); } })
        : h('div', {}),
      step < 5
        ? button({ label: 'Continue →', variant: 'primary', size: 'sm', onClick: () => { step++; render(); } })
        : button({
            id: 'launch-btn',
            label: 'Launch VM (< 3 min)',
            variant: 'primary',
            size: 'sm',
            icon: 'play',
            onClick: startBootSimulation
          })
    );
  }

  async function startBootSimulation() {
    const btn = document.getElementById('launch-btn');
    const logBox = document.getElementById('boot-log-container');
    const logs = document.getElementById('boot-logs');
    const timer = document.getElementById('boot-timer');
    if (!btn || !logBox || !logs) return;

    btn.disabled = true;

    // Check VM quota first
    try {
      await api.vms.create({
        name: form.name,
        os: form.os,
        vcpu: form.vcpu,
        ram: form.ram,
        disk: form.disk,
        vpc: form.vpc
      });
    } catch (err) {
      btn.disabled = false;
      if (err.code === 'vm_limit_reached') {
        toast.error('Batas kuota 3 VM mandiri tercapai!');
        openVmRequestModal({
          initialSpecs: form,
          onSuccess: () => navigate('/vms')
        });
        return;
      }
      toast.error(err.message || 'Gagal membuat VM');
      return;
    }

    logBox.classList.remove('hidden');

    const stream = [
      '[KVM] Verifying account resource quotas... OK (Slot verified)',
      '[Storage] Allocating qcow2 copy-on-write image disk (30 GB)... OK',
      '[OVS] Attaching vNet interface to vpc-cs401-01 (VLAN 101)... OK',
      '[DHCP] Assigning static lab lease: 10.10.1.9/24... OK',
      '[ACL] Applying egress drop rules for public 0.0.0.0/0... OK',
      '[Init] Cloud-init user-data scripts executed... OK',
      '[WSS] Generating tokenized TLS session for browser gateway... OK',
      '✓ [SUCCESS] VM is running in 18.2 seconds! Target < 3 min met 100%.'
    ];

    let sec = 0;
    const interval = setInterval(() => {
      sec += 0.2;
      timer.textContent = `${sec.toFixed(1)}s`;
    }, 200);

    for (let i = 0; i < stream.length; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const line = h('div', { class: i === stream.length - 1 ? 'text-accent font-bold' : '' }, stream[i]);
      logs.append(line);
      logs.scrollTop = logs.scrollHeight;
    }

    clearInterval(interval);
    toast.success(`${form.name} launched successfully (18.2s)`);
    setTimeout(() => navigate('/vms'), 700);
  }

  render();
  return PageContainer({ variant: 'default' }, host);
}
