import { h, cx } from '../../lib/dom.js';
import { api } from '../../lib/api.js';
import { navigate } from '../../lib/router.js';
import { button } from '../../components/ui/button.js';
import { input, field } from '../../components/ui/input.js';
import { badge } from '../../components/ui/badge.js';
import { toast } from '../../components/ui/toast.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { PageContainer } from '../../components/layout/page-container.js';
import { openVmRequestModal } from './vm-request-modal.js';

export function VmCreatePage() {
  let step = 1; // 1: OS, 2: Compute, 3: Network, 4: Tools, 5: Confirm & Boot
  let createdVm = null;
  let launching = false;
  const form = {
    name: `kali-lab-${String(Math.floor(Math.random() * 89) + 10)}`,
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
      description: 'Configure and provision an isolated Kali Linux pentesting environment inside your tenant VPC.'
    });

    const indicator = h('div', {
      class: 'flex items-center justify-between border-b border-line pb-4 text-xs select-none'
    },
      stepsList.map((s) => {
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
      case 1: {
        const nameControl = input({
          id: 'vm-name-input',
          value: form.name,
          placeholder: 'kali-lab-02',
          mono: true,
          onInput: (val) => {
            form.name = val;
            const summaryName = document.getElementById('summary-vm-name');
            if (summaryName) summaryName.textContent = val || 'kali-lab-new';
          }
        });

        return h('div', { class: 'space-y-4' },
          h('div', { class: 'flex items-center justify-between' },
            h('h3', { class: 'text-sm font-semibold text-fg' }, '1. Choose Operating System Image'),
            badge({ label: 'Kali Linux Only', tone: 'accent' })
          ),
          h('div', { class: 'grid grid-cols-1 sm:grid-cols-3 gap-3' },
            osOption('kali', 'Kali Linux 2026.2', 'XFCE Desktop · Live RDP & Terminal ready', true),
            osOption('parrot', 'Parrot Security 6.1', 'MATE Desktop · Coming soon', false),
            osOption('ubuntu', 'Ubuntu 24.04 LTS', 'GNOME / Server · Coming soon', false)
          ),
          h('div', { class: 'pt-2' },
            field({
              id: 'vm-name-input',
              label: 'VM Instance Name',
              hint: 'Gunakan huruf kecil, angka, dan tanda hubung (contoh: kali-lab-02).',
              control: nameControl
            })
          )
        );
      }

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
              badge({ label: '100% Strict (NIST SP 800-145)', tone: 'accent' })
            )
          )
        );

      case 4:
        return h('div', { class: 'space-y-4' },
          h('h3', { class: 'text-sm font-semibold text-fg' }, '4. Pre-installed Pentesting Tools'),
          h('div', { class: 'flex flex-wrap gap-2' },
            ['Nmap', 'Metasploit', 'Burp Suite', 'Wireshark', 'SQLmap', 'Hydra', 'John the Ripper', 'Dirb', 'Gobuster', 'Aircrack-ng'].map((tool) => {
              const checked = form.tools.includes(tool);
              return h('button', {
                type: 'button',
                class: cx(
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer',
                  checked ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-surface text-muted hover:text-fg'
                ),
                onClick: () => {
                  if (checked) form.tools = form.tools.filter((item) => item !== tool);
                  else form.tools.push(tool);
                  render();
                }
              }, `${checked ? '✓ ' : '+ '}${tool}`);
            })
          )
        );

      default:
        return h('div', { class: 'space-y-4' },
          h('h3', { class: 'text-sm font-semibold text-fg' }, '5. Review & Launch Kali Linux VM'),
          h('div', { class: 'rounded-xl border border-line bg-surface p-5 space-y-3 text-xs' },
            h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Instance Name:'), h('span', { class: 'font-medium font-mono text-fg' }, form.name)),
            h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Operating System:'), h('span', { class: 'font-medium text-fg' }, 'Kali Linux 2026.2 (XFCE + RDP)')),
            h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Hardware Specs:'), h('span', { class: 'font-mono text-fg' }, `${form.vcpu} vCPU / ${form.ram} GB RAM / ${form.disk} GB NVMe`)),
            h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Tenant Network:'), h('span', { class: 'font-mono text-fg' }, form.vpc))
          ),
          h('div', { id: 'boot-log-container', 'data-surface': 'dark', style: 'background-color: var(--ink-950);', class: 'hidden rounded-xl border border-line p-4 font-mono text-xs text-fg space-y-2' },
            h('div', { class: 'flex items-center justify-between border-b border-line pb-2 text-muted' },
              h('span', {}, 'Kali Linux Provisioning Logs'),
              h('span', { id: 'boot-timer', class: 'text-[var(--accent-text)] font-bold' }, '0.0s')
            ),
            h('div', { id: 'boot-logs', class: 'h-40 overflow-y-auto space-y-1 text-[11px] leading-relaxed text-fg' })
          ),
          createdVm
            ? h('div', { class: 'flex flex-wrap items-center gap-2 rounded-xl border border-accent bg-accent/10 p-4' },
                h('span', { class: 'text-xs font-medium text-fg mr-auto' }, `${createdVm.name} siap digunakan!`),
                button({
                  label: 'Open Remote Desktop',
                  icon: 'monitor',
                  variant: 'primary',
                  size: 'sm',
                  onClick: () => navigate(`/desktop?vm=${encodeURIComponent(createdVm.id)}`)
                }),
                button({
                  label: 'Open Terminal',
                  icon: 'terminal',
                  variant: 'secondary',
                  size: 'sm',
                  onClick: () => navigate(`/terminal?vm=${encodeURIComponent(createdVm.id)}`)
                }),
                button({
                  label: 'View All VMs',
                  variant: 'ghost',
                  size: 'sm',
                  onClick: () => navigate('/vms')
                })
              )
            : null
        );
    }
  }

  function osOption(key, label, desc, available) {
    const isCur = form.os === key;
    return h('button', {
      type: 'button',
      disabled: !available,
      class: cx(
        'rounded-xl border p-4 text-left transition-colors',
        !available
          ? 'border-line bg-surface opacity-50 cursor-not-allowed'
          : isCur
            ? 'border-accent bg-accent/5 cursor-pointer'
            : 'border-line bg-surface hover:bg-raised cursor-pointer'
      ),
      onClick: () => {
        if (!available) return;
        form.os = key;
        render();
      }
    },
      h('div', { class: 'flex items-center justify-between gap-2' },
        h('div', { class: 'font-semibold text-xs text-fg' }, label),
        badge({ label: available ? 'Available' : 'Coming Soon', tone: available ? 'accent' : 'neutral' })
      ),
      h('div', { class: 'text-[11px] text-muted mt-1.5 leading-relaxed' }, desc)
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
        h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Instance:'), h('span', { id: 'summary-vm-name', class: 'font-mono font-medium text-fg truncate max-w-[150px]' }, form.name)),
        h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Base OS:'), h('span', { class: 'font-medium text-fg' }, 'Kali Linux')),
        h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'vCPU Allocation:'), h('span', { class: 'font-mono text-fg' }, `${form.vcpu} vCPU`)),
        h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Memory:'), h('span', { class: 'font-mono text-fg' }, `${form.ram} GB DDR4`)),
        h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Storage:'), h('span', { class: 'font-mono text-fg' }, `${form.disk} GB NVMe`)),
        h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Access:'), h('span', { class: 'font-mono text-accent' }, 'Live RDP + Terminal'))
      ),
      h('div', { class: 'border-t border-line pt-3 text-[11px] text-muted leading-relaxed' },
        'Saat ini pembuatan VM baru mendukung Kali Linux (XFCE Desktop + Guacamole RDP gateway).'
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
            attrs: { id: 'launch-btn' },
            label: createdVm ? 'VM Launched' : launching ? 'Launching…' : 'Launch Kali VM',
            variant: 'primary',
            size: 'sm',
            icon: 'play',
            disabled: !!createdVm || launching,
            onClick: startBootProvisioning
          })
    );
  }

  async function startBootProvisioning() {
    if (launching || createdVm) return;
    const btn = document.getElementById('launch-btn');
    const logBox = document.getElementById('boot-log-container');
    const logs = document.getElementById('boot-logs');
    const timer = document.getElementById('boot-timer');
    if (!logBox || !logs) return;

    const cleanName = (form.name || '').trim();
    if (!cleanName) {
      toast({ title: 'Validation error', description: 'Nama VM tidak boleh kosong.', kind: 'error' });
      return;
    }

    launching = true;
    if (btn) btn.disabled = true;

    let vm;
    try {
      vm = await api.vms.create({
        name: cleanName,
        os: 'kali',
        vcpu: form.vcpu,
        ram: form.ram,
        disk: form.disk,
        vpc: form.vpc
      });
    } catch (err) {
      launching = false;
      if (btn) btn.disabled = false;
      if (err.code === 'vm_limit_reached') {
        toast({ title: 'Batas kuota VM tercapai', description: err.message, kind: 'error' });
        openVmRequestModal({
          initialSpecs: form,
          onSuccess: () => navigate('/vms')
        });
        return;
      }
      toast({ title: 'Gagal membuat VM', description: err.message, kind: 'error' });
      return;
    }

    logBox.classList.remove('hidden');

    const stream = [
      `[PTaaS] Verifying quota for ${vm.name}... OK`,
      `[Image] Selecting Kali Linux (ptaas-kali:latest, ${vm.vcpu} vCPU / ${vm.ram} GB RAM)... OK`,
      `[Net] Attaching container network ${vm.vpc} (${vm.ip}/24)... OK`,
      '[RDP] Binding xrdp TLS port 3389 & Guacamole token channel... OK',
      `✓ [READY] ${vm.name} is running and ready for Remote Desktop & Terminal.`
    ];

    let sec = 0;
    const interval = setInterval(() => {
      sec += 0.2;
      if (timer) timer.textContent = `${sec.toFixed(1)}s`;
    }, 200);

    for (let i = 0; i < stream.length; i++) {
      await new Promise((r) => setTimeout(r, 180));
      const line = h('div', { class: i === stream.length - 1 ? 'text-accent font-bold' : '' }, stream[i]);
      logs.append(line);
      logs.scrollTop = logs.scrollHeight;
    }

    clearInterval(interval);
    launching = false;
    createdVm = vm;
    toast({ title: `${vm.name} created`, description: 'Kali Linux VM siap dibuka di Remote Desktop atau Terminal.', kind: 'success' });
    render();
  }

  render();
  return PageContainer({ variant: 'default' }, host);
}
