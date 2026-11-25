export type VmRuntimeStatus =
  | 'running'
  | 'starting'
  | 'stopping'
  | 'stopped'
  | 'paused'
  | 'missing'
  | 'error'
  | 'unknown';

export const PTAAS_LABELS = {
  MANAGED: 'ptaas.managed',
  VM_ID: 'ptaas.vm-id',
  OWNER: 'ptaas.owner',
  TENANT: 'ptaas.tenant',
  NAME: 'ptaas.name',
  OS: 'ptaas.os',
  IMAGE: 'ptaas.image',
  VOLUME: 'ptaas.volume',
  CREATED_AT: 'ptaas.created-at',
} as const;

export type DockerHealthStatus = 'starting' | 'healthy' | 'unhealthy' | 'none';

export interface DockerContainerState {
  status: string;
  running: boolean;
  paused: boolean;
  restarting: boolean;
  oomKilled: boolean;
  dead: boolean;
  exitCode: number;
  startedAt: string | null;
  finishedAt: string | null;
  error?: string;
  healthStatus?: DockerHealthStatus;
  restartCount?: number;
}

export interface DockerContainerSummary {
  id: string;
  name: string;
  image: string;
  labels: Record<string, string>;
  state: DockerContainerState;
  statusText?: string;
  createdAt?: string | null;
  ipAddress?: string | null;
}

export interface VmResourceUsage {
  cpuPercent: number;
  memoryUsedMb: number;
  memoryLimitMb: number;
  sampledAt: string;
}

export interface VmMetadataRecord {
  id: string;
  name: string;
  os: 'kali' | 'parrot' | 'ubuntu';
  catalogId?: string;
  image: string;
  containerName?: string;
  volumeName?: string;
  networkName?: string;
  vcpu: number;
  ram: number;
  disk: number;
  ip: string;
  vpc: string;
  owner: string;
  tenant: string;
  rdpHost: string;
  rdpPort?: number;
  sshPort?: number;
  vncPort?: number;
  protocol?: string;
  createdAt: string;
  idleTimeoutMin?: number;
  restartPolicy?: string;
  /** Encrypted per-VM password (AES-256-GCM). Always stripped before sending to clients. */
  passwordEnc?: string;
}

export type PublicVmMetadata = Omit<VmMetadataRecord, 'passwordEnc'>;

export interface DerivedContainerStatus {
  status: VmRuntimeStatus;
  statusReason: string | null;
  restarting: boolean;
  exitCode: number | null;
  oomKilled: boolean;
  healthStatus: DockerHealthStatus;
  startedAt: string | null;
  uptimeSeconds: number;
  containerId: string | null;
  containerState: string | null;
  stale: boolean;
  lastKnownStatus: VmRuntimeStatus | null;
}

export interface DerivedVmView extends PublicVmMetadata {
  status: VmRuntimeStatus;
  statusReason: string | null;
  restarting: boolean;
  exitCode: number | null;
  oomKilled: boolean;
  healthStatus: DockerHealthStatus;
  startedAt: string | null;
  uptimeSeconds: number;
  idleSeconds: number | null;
  containerId: string | null;
  containerState: string | null;
  statusUpdatedAt: string;
  statusSource: 'docker' | 'demo';
  stale: boolean;
  lastKnownStatus: VmRuntimeStatus | null;
  resourceUsage?: VmResourceUsage | null;
  lastLogs?: string[] | null;
  ownerName?: string;
}

export interface OrphanedContainer {
  containerId: string;
  vmId: string | null;
  name: string;
  image: string;
  owner: string | null;
  tenant: string | null;
  status: VmRuntimeStatus;
  containerState: string;
  statusReason: string | null;
  createdAt: string | null;
}

export interface ReconcileResult {
  vms: DerivedVmView[];
  orphans: OrphanedContainer[];
  drift: {
    missingIds: string[];
    orphanedContainerIds: string[];
  };
  statusUpdatedAt: string;
  statusSource: 'docker';
  stale: boolean;
  dockerReachable: boolean;
}

export interface MapStatusOptions {
  inFlightOp?: 'starting' | 'stopping' | null;
  dockerReachable?: boolean;
  lastKnownStatus?: VmRuntimeStatus | null;
  readinessPassed?: boolean | null;
  gracefulStopObserved?: boolean;
  nowMs?: number;
}

function parseHealthFromStatusText(statusText?: string): DockerHealthStatus {
  if (!statusText) return 'none';
  const lower = statusText.toLowerCase();
  if (lower.includes('(unhealthy)')) return 'unhealthy';
  if (lower.includes('(health: starting)')) return 'starting';
  if (lower.includes('(healthy)')) return 'healthy';
  return 'none';
}

