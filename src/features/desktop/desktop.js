import Guacamole from 'guacamole-common-js';
import { h, icon } from '../../lib/dom.js';
import { api } from '../../lib/api.js';
import { navigate, onCleanup } from '../../lib/router.js';
import { button } from '../../components/ui/button.js';
import { badge } from '../../components/ui/badge.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { PageContainer } from '../../components/layout/page-container.js';

export function DesktopPage({ params, query } = {}) {
  let vms = [];
  let selectedVmId = query?.get('vm') || params?.id || null;
  let status = 'Connecting...';
  let lastError = null;
  let isFullscreen = false;
  let activeClient = null;
  let activeKeyboard = null;
  let activeResizeCleanup = null;
  let destroyed = false;

  const host = h('div', { class: 'space-y-4 font-sans select-none pb-8' });
  const headerContainer = h('div');
  const controlsContainer = h('div');
  const statusBanner = h('div', {
    role: 'status',
    class: 'flex items-center justify-between gap-2 px-4 py-2 text-xs font-mono border-b border-line bg-surface text-muted shrink-0'
  });
  const displayMount = h('div', {
    class: 'relative z-0 isolate flex-1 overflow-hidden flex items-center justify-center cursor-none',
    style: 'background-color: var(--ink-950);'
  });
  const viewportContainer = h('div', {
    class: 'relative flex flex-col overflow-hidden rounded-xl border border-line transition-all',
    'data-surface': 'dark',
    style: 'height: calc(100dvh - 210px); min-height: 540px; background-color: var(--ink-950);'
  }, statusBanner, displayMount);

  function getSelectedVm() {
    return vms.find((v) => v.id === selectedVmId || v.name === selectedVmId) || vms[0] || {
      id: 'vm-1',
      name: 'kali-lab-01',
      os: 'kali',
      ip: '10.10.1.5',
      status: 'running'
    };
  }

  function disconnectClient() {
    if (activeResizeCleanup) {
      activeResizeCleanup();
      activeResizeCleanup = null;
    }
    if (activeKeyboard) {
      activeKeyboard.onkeydown = null;
      activeKeyboard.onkeyup = null;
      activeKeyboard = null;
    }
    if (activeClient) {
      try { activeClient.disconnect(); } catch { /* ignore */ }
      activeClient = null;
    }
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

  function renderStatusBanner() {
    statusBanner.innerHTML = '';
    const vm = getSelectedVm();
    const toneClass = status === 'Connected'
      ? 'text-accent'
      : lastError ? 'text-danger' : 'text-muted';

    statusBanner.append(
      h('span', { class: 'flex items-center gap-2 font-medium text-fg' },
        icon('monitor', 'w-3.5 h-3.5 text-accent'),
        `${vm.name.toUpperCase()} // LIVE RDP`
      ),
      h('span', { class: `text-xs font-mono ${toneClass}` },
        lastError && !status.includes(lastError) ? `Status: ${status} | ${lastError}` : `Status: ${status}`
      )
    );
  }

  function renderHeader() {
    headerContainer.innerHTML = '';
    const vm = getSelectedVm();
    const statusTone = status === 'Connected' ? 'accent' : lastError ? 'danger' : 'neutral';
    headerContainer.appendChild(
      pageHeader({
        title: 'Remote Desktop',
        description: `Live Kali Linux RDP session for ${vm.name} (${vm.ip || '10.10.1.5'})`,
        actions: h('div', { class: 'flex items-center gap-2' },
          badge({ tone: statusTone, label: status, dot: true }),
          button({
            variant: 'secondary',
            size: 'sm',
            icon: 'terminal',
            label: 'Terminal',
            onClick: () => navigate(`/terminal?vm=${encodeURIComponent(vm.id)}`)
          })
        )
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
                connectGuacamole();
              }
            },
              vms.map((v) => h('option', {
                value: v.id,
                selected: v.id === vm.id,
                class: 'bg-surface text-fg'
              }, `${v.name} (${v.ip || '10.10.1.5'})`))
            )
          ),
          h('span', { class: 'text-xs font-mono text-muted' }, 'Guacamole RDP · Live')
        ),
        h('div', { class: 'flex items-center gap-2' },
          button({
            variant: 'secondary',
            size: 'xs',
            icon: 'rotate-cw',
            label: 'Reconnect',
            onClick: () => connectGuacamole()
          }),
          button({
            variant: 'ghost',
            size: 'xs',
            icon: 'external-link',
            label: 'Full Page (/lab)',
            onClick: () => { window.location.href = `/lab?vm=${encodeURIComponent(vm.id)}`; }
          }),
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

  async function connectGuacamole() {
    disconnectClient();
    if (destroyed) return;

    const vm = getSelectedVm();
    status = 'Connecting...';
    lastError = null;
    renderHeader();
    renderStatusBanner();

    const wsBase = process.env.NEXT_PUBLIC_GUAC_WS_URL;
    if (!wsBase) {
      status = 'Not configured';
      lastError = 'NEXT_PUBLIC_GUAC_WS_URL is not configured';
      renderHeader();
      renderStatusBanner();
      return;
    }

    try {
      const rect = displayMount.getBoundingClientRect();
      const width = Math.max(800, Math.min(1920, Math.round(rect.width || 1280)));
      const height = Math.max(600, Math.min(1080, Math.round(rect.height || 720)));

      const queryStr = new URLSearchParams({
        vm: vm.id,
        protocol: 'rdp',
        width: String(width),
        height: String(height)
      }).toString();

      const res = await fetch(`/api/guac-token?${queryStr}`, { credentials: 'same-origin' });
      if (res.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      const data = await res.json();
      if (!res.ok || !data?.token) {
        throw new Error(data?.error || 'Failed to obtain Guacamole session token');
      }
      if (destroyed) return;

      const baseWsUrl = `${wsBase.replace(/\/+$/, '')}/`;
      const tunnel = new Guacamole.WebSocketTunnel(baseWsUrl);

      tunnel.onerror = (err) => {
        if (destroyed) return;
        lastError = `Tunnel Error (code=${err?.code}): ${err?.message || 'connection failed'}`;
        status = 'Error';
        renderHeader();
        renderStatusBanner();
      };

      tunnel.onstatechange = (state) => {
        if (destroyed) return;
        if (state === 2 && !lastError) {
          status = 'Disconnected';
          renderHeader();
          renderStatusBanner();
        }
      };

      const client = new Guacamole.Client(tunnel);
      activeClient = client;
      const display = client.getDisplay();

      displayMount.innerHTML = '';
      displayMount.appendChild(display.getElement());

      const fitDisplay = () => {
        const dw = display.getWidth();
        const dh = display.getHeight();
        if (dw > 0 && dh > 0 && displayMount.clientWidth > 0 && displayMount.clientHeight > 0) {
          const scale = Math.min(displayMount.clientWidth / dw, displayMount.clientHeight / dh, 1);
          display.scale(scale);
        }
      };

      client.onstatechange = (state) => {
        if (destroyed) return;
        const states = ['Idle', 'Connecting...', 'Waiting...', 'Connected', 'Disconnecting...', 'Disconnected'];
        status = states[state] || 'Unknown';
        if (state === 3) {
          lastError = null;
          setTimeout(fitDisplay, 150);
        }
        renderHeader();
        renderStatusBanner();
      };

      client.onerror = (err) => {
        if (destroyed) return;
        lastError = `Client Error (code=${err?.code}): ${err?.message || 'upstream error'}`;
        status = 'Error';
        renderHeader();
        renderStatusBanner();
      };

      const mouse = new Guacamole.Mouse(display.getElement());
      mouse.onmousedown = mouse.onmouseup = mouse.onmousemove = (mouseState) => {
        const scale = display.getScale() || 1;
        const scaled = new Guacamole.Mouse.State(
          mouseState.x / scale,
          mouseState.y / scale,
          mouseState.left,
          mouseState.middle,
          mouseState.right,
          mouseState.up,
          mouseState.down
        );
        client.sendMouseState(scaled);
      };

      const keyboard = new Guacamole.Keyboard(document);
      activeKeyboard = keyboard;
      keyboard.onkeydown = (keysym) => {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        client.sendKeyEvent(1, keysym);
        return false;
      };
      keyboard.onkeyup = (keysym) => {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        client.sendKeyEvent(0, keysym);
      };

      const onResize = () => fitDisplay();
      window.addEventListener('resize', onResize);
      activeResizeCleanup = () => window.removeEventListener('resize', onResize);

      client.connect(`token=${encodeURIComponent(data.token)}`);
    } catch (err) {
      if (destroyed) return;
      lastError = err instanceof Error ? err.message : 'Failed to connect';
      status = 'Error';
      renderHeader();
      renderStatusBanner();
    }
  }

  async function init() {
    const list = await api.vms.list().catch(() => []);
    const runningVms = list.filter((v) => v.status === 'running');
    vms = runningVms.length ? runningVms : (list.length ? list : [
      { id: 'vm-1', name: 'kali-lab-01', os: 'kali', ip: '10.10.1.5', status: 'running' }
    ]);
    if (!selectedVmId && vms.length > 0) selectedVmId = vms[0].id;
    renderHeader();
    renderControls();
    renderStatusBanner();
    connectGuacamole();
  }

  const onFsChange = () => {
    isFullscreen = !!document.fullscreenElement;
    renderControls();
  };
  document.addEventListener('fullscreenchange', onFsChange);
  onCleanup(() => {
    destroyed = true;
    document.removeEventListener('fullscreenchange', onFsChange);
    disconnectClient();
  });

  host.appendChild(headerContainer);
  host.appendChild(controlsContainer);
  host.appendChild(viewportContainer);

  init();

  return PageContainer({ variant: 'full' }, host);
}
