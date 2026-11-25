import assert from 'node:assert/strict';
import {
  PTAAS_LABELS,
  normalizeDockerContainer,
  mapContainerToStatus,
  reconcileVms,
} from '../src/lib/docker-status.ts';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log('Running Docker status mapping & reconcile unit tests...');

// --- 1. normalizeDockerContainer ---
test('normalizes Docker inspect payload with Health and RestartCount', () => {
  const c = normalizeDockerContainer({
    Id: 'abc123456789',
    Name: '/ptaas-vm-kali-lab-01',
    RestartCount: 2,
    Config: {
      Image: 'kasmweb/kali-rolling-desktop:1.15.0',
      Labels: {
        [PTAAS_LABELS.MANAGED]: 'true',
        [PTAAS_LABELS.VM_ID]: 'vm-1',
        [PTAAS_LABELS.OWNER]: 'u-jdoe',
        [PTAAS_LABELS.TENANT]: 'CS-401',
      },
    },
    State: {
      Status: 'running',
      Running: true,
      Paused: false,
      Restarting: false,
      OOMKilled: false,
      Dead: false,
      ExitCode: 0,
      StartedAt: '2026-11-25T07:00:00.000Z',
      FinishedAt: '0001-01-01T00:00:00Z',
      Health: { Status: 'healthy' },
    },
    NetworkSettings: {
      Networks: {
        'ptaas-net': { IPAddress: '172.22.0.5' },
      },
    },
  });

  assert.equal(c.id, 'abc123456789');
  assert.equal(c.name, 'ptaas-vm-kali-lab-01');
  assert.equal(c.state.running, true);
  assert.equal(c.state.healthStatus, 'healthy');
  assert.equal(c.state.restartCount, 2);
  assert.equal(c.state.finishedAt, null);
  assert.equal(c.ipAddress, '172.22.0.5');
});

test('normalizes Docker /containers/json list payload with health and exit code', () => {
  const healthy = normalizeDockerContainer({
    Id: 'list-1',
    Names: ['/ptaas-vm-kali-1'],
    Image: 'alpine:3.20',
    Labels: { [PTAAS_LABELS.MANAGED]: 'true', [PTAAS_LABELS.VM_ID]: 'vm-1' },
    State: 'running',
    Status: 'Up 3 minutes (health: starting)',
  });
  assert.equal(healthy.state.running, true);
  assert.equal(healthy.state.healthStatus, 'starting');

  const exited = normalizeDockerContainer({
    Id: 'list-2',
    Names: ['/ptaas-vm-kali-2'],
    Image: 'alpine:3.20',
    Labels: { [PTAAS_LABELS.MANAGED]: 'true', [PTAAS_LABELS.VM_ID]: 'vm-2' },
    State: 'exited',
    Status: 'Exited (137) 4 seconds ago',
  });
  assert.equal(exited.state.status, 'exited');
  assert.equal(exited.state.exitCode, 137);
});

// --- 2. mapContainerToStatus (all states & health combinations) ---
function makeContainer(stateOverrides = {}, labelOverrides = {}) {
  return {
    id: 'cid-1',
    name: 'ptaas-vm-test',
    image: 'alpine:3.20',
    labels: {
      [PTAAS_LABELS.MANAGED]: 'true',
      [PTAAS_LABELS.VM_ID]: 'vm-1',
      [PTAAS_LABELS.OWNER]: 'u-jdoe',
      [PTAAS_LABELS.TENANT]: 'CS-401',
      ...labelOverrides,
    },
    state: {
      status: 'running',
      running: true,
      paused: false,
      restarting: false,
      oomKilled: false,
      dead: false,
      exitCode: 0,
      startedAt: '2026-11-25T07:00:00.000Z',
      finishedAt: null,
      healthStatus: 'none',
      restartCount: 0,
      ...stateOverrides,
    },
  };
}

test('maps running container without healthcheck to running with UTC uptime', () => {
  const nowMs = Date.parse('2026-11-25T07:05:30.000Z');
  const res = mapContainerToStatus(makeContainer(), { nowMs });
  assert.equal(res.status, 'running');
  assert.equal(res.uptimeSeconds, 330);
  assert.equal(res.stale, false);
});

test('maps running + healthy container to running', () => {
  const res = mapContainerToStatus(makeContainer({ healthStatus: 'healthy' }));
  assert.equal(res.status, 'running');
});

