import Guacamole from 'guacamole-common-js';
import { h, icon } from '../../lib/dom.js';
import { t } from '../../lib/i18n.js';
import { on } from '../../lib/events.js';
import { navigate, onCleanup } from '../../lib/router.js';
import {
  getVmState,
  getVisibleVms,
  getRunningVms,
  subscribeVms,
  refreshVms,
} from '../../lib/vm-store.js';
import { button } from '../../components/ui/button.js';
import { badge } from '../../components/ui/badge.js';
import { emptyState } from '../../components/ui/empty-state.js';
import { dockerWarningBanner, liveStatusIndicator } from '../../components/ui/status-dot.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { PageContainer } from '../../components/layout/page-container.js';
import { runVmAction } from '../vm/vm-actions.js';

export function DesktopPage({ params, query } = {}) {
  let selectedVmId = query?.get('vm') || params?.id || null;
  let connectedVmId = null;
  let status = 'Idle';
  let lastError = null;
  let stoppedBannerMessage = null;
  let isFullscreen = false;
  let activeClient = null;
  let activeKeyboard = null;
  let activeResizeCleanup = null;
  let destroyed = false;

  const host = h('div', { class: 'space-y-4 font-sans select-none pb-8' });
  const headerContainer = h('div');
  const bannerContainer = h('div');
  const controlsContainer = h('div');
  const mainBodyContainer = h('div');

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

  function getSelectedRunningVm() {
    const running = getRunningVms();
    if (!running.length) return null;
    const match = running.find((v) => v.id === selectedVmId || v.name === selectedVmId);
    if (match) return match;
    return running[0];
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
    connectedVmId = null;
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      viewportContainer.requestFullscreen?.().then(() => {
        isFullscreen = true;
        renderAll();
      }).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => {
        isFullscreen = false;
        renderAll();
      }).catch(() => {});
    }
  }

  function renderStatusBanner(vm) {
    statusBanner.innerHTML = '';
    if (!vm) return;
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

  function renderAll() {
    const vmState = getVmState();
    const allVms = getVisibleVms();
    const runningVms = getRunningVms();
    const vm = getSelectedRunningVm();

    if (vm && selectedVmId !== vm.id) {
      selectedVmId = vm.id;
    }

    // If we were connected to a VM that is no longer running, close the session immediately
    if (connectedVmId && !runningVms.some((v) => v.id === connectedVmId)) {
      disconnectClient();
      status = 'Disconnected';
      stoppedBannerMessage = t('vm.session.stoppedBanner');
    }

    const statusTone = status === 'Connected' ? 'accent' : (lastError || stoppedBannerMessage) ? 'danger' : 'neutral';
    headerContainer.replaceChildren(
      pageHeader({
        title: 'Remote Desktop',
        description: vm
          ? `Live Kali Linux RDP session for ${vm.name} (${vm.ip || '—'})`
          : t('vm.session.noRunningDesc'),
        actions: h('div', { class: 'flex items-center gap-2' },
          liveStatusIndicator(vmState),
          vm ? badge({ tone: statusTone, label: status, dot: true }) : null,
          vm
            ? button({
                variant: 'secondary',
                size: 'sm',
                icon: 'terminal',
                label: 'Terminal',
                onClick: () => navigate(`/terminal?vm=${encodeURIComponent(vm.id)}`)
              })
            : null
        )
      })
    );

    const banners = [];
    const dockerBanner = dockerWarningBanner(vmState, { onRetry: () => refreshVms({ force: true }) });
    if (dockerBanner) banners.push(dockerBanner);
    if (stoppedBannerMessage) {
      banners.push(
        h('div', {
          role: 'alert',
          'data-session-stopped-banner': 'true',
          class: 'flex items-center justify-between gap-3 rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-3 text-xs text-[var(--warning-text)]'
        },
          h('div', { class: 'flex items-center gap-2 font-medium' },
            icon('alert-circle', 'w-4 h-4 shrink-0'),
            stoppedBannerMessage
          ),
          button({
            label: t('common.close'),
            variant: 'ghost',
            size: 'xs',
            onClick: () => { stoppedBannerMessage = null; renderAll(); }
          })
        )
      );
    }
    bannerContainer.replaceChildren(...banners);

    if (!runningVms.length) {
      disconnectClient();
      controlsContainer.replaceChildren();
      const firstStopped = allVms.find((v) => v.status === 'stopped' && !v.stale);
      mainBodyContainer.replaceChildren(
        h('div', { 'data-desktop-empty': 'true', class: 'rounded-xl border border-line bg-surface p-8' },
          emptyState({
            icon: 'monitor-off',
            title: t('vm.session.noRunningTitle'),
            description: t('vm.session.noRunningDesc'),
            action: h('div', { class: 'flex flex-wrap items-center justify-center gap-2' },
              firstStopped
                ? button({
                    label: t('vm.session.startExisting', { name: firstStopped.name }),
                    icon: 'play',
                    variant: 'primary',
                    onClick: () => runVmAction(firstStopped, 'start')
                  })
                : null,
              button({
                label: t('vm.active.launch'),
                icon: 'plus',
                variant: firstStopped ? 'secondary' : 'primary',
                href: '/vms/new'
              })
            )
          })
        )
      );
      return;
    }

    controlsContainer.replaceChildren(
      h('div', { class: 'flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-2.5' },
        h('div', { class: 'flex items-center gap-3' },
          h('div', { class: 'flex items-center gap-2' },
            icon('monitor', 'w-4 h-4 text-accent'),
            h('select', {
              'data-desktop-vm-selector': 'true',
              'aria-label': 'Select running virtual machine',
              class: 'bg-transparent text-xs font-medium text-fg border border-line rounded-md px-2 py-1 outline-none cursor-pointer',
              value: vm.id,
              onChange: (e) => {
                selectedVmId = e.target.value;
                stoppedBannerMessage = null;
                connectGuacamole();
              }
            },
              runningVms.map((v) => h('option', {
                value: v.id,
                selected: v.id === vm.id,
                class: 'bg-surface text-fg'
              }, `${v.name} (${v.ip || '—'})`))
            )
          ),
          h('span', { class: 'text-xs font-mono text-muted' }, 'Guacamole RDP')
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

    if (mainBodyContainer.firstChild !== viewportContainer) {
      mainBodyContainer.replaceChildren(viewportContainer);
    }
    renderStatusBanner(vm);

    // Automatically connect when a running VM becomes available and not yet connected
    if (vm && !connectedVmId && !stoppedBannerMessage && status === 'Idle') {
      void connectGuacamole();
    }
  }

  async function connectGuacamole() {
    disconnectClient();
    if (destroyed) return;

    const vm = getSelectedRunningVm();
    if (!vm) {
      renderAll();
      return;
    }

    connectedVmId = vm.id;
    status = 'Connecting...';
    lastError = null;
    renderAll();

    const wsBase = process.env.NEXT_PUBLIC_GUAC_WS_URL;
    if (!wsBase) {
      status = 'Not configured';
      lastError = 'NEXT_PUBLIC_GUAC_WS_URL is not configured';
      renderAll();
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
        renderAll();
      };

      tunnel.onstatechange = (state) => {
        if (destroyed) return;
        if (state === 2 && !lastError) {
          status = 'Disconnected';
          renderAll();
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
        renderAll();
      };

      client.onerror = (err) => {
        if (destroyed) return;
        lastError = `Client Error (code=${err?.code}): ${err?.message || 'upstream error'}`;
        status = 'Error';
        renderAll();
      };

      const mouse = new Guacamole.Mouse(display.getElement());
      mouse.onmousedown = mouse.onmouseup = mouse.onmousemove = (mouseState) => {
        const scale = display.getScale() || 1;
        client.sendMouseState(new Guacamole.Mouse.State(
          mouseState.x / scale,
          mouseState.y / scale,
          mouseState.left,
          mouseState.middle,
          mouseState.right,
          mouseState.up,
          mouseState.down
        ));
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
      renderAll();
    }
  }

  const onFsChange = () => {
    isFullscreen = !!document.fullscreenElement;
    renderAll();
  };
  document.addEventListener('fullscreenchange', onFsChange);

  const unsubVms = subscribeVms(() => renderAll());
  const unsubInvalidated = on('vm:session_invalidated', (evt) => {
    if (evt?.vmId && (evt.vmId === connectedVmId || evt.vmId === selectedVmId)) {
      disconnectClient();
      status = 'Disconnected';
      stoppedBannerMessage = evt.reason || t('vm.session.stoppedBanner');
      renderAll();
    }
  });

  onCleanup(() => {
    destroyed = true;
    unsubVms();
    unsubInvalidated();
    document.removeEventListener('fullscreenchange', onFsChange);
    disconnectClient();
  });

  host.append(headerContainer, bannerContainer, controlsContainer, mainBodyContainer);
  renderAll();
  void refreshVms({ force: false, silent: true });

  return PageContainer({ variant: 'full' }, host);
}