function parseExitCodeFromStatusText(statusText?: string): number {
  if (!statusText) return 0;
  const m = statusText.match(/exited\s*\((\d+)\)/i);
  if (!m) return 0;
  const code = Number.parseInt(m[1], 10);
  return Number.isFinite(code) ? code : 0;
}

function normalizeIsoTimestamp(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  if (raw.startsWith('0001-01-01')) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toISOString();
}

export function isManagedContainer(labels?: Record<string, string> | null): boolean {
  return labels?.[PTAAS_LABELS.MANAGED] === 'true';
}

/**
 * Normalize either a `GET /containers/json` list item or a `GET /containers/{id}/json`
 * inspect payload into one consistent container summary shape.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeDockerContainer(raw: any): DockerContainerSummary {
  const id = String(raw?.Id || raw?.id || '');
  const labels: Record<string, string> =
    (raw?.Config?.Labels && typeof raw.Config.Labels === 'object' ? raw.Config.Labels : null) ||
    (raw?.Labels && typeof raw.Labels === 'object' ? raw.Labels : null) ||
    {};

  const rawName =
    typeof raw?.Name === 'string'
      ? raw.Name
      : Array.isArray(raw?.Names) && raw.Names[0]
        ? String(raw.Names[0])
        : id.slice(0, 12);
  const name = rawName.replace(/^\/+/, '');
  const image = String(raw?.Config?.Image || raw?.Image || '');

  // Inspect payload has `State` as an object; list payload has `State` as a string.
  const isInspect = raw?.State && typeof raw.State === 'object';
  let state: DockerContainerState;

  if (isInspect) {
    const s = raw.State;
    const rawHealth = String(s?.Health?.Status || 'none').toLowerCase();
    const healthStatus: DockerHealthStatus =
      rawHealth === 'healthy' || rawHealth === 'unhealthy' || rawHealth === 'starting'
        ? rawHealth
        : 'none';
    state = {
      status: String(s?.Status || 'unknown').toLowerCase(),
      running: Boolean(s?.Running),
      paused: Boolean(s?.Paused),
      restarting: Boolean(s?.Restarting),
      oomKilled: Boolean(s?.OOMKilled),
      dead: Boolean(s?.Dead),
      exitCode: Number.isFinite(Number(s?.ExitCode)) ? Number(s.ExitCode) : 0,
      startedAt: normalizeIsoTimestamp(s?.StartedAt),
      finishedAt: normalizeIsoTimestamp(s?.FinishedAt),
      error: typeof s?.Error === 'string' && s.Error.trim() ? s.Error.trim() : undefined,
      healthStatus,
      restartCount: Number.isFinite(Number(raw?.RestartCount)) ? Number(raw.RestartCount) : 0,
    };
  } else {
    const statusStr = String(raw?.State || 'unknown').toLowerCase();
    const statusText = typeof raw?.Status === 'string' ? raw.Status : '';
    state = {
      status: statusStr,
      running: statusStr === 'running',
      paused: statusStr === 'paused',
      restarting: statusStr === 'restarting',
      oomKilled: false,
      dead: statusStr === 'dead',
      exitCode: statusStr === 'exited' ? parseExitCodeFromStatusText(statusText) : 0,
      startedAt: null,
      finishedAt: null,
      healthStatus: parseHealthFromStatusText(statusText),
      restartCount: 0,
    };
  }

  let ipAddress: string | null = null;
  const networks = raw?.NetworkSettings?.Networks;
  if (networks && typeof networks === 'object') {
    for (const netInfo of Object.values(networks) as Array<{ IPAddress?: string }>) {
      if (netInfo?.IPAddress) {
        ipAddress = netInfo.IPAddress;
        break;
      }
    }
  }

  let createdAt: string | null = null;
  if (typeof raw?.Created === 'number' && Number.isFinite(raw.Created)) {
    createdAt = new Date(raw.Created * 1000).toISOString();
  } else if (typeof raw?.Created === 'string') {
    createdAt = normalizeIsoTimestamp(raw.Created);
  }

  return {
    id,
    name,
    image,
    labels,
    state,
    statusText: typeof raw?.Status === 'string' ? raw.Status : undefined,
    createdAt,
    ipAddress,
  };
}

export function computeUptimeSeconds(startedAt: string | null, nowMs = Date.now()): number {
  if (!startedAt) return 0;
  const startMs = Date.parse(startedAt);
  if (!Number.isFinite(startMs) || startMs <= 0) return 0;
  return Math.max(0, Math.floor((nowMs - startMs) / 1000));
}

/**
 * Pure mapping from Docker container state + operational context to PTaaS status model.
 */
