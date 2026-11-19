import Guacamole from 'guacamole-common-js';
import { h, icon, cx } from '../../lib/dom.js';
import { api } from '../../lib/api.js';
import { navigate, onCleanup } from '../../lib/router.js';
import { subscribeTheme, getTheme } from '../../lib/theme.js';
import { button } from '../../components/ui/button.js';
import { toast } from '../../components/ui/toast.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { PageContainer } from '../../components/layout/page-container.js';
import { THEMES } from './terminal-themes.js';

const SNIPPETS = [
  { label: 'Nmap Lab Scan', cmd: 'nmap -sV 10.10.2.10', desc: 'Scan lab services & versions' },
  { label: 'Nmap Stealth SYN', cmd: 'nmap -sS -T4 10.10.2.10', desc: 'Fast SYN scan' },
  { label: 'System Process Monitor', cmd: 'top', desc: 'Interactive CPU/RAM process monitor' },
  { label: 'Kernel Architecture', cmd: 'uname -a', desc: 'Guest OS kernel release info' },
  { label: 'Current User Identity', cmd: 'whoami && id', desc: 'Print user ID & group' },
  { label: 'Network Interfaces', cmd: 'ip -br a', desc: 'Show guest VPC IP addresses' },
  { label: 'Ping Host Check', cmd: 'ping -c 3 10.10.1.2', desc: 'Test ICMP connectivity inside lab' },
  { label: 'List Home Files', cmd: 'ls -la ~', desc: 'Inspect home directory contents' }
];

function charToKeysym(ch) {
  const code = ch.codePointAt(0);
  if (code == null) return null;
  if (ch === '\n' || ch === '\r') return 0xFF0D;
  if (ch === '\t') return 0xFF09;
  if (code >= 0x20 && code <= 0x7E) return code;
  if (code >= 0xA0 && code <= 0xFF) return code;
  return 0x01000000 | code;
}

function sendCtrlKey(client, letterCode) {
  if (!client) return;
  client.sendKeyEvent(1, 0xFFE3); // Control_L down
  client.sendKeyEvent(1, letterCode);
  client.sendKeyEvent(0, letterCode);
  client.sendKeyEvent(0, 0xFFE3); // Control_L up
}

function sendTextToClient(client, text) {
  if (!client || !text) return;
  for (const ch of text) {
    const ks = charToKeysym(ch);
    if (ks != null) {
      client.sendKeyEvent(1, ks);
      client.sendKeyEvent(0, ks);
    }
  }
}

