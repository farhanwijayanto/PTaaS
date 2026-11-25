// Docker Engine HTTP API Provider + Reconciler + Event Stream for PTaaS Gateway
// Uses Node's native http/https over Unix socket, Windows named pipe, or least-privilege socket proxy.
// Never invokes shell commands or passes user input to child processes.

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const DOCKER_API_VERSION = 'v1.43';

const PTAAS_LABELS = {
  MANAGED: 'ptaas.managed',
  VM_ID: 'ptaas.vm-id',
  OWNER: 'ptaas.owner',
  TENANT: 'ptaas.tenant',
  NAME: 'ptaas.name',
  OS: 'ptaas.os',
  IMAGE: 'ptaas.image',
  VOLUME: 'ptaas.volume',
  CREATED_AT: 'ptaas.created-at'
};

function sanitizeTenantNetName(tenant) {
  const slug = String(tenant || 'default').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'default';
  return `ptaas-lab-${slug}`;
}

function generateStrongPassword(len = 28) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+';
  const bytes = crypto.randomBytes(len * 2);
  let out = '';
  for (let i = 0; i < bytes.length && out.length < len; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

function parseDockerHost(raw) {
  const trimmed = String(raw || '').trim();
  if (trimmed.startsWith('unix://')) {
    return { protocol: 'unix', socketPath: trimmed.slice('unix://'.length) };
  }
  if (trimmed.startsWith('npipe://')) {
    const cleaned = trimmed.slice('npipe://'.length).replace(/^\/+/, '').replace(/\//g, '\\');
    return { protocol: 'npipe', socketPath: `\\\\${cleaned}` };
  }
  if (trimmed.startsWith('tcp://')) {
    const parsed = new URL(`http://${trimmed.slice('tcp://'.length)}`);
    return { protocol: 'http', host: parsed.hostname, port: Number(parsed.port || 2375) };
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const parsed = new URL(trimmed);
    const isHttps = parsed.protocol === 'https:';
    return { protocol: isHttps ? 'https' : 'http', host: parsed.hostname, port: Number(parsed.port || (isHttps ? 443 : 80)) };
  }
  if (trimmed.startsWith('/') || trimmed.startsWith('\\\\.\\pipe\\')) {
    return { protocol: trimmed.startsWith('\\\\.\\pipe\\') ? 'npipe' : 'unix', socketPath: trimmed };
  }
  return { protocol: 'unix', socketPath: '/var/run/docker.sock' };
}

function resolveDockerEndpoints() {
  const explicit = process.env.DOCKER_PROXY_URL || process.env.DOCKER_HOST || '';
  if (explicit.trim()) return [parseDockerHost(explicit)];
  if (process.platform === 'win32') {
    return [
      { protocol: 'npipe', socketPath: '\\\\.\\pipe\\dockerDesktopLinuxEngine' },
      { protocol: 'npipe', socketPath: '\\\\.\\pipe\\docker_engine' }
    ];
  }
  return [{ protocol: 'unix', socketPath: '/var/run/docker.sock' }];
}

function normalizeIso(raw) {
  if (typeof raw !== 'string' || !raw || raw.startsWith('0001-01-01')) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;
}

function normalizeContainer(raw) {
  const id = String(raw?.Id || raw?.id || '');
  const labels = raw?.Config?.Labels || raw?.Labels || {};
  const rawName = typeof raw?.Name === 'string'
    ? raw.Name
    : Array.isArray(raw?.Names) && raw.Names[0] ? String(raw.Names[0]) : id.slice(0, 12);
  const isInspect = raw?.State && typeof raw.State === 'object';
  let state;
  if (isInspect) {
    const s = raw.State;
    const rawHealth = String(s?.Health?.Status || 'none').toLowerCase();
    state = {
      status: String(s?.Status || 'unknown').toLowerCase(),
      running: Boolean(s?.Running),
      paused: Boolean(s?.Paused),
      restarting: Boolean(s?.Restarting),
      oomKilled: Boolean(s?.OOMKilled),
      dead: Boolean(s?.Dead),
      exitCode: Number.isFinite(Number(s?.ExitCode)) ? Number(s.ExitCode) : 0,
      startedAt: normalizeIso(s?.StartedAt),
      finishedAt: normalizeIso(s?.FinishedAt),
      error: typeof s?.Error === 'string' && s.Error.trim() ? s.Error.trim() : undefined,
      healthStatus: ['healthy', 'unhealthy', 'starting'].includes(rawHealth) ? rawHealth : 'none',
      restartCount: Number.isFinite(Number(raw?.RestartCount)) ? Number(raw.RestartCount) : 0
    };
  } else {
    const st = String(raw?.State || 'unknown').toLowerCase();
    const statusText = String(raw?.Status || '');
    const exitMatch = statusText.match(/exited\s*\((\d+)\)/i);
    let healthStatus = 'none';
    if (statusText.toLowerCase().includes('(unhealthy)')) healthStatus = 'unhealthy';
    else if (statusText.toLowerCase().includes('(health: starting)')) healthStatus = 'starting';
    else if (statusText.toLowerCase().includes('(healthy)')) healthStatus = 'healthy';
    state = {
      status: st,
      running: st === 'running',
      paused: st === 'paused',
      restarting: st === 'restarting',
      oomKilled: false,
      dead: st === 'dead',
      exitCode: exitMatch ? Number.parseInt(exitMatch[1], 10) : 0,
      startedAt: null,
      finishedAt: null,
      healthStatus,
      restartCount: 0
    };
  }

  let ipAddress = null;
  const networks = raw?.NetworkSettings?.Networks;
  if (networks && typeof networks === 'object') {
    for (const netInfo of Object.values(networks)) {
      if (netInfo?.IPAddress) {
        ipAddress = netInfo.IPAddress;
        break;
      }
    }
  }

  return {
    id,
    name: rawName.replace(/^\/+/, ''),
    image: String(raw?.Config?.Image || raw?.Image || ''),
    labels,
    state,
    ipAddress
  };
}

function mapContainerToStatus(container, opts = {}) {
  const {
    inFlightOp = null,
    dockerReachable = true,
    lastKnownStatus = null,
    gracefulStopObserved = false,
    nowMs = Date.now()
  } = opts;

  if (!dockerReachable) {
    return {
      status: 'unknown',
      statusReason: 'Cannot reach Docker engine',
      restarting: false,
      exitCode: container?.state?.exitCode ?? null,
      oomKilled: Boolean(container?.state?.oomKilled),
      healthStatus: container?.state?.healthStatus || 'none',
      startedAt: container?.state?.startedAt || null,
      uptimeSeconds: 0,
      containerId: container?.id || null,
      stale: true,
      lastKnownStatus: lastKnownStatus && lastKnownStatus !== 'unknown' ? lastKnownStatus : null
    };
  }

  if (inFlightOp === 'stopping') {
    return { status: 'stopping', statusReason: 'Stopping container', restarting: false, exitCode: null, oomKilled: false, healthStatus: 'none', startedAt: null, uptimeSeconds: 0, containerId: container?.id || null, stale: false, lastKnownStatus };
  }
  if (inFlightOp === 'starting') {
    return { status: 'starting', statusReason: 'Starting container', restarting: false, exitCode: null, oomKilled: false, healthStatus: 'none', startedAt: null, uptimeSeconds: 0, containerId: container?.id || null, stale: false, lastKnownStatus };
  }
  if (!container) {
    return { status: 'missing', statusReason: 'Container not found in Docker engine', restarting: false, exitCode: null, oomKilled: false, healthStatus: 'none', startedAt: null, uptimeSeconds: 0, containerId: null, stale: false, lastKnownStatus };
  }

  const st = container.state;
  const uptimeSeconds = st.running && st.startedAt
    ? Math.max(0, Math.floor((nowMs - Date.parse(st.startedAt)) / 1000))
    : 0;

  if (st.paused || st.status === 'paused') {
    return { status: 'paused', statusReason: 'Container paused', restarting: false, exitCode: st.exitCode, oomKilled: false, healthStatus: st.healthStatus, startedAt: st.startedAt, uptimeSeconds: 0, containerId: container.id, stale: false, lastKnownStatus: 'paused' };
  }
  if (st.restarting || st.status === 'restarting') {
    const isCrashLoop = (st.restartCount || 0) >= 3;
    return { status: isCrashLoop ? 'error' : 'starting', statusReason: isCrashLoop ? `Crash loop (${st.restartCount} restarts)` : 'Container restarting', restarting: true, exitCode: st.exitCode, oomKilled: st.oomKilled, healthStatus: st.healthStatus, startedAt: st.startedAt, uptimeSeconds: 0, containerId: container.id, stale: false, lastKnownStatus: isCrashLoop ? 'error' : 'starting' };
  }
  if (st.running || st.status === 'running') {
    if (st.healthStatus === 'unhealthy') {
      return { status: 'error', statusReason: 'Health check failed', restarting: false, exitCode: st.exitCode, oomKilled: false, healthStatus: st.healthStatus, startedAt: st.startedAt, uptimeSeconds, containerId: container.id, stale: false, lastKnownStatus: 'error' };
    }
    if (st.healthStatus === 'starting') {
      return { status: 'starting', statusReason: 'Waiting for health check', restarting: false, exitCode: st.exitCode, oomKilled: false, healthStatus: st.healthStatus, startedAt: st.startedAt, uptimeSeconds, containerId: container.id, stale: false, lastKnownStatus: 'starting' };
    }
    return { status: 'running', statusReason: null, restarting: false, exitCode: 0, oomKilled: false, healthStatus: st.healthStatus, startedAt: st.startedAt, uptimeSeconds, containerId: container.id, stale: false, lastKnownStatus: 'running' };
  }
  if (st.oomKilled) {
    return { status: 'error', statusReason: 'Out of memory (OOM killed)', restarting: false, exitCode: st.exitCode || 137, oomKilled: true, healthStatus: st.healthStatus, startedAt: st.startedAt, uptimeSeconds: 0, containerId: container.id, stale: false, lastKnownStatus: 'error' };
  }
  if (st.dead || st.status === 'dead' || st.error) {
    return { status: 'error', statusReason: st.error || 'Container is dead', restarting: false, exitCode: st.exitCode, oomKilled: false, healthStatus: st.healthStatus, startedAt: st.startedAt, uptimeSeconds: 0, containerId: container.id, stale: false, lastKnownStatus: 'error' };
  }
  const cleanExit = st.status === 'created' || st.exitCode === 0 || st.exitCode === 143 || (st.exitCode === 137 && gracefulStopObserved);
  if (!cleanExit && st.exitCode !== 0) {
    return { status: 'error', statusReason: `Exited with code ${st.exitCode}`, restarting: false, exitCode: st.exitCode, oomKilled: false, healthStatus: st.healthStatus, startedAt: st.startedAt, uptimeSeconds: 0, containerId: container.id, stale: false, lastKnownStatus: 'error' };
  }
  return { status: 'stopped', statusReason: null, restarting: false, exitCode: st.exitCode, oomKilled: false, healthStatus: st.healthStatus, startedAt: st.startedAt, uptimeSeconds: 0, containerId: container.id, stale: false, lastKnownStatus: 'stopped' };
}

class GatewayDockerProvider extends EventEmitter {
  constructor() {
    super();
    this.endpoints = resolveDockerEndpoints();
    this.activeEndpointIndex = 0;
    this.containersById = new Map();
    this.lastKnownStatuses = new Map();
    this.inFlightOps = new Map();
    this.gracefulStopIds = new Set();
    this.dockerReachable = false;
    this.everConnected = false;
    this.firstFailureAt = null;
    this.backoffMs = 1000;
    this.eventReq = null;
    this.reconcileTimer = null;
    this.reconnectTimer = null;
  }

  buildReqOpts(endpoint, method, apiPath, headers = {}) {
    const fullPath = apiPath.startsWith('/v1.') || apiPath === '/_ping'
      ? apiPath
      : `/${DOCKER_API_VERSION}${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`;
    if (endpoint.socketPath) {
      return { socketPath: endpoint.socketPath, method, path: fullPath, headers: { Host: 'docker', ...headers } };
    }
    return { hostname: endpoint.host || '127.0.0.1', port: endpoint.port || 2375, method, path: fullPath, headers };
  }

  rawRequest(endpoint, method, apiPath, body, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const payload = body !== undefined ? Buffer.from(JSON.stringify(body), 'utf8') : null;
      const headers = {};
      if (payload) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = String(payload.length);
      }
      const opts = this.buildReqOpts(endpoint, method, apiPath, headers);
      const transport = endpoint.protocol === 'https' ? https : http;
      const req = transport.request(opts, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: Buffer.concat(chunks) }));
      });
      req.setTimeout(timeoutMs, () => req.destroy(new Error(`Docker request timed out (${method} ${apiPath})`)));
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  async request(method, apiPath, body, timeoutMs = 8000) {
    let lastErr;
    for (let i = 0; i < this.endpoints.length; i++) {
      const idx = (this.activeEndpointIndex + i) % this.endpoints.length;
      try {
        const res = await this.rawRequest(this.endpoints[idx], method, apiPath, body, timeoutMs);
        this.activeEndpointIndex = idx;
        return res;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('Cannot reach Docker engine');
  }

  async listManagedContainers() {
    const filters = encodeURIComponent(JSON.stringify({ label: [`${PTAAS_LABELS.MANAGED}=true`] }));
    const res = await this.request('GET', `/containers/json?all=true&filters=${filters}`);
    if (res.statusCode < 200 || res.statusCode >= 300) throw new Error(`Docker list failed (${res.statusCode})`);
    const items = JSON.parse(res.body.toString('utf8'));
    if (!Array.isArray(items)) return [];
    return Promise.all(items.map(async (it) => {
      const detail = await this.inspectContainer(it.Id).catch(() => null);
      return detail || normalizeContainer(it);
    }));
  }

  async inspectContainer(id) {
    const res = await this.request('GET', `/containers/${encodeURIComponent(id)}/json`);
    if (res.statusCode === 404) return null;
    if (res.statusCode < 200 || res.statusCode >= 300) throw new Error(`Docker inspect failed (${res.statusCode})`);
    return normalizeContainer(JSON.parse(res.body.toString('utf8')));
  }

  async findContainerByVmId(vmId) {
    const filters = encodeURIComponent(JSON.stringify({ label: [`${PTAAS_LABELS.MANAGED}=true`, `${PTAAS_LABELS.VM_ID}=${vmId}`] }));
    const res = await this.request('GET', `/containers/json?all=true&filters=${filters}`);
    if (res.statusCode < 200 || res.statusCode >= 300) throw new Error(`Docker query failed (${res.statusCode})`);
    const items = JSON.parse(res.body.toString('utf8'));
    if (!Array.isArray(items) || !items.length) return null;
    return this.inspectContainer(items[0].Id);
  }

  async ensureTenantNetwork(tenant) {
    const name = sanitizeTenantNetName(tenant);
    const check = await this.request('GET', `/networks/${encodeURIComponent(name)}`, undefined, 5000);
    if (check.statusCode >= 200 && check.statusCode < 300) return name;
    const res = await this.request('POST', '/networks/create', {
      Name: name,
      Driver: 'bridge',
      Internal: true,
      CheckDuplicate: true,
      Options: { 'com.docker.network.bridge.enable_icc': 'true' },
      Labels: { [PTAAS_LABELS.MANAGED]: 'true', [PTAAS_LABELS.TENANT]: tenant }
    }, 10000);
    if (res.statusCode >= 400 && res.statusCode !== 409) {
      throw new Error(`Docker create tenant network failed (${res.statusCode})`);
    }
    return name;
  }

  async createVolume(volName, labels) {
    const res = await this.request('POST', '/volumes/create', {
      Name: volName,
      Driver: 'local',
      Labels: { [PTAAS_LABELS.MANAGED]: 'true', ...labels }
    }, 10000);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`Docker create volume failed (${res.statusCode})`);
    }
    return volName;
  }

  async removeVolume(volName) {
    if (!volName) return true;
    const res = await this.request('DELETE', `/volumes/${encodeURIComponent(volName)}?force=true`, undefined, 10000);
    return res.statusCode === 204 || res.statusCode === 200 || res.statusCode === 404;
  }

  async createContainer(record) {
    const shortId = String(record.id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || crypto.randomBytes(5).toString('hex');
    const containerName = record.containerName || `ptaas-vm-${shortId}`;
    const volumeName = record.volumeName || `ptaas-vol-${shortId}`;
    const networkName = await this.ensureTenantNetwork(record.tenant || 'CS-401');
    const password = record.password || generateStrongPassword(28);
    const image = record.image || process.env.KALI_IMAGE || 'kasmweb/kali-rolling-desktop:1.15.0';
    const ramBytes = Math.max(128, Math.round((record.ram || 4) * 1024)) * 1024 * 1024;
    const nanoCpus = Math.max(1, Math.round(record.vcpu || 2)) * 1_000_000_000;

    await this.createVolume(volumeName, {
      [PTAAS_LABELS.VM_ID]: record.id,
      [PTAAS_LABELS.OWNER]: record.owner,
      [PTAAS_LABELS.TENANT]: record.tenant,
      [PTAAS_LABELS.NAME]: record.name
    });

    const payload = {
      Image: image,
      Hostname: record.name.slice(0, 63),
      Labels: {
        [PTAAS_LABELS.MANAGED]: 'true',
        [PTAAS_LABELS.VM_ID]: record.id,
        [PTAAS_LABELS.OWNER]: record.owner,
        [PTAAS_LABELS.TENANT]: record.tenant,
        [PTAAS_LABELS.NAME]: record.name,
        [PTAAS_LABELS.OS]: record.os || 'kali',
        [PTAAS_LABELS.IMAGE]: record.catalogId || 'kali-2024.3',
        [PTAAS_LABELS.VOLUME]: volumeName,
        [PTAAS_LABELS.CREATED_AT]: record.createdAt || new Date().toISOString()
      },
      Env: [
        'USER=student',
        `PASSWORD=${password}`,
        `VNC_PW=${password}`,
        `PTAAS_VM_PASSWORD=${password}`,
        'VNC_RESOLUTION=1920x1080',
        'SSH_PORT=2222',
        'RDP_PORT=3389'
      ],
      HostConfig: {
        Privileged: false,
        CapDrop: ['ALL'],
        CapAdd: ['CHOWN', 'SETUID', 'SETGID', 'DAC_OVERRIDE', 'FOWNER', 'NET_BIND_SERVICE'],
        SecurityOpt: ['no-new-privileges:true'],
        Memory: ramBytes,
        MemorySwap: ramBytes,
        NanoCpus: nanoCpus,
        PidsLimit: 256,
        ShmSize: Math.min(ramBytes, 512 * 1024 * 1024),
        NetworkMode: networkName,
        RestartPolicy: { Name: 'unless-stopped' },
        Mounts: [{ Type: 'volume', Source: volumeName, Target: '/home/student', ReadOnly: false }],
        Tmpfs: { '/tmp': 'rw,noexec,nosuid,size=128m', '/run': 'rw,nosuid,size=64m' }
      }
    };
    const res = await this.request('POST', `/containers/create?name=${encodeURIComponent(containerName)}`, payload, 15000);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      await this.removeVolume(volumeName).catch(() => {});
      throw new Error(`Docker create failed (${res.statusCode}): ${res.body.toString('utf8')}`);
    }
    const created = JSON.parse(res.body.toString('utf8'));
    record.containerName = containerName;
    record.volumeName = volumeName;
    record.networkName = networkName;
    return this.inspectContainer(created.Id);
  }

  async startContainer(id) {
    const res = await this.request('POST', `/containers/${encodeURIComponent(id)}/start`, undefined, 15000);
    if (res.statusCode !== 204 && res.statusCode !== 304) throw new Error(`Docker start failed (${res.statusCode})`);
    return this.inspectContainer(id);
  }

  async stopContainer(id) {
    const res = await this.request('POST', `/containers/${encodeURIComponent(id)}/stop?t=5`, undefined, 15000);
    if (res.statusCode === 404) return null;
    if (res.statusCode !== 204 && res.statusCode !== 304) throw new Error(`Docker stop failed (${res.statusCode})`);
    return this.inspectContainer(id);
  }

  async restartContainer(id) {
    const res = await this.request('POST', `/containers/${encodeURIComponent(id)}/restart?t=5`, undefined, 20000);
    if (res.statusCode !== 204) throw new Error(`Docker restart failed (${res.statusCode})`);
    return this.inspectContainer(id);
  }

  async removeContainer(id) {
    const res = await this.request('DELETE', `/containers/${encodeURIComponent(id)}?force=true`, undefined, 15000);
    if (res.statusCode === 404) return true;
    if (res.statusCode !== 204 && res.statusCode !== 200) throw new Error(`Docker remove failed (${res.statusCode})`);
    return true;
  }

  async getStatus(vmRecord) {
    if (!this.dockerReachable) {
      return mapContainerToStatus(null, {
        dockerReachable: false,
        lastKnownStatus: this.lastKnownStatuses.get(vmRecord.id) || null
      });
    }
    const container = await this.findContainerByVmId(vmRecord.id).catch(() => null);
    if (container) this.containersById.set(container.id, container);
    return mapContainerToStatus(container, {
      dockerReachable: this.dockerReachable,
      inFlightOp: this.inFlightOps.get(vmRecord.id) || null,
      lastKnownStatus: this.lastKnownStatuses.get(vmRecord.id) || null,
      gracefulStopObserved: this.gracefulStopIds.has(vmRecord.id) || (container ? this.gracefulStopIds.has(container.id) : false)
    });
  }

  reconcileRecords(records) {
    const nowIso = new Date().toISOString();
    const byVmId = new Map();
    const knownIds = new Set(records.map((r) => r.id));
    for (const c of this.containersById.values()) {
      if (c.labels?.[PTAAS_LABELS.MANAGED] !== 'true') continue;
      const vmId = c.labels?.[PTAAS_LABELS.VM_ID];
      if (vmId && !byVmId.has(vmId)) byVmId.set(vmId, c);
    }

    const vms = records.map((rec) => {
      const container = this.dockerReachable ? byVmId.get(rec.id) || null : null;
      const derived = mapContainerToStatus(container, {
        dockerReachable: this.dockerReachable,
        inFlightOp: this.inFlightOps.get(rec.id) || null,
        lastKnownStatus: this.lastKnownStatuses.get(rec.id) || null,
        gracefulStopObserved: this.gracefulStopIds.has(rec.id) || (container ? this.gracefulStopIds.has(container.id) : false)
      });
      if (derived.status !== 'unknown') this.lastKnownStatuses.set(rec.id, derived.status);
      return {
        ...rec,
        ip: container?.ipAddress || rec.ip,
        ...derived,
        statusUpdatedAt: nowIso,
        statusSource: 'docker'
      };
    });

    const orphans = [];
    if (this.dockerReachable) {
      for (const c of this.containersById.values()) {
        if (c.labels?.[PTAAS_LABELS.MANAGED] !== 'true') continue;
        const vmId = c.labels?.[PTAAS_LABELS.VM_ID] || null;
        if (!vmId || !knownIds.has(vmId)) {
          const mapped = mapContainerToStatus(c, { dockerReachable: true });
          orphans.push({
            containerId: c.id,
            vmId,
            name: c.labels?.[PTAAS_LABELS.NAME] || c.name,
            image: c.image,
            owner: c.labels?.[PTAAS_LABELS.OWNER] || null,
            tenant: c.labels?.[PTAAS_LABELS.TENANT] || null,
            status: mapped.status,
            containerState: c.state.status
          });
        }
      }
    }

    return {
      vms,
      orphans,
      statusUpdatedAt: nowIso,
      statusSource: 'docker',
      stale: !this.dockerReachable,
      dockerReachable: this.dockerReachable
    };
  }

  async reconcile() {
    try {
      const list = await this.listManagedContainers();
      this.containersById.clear();
      for (const c of list) this.containersById.set(c.id, c);
      this.dockerReachable = true;
      this.everConnected = true;
      this.firstFailureAt = null;
      this.emit('reconciled');
    } catch {
      const now = Date.now();
      if (this.firstFailureAt === null) this.firstFailureAt = now;
      const graceMs = Number.parseInt(process.env.DOCKER_UNREACHABLE_GRACE_MS || '10000', 10);
      if (!this.everConnected || now - this.firstFailureAt >= graceMs) {
        this.dockerReachable = false;
        this.emit('unreachable');
      }
    }
  }

  start() {
    void this.reconcile();
    this.connectEvents();
    const intervalMs = Number.parseInt(process.env.DOCKER_RECONCILE_INTERVAL_MS || '7000', 10);
    this.reconcileTimer = setInterval(() => void this.reconcile(), intervalMs);
    this.reconcileTimer.unref?.();
  }

  connectEvents() {
    if (this.eventReq) {
      try { this.eventReq.destroy(); } catch {}
      this.eventReq = null;
    }
    const endpoint = this.endpoints[this.activeEndpointIndex] || this.endpoints[0];
    const filters = encodeURIComponent(JSON.stringify({ type: ['container'], label: [`${PTAAS_LABELS.MANAGED}=true`] }));
    const opts = this.buildReqOpts(endpoint, 'GET', `/events?filters=${filters}`);
    const transport = endpoint.protocol === 'https' ? https : http;
    let buf = '';
    const req = transport.request(opts, (res) => {
      if ((res.statusCode || 0) >= 400) {
        this.scheduleReconnect();
        res.resume();
        return;
      }
      this.backoffMs = 1000;
      void this.reconcile();
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buf += chunk;
        let idx = buf.indexOf('\n');
        while (idx !== -1) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (line) {
            try {
              const evt = JSON.parse(line);
              this.handleEvent(evt);
            } catch {}
          }
          idx = buf.indexOf('\n');
        }
      });
      res.on('end', () => this.scheduleReconnect());
      res.on('error', () => this.scheduleReconnect());
    });
    req.on('error', () => {
      void this.reconcile();
      this.scheduleReconnect();
    });
    req.end();
    this.eventReq = req;
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(15000, this.backoffMs * 2);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectEvents();
    }, delay);
    this.reconnectTimer.unref?.();
  }

  async handleEvent(evt) {
    const action = String(evt?.Action || evt?.status || '').split(':')[0];
    const cid = evt?.Actor?.ID || evt?.id;
    const vmId = evt?.Actor?.Attributes?.[PTAAS_LABELS.VM_ID];
    if (action === 'stop') {
      if (cid) this.gracefulStopIds.add(cid);
      if (vmId) this.gracefulStopIds.add(vmId);
    } else if (action === 'start' || action === 'oom') {
      if (cid) this.gracefulStopIds.delete(cid);
      if (vmId) this.gracefulStopIds.delete(vmId);
    }
    if (action === 'destroy') {
      if (cid) this.containersById.delete(cid);
      this.emit('container_stopped', { vmId, containerId: cid, reason: 'VM container removed' });
      this.emit('reconciled');
      return;
    }
    if (['die', 'stop', 'kill', 'oom', 'pause'].includes(action)) {
      this.emit('container_stopped', { vmId, containerId: cid, reason: 'VM stopped' });
    }
    if (cid) {
      const inspected = await this.inspectContainer(cid).catch(() => null);
      if (inspected) this.containersById.set(inspected.id, inspected);
      else this.containersById.delete(cid);
      this.emit('reconciled');
    }
  }
}

module.exports = {
  GatewayDockerProvider,
  PTAAS_LABELS,
  mapContainerToStatus,
  normalizeContainer
};
