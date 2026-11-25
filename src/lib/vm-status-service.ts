import crypto from 'crypto';
import os from 'os';
import { EventEmitter } from 'events';
import {
  DockerApiError,
  DockerProvider,
  probeTcpPort,
  sanitizeTenantNetworkName,
  type DockerEventMessage,
  type DockerEventSubscription,
  type DockerHealthcheckConfig,
} from './docker-client';
import {
  PTAAS_LABELS,
  computeUptimeSeconds,
  isManagedContainer,
  reconcileVms,
  type DerivedVmView,
  type DockerContainerSummary,
  type OrphanedContainer,
  type ReconcileResult,
  type VmMetadataRecord,
  type VmResourceUsage,
  type VmRuntimeStatus,
} from './docker-status';
import {
  getImageCatalog,
  validateVmCreateSpec,
  type ImageCatalogEntry,
} from './image-catalog';
import {
  decryptVmSecret,
  encryptVmSecret,
  generateStrongVmPassword,
} from './vm-secrets';
import {
  createDemoVm,
  createVmMetadataRecord,
  deleteDemoVm,
  deleteVmMetadataRecord,
  findUserById,
  findVmRecordById,
  flushVmRecordsToRemote,
  getSystemPolicies,
  isServerDemoMode,
  listDemoVms,
  listVmRecords,
  recordServerAudit,
  syncVmRecordsFromRemote,
  updateVmMetadataIp,
} from './server-store';
import type { SessionPayload } from './server-auth';

export type VmLifecycleAction = 'start' | 'stop' | 'restart' | 'recreate' | 'reset' | 'delete';

export type CreationStage =
  | 'queued'
  | 'creating'
  | 'starting'
  | 'waiting_for_desktop'
  | 'ready'
  | 'failed'
  | 'cancelled';

export interface CreationProgressEvent {
  type: 'creation_progress';
  vmId: string;
  vmName: string;
  owner: string;
  tenant: string;
  stage: CreationStage;
  message: string;
  ip?: string | null;
  elapsedMs: number;
  error?: string | null;
  at: string;
}

export interface ScopedVmSnapshot {
  vms: DerivedVmView[];
  orphans?: OrphanedContainer[];
  statusUpdatedAt: string;
  statusSource: 'docker' | 'demo';
  stale: boolean;
  dockerReachable: boolean;
  demoMode: boolean;
  dockerError: string | null;
}

export interface SessionInvalidationEvent {
  type: 'session_invalidated';
  vmId: string;
  vmName: string;
  reason: string;
  status: VmRuntimeStatus;
  at: string;
}

export interface StatusUpdateEvent {
  type: 'status_changed';
  vmIds?: string[];
  at: string;
}

export type VmBusEvent = SessionInvalidationEvent | StatusUpdateEvent | CreationProgressEvent;

export interface ImageHealthEntry {
  id: string;
  os: string;
  label: string;
  description: string;
  image: string;
  protocol: 'rdp' | 'vnc';
  defaultCpu: number;
  defaultRamMb: number;
  defaultDiskGb: number;
  tools: string[];
  available: boolean;
  ready: boolean;
  sizeBytes?: number;
  pulling?: boolean;
  pullStatus?: string | null;
  error?: string | null;
}

interface ActiveSessionEntry {
  tokenId: string;
  vmId: string;
  userId: string;
  protocol: string;
  createdAt: number;
  onInvalidate?: (reason: string) => void;
}

interface IdempotencyEntry {
  createdAt: number;
  promise: Promise<DerivedVmView>;
}

const RELEVANT_DOCKER_ACTIONS = new Set([
  'start',
  'die',
  'stop',
  'kill',
  'oom',
  'destroy',
  'health_status',
  'pause',
  'unpause',
  'create',
  'restart',
]);

function getReconcileIntervalMs(): number {
  const envVal = Number.parseInt(process.env.DOCKER_RECONCILE_INTERVAL_MS || '', 10);
  if (Number.isFinite(envVal) && envVal >= 1000 && envVal <= 60000) return envVal;
  return 7000;
}

function getUnreachableGraceMs(): number {
  const envVal = Number.parseInt(process.env.DOCKER_UNREACHABLE_GRACE_MS || '', 10);
  if (Number.isFinite(envVal) && envVal >= 0 && envVal <= 60000) return envVal;
  return 10000;
}

function getStatsIntervalMs(): number {
  const envVal = Number.parseInt(process.env.DOCKER_STATS_INTERVAL_MS || '', 10);
  if (Number.isFinite(envVal) && envVal >= 2000) return envVal;
  return 15000;
}

function getReadinessTimeoutMs(): number {
  const envVal = Number.parseInt(process.env.PTAAS_READINESS_TIMEOUT_MS || '', 10);
  if (Number.isFinite(envVal) && envVal >= 2000 && envVal <= 300000) return envVal;
  return 90000;
}

