import Guacamole from 'guacamole-common-js';
import { h, icon, cx } from '../../lib/dom.js';
import { api } from '../../lib/api.js';
import { navigate, onCleanup } from '../../lib/router.js';
import { subscribeTheme, getTheme } from '../../lib/theme.js';
import { button } from '../../components/ui/button.js';
import { badge } from '../../components/ui/badge.js';
import { toast } from '../../components/ui/toast.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { PageContainer } from '../../components/layout/page-container.js';

// Real xterm.js & addons
import { Terminal } from '../../lib/xterm/xterm.mjs';
import { FitAddon } from '../../lib/xterm/addon-fit.mjs';
import { SearchAddon } from '../../lib/xterm/addon-search.mjs';
import { WebLinksAddon } from '../../lib/xterm/addon-web-links.mjs';
import { Unicode11Addon } from '../../lib/xterm/addon-unicode11.mjs';
import { THEMES } from './terminal-themes.js';
import { createDemoShell } from './demo-shell.js';
import { DEMO_BANNER_TEXT } from '../../lib/demo-mode.js';

const SNIPPETS = [
  { label: 'Nmap Lab Scan', cmd: 'nmap -sV 10.10.2.10', desc: 'Scan lab services & versions' },
  { label: 'Nmap Stealth SYN', cmd: 'nmap -sS -T4 10.10.2.10', desc: 'Fast SYN scan' },
  { label: 'System Process Monitor', cmd: 'htop', desc: 'Interactive CPU/RAM process monitor' },
  { label: 'Kernel Architecture', cmd: 'uname -a', desc: 'Guest OS kernel release info' },
  { label: 'Current User Identity', cmd: 'whoami && id', desc: 'Print user ID & group' },
  { label: 'Network Interfaces', cmd: 'ip -br a', desc: 'Show guest VPC IP addresses' },
  { label: 'Egress Block Test', cmd: 'ping -c 3 -W 2 8.8.8.8', desc: 'Verify NIST egress block' },
  { label: 'Metasploit Console', cmd: 'msfconsole -q', desc: 'Launch framework console' }
];