test('maps running + health starting to starting', () => {
  const res = mapContainerToStatus(makeContainer({ healthStatus: 'starting' }));
  assert.equal(res.status, 'starting');
});

test('maps running + unhealthy to error', () => {
  const res = mapContainerToStatus(makeContainer({ healthStatus: 'unhealthy' }));
  assert.equal(res.status, 'error');
  assert.match(res.statusReason || '', /health check/i);
});

test('maps running + readinessPassed=false to starting', () => {
  const res = mapContainerToStatus(makeContainer(), { readinessPassed: false });
  assert.equal(res.status, 'starting');
  assert.match(res.statusReason || '', /readiness/i);
});

test('maps restarting container (<3 restarts) to starting with restarting=true', () => {
  const res = mapContainerToStatus(
    makeContainer({ status: 'restarting', running: false, restarting: true, restartCount: 1 })
  );
  assert.equal(res.status, 'starting');
  assert.equal(res.restarting, true);
});

test('maps crash-looping container (>=3 restarts) to error with restarting=true', () => {
  const res = mapContainerToStatus(
    makeContainer({ status: 'restarting', running: false, restarting: true, restartCount: 4, exitCode: 1 })
  );
  assert.equal(res.status, 'error');
  assert.equal(res.restarting, true);
  assert.match(res.statusReason || '', /crash loop/i);
});

test('maps paused container to paused', () => {
  const res = mapContainerToStatus(makeContainer({ status: 'paused', running: true, paused: true }));
  assert.equal(res.status, 'paused');
  assert.equal(res.uptimeSeconds, 0);
});

test('maps created container to stopped', () => {
  const res = mapContainerToStatus(makeContainer({ status: 'created', running: false }));
  assert.equal(res.status, 'stopped');
});

test('maps exited(0) and exited(143) to stopped', () => {
  const ex0 = mapContainerToStatus(makeContainer({ status: 'exited', running: false, exitCode: 0 }));
  assert.equal(ex0.status, 'stopped');

  const ex143 = mapContainerToStatus(makeContainer({ status: 'exited', running: false, exitCode: 143 }));
  assert.equal(ex143.status, 'stopped');
});

test('maps exited(137) after graceful docker stop to stopped, OOMKilled to error, ungraceful 137 to error', () => {
  const graceful = mapContainerToStatus(
    makeContainer({ status: 'exited', running: false, exitCode: 137, oomKilled: false }),
    { gracefulStopObserved: true }
  );
  assert.equal(graceful.status, 'stopped');

  const oom = mapContainerToStatus(
    makeContainer({ status: 'exited', running: false, exitCode: 137, oomKilled: true }),
    { gracefulStopObserved: true }
  );
  assert.equal(oom.status, 'error');
  assert.equal(oom.oomKilled, true);

  const killed = mapContainerToStatus(
    makeContainer({ status: 'exited', running: false, exitCode: 137, oomKilled: false }),
    { gracefulStopObserved: false }
  );
  assert.equal(killed.status, 'error');
});

test('maps exited(non-zero) and dead to error with reason', () => {
  const ex1 = mapContainerToStatus(makeContainer({ status: 'exited', running: false, exitCode: 1 }));
  assert.equal(ex1.status, 'error');
  assert.match(ex1.statusReason || '', /code 1/i);

  const dead = mapContainerToStatus(makeContainer({ status: 'dead', running: false, dead: true }));
  assert.equal(dead.status, 'error');
});

test('maps null container to missing (never running)', () => {
  const res = mapContainerToStatus(null);
  assert.equal(res.status, 'missing');
  assert.equal(res.containerId, null);
});

test('maps in-flight operations to starting / stopping', () => {
  const starting = mapContainerToStatus(makeContainer({ status: 'exited', running: false }), { inFlightOp: 'starting' });
  assert.equal(starting.status, 'starting');

  const stopping = mapContainerToStatus(makeContainer(), { inFlightOp: 'stopping' });
  assert.equal(stopping.status, 'stopping');
});

test('maps unreachable Docker to unknown + stale=true and preserves lastKnownStatus (never running)', () => {
  const res = mapContainerToStatus(makeContainer(), {
    dockerReachable: false,
    lastKnownStatus: 'running',
  });
  assert.equal(res.status, 'unknown');
  assert.equal(res.stale, true);
  assert.equal(res.lastKnownStatus, 'running');
});