function makeHttpError(message: string, statusCode: number, code: string): Error & {
  statusCode: number;
  code: string;
} {
  const err = new Error(message) as Error & { statusCode: number; code: string };
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

class VmStatusService {
  private provider = new DockerProvider();
  private bus = new EventEmitter();
  private initialized = false;
  private eventSub: DockerEventSubscription | null = null;
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private backoffMs = 1000;

  private containersById = new Map<string, DockerContainerSummary>();
  private lastKnownStatuses = new Map<string, VmRuntimeStatus>();
  private inFlightOps = new Map<string, 'starting' | 'stopping'>();
  private opQueues = new Map<string, Promise<unknown>>();
  private userCreateLocks = new Map<string, Promise<unknown>>();
  private idempotencyCache = new Map<string, IdempotencyEntry>();
  private cancelledCreations = new Set<string>();
  private activeCreationsCount = 0;
  private creationWaiters: Array<() => void> = [];
  private createRateBuckets = new Map<string, number[]>();
  private globalCreateTimestamps: number[] = [];

  private imageReadyCache = new Map<string, { ready: boolean; sizeBytes?: number; error?: string | null; checkedAt: number }>();
  private imagePullState = new Map<string, { pulling: boolean; status: string | null }>();

  private gracefulStopIds = new Set<string>();
  private readinessMap = new Map<string, boolean>();
  private lastActivityMap = new Map<string, number>();
  private statsMap = new Map<string, VmResourceUsage>();
  private logsMap = new Map<string, string[]>();
  private activeSessions = new Map<string, Set<ActiveSessionEntry>>();
  private invalidatedTokens = new Set<string>();

  private dockerReachable = false;
  private everConnected = false;
  private firstFailureAt: number | null = null;
  private lastDockerError: string | null = null;
  private lastSnapshot: ReconcileResult | null = null;
  private reconcileInFlight: Promise<ReconcileResult> | null = null;

  constructor() {
    this.bus.setMaxListeners(200);
  }

  private ensureStarted(): void {
    if (this.initialized || isServerDemoMode()) return;
    this.initialized = true;

    void this.reconcile('startup');
    void this.checkImagesHealth();
    this.connectEventStream();

    this.reconcileTimer = setInterval(() => {
      void this.reconcile('periodic');
    }, getReconcileIntervalMs());
    this.reconcileTimer.unref?.();

    this.statsTimer = setInterval(() => {
      void this.refreshStats();
    }, getStatsIntervalMs());
    this.statsTimer.unref?.();
  }

  private connectEventStream(): void {
    if (isServerDemoMode()) return;
    if (this.eventSub) {
      this.eventSub.close();
      this.eventSub = null;
    }

    this.eventSub = this.provider.subscribeEvents({
      onConnect: () => {
        this.backoffMs = 1000;
        this.firstFailureAt = null;
        this.lastDockerError = null;
        void this.reconcile('events_connect');
      },
      onEvent: (evt) => {
        void this.handleDockerEvent(evt);
      },
      onError: (err) => {
        this.handleDockerFailure(err);
        this.scheduleReconnect();
      },
      onClose: () => {
        this.scheduleReconnect();
      },
    });
  }

  private scheduleReconnect(): void {
    if (isServerDemoMode()) return;
    if (this.reconnectTimer) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(15000, this.backoffMs * 2);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectEventStream();
    }, delay);
    this.reconnectTimer.unref?.();
  }

  private handleDockerFailure(err: unknown): void {
    const message = err instanceof Error ? err.message : 'Cannot reach Docker engine';
    this.lastDockerError = message;
    const now = Date.now();
    if (this.firstFailureAt === null) {
      this.firstFailureAt = now;
    }

    const graceMs = getUnreachableGraceMs();
    const pastGrace = !this.everConnected || now - this.firstFailureAt >= graceMs;
    if (pastGrace) {
      const wasReachable = this.dockerReachable;
      this.dockerReachable = false;
      this.buildSnapshotAndNotify(true);
      if (wasReachable) {
        for (const record of listVmRecords()) {
          this.invalidateSessionsForVm(record.id, record.name, 'unknown', 'Docker engine unreachable');
        }
      }
    }
  }

  private async handleDockerEvent(evt: DockerEventMessage): Promise<void> {
    const rawAction = String(evt.Action || evt.status || '').split(':')[0];
    if (!RELEVANT_DOCKER_ACTIONS.has(rawAction)) return;

    const containerId = evt.Actor?.ID || evt.id;
    const attrs = evt.Actor?.Attributes || {};
    const vmId = attrs[PTAAS_LABELS.VM_ID];

    if (rawAction === 'stop') {
      if (containerId) this.gracefulStopIds.add(containerId);
      if (vmId) this.gracefulStopIds.add(vmId);
    } else if (rawAction === 'oom' || rawAction === 'start') {
      if (containerId) this.gracefulStopIds.delete(containerId);
      if (vmId) this.gracefulStopIds.delete(vmId);
    }

    if (rawAction === 'destroy') {
      if (containerId) this.containersById.delete(containerId);
      this.buildSnapshotAndNotify(true);
      return;
    }

    if (containerId) {
      try {
        const inspected = await this.provider.inspectContainer(containerId);
        if (inspected && isManagedContainer(inspected.labels)) {
          this.containersById.set(inspected.id, inspected);
          if (vmId && inspected.ipAddress) {
            updateVmMetadataIp(vmId, inspected.ipAddress);
          }
          this.dockerReachable = true;
          this.everConnected = true;
          this.firstFailureAt = null;
          this.lastDockerError = null;
          if (inspected.state.status === 'exited' && inspected.state.exitCode !== 0 && vmId) {
            const logs = await this.provider.getContainerLogs(inspected.id, 15);
            if (logs.length) this.logsMap.set(vmId, logs);
          }
        } else if (!inspected) {
          this.containersById.delete(containerId);
        }
        this.buildSnapshotAndNotify(true);
      } catch (err) {
        this.handleDockerFailure(err);
      }
    }
  }

  private async refreshStats(): Promise<void> {
    if (isServerDemoMode() || !this.dockerReachable) return;
    const records = listVmRecords();
    const recordById = new Map(records.map((r) => [r.id, r]));
    for (const container of this.containersById.values()) {
      if (!container.state.running) continue;
      const vmId = container.labels[PTAAS_LABELS.VM_ID];
      if (!vmId || !recordById.has(vmId)) continue;
      const stats = await this.provider.getContainerStats(container.id);
      if (stats) this.statsMap.set(vmId, stats);
    }
  }

  private async probeReadinessIfNeeded(containers: DockerContainerSummary[]): Promise<void> {
    if (process.env.PTAAS_READINESS_PROBE !== 'tcp') {
      this.readinessMap.clear();
      return;
    }
    const recordsById = new Map(listVmRecords().map((r) => [r.id, r]));
    for (const container of containers) {
      const vmId = container.labels[PTAAS_LABELS.VM_ID];
      if (!vmId) continue;
      const rec = recordsById.get(vmId);
      if (!rec || !container.state.running) {
        this.readinessMap.delete(vmId);
        continue;
      }
      const host = container.ipAddress || rec.rdpHost || '127.0.0.1';
      const port = rec.sshPort || rec.rdpPort || 2222;
      const ready = await probeTcpPort(host, port, 800);
      this.readinessMap.set(vmId, ready);
    }
  }

  private buildSnapshotAndNotify(emitChange = false): ReconcileResult {
    const records = listVmRecords();
    const prevStatuses = new Map<string, VmRuntimeStatus>();
    if (this.lastSnapshot) {
      for (const vm of this.lastSnapshot.vms) {
        prevStatuses.set(vm.id, vm.status);
      }
    }

    const result = reconcileVms(records, Array.from(this.containersById.values()), {
      dockerReachable: this.dockerReachable,
      inFlightOps: this.inFlightOps,
      lastKnownStatuses: this.lastKnownStatuses,
      readinessMap: this.readinessMap,
      gracefulStopIds: this.gracefulStopIds,
      lastActivityMap: this.lastActivityMap,
      statsMap: this.statsMap,
      logsMap: this.logsMap,
    });

    const changedVmIds: string[] = [];
    for (const vm of result.vms) {
      if (vm.status !== 'unknown') {
        this.lastKnownStatuses.set(vm.id, vm.status);
      }
      const prev = prevStatuses.get(vm.id);
      if (prev !== vm.status) {
        changedVmIds.push(vm.id);
        if (prev === 'running' && vm.status !== 'running') {
          this.invalidateSessionsForVm(
            vm.id,
            vm.name,
            vm.status,
            vm.status === 'missing'
              ? 'VM container was removed'
              : vm.status === 'error'
                ? vm.statusReason || 'VM exited with error'
                : 'VM stopped'
          );
        }
      }
    }

    const prevReachable = this.lastSnapshot?.dockerReachable;
    const prevOrphanCount = this.lastSnapshot?.orphans.length ?? 0;
    const prevVmCount = this.lastSnapshot?.vms.length ?? 0;

    this.lastSnapshot = result;

    if (
      emitChange ||
      changedVmIds.length > 0 ||
      prevReachable !== result.dockerReachable ||
      prevOrphanCount !== result.orphans.length ||
      prevVmCount !== result.vms.length
    ) {
      this.bus.emit('event', {
        type: 'status_changed',
        vmIds: changedVmIds,
        at: result.statusUpdatedAt,
      } satisfies StatusUpdateEvent);
    }

    return result;
  }

  async reconcile(_reason = 'manual'): Promise<ReconcileResult> {
    if (isServerDemoMode()) {
      return {
        vms: [],
        orphans: [],
        drift: { missingIds: [], orphanedContainerIds: [] },
        statusUpdatedAt: new Date().toISOString(),
        statusSource: 'docker',
        stale: false,
        dockerReachable: true,
      };
    }

    if (this.reconcileInFlight) {
      return this.reconcileInFlight;
    }

    this.reconcileInFlight = (async () => {
      try {
        await syncVmRecordsFromRemote();
        const containers = await this.provider.listManagedContainers(true);
        this.containersById.clear();
        for (const c of containers) {
          if (isManagedContainer(c.labels)) {
            this.containersById.set(c.id, c);
            const vmId = c.labels[PTAAS_LABELS.VM_ID];
            if (vmId && c.ipAddress) updateVmMetadataIp(vmId, c.ipAddress);
            if (
              vmId &&
              (c.state.oomKilled ||
                (c.state.status === 'exited' && c.state.exitCode !== 0) ||
                c.state.healthStatus === 'unhealthy')
            ) {
              const logs = await this.provider.getContainerLogs(c.id, 15);
              if (logs.length) this.logsMap.set(vmId, logs);
            }
          }
        }
        await this.probeReadinessIfNeeded(containers);
        this.dockerReachable = true;
        this.everConnected = true;
        this.firstFailureAt = null;
        this.lastDockerError = null;
        return this.buildSnapshotAndNotify(false);
      } catch (err) {
        this.handleDockerFailure(err);
        return this.buildSnapshotAndNotify(false);
      } finally {
        this.reconcileInFlight = null;
      }
    })();

    return this.reconcileInFlight;
  }

  // --- Image Health & Admin Prepare ---

  async checkImagesHealth(): Promise<{
    demoMode: boolean;
    dockerReachable: boolean;
    images: ImageHealthEntry[];
  }> {
    const catalog = getImageCatalog();
    if (isServerDemoMode()) {
      return {
        demoMode: true,
        dockerReachable: true,
        images: catalog.map((c) => ({ ...c, ready: c.available, pulling: false, pullStatus: null, error: null })),
      };
    }

    this.ensureStarted();
    const reachable = await this.provider.ping();
    const images: ImageHealthEntry[] = [];

    for (const entry of catalog) {
      const pullInfo = this.imagePullState.get(entry.id) || { pulling: false, status: null };
      if (!entry.available) {
        images.push({ ...entry, ready: false, pulling: false, pullStatus: null, error: null });
        continue;
      }
      if (!reachable) {
        images.push({
          ...entry,
          ready: false,
          pulling: pullInfo.pulling,
          pullStatus: pullInfo.status,
          error: 'Cannot reach Docker engine',
        });
        continue;
      }
      try {
        const info = await this.provider.inspectImage(entry.image);
        const ready = Boolean(info);
        this.imageReadyCache.set(entry.id, {
          ready,
          sizeBytes: info?.sizeBytes,
          error: ready ? null : `Image "${entry.image}" not found locally`,
          checkedAt: Date.now(),
        });
        images.push({
          ...entry,
          ready,
          sizeBytes: info?.sizeBytes,
          pulling: pullInfo.pulling,
          pullStatus: pullInfo.status,
          error: ready ? null : `Image not ready (${entry.image}). Run prepare-images or pull via admin.`,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Image inspect failed';
        images.push({
          ...entry,
          ready: false,
          pulling: pullInfo.pulling,
          pullStatus: pullInfo.status,
          error: msg,
        });
      }
    }

    return { demoMode: false, dockerReachable: reachable, images };
  }

  async triggerImagePull(session: SessionPayload, catalogId: string): Promise<ImageHealthEntry> {
    if (session.role !== 'admin') {
      throw makeHttpError('Forbidden', 403, 'forbidden');
    }
    const entry = getImageCatalog().find((c) => c.id === catalogId && c.available);
    if (!entry) {
      throw makeHttpError('Unknown or unavailable image catalog id', 404, 'invalid_image');
    }
    if (isServerDemoMode()) {
      return { ...entry, ready: true, pulling: false, pullStatus: 'Ready (demo)', error: null };
    }

    this.imagePullState.set(entry.id, { pulling: true, status: 'Pulling image...' });
    try {
      const info = await this.provider.pullImage(entry.image, (status, detail) => {
        this.imagePullState.set(entry.id, {
          pulling: true,
          status: detail ? `${status}: ${detail}` : status,
        });
      });
      this.imageReadyCache.set(entry.id, {
        ready: true,
        sizeBytes: info.sizeBytes,
        error: null,
        checkedAt: Date.now(),
      });
      return { ...entry, ready: true, sizeBytes: info.sizeBytes, pulling: false, pullStatus: 'Ready', error: null };
    } finally {
      this.imagePullState.set(entry.id, { pulling: false, status: null });
    }
  }

  // --- Per-VM & Per-User Locks + Global Creation Concurrency Semaphore ---

  private async withVmLock<T>(
    vmId: string,
    opState: 'starting' | 'stopping' | null,
    fn: () => Promise<T>
  ): Promise<T> {
    const prev = this.opQueues.get(vmId) || Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const nextChain = prev.then(() => gate);
    this.opQueues.set(vmId, nextChain);

    await prev;
    try {
      if (opState) {
        this.inFlightOps.set(vmId, opState);
        this.buildSnapshotAndNotify(true);
      }
      return await fn();
    } finally {
      if (opState) {
        this.inFlightOps.delete(vmId);
      }
      release();
      if (this.opQueues.get(vmId) === nextChain) {
        this.opQueues.delete(vmId);
      }
      this.buildSnapshotAndNotify(true);
    }
  }

  private async withUserCreateLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.userCreateLocks.get(userId) || Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const nextChain = prev.then(() => gate);
    this.userCreateLocks.set(userId, nextChain);

    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (this.userCreateLocks.get(userId) === nextChain) {
        this.userCreateLocks.delete(userId);
      }
    }
  }

  private async acquireGlobalCreationSlot(): Promise<() => void> {
    const maxConcurrent = Math.max(1, getSystemPolicies().maxConcurrentCreations || 2);
    if (this.activeCreationsCount >= maxConcurrent) {
      await new Promise<void>((resolve) => {
        this.creationWaiters.push(resolve);
      });
    }
    this.activeCreationsCount++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeCreationsCount = Math.max(0, this.activeCreationsCount - 1);
      const next = this.creationWaiters.shift();
      if (next) next();
    };
  }

  private checkCreateRateLimit(userId: string): void {
    const now = Date.now();
    const windowMs = 60_000;
    const userLimit = Number.parseInt(process.env.PTAAS_CREATE_RATE_LIMIT || '20', 10) || 20;
    const globalLimit = Number.parseInt(process.env.PTAAS_GLOBAL_CREATE_RATE_LIMIT || '60', 10) || 60;

    const userTs = (this.createRateBuckets.get(userId) || []).filter((t) => now - t < windowMs);
    if (userTs.length >= userLimit) {
      throw makeHttpError('Too many VM creation requests. Please wait a minute and try again.', 429, 'rate_limited');
    }
    this.globalCreateTimestamps = this.globalCreateTimestamps.filter((t) => now - t < windowMs);
    if (this.globalCreateTimestamps.length >= globalLimit) {
      throw makeHttpError('Platform creation rate limit reached. Please retry shortly.', 429, 'rate_limited');
    }

    userTs.push(now);
    this.createRateBuckets.set(userId, userTs);
    this.globalCreateTimestamps.push(now);
  }

  private emitCreationProgress(evt: Omit<CreationProgressEvent, 'type' | 'at'>): void {
    this.bus.emit('event', {
      type: 'creation_progress',
      at: new Date().toISOString(),
      ...evt,
    } satisfies CreationProgressEvent);
  }

  // --- Scoping Helpers ---

  private filterForSession(
    vms: DerivedVmView[],
    orphans: OrphanedContainer[],
    session: SessionPayload
  ): { vms: DerivedVmView[]; orphans?: OrphanedContainer[] } {
    const actor = findUserById(session.userId);
    const isAdmin = session.role === 'admin';
    let visible = vms;

    if (session.role === 'student') {
      visible = vms.filter((v) => v.owner === session.userId);
    } else if (session.role === 'instructor' && actor) {
      visible = vms.filter((v) => actor.cohorts.includes(v.tenant));
    }

    const mapped = visible.map((vm) => ({
      ...vm,
      ownerName: findUserById(vm.owner)?.name ?? vm.owner,
      lastLogs: isAdmin ? vm.lastLogs ?? null : null,
    }));

    return isAdmin ? { vms: mapped, orphans } : { vms: mapped };
  }

  private canAccessVm(session: SessionPayload, vm: Pick<VmMetadataRecord, 'owner' | 'tenant'>): boolean {
    if (session.role === 'admin') return true;
    if (session.role === 'student') return vm.owner === session.userId;
    if (session.role === 'instructor') {
      const actor = findUserById(session.userId);
      return Boolean(actor?.cohorts.includes(vm.tenant));
    }
    return false;
  }

  private buildDemoSnapshot(session: SessionPayload): ScopedVmSnapshot {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const demoViews: DerivedVmView[] = listDemoVms().map((vm) => ({
      ...vm,
      statusReason: null,
      restarting: vm.status === 'starting',
      exitCode: vm.status === 'stopped' ? 0 : null,
      oomKilled: false,
      healthStatus: vm.status === 'running' ? 'healthy' : 'none',
      uptimeSeconds: vm.status === 'running' ? computeUptimeSeconds(vm.startedAt, nowMs) : 0,
      idleSeconds: vm.status === 'running' ? vm.idleSeconds : null,
      containerId: null,
      containerState: vm.status,
      statusUpdatedAt: nowIso,
      statusSource: 'demo',
      stale: false,
      lastKnownStatus: vm.status,
      resourceUsage: null,
      lastLogs: null,
    }));

    const scoped = this.filterForSession(demoViews, [], session);
    return {
      vms: scoped.vms,
      ...(session.role === 'admin' ? { orphans: [] } : {}),
      statusUpdatedAt: nowIso,
      statusSource: 'demo',
      stale: false,
      dockerReachable: true,
      demoMode: true,
      dockerError: null,
    };
  }

  async getScopedSnapshot(session: SessionPayload, forceRefresh = false): Promise<ScopedVmSnapshot> {
    if (isServerDemoMode()) {
      return this.buildDemoSnapshot(session);
    }

    this.ensureStarted();
    const snap =
      forceRefresh || !this.lastSnapshot
        ? await this.reconcile('api_get')
        : this.lastSnapshot;

    const scoped = this.filterForSession(snap.vms, snap.orphans, session);
    return {
      vms: scoped.vms,
      ...(session.role === 'admin' ? { orphans: scoped.orphans || [] } : {}),
      statusUpdatedAt: snap.statusUpdatedAt,
      statusSource: 'docker',
      stale: snap.stale,
      dockerReachable: snap.dockerReachable,
      demoMode: false,
      dockerError: snap.dockerReachable ? null : this.lastDockerError || 'Cannot reach Docker engine',
    };
  }

  async getScopedVmById(
    session: SessionPayload,
    vmId: string
  ): Promise<{ vm: DerivedVmView | null; forbidden?: boolean; snapshot: ScopedVmSnapshot }> {
    const snapshot = await this.getScopedSnapshot(session, true);
    if (isServerDemoMode()) {
      const demo = listDemoVms().find((v) => v.id === vmId);
      if (!demo) return { vm: null, snapshot };
      if (!this.canAccessVm(session, demo)) return { vm: null, forbidden: true, snapshot };
      const view = snapshot.vms.find((v) => v.id === vmId) || null;
      return { vm: view, snapshot };
    }

    const record = findVmRecordById(vmId);
    if (!record) return { vm: null, snapshot };
    if (!this.canAccessVm(session, record)) return { vm: null, forbidden: true, snapshot };

    if (this.dockerReachable) {
      try {
        const container = await this.provider.findContainerByVmId(vmId);
        if (container) {
          this.containersById.set(container.id, container);
          if (container.ipAddress) updateVmMetadataIp(vmId, container.ipAddress);
        } else {
          for (const [cid, c] of this.containersById.entries()) {
            if (c.labels[PTAAS_LABELS.VM_ID] === vmId) this.containersById.delete(cid);
          }
        }
        this.buildSnapshotAndNotify(false);
      } catch (err) {
        this.handleDockerFailure(err);
      }
    }

    const refreshed = await this.getScopedSnapshot(session, false);
    return {
      vm: refreshed.vms.find((v) => v.id === vmId) || null,
      snapshot: refreshed,
    };
  }

  // --- Isolated Per-VM Provisioning (`POST /api/vms`) ---

  private async checkHostCapacity(requestedRamMb: number, requestedDiskGb: number): Promise<void> {
    const policies = getSystemPolicies();
    const records = listVmRecords();
    const runningCount = Array.from(this.containersById.values()).filter((c) => c.state.running).length;

    if (records.length >= policies.maxTotalVms) {
      throw makeHttpError(
        `Platform VM capacity reached (${records.length}/${policies.maxTotalVms}). Please try again later.`,
        503,
        'capacity_exceeded'
      );
    }
    if (runningCount >= policies.maxRunningVms) {
      throw makeHttpError(
        `Maximum concurrent running VMs reached (${runningCount}/${policies.maxRunningVms}). Please try again later.`,
        503,
        'capacity_exceeded'
      );
    }

    const simAvailRamMb = Number.parseInt(process.env.PTAAS_SIMULATED_FREE_RAM_MB || '', 10);
    let availableRamMb: number;
    if (Number.isFinite(simAvailRamMb)) {
      availableRamMb = simAvailRamMb;
    } else {
      const sysInfo = await this.provider.getSystemInfo();
      const totalMemMb = sysInfo?.memTotalBytes
        ? Math.floor(sysInfo.memTotalBytes / (1024 * 1024))
        : Math.floor(os.totalmem() / (1024 * 1024));
      const rawOvercommit = Number.parseFloat(process.env.PTAAS_MEMORY_OVERCOMMIT_RATIO || '2.0');
      const overcommitRatio = Number.isFinite(rawOvercommit) ? Math.min(4, Math.max(1, rawOvercommit)) : 2.0;
      const overrideRamMb = Number.parseInt(process.env.PTAAS_CONTAINER_RAM_MB || '', 10);
      const allocatedRunningRamMb = records.reduce((sum, rec) => {
        const isUp = Array.from(this.containersById.values()).some(
          (c) => c.labels[PTAAS_LABELS.VM_ID] === rec.id && c.state.running
        );
        if (!isUp) return sum;
        const perVmMb = Number.isFinite(overrideRamMb) && overrideRamMb >= 16 ? overrideRamMb : rec.ram * 1024;
        return sum + perVmMb;
      }, 0);
      // Containers enforce --memory as an upper cgroup cap rather than pre-allocating physical RAM
      const remainingFromDocker = Math.floor(totalMemMb * overcommitRatio) - allocatedRunningRamMb;
      const hostFreeMb = Math.floor(os.freemem() / (1024 * 1024));
      availableRamMb = Math.max(remainingFromDocker, hostFreeMb);
    }

    if (availableRamMb - policies.hostMemoryReserveMb < requestedRamMb) {
      throw makeHttpError(
        `Insufficient host memory capacity for ${Math.round(requestedRamMb / 1024)} GB RAM (available: ${Math.max(0, Math.round(availableRamMb - policies.hostMemoryReserveMb))} MB).`,
        503,
        'capacity_exceeded'
      );
    }

    const simFreeDiskGb = Number.parseInt(process.env.PTAAS_SIMULATED_FREE_DISK_GB || '', 10);
    if (Number.isFinite(simFreeDiskGb) && simFreeDiskGb - policies.hostDiskReserveGb < requestedDiskGb) {
      throw makeHttpError(
        `Insufficient host disk capacity for ${requestedDiskGb} GB storage.`,
        503,
        'capacity_exceeded'
      );
    }
  }

  private async cleanupProvisionedResources(opts: {
    vmId: string;
    containerId?: string | null;
    volumeName?: string | null;
    networkName?: string | null;
    deleteRecord?: boolean;
  }): Promise<void> {
    if (opts.containerId) {
      if (opts.networkName) {
        await this.provider.disconnectContainerFromNetwork(opts.networkName, opts.containerId).catch(() => {});
      }
      await this.provider.removeContainer(opts.containerId, true).catch(() => {});
      this.containersById.delete(opts.containerId);
    }
    if (opts.volumeName) {
      await this.provider.removeVolume(opts.volumeName, true).catch(() => {});
    }
    if (opts.deleteRecord) {
      deleteVmMetadataRecord(opts.vmId);
      await flushVmRecordsToRemote();
    }
    this.inFlightOps.delete(opts.vmId);
    this.buildSnapshotAndNotify(true);
  }

  private buildContainerHealthcheck(catalog: ImageCatalogEntry): DockerHealthcheckConfig | null {
    if (process.env.PTAAS_HEALTHCHECK_CMD) {
      return {
        Test: ['CMD-SHELL', process.env.PTAAS_HEALTHCHECK_CMD],
        Interval: 1_000_000_000, // 1s for fast tests
        Timeout: 2_000_000_000,
        Retries: 2,
        StartPeriod: 500_000_000,
      };
    }
    // When running real Kali desktop image (not a lightweight test sleep override), verify RDP/SSH port
    if (!process.env.PTAAS_VM_CMD) {
      return {
        Test: [
          'CMD-SHELL',
          `ss -tln 2>/dev/null | grep -qE ':(${catalog.rdpPort}|${catalog.sshPort}|${catalog.vncPort}) ' || nc -z 127.0.0.1 ${catalog.rdpPort} || nc -z 127.0.0.1 ${catalog.sshPort} || exit 1`,
        ],
        Interval: 5_000_000_000,
        Timeout: 3_000_000_000,
        Retries: 3,
        StartPeriod: 10_000_000_000,
      };
    }
    return null;
  }

  private watchCreationReadiness(opts: {
    record: VmMetadataRecord;
    containerId: string;
    startedMs: number;
    actorEmail: string;
  }): void {
    const { record, containerId, startedMs, actorEmail } = opts;
    const timeoutMs = getReadinessTimeoutMs();

    void (async () => {
      this.emitCreationProgress({
        vmId: record.id,
        vmName: record.name,
        owner: record.owner,
        tenant: record.tenant,
        stage: 'waiting_for_desktop',
        message: 'Waiting for container healthcheck & desktop/SSH readiness…',
        ip: record.ip || null,
        elapsedMs: Date.now() - startedMs,
      });

      try {
        while (Date.now() - startedMs < timeoutMs) {
          if (this.cancelledCreations.has(record.id)) {
            this.cancelledCreations.delete(record.id);
            await this.cleanupProvisionedResources({
              vmId: record.id,
              containerId,
              volumeName: record.volumeName,
              networkName: record.networkName,
              deleteRecord: true,
            });
            recordServerAudit({
              action: 'vm.create.failed',
              actor: actorEmail,
              tenant: record.tenant,
              target: record.name,
              image: record.catalogId || record.image,
              spec: `${record.vcpu}vCPU/${record.ram}GB/${record.disk}GB`,
              result: 'FAILED',
              detail: 'Cancelled by user during provisioning',
            });
            this.emitCreationProgress({
              vmId: record.id,
              vmName: record.name,
              owner: record.owner,
              tenant: record.tenant,
              stage: 'cancelled',
              message: 'VM creation cancelled and resources cleaned up.',
              elapsedMs: Date.now() - startedMs,
            });
            return;
          }

          let inspected: DockerContainerSummary | null = null;
          try {
            inspected = await this.provider.inspectContainer(containerId);
          } catch (err) {
            throw err;
          }

          if (!inspected) {
            throw new Error('Container vanished before reaching readiness');
          }

          this.containersById.set(inspected.id, inspected);
          if (inspected.ipAddress) {
            updateVmMetadataIp(record.id, inspected.ipAddress);
          }

          const st = inspected.state;
          if (st.oomKilled || st.dead || st.status === 'exited' || st.healthStatus === 'unhealthy') {
            const logs = await this.provider.getContainerLogs(containerId, 20);
            if (logs.length) this.logsMap.set(record.id, logs);
            const reason = st.oomKilled
              ? 'Container was OOM killed during startup'
              : st.healthStatus === 'unhealthy'
                ? 'Container health check failed'
                : `Container exited early (code ${st.exitCode})`;
            throw new Error(reason);
          }

          const healthReady = st.healthStatus === 'healthy' || st.healthStatus === 'none';
          if (st.running && healthReady) {
            let portReady = true;
            if (process.env.PTAAS_READINESS_PROBE === 'tcp' && inspected.ipAddress) {
              portReady = await probeTcpPort(inspected.ipAddress, record.rdpPort || 3389, 800);
            }
            if (portReady) {
              this.inFlightOps.delete(record.id);
              this.recordVmActivity(record.id);
              await this.reconcile('create_ready');
              recordServerAudit({
                action: 'vm.create.succeeded',
                actor: actorEmail,
                tenant: record.tenant,
                target: record.name,
                image: record.catalogId || record.image,
                spec: `${record.vcpu}vCPU/${record.ram}GB/${record.disk}GB`,
                result: 'SUCCESS',
                detail: `Container ${record.containerName} ready (${inspected.ipAddress || 'internal'})`,
              });
              this.emitCreationProgress({
                vmId: record.id,
                vmName: record.name,
                owner: record.owner,
                tenant: record.tenant,
                stage: 'ready',
                message: 'VM is running and ready for Remote Desktop and Terminal.',
                ip: inspected.ipAddress || record.ip || null,
                elapsedMs: Date.now() - startedMs,
              });
              return;
            }
          }

          await new Promise((r) => setTimeout(r, 400));
        }

        const logs = await this.provider.getContainerLogs(containerId, 20);
        if (logs.length) this.logsMap.set(record.id, logs);
        throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s waiting for VM readiness`);
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Provisioning failed';
        // Rollback partial container + dedicated volume and release quota slot so nothing leaks!
        await this.cleanupProvisionedResources({
          vmId: record.id,
          containerId,
          volumeName: record.volumeName,
          networkName: record.networkName,
          deleteRecord: true,
        });
        recordServerAudit({
          action: 'vm.create.failed',
          actor: actorEmail,
          tenant: record.tenant,
          target: record.name,
          image: record.catalogId || record.image,
          spec: `${record.vcpu}vCPU/${record.ram}GB/${record.disk}GB`,
          result: 'FAILED',
          detail: reason,
        });
        this.emitCreationProgress({
          vmId: record.id,
          vmName: record.name,
          owner: record.owner,
          tenant: record.tenant,
          stage: 'failed',
          message: reason,
          error: reason,
          elapsedMs: Date.now() - startedMs,
        });
      }
    })();
  }

  async createVm(
    session: SessionPayload,
    input: {
      name?: string;
      imageId?: string;
      os?: string;
      vcpu?: number;
      ram?: number;
      disk?: number;
      vpc?: string;
      cohort?: string;
      grantId?: string;
      idempotencyKey?: string;
      restartPolicy?: string;
      waitForReady?: boolean;
    }
  ): Promise<DerivedVmView> {
    // Clean expired idempotency entries (> 5 min)
    const now = Date.now();
    for (const [k, v] of this.idempotencyCache.entries()) {
      if (now - v.createdAt > 5 * 60_000) this.idempotencyCache.delete(k);
    }

    const idempKey = input.idempotencyKey?.trim()
      ? `${session.userId}:${input.idempotencyKey.trim()}`
      : null;
    if (idempKey && this.idempotencyCache.has(idempKey)) {
      return this.idempotencyCache.get(idempKey)!.promise;
    }

    const taskPromise = this.executeCreateVm(session, input);
    if (idempKey) {
      this.idempotencyCache.set(idempKey, { createdAt: now, promise: taskPromise });
      taskPromise.catch(() => {
        // Don't cache failed attempts permanently so user can fix and retry
        this.idempotencyCache.delete(idempKey);
      });
    }
    return taskPromise;
  }

  private async executeCreateVm(
    session: SessionPayload,
    input: {
      name?: string;
      imageId?: string;
      os?: string;
      vcpu?: number;
      ram?: number;
      disk?: number;
      vpc?: string;
      cohort?: string;
      grantId?: string;
      restartPolicy?: string;
      waitForReady?: boolean;
    }
  ): Promise<DerivedVmView> {
    const startedMs = Date.now();
    const specCheck = validateVmCreateSpec({
      name: input.name,
      imageId: input.imageId,
      os: input.os,
      vcpu: input.vcpu,
      ram: input.ram,
      disk: input.disk,
    });
    if (!specCheck.ok) {
      throw makeHttpError(specCheck.message, 400, specCheck.code);
    }

    const { name, catalog, vcpu, ramGb, diskGb } = specCheck;
    const actor = findUserById(session.userId);
    const tenant = input.cohort || session.cohort || actor?.cohort || 'CS-401';

    recordServerAudit({
      action: 'vm.create.requested',
      actor: session.email,
      tenant,
      target: name,
      image: catalog.id,
      spec: `${vcpu}vCPU/${ramGb}GB/${diskGb}GB`,
      result: 'SUCCESS',
    });

    if (isServerDemoMode()) {
      const policies = getSystemPolicies();
      const limit = actor?.maxSelfServiceVms || policies.maxSelfServiceVms || 3;
      const existing = listDemoVms().filter((v) => v.owner === session.userId);
      if (existing.some((v) => v.name.toLowerCase() === name)) {
        throw makeHttpError(`A VM named "${name}" already exists.`, 409, 'name_conflict');
      }
      if (session.role === 'student' && existing.length >= limit && !input.grantId) {
        throw makeHttpError(`Maximum self-service VM limit (${limit}) reached.`, 409, 'vm_limit_reached');
      }
      const created = createDemoVm({
        name,
        os: catalog.os,
        vcpu,
        ram: ramGb,
        disk: diskGb,
        vpc: input.vpc || 'vpc-cs401-01',
        owner: session.userId,
        tenant,
      });
      this.emitCreationProgress({
        vmId: created.id,
        vmName: created.name,
        owner: created.owner,
        tenant: created.tenant,
        stage: 'ready',
        message: 'Demo VM simulated ready.',
        ip: created.ip,
        elapsedMs: Date.now() - startedMs,
      });
      this.bus.emit('event', { type: 'status_changed', vmIds: [created.id], at: new Date().toISOString() });
      const snap = this.buildDemoSnapshot(session);
      return snap.vms.find((v) => v.id === created.id)!;
    }

    this.ensureStarted();
    this.checkCreateRateLimit(session.userId);

    // Step A: Per-user mutex serializes quota checks, name uniqueness, image readiness, capacity guard & metadata reservation
    const reservation = await this.withUserCreateLock(session.userId, async () => {
      const policies = getSystemPolicies();
      const userLimit = actor?.maxSelfServiceVms || policies.maxSelfServiceVms || 3;
      const hardCap = policies.hardCapVms || 6;

      // Count BOTH metadata records AND labeled containers in Docker for this user so concurrent limits can never drift
      const ownedRecords = listVmRecords().filter((v) => v.owner === session.userId);
      const ownedIds = new Set(ownedRecords.map((r) => r.id));
      let liveDockerCountForUser = ownedIds.size;
      try {
        const liveContainers = await this.provider.listManagedContainers(false);
        for (const c of liveContainers) {
          if (c.labels[PTAAS_LABELS.OWNER] === session.userId) {
            const cidVmId = c.labels[PTAAS_LABELS.VM_ID];
            if (!cidVmId || !ownedIds.has(cidVmId)) liveDockerCountForUser++;
          }
        }
      } catch {
        throw makeHttpError('Cannot reach Docker engine to verify VM capacity.', 503, 'docker_unreachable');
      }

      if (ownedRecords.some((v) => v.name.toLowerCase() === name)) {
        throw makeHttpError(`You already have a VM named "${name}". Choose a different name.`, 409, 'name_conflict');
      }

      if (session.role === 'student') {
        if (liveDockerCountForUser >= hardCap) {
          throw makeHttpError(`Hard VM cap (${hardCap}) reached.`, 409, 'vm_limit_reached');
        }
        if (liveDockerCountForUser >= userLimit && !input.grantId) {
          throw makeHttpError(
            `Maximum self-service VM limit (${userLimit}) reached. Request approval for additional VMs.`,
            409,
            'vm_limit_reached'
          );
        }
        const quota = actor?.quota || { vcpu: 8, ram: 16, storage: 150, vms: 4 };
        const usedDisk = ownedRecords.reduce((s, r) => s + r.disk, 0);
        if (usedDisk + diskGb > quota.storage) {
          throw makeHttpError(`Storage quota exceeded (${usedDisk + diskGb}/${quota.storage} GB).`, 409, 'quota_exceeded');
        }
        const runningVcpu = ownedRecords.reduce((s, r) => {
          const isUp = Array.from(this.containersById.values()).some(
            (c) => c.labels[PTAAS_LABELS.VM_ID] === r.id && c.state.running
          );
          return s + (isUp ? r.vcpu : 0);
        }, 0);
        const runningRam = ownedRecords.reduce((s, r) => {
          const isUp = Array.from(this.containersById.values()).some(
            (c) => c.labels[PTAAS_LABELS.VM_ID] === r.id && c.state.running
          );
          return s + (isUp ? r.ram : 0);
        }, 0);
        if (runningVcpu + vcpu > quota.vcpu) {
          throw makeHttpError(`vCPU quota exceeded (${runningVcpu + vcpu}/${quota.vcpu} vCPU).`, 409, 'quota_exceeded');
        }
        if (runningRam + ramGb > quota.ram) {
          throw makeHttpError(`RAM quota exceeded (${runningRam + ramGb}/${quota.ram} GB).`, 409, 'quota_exceeded');
        }
      }

      // Verify golden image exists locally (never download multi-GB image on create click)
      const imageInfo = await this.provider.inspectImage(catalog.image);
      if (!imageInfo) {
        throw makeHttpError(
          `Image not ready: "${catalog.image}" is not available locally. Run prepare-images or contact an administrator.`,
          503,
          'image_not_ready'
        );
      }

      // Compute container memory limit (allow env override for small memory-hog OOM tests)
      const overrideRamMb = Number.parseInt(process.env.PTAAS_CONTAINER_RAM_MB || '', 10);
      const containerRamMb =
        Number.isFinite(overrideRamMb) && overrideRamMb >= 16
          ? overrideRamMb
          : ramGb * 1024;

      await this.checkHostCapacity(containerRamMb, diskGb);

      const vmId = crypto.randomUUID();
      const shortId = vmId.replace(/-/g, '').slice(0, 10);
      const containerName = `ptaas-vm-${shortId}`;
      const volumeName = `ptaas-vol-${shortId}`;
      const networkName = sanitizeTenantNetworkName(tenant);
      const plainPassword = generateStrongVmPassword(28);
      const passwordEnc = encryptVmSecret(plainPassword);

      const record = createVmMetadataRecord({
        id: vmId,
        name,
        os: catalog.os,
        catalogId: catalog.id,
        image: catalog.image,
        containerName,
        volumeName,
        networkName,
        vcpu,
        ram: ramGb,
        disk: diskGb,
        vpc: networkName,
        owner: session.userId,
        tenant,
        rdpHost: containerName,
        rdpPort: catalog.rdpPort,
        sshPort: catalog.sshPort,
        vncPort: catalog.vncPort,
        protocol: catalog.protocol,
        restartPolicy: input.restartPolicy || 'unless-stopped',
        passwordEnc,
      });

      this.inFlightOps.set(record.id, 'starting');
      this.buildSnapshotAndNotify(true);

      return { record, plainPassword, containerRamMb, catalog };
    });

    const { record, plainPassword, containerRamMb } = reservation;

    this.emitCreationProgress({
      vmId: record.id,
      vmName: record.name,
      owner: record.owner,
      tenant: record.tenant,
      stage: 'queued',
      message: 'Provisioning request queued…',
      elapsedMs: Date.now() - startedMs,
    });

    // Step B: Acquire global creation concurrency slot (prevents overloading host)
    const releaseSlot = await this.acquireGlobalCreationSlot();
    let createdContainerId: string | null = null;
    let createdVolumeName: string | null = null;

    try {
      if (this.cancelledCreations.has(record.id)) {
        this.cancelledCreations.delete(record.id);
        deleteVmMetadataRecord(record.id);
        this.inFlightOps.delete(record.id);
        throw makeHttpError('VM creation cancelled', 499, 'cancelled');
      }

      this.emitCreationProgress({
        vmId: record.id,
        vmName: record.name,
        owner: record.owner,
        tenant: record.tenant,
        stage: 'creating',
        message: `Allocating isolated volume ${record.volumeName} and internal network ${record.networkName}…`,
        elapsedMs: Date.now() - startedMs,
      });

      // 1. Ensure per-tenant internal network (Internal: true -> zero internet egress)
      const tenantNet = await this.provider.ensureTenantNetwork(record.tenant);

      // Optional: connect guacd/gateway container to this tenant network so it can reach the VM internally
      const gatewayContainer = process.env.PTAAS_GATEWAY_CONTAINER || '';
      if (gatewayContainer.trim()) {
        await this.provider.connectContainerToNetwork(tenantNet.name, gatewayContainer.trim()).catch(() => {});
      }

      // 2. Create dedicated per-VM named volume (never shared across VMs)
      await this.provider.createVolume(record.volumeName!, {
        [PTAAS_LABELS.VM_ID]: record.id,
        [PTAAS_LABELS.OWNER]: record.owner,
        [PTAAS_LABELS.TENANT]: record.tenant,
        [PTAAS_LABELS.NAME]: record.name,
      });
      createdVolumeName = record.volumeName!;

      // 3. Create hardened per-VM container from golden image
      const defaultCmd = process.env.PTAAS_VM_CMD
        ? (JSON.parse(process.env.PTAAS_VM_CMD) as string[])
        : undefined;

      const created = await this.provider.createContainer({
        vmId: record.id,
        containerName: record.containerName!,
        displayName: record.name,
        os: record.os,
        catalogId: record.catalogId || catalog.id,
        image: record.image,
        owner: record.owner,
        tenant: record.tenant,
        vcpu: record.vcpu,
        ramMb: containerRamMb,
        diskGb: record.disk,
        password: plainPassword,
        volumeName: record.volumeName!,
        networkName: tenantNet.name,
        createdAt: record.createdAt,
        cmd: defaultCmd,
        restartPolicy: record.restartPolicy,
        healthcheck: this.buildContainerHealthcheck(catalog),
        rdpPort: record.rdpPort,
        sshPort: record.sshPort,
        vncPort: record.vncPort,
      });
      createdContainerId = created.id;
      this.containersById.set(created.id, created);

      this.emitCreationProgress({
        vmId: record.id,
        vmName: record.name,
        owner: record.owner,
        tenant: record.tenant,
        stage: 'starting',
        message: `Starting isolated container ${record.containerName}…`,
        elapsedMs: Date.now() - startedMs,
      });

      // 4. Start the container and inspect to capture real assigned internal Lab IP
      const started = await this.provider.startContainer(created.id);
      if (started) {
        this.containersById.set(started.id, started);
        if (started.ipAddress) {
          updateVmMetadataIp(record.id, started.ipAddress);
        }
      }
      await flushVmRecordsToRemote();

      this.dockerReachable = true;
      this.everConnected = true;
      this.firstFailureAt = null;
      this.recordVmActivity(record.id);

      // Start readiness watcher (transitions starting -> ready OR rolls back container+volume on failure/timeout/cancel)
      this.watchCreationReadiness({
        record,
        containerId: created.id,
        startedMs,
        actorEmail: session.email,
      });

      const snap = this.buildSnapshotAndNotify(true);
      const view = snap.vms.find((v) => v.id === record.id);
      if (!view) {
        throw new Error('VM created but missing from snapshot');
      }

      // Return immediately with status 'starting' (or wait for ready only if caller explicitly requested waitForReady)
      if (input.waitForReady) {
        await this.waitForVmTerminalOrRunning(record.id, getReadinessTimeoutMs());
        const latestSnap = await this.getScopedSnapshot(session, false);
        const latestVm = latestSnap.vms.find((v) => v.id === record.id);
        if (!latestVm) {
          throw makeHttpError('VM failed readiness check and was rolled back.', 500, 'readiness_failed');
        }
        return latestVm;
      }

      return { ...view, ownerName: findUserById(view.owner)?.name ?? view.owner };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Failed to provision VM container';
      await this.cleanupProvisionedResources({
        vmId: record.id,
        containerId: createdContainerId,
        volumeName: createdVolumeName,
        networkName: record.networkName,
        deleteRecord: true,
      });
      recordServerAudit({
        action: 'vm.create.failed',
        actor: session.email,
        tenant: record.tenant,
        target: record.name,
        image: record.catalogId || record.image,
        spec: `${record.vcpu}vCPU/${record.ram}GB/${record.disk}GB`,
        result: 'FAILED',
        detail: reason,
      });
      this.emitCreationProgress({
        vmId: record.id,
        vmName: record.name,
        owner: record.owner,
        tenant: record.tenant,
        stage: 'failed',
        message: reason,
        error: reason,
        elapsedMs: Date.now() - startedMs,
      });
      throw err;
    } finally {
      releaseSlot();
    }
  }

  private waitForVmTerminalOrRunning(vmId: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        unsub();
        resolve();
      }, timeoutMs);
      const unsub = this.subscribe((evt) => {
        if (evt.type === 'creation_progress' && evt.vmId === vmId) {
          if (evt.stage === 'ready' || evt.stage === 'failed' || evt.stage === 'cancelled') {
            clearTimeout(timer);
            unsub();
            resolve();
          }
        }
      });
    });
  }

  async cancelCreation(session: SessionPayload, vmId: string): Promise<{ cancelled: boolean }> {
    const record = findVmRecordById(vmId);
    if (!record) return { cancelled: true };
    if (!this.canAccessVm(session, record)) {
      throw makeHttpError('Forbidden', 403, 'forbidden');
    }
    this.cancelledCreations.add(vmId);
    const existing = await this.provider.findContainerByVmId(vmId).catch(() => null);
    await this.cleanupProvisionedResources({
      vmId,
      containerId: existing?.id ?? null,
      volumeName: record.volumeName,
      networkName: record.networkName,
      deleteRecord: true,
    });
    return { cancelled: true };
  }

  // --- Lifecycle Actions ---

  async performAction(
    session: SessionPayload,
    vmId: string,
    action: VmLifecycleAction,
    opts?: { wipeVolume?: boolean }
  ): Promise<{ vm: DerivedVmView | null; deleted?: boolean }> {
    if (isServerDemoMode()) {
      return this.performDemoAction(session, vmId, action);
    }

    this.ensureStarted();
    const record = findVmRecordById(vmId);
    if (!record) {
      throw makeHttpError('Virtual machine not found', 404, 'not_found');
    }
    if (!this.canAccessVm(session, record)) {
      throw makeHttpError('Forbidden', 403, 'forbidden');
    }

    if (action === 'reset' && !opts?.wipeVolume) {
      this.recordVmActivity(vmId);
      const snap = this.buildSnapshotAndNotify(true);
      return { vm: snap.vms.find((v) => v.id === vmId) || null };
    }

    const opState: 'starting' | 'stopping' | null =
      action === 'start' || action === 'restart' || action === 'recreate' || action === 'reset'
        ? 'starting'
        : action === 'stop' || action === 'delete'
          ? 'stopping'
          : null;

    return this.withVmLock(vmId, opState, async () => {
      const existing = await this.provider.findContainerByVmId(vmId);

      if (action === 'start') {
        if (!existing) {
          throw makeHttpError(
            'Container not found in Docker engine. Use Recreate instead.',
            409,
            'container_missing'
          );
        }
        this.gracefulStopIds.delete(existing.id);
        this.gracefulStopIds.delete(vmId);
        const inspected = await this.provider.startContainer(existing.id);
        if (inspected) {
          this.containersById.set(inspected.id, inspected);
          if (inspected.ipAddress) updateVmMetadataIp(vmId, inspected.ipAddress);
        }
        this.recordVmActivity(vmId);
      } else if (action === 'stop') {
        this.gracefulStopIds.add(vmId);
        if (existing) {
          this.gracefulStopIds.add(existing.id);
          const inspected = await this.provider.stopContainer(existing.id);
          if (inspected) this.containersById.set(inspected.id, inspected);
        }
        this.invalidateSessionsForVm(vmId, record.name, 'stopped', 'VM stopped');
      } else if (action === 'restart') {
        if (!existing) {
          throw makeHttpError(
            'Container not found in Docker engine. Use Recreate instead.',
            409,
            'container_missing'
          );
        }
        this.gracefulStopIds.delete(existing.id);
        this.gracefulStopIds.delete(vmId);
        const inspected = await this.provider.restartContainer(existing.id);
        if (inspected) {
          this.containersById.set(inspected.id, inspected);
          if (inspected.ipAddress) updateVmMetadataIp(vmId, inspected.ipAddress);
        }
        this.recordVmActivity(vmId);
      } else if (action === 'recreate' || action === 'reset') {
        if (existing) {
          await this.provider.removeContainer(existing.id, true);
          this.containersById.delete(existing.id);
        }
        const shortId = record.id.replace(/-/g, '').slice(0, 10);
        const volName = record.volumeName || `ptaas-vol-${shortId}`;
        if (opts?.wipeVolume) {
          await this.provider.removeVolume(volName, true).catch(() => {});
        }
        await this.provider.createVolume(volName, {
          [PTAAS_LABELS.VM_ID]: record.id,
          [PTAAS_LABELS.OWNER]: record.owner,
          [PTAAS_LABELS.TENANT]: record.tenant,
          [PTAAS_LABELS.NAME]: record.name,
        });
        const tenantNet = await this.provider.ensureTenantNetwork(record.tenant);
        const plainPassword = decryptVmSecret(record.passwordEnc) || generateStrongVmPassword(28);
        const defaultCmd = process.env.PTAAS_VM_CMD
          ? (JSON.parse(process.env.PTAAS_VM_CMD) as string[])
          : undefined;
        const overrideRamMb = Number.parseInt(process.env.PTAAS_CONTAINER_RAM_MB || '', 10);
        const containerRamMb =
          Number.isFinite(overrideRamMb) && overrideRamMb >= 16
            ? overrideRamMb
            : record.ram * 1024;

        const created = await this.provider.createContainer({
          vmId: record.id,
          containerName: record.containerName || `ptaas-vm-${shortId}`,
          displayName: record.name,
          os: record.os,
          catalogId: record.catalogId || 'kali-2024.3',
          image: record.image,
          owner: record.owner,
          tenant: record.tenant,
          vcpu: record.vcpu,
          ramMb: containerRamMb,
          diskGb: record.disk,
          password: plainPassword,
          volumeName: volName,
          networkName: tenantNet.name,
          createdAt: record.createdAt,
          cmd: defaultCmd,
          restartPolicy: record.restartPolicy,
        });
        const started = await this.provider.startContainer(created.id);
        if (started) {
          this.containersById.set(started.id, started);
          if (started.ipAddress) updateVmMetadataIp(vmId, started.ipAddress);
        }
        this.recordVmActivity(vmId);
      } else if (action === 'delete') {
        this.gracefulStopIds.add(vmId);
        if (existing) {
          this.gracefulStopIds.add(existing.id);
          if (record.networkName) {
            await this.provider.disconnectContainerFromNetwork(record.networkName, existing.id).catch(() => {});
          }
          await this.provider.removeContainer(existing.id, true);
          this.containersById.delete(existing.id);
        }
        if (record.volumeName) {
          await this.provider.removeVolume(record.volumeName, true).catch(() => {});
        }
        deleteVmMetadataRecord(vmId);
        this.lastKnownStatuses.delete(vmId);
        this.lastActivityMap.delete(vmId);
        this.statsMap.delete(vmId);
        this.logsMap.delete(vmId);
        this.invalidateSessionsForVm(vmId, record.name, 'missing', 'VM deleted');
        recordServerAudit({
          action: 'vm.delete',
          actor: session.email,
          tenant: record.tenant,
          target: record.name,
          image: record.catalogId || record.image,
          spec: `${record.vcpu}vCPU/${record.ram}GB/${record.disk}GB`,
          result: 'SUCCESS',
        });
        this.buildSnapshotAndNotify(true);
        return { vm: null, deleted: true };
      }

      const snap = await this.reconcile(`action:${action}`);
      const vm = snap.vms.find((v) => v.id === vmId) || null;
      return {
        vm: vm ? { ...vm, ownerName: findUserById(vm.owner)?.name ?? vm.owner } : null,
      };
    });
  }

  private performDemoAction(
    session: SessionPayload,
    vmId: string,
    action: VmLifecycleAction
  ): { vm: DerivedVmView | null; deleted?: boolean } {
    const vm = listDemoVms().find((v) => v.id === vmId);
    if (!vm) throw makeHttpError('Virtual machine not found', 404, 'not_found');
    if (!this.canAccessVm(session, vm)) throw makeHttpError('Forbidden', 403, 'forbidden');

    if (action === 'start' || action === 'recreate') {
      vm.status = 'running';
      vm.startedAt = new Date().toISOString();
      vm.idleSeconds = (vm.idleTimeoutMin ?? 60) * 60;
    } else if (action === 'stop') {
      vm.status = 'stopped';
      vm.startedAt = null;
      this.invalidateSessionsForVm(vmId, vm.name, 'stopped', 'VM stopped');
    } else if (action === 'restart') {
      vm.status = 'running';
      vm.startedAt = new Date().toISOString();
      vm.idleSeconds = (vm.idleTimeoutMin ?? 60) * 60;
    } else if (action === 'reset') {
      vm.idleSeconds = (vm.idleTimeoutMin ?? 60) * 60;
    } else if (action === 'delete') {
      deleteDemoVm(vmId);
      this.invalidateSessionsForVm(vmId, vm.name, 'missing', 'VM deleted');
      this.bus.emit('event', { type: 'status_changed', vmIds: [vmId], at: new Date().toISOString() });
      return { vm: null, deleted: true };
    }

    this.bus.emit('event', { type: 'status_changed', vmIds: [vmId], at: new Date().toISOString() });
    const snap = this.buildDemoSnapshot(session);
    return { vm: snap.vms.find((v) => v.id === vmId) || null };
  }

  async cleanupOrphan(session: SessionPayload, containerId: string): Promise<boolean> {
    if (session.role !== 'admin') throw makeHttpError('Forbidden', 403, 'forbidden');
    if (isServerDemoMode()) return true;

    this.ensureStarted();
    const inspected = await this.provider.inspectContainer(containerId);
    if (!inspected) return true;

    if (!isManagedContainer(inspected.labels)) {
      throw makeHttpError('Refusing to remove unmanaged container', 403, 'forbidden');
    }

    const vmId = inspected.labels[PTAAS_LABELS.VM_ID];
    if (vmId && findVmRecordById(vmId)) {
      throw makeHttpError('Container belongs to an active VM record, not an orphan', 409, 'conflict');
    }

    const volName = inspected.labels[PTAAS_LABELS.VOLUME];
    await this.provider.removeContainer(containerId, true);
    if (volName) {
      await this.provider.removeVolume(volName, true).catch(() => {});
    }
    this.containersById.delete(containerId);
    await this.reconcile('orphan_cleanup');
    return true;
  }

  /** Admin cleanup job: removes orphaned labeled containers & volumes whose VM record no longer exists. */
  async pruneOrphanedResources(session: SessionPayload): Promise<{
    removedContainers: string[];
    removedVolumes: string[];
  }> {
    if (session.role !== 'admin') throw makeHttpError('Forbidden', 403, 'forbidden');
    if (isServerDemoMode()) return { removedContainers: [], removedVolumes: [] };

    this.ensureStarted();
    const knownVmIds = new Set(listVmRecords().map((r) => r.id));
    const removedContainers: string[] = [];
    const removedVolumes: string[] = [];

    const containers = await this.provider.listManagedContainers(false);
    for (const c of containers) {
      const vmId = c.labels[PTAAS_LABELS.VM_ID];
      if (!vmId || !knownVmIds.has(vmId)) {
        await this.provider.removeContainer(c.id, true).catch(() => {});
        removedContainers.push(c.id);
      }
    }

    const volumes = await this.provider.listManagedVolumes();
    for (const v of volumes) {
      const vmId = v.labels[PTAAS_LABELS.VM_ID];
      if (!vmId || !knownVmIds.has(vmId)) {
        await this.provider.removeVolume(v.name, true).catch(() => {});
        removedVolumes.push(v.name);
      }
    }

    await this.reconcile('prune_orphans');
    return { removedContainers, removedVolumes };
  }

  /** Resolves live internal container IP + decrypted per-VM password for backend tunnel injection only. */
  async resolveTunnelTarget(
    session: SessionPayload,
    vmIdOrName: string
  ): Promise<{
    vm: DerivedVmView;
    host: string;
    rdpPort: number;
    sshPort: number;
    password: string;
  } | null> {
    const derived = await this.getDerivedVmStatus(session, vmIdOrName);
    if (!derived) return null;

    if (isServerDemoMode()) {
      const rdpPort = Number.parseInt(process.env.GUAC_RDP_PORT || '', 10) || derived.rdpPort || 3389;
      const sshPort = Number.parseInt(process.env.GUAC_SSH_PORT || '', 10) || 22;
      return {
        vm: derived,
        host: derived.rdpHost || process.env.GUAC_DEFAULT_HOST || derived.ip || 'kali-lab-01',
        rdpPort,
        sshPort,
        password: process.env.GUAC_KALI_PASS || 'student123',
      };
    }

    const record = findVmRecordById(derived.id);
    if (!record) return null;

    // Live lookup from Docker by ptaas.vm-id label (never hardcoded ports/hosts)
    const liveContainer = await this.provider.findContainerByVmId(record.id).catch(() => null);
    const liveIp = liveContainer?.ipAddress || derived.ip || record.containerName || record.rdpHost;
    const password = decryptVmSecret(record.passwordEnc);
    if (!password) {
      throw makeHttpError('VM credentials are unavailable for this container.', 500, 'missing_credentials');
    }

    return {
      vm: { ...derived, ip: liveIp },
      host: liveIp,
      rdpPort: record.rdpPort || 3389,
      sshPort: record.sshPort || 2222,
      password,
    };
  }

  recordVmActivity(vmId: string): void {
    this.lastActivityMap.set(vmId, Date.now());
  }

  registerActiveSession(entry: Omit<ActiveSessionEntry, 'createdAt'>): () => void {
    const full: ActiveSessionEntry = { ...entry, createdAt: Date.now() };
    let set = this.activeSessions.get(entry.vmId);
    if (!set) {
      set = new Set();
      this.activeSessions.set(entry.vmId, set);
    }
    set.add(full);
    this.recordVmActivity(entry.vmId);
    return () => {
      set?.delete(full);
    };
  }

  isTokenInvalidated(tokenId: string): boolean {
    return this.invalidatedTokens.has(tokenId);
  }

  invalidateSessionsForVm(
    vmId: string,
    vmName: string,
    status: VmRuntimeStatus,
    reason: string
  ): void {
    const set = this.activeSessions.get(vmId);
    if (set) {
      for (const entry of set) {
        this.invalidatedTokens.add(entry.tokenId);
        try {
          entry.onInvalidate?.(reason);
        } catch { /* ignore */ }
      }
      set.clear();
      this.activeSessions.delete(vmId);
    }
    if (this.invalidatedTokens.size > 1000) {
      const oldest = Array.from(this.invalidatedTokens).slice(0, 500);
      oldest.forEach((t) => this.invalidatedTokens.delete(t));
    }

    this.bus.emit('event', {
      type: 'session_invalidated',
      vmId,
      vmName,
      reason,
      status,
      at: new Date().toISOString(),
    } satisfies SessionInvalidationEvent);
  }

  subscribe(listener: (event: VmBusEvent) => void): () => void {
    this.ensureStarted();
    this.bus.on('event', listener);
    return () => {
      this.bus.off('event', listener);
    };
  }

  async getDerivedVmStatus(session: SessionPayload, vmIdOrName: string): Promise<DerivedVmView | null> {
    const snap = await this.getScopedSnapshot(session, true);
    const needle = vmIdOrName.trim().toLowerCase();
    return (
      snap.vms.find((v) => v.id.toLowerCase() === needle || v.name.toLowerCase() === needle) ||
      null
    );
  }
}

const globalForVmService = globalThis as unknown as { __ptaasVmStatusService?: VmStatusService };

export function getVmStatusService(): VmStatusService {
  if (!globalForVmService.__ptaasVmStatusService) {
    globalForVmService.__ptaasVmStatusService = new VmStatusService();
  }
  return globalForVmService.__ptaasVmStatusService;
}

export { DockerApiError };