export function TerminalPage({ params, query } = {}) {
  let vms = [];
  let selectedVmId = query?.get('vm') || params?.id || null;
  let mode = process.env.NEXT_PUBLIC_GUAC_WS_URL ? 'ssh' : 'sim'; // 'ssh' | 'sim'
  let sshStatus = 'Connecting...';
  let sshError = null;
  let sshClient = null;
  let sshKeyboard = null;
  let sshResizeCleanup = null;
  let destroyed = false;
  let activeThemeKey = 'kali';
  let promptStyle = 'classic'; // 'classic' or 'kali'
  let fontSize = 13;
  let isFullscreen = false;
  let showSnippets = false;
  let showSearch = false;
  let searchQuery = '';
  let searchResultsCount = 0;

  let nextTabId = 1;
  let tabs = [];
  let activeTabId = null;

  const host = h('div', { class: 'space-y-4 font-sans select-none pb-8' });
  const terminalStackEl = h('div', { class: 'relative w-full h-full flex-1' });
  const liveSshMount = h('div', {
    class: 'relative z-0 isolate flex-1 w-full h-full overflow-hidden flex items-center justify-center'
  });
  const liveSshOverlay = h('div', {
    class: 'hidden absolute inset-0 z-10 flex items-center justify-center p-6 bg-canvas/90'
  });
  const liveSshWrapper = h('div', {
    class: 'relative flex-1 w-full h-full flex flex-col overflow-hidden'
  }, liveSshMount, liveSshOverlay);

  // Outer terminal container wrapper - unified theme-matched surface
  const terminalCard = h('div', {
    'data-surface': 'dark',
    class: 'relative flex flex-col rounded-xl border overflow-hidden shadow-2xl transition-all',
    style: 'height: calc(100dvh - 180px); min-height: 520px; border-color: var(--border-default); background-color: var(--ink-950);'
  });

  function getActiveTab() {
    return tabs.find(t => t.id === activeTabId) || null;
  }

  // Load VM List
  async function loadVms() {
    try {
      const list = await api.vms.list().catch(() => []);
      vms = list.filter(v => v.status === 'running');
      if (vms.length === 0) {
        vms = [
          { id: 'vm-1', name: 'kali-lab-01', ip: '10.10.1.5', status: 'running' },
          { id: 'vm-2', name: 'parrot-sec-01', ip: '10.10.1.8', status: 'running' }
        ];
      }
      if (!selectedVmId && vms.length > 0) {
        selectedVmId = vms[0].id;
      }
      renderHeader();
      renderControls();
      syncModeView();
      if (mode === 'ssh') {
        connectLiveSsh();
      } else if (tabs.length === 0 && selectedVmId) {
        createNewTab();
      }
    } catch (err) {
      toast.error('Failed to load virtual machines');
    }
  }

  function disconnectLiveSsh() {
    if (sshResizeCleanup) {
      sshResizeCleanup();
      sshResizeCleanup = null;
    }
    if (sshKeyboard) {
      sshKeyboard.onkeydown = null;
      sshKeyboard.onkeyup = null;
      sshKeyboard = null;
    }
    if (sshClient) {
      try { sshClient.disconnect(); } catch { /* ignore */ }
      sshClient = null;
    }
  }

  function renderSshOverlay() {
    liveSshOverlay.innerHTML = '';
    if (!sshError) {
      liveSshOverlay.classList.add('hidden');
      return;
    }
    const vm = vms.find((v) => v.id === selectedVmId) || vms[0] || { id: 'vm-1', name: 'kali-lab-01' };
    liveSshOverlay.classList.remove('hidden');
    liveSshOverlay.appendChild(
      h('div', { class: 'max-w-lg w-full rounded-xl border border-line bg-surface p-5 space-y-3 text-xs text-fg' },
        h('div', { class: 'flex items-center gap-2 font-semibold text-sm text-danger' },
          icon('alert-circle', 'w-4 h-4'),
          'Live SSH Terminal Belum Aktif di Container'
        ),
        h('p', { class: 'text-muted leading-relaxed' },
          `Koneksi SSH (port 22) ke ${vm.name} gagal (${sshError}). Pastikan openssh-server sudah terpasang dan berjalan di dalam container Kali Linux.`
        ),
        h('pre', { class: 'rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-accent overflow-x-auto select-text' },
          'sudo apt update && sudo apt install -y openssh-server iputils-ping && sudo service ssh start'
        ),
        h('div', { class: 'flex flex-wrap gap-2 pt-1' },
          button({ label: 'Retry Live SSH', icon: 'refresh-cw', variant: 'primary', size: 'sm', onClick: () => connectLiveSsh() }),
          button({ label: 'Open Kali Desktop', icon: 'monitor', variant: 'secondary', size: 'sm', onClick: () => navigate(`/desktop?vm=${encodeURIComponent(vm.id)}`) }),
          button({ label: 'Use Simulated Shell', icon: 'terminal', variant: 'ghost', size: 'sm', onClick: () => switchMode('sim') })
        )
      )
    );
  }

  function syncModeView() {
    if (mode === 'ssh') {
      liveSshWrapper.style.display = 'flex';
      terminalStackEl.style.display = 'none';
      mobileKeyBar.style.display = 'none';
    } else {
      liveSshWrapper.style.display = 'none';
      terminalStackEl.style.display = 'block';
      mobileKeyBar.style.display = '';
      if (tabs.length === 0 && selectedVmId) {
        createNewTab();
      } else {
        const active = getActiveTab();
        if (active) {
          requestAnimationFrame(() => {
            active.fitAddon.fit();
            active.term.focus();
          });
        }
      }
    }
    renderBanner();
    renderHeader();
  }

  function switchMode(nextMode) {
    if (mode === nextMode) return;
    mode = nextMode;
    if (mode === 'ssh') {
      syncModeView();
      connectLiveSsh();
    } else {
      disconnectLiveSsh();
      syncModeView();
    }
  }

  async function connectLiveSsh() {
    disconnectLiveSsh();
    if (destroyed || mode !== 'ssh') return;

    const vm = vms.find((v) => v.id === selectedVmId) || vms[0] || { id: 'vm-1', name: 'kali-lab-01' };
    sshStatus = 'Connecting...';
    sshError = null;
    renderBanner();
    renderSshOverlay();

    const wsBase = process.env.NEXT_PUBLIC_GUAC_WS_URL;
    if (!wsBase) {
      sshError = 'NEXT_PUBLIC_GUAC_WS_URL not configured';
      sshStatus = 'Unavailable';
      renderBanner();
      renderSshOverlay();
      return;
    }

    try {
      const res = await fetch(`/api/guac-token?vm=${encodeURIComponent(vm.id)}&protocol=ssh`, {
        credentials: 'same-origin'
      });
      if (res.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      const data = await res.json();
      if (!res.ok || !data?.token) {
        throw new Error(data?.error || 'Failed to obtain SSH token');
      }
      if (destroyed || mode !== 'ssh') return;

      const baseWsUrl = `${wsBase.replace(/\/+$/, '')}/`;
      const tunnel = new Guacamole.WebSocketTunnel(baseWsUrl);

      tunnel.onerror = (err) => {
        if (destroyed || mode !== 'ssh') return;
        sshError = `Tunnel error (code=${err?.code}): ${err?.message || 'connection failed'}`;
        sshStatus = 'Error';
        renderBanner();
        renderSshOverlay();
      };

      const client = new Guacamole.Client(tunnel);
      sshClient = client;
      const display = client.getDisplay();

      liveSshMount.innerHTML = '';
      liveSshMount.appendChild(display.getElement());

      const fitSsh = () => {
        const dw = display.getWidth();
        const dh = display.getHeight();
        if (dw > 0 && dh > 0 && liveSshMount.clientWidth > 0 && liveSshMount.clientHeight > 0) {
          const scale = Math.min(liveSshMount.clientWidth / dw, liveSshMount.clientHeight / dh, 1);
          display.scale(scale);
        }
      };

      client.onstatechange = (state) => {
        if (destroyed || mode !== 'ssh') return;
        const states = ['Idle', 'Connecting...', 'Waiting...', 'Connected', 'Disconnecting...', 'Disconnected'];
        sshStatus = states[state] || 'Unknown';
        if (state === 3) {
          sshError = null;
          setTimeout(fitSsh, 150);
        }
        renderBanner();
        renderSshOverlay();
      };

      client.onerror = (err) => {
        if (destroyed || mode !== 'ssh') return;
        sshError = `Client error (code=${err?.code}): ${err?.message || 'SSH upstream error'}`;
        sshStatus = 'Disconnected';
        renderBanner();
        renderSshOverlay();
      };

      const keyboard = new Guacamole.Keyboard(document);
      sshKeyboard = keyboard;
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

      const onResize = () => fitSsh();
      window.addEventListener('resize', onResize);
      sshResizeCleanup = () => window.removeEventListener('resize', onResize);

      client.connect(`token=${encodeURIComponent(data.token)}`);
    } catch (err) {
      if (destroyed || mode !== 'ssh') return;
      sshError = err instanceof Error ? err.message : 'SSH connection failed';
      sshStatus = 'Error';
      renderBanner();
      renderSshOverlay();
    }
  }

  // Create a new terminal tab connected over WebSocket
  async function createNewTab(customTitle = null) {
    if (!selectedVmId) {
      toast.error('No virtual machine selected');
      return;
    }

    const tabId = nextTabId++;
    const title = customTitle || `Terminal ${tabId}`;

    const container = h('div', {
      class: 'absolute inset-0 p-3 overflow-hidden outline-none',
      tabindex: '0'
    });

    terminalStackEl.appendChild(container);

    const term = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: fontSize,
      fontFamily: '"JetBrains Mono", "Geist Mono", monospace',
      lineHeight: 1.25,
      letterSpacing: 0,
      scrollback: 5000,
      allowTransparency: true,
      theme: THEMES[activeThemeKey]
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon();
    const unicode11Addon = new Unicode11Addon();

    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(unicode11Addon);
    term.unicode.activeVersion = '11';

    term.open(container);

    const tab = {
      id: tabId,
      title,
      term,
      fitAddon,
      searchAddon,
      container,
      shell: null,
      status: 'connected',
      latency: 1,
      sessionLog: []
    };

    const vm = vms.find(v => v.id === selectedVmId) || vms[0] || { name: 'kali-lab-01', ip: '10.10.1.5' };
    tab.shell = createDemoShell({
      term,
      vmName: vm.name,
      vmIp: vm.ip || '10.10.1.5',
      getPromptStyle: () => promptStyle,
      onLog: (chunk) => tab.sessionLog.push(chunk),
    });

    tabs.push(tab);
    switchTab(tabId);

    // Click anywhere in container focuses term
    container.addEventListener('click', () => {
      term.focus();
    });

    // Send input from xterm to deterministic in-memory demo shell
    term.onData((data) => {
      tab.shell?.handleData(data);
    });

    tab.shell.boot();
    requestAnimationFrame(() => {
      tab.fitAddon.fit();
      tab.term.focus();
    });
  }

  function sendResize() {}

  // Switch active tab
  function switchTab(tabId) {
    activeTabId = tabId;
    tabs.forEach(t => {
      if (t.id === tabId) {
        t.container.style.display = 'block';
        requestAnimationFrame(() => {
          t.fitAddon.fit();
          t.term.focus();
        });
      } else {
        t.container.style.display = 'none';
      }
    });
    renderControls();
  }

  // Close tab
  function closeTab(tabId, e) {
    if (e) e.stopPropagation();
    const idx = tabs.findIndex(t => t.id === tabId);
    if (idx === -1) return;

    const tab = tabs[idx];
    try { tab.term.dispose(); } catch {}
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

  // Reconnect active tab
  function reconnectActiveTab() {
    const tab = getActiveTab();
    if (!tab) return;
    tab.shell?.boot();
    tab.term.focus();
    toast.info('Reset demo terminal session');
  }

  // Download session log as .txt
  function downloadSessionLog() {
    const tab = getActiveTab();
    if (!tab) return;
    const text = tab.sessionLog.join('');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tab.title.toLowerCase().replace(/\s+/g, '-')}-log.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Terminal session log downloaded');
  }

  // Copy selection to clipboard
  function copySelection() {
    const tab = getActiveTab();
    if (!tab) return;
    const sel = tab.term.getSelection();
    if (sel) {
      navigator.clipboard?.writeText(sel);
      toast.success('Selection copied to clipboard');
    } else {
      toast.info('No text selected in terminal');
    }
  }

  // Paste clipboard into terminal
  async function pasteClipboard() {
    const tab = getActiveTab();
    if (!tab) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        tab.term.paste(text);
      }
    } catch {
      toast.error('Clipboard access not allowed by browser');
    }
  }

  // Clear terminal
  function clearTerminal() {
    const tab = getActiveTab();
    if (!tab) return;
    tab.term.clear();
    toast.info('Terminal buffer cleared');
  }

  // Set font size
  function changeFontSize(delta) {
    fontSize = Math.min(22, Math.max(10, fontSize + delta));
    tabs.forEach(t => {
      t.term.options.fontSize = fontSize;
      requestAnimationFrame(() => t.fitAddon.fit());
    });
    renderControls();
  }

  function resolveThemeObj(key) {
    if (key === 'app') {
      return getTheme() === 'light' ? THEMES.light : THEMES.kali;
    }
    return THEMES[key] || THEMES.kali;
  }

  function applyActiveTheme() {
    const theme = resolveThemeObj(activeThemeKey);
    tabs.forEach(t => {
      t.term.options.theme = theme;
    });
    terminalCard.style.backgroundColor = theme.background;
    renderControls();
  }

  // Set theme
  function changeTheme(themeKey) {
    if (!THEMES[themeKey]) return;
    activeThemeKey = themeKey;
    applyActiveTheme();
  }

  // Paste snippet safely without Enter
  function pasteSnippet(cmd) {
    const tab = getActiveTab();
    if (!tab) return;
    tab.term.paste(cmd);
    tab.term.focus();
    showSnippets = false;
    renderControls();
    toast.info('Snippet pasted — press Enter to run');
  }

  // Mobile keys handlers
  function sendMobileKey(seq) {
    const tab = getActiveTab();
    if (!tab || !tab.shell) return;
    tab.shell.handleData(seq);
    tab.term.focus();
  }

  // Toggle fullscreen
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      terminalCard.requestFullscreen?.().then(() => {
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

  document.addEventListener('fullscreenchange', () => {
    isFullscreen = !!document.fullscreenElement;
    renderControls();
    const tab = getActiveTab();
    if (tab) {
      setTimeout(() => tab.fitAddon.fit(), 100);
    }
  });

  // Window / container resize observer
  const resizeObserver = new ResizeObserver(() => {
    const tab = getActiveTab();
    if (tab) {
      tab.fitAddon.fit();
      sendResize(tab);
    }
  });
  resizeObserver.observe(terminalCard);

  // Components UI DOM nodes with unified theme surface & mobile-only extra keys
  const headerContainer = h('div', { class: 'pb-2' });
  const controlsRow = h('div', { class: 'flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5 text-xs transition-colors' });
  const searchBarEl = h('div', { class: 'hidden border-b px-4 py-2 items-center gap-2 text-xs transition-colors' });
  // Extra keys bar: mobile only ((pointer: coarse) or < 768px), strictly hidden on desktop
  const mobileKeyBar = h('div', { class: 'hidden coarse:flex max-md:flex items-center gap-1.5 overflow-x-auto border-t px-3 py-1.5 text-xs text-fg' });

  function renderHeader() {
    headerContainer.innerHTML = '';
    const vm = vms.find((v) => v.id === selectedVmId) || vms[0];
    headerContainer.appendChild(
      pageHeader({
        title: 'Web Terminal',
        description: mode === 'ssh'
          ? 'Live Kali Linux SSH terminal connected via encrypted Guacamole gateway.'
          : 'Simulated interactive shell (xterm.js) for offline practice.',
        actions: h('div', { class: 'flex flex-wrap items-center gap-2' },
          button({
            variant: mode === 'ssh' ? 'primary' : 'secondary',
            size: 'sm',
            icon: 'terminal',
            label: 'Live Kali SSH',
            onClick: () => switchMode('ssh')
          }),
          button({
            variant: mode === 'sim' ? 'primary' : 'secondary',
            size: 'sm',
            icon: 'cpu',
            label: 'Simulated Shell',
            onClick: () => switchMode('sim')
          }),
          button({
            variant: 'secondary',
            size: 'sm',
            icon: 'monitor',
            label: 'Open Desktop',
            onClick: () => navigate(vm ? `/desktop?vm=${encodeURIComponent(vm.id)}` : '/desktop')
          }),
          button({
            variant: 'outline',
            size: 'sm',
            icon: 'refresh-cw',
            label: 'Reconnect',
            onClick: () => (mode === 'ssh' ? connectLiveSsh() : reconnectActiveTab())
          }),
          mode === 'sim'
            ? button({
                variant: 'outline',
                size: 'sm',
                icon: 'download',
                label: 'Export Log',
                onClick: downloadSessionLog
              })
            : null
        )
      })
    );
  }

  function renderControls() {
    controlsRow.innerHTML = '';
    const activeTab = getActiveTab();
    const theme = THEMES[activeThemeKey] || THEMES.kali;

    // Apply unified theme surface colors
    controlsRow.style.backgroundColor = theme.toolbarBg;
    controlsRow.style.borderColor = theme.toolbarBorder;
    controlsRow.style.color = theme.toolbarFg;
    searchBarEl.style.backgroundColor = theme.toolbarBg;
    searchBarEl.style.borderColor = theme.toolbarBorder;
    mobileKeyBar.style.backgroundColor = theme.toolbarBg;
    mobileKeyBar.style.borderColor = theme.toolbarBorder;
    terminalCard.style.backgroundColor = theme.background;
    terminalCard.style.borderColor = theme.toolbarBorder;

    // LEFT ZONE: VM Selector + Tabs
    const leftZone = h('div', { class: 'flex items-center gap-3 overflow-x-auto min-w-0' },
      // VM Picker
      h('div', { class: 'flex items-center gap-1.5 border-r border-line pr-3 shrink-0' },
        icon('server', 'w-3.5 h-3.5 text-muted'),
        h('select', {
          class: 'bg-transparent text-fg text-xs font-medium outline-none cursor-pointer pr-1',
          onChange: (e) => {
            selectedVmId = e.target.value;
            if (mode === 'ssh') {
              renderHeader();
              connectLiveSsh();
              return;
            }
            tabs.forEach(t => {
              try { t.term.dispose(); } catch {}
            });
            tabs = [];
            terminalStackEl.innerHTML = '';
            createNewTab();
          }
        },
          vms.map(v => h('option', {
            value: v.id,
            selected: v.id === selectedVmId,
            class: 'bg-surface text-fg'
          }, `${v.name} (${v.ip || '10.10.1.5'})`))
        )
      ),

      // Tab Pills
      h('div', { class: 'flex items-center gap-1 overflow-x-auto' },
        tabs.map(tab => {
          const isActive = tab.id === activeTabId;
          return h('div', {
            class: cx(
              'group flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono transition-all cursor-pointer select-none',
              isActive
                ? 'bg-raised text-fg font-semibold shadow-sm border border-line'
                : 'text-muted hover:text-fg hover:bg-surface'
            ),
            onClick: () => switchTab(tab.id)
          },
            h('span', {
              class: cx(
                'w-1.5 h-1.5 rounded-full shrink-0',
                tab.status === 'connected' ? 'bg-[var(--success)]' : tab.status === 'connecting' ? 'bg-[var(--warning)] animate-pulse' : 'bg-[var(--danger)]'
              )
            }),
            h('span', { class: 'truncate max-w-[100px]' }, tab.title),
            tabs.length > 1 && h('button', {
              type: 'button',
              class: 'opacity-0 group-hover:opacity-100 text-muted hover:text-[var(--danger-text)] p-0.5 rounded transition-opacity',
              onClick: (e) => closeTab(tab.id, e),
              title: 'Close tab'
            }, icon('x', 'w-3 h-3'))
          );
        }),
        h('button', {
          type: 'button',
          class: 'flex items-center justify-center p-1 rounded hover:bg-surface text-muted hover:text-fg transition-colors',
          onClick: () => createNewTab(),
          title: 'New terminal tab'
        }, icon('plus', 'w-3.5 h-3.5'))
      )
    );

    // RIGHT ZONE: Status Pill + Snippets + Actions
    const statusPill = h('div', { class: 'flex items-center gap-2 border-r border-line pr-3 shrink-0' },
      h('span', {
        class: cx(
          'w-2 h-2 rounded-full',
          activeTab?.status === 'connected' ? 'bg-[var(--success)]' :
          activeTab?.status === 'connecting' ? 'bg-[var(--warning)] animate-pulse' : 'bg-[var(--danger)]'
        )
      }),
      h('span', { class: 'font-mono text-[11px] text-muted font-medium' },
        activeTab?.status === 'connected' ? `Connected (${activeTab.latency || 12}ms)` :
        activeTab?.status === 'connecting' ? 'Connecting...' : 'Disconnected'
      )
    );

    // Actions & Tools
    const actionsZone = h('div', { class: 'flex items-center gap-1.5 shrink-0 relative' },
      // Snippets dropdown button
      h('div', { class: 'relative' },
        button({
          variant: showSnippets ? 'primary' : 'outline',
          size: 'xs',
          icon: 'terminal',
          label: 'Snippets',
          onClick: () => {
            showSnippets = !showSnippets;
            renderControls();
          }
        }),
        showSnippets && h('div', {
          class: 'absolute right-0 top-full mt-2 w-72 rounded-lg border border-line bg-surface p-2 shadow-2xl z-50 space-y-1'
        },
          h('div', { class: 'px-2 py-1 text-[11px] font-semibold text-muted uppercase tracking-wider border-b border-line mb-1' }, 'Quick Pentest Snippets'),
          SNIPPETS.map(snip => h('button', {
            type: 'button',
            class: 'w-full text-left px-2 py-1.5 rounded hover:bg-raised transition-colors flex flex-col gap-0.5 group cursor-pointer',
            onClick: () => pasteSnippet(snip.cmd)
          },
            h('span', { class: 'font-medium text-xs text-fg group-hover:text-accent' }, snip.label),
            h('span', { class: 'font-mono text-[10px] text-muted truncate' }, snip.cmd)
          ))
        )
      ),

      // Search button
      button({
        variant: showSearch ? 'primary' : 'ghost',
        size: 'xs',
        icon: 'search',
        title: 'Search in terminal (Ctrl+Shift+F)',
        onClick: () => {
          showSearch = !showSearch;
          searchBarEl.style.display = showSearch ? 'flex' : 'none';
          if (showSearch) {
            const input = searchBarEl.querySelector('input');
            input?.focus();
          }
        }
      }),

      // Copy & Paste
      button({
        variant: 'ghost',
        size: 'xs',
        icon: 'copy',
        title: 'Copy selection (Ctrl+C / Selection)',
        onClick: copySelection
      }),
      button({
        variant: 'ghost',
        size: 'xs',
        icon: 'clipboard',
        title: 'Paste from clipboard',
        onClick: pasteClipboard
      }),
      button({
        variant: 'ghost',
        size: 'xs',
        icon: 'trash-2',
        title: 'Clear terminal screen',
        onClick: clearTerminal
      }),

      // Font size - / +
      h('div', { class: 'flex items-center border border-line rounded px-1' },
        h('button', {
          type: 'button',
          class: 'px-1 text-muted hover:text-fg font-bold',
          onClick: () => changeFontSize(-1),
          title: 'Decrease font size'
        }, '-'),
        h('span', { class: 'font-mono text-[10px] text-muted px-1' }, `${fontSize}px`),
        h('button', {
          type: 'button',
          class: 'px-1 text-muted hover:text-fg font-bold',
          onClick: () => changeFontSize(1),
          title: 'Increase font size'
        }, '+')
      ),

      // Prompt Style Selector (A3)
      h('select', {
        class: 'bg-transparent text-muted hover:text-fg border border-line rounded px-1.5 py-0.5 text-[11px] outline-none cursor-pointer',
        value: promptStyle,
        title: 'Shell prompt style',
        onChange: (e) => {
          promptStyle = e.target.value;
          const tab = getActiveTab();
          tab?.shell?.refreshPrompt();
          toast.info(`Prompt switched to ${promptStyle === 'kali' ? 'Kali Two-Line' : 'Classic Debian'}`);
          renderControls();
        }
      },
        h('option', { value: 'classic', selected: promptStyle === 'classic', class: 'bg-surface text-fg' }, 'Prompt: Classic'),
        h('option', { value: 'kali', selected: promptStyle === 'kali', class: 'bg-surface text-fg' }, 'Prompt: Kali 2-Line')
      ),

      // Theme Picker
      h('select', {
        class: 'bg-transparent text-muted hover:text-fg border border-line rounded px-1.5 py-0.5 text-[11px] outline-none cursor-pointer',
        value: activeThemeKey,
        onChange: (e) => changeTheme(e.target.value)
      },
        Object.values(THEMES).map(t => h('option', {
          value: t.id,
          selected: t.id === activeThemeKey,
          class: 'bg-surface text-fg'
        }, t.name))
      ),

      // Fullscreen
      button({
        variant: 'ghost',
        size: 'xs',
        icon: isFullscreen ? 'minimize-2' : 'maximize-2',
        title: isFullscreen ? 'Exit Fullscreen' : 'Fullscreen',
        onClick: toggleFullscreen
      })
    );

    controlsRow.appendChild(leftZone);
    controlsRow.appendChild(h('div', { class: 'flex items-center gap-3 shrink-0' }, statusPill, actionsZone));
  }

  // Setup Search Bar
  function setupSearchBar() {
    searchBarEl.innerHTML = '';
    const input = h('input', {
      type: 'text',
      placeholder: 'Search in terminal buffer...',
      class: 'flex-1 bg-canvas border border-line rounded px-2.5 py-1 text-xs text-fg outline-none focus:border-accent',
      onInput: (e) => {
        searchQuery = e.target.value;
        const tab = getActiveTab();
        if (tab && searchQuery) {
          tab.searchAddon.findNext(searchQuery);
        }
      },
      onKeyDown: (e) => {
        if (e.key === 'Enter') {
          const tab = getActiveTab();
          if (tab && searchQuery) {
            if (e.shiftKey) tab.searchAddon.findPrevious(searchQuery);
            else tab.searchAddon.findNext(searchQuery);
          }
        } else if (e.key === 'Escape') {
          showSearch = false;
          searchBarEl.style.display = 'none';
        }
      }
    });

    searchBarEl.appendChild(icon('search', 'w-3.5 h-3.5 text-muted shrink-0'));
    searchBarEl.appendChild(input);
    searchBarEl.appendChild(
      button({
        variant: 'ghost',
        size: 'xs',
        label: 'Prev',
        onClick: () => {
          const tab = getActiveTab();
          if (tab && searchQuery) tab.searchAddon.findPrevious(searchQuery);
        }
      })
    );
    searchBarEl.appendChild(
      button({
        variant: 'ghost',
        size: 'xs',
        label: 'Next',
        onClick: () => {
          const tab = getActiveTab();
          if (tab && searchQuery) tab.searchAddon.findNext(searchQuery);
        }
      })
    );
    searchBarEl.appendChild(
      button({
        variant: 'ghost',
        size: 'xs',
        icon: 'x',
        onClick: () => {
          showSearch = false;
          searchBarEl.style.display = 'none';
        }
      })
    );
  }

  // Setup Mobile Helper Keys Bar
  function setupMobileKeys() {
    mobileKeyBar.innerHTML = '';
    const keys = [
      { label: 'ESC', seq: '\x1b' },
      { label: 'TAB', seq: '\t' },
      { label: 'CTRL-C', seq: '\x03' },
      { label: 'CTRL-D', seq: '\x04' },
      { label: 'CTRL-Z', seq: '\x1a' },
      { label: '▲', seq: '\x1b[A' },
      { label: '▼', seq: '\x1b[B' },
      { label: '◀', seq: '\x1b[D' },
      { label: '▶', seq: '\x1b[C' },
      { label: '|', seq: '|' },
      { label: '~', seq: '~' },
      { label: '/', seq: '/' },
      { label: '-', seq: '-' }
    ];

    keys.forEach(k => {
      mobileKeyBar.appendChild(
        h('button', {
          type: 'button',
          class: 'px-2 py-1 rounded bg-surface border border-line text-[11px] font-mono text-fg hover:bg-raised active:bg-accent active:text-[var(--text-inverse)] transition-all shrink-0',
          onClick: () => sendMobileKey(k.seq)
        }, k.label)
      );
    });
  }

  // Cleanup on route change
  const unsubTheme = subscribeTheme(() => {
    if (activeThemeKey === 'app') applyActiveTheme();
  });
  onCleanup(unsubTheme);

  onCleanup(() => {
    destroyed = true;
    disconnectLiveSsh();
    resizeObserver.disconnect();
    tabs.forEach(tab => {
      try { tab.term.dispose(); } catch {}
    });
    tabs = [];
  });

  const demoBanner = h('div', {
    role: 'status',
    'data-demo-banner': 'true',
    class: 'flex items-center justify-between gap-2 px-3 py-1.5 text-xs font-mono border-b border-line bg-surface text-muted'
  });

  function renderBanner() {
    demoBanner.innerHTML = '';
    const vm = vms.find((v) => v.id === selectedVmId) || vms[0] || { name: 'kali-lab-01' };
    if (mode === 'ssh') {
      const toneClass = sshStatus === 'Connected' ? 'text-accent' : sshError ? 'text-danger' : 'text-muted';
      demoBanner.append(
        h('span', { class: 'flex items-center gap-2 font-medium text-fg' },
          icon('terminal', 'w-3.5 h-3.5 text-accent'),
          `${vm.name.toUpperCase()} // LIVE SSH (Port 22)`
        ),
        h('span', { class: `text-[11px] font-mono ${toneClass}` }, `Status: ${sshStatus}`)
      );
    } else {
      demoBanner.append(
        h('span', { class: 'flex items-center gap-2 font-medium text-fg' },
          icon('shield-alert', 'w-3.5 h-3.5 text-accent'),
          DEMO_BANNER_TEXT
        ),
        h('span', { class: 'text-[11px] text-muted' }, 'In-memory allow-listed shell · /home/student')
      );
    }
  }

  // Assemble the component
  renderBanner();
  renderHeader();
  renderControls();
  setupSearchBar();
  setupMobileKeys();

  terminalCard.appendChild(demoBanner);
  terminalCard.appendChild(controlsRow);
  terminalCard.appendChild(searchBarEl);
  terminalCard.appendChild(liveSshWrapper);
  terminalCard.appendChild(terminalStackEl);
  terminalCard.appendChild(mobileKeyBar);

  host.appendChild(headerContainer);
  host.appendChild(terminalCard);

  // Initialize
  loadVms();

  return PageContainer({ variant: 'full' }, host);
}