export function TerminalPage({ params, query } = {}) {
  let vms = [];
  let selectedVmId = query?.get('vm') || params?.id || null;
  let activeThemeKey = 'kali';
  let fontSize = 13;
  let isFullscreen = false;
  let showSnippets = false;
  let destroyed = false;

  let nextTabId = 1;
  let tabs = [];
  let activeTabId = null;
  let lastClipboardText = '';

  const host = h('div', { class: 'space-y-4 font-sans select-none pb-8' });
  const headerContainer = h('div', { class: 'pb-1' });
  const controlsRow = h('div', {
    class: 'flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5 text-xs transition-colors'
  });
  const terminalStackEl = h('div', { class: 'relative w-full h-full flex-1 overflow-hidden' });
  const mobileKeyBar = h('div', {
    class: 'hidden coarse:flex max-md:flex items-center gap-1.5 overflow-x-auto border-t px-3 py-1.5 text-xs text-fg'
  });

  const terminalCard = h('div', {
    'data-surface': 'dark',
    class: 'relative flex flex-col rounded-xl border overflow-hidden shadow-2xl transition-all',
    style: 'height: calc(100dvh - 180px); min-height: 540px;'
  });

  function resolveThemeKey() {
    if (activeThemeKey === 'app') {
      return getTheme() === 'light' ? 'light' : 'kali';
    }
    return THEMES[activeThemeKey] ? activeThemeKey : 'kali';
  }

  function resolveThemeObj() {
    return THEMES[resolveThemeKey()] || THEMES.kali;
  }

  function getActiveTab() {
    return tabs.find((t) => t.id === activeTabId) || null;
  }

  function getSelectedVm() {
    return vms.find((v) => v.id === selectedVmId || v.name === selectedVmId) || vms[0] || {
      id: 'vm-1',
      name: 'kali-lab-01',
      ip: '10.10.1.5',
      status: 'running'
    };
  }

  function disconnectTab(tab) {
    if (!tab) return;
    if (tab.resizeTimer) {
      clearTimeout(tab.resizeTimer);
      tab.resizeTimer = null;
    }
    if (tab.client) {
      try { tab.client.disconnect(); } catch { /* ignore */ }
      tab.client = null;
    }
  }

  function sendTabSize(tab) {
    if (!tab || !tab.client || tab.status !== 'connected') return;
    const w = Math.floor(tab.mount.clientWidth);
    const hPx = Math.floor(tab.mount.clientHeight);
    if (w >= 200 && hPx >= 120 && (w !== tab.lastW || hPx !== tab.lastH)) {
      tab.lastW = w;
      tab.lastH = hPx;
      try {
        tab.client.sendSize(w, hPx);
        tab.client.getDisplay().scale(1);
      } catch { /* ignore */ }
    }
  }

  function renderTabOverlay(tab) {
    tab.overlay.innerHTML = '';
    if (!tab.error) {
      tab.overlay.classList.add('hidden');
      return;
    }
    const vm = getSelectedVm();
    tab.overlay.classList.remove('hidden');
    tab.overlay.appendChild(
      h('div', { class: 'max-w-lg w-full rounded-xl border border-line bg-surface p-5 space-y-3 text-xs text-fg' },
        h('div', { class: 'flex items-center gap-2 font-semibold text-sm text-danger' },
          icon('alert-circle', 'w-4 h-4'),
          'SSH Connection Interrupted'
        ),
        h('p', { class: 'text-muted leading-relaxed' },
          `Koneksi live SSH ke ${vm.name} terputus (${tab.error}). Pastikan service ssh aktif di port 22 pada container Kali Linux.`
        ),
        h('div', { class: 'flex flex-wrap gap-2 pt-1' },
          button({ label: 'Reconnect SSH', icon: 'refresh-cw', variant: 'primary', size: 'sm', onClick: () => connectTab(tab) }),
          button({ label: 'Open Kali Desktop', icon: 'monitor', variant: 'secondary', size: 'sm', onClick: () => navigate(`/desktop?vm=${encodeURIComponent(vm.id)}`) })
        )
      )
    );
  }

  async function connectTab(tab) {
    if (destroyed || !tab) return;
    disconnectTab(tab);

    const vm = getSelectedVm();
    const startedAt = performance.now();
    tab.status = 'connecting';
    tab.error = null;
    tab.latency = null;
    tab.lastW = 0;
    tab.lastH = 0;
    renderTabOverlay(tab);
    renderControls();

    const wsBase = process.env.NEXT_PUBLIC_GUAC_WS_URL;
    if (!wsBase) {
      tab.status = 'disconnected';
      tab.error = 'NEXT_PUBLIC_GUAC_WS_URL is not configured';
      renderTabOverlay(tab);
      renderControls();
      return;
    }

    // Wait one animation frame so container has real laid-out dimensions
    await new Promise((r) => requestAnimationFrame(r));
    if (destroyed) return;

    const width = Math.max(480, Math.min(3840, Math.floor(tab.mount.clientWidth || terminalStackEl.clientWidth - 24 || 1120)));
    const height = Math.max(320, Math.min(2160, Math.floor(tab.mount.clientHeight || terminalStackEl.clientHeight - 24 || 560)));

    try {
      const qs = new URLSearchParams({
        vm: vm.id,
        protocol: 'ssh',
        width: String(width),
        height: String(height),
        fontSize: String(fontSize),
        theme: resolveThemeKey()
      }).toString();

      const res = await fetch(`/api/guac-token?${qs}`, { credentials: 'same-origin' });
      if (res.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      const data = await res.json();
      if (!res.ok || !data?.token) {
        throw new Error(data?.error || 'Failed to obtain SSH session token');
      }
      if (destroyed || !tabs.includes(tab)) return;

      const baseWsUrl = `${wsBase.replace(/\/+$/, '')}/`;
      const tunnel = new Guacamole.WebSocketTunnel(baseWsUrl);

      tunnel.onerror = (err) => {
        if (destroyed) return;
        tab.status = 'disconnected';
        tab.error = `Tunnel error (code=${err?.code}): ${err?.message || 'connection failed'}`;
        renderTabOverlay(tab);
        renderControls();
      };

      const client = new Guacamole.Client(tunnel);
      tab.client = client;
      const display = client.getDisplay();
      const displayEl = display.getElement();
      displayEl.style.margin = '0';

      tab.mount.innerHTML = '';
      tab.mount.appendChild(displayEl);

      // Capture clipboard data sent by Guacamole SSH when user selects text
      client.onclipboard = (stream, mimetype) => {
        if (!mimetype || !mimetype.startsWith('text/')) return;
        const reader = new Guacamole.StringReader(stream);
        let collected = '';
        reader.ontext = (chunk) => { collected += chunk; };
        reader.onend = () => {
          lastClipboardText = collected;
          if (collected && navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(collected).catch(() => {});
          }
        };
      };

      client.onstatechange = (state) => {
        if (destroyed) return;
        if (state === 3) {
          tab.status = 'connected';
          tab.error = null;
          tab.latency = Math.max(1, Math.round(performance.now() - startedAt));
          tab.lastW = width;
          tab.lastH = height;
          display.scale(1);
          setTimeout(() => sendTabSize(tab), 120);
        } else if (state === 1 || state === 2) {
          tab.status = 'connecting';
        } else if (state === 5) {
          tab.status = 'disconnected';
        }
        renderTabOverlay(tab);
        renderControls();
      };

      client.onerror = (err) => {
        if (destroyed) return;
        tab.status = 'disconnected';
        tab.error = `Client error (code=${err?.code}): ${err?.message || 'SSH upstream error'}`;
        renderTabOverlay(tab);
        renderControls();
      };

      const mouse = new Guacamole.Mouse(displayEl);
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

      client.connect(`token=${encodeURIComponent(data.token)}`);
    } catch (err) {
      if (destroyed) return;
      tab.status = 'disconnected';
      tab.error = err instanceof Error ? err.message : 'SSH connection failed';
      renderTabOverlay(tab);
      renderControls();
    }
  }

  function createNewTab(customTitle = null) {
    const tabId = nextTabId++;
    const title = customTitle || `Terminal ${tabId}`;

    const mount = h('div', {
      class: 'relative z-0 isolate w-full h-full overflow-hidden'
    });
    const overlay = h('div', {
      class: 'hidden absolute inset-0 z-10 flex items-center justify-center p-6 bg-canvas/85'
    });
    const container = h('div', {
      class: 'absolute inset-0 p-3 overflow-hidden outline-none',
      tabindex: '0'
    }, mount, overlay);

    terminalStackEl.appendChild(container);

    const tab = {
      id: tabId,
      title,
      container,
      mount,
      overlay,
      client: null,
      status: 'connecting',
      latency: null,
      error: null,
      lastW: 0,
      lastH: 0,
      resizeTimer: null
    };

    container.addEventListener('click', () => {
      container.focus();
    });

    tabs.push(tab);
    switchTab(tabId);
    connectTab(tab);
  }

  function switchTab(tabId) {
    activeTabId = tabId;
    tabs.forEach((t) => {
      if (t.id === tabId) {
        t.container.style.display = 'block';
        requestAnimationFrame(() => {
          sendTabSize(t);
          t.container.focus();
        });
      } else {
        t.container.style.display = 'none';
      }
    });
    renderControls();
  }

  function closeTab(tabId, e) {
    if (e) e.stopPropagation();
    const idx = tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;

    const tab = tabs[idx];
    disconnectTab(tab);
    if (tab.container.parentElement) {
      tab.container.parentElement.removeChild(tab.container);
    }
    tabs.splice(idx, 1);

    if (tabs.length === 0) {
      createNewTab();
    } else {
      const nextActive = tabs[Math.max(0, idx - 1)];
      switchTab(nextActive.id);
    }
  }

  function reconnectActiveTab() {
    const tab = getActiveTab();
    if (!tab) return;
    connectTab(tab);
    toast({ title: 'Reconnecting SSH', description: `Membuka ulang sesi ${tab.title}...`, kind: 'info' });
  }

  function copySelection() {
    if (lastClipboardText) {
      navigator.clipboard?.writeText(lastClipboardText).catch(() => {});
      toast({ title: 'Copied', description: 'Teks terminal disalin ke clipboard.', kind: 'success' });
    } else {
      toast({ title: 'Select text first', description: 'Blok teks di terminal untuk menyalin ke clipboard.', kind: 'info' });
    }
  }

  async function pasteClipboard() {
    const tab = getActiveTab();
    if (!tab?.client || tab.status !== 'connected') {
      toast({ title: 'Not connected', description: 'Tunggu koneksi SSH aktif sebelum paste.', kind: 'error' });
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        sendTextToClient(tab.client, text);
      }
    } catch {
      toast({ title: 'Clipboard blocked', description: 'Izinkan akses clipboard di browser.', kind: 'error' });
    }
  }

  function clearTerminal() {
    const tab = getActiveTab();
    if (!tab?.client || tab.status !== 'connected') return;
    sendCtrlKey(tab.client, 0x006C); // Ctrl+L
  }

  function changeFontSize(delta) {
    const next = Math.min(22, Math.max(10, fontSize + delta));
    if (next === fontSize) return;
    fontSize = next;
    renderControls();
    const active = getActiveTab();
    if (active) connectTab(active);
  }

  function applyThemeSurface() {
    const theme = resolveThemeObj();
    controlsRow.style.backgroundColor = theme.toolbarBg;
    controlsRow.style.borderColor = theme.toolbarBorder;
    controlsRow.style.color = theme.toolbarFg;
    mobileKeyBar.style.backgroundColor = theme.toolbarBg;
    mobileKeyBar.style.borderColor = theme.toolbarBorder;
    terminalCard.style.backgroundColor = theme.background;
    terminalCard.style.borderColor = theme.toolbarBorder;
  }

  function changeTheme(themeKey) {
    if (!THEMES[themeKey]) return;
    activeThemeKey = themeKey;
    applyThemeSurface();
    renderControls();
    const active = getActiveTab();
    if (active) connectTab(active);
  }

  function pasteSnippet(cmd) {
    const tab = getActiveTab();
    if (!tab?.client || tab.status !== 'connected') {
      toast({ title: 'Not connected', description: 'Terminal belum terhubung ke server Kali.', kind: 'error' });
      return;
    }
    sendTextToClient(tab.client, cmd);
    showSnippets = false;
    renderControls();
    toast({ title: 'Snippet inserted', description: 'Tekan Enter di terminal untuk menjalankan.', kind: 'info' });
  }

  function sendMobileKey(action) {
    const tab = getActiveTab();
    if (!tab?.client || tab.status !== 'connected') return;
    if (action.ctrl) {
      sendCtrlKey(tab.client, action.ctrl);
    } else if (action.keysym) {
      tab.client.sendKeyEvent(1, action.keysym);
      tab.client.sendKeyEvent(0, action.keysym);
    } else if (action.text) {
      sendTextToClient(tab.client, action.text);
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      terminalCard.requestFullscreen?.().then(() => {
        isFullscreen = true;
        renderControls();
        setTimeout(() => sendTabSize(getActiveTab()), 150);
      }).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => {
        isFullscreen = false;
        renderControls();
        setTimeout(() => sendTabSize(getActiveTab()), 150);
      }).catch(() => {});
    }
  }

  // Single global keyboard handler routed to the active live SSH tab
  const keyboard = new Guacamole.Keyboard(document);
  keyboard.onkeydown = (keysym) => {
    if (destroyed) return true;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    const tab = getActiveTab();
    if (!tab?.client || tab.status !== 'connected') return true;
    tab.client.sendKeyEvent(1, keysym);
    return false;
  };
  keyboard.onkeyup = (keysym) => {
    if (destroyed) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const tab = getActiveTab();
    if (!tab?.client || tab.status !== 'connected') return;
    tab.client.sendKeyEvent(0, keysym);
  };

  // Resize observer so live Kali SSH fills 100% of the terminal container smoothly
  const resizeObserver = new ResizeObserver(() => {
    const tab = getActiveTab();
    if (!tab) return;
    if (tab.resizeTimer) clearTimeout(tab.resizeTimer);
    tab.resizeTimer = setTimeout(() => sendTabSize(tab), 140);
  });
  resizeObserver.observe(terminalCard);

  const onFsChange = () => {
    isFullscreen = !!document.fullscreenElement;
    renderControls();
    setTimeout(() => sendTabSize(getActiveTab()), 150);
  };
  document.addEventListener('fullscreenchange', onFsChange);

  function renderHeader() {
    headerContainer.innerHTML = '';
    const vm = getSelectedVm();
    headerContainer.appendChild(
      pageHeader({
        title: 'Web Terminal',
        description: 'Native Linux interactive shell connected directly to your lab VM over an isolated SSH PTY gateway.',
        actions: h('div', { class: 'flex items-center gap-2' },
          button({
            variant: 'secondary',
            size: 'sm',
            icon: 'monitor',
            label: 'Open Desktop',
            onClick: () => navigate(`/desktop?vm=${encodeURIComponent(vm.id)}`)
          }),
          button({
            variant: 'secondary',
            size: 'sm',
            icon: 'refresh-cw',
            label: 'Reconnect',
            onClick: reconnectActiveTab
          })
        )
      })
    );
  }

  function renderControls() {
    controlsRow.innerHTML = '';
    applyThemeSurface();

    const activeTab = getActiveTab();
    const vm = getSelectedVm();

    // LEFT ZONE: VM Selector + Multi-Tab Bar (matching demo screenshot)
    const leftZone = h('div', { class: 'flex items-center gap-3 overflow-x-auto min-w-0' },
      h('div', { class: 'flex items-center gap-1.5 border-r border-line pr-3 shrink-0' },
        icon('server', 'w-3.5 h-3.5 text-muted'),
        h('select', {
          class: 'bg-transparent text-fg text-xs font-medium outline-none cursor-pointer pr-1',
          onChange: (e) => {
            selectedVmId = e.target.value;
            tabs.forEach((t) => {
              disconnectTab(t);
              if (t.container.parentElement) t.container.parentElement.removeChild(t.container);
            });
            tabs = [];
            renderHeader();
            createNewTab();
          }
        },
          vms.map((v) => h('option', {
            value: v.id,
            selected: v.id === vm.id,
            class: 'bg-surface text-fg'
          }, `${v.name} (${v.ip || '10.10.1.5'})`))
        )
      ),
      h('div', { class: 'flex items-center gap-1' },
        ...tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return h('button', {
            type: 'button',
            class: cx(
              'group flex items-center gap-2 rounded-md px-2.5 py-1 text-xs font-mono transition-colors cursor-pointer',
              isActive
                ? 'bg-raised text-fg font-semibold border border-line'
                : 'text-muted hover:text-fg hover:bg-surface'
            ),
            onClick: () => switchTab(tab.id)
          },
            h('span', {}, tab.title),
            tabs.length > 1
              ? h('span', {
                  class: 'opacity-60 hover:opacity-100 text-muted hover:text-danger',
                  onClick: (e) => closeTab(tab.id, e)
                }, '×')
              : null
          );
        }),
        h('button', {
          type: 'button',
          title: 'New SSH Terminal Tab',
          'aria-label': 'New Terminal Tab',
          class: 'flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-fg transition-colors cursor-pointer',
          onClick: () => createNewTab()
        }, icon('plus', 'w-3.5 h-3.5'))
      )
    );

    // Status pill matching demo UI ("Connected (12ms)")
    const statusText = activeTab?.status === 'connected'
      ? (activeTab.latency ? `Connected (${activeTab.latency}ms)` : 'Connected')
      : activeTab?.status === 'connecting'
        ? 'Connecting...'
        : 'Disconnected';
    const statusColor = activeTab?.status === 'connected'
      ? 'text-accent'
      : activeTab?.status === 'connecting'
        ? 'text-muted'
        : 'text-danger';

    // Snippets dropdown
    const snippetsWrapper = h('div', { class: 'relative' },
      h('button', {
        type: 'button',
        class: 'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted hover:bg-raised hover:text-fg transition-colors cursor-pointer',
        onClick: (e) => {
          e.stopPropagation();
          showSnippets = !showSnippets;
          renderControls();
        }
      }, icon('terminal', 'w-3.5 h-3.5'), h('span', {}, 'Snippets')),
      showSnippets
        ? h('div', {
            class: 'absolute right-0 top-8 z-30 w-72 rounded-xl border border-line bg-surface p-1.5 shadow-2xl space-y-0.5'
          },
            SNIPPETS.map((s) =>
              h('button', {
                type: 'button',
                class: 'w-full rounded-lg px-2.5 py-2 text-left hover:bg-raised transition-colors cursor-pointer',
                onClick: () => pasteSnippet(s.cmd)
              },
                h('div', { class: 'text-xs font-medium text-fg' }, s.label),
                h('div', { class: 'font-mono text-[11px] text-accent truncate mt-0.5' }, s.cmd)
              )
            )
          )
        : null
    );

    // RIGHT ZONE: Status, Snippets, Copy, Paste, Clear, Font Size, Theme, Fullscreen
    const rightZone = h('div', { class: 'flex flex-wrap items-center gap-2 shrink-0' },
      h('span', { class: `font-mono text-[11px] pr-2 border-r border-line ${statusColor}` }, statusText),
      snippetsWrapper,
      h('button', {
        type: 'button',
        title: 'Copy Selection',
        'aria-label': 'Copy Selection',
        class: 'flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-fg transition-colors cursor-pointer',
        onClick: copySelection
      }, icon('copy', 'w-3.5 h-3.5')),
      h('button', {
        type: 'button',
        title: 'Paste Clipboard',
        'aria-label': 'Paste Clipboard',
        class: 'flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-fg transition-colors cursor-pointer',
        onClick: pasteClipboard
      }, icon('clipboard-paste', 'w-3.5 h-3.5')),
      h('button', {
        type: 'button',
        title: 'Clear Terminal (Ctrl+L)',
        'aria-label': 'Clear Terminal',
        class: 'flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-fg transition-colors cursor-pointer',
        onClick: clearTerminal
      }, icon('trash-2', 'w-3.5 h-3.5')),
      h('div', { class: 'flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 font-mono text-[11px] text-muted' },
        h('button', {
          type: 'button',
          class: 'px-1 hover:text-fg cursor-pointer',
          onClick: () => changeFontSize(-1)
        }, '−'),
        h('span', { class: 'px-1 text-fg' }, `${fontSize}px`),
        h('button', {
          type: 'button',
          class: 'px-1 hover:text-fg cursor-pointer',
          onClick: () => changeFontSize(1)
        }, '+')
      ),
      h('select', {
        'aria-label': 'Terminal Theme',
        class: 'rounded-md border border-line bg-surface px-2 py-1 text-xs text-fg outline-none cursor-pointer',
        onChange: (e) => changeTheme(e.target.value)
      },
        Object.values(THEMES).map((th) =>
          h('option', {
            value: th.id,
            selected: th.id === activeThemeKey,
            class: 'bg-surface text-fg'
          }, th.name)
        )
      ),
      h('button', {
        type: 'button',
        title: isFullscreen ? 'Exit Fullscreen' : 'Fullscreen',
        'aria-label': 'Toggle Fullscreen',
        class: 'flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-fg transition-colors cursor-pointer',
        onClick: toggleFullscreen
      }, icon(isFullscreen ? 'minimize-2' : 'maximize-2', 'w-3.5 h-3.5'))
    );

    controlsRow.append(leftZone, rightZone);
  }

  function setupMobileKeys() {
    mobileKeyBar.innerHTML = '';
    const keys = [
      { label: 'ESC', keysym: 0xFF1B },
      { label: 'TAB', keysym: 0xFF09 },
      { label: 'CTRL-C', ctrl: 0x0063 },
      { label: 'CTRL-D', ctrl: 0x0064 },
      { label: 'CTRL-Z', ctrl: 0x007A },
      { label: '▲', keysym: 0xFF52 },
      { label: '▼', keysym: 0xFF54 },
      { label: '◀', keysym: 0xFF51 },
      { label: '▶', keysym: 0xFF53 },
      { label: '|', text: '|' },
      { label: '~', text: '~' },
      { label: '/', text: '/' },
      { label: '-', text: '-' }
    ];

    keys.forEach((k) => {
      mobileKeyBar.appendChild(
        h('button', {
          type: 'button',
          class: 'px-2 py-1 rounded bg-surface border border-line text-[11px] font-mono text-fg hover:bg-raised transition-all shrink-0 cursor-pointer',
          onClick: () => sendMobileKey(k)
        }, k.label)
      );
    });
  }

  async function loadVms() {
    try {
      const list = await api.vms.list().catch(() => []);
      const running = list.filter((v) => v.status === 'running');
      vms = running.length ? running : (list.length ? list : [
        { id: 'vm-1', name: 'kali-lab-01', ip: '10.10.1.5', status: 'running' }
      ]);
      if (!selectedVmId && vms.length > 0) {
        selectedVmId = vms[0].id;
      }
      renderHeader();
      renderControls();
      if (tabs.length === 0) {
        createNewTab();
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to load virtual machines', kind: 'error' });
    }
  }

  const closeSnippetsOnOutside = () => {
    if (showSnippets) {
      showSnippets = false;
      renderControls();
    }
  };
  document.addEventListener('click', closeSnippetsOnOutside);

  const unsubTheme = subscribeTheme(() => {
    if (activeThemeKey === 'app') {
      applyThemeSurface();
      const active = getActiveTab();
      if (active) connectTab(active);
    }
  });

  onCleanup(() => {
    destroyed = true;
    unsubTheme();
    document.removeEventListener('click', closeSnippetsOnOutside);
    document.removeEventListener('fullscreenchange', onFsChange);
    resizeObserver.disconnect();
    keyboard.onkeydown = null;
    keyboard.onkeyup = null;
    tabs.forEach((tab) => disconnectTab(tab));
    tabs = [];
  });

  setupMobileKeys();
  applyThemeSurface();

  terminalCard.appendChild(controlsRow);
  terminalCard.appendChild(terminalStackEl);
  terminalCard.appendChild(mobileKeyBar);

  host.appendChild(headerContainer);
  host.appendChild(terminalCard);

  loadVms();

  return PageContainer({ variant: 'full' }, host);
}
