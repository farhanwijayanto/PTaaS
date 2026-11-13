import { h, icon } from '../../lib/dom.js';
import { api } from '../../lib/api.js';
import { onCleanup } from '../../lib/router.js';
import { button } from '../../components/ui/button.js';
import { badge } from '../../components/ui/badge.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { PageContainer } from '../../components/layout/page-container.js';
import { DEMO_DESKTOP_BANNER_TEXT } from '../../lib/demo-mode.js';

export function DesktopPage(params = {}) {
  let vms = [];
  let selectedVmId = params?.id || null;
  let resolution = '1920×1080';
  let isFullscreen = false;

  const host = h('div', { class: 'space-y-4 font-sans select-none pb-8' });
  const headerContainer = h('div');
  const controlsContainer = h('div');
  const viewportContainer = h('div', {
    class: 'relative flex flex-col overflow-hidden rounded-xl border border-line transition-all',
    'data-surface': 'dark',
    style: 'height: calc(100dvh - 210px); min-height: 520px; background-color: var(--ink-950);'
  });

  function getSelectedVm() {
    return vms.find((v) => v.id === selectedVmId) || vms[0] || {
      id: 'vm-1',
      name: 'kali-lab-01',
      os: 'Kali Linux 2024.3',
      ip: '10.10.1.5',
      status: 'running',
    };
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      viewportContainer.requestFullscreen?.().then(() => {
        isFullscreen = true;
        renderControls();
      }).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => {
        isFullscreen = false;
        renderControls();
      }).catch(() => {});
    }
  }

  function renderHeader() {
    headerContainer.innerHTML = '';
    const vm = getSelectedVm();
    headerContainer.appendChild(
      pageHeader({
        title: 'Remote Desktop',
        subtitle: `Static desktop preview for ${vm.name} (${vm.os || 'Kali Linux'})`,
        breadcrumbs: [{ label: 'Compute' }, { label: 'Desktop' }],
        actions: [
          badge({ tone: 'neutral', text: 'Demo Simulation' }),
        ],
      })
    );
  }

  function renderControls() {
    controlsContainer.innerHTML = '';
    const vm = getSelectedVm();
    controlsContainer.appendChild(
      h('div', { class: 'flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-2.5' },
        h('div', { class: 'flex items-center gap-3' },
          h('div', { class: 'flex items-center gap-2' },
            icon('monitor', 'w-4 h-4 text-accent'),
            h('select', {
              class: 'bg-transparent text-xs font-medium text-fg border border-line rounded-md px-2 py-1 outline-none cursor-pointer',
              value: vm.id,
              onChange: (e) => {
                selectedVmId = e.target.value;
                renderHeader();
                renderControls();
                renderViewport();
              }
            },
              vms.map((v) => h('option', {
                value: v.id,
                selected: v.id === vm.id,
                class: 'bg-surface text-fg'
              }, `${v.name} (${v.ip || '10.10.1.5'})`))
            )
          ),
          h('span', { class: 'text-xs font-mono text-muted' }, `RDP · ${resolution}`)
        ),
        h('div', { class: 'flex items-center gap-2' },
          button({
            variant: 'ghost',
            size: 'xs',
            icon: isFullscreen ? 'minimize-2' : 'maximize-2',
            label: isFullscreen ? 'Exit Fullscreen' : 'Fullscreen',
            onClick: toggleFullscreen
          })
        )
      )
    );
  }

  function renderViewport() {
    viewportContainer.innerHTML = '';
    const vm = getSelectedVm();

    // Non-dismissible demo banner
    const banner = h('div', {
      role: 'status',
      'data-demo-banner': 'true',
      class: 'flex items-center justify-between gap-2 px-4 py-2 text-xs font-mono border-b border-line bg-surface text-muted shrink-0'
    },
      h('span', { class: 'flex items-center gap-2 font-medium text-fg' },
        icon('shield-alert', 'w-3.5 h-3.5 text-accent'),
        DEMO_DESKTOP_BANNER_TEXT
      ),
      h('span', { class: 'text-[11px] text-muted hidden sm:inline' }, 'Live RDP/VNC requires local gateway/')
    );

    // Static Kali/Linux desktop simulation canvas (token-based dark surface)
    const desktopMock = h('div', {
      class: 'relative flex-1 flex flex-col justify-between p-6 overflow-hidden bg-canvas text-fg'
    },
      // Top XFCE panel simulation
      h('div', { class: 'flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] font-mono text-muted' },
        h('div', { class: 'flex items-center gap-3' },
          h('span', { class: 'font-semibold text-accent-text' }, 'Applications'),
          h('span', { class: 'text-subtle' }, '|'),
          h('span', { class: 'text-fg' }, `${vm.name} (${vm.ip || '10.10.1.5'})`)
        ),
        h('div', { class: 'flex items-center gap-3 text-muted' },
          h('span', {}, 'eth0: UP'),
          h('span', {}, 'vxlan-4096'),
          h('span', {}, '21:27 UTC')
        )
      ),

      // Center window preview
      h('div', { class: 'mx-auto my-auto w-full max-w-2xl rounded-xl border border-line-strong bg-surface shadow-2xl overflow-hidden' },
        h('div', { class: 'flex items-center justify-between px-3.5 py-2 border-b border-line bg-raised' },
          h('div', { class: 'flex items-center gap-2' },
            h('span', { class: 'w-2.5 h-2.5 rounded-full', style: 'background: var(--danger);' }),
            h('span', { class: 'w-2.5 h-2.5 rounded-full', style: 'background: var(--warning);' }),
            h('span', { class: 'w-2.5 h-2.5 rounded-full', style: 'background: var(--success);' }),
            h('span', { class: 'ml-2 text-xs font-mono text-muted' }, `student@${vm.name}: ~ (Static Preview)`)
          ),
          badge({ tone: 'accent', text: 'DEMO PREVIEW' })
        ),
        h('div', { class: 'p-5 font-mono text-xs leading-relaxed text-fg space-y-2' },
          h('div', { class: 'text-accent-text' }, '$ uname -a'),
          h('div', { class: 'text-muted' }, `Linux ${vm.name} 6.6.9-cloud-amd64 #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux`),
          h('div', { class: 'text-accent-text pt-1' }, '$ ip -br a'),
          h('div', { class: 'text-muted' }, `eth0  UP  ${vm.ip || '10.10.1.5'}/24   |   vxlan-4096  UP  10.10.2.1/24`),
          h('div', { class: 'mt-4 pt-3 border-t border-line text-[11px] text-muted' },
            'Interactive Guacamole RDP/VNC streaming is disabled in the public Vercel demo. Use the Web Terminal for simulated CLI commands, or run the separate gateway/ locally for real containers.'
          )
        )
      ),

      // Bottom dock simulation
      h('div', { class: 'mx-auto flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5 text-[11px] font-mono text-muted' },
        h('span', { class: 'px-2 py-0.5 rounded bg-raised text-fg font-medium' }, 'Terminal'),
        h('span', { class: 'px-2 py-0.5 rounded' }, 'Burp Suite'),
        h('span', { class: 'px-2 py-0.5 rounded' }, 'Wireshark'),
        h('span', { class: 'px-2 py-0.5 rounded' }, 'Nmap')
      )
    );

    viewportContainer.appendChild(banner);
    viewportContainer.appendChild(desktopMock);
  }

  async function init() {
    const list = await api.vms.list().catch(() => []);
    vms = list.length ? list : [
      { id: 'vm-1', name: 'kali-lab-01', os: 'Kali Linux 2024.3', ip: '10.10.1.5', status: 'running' },
      { id: 'vm-2', name: 'parrot-sec-01', os: 'Parrot Security 6.1', ip: '10.10.1.8', status: 'running' },
    ];
    if (!selectedVmId && vms.length > 0) selectedVmId = vms[0].id;
    renderHeader();
    renderControls();
    renderViewport();
  }

  const onFsChange = () => {
    isFullscreen = !!document.fullscreenElement;
    renderControls();
  };
  document.addEventListener('fullscreenchange', onFsChange);
  onCleanup(() => document.removeEventListener('fullscreenchange', onFsChange));

  host.appendChild(headerContainer);
  host.appendChild(controlsContainer);
  host.appendChild(viewportContainer);

  init();

  return PageContainer({ variant: 'full' }, host);
}