export function mapContainerToStatus(
  container: DockerContainerSummary | null,
  options: MapStatusOptions = {}
): DerivedContainerStatus {
  const {
    inFlightOp = null,
    dockerReachable = true,
    lastKnownStatus = null,
    readinessPassed = null,
    gracefulStopObserved = false,
    nowMs = Date.now(),
  } = options;

  if (!dockerReachable) {
    return {
      status: 'unknown',
      statusReason: 'Cannot reach Docker engine',
      restarting: false,
      exitCode: container?.state.exitCode ?? null,
      oomKilled: Boolean(container?.state.oomKilled),
      healthStatus: container?.state.healthStatus ?? 'none',
      startedAt: container?.state.startedAt ?? null,
      uptimeSeconds: 0,
      containerId: container?.id ?? null,
      containerState: container?.state.status ?? null,
      stale: true,
      lastKnownStatus: lastKnownStatus && lastKnownStatus !== 'unknown' ? lastKnownStatus : null,
    };
  }

  if (inFlightOp === 'stopping') {
    return {
      status: 'stopping',
      statusReason: 'Stopping container',
      restarting: false,
      exitCode: container?.state.exitCode ?? null,
      oomKilled: false,
      healthStatus: container?.state.healthStatus ?? 'none',
      startedAt: container?.state.startedAt ?? null,
      uptimeSeconds: 0,
      containerId: container?.id ?? null,
      containerState: container?.state.status ?? null,
      stale: false,
      lastKnownStatus: lastKnownStatus ?? null,
    };
  }

  if (inFlightOp === 'starting') {
    return {
      status: 'starting',
      statusReason: 'Starting container',
      restarting: false,
      exitCode: container?.state.exitCode ?? null,
      oomKilled: false,
      healthStatus: container?.state.healthStatus ?? 'none',
      startedAt: container?.state.startedAt ?? null,
      uptimeSeconds: 0,
      containerId: container?.id ?? null,
      containerState: container?.state.status ?? null,
      stale: false,
      lastKnownStatus: lastKnownStatus ?? null,
    };
  }

  if (!container) {
    return {
      status: 'missing',
      statusReason: 'Container not found in Docker engine',
      restarting: false,
      exitCode: null,
      oomKilled: false,
      healthStatus: 'none',
      startedAt: null,
      uptimeSeconds: 0,
      containerId: null,
      containerState: null,
      stale: false,
      lastKnownStatus: lastKnownStatus ?? null,
    };
  }

  const st = container.state;
  const healthStatus: DockerHealthStatus = st.healthStatus ?? 'none';

  // Paused container
  if (st.paused || st.status === 'paused') {
    return {
      status: 'paused',
      statusReason: 'Container paused',
      restarting: false,
      exitCode: st.exitCode,
      oomKilled: false,
      healthStatus,
      startedAt: st.startedAt,
      uptimeSeconds: 0,
      containerId: container.id,
      containerState: st.status,
      stale: false,
      lastKnownStatus: 'paused',
    };
  }

  // Restarting / crash-looping container
  if (st.restarting || st.status === 'restarting') {
    const restarts = st.restartCount ?? 0;
    const isCrashLoop = restarts >= 3 || (st.oomKilled && restarts >= 1);
    return {
      status: isCrashLoop ? 'error' : 'starting',
      statusReason: isCrashLoop
        ? `Crash loop (${restarts} restarts, exit ${st.exitCode})`
        : 'Container restarting',
      restarting: true,
      exitCode: st.exitCode,
      oomKilled: st.oomKilled,
      healthStatus,
      startedAt: st.startedAt,
      uptimeSeconds: 0,
      containerId: container.id,
      containerState: st.status,
      stale: false,
      lastKnownStatus: isCrashLoop ? 'error' : 'starting',
    };
  }

  // Running container
  if (st.running || st.status === 'running') {
    if (healthStatus === 'unhealthy') {
      return {
        status: 'error',
        statusReason: 'Container health check failed',
        restarting: false,
        exitCode: st.exitCode,
        oomKilled: st.oomKilled,
        healthStatus,
        startedAt: st.startedAt,
        uptimeSeconds: computeUptimeSeconds(st.startedAt, nowMs),
        containerId: container.id,
        containerState: st.status,
        stale: false,
        lastKnownStatus: 'error',
      };
    }

    if (healthStatus === 'starting') {
      return {
        status: 'starting',
        statusReason: 'Waiting for container health check',
        restarting: false,
        exitCode: st.exitCode,
        oomKilled: false,
        healthStatus,
        startedAt: st.startedAt,
        uptimeSeconds: computeUptimeSeconds(st.startedAt, nowMs),
        containerId: container.id,
        containerState: st.status,
        stale: false,
        lastKnownStatus: 'starting',
      };
    }

    if (readinessPassed === false) {
      return {
        status: 'starting',
        statusReason: 'Waiting for desktop/SSH readiness',
        restarting: false,
        exitCode: st.exitCode,
        oomKilled: false,
        healthStatus,
        startedAt: st.startedAt,
        uptimeSeconds: computeUptimeSeconds(st.startedAt, nowMs),
        containerId: container.id,
        containerState: st.status,
        stale: false,
        lastKnownStatus: 'starting',
      };
    }

    return {
      status: 'running',
      statusReason: null,
      restarting: false,
      exitCode: 0,
      oomKilled: false,
      healthStatus,
      startedAt: st.startedAt,
      uptimeSeconds: computeUptimeSeconds(st.startedAt, nowMs),
      containerId: container.id,
      containerState: st.status,
      stale: false,
      lastKnownStatus: 'running',
    };
  }

  // Created (never started)
  if (st.status === 'created') {
    return {
      status: 'stopped',
      statusReason: null,
      restarting: false,
      exitCode: 0,
      oomKilled: false,
      healthStatus,
      startedAt: null,
      uptimeSeconds: 0,
      containerId: container.id,
      containerState: st.status,
      stale: false,
      lastKnownStatus: 'stopped',
    };
  }

  // Exited / Dead
  if (st.oomKilled) {
    return {
      status: 'error',
      statusReason: 'Out of memory (OOM killed)',
      restarting: false,
      exitCode: st.exitCode || 137,
      oomKilled: true,
      healthStatus,
      startedAt: st.startedAt,
      uptimeSeconds: 0,
      containerId: container.id,
      containerState: st.status,
      stale: false,
      lastKnownStatus: 'error',
    };
  }

  if (st.dead || st.status === 'dead') {
    return {
      status: 'error',
      statusReason: st.error || 'Container is dead',
      restarting: false,
      exitCode: st.exitCode,
      oomKilled: false,
      healthStatus,
      startedAt: st.startedAt,
      uptimeSeconds: 0,
      containerId: container.id,
      containerState: st.status,
      stale: false,
      lastKnownStatus: 'error',
    };
  }

  if (st.error) {
    return {
      status: 'error',
      statusReason: st.error,
      restarting: false,
      exitCode: st.exitCode,
      oomKilled: false,
      healthStatus,
      startedAt: st.startedAt,
      uptimeSeconds: 0,
      containerId: container.id,
      containerState: st.status,
      stale: false,
      lastKnownStatus: 'error',
    };
  }

  // Clean exit (0) or graceful SIGTERM (143), or SIGKILL (137) after an observed `stop` event
  const cleanExit =
    st.exitCode === 0 ||
    st.exitCode === 143 ||
    (st.exitCode === 137 && gracefulStopObserved);

  if (!cleanExit && st.exitCode !== 0) {
    return {
      status: 'error',
      statusReason: `Exited with code ${st.exitCode}`,
      restarting: false,
      exitCode: st.exitCode,
      oomKilled: false,
      healthStatus,
      startedAt: st.startedAt,
      uptimeSeconds: 0,
      containerId: container.id,
      containerState: st.status,
      stale: false,
      lastKnownStatus: 'error',
    };
  }

  return {
    status: 'stopped',
    statusReason: null,
    restarting: false,
    exitCode: st.exitCode,
    oomKilled: false,
    healthStatus,
    startedAt: st.startedAt,
    uptimeSeconds: 0,
    containerId: container.id,
    containerState: st.status,
    stale: false,
    lastKnownStatus: 'stopped',
  };
}

