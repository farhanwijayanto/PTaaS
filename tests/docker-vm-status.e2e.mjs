/**
 * End-to-End Real Docker + API + SSE + Playwright Verification Suite
 * Covers Section 5 Tests #1 through #9 and captures screenshots when SCREENSHOT_DIR is set.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || '';
const TEST_TAG = `ptaas-e2e-${Date.now()}`;
const STORE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ptaas-vm-e2e-'));
const STORE_FILE = path.join(STORE_DIR, 'vms.json');

const REAL_PORT = 3191;
const DEMO_PORT = 3192;
const PROXY_PORT = 23759;

async function dockerCmd(args) {
  const { stdout } = await execFileAsync('docker', args, { timeout: 30000 });
  return stdout.trim();
}

async function resolveRealDockerSocketPath() {
  if (process.platform === 'win32') {
    for (const pipe of ['\\\\.\\pipe\\dockerDesktopLinuxEngine', '\\\\.\\pipe\\docker_engine']) {
      const ok = await new Promise((resolve) => {
        const s = net.createConnection({ path: pipe });
        s.once('connect', () => { s.destroy(); resolve(true); });
        s.once('error', () => { s.destroy(); resolve(false); });
      });
      if (ok) return pipe;
    }
    throw new Error('Could not connect to Docker Desktop named pipe');
  }
  return '/var/run/docker.sock';
}

/**
 * Transparent TCP-to-Docker-socket proxy that forwards real Docker Engine traffic
 * and lets test #4 cleanly block and restore the Docker socket without killing the host daemon.
 */
function createControllableDockerProxy(targetSocketPath, port) {
  let blocked = false;
  const activeSockets = new Set();

  const server = net.createServer((clientSock) => {
    if (blocked) {
      clientSock.destroy();
      return;
    }
    const upstream = net.createConnection({ path: targetSocketPath });
    activeSockets.add(clientSock);
    activeSockets.add(upstream);

    clientSock.pipe(upstream);
    upstream.pipe(clientSock);

    const cleanup = () => {
      activeSockets.delete(clientSock);
      activeSockets.delete(upstream);
      try { clientSock.destroy(); } catch {}
      try { upstream.destroy(); } catch {}
    };
    clientSock.on('error', cleanup);
    upstream.on('error', cleanup);
    clientSock.on('close', cleanup);
    upstream.on('close', cleanup);
  });

  return {
    async start() {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
      });
    },
    block() {
      blocked = true;
      for (const s of activeSockets) {
        try { s.destroy(); } catch {}
      }
      activeSockets.clear();
    },
    restore() {
      blocked = false;
    },
    async close() {
      this.block();
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

async function pickLightweightImage() {
  const existing = await dockerCmd(['images', '--format', '{{.Repository}}:{{.Tag}}']).catch(() => '');
  const list = existing.split(/\r?\n/).filter((l) => l && !l.includes('<none>'));
  for (const preferred of ['alpine:3.20', 'alpine:latest', 'busybox:latest']) {
    if (list.includes(preferred)) return preferred;
  }
  console.log('Pulling alpine:3.20 for lightweight E2E containers...');
  await dockerCmd(['pull', 'alpine:3.20']);
  return 'alpine:3.20';
}

async function waitForHttp(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status > 0) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

const ADMIN_TEST_PASS = 'TestAdminPass123!';
const STUDENT_TEST_PASS = 'TestStudentPass123!';

function startNextServer({ port, demoMode, dockerHost, storePath, image }) {
  const child = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-p', String(port), '-H', '127.0.0.1'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ADMIN_INITIAL_PASSWORD: ADMIN_TEST_PASS,
        DEMO_MODE: demoMode ? 'true' : 'false',
        NEXT_PUBLIC_DEMO_MODE: demoMode ? 'true' : 'false',
        DOCKER_HOST: dockerHost,
        DOCKER_PROXY_URL: dockerHost,
        DOCKER_UNREACHABLE_GRACE_MS: '1200',
        DOCKER_RECONCILE_INTERVAL_MS: '1500',
        PTAAS_VM_STORE_PATH: storePath,
        KALI_IMAGE: image,
        PTAAS_MEMORY_OVERCOMMIT_RATIO: '4.0',
        PTAAS_VM_CMD: JSON.stringify(['sh', '-c', 'trap "exit 0" TERM INT; while true; do sleep 1; done']),
      },
      stdio: 'pipe',
    }
  );
  child.stderr.on('data', (d) => {
    const s = d.toString();
    if (s.includes('Error') && !s.includes('ECONNREFUSED') && !s.includes('ECONNRESET')) {
      process.stderr.write(`[next:${port}] ${s}`);
    }
  });
  return child;
}

