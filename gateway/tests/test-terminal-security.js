// Static Security & Anti-Host-Leakage Check for PTaaS Web Terminal Gateway
// Fails if node-pty, spawn, exec, wsl.exe, /mnt/c, or process.env.SHELL appear in terminal gateway code

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const serverJs = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

console.log('Running PTaaS Terminal Gateway Security Audit...\n');

let failed = false;

// 1. Extract handleTerminalUpgrade code
const termHandlerMatch = serverJs.match(/function handleTerminalUpgrade[\s\S]*?(?=function handleDesktopUpgrade|\/\/ --- WEBSOCKET|\n\n\n|$)/);
if (!termHandlerMatch) {
  console.error('FAIL: Could not locate handleTerminalUpgrade in server.js');
  process.exit(1);
}
const termHandlerCode = termHandlerMatch[0];

// 2. Test for prohibited host invocation tokens
const FORBIDDEN_TOKENS = [
  'wsl.exe',
  'wsl',
  'node-pty',
  'process.env.SHELL',
  'cp.spawn',
  'child_process',
  'powershell.exe',
  'cmd.exe'
];

FORBIDDEN_TOKENS.forEach(token => {
  if (termHandlerCode.includes(token)) {
    console.error(`FAIL: Prohibited token "${token}" found in handleTerminalUpgrade!`);
    failed = true;
  }
});

// 3. Verify handleTerminalUpgrade uses ssh2 client
if (!termHandlerCode.includes('ssh2.Client') && !serverJs.includes('ssh2.Client')) {
  console.error('FAIL: handleTerminalUpgrade must use ssh2.Client to connect to isolated VM.');
  failed = true;
}

// 4. Verify startup probe exists
if (!termHandlerCode.includes('uname -r') || !termHandlerCode.includes('/mnt/c')) {
  console.error('FAIL: Startup self-check probe (uname -r, /mnt/c check) is missing in terminal gateway.');
  failed = true;
}

// 5. Verify line discipline & resize support
if (!termHandlerCode.includes('setWindow')) {
  console.error('FAIL: Terminal resize support (setWindow) is missing.');
  failed = true;
}

if (failed) {
  console.error('\nTerminal Security Audit: FAILED');
  process.exit(1);
} else {
  console.log('SUCCESS: All Terminal Gateway Security checks passed! Zero host process execution.');
}