export interface ReconcileOptions {
  dockerReachable?: boolean;
  inFlightOps?: Map<string, 'starting' | 'stopping'>;
  lastKnownStatuses?: Map<string, VmRuntimeStatus>;
  readinessMap?: Map<string, boolean>;
  gracefulStopIds?: Set<string>;
  lastActivityMap?: Map<string, number>;
  statsMap?: Map<string, VmResourceUsage>;
  logsMap?: Map<string, string[]>;
  nowMs?: number;
}

/**
 * Pure reconciliation comparing authoritative Docker managed containers against
 * stored VM metadata records. Matches strictly by `ptaas.vm-id` label.
 */
export function reconcileVms(
  vmRecords: VmMetadataRecord[],
  containers: DockerContainerSummary[],
  options: ReconcileOptions = {}
): ReconcileResult {
  const nowMs = options.nowMs ?? Date.now();
  const statusUpdatedAt = new Date(nowMs).toISOString();
  const dockerReachable = options.dockerReachable ?? true;

  // Strictly consider only containers with ptaas.managed=true
  const managed = containers.filter((c) => isManagedContainer(c.labels));

  const containerByVmId = new Map<string, DockerContainerSummary>();
  const orphanCandidates: DockerContainerSummary[] = [];

  for (const container of managed) {
    const vmId = container.labels[PTAAS_LABELS.VM_ID]?.trim();
    if (vmId && !containerByVmId.has(vmId)) {
      containerByVmId.set(vmId, container);
    } else {
      orphanCandidates.push(container);
    }
  }

  const knownRecordIds = new Set(vmRecords.map((r) => r.id));
  const missingIds: string[] = [];
  const vms: DerivedVmView[] = [];

  for (const record of vmRecords) {
    const container = dockerReachable ? containerByVmId.get(record.id) ?? null : null;
    const derived = mapContainerToStatus(container, {
      dockerReachable,
      inFlightOp: options.inFlightOps?.get(record.id) ?? null,
      lastKnownStatus: options.lastKnownStatuses?.get(record.id) ?? null,
      readinessPassed: options.readinessMap?.has(record.id)
        ? options.readinessMap.get(record.id) ?? null
        : null,
      gracefulStopObserved:
        (container?.id ? options.gracefulStopIds?.has(container.id) : false) ||
        Boolean(options.gracefulStopIds?.has(record.id)),
      nowMs,
    });

    if (derived.status === 'missing') {
      missingIds.push(record.id);
    }

    let idleSeconds: number | null = null;
    if (derived.status === 'running') {
      const timeoutSec = Math.max(60, (record.idleTimeoutMin ?? 60) * 60);
      const lastAct = options.lastActivityMap?.get(record.id);
      const refTime =
        lastAct ??
        (derived.startedAt ? Date.parse(derived.startedAt) : nowMs);
      const elapsedSec = Math.max(0, Math.floor((nowMs - refTime) / 1000));
      idleSeconds = Math.max(0, timeoutSec - elapsedSec);
    }

    const { passwordEnc: _secret, ...publicRecord } = record;
    void _secret;

    vms.push({
      ...publicRecord,
      ip: container?.ipAddress || publicRecord.ip,
      status: derived.status,
      statusReason: derived.statusReason,
      restarting: derived.restarting,
      exitCode: derived.exitCode,
      oomKilled: derived.oomKilled,
      healthStatus: derived.healthStatus,
      startedAt: derived.startedAt,
      uptimeSeconds: derived.uptimeSeconds,
      idleSeconds,
      containerId: derived.containerId,
      containerState: derived.containerState,
      statusUpdatedAt,
      statusSource: 'docker',
      stale: derived.stale,
      lastKnownStatus: derived.lastKnownStatus,
      resourceUsage: derived.status === 'running' ? options.statsMap?.get(record.id) ?? null : null,
      lastLogs: derived.status === 'error' ? options.logsMap?.get(record.id) ?? null : null,
    });
  }

  const orphans: OrphanedContainer[] = [];
  const orphanedContainerIds: string[] = [];

  if (dockerReachable) {
    for (const container of managed) {
      const vmId = container.labels[PTAAS_LABELS.VM_ID]?.trim() || null;
      if (!vmId || !knownRecordIds.has(vmId) || orphanCandidates.includes(container)) {
        const mapped = mapContainerToStatus(container, { dockerReachable: true, nowMs });
        orphanedContainerIds.push(container.id);
        orphans.push({
          containerId: container.id,
          vmId,
          name: container.labels[PTAAS_LABELS.NAME] || container.name,
          image: container.image,
          owner: container.labels[PTAAS_LABELS.OWNER] || null,
          tenant: container.labels[PTAAS_LABELS.TENANT] || null,
          status: mapped.status,
          containerState: container.state.status,
          statusReason: mapped.statusReason,
          createdAt: container.createdAt ?? null,
        });
      }
    }
  }

  return {
    vms,
    orphans,
    drift: {
      missingIds,
      orphanedContainerIds,
    },
    statusUpdatedAt,
    statusSource: 'docker',
    stale: !dockerReachable,
    dockerReachable,
  };
}
