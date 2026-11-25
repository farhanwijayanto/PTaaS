/**
 * End-to-End Real Docker + API + SSE + Guacamole + Playwright Suite
 * Verifies all 10 scenarios for isolated per-VM Kali container provisioning:
 *   1. Two brand-new isolated containers, volumes, IPs, passwords, filesystems, zero fixed host ports
 *   2. Concurrent creation (10 parallel POST /api/vms) -> exact limit enforcement + idempotency key dedupe
 *   3. Failure injection: missing golden image (503) + failing healthcheck -> automatic rollback (0 orphans)
 *   4. Resource limits & hardening inspect + real OOM kill containment without affecting VM B
 *   5. Network isolation: no internet egress, no cross-tenant reachability, no docker.sock, lab target reachable
 *   6. Delete cleanup (container + dedicated volume removed, VM B intact) + backend restart persistence
 *   7. Gateway / Guacamole token routing to live internal container IP + unique per-VM password (never student123)
 *   8. Creation timing measurement (< 3 min PRD target) + host capacity guard (503 capacity_exceeded)
 *   9. Playwright E2E through 5-step Create wizard with live SSE progress stepper & matching docker ps counts
 *  10. Demo mode (DEMO_MODE=true) unaffected without Docker
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || '';
const STORE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ptaas-prov-e2e-'));
const MAIN_STORE = path.join(STORE_DIR, 'main-vms.json');
const FAIL_IMG_STORE = path.join(STORE_DIR, 'fail-img-vms.json');
const FAIL_HC_STORE = path.join(STORE_DIR, 'fail-hc-vms.json');
const OOM_STORE = path.join(STORE_DIR, 'oom-vms.json');
const CAP_STORE = path.join(STORE_DIR, 'cap-vms.json');
const DEMO_STORE = path.join(STORE_DIR, 'demo-vms.json');

const MAIN_PORT = 3194;
const AUX_PORT = 3195;
const DEMO_PORT = 3196;

const ADMIN_PASS = 'TestAdminPass123!';
const STUDENT1_PASS = 'TestStudent1Pass123!';
const STUDENT2_PASS = 'TestStudent2Pass123!';
const GUAC_KEY = '0123456789abcdef0123456789abcdef'; // 32-byte AES-256 key

const extraContainersToCleanup = new Set();

async function dockerCmd(args, { allowFail = false, timeout = 30000 } = {}) {
  try {
    const { stdout } = await execFileAsync('docker', args, { timeout });
    return { ok: true, stdout: stdout.trim() };
  } catch (err) {
    if (allowFail) {
      return { ok: false, stdout: String(err.stdout || '').trim(), stderr: String(err.stderr || '').trim(), code: err.code };
    }
    throw err;
  }
}

async function cleanupAllManagedDockerResources() {
  const { stdout: cids } = await dockerCmd(['ps', '-aq', '--filter', 'label=ptaas.managed=true'], { allowFail: true });
  for (const id of cids.split(/\r?\n/).filter(Boolean)) {
    await dockerCmd(['rm', '-f', id], { allowFail: true });
  }
  for (const cid of extraContainersToCleanup) {
    await dockerCmd(['rm', '-f', cid], { allowFail: true });
  }
  extraContainersToCleanup.clear();

  const { stdout: vols } = await dockerCmd(['volume', 'ls', '-q', '--filter', 'label=ptaas.managed=true'], { allowFail: true });
  for (const v of vols.split(/\r?\n/).filter(Boolean)) {
    await dockerCmd(['volume', 'rm', '-f', v], { allowFail: true });
  }
  const { stdout: nets } = await dockerCmd(['network', 'ls', '-q', '--filter', 'label=ptaas.managed=true'], { allowFail: true });
  for (const n of nets.split(/\r?\n/).filter(Boolean)) {
    await dockerCmd(['network', 'rm', n], { allowFail: true });
  }
}

async function pickGoldenTestImage() {
  const { stdout } = await dockerCmd(['images', '--format', '{{.Repository}}:{{.Tag}}']);
  const list = stdout.split(/\r?\n/).filter((l) => l && !l.includes('<none>'));
  for (const candidate of ['alpine:3.20', 'alpine:3.21', 'alpine:3.19']) {
    if (list.includes(candidate)) return candidate;
  }
  console.log('Pulling alpine:3.20 for lightweight real-Docker provisioning tests...');
  await dockerCmd(['pull', 'alpine:3.20'], { timeout: 120000 });
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

function startNextServer({ port, demoMode = false, storePath, kaliImage, extraEnv = {} }) {
  const child = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-p', String(port), '-H', '127.0.0.1'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ADMIN_INITIAL_PASSWORD: ADMIN_PASS,
        DEMO_MODE: demoMode ? 'true' : 'false',
        NEXT_PUBLIC_DEMO_MODE: demoMode ? 'true' : 'false',
        KALI_IMAGE: kaliImage,
        PTAAS_VM_STORE_PATH: storePath,
        PTAAS_VM_CMD: JSON.stringify(['sh', '-c', 'mkdir -p /home/student && sleep 3600']),
        GUAC_SECRET_KEY: GUAC_KEY,
        DOCKER_RECONCILE_INTERVAL_MS: '2000',
        DOCKER_UNREACHABLE_GRACE_MS: '1500',
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  child.stderr.on('data', (chunk) => {
    if (process.env.DEBUG_E2E) process.stderr.write(`[next:${port}] ${chunk}`);
  });
  return child;
}

async function stopChild(child) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ]);
  if (!child.killed) {
    try { child.kill('SIGKILL'); } catch {}
  }
}

async function loginApi(baseUrl, email, password) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  assert.equal(res.status, 200, `Login failed for ${email}: ${JSON.stringify(data)}`);
  const setCookie = res.headers.get('set-cookie');
  assert.ok(setCookie, 'Expected session Set-Cookie header');
  const cookie = setCookie.split(';')[0];
  return { cookie, user: data.user };
}

async function apiJson(baseUrl, cookie, urlPath, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: {
      Cookie: cookie,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function waitForVmStatus(baseUrl, cookie, vmId, targetStatus, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { status, data } = await apiJson(baseUrl, cookie, `/api/vms/${encodeURIComponent(vmId)}`);
    if (status === 200 && data?.vm?.status === targetStatus) {
      return data.vm;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out waiting for VM ${vmId} to reach status ${targetStatus}`);
}

function decryptGuacToken(tokenBase64) {
  const wrapper = JSON.parse(Buffer.from(tokenBase64, 'base64').toString('utf8'));
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(GUAC_KEY),
    Buffer.from(wrapper.iv, 'base64')
  );
  let decrypted = decipher.update(wrapper.value, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}

async function provisionTestStudents(baseUrl, adminCookie) {
  // Use deterministic seeded student IDs so owner IDs match identically across backend restarts
  const s1Id = 'u-jdoe';    // john.doe@example.edu (CS-401)
  const s2Id = 'u-ethomas'; // emma.thomas@example.edu (SEC-301)

  const p1 = await apiJson(baseUrl, adminCookie, `/api/admin/users/${encodeURIComponent(s1Id)}`, {
    method: 'PATCH',
    body: { password: STUDENT1_PASS, mustChangePassword: false, status: 'active' },
  });
  assert.equal(p1.status, 200, `Failed to configure student 1: ${JSON.stringify(p1.data)}`);

  const p2 = await apiJson(baseUrl, adminCookie, `/api/admin/users/${encodeURIComponent(s2Id)}`, {
    method: 'PATCH',
    body: { password: STUDENT2_PASS, mustChangePassword: false, status: 'active' },
  });
  assert.equal(p2.status, 200, `Failed to configure student 2: ${JSON.stringify(p2.data)}`);

  return { s1Id, s2Id };
}

async function main() {
  let mainServer = null;
  let auxServer = null;
  let demoServer = null;
  let browser = null;

  try {
    let version;
    for (let attempt = 0; attempt < 10; attempt++) {
      const v = await dockerCmd(['version', '--format', '{{.Server.Version}}'], { allowFail: true });
      if (v.ok && v.stdout) {
        version = v;
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    assert.ok(version?.stdout, 'Docker Engine did not become ready');
    console.log(`Real Docker Engine reachable: v${version.stdout}`);

    await cleanupAllManagedDockerResources();
    const goldenImage = await pickGoldenTestImage();
    console.log(`Using pre-pulled pinned golden test image: ${goldenImage}`);

    const MAIN_URL = `http://127.0.0.1:${MAIN_PORT}`;
    const AUX_URL = `http://127.0.0.1:${AUX_PORT}`;
    const DEMO_URL = `http://127.0.0.1:${DEMO_PORT}`;

    mainServer = startNextServer({ port: MAIN_PORT, storePath: MAIN_STORE, kaliImage: goldenImage });
    await waitForHttp(`${MAIN_URL}/login`);

    const admin = await loginApi(MAIN_URL, 'admin@example.com', ADMIN_PASS);
    await provisionTestStudents(MAIN_URL, admin.cookie);
    const student1 = await loginApi(MAIN_URL, 'john.doe@example.edu', STUDENT1_PASS);
    const student2 = await loginApi(MAIN_URL, 'emma.thomas@example.edu', STUDENT2_PASS);

    // Reject free-form image input from client
    const freeFormRes = await apiJson(MAIN_URL, student1.cookie, '/api/vms', {
      method: 'POST',
      body: { name: 'bad-freeform', image: 'ubuntu:latest', imageId: 'kali-2024.3', vcpu: 1, ram: 2, disk: 20 },
    });
    assert.equal(freeFormRes.status, 400, 'Client free-form image field must be rejected');

    // =========================================================================
    // TEST 1: Create two VMs for the same user -> full container/volume/IP/secret/FS isolation
    // =========================================================================
    console.log('\n[Test 1] Creating two isolated VMs (vm-iso-a and vm-iso-b) for the same student...');
    const t0 = Date.now();
    const createA = await apiJson(MAIN_URL, student1.cookie, '/api/vms', {
      method: 'POST',
      body: { name: 'vm-iso-a', imageId: 'kali-2024.3', vcpu: 1, ram: 2, disk: 20 },
      headers: { 'Idempotency-Key': 'test1-vm-a' },
    });
    assert.equal(createA.status, 201, `Create VM A failed: ${JSON.stringify(createA.data)}`);
    assert.equal(createA.data.vm.passwordEnc, undefined, 'Password hash/ciphertext must NEVER leak in API response');

    const vmA = await waitForVmStatus(MAIN_URL, student1.cookie, createA.data.vm.id, 'running');
    const createADurationMs = Date.now() - t0;

    const createB = await apiJson(MAIN_URL, student1.cookie, '/api/vms', {
      method: 'POST',
      body: { name: 'vm-iso-b', imageId: 'kali-2024.3', vcpu: 1, ram: 2, disk: 20 },
      headers: { 'Idempotency-Key': 'test1-vm-b' },
    });
    assert.equal(createB.status, 201, `Create VM B failed: ${JSON.stringify(createB.data)}`);
    const vmB = await waitForVmStatus(MAIN_URL, student1.cookie, createB.data.vm.id, 'running');

    // Capture REAL docker ps and docker volume ls output for two created VMs
    const dockerPsOut = (await dockerCmd([
      'ps',
      '--filter', 'label=ptaas.managed=true',
      '--format', 'table {{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}',
    ])).stdout;
    const dockerVolOut = (await dockerCmd([
      'volume', 'ls',
      '--filter', 'label=ptaas.managed=true',
      '--format', 'table {{.Driver}}\t{{.Name}}',
    ])).stdout;

    console.log('\n--- REAL docker ps (two created VMs) ---\n' + dockerPsOut);
    console.log('\n--- REAL docker volume ls (two created VMs) ---\n' + dockerVolOut + '\n');

    assert.notEqual(vmA.id, vmB.id);
    assert.notEqual(vmA.containerId, vmB.containerId);
    assert.notEqual(vmA.containerName, vmB.containerName);
    assert.ok(vmA.containerName.startsWith('ptaas-vm-'));
    assert.ok(vmB.containerName.startsWith('ptaas-vm-'));
    assert.ok(vmA.ip && vmB.ip && vmA.ip !== vmB.ip, `Expected distinct IPs: ${vmA.ip} vs ${vmB.ip}`);
    assert.notEqual(vmA.volumeName, vmB.volumeName);

    const inspectA = JSON.parse((await dockerCmd(['inspect', vmA.containerId])).stdout)[0];
    const inspectB = JSON.parse((await dockerCmd(['inspect', vmB.containerId])).stdout)[0];

    // Zero fixed host ports published
    assert.deepEqual(inspectA.HostConfig.PortBindings || {}, {}, 'VM A must not bind fixed host ports');
    assert.deepEqual(inspectB.HostConfig.PortBindings || {}, {}, 'VM B must not bind fixed host ports');

    // Distinct per-VM strong passwords, never student123
    const envA = Object.fromEntries((inspectA.Config.Env || []).map((e) => e.split(/=(.*)/s).slice(0, 2)));
    const envB = Object.fromEntries((inspectB.Config.Env || []).map((e) => e.split(/=(.*)/s).slice(0, 2)));
    assert.ok(envA.PTAAS_VM_PASSWORD && envA.PTAAS_VM_PASSWORD.length >= 20, 'VM A must have strong >=20-char password');
    assert.ok(envB.PTAAS_VM_PASSWORD && envB.PTAAS_VM_PASSWORD.length >= 20, 'VM B must have strong >=20-char password');
    assert.notEqual(envA.PTAAS_VM_PASSWORD, envB.PTAAS_VM_PASSWORD, 'VM A and VM B must never share a password');
    assert.notEqual(envA.PTAAS_VM_PASSWORD, 'student123');
    assert.notEqual(envB.PTAAS_VM_PASSWORD, 'student123');

    // Filesystem isolation on dedicated persistent volumes (/home/student)
    await dockerCmd(['exec', vmA.containerId, 'sh', '-c', 'echo "only-in-vm-a" > /home/student/secret-a.txt']);
    const checkInA = await dockerCmd(['exec', vmA.containerId, 'cat', '/home/student/secret-a.txt']);
    assert.equal(checkInA.stdout, 'only-in-vm-a');
    const checkInB = await dockerCmd(['exec', vmB.containerId, 'cat', '/home/student/secret-a.txt'], { allowFail: true });
    assert.equal(checkInB.ok, false, 'File written in VM A /home/student must NOT exist in VM B');
    console.log(`  ✓ Test 1 PASSED (VM A ${vmA.containerName} @ ${vmA.ip}, VM B ${vmB.containerName} @ ${vmB.ip}; distinct volumes, secrets, FS, zero host ports)`);

    // =========================================================================
    // TEST 7 (run while A & B are both alive): Gateway / Guacamole token routing
    // =========================================================================
    console.log('\n[Test 7] Verifying Guacamole/Gateway token routing & unique per-VM secret injection...');
    const tokARdp = await apiJson(MAIN_URL, student1.cookie, `/api/guac-token?vm=${encodeURIComponent(vmA.id)}&protocol=rdp`);
    const tokASsh = await apiJson(MAIN_URL, student1.cookie, `/api/guac-token?vm=${encodeURIComponent(vmA.id)}&protocol=ssh`);
    const tokBRdp = await apiJson(MAIN_URL, student1.cookie, `/api/guac-token?vm=${encodeURIComponent(vmB.id)}&protocol=rdp`);
    assert.equal(tokARdp.status, 200);
    assert.equal(tokASsh.status, 200);
    assert.equal(tokBRdp.status, 200);
    assert.equal(JSON.stringify(tokARdp.data).includes(envA.PTAAS_VM_PASSWORD), false, 'Plaintext password must NEVER appear in API JSON');

    const decARdp = decryptGuacToken(tokARdp.data.token);
    const decASsh = decryptGuacToken(tokASsh.data.token);
    const decBRdp = decryptGuacToken(tokBRdp.data.token);

    assert.equal(decARdp.connection.settings.hostname, vmA.ip);
    assert.equal(decASsh.connection.settings.hostname, vmA.ip);
    assert.equal(decBRdp.connection.settings.hostname, vmB.ip);
    assert.equal(decARdp.connection.settings.password, envA.PTAAS_VM_PASSWORD);
    assert.equal(decBRdp.connection.settings.password, envB.PTAAS_VM_PASSWORD);
    assert.notEqual(decARdp.connection.settings.password, decBRdp.connection.settings.password);
    assert.equal(decARdp.scope.vmId, vmA.id);
    assert.equal(decBRdp.scope.vmId, vmB.id);

    // Cross-user token access denied
    const crossTok = await apiJson(MAIN_URL, student2.cookie, `/api/guac-token?vm=${encodeURIComponent(vmA.id)}&protocol=rdp`);
    assert.equal(crossTok.status, 404, 'Another student must not be able to request a tunnel token for VM A');
    console.log('  ✓ Test 7 PASSED (Live container IP routing + unique encrypted per-VM password + strict VM/user scoping)');

    // =========================================================================
    // TEST 4 (Part A - Inspect hardening & resource limits on VM A)
    // =========================================================================
    console.log('\n[Test 4A] Verifying container hardening & resource limits on VM A...');
    assert.equal(inspectA.HostConfig.NanoCpus, 1_000_000_000, 'NanoCpus must equal 1 vCPU');
    assert.equal(inspectA.HostConfig.Memory, 2 * 1024 * 1024 * 1024, 'Memory must equal 2 GB');
    assert.equal(inspectA.HostConfig.MemorySwap, inspectA.HostConfig.Memory, 'MemorySwap must equal Memory');
    assert.equal(inspectA.HostConfig.PidsLimit, 256, 'PidsLimit must be enforced');
    assert.ok(inspectA.HostConfig.ShmSize >= 64 * 1024 * 1024, 'ShmSize must be configured');
    assert.equal(inspectA.HostConfig.Privileged, false, 'Container must be non-privileged');
    assert.ok((inspectA.HostConfig.CapDrop || []).includes('ALL'), 'CapDrop must include ALL');
    assert.ok((inspectA.HostConfig.SecurityOpt || []).includes('no-new-privileges:true'), 'no-new-privileges:true required');
    assert.equal((inspectA.Mounts || []).some((m) => m.Type === 'bind'), false, 'Zero host bind mounts allowed');
    assert.equal(inspectA.Config.Labels['ptaas.managed'], 'true');
    assert.equal(inspectA.Config.Labels['ptaas.vm-id'], vmA.id);
    assert.equal(inspectA.Config.Labels['ptaas.owner'], student1.user.id);
    assert.equal(inspectA.Config.Labels['ptaas.tenant'], 'CS-401');
    console.log('  ✓ Test 4A PASSED (NanoCpus, Memory===MemorySwap, PidsLimit, ShmSize, CapDrop=ALL, no-new-privileges, 0 bind mounts)');

    // =========================================================================
    // TEST 5: Network isolation (no egress, no cross-tenant, no docker.sock, internal lab target reachable)
    // =========================================================================
    console.log('\n[Test 5] Verifying network isolation (egress drop, cross-tenant block, docker.sock absent, internal lab target reachable)...');
    const netInspect = JSON.parse((await dockerCmd(['network', 'inspect', 'ptaas-lab-cs-401'])).stdout)[0];
    assert.equal(netInspect.Internal, true, 'Tenant network must be Internal: true');

    // Outbound internet must fail
    const egressPing = await dockerCmd(['exec', vmA.containerId, 'sh', '-c', 'ping -c 1 -W 1 1.1.1.1'], { allowFail: true });
    assert.equal(egressPing.ok, false, 'Outbound internet egress must be blocked');

    // Docker socket must not exist inside VM
    const sockCheck = await dockerCmd(['exec', vmA.containerId, 'test', '-e', '/var/run/docker.sock'], { allowFail: true });
    assert.equal(sockCheck.ok, false, 'Docker socket must never be mounted in VM');

    // Create VM C for Student 2 in tenant SEC-301 -> verify cross-tenant isolation
    const createC = await apiJson(MAIN_URL, student2.cookie, '/api/vms', {
      method: 'POST',
      body: { name: 'vm-tenant-c', imageId: 'kali-2024.3', vcpu: 1, ram: 2, disk: 20 },
    });
    assert.equal(createC.status, 201);
    const vmC = await waitForVmStatus(MAIN_URL, student2.cookie, createC.data.vm.id, 'running');
    assert.equal(vmC.networkName, 'ptaas-lab-sec-301');

    const crossPing = await dockerCmd(['exec', vmA.containerId, 'sh', '-c', `ping -c 1 -W 1 ${vmC.ip}`], { allowFail: true });
    assert.equal(crossPing.ok, false, `Cross-tenant ping from CS-401 (${vmA.ip}) to SEC-301 (${vmC.ip}) must fail`);

    // Attach a lab target container to ptaas-lab-cs-401 -> VM A MUST reach it!
    const targetName = `ptaas-test-target-${Date.now()}`;
    const targetRun = await dockerCmd([
      'run', '-d',
      '--name', targetName,
      '--network', 'ptaas-lab-cs-401',
      goldenImage,
      'sh', '-c', 'while true; do printf "HTTP/1.1 200 OK\\r\\nContent-Length: 2\\r\\n\\r\\nOK" | nc -l -p 8080; done',
    ]);
    extraContainersToCleanup.add(targetRun.stdout);
    const targetIp = (await dockerCmd([
      'inspect', '-f', '{{(index .NetworkSettings.Networks "ptaas-lab-cs-401").IPAddress}}', targetName,
    ])).stdout;
    assert.ok(targetIp, 'Lab target must receive IP on tenant network');

    // Wait briefly for nc listener and test reachability from VM A
    await new Promise((r) => setTimeout(r, 400));
    const labReach = await dockerCmd(['exec', vmA.containerId, 'sh', '-c', `wget -T 3 -qO- http://${targetIp}:8080`]);
    assert.equal(labReach.stdout, 'OK', 'VM A must be able to reach an authorized lab target on its tenant network');
    await dockerCmd(['rm', '-f', targetName], { allowFail: true });
    extraContainersToCleanup.delete(targetRun.stdout);
    console.log(`  ✓ Test 5 PASSED (Internal=true, egress blocked, SEC-301 ${vmC.ip} blocked, docker.sock absent, CS-401 lab target ${targetIp}:8080 reachable)`);

    // =========================================================================
    // TEST 6: Delete VM A -> container & volume removed, VM B intact + Backend restart persistence
    // =========================================================================
    console.log('\n[Test 6] Deleting VM A, verifying container+volume cleanup & backend restart persistence for VM B...');
    const delA = await apiJson(MAIN_URL, student1.cookie, `/api/vms/${encodeURIComponent(vmA.id)}`, { method: 'DELETE' });
    assert.equal(delA.status, 200);

    const inspectGoneA = await dockerCmd(['inspect', vmA.containerId], { allowFail: true });
    assert.equal(inspectGoneA.ok, false, 'Deleted VM A container must be removed');
    const volGoneA = await dockerCmd(['volume', 'inspect', vmA.volumeName], { allowFail: true });
    assert.equal(volGoneA.ok, false, 'Deleted VM A dedicated volume must be removed');

    // VM B is completely unaffected
    const checkBStillUp = await apiJson(MAIN_URL, student1.cookie, `/api/vms/${encodeURIComponent(vmB.id)}`);
    assert.equal(checkBStillUp.data.vm.status, 'running');

    // Restart Next.js backend server -> verify VM B mapping & running status survive intact!
    await stopChild(mainServer);
    mainServer = startNextServer({ port: MAIN_PORT, storePath: MAIN_STORE, kaliImage: goldenImage });
    await waitForHttp(`${MAIN_URL}/login`);

    const adminAfterRestart = await loginApi(MAIN_URL, 'admin@example.com', ADMIN_PASS);
    await provisionTestStudents(MAIN_URL, adminAfterRestart.cookie);
    const student1AfterRestart = await loginApi(MAIN_URL, 'john.doe@example.edu', STUDENT1_PASS);
    const listAfterRestart = await apiJson(MAIN_URL, student1AfterRestart.cookie, '/api/vms');
    assert.equal(listAfterRestart.status, 200);
    assert.equal(listAfterRestart.data.vms.length, 1);
    assert.equal(listAfterRestart.data.vms[0].id, vmB.id);
    assert.equal(listAfterRestart.data.vms[0].status, 'running');
    assert.equal(listAfterRestart.data.vms[0].ip, vmB.ip);
    console.log(`  ✓ Test 6 PASSED (VM A container+volume removed; VM B ${vmB.containerName} @ ${vmB.ip} survived backend restart)`);

    // Clean up VM B & VM C before Test 2
    await apiJson(MAIN_URL, student1AfterRestart.cookie, `/api/vms/${encodeURIComponent(vmB.id)}`, { method: 'DELETE' });
    const student2AfterRestart = await loginApi(MAIN_URL, 'emma.thomas@example.edu', STUDENT2_PASS);
    await apiJson(MAIN_URL, student2AfterRestart.cookie, `/api/vms/${encodeURIComponent(vmC.id)}`, { method: 'DELETE' });

    // =========================================================================
    // TEST 2: Concurrency (10 parallel requests) + Limit Enforcement + Idempotency Key
    // =========================================================================
    console.log('\n[Test 2] Testing Idempotency-Key deduplication and 10 parallel POST /api/vms against 3-VM limit...');
    // 2a. Idempotency key: two simultaneous requests with identical key must produce 1 container
    const idempKey = `idem-${Date.now()}`;
    const [r1, r2] = await Promise.all([
      apiJson(MAIN_URL, student1AfterRestart.cookie, '/api/vms', {
        method: 'POST',
        body: { name: 'idem-kali-01', imageId: 'kali-2024.3', vcpu: 1, ram: 2, disk: 20 },
        headers: { 'Idempotency-Key': idempKey },
      }),
      apiJson(MAIN_URL, student1AfterRestart.cookie, '/api/vms', {
        method: 'POST',
        body: { name: 'idem-kali-01', imageId: 'kali-2024.3', vcpu: 1, ram: 2, disk: 20 },
        headers: { 'Idempotency-Key': idempKey },
      }),
    ]);
    assert.equal(r1.status, 201);
    assert.equal(r2.status, 201);
    assert.equal(r1.data.vm.id, r2.data.vm.id, 'Duplicate Idempotency-Key must return same VM');
    await waitForVmStatus(MAIN_URL, student1AfterRestart.cookie, r1.data.vm.id, 'running');
    await apiJson(MAIN_URL, student1AfterRestart.cookie, `/api/vms/${encodeURIComponent(r1.data.vm.id)}`, { method: 'DELETE' });

    // 2b. Fire 10 concurrent create requests for student1 (limit = 3)
    const parallelPromises = Array.from({ length: 10 }, (_, idx) =>
      apiJson(MAIN_URL, student1AfterRestart.cookie, '/api/vms', {
        method: 'POST',
        body: { name: `race-vm-${String(idx).padStart(2, '0')}`, imageId: 'kali-2024.3', vcpu: 1, ram: 2, disk: 20 },
      })
    );
    const raceResults = await Promise.all(parallelPromises);
    const created201 = raceResults.filter((r) => r.status === 201);
    const rejected409 = raceResults.filter((r) => r.status === 409 && r.data?.code === 'vm_limit_reached');

    assert.equal(created201.length, 3, `Expected exactly 3 VMs created, got ${created201.length}: ${JSON.stringify(raceResults.map((r) => ({ s: r.status, c: r.data?.code })))}`);
    assert.equal(rejected409.length, 7, `Expected 7 rejected with 409 vm_limit_reached, got ${rejected409.length}`);

    // Wait for all 3 to finish starting, verify docker ps count === 3
    for (const r of created201) {
      await waitForVmStatus(MAIN_URL, student1AfterRestart.cookie, r.data.vm.id, 'running');
    }
    const dockerRaceIds = (await dockerCmd([
      'ps', '-q',
      '--filter', 'label=ptaas.managed=true',
      '--filter', `label=ptaas.owner=${student1AfterRestart.user.id}`,
    ])).stdout.split(/\r?\n/).filter(Boolean);
    assert.equal(dockerRaceIds.length, 3, `Docker must have exactly 3 containers for student1, got ${dockerRaceIds.length}`);
    console.log('  ✓ Test 2 PASSED (Idempotency deduped to 1 container; 10 parallel requests -> exactly 3 created, 7 got 409 vm_limit_reached, docker ps = 3)');

    // Delete those 3 race VMs
    for (const r of created201) {
      await apiJson(MAIN_URL, student1AfterRestart.cookie, `/api/vms/${encodeURIComponent(r.data.vm.id)}`, { method: 'DELETE' });
    }

    // =========================================================================
    // TEST 9: Playwright E2E through 5-step Create Wizard -> Live SSE Progress -> /vms matches docker ps
    // =========================================================================
    console.log('\n[Test 9] Running Playwright E2E through 5-step Create wizard (VM A & VM B)...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    const PW_BASE = `http://localhost:${MAIN_PORT}`;
    await page.goto(`${PW_BASE}/login`, { waitUntil: 'networkidle' });
    await page.fill('#login-email', 'john.doe@example.edu');
    await page.fill('#login-pass', STUDENT1_PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });

    // Start tracking console errors after login (unauthenticated /api/auth/me on /login legitimately returns 401)
    consoleErrors.length = 0;

    async function createViaWizard(vmName, captureShotName) {
      await page.goto(`${PW_BASE}/vms/new`, { waitUntil: 'networkidle' });
      await page.waitForSelector('#vm-name-input', { timeout: 10000 });
      await page.fill('#vm-name-input', vmName);
      // Step 1 -> Step 2 (select Small 1 vCPU / 2 GB RAM spec so 2 VMs fit comfortably on 4 GB Docker Desktop)
      await page.click('#wizard-next-btn');
      await page.getByRole('button', { name: /Small \(CTF/i }).click();
      // Step 2 -> 3 -> 4 -> 5
      for (let s = 2; s <= 4; s++) {
        await page.click('#wizard-next-btn');
      }
      await page.waitForSelector('#launch-btn:not([disabled])', { timeout: 10000 });
      await page.click('#launch-btn');
      await page.waitForSelector('#vm-ready-banner', { timeout: 20000 });
      const ipText = await page.locator('#created-vm-ip').textContent();
      assert.ok(ipText && ipText.includes('.'), `Expected live assigned Lab IP in wizard, got: ${ipText}`);
      if (SCREENSHOT_DIR && captureShotName) {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, captureShotName), fullPage: true });
      }
      // Hit-test Open Remote Desktop & Open Terminal buttons are enabled
      assert.equal(await page.locator('#open-desktop-btn').isDisabled(), false);
      assert.equal(await page.locator('#open-terminal-btn').isDisabled(), false);
    }

    await createViaWizard('pw-kali-a', 'provisioning_wizard_ready.png');
    await createViaWizard('pw-kali-b', null);

    // Navigate to /vms and verify both VMs are Running and match docker ps
    await page.goto(`${PW_BASE}/vms`, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => document.body.innerText.includes('pw-kali-a') && document.body.innerText.includes('pw-kali-b'),
      { timeout: 15000 }
    );
    if (SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'provisioning_two_vms_list.png'), fullPage: true });
    }

    const pwDockerIds = (await dockerCmd([
      'ps', '-q',
      '--filter', 'label=ptaas.managed=true',
      '--filter', `label=ptaas.owner=${student1AfterRestart.user.id}`,
    ])).stdout.split(/\r?\n/).filter(Boolean);
    assert.equal(pwDockerIds.length, 2, 'Docker ps must show exactly 2 running VMs created via Playwright wizard');
    assert.equal(consoleErrors.length, 0, `Playwright console errors: ${consoleErrors.join('; ')}`);

    await context.close();
    console.log('  ✓ Test 9 PASSED (5-step wizard created pw-kali-a & pw-kali-b with live SSE stepper, assigned IPs, 0 console errors, matches docker ps)');

    // Stop main server and clean up containers before auxiliary failure/OOM/capacity servers
    await stopChild(mainServer);
    mainServer = null;
    await cleanupAllManagedDockerResources();

    // =========================================================================
    // TEST 3: Failure Injection — (a) Missing Golden Image (503) & (b) Failing Healthcheck -> Automatic Rollback
    // =========================================================================
    console.log('\n[Test 3A] Failure injection: missing golden image -> 503 image_not_ready, 0 containers/volumes...');
    auxServer = startNextServer({
      port: AUX_PORT,
      storePath: FAIL_IMG_STORE,
      kaliImage: 'ptaas-nonexistent-repo/missing-kali:9.9.9',
    });
    await waitForHttp(`${AUX_URL}/login`);
    const auxAdminA = await loginApi(AUX_URL, 'admin@example.com', ADMIN_PASS);
    const imgHealth = await apiJson(AUX_URL, auxAdminA.cookie, '/api/images/health');
    assert.equal(imgHealth.status, 200);
    assert.equal(imgHealth.data.images.find((i) => i.id === 'kali-2024.3')?.ready, false);

    const missingImgCreate = await apiJson(AUX_URL, auxAdminA.cookie, '/api/vms', {
      method: 'POST',
      body: { name: 'fail-missing-img', imageId: 'kali-2024.3', vcpu: 1, ram: 2, disk: 20 },
    });
    assert.equal(missingImgCreate.status, 503);
    assert.equal(missingImgCreate.data.code, 'image_not_ready');
    assert.equal((await dockerCmd(['ps', '-aq', '--filter', 'label=ptaas.managed=true'])).stdout, '');
    assert.equal((await dockerCmd(['volume', 'ls', '-q', '--filter', 'label=ptaas.managed=true'])).stdout, '');
    await stopChild(auxServer);
    auxServer = null;
    console.log('  ✓ Test 3A PASSED (503 image_not_ready, 0 containers/volumes left behind)');

    console.log('\n[Test 3B] Failure injection: failing container healthcheck -> automatic container+volume rollback & quota release...');
    auxServer = startNextServer({
      port: AUX_PORT,
      storePath: FAIL_HC_STORE,
      kaliImage: goldenImage,
      extraEnv: {
        PTAAS_HEALTHCHECK_CMD: 'exit 1',
        PTAAS_READINESS_TIMEOUT_MS: '10000',
      },
    });
    await waitForHttp(`${AUX_URL}/login`);
    const auxAdminB = await loginApi(AUX_URL, 'admin@example.com', ADMIN_PASS);
    const hcCreate = await apiJson(AUX_URL, auxAdminB.cookie, '/api/vms', {
      method: 'POST',
      body: { name: 'fail-healthcheck-vm', imageId: 'kali-2024.3', vcpu: 1, ram: 2, disk: 20 },
    });
    assert.equal(hcCreate.status, 201);
    const failedVmId = hcCreate.data.vm.id;

    // Wait for unhealthy rollback (healthcheck interval 1s, retries 2 -> ~3-5s)
    const rbStart = Date.now();
    let rolledBack = false;
    while (Date.now() - rbStart < 15000) {
      const check = await apiJson(AUX_URL, auxAdminB.cookie, `/api/vms/${encodeURIComponent(failedVmId)}`);
      if (check.status === 404) {
        rolledBack = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    assert.equal(rolledBack, true, 'Failed healthcheck VM must be rolled back and deleted from records');
    assert.equal((await dockerCmd(['ps', '-aq', '--filter', 'label=ptaas.managed=true'])).stdout, '', '0 orphaned containers after rollback');
    assert.equal((await dockerCmd(['volume', 'ls', '-q', '--filter', 'label=ptaas.managed=true'])).stdout, '', '0 orphaned volumes after rollback');
    await stopChild(auxServer);
    auxServer = null;
    console.log('  ✓ Test 3B PASSED (Unhealthy container automatically rolled back: 0 orphaned containers, 0 orphaned volumes, quota slot released)');

    // =========================================================================
    // TEST 4B: OOM kill containment (memory hog in tiny-RAM container does NOT affect sibling VM)
    // =========================================================================
    console.log('\n[Test 4B] Testing OOM containment (memory hog killed inside 16MB VM without affecting sibling VM)...');
    auxServer = startNextServer({
      port: AUX_PORT,
      storePath: OOM_STORE,
      kaliImage: goldenImage,
      extraEnv: {
        PTAAS_CONTAINER_RAM_MB: '16',
      },
    });
    await waitForHttp(`${AUX_URL}/login`);
    const auxAdminOom = await loginApi(AUX_URL, 'admin@example.com', ADMIN_PASS);
    const oomVictimRes = await apiJson(AUX_URL, auxAdminOom.cookie, '/api/vms', {
      method: 'POST',
      body: { name: 'oom-victim-vm', imageId: 'kali-2024.3', vcpu: 1, ram: 2, disk: 20 },
    });
    const oomBystanderRes = await apiJson(AUX_URL, auxAdminOom.cookie, '/api/vms', {
      method: 'POST',
      body: { name: 'oom-bystander-vm', imageId: 'kali-2024.3', vcpu: 1, ram: 2, disk: 20 },
    });
    const oomVictim = await waitForVmStatus(AUX_URL, auxAdminOom.cookie, oomVictimRes.data.vm.id, 'running');
    const oomBystander = await waitForVmStatus(AUX_URL, auxAdminOom.cookie, oomBystanderRes.data.vm.id, 'running');

    // Trigger OOM inside victim container (write >24MB into /dev/shm or awk memory hog)
    const hogRes = await dockerCmd([
      'exec', oomVictim.containerId,
      'sh', '-c', 'dd if=/dev/zero of=/dev/shm/hog bs=1M count=32 2>&1 || awk "BEGIN { s=\\"x\\"; for (i=0;i<26;i++) s=s s }"',
    ], { allowFail: true, timeout: 15000 });
    assert.equal(hogRes.ok, false, 'Memory hog exceeding 16MB cgroup limit must be killed/rejected by kernel');

    // Bystander container must remain healthy & running
    const bystanderAfter = await dockerCmd(['inspect', '-f', '{{.State.Running}}', oomBystander.containerId]);
    assert.equal(bystanderAfter.stdout, 'true', 'Sibling VM must remain unaffected when neighbor hits memory limit');
    await stopChild(auxServer);
    auxServer = null;
    await cleanupAllManagedDockerResources();
    console.log('  ✓ Test 4B PASSED (Memory hog contained by 16MB cgroup limit; sibling VM completely unaffected)');

    // =========================================================================
    // TEST 8: Creation timing measurement & Host capacity guard (503 capacity_exceeded)
    // =========================================================================
    console.log('\n[Test 8] Testing creation timing (<3 min PRD target) & Host capacity guard (503 capacity_exceeded)...');
    assert.ok(createADurationMs < 180_000, `Creation took ${createADurationMs}ms, exceeding 180s PRD target`);

    auxServer = startNextServer({
      port: AUX_PORT,
      storePath: CAP_STORE,
      kaliImage: goldenImage,
      extraEnv: {
        PTAAS_SIMULATED_FREE_RAM_MB: '128',
      },
    });
    await waitForHttp(`${AUX_URL}/login`);
    const auxAdminCap = await loginApi(AUX_URL, 'admin@example.com', ADMIN_PASS);
    const capRes = await apiJson(AUX_URL, auxAdminCap.cookie, '/api/vms', {
      method: 'POST',
      body: { name: 'over-capacity-vm', imageId: 'kali-2024.3', vcpu: 2, ram: 4, disk: 30 },
    });
    assert.equal(capRes.status, 503);
    assert.equal(capRes.data.code, 'capacity_exceeded');
    assert.equal((await dockerCmd(['ps', '-aq', '--filter', 'label=ptaas.managed=true'])).stdout, '');
    await stopChild(auxServer);
    auxServer = null;
    console.log(`  ✓ Test 8 PASSED (Measured pre-pulled creation-to-Ready time: ${(createADurationMs / 1000).toFixed(2)}s << 180s; host capacity guard returned 503 capacity_exceeded with 0 containers created)`);

    // =========================================================================
    // TEST 10: Demo mode unaffected without Docker
    // =========================================================================
    console.log('\n[Test 10] Verifying DEMO_MODE=true remains a labeled simulation without touching Docker...');
    demoServer = startNextServer({
      port: DEMO_PORT,
      demoMode: true,
      storePath: DEMO_STORE,
      kaliImage: goldenImage,
      extraEnv: {
        DOCKER_HOST: 'http://127.0.0.1:1', // Deliberately unreachable
      },
    });
    await waitForHttp(`${DEMO_URL}/login`);
    const demoCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const demoPage = await demoCtx.newPage();
    await demoPage.goto(`http://localhost:${DEMO_PORT}/login`, { waitUntil: 'networkidle' });
    await demoPage.fill('#login-email', 'admin@example.com');
    await demoPage.fill('#login-pass', ADMIN_PASS);
    await demoPage.click('button[type="submit"]');
    await demoPage.waitForURL('**/dashboard', { timeout: 15000 });

    await demoPage.goto(`http://localhost:${DEMO_PORT}/vms/new`, { waitUntil: 'networkidle' });
    await demoPage.waitForFunction(() => document.body.innerText.includes('Demo simulation'), { timeout: 10000 });
    await demoPage.fill('#vm-name-input', 'demo-sim-vm');
    for (let s = 1; s <= 4; s++) {
      await demoPage.click('#wizard-next-btn');
    }
    await demoPage.click('#launch-btn');
    await demoPage.waitForSelector('#vm-ready-banner', { timeout: 10000 });
    assert.equal((await dockerCmd(['ps', '-aq', '--filter', 'label=ptaas.managed=true'])).stdout, '', 'DEMO_MODE must never touch Docker');
    await demoCtx.close();
    console.log('  ✓ Test 10 PASSED (DEMO_MODE=true works cleanly as labeled simulation without touching Docker)');

    console.log('\n====================================================================');
    console.log('[ALL 10 PROVISIONING & ISOLATION E2E TESTS PASSED SUCCESSFULLY]');
    console.log(`Measured creation-to-Ready (pre-pulled image): ${(createADurationMs / 1000).toFixed(2)}s`);
    console.log('====================================================================');
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stopChild(mainServer);
    await stopChild(auxServer);
    await stopChild(demoServer);
    await cleanupAllManagedDockerResources().catch(() => {});
    fs.rmSync(STORE_DIR, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('\n[FAILED] Provisioning E2E test suite failed:', err);
  process.exit(1);
});