async function stopProcess(child) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const t = setTimeout(resolve, 3000);
    child.once('exit', () => { clearTimeout(t); resolve(); });
  });
}

async function loginApi(baseUrl, email, password = 'password123') {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200, `Login failed for ${email}`);
  const setCookie = res.headers.get('set-cookie') || '';
  const cookiePair = setCookie.split(';')[0];
  assert.ok(cookiePair.includes('ptaas_session='), 'Missing ptaas_session cookie');
  return cookiePair;
}

async function provisionTestUsersAndLogin(baseUrl) {
  const adminCookie = await loginApi(baseUrl, 'admin@example.com', ADMIN_TEST_PASS);
  for (const uid of ['u-jdoe', 'u-jsmith']) {
    const r = await fetch(`${baseUrl}/api/admin/users/${uid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ password: STUDENT_TEST_PASS, mustChangePassword: false }),
    });
    assert.equal(r.status, 200, `Failed to set test password for ${uid}`);
  }
  const studentCookie = await loginApi(baseUrl, 'john.doe@example.edu', STUDENT_TEST_PASS);
  const student2Cookie = await loginApi(baseUrl, 'jane.smith@example.edu', STUDENT_TEST_PASS);
  return { adminCookie, studentCookie, student2Cookie };
}
async function getManagedRunningCountFromDocker(owner = null) {
  const args = ['ps', '--filter', 'label=ptaas.managed=true', '--format', '{{.ID}}'];
  if (owner) args.push('--filter', `label=ptaas.owner=${owner}`);
  const out = await dockerCmd(args);
  return out ? out.split(/\r?\n/).filter(Boolean).length : 0;
}

async function cleanupTestContainers() {
  // Remove any managed containers and any e2e tagged containers
  const ids1 = await dockerCmd(['ps', '-aq', '--filter', 'label=ptaas.managed=true']).catch(() => '');
  const ids2 = await dockerCmd(['ps', '-aq', '--filter', `label=ptaas.e2e=${TEST_TAG}`]).catch(() => '');
  const all = [...new Set([...ids1.split(/\r?\n/), ...ids2.split(/\r?\n/)].filter(Boolean))];
  if (all.length) {
    await dockerCmd(['rm', '-f', ...all]).catch(() => {});
  }
}

async function waitUntil(fn, timeoutMs = 8000, intervalMs = 200) {
  const start = Date.now();
  let lastErr;
  while (Date.now() - start < timeoutMs) {
    try {
      const val = await fn();
      if (val) return val;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw lastErr || new Error('waitUntil timed out');
}

async function maybeScreenshot(page, filename) {
  if (!SCREENSHOT_DIR) return;
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename) });
  console.log(`    [screenshot] ${filename}`);
}

async function run() {
  console.log('=== PTaaS Real Docker + Playwright E2E Suite ===');

  // Verify Docker is reachable
  await dockerCmd(['version', '--format', '{{.Server.Version}}']);
  const realSocket = await resolveRealDockerSocketPath();
  const testImage = await pickLightweightImage();
  console.log(`Docker reachable via ${realSocket}, using image ${testImage}`);

  await cleanupTestContainers();

  const proxy = createControllableDockerProxy(realSocket, PROXY_PORT);
  await proxy.start();

  const baseUrl = `http://localhost:${REAL_PORT}`;
  const dockerHost = `http://127.0.0.1:${PROXY_PORT}`;
  let realServer = startNextServer({
    port: REAL_PORT,
    demoMode: false,
    dockerHost,
    storePath: STORE_FILE,
    image: testImage,
  });
  let demoServer = null;
  let browser = null;

  try {
    await waitForHttp(`${baseUrl}/api/auth/me`);

    const { studentCookie, student2Cookie, adminCookie } = await provisionTestUsersAndLogin(baseUrl);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    // Authenticate browser context as John Doe (student) via login form
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
    await page.fill('#login-email', 'john.doe@example.edu');
    await page.fill('#login-pass', STUDENT_TEST_PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    consoleErrors.length = 0;

    // =========================================================================
    // TEST 1: Zero managed containers -> 0 running, empty state, badges hidden
    // =========================================================================
    console.log('\n[Test 1] Zero managed containers...');
    assert.equal(await getManagedRunningCountFromDocker(), 0);

    const res0 = await fetch(`${baseUrl}/api/vms`, { headers: { Cookie: studentCookie } });
    const data0 = await res0.json();
    assert.equal(data0.demoMode, false);
    assert.equal(data0.statusSource, 'docker');
    assert.equal(data0.dockerReachable, true);
    assert.equal(data0.vms.filter((v) => v.status === 'running').length, 0);

    await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
    await waitUntil(async () => (await page.locator('[data-kpi-value="running"]').textContent())?.trim() === '0');
    assert.equal(await page.locator('[data-dashboard-running-badge]').count(), 0, 'Dashboard running badge should be hidden at 0');
    assert.equal(await page.locator('[data-sidebar-vm-badge]').count(), 0, 'Sidebar VM badge should be hidden at 0');
    assert.ok((await page.locator('[data-active-vms-section]').textContent()).includes('No running machines'));
    assert.equal((await page.locator('[data-quota-value="vcpu"]').textContent()).trim(), '0 / 8');
    assert.equal((await page.locator('[data-quota-value="ram"]').textContent()).trim(), '0 / 16 GB');
    await maybeScreenshot(page, 'after_0_running.png');

    // Desktop & Terminal empty states at 0 running
    await page.goto(`${baseUrl}/desktop`, { waitUntil: 'networkidle' });
    await waitUntil(async () => (await page.locator('[data-desktop-empty]').count()) === 1);
    await page.goto(`${baseUrl}/terminal`, { waitUntil: 'networkidle' });
    await waitUntil(async () => (await page.locator('[data-terminal-empty]').count()) === 1);
    console.log('  ✓ Test 1 passed (0 running, empty states, badges hidden, quotas 0)');

    // =========================================================================
    // TEST 2: Create/start 1 container -> UI updates to 1 Running within 3s
    // =========================================================================
    console.log('\n[Test 2] Create/start 1 managed container...');
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });

    const create1 = await fetch(`${baseUrl}/api/vms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: studentCookie },
      body: JSON.stringify({ name: 'kali-e2e-01', os: 'kali', vcpu: 2, ram: 4, disk: 30, waitForReady: true }),
    });
    assert.equal(create1.status, 201, `Create VM 1 failed: ${await create1.clone().text()}`);
    const { vm: vm1 } = await create1.json();
    assert.equal(vm1.status, 'running');
    assert.ok(vm1.containerId, 'VM 1 must have a real Docker containerId');

    const dockerCount1 = await getManagedRunningCountFromDocker('u-jdoe');
    assert.equal(dockerCount1, 1);

    // Without manual reload, dashboard & sidebar badge must update to 1 within 3s via SSE
    await waitUntil(async () => {
      const kpi = (await page.locator('[data-kpi-value="running"]').textContent())?.trim();
      const sb = (await page.locator('[data-sidebar-vm-badge]').textContent().catch(() => ''))?.trim();
      return kpi === '1' && sb === '1';
    }, 3500);

    assert.equal((await page.locator('[data-dashboard-running-badge]').textContent()).trim(), '1 Running');
    assert.equal((await page.locator('[data-quota-value="vcpu"]').textContent()).trim(), '2 / 8');
    assert.equal((await page.locator('[data-quota-value="ram"]').textContent()).trim(), '4 / 16 GB');
    await maybeScreenshot(page, 'after_1_running.png');
    console.log('  ✓ Test 2 passed (1 Running reflected live via SSE within 3s)');

    // =========================================================================
    // TEST 3: Start 2nd container -> 2 Running -> docker stop -> 1 Running + 1 Stopped -> docker rm -> Missing
    // =========================================================================
    console.log('\n[Test 3] 2nd container, CLI docker stop, CLI docker rm...');
    const create2 = await fetch(`${baseUrl}/api/vms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: studentCookie },
      body: JSON.stringify({ name: 'kali-e2e-02', os: 'kali', vcpu: 2, ram: 4, disk: 30, waitForReady: true }),
    });
    assert.equal(create2.status, 201);
    const { vm: vm2 } = await create2.json();
    assert.equal(vm2.status, 'running');
    assert.equal(await getManagedRunningCountFromDocker('u-jdoe'), 2);

    await waitUntil(async () => {
      const kpi = (await page.locator('[data-kpi-value="running"]').textContent())?.trim();
      const sb = (await page.locator('[data-sidebar-vm-badge]').textContent().catch(() => ''))?.trim();
      return kpi === '2' && sb === '2';
    }, 3500);
    assert.equal((await page.locator('[data-quota-value="vcpu"]').textContent()).trim(), '4 / 8');
    assert.equal((await page.locator('[data-quota-value="ram"]').textContent()).trim(), '8 / 16 GB');
    await maybeScreenshot(page, 'after_2_running.png');

    // Verify Desktop & Terminal selectors show exactly 2 running VMs matching docker ps
    await page.goto(`${baseUrl}/desktop`, { waitUntil: 'networkidle' });
    await waitUntil(async () => (await page.locator('[data-desktop-vm-selector] option').count()) === 2);
    await page.goto(`${baseUrl}/terminal`, { waitUntil: 'networkidle' });
    await waitUntil(async () => (await page.locator('[data-terminal-vm-selector] option').count()) === 2);

    // Go to /vms and run `docker stop` directly from CLI (no UI refresh!)
    await page.goto(`${baseUrl}/vms`, { waitUntil: 'networkidle' });
    await waitUntil(async () => (await page.locator('[data-vm-status="running"]').count()) === 2);

    await dockerCmd(['stop', '-t', '2', vm2.containerId]);
    assert.equal(await getManagedRunningCountFromDocker('u-jdoe'), 1);

    await waitUntil(async () => {
      const runningBadges = await page.locator('[data-vm-status="running"]').count();
      const stoppedBadges = await page.locator('[data-vm-status="stopped"]').count();
      const sb = (await page.locator('[data-sidebar-vm-badge]').textContent().catch(() => ''))?.trim();
      return runningBadges === 1 && stoppedBadges === 1 && sb === '1';
    }, 5000);

    // Hit-test action buttons per state: Start enabled on stopped VM, Desktop/Terminal on running VM
    assert.equal(await page.locator('[data-vm-action="start"]').count(), 1);
    assert.equal(await page.locator('[data-vm-action="gui"]').count(), 1);
    assert.equal(await page.locator('[data-vm-action="terminal"]').count(), 1);

    // Run `docker rm` on VM 2 directly from CLI (no UI refresh!)
    await dockerCmd(['rm', '-f', vm2.containerId]);
    await waitUntil(async () => (await page.locator('[data-vm-status="missing"]').count()) === 1, 5000);
    assert.equal(await page.locator('[data-vm-action="recreate"]').count(), 1, 'Missing VM must offer Recreate button');
    console.log('  ✓ Test 3 passed (2 running -> CLI docker stop -> Stopped -> CLI docker rm -> Missing + Recreate)');

    // =========================================================================
    // TEST 4: Block Docker socket -> Unknown/stale banner, 0 running -> restore -> recovers
    // =========================================================================
    console.log('\n[Test 4] Block Docker socket -> Unknown/stale -> Restore...');
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle' });
    await waitUntil(async () => (await page.locator('[data-kpi-value="running"]').textContent())?.trim() === '1');

    proxy.block();

    await waitUntil(async () => {
      const bannerVisible = (await page.locator('[data-docker-unreachable="true"]').count()) > 0;
      const kpi = (await page.locator('[data-kpi-value="running"]').textContent())?.trim();
      const sbCount = await page.locator('[data-sidebar-vm-badge]').count();
      return bannerVisible && kpi === '0' && sbCount === 0;
    }, 6000);

    // Confirm API also returns stale:true, dockerReachable:false, and 0 running
    const unreachRes = await fetch(`${baseUrl}/api/vms`, { headers: { Cookie: studentCookie } });
    const unreachData = await unreachRes.json();
    assert.equal(unreachData.dockerReachable, false);
    assert.equal(unreachData.stale, true);
    assert.equal(unreachData.vms.filter((v) => v.status === 'running').length, 0);
    assert.ok(unreachData.vms.every((v) => v.status === 'unknown'));
    await maybeScreenshot(page, 'after_docker_unreachable.png');

    // Restore Docker socket proxy and verify automatic recovery
    proxy.restore();
    await waitUntil(async () => {
      const bannerGone = (await page.locator('[data-docker-unreachable="true"]').count()) === 0;
      const kpi = (await page.locator('[data-kpi-value="running"]').textContent())?.trim();
      return bannerGone && kpi === '1';
    }, 8000);
    console.log('  ✓ Test 4 passed (Docker unreachable -> Unknown/Stale banner, 0 running -> restored automatically)');

    // =========================================================================
    // TEST 8: Assert zero browser console errors across all Playwright steps before killing server
    // =========================================================================
    const nonAuthConsoleErrors = consoleErrors.filter((e) => !e.includes('401'));
    assert.equal(nonAuthConsoleErrors.length, 0, `Unexpected browser console errors: ${nonAuthConsoleErrors.join('; ')}`);
    await context.close();
    console.log('  ✓ Test 8 passed (0 browser console errors across Dashboard, VM list, Desktop, Terminal, and Docker outage)');

    // =========================================================================
    // TEST 5: Restart backend while containers keep running -> initial reconcile
    // =========================================================================
    console.log('\n[Test 5] Restart backend while containers keep running...');
    await stopProcess(realServer);
    realServer = startNextServer({
      port: REAL_PORT,
      demoMode: false,
      dockerHost,
      storePath: STORE_FILE,
      image: testImage,
    });
    await waitForHttp(`${baseUrl}/api/auth/me`);

    const {
      studentCookie: freshStudentCookie,
      student2Cookie: freshStudent2Cookie,
      adminCookie: freshAdminCookie,
    } = await provisionTestUsersAndLogin(baseUrl);
    const afterRestartRes = await fetch(`${baseUrl}/api/vms`, { headers: { Cookie: freshStudentCookie } });
    const afterRestart = await afterRestartRes.json();
    const restartedVm1 = afterRestart.vms.find((v) => v.id === vm1.id);
    const restartedVm2 = afterRestart.vms.find((v) => v.id === vm2.id);
    assert.equal(restartedVm1?.status, 'running', 'Running container must be running right after restart');
    assert.equal(restartedVm2?.status, 'missing', 'Removed container must remain missing right after restart');
    console.log('  ✓ Test 5 passed (backend restart reconciled real Docker state immediately)');

    // =========================================================================
    // TEST 6: Start/stop race and double-click tests
    // =========================================================================
    console.log('\n[Test 6] Concurrent start/stop race & double-click idempotency...');
    // Fire start twice + stop concurrently
    const [rA, rB, rC] = await Promise.all([
      fetch(`${baseUrl}/api/vms/${vm1.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: freshStudentCookie },
        body: JSON.stringify({ action: 'start' }),
      }),
      fetch(`${baseUrl}/api/vms/${vm1.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: freshStudentCookie },
        body: JSON.stringify({ action: 'start' }),
      }),
      fetch(`${baseUrl}/api/vms/${vm1.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: freshStudentCookie },
        body: JSON.stringify({ action: 'stop' }),
      }),
    ]);
    assert.ok(rA.status < 500 && rB.status < 500 && rC.status < 500, 'Race must never 500');

    const inspectRunning = (await dockerCmd(['inspect', '--format', '{{.State.Running}}', vm1.containerId])) === 'true';
    const apiSingleRes = await fetch(`${baseUrl}/api/vms/${vm1.id}`, { headers: { Cookie: freshStudentCookie } });
    const apiSingle = await apiSingleRes.json();
    assert.equal(apiSingle.vm.status === 'running', inspectRunning, 'API status must match docker inspect after race');

    // Start VM 1 again via double-click (two concurrent starts)
    const [s1, s2] = await Promise.all([
      fetch(`${baseUrl}/api/vms/${vm1.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: freshStudentCookie },
        body: JSON.stringify({ action: 'start' }),
      }),
      fetch(`${baseUrl}/api/vms/${vm1.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: freshStudentCookie },
        body: JSON.stringify({ action: 'start' }),
      }),
    ]);
    assert.equal(s1.status, 200);
    assert.equal(s2.status, 200);
    const inspectAfterStart = (await dockerCmd(['inspect', '--format', '{{.State.Running}}', vm1.containerId])) === 'true';
    assert.equal(inspectAfterStart, true);
    console.log('  ✓ Test 6 passed (start/stop race & double-click match docker inspect)');

    // =========================================================================
    // TEST 7: Authorization & isolation (students, admins, unmanaged containers, orphans, SSE)
    // =========================================================================
    console.log('\n[Test 7] Authorization, unmanaged container hiding, orphan visibility, SSE scoping...');
    // Start an UNMANAGED container on the host (no ptaas.managed label)
    const unmanagedId = await dockerCmd([
      'run', '-d', '--label', `ptaas.e2e=${TEST_TAG}`,
      '--name', `unmanaged-${TEST_TAG}`, testImage, 'sleep', '3600',
    ]);
    // Start an ORPHANED managed container (ptaas.managed=true, no VM metadata record)
    const orphanId = await dockerCmd([
      'run', '-d',
      '--label', 'ptaas.managed=true',
      '--label', 'ptaas.vm-id=vm-orphan-e2e',
      '--label', 'ptaas.owner=u-jsmith',
      '--label', 'ptaas.tenant=CS-401',
      '--label', `ptaas.e2e=${TEST_TAG}`,
      testImage, 'sleep', '3600',
    ]);
    // Create a VM belonging to Jane Smith (u-jsmith)
    const createOther = await fetch(`${baseUrl}/api/vms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: freshStudent2Cookie },
      body: JSON.stringify({ name: 'kali-jsmith-01', os: 'kali', vcpu: 2, ram: 4, disk: 30, waitForReady: true }),
    });
    assert.equal(createOther.status, 201);
    const { vm: otherVm } = await createOther.json();

    // Student 1 (u-jdoe) MUST NOT see Jane's VM, MUST NOT see unmanaged container, MUST NOT see orphans
    const s1ListRes = await fetch(`${baseUrl}/api/vms?refresh=true`, { headers: { Cookie: freshStudentCookie } });
    const s1List = await s1ListRes.json();
    assert.equal(s1List.orphans, undefined, 'Students must never receive orphans');
    assert.ok(s1List.vms.every((v) => v.owner === 'u-jdoe'), 'Student saw another user VM!');
    assert.ok(!s1List.vms.some((v) => v.id === otherVm.id || v.containerId === unmanagedId));

    // Student 1 attempting direct GET on Jane's VM must receive 403
    const forbiddenRes = await fetch(`${baseUrl}/api/vms/${otherVm.id}`, { headers: { Cookie: freshStudentCookie } });
    assert.equal(forbiddenRes.status, 403);

    // Student 1 SSE initial snapshot must also be strictly scoped
    const sseController = new AbortController();
    const sseRes = await fetch(`${baseUrl}/api/vms/events`, {
      headers: { Cookie: freshStudentCookie },
      signal: sseController.signal,
    });
    const reader = sseRes.body.getReader();
    const { value } = await reader.read();
    sseController.abort();
    const sseText = new TextDecoder().decode(value);
    assert.ok(sseText.includes('event: snapshot'), 'SSE must send snapshot event');
    assert.ok(!sseText.includes(otherVm.id), 'Student SSE leaked another user VM!');
    assert.ok(!sseText.includes(unmanagedId), 'Student SSE leaked unmanaged container!');
    assert.ok(!sseText.includes('vm-orphan-e2e'), 'Student SSE leaked orphan container!');

    // Admin sees all managed VMs + orphan, NEVER sees unmanaged host container
    const adminListRes = await fetch(`${baseUrl}/api/vms?refresh=true`, { headers: { Cookie: freshAdminCookie } });
    const adminList = await adminListRes.json();
    assert.ok(adminList.vms.some((v) => v.id === vm1.id));
    assert.ok(adminList.vms.some((v) => v.id === otherVm.id));
    assert.ok(!adminList.vms.some((v) => v.containerId === unmanagedId));
    assert.ok(adminList.orphans.some((o) => o.containerId.startsWith(orphanId.slice(0, 12))));
    assert.ok(!adminList.orphans.some((o) => o.containerId.startsWith(unmanagedId.slice(0, 12))));

    // Admin cleans up orphan
    const cleanRes = await fetch(`${baseUrl}/api/vms/orphans/${orphanId}`, {
      method: 'DELETE',
      headers: { Cookie: freshAdminCookie },
    });
    assert.equal(cleanRes.status, 200);
    console.log('  ✓ Test 7 passed (strict student/admin scoping, unmanaged ignored, orphan admin-only cleanup)');

    // =========================================================================
    // TEST 9: Demo mode works without Docker & shows "Demo simulation"; real mode never falls back
    // =========================================================================
    console.log('\n[Test 9] Demo mode isolation (no Docker needed) & no silent fallback in real mode...');
    demoServer = startNextServer({
      port: DEMO_PORT,
      demoMode: true,
      dockerHost: 'http://127.0.0.1:1', // guaranteed unreachable
      storePath: path.join(STORE_DIR, 'demo-unused.json'),
      image: testImage,
    });
    const demoUrl = `http://localhost:${DEMO_PORT}`;
    await waitForHttp(`${demoUrl}/api/auth/me`);

    const { studentCookie: demoCookie } = await provisionTestUsersAndLogin(demoUrl);
    const demoRes = await fetch(`${demoUrl}/api/vms`, { headers: { Cookie: demoCookie } });
    const demoData = await demoRes.json();
    assert.equal(demoData.demoMode, true);
    assert.equal(demoData.statusSource, 'demo');
    assert.ok(demoData.vms.length > 0, 'Demo mode should return simulated VMs without Docker');

    const demoContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const demoPage = await demoContext.newPage();
    const demoConsoleErrors = [];
    demoPage.on('console', (msg) => {
      if (msg.type() === 'error') demoConsoleErrors.push(msg.text());
    });
    await demoPage.goto(`${demoUrl}/login`, { waitUntil: 'networkidle' });
    await demoPage.fill('#login-email', 'john.doe@example.edu');
    await demoPage.fill('#login-pass', STUDENT_TEST_PASS);
    await demoPage.click('button[type="submit"]');
    await waitUntil(async () => (await demoPage.locator('[data-demo-simulation="true"]').count()) > 0, 10000);
    await maybeScreenshot(demoPage, 'after_demo_mode.png');
    assert.equal(demoConsoleErrors.filter((e) => !e.includes('401')).length, 0);
    await demoContext.close();
    console.log('  ✓ Test 9 passed (Demo mode works without Docker with "Demo simulation" badge)');

    console.log('\n==================================================');
    console.log('ALL 9 REAL DOCKER + PLAYWRIGHT E2E TESTS PASSED!');
    console.log('==================================================');
  } finally {
    await browser?.close().catch(() => {});
    await stopProcess(realServer);
    await stopProcess(demoServer);
    await proxy.close().catch(() => {});
    await cleanupTestContainers();
    fs.rmSync(STORE_DIR, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error('\n[FAILED] E2E suite failed:', err);
  process.exit(1);
});