// --- 3. reconcileVms ---
const baseRecords = [
  {
    id: 'vm-1',
    name: 'kali-lab-01',
    os: 'kali',
    image: 'alpine:3.20',
    vcpu: 2,
    ram: 4,
    disk: 30,
    ip: '10.10.1.5',
    vpc: 'vpc-cs401-01',
    owner: 'u-jdoe',
    tenant: 'CS-401',
    rdpHost: 'kali-lab-01',
    createdAt: '2026-11-25T06:00:00.000Z',
    idleTimeoutMin: 60,
  },
  {
    id: 'vm-2',
    name: 'kali-lab-02',
    os: 'kali',
    image: 'alpine:3.20',
    vcpu: 2,
    ram: 4,
    disk: 30,
    ip: '10.10.1.6',
    vpc: 'vpc-cs401-01',
    owner: 'u-jdoe',
    tenant: 'CS-401',
    rdpHost: 'kali-lab-02',
    createdAt: '2026-11-25T06:00:00.000Z',
    idleTimeoutMin: 60,
  },
];

test('reconcile ignores unmanaged containers, matches by ptaas.vm-id (not name), detects missing & orphans', () => {
  const containers = [
    // Managed container matching vm-1 by label (even with different container name)
    makeContainer(
      { status: 'running', running: true, startedAt: '2026-11-25T07:00:00.000Z' },
      { [PTAAS_LABELS.VM_ID]: 'vm-1', [PTAAS_LABELS.NAME]: 'renamed-container' }
    ),
    // Unmanaged host container with matching name 'kali-lab-02' — MUST be ignored!
    {
      id: 'cid-unmanaged',
      name: 'kali-lab-02',
      image: 'postgres:16',
      labels: {},
      state: {
        status: 'running',
        running: true,
        paused: false,
        restarting: false,
        oomKilled: false,
        dead: false,
        exitCode: 0,
        startedAt: '2026-11-25T07:00:00.000Z',
        finishedAt: null,
        healthStatus: 'none',
      },
    },
    // Orphaned managed container with no VM record
    {
      ...makeContainer({ status: 'running', running: true }),
      id: 'cid-orphan',
      name: 'ptaas-orphan-99',
      labels: {
        [PTAAS_LABELS.MANAGED]: 'true',
        [PTAAS_LABELS.VM_ID]: 'vm-ghost-99',
        [PTAAS_LABELS.OWNER]: 'u-jsmith',
        [PTAAS_LABELS.TENANT]: 'CS-401',
      },
    },
  ];

  const nowMs = Date.parse('2026-11-25T07:10:00.000Z');
  const res = reconcileVms(baseRecords, containers, { nowMs });

  assert.equal(res.dockerReachable, true);
  assert.equal(res.stale, false);
  assert.equal(res.statusSource, 'docker');

  const vm1 = res.vms.find((v) => v.id === 'vm-1');
  const vm2 = res.vms.find((v) => v.id === 'vm-2');

  assert.equal(vm1.status, 'running');
  assert.equal(vm1.uptimeSeconds, 600);
  assert.equal(vm1.idleSeconds, 3000); // 60m - 10m = 50m = 3000s

  // vm-2 has no managed container -> missing (unmanaged postgres named kali-lab-02 ignored!)
  assert.equal(vm2.status, 'missing');
  assert.equal(vm2.idleSeconds, null);

  assert.deepEqual(res.drift.missingIds, ['vm-2']);
  assert.equal(res.orphans.length, 1);
  assert.equal(res.orphans[0].containerId, 'cid-orphan');
  assert.equal(res.orphans[0].vmId, 'vm-ghost-99');
});

test('reconcile marks all VMs unknown + stale when Docker is unreachable', () => {
  const res = reconcileVms(baseRecords, [], {
    dockerReachable: false,
    lastKnownStatuses: new Map([
      ['vm-1', 'running'],
      ['vm-2', 'stopped'],
    ]),
  });

  assert.equal(res.dockerReachable, false);
  assert.equal(res.stale, true);
  assert.equal(res.vms.filter((v) => v.status === 'running').length, 0);
  assert.equal(res.vms[0].status, 'unknown');
  assert.equal(res.vms[0].lastKnownStatus, 'running');
  assert.equal(res.vms[0].stale, true);
  assert.equal(res.vms[0].idleSeconds, null);
});

console.log(`\n[PASSED] ${passed} Docker status & reconcile unit tests passed.`);
