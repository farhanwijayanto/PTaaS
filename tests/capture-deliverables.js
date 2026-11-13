const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\farha\\.gemini\\antigravity\\brain\\fbdd5be8-9d26-4c37-883b-cfe6b8b98ef8';
const PORT = 3000;
const DEBUG_PORT = 9445;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function createCdpSession(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });
  return {
    send(method, params = {}) {
      const curId = ++id;
      return new Promise((resolve, reject) => {
        pending.set(curId, { resolve, reject });
        ws.send(JSON.stringify({ id: curId, method, params }));
      });
    },
    close() {
      ws.close();
    }
  };
}

async function evalJs(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (res.exceptionDetails) {
    throw new Error(`JS Eval Error: ${res.exceptionDetails.text}`);
  }
  return res.result.value;
}

async function capturePng(cdp, filename) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const outPath = path.join(ARTIFACT_DIR, filename);
  fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
  console.log(`Saved screenshot: ${filename}`);
  return outPath;
}

async function main() {
  const scratchDir = path.join(ARTIFACT_DIR, 'scratch', 'cdp-' + Date.now());
  fs.mkdirSync(scratchDir, { recursive: true });

  console.log('Launching headless Chrome for deliverable capture...');
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${scratchDir}`,
    '--window-size=1440,900',
    'about:blank'
  ], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 30; i++) {
    try {
      targets = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json`);
      const pageTarget = targets.find((t) => t.type === 'page');
      if (pageTarget && pageTarget.webSocketDebuggerUrl) break;
    } catch {}
    await sleep(250);
  }

  const pageTarget = targets.find((t) => t.type === 'page');
  const cdp = await createCdpSession(pageTarget.webSocketDebuggerUrl);

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  // Navigate to /login first to prime origin and set auth session
  await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/login` });
  await sleep(1000);

  // Set session for John Doe (u-jdoe)
  await evalJs(cdp, `
    localStorage.removeItem('ptaas.signedOut');
    localStorage.setItem('ptaas.session', JSON.stringify({ userId: 'u-jdoe', tenant: 'CS-401' }));
  `);

  // --- STEP 1: Terminal Desktop (Dark Theme, Classic Debian Prompt, Unified Toolbar & Body, Hidden Mobile Keys) ---
  console.log('\n--- Capturing Step 1: Terminal Desktop ---');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });

  await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/terminal` });
  await sleep(3500); // Allow PTY gateway websocket handshake + banner + prompt

  await capturePng(cdp, 'step1_terminal_desktop.png');

  // --- STEP 2: Terminal Mobile View (390x844 with Mobile Extra Keys Visible) ---
  console.log('\n--- Capturing Step 2: Terminal Mobile ---');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
    hasTouch: true
  });
  await sleep(1200);

  // Scroll so the mobile extra keys bar at the bottom of the terminal is clearly visible
  await evalJs(cdp, `
    const bar = document.querySelector('.coarse\\\\:flex, .max-md\\\\:flex');
    if (bar) {
      bar.scrollIntoView({ behavior: 'instant', block: 'end' });
    } else {
      window.scrollTo(0, 300);
    }
  `);
  await sleep(600);
  await capturePng(cdp, 'step2_terminal_mobile.png');

  // --- STEP 2B: Terminal Light Theme (Desktop 1440x900) ---
  console.log('\n--- Capturing Step 2B: Terminal Light Theme ---');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });
  await sleep(600);

  await evalJs(cdp, `
    const themeSelects = Array.from(document.querySelectorAll('select')).filter(s => s.options && Array.from(s.options).some(o => o.value === 'light'));
    if (themeSelects.length > 0) {
      themeSelects[0].value = 'light';
      themeSelects[0].dispatchEvent(new Event('change', { bubbles: true }));
    }
  `);
  await sleep(1000);
  await capturePng(cdp, 'step2_terminal_light.png');

  // --- STEP 4A: Student VM Slot (John Doe: 2 / 3 VM, 1 FREE, "VM Baru") ---
  console.log('\n--- Capturing Step 4A: Student VM Slot (2 / 3 VM) ---');
  await evalJs(cdp, `
    localStorage.removeItem('ptaas.signedOut');
    localStorage.setItem('ptaas.session', JSON.stringify({ userId: 'u-jdoe', tenant: 'CS-401' }));
  `);
  await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/vms` });
  await sleep(1800);
  await capturePng(cdp, 'step4_student_vm_slot_2_of_3.png');

  // --- STEP 4B: Student VM Slot Limit (Jane Smith: 3 / 3 VM, LIMIT, "Ajukan VM tambahan") ---
  console.log('\n--- Capturing Step 4B: Student VM Slot Limit (3 / 3 VM) ---');
  await evalJs(cdp, `
    localStorage.removeItem('ptaas.signedOut');
    localStorage.setItem('ptaas.session', JSON.stringify({ userId: 'u-jsmith', tenant: 'CS-401' }));
  `);
  await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/vms` });
  await sleep(1800);
  await capturePng(cdp, 'step4_student_vm_slot_3_of_3.png');

  // --- STEP 4C: Student Requests Tab (Jane Smith: Pending Requests Table) ---
  console.log('\n--- Capturing Step 4C: Student Requests Tab ---');
  await evalJs(cdp, `
    const buttons = Array.from(document.querySelectorAll('button'));
    const reqBtn = buttons.find(b => b.textContent.includes('Permintaan'));
    if (reqBtn) reqBtn.click();
  `);
  await sleep(1000);
  await capturePng(cdp, 'step4_student_requests_tab.png');

  // --- STEP 4D: Instructor Approvals Dashboard with Open Review Drawer ---
  console.log('\n--- Capturing Step 4D: Instructor Approvals with Review Drawer ---');
  await evalJs(cdp, `
    localStorage.removeItem('ptaas.signedOut');
    localStorage.setItem('ptaas.session', JSON.stringify({ userId: 'u-sjohnson', tenant: 'CS-401' }));
  `);
  await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/approvals` });
  await sleep(1800);

  // Click "Tinjau" button to open slide-over drawer
  await evalJs(cdp, `
    const tinjauBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Tinjau'));
    if (tinjauBtns.length > 0) {
      tinjauBtns[0].click();
    }
  `);
  await sleep(1200);
  await capturePng(cdp, 'step4_approvals_instructor.png');

  console.log('\nAll deliverable screenshots captured successfully!');
  cdp.close();
  chrome.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error('Capture error:', err);
  process.exit(1);
});
