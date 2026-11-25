import http from 'http';
import https from 'https';
import net from 'net';
import {
  PTAAS_LABELS,
  normalizeDockerContainer,
  type DockerContainerSummary,
  type VmResourceUsage,
} from './docker-status';

export interface DockerEndpointConfig {
  protocol: 'unix' | 'npipe' | 'http' | 'https';
  socketPath?: string;
  host?: string;
  port?: number;
  basePath?: string;
  authKey?: string;
}

export interface DockerEventMessage {
  Type?: string;
  Action?: string;
  status?: string;
  id?: string;
  time?: number;
  timeNano?: number;
  Actor?: {
    ID?: string;
    Attributes?: Record<string, string>;
  };
}

export interface DockerHealthcheckConfig {
  Test: string[];
  Interval?: number; // nanoseconds
  Timeout?: number; // nanoseconds
  Retries?: number;
  StartPeriod?: number; // nanoseconds
}

export interface CreateContainerOptions {
  vmId: string;
  containerName: string;
  displayName: string;
  os: string;
  catalogId: string;
  image: string;
  owner: string;
  tenant: string;
  vcpu: number;
  ramMb: number;
  diskGb: number;
  password: string;
  volumeName: string;
  volumeTarget?: string;
  networkName: string;
  createdAt: string;
  cmd?: string[];
  env?: string[];
  restartPolicy?: string;
  pidsLimit?: number;
  shmSizeMb?: number;
  readonlyRootfs?: boolean;
  healthcheck?: DockerHealthcheckConfig | null;
  rdpPort?: number;
  sshPort?: number;
  vncPort?: number;
}

export interface DockerImageInfo {
  id: string;
  repoTags: string[];
  sizeBytes: number;
  created: string | null;
}

export interface DockerSystemCapacity {
  ncpu: number;
  memTotalBytes: number;
  containersRunning: number;
  containersTotal: number;
}

export interface DockerManagedVolume {
  name: string;
  labels: Record<string, string>;
  mountpoint?: string;
  createdAt?: string | null;
}

export interface DockerManagedNetwork {
  id: string;
  name: string;
  internal: boolean;
  labels: Record<string, string>;
}

export interface DockerEventSubscription {
  close: () => void;
}

const DOCKER_API_VERSION = 'v1.44';

// Documented minimal Linux capabilities required by Kali XFCE + xrdp + sshd + vncserver
// after dropping ALL capabilities (`CapDrop: ['ALL']`).
export const KALI_MINIMAL_CAPS = [
  'CHOWN',
  'SETUID',
  'SETGID',
  'DAC_OVERRIDE',
  'FOWNER',
  'NET_BIND_SERVICE',
  'SYS_CHROOT',
  'AUDIT_WRITE',
] as const;

function parseDockerHost(raw: string): DockerEndpointConfig {
  const trimmed = raw.trim();
  if (trimmed.startsWith('unix://')) {
    return { protocol: 'unix', socketPath: trimmed.slice('unix://'.length) };
  }
  if (trimmed.startsWith('npipe://')) {
    const cleaned = trimmed.slice('npipe://'.length).replace(/^\/+/, '').replace(/\//g, '\\');
    return { protocol: 'npipe', socketPath: `\\\\${cleaned}` };
  }
  if (trimmed.startsWith('tcp://')) {
    const parsed = new URL(`http://${trimmed.slice('tcp://'.length)}`);
    return {
      protocol: 'http',
      host: parsed.hostname,
      port: Number(parsed.port || 2375),
    };
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const parsed = new URL(trimmed);
    const isHttps = parsed.protocol === 'https:';
    return {
      protocol: isHttps ? 'https' : 'http',
      host: parsed.hostname,
      port: Number(parsed.port || (isHttps ? 443 : 80)),
      basePath: parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : undefined,
      authKey: process.env.DOCKER_PROXY_KEY || undefined,
    };
  }
  if (trimmed.startsWith('/') || trimmed.startsWith('\\\\.\\pipe\\')) {
    return {
      protocol: trimmed.startsWith('\\\\.\\pipe\\') ? 'npipe' : 'unix',
      socketPath: trimmed,
    };
  }
  return { protocol: 'unix', socketPath: '/var/run/docker.sock' };
}

export function resolveDockerEndpoints(): DockerEndpointConfig[] {
  const explicit = process.env.DOCKER_PROXY_URL || process.env.DOCKER_HOST || '';
  if (explicit.trim()) {
    return [parseDockerHost(explicit)];
  }
  if (process.platform === 'win32') {
    return [
      { protocol: 'npipe', socketPath: '\\\\.\\pipe\\dockerDesktopLinuxEngine' },
      { protocol: 'npipe', socketPath: '\\\\.\\pipe\\docker_engine' },
    ];
  }
  return [{ protocol: 'unix', socketPath: '/var/run/docker.sock' }];
}

export function sanitizeTenantNetworkName(tenant: string): string {
  const slug = String(tenant || 'default')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'default';
  return `ptaas-lab-${slug}`;
}

function stripDockerMultiplexHeader(buf: Buffer): string {
  const lines: string[] = [];
  let offset = 0;
  let framed = false;
  while (offset + 8 <= buf.length) {
    const streamType = buf[offset];
    if (streamType !== 1 && streamType !== 2 && streamType !== 0) break;
    const size = buf.readUInt32BE(offset + 4);
    if (offset + 8 + size > buf.length) break;
    framed = true;
    lines.push(buf.subarray(offset + 8, offset + 8 + size).toString('utf8'));
    offset += 8 + size;
  }
  return framed ? lines.join('') : buf.toString('utf8');
}

export class DockerApiError extends Error {
  statusCode: number;
  body: string;
  constructor(message: string, statusCode: number, body = '') {
    super(message);
    this.name = 'DockerApiError';
    this.statusCode = statusCode;
    this.body = body;
  }
}

export class DockerProvider {
  private endpoints: DockerEndpointConfig[];
  private activeEndpointIndex = 0;

  constructor(endpoints?: DockerEndpointConfig[]) {
    this.endpoints = endpoints && endpoints.length > 0 ? endpoints : resolveDockerEndpoints();
  }

  private getCurrentEndpoint(): DockerEndpointConfig {
    return this.endpoints[this.activeEndpointIndex] || this.endpoints[0];
  }

  private buildRequestOptions(
    endpoint: DockerEndpointConfig,
    method: string,
    apiPath: string,
    headers: Record<string, string> = {}
  ): http.RequestOptions {
    const fullPath =
      apiPath.startsWith('/v1.') || apiPath === '/_ping'
        ? apiPath
        : `/${DOCKER_API_VERSION}${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`;

    const basePath = (endpoint.basePath || '').replace(/\/+$/, '');
    const authHeaders: Record<string, string> = endpoint.authKey ? { 'x-ptaas-key': endpoint.authKey } : {};

    if (endpoint.socketPath) {
      return {
        socketPath: endpoint.socketPath,
        method,
        path: fullPath,
        headers: { Host: 'docker', ...headers },
      };
    }

    return {
      hostname: endpoint.host || '127.0.0.1',
      port: endpoint.port || 2375,
      method,
      path: `${basePath}${fullPath}`,
      headers: { ...authHeaders, ...headers },
    };
  }

  private rawRequest(
    endpoint: DockerEndpointConfig,
    method: string,
    apiPath: string,
    body?: unknown,
    timeoutMs = 10000
  ): Promise<{ statusCode: number; body: Buffer; headers: http.IncomingHttpHeaders }> {
    return new Promise((resolve, reject) => {
      const payload = body !== undefined ? Buffer.from(JSON.stringify(body), 'utf8') : null;
      const headers: Record<string, string> = {};
      if (payload) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = String(payload.length);
      }
      const opts = this.buildRequestOptions(endpoint, method, apiPath, headers);
      const transport = endpoint.protocol === 'https' ? https : http;

      const req = transport.request(opts, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks),
            headers: res.headers,
          });
        });
      });

      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error(`Docker API request timed out (${method} ${apiPath})`));
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  private async request(
    method: string,
    apiPath: string,
    body?: unknown,
    timeoutMs = 10000
  ): Promise<{ statusCode: number; body: Buffer; headers: http.IncomingHttpHeaders }> {
    let lastError: unknown;
    for (let attempt = 0; attempt < this.endpoints.length; attempt++) {
      const idx = (this.activeEndpointIndex + attempt) % this.endpoints.length;
      const endpoint = this.endpoints[idx];
      try {
        const res = await this.rawRequest(endpoint, method, apiPath, body, timeoutMs);
        this.activeEndpointIndex = idx;
        return res;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Cannot reach Docker engine');
  }

  async ping(): Promise<boolean> {
    try {
      const res = await this.request('GET', '/_ping', undefined, 3000);
      return res.statusCode >= 200 && res.statusCode < 300;
    } catch {
      return false;
    }
  }

  // --- Image Operations ---

  async inspectImage(imageRef: string): Promise<DockerImageInfo | null> {
    const res = await this.request('GET', `/images/${encodeURIComponent(imageRef)}/json`, undefined, 5000);
    if (res.statusCode === 404) return null;
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new DockerApiError(
        `Docker image inspect failed (${res.statusCode})`,
        res.statusCode,
        res.body.toString('utf8')
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = JSON.parse(res.body.toString('utf8')) as any;
    return {
      id: String(data?.Id || ''),
      repoTags: Array.isArray(data?.RepoTags) ? data.RepoTags : [],
      sizeBytes: Number(data?.Size || 0),
      created: typeof data?.Created === 'string' ? data.Created : null,
    };
  }

  async pullImage(
    imageRef: string,
    onProgress?: (status: string, detail?: string) => void
  ): Promise<DockerImageInfo> {
    const endpoint = this.getCurrentEndpoint();
    const opts = this.buildRequestOptions(
      endpoint,
      'POST',
      `/images/create?fromImage=${encodeURIComponent(imageRef)}`
    );
    const transport = endpoint.protocol === 'https' ? https : http;

    await new Promise<void>((resolve, reject) => {
      const req = transport.request(opts, (res) => {
        if ((res.statusCode ?? 0) >= 400) {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () =>
            reject(new DockerApiError(`Image pull failed (${res.statusCode})`, res.statusCode ?? 500, Buffer.concat(chunks).toString('utf8')))
          );
          return;
        }
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          buf += chunk;
          let idx = buf.indexOf('\n');
          while (idx !== -1) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (line) {
              try {
                const evt = JSON.parse(line) as { status?: string; progress?: string; error?: string };
                if (evt.error) {
                  reject(new DockerApiError(evt.error, 500));
                  return;
                }
                if (evt.status) onProgress?.(evt.status, evt.progress);
              } catch { /* ignore */ }
            }
            idx = buf.indexOf('\n');
          }
        });
        res.on('end', () => resolve());
        res.on('error', reject);
      });
      req.on('error', reject);
      req.end();
    });

    const info = await this.inspectImage(imageRef);
    if (!info) {
      throw new DockerApiError(`Image pulled but could not be inspected: ${imageRef}`, 500);
    }
    return info;
  }

  // --- System Info (Host Capacity Guard) ---

  async getSystemInfo(): Promise<DockerSystemCapacity | null> {
    try {
      const res = await this.request('GET', '/info', undefined, 5000);
      if (res.statusCode < 200 || res.statusCode >= 300) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = JSON.parse(res.body.toString('utf8')) as any;
      return {
        ncpu: Number(data?.NCPU || 0),
        memTotalBytes: Number(data?.MemTotal || 0),
        containersRunning: Number(data?.ContainersRunning || 0),
        containersTotal: Number(data?.Containers || 0),
      };
    } catch {
      return null;
    }
  }

  // --- Volume Operations (Dedicated Per-VM Persistent Storage) ---

  async createVolume(name: string, labels: Record<string, string>): Promise<DockerManagedVolume> {
    const payload = {
      Name: name,
      Driver: 'local',
      Labels: {
        [PTAAS_LABELS.MANAGED]: 'true',
        ...labels,
      },
    };
    const res = await this.request('POST', '/volumes/create', payload, 10000);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new DockerApiError(
        `Docker create volume failed (${res.statusCode})`,
        res.statusCode,
        res.body.toString('utf8')
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = JSON.parse(res.body.toString('utf8')) as any;
    return {
      name: String(data?.Name || name),
      labels: data?.Labels || payload.Labels,
      mountpoint: data?.Mountpoint,
      createdAt: data?.CreatedAt || null,
    };
  }

  async removeVolume(name: string, force = true): Promise<boolean> {
    const res = await this.request(
      'DELETE',
      `/volumes/${encodeURIComponent(name)}?force=${force ? 'true' : 'false'}`,
      undefined,
      10000
    );
    if (res.statusCode === 404) return true;
    if (res.statusCode !== 204 && res.statusCode !== 200) {
      throw new DockerApiError(
        `Docker remove volume failed (${res.statusCode})`,
        res.statusCode,
        res.body.toString('utf8')
      );
    }
    return true;
  }

  async listManagedVolumes(): Promise<DockerManagedVolume[]> {
    const filters = encodeURIComponent(
      JSON.stringify({ label: [`${PTAAS_LABELS.MANAGED}=true`] })
    );
    const res = await this.request('GET', `/volumes?filters=${filters}`, undefined, 8000);
    if (res.statusCode < 200 || res.statusCode >= 300) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = JSON.parse(res.body.toString('utf8')) as { Volumes?: any[] };
    const vols = Array.isArray(data?.Volumes) ? data.Volumes : [];
    return vols.map((v) => ({
      name: String(v?.Name || ''),
      labels: v?.Labels || {},
      mountpoint: v?.Mountpoint,
      createdAt: v?.CreatedAt || null,
    }));
  }

  // --- Per-Tenant Internal Network Operations (Zero Internet Egress, Cross-Tenant Isolated) ---

  async ensureTenantNetwork(tenantId: string): Promise<DockerManagedNetwork> {
    const networkName = sanitizeTenantNetworkName(tenantId);
    const existing = await this.inspectNetwork(networkName);
    if (existing) return existing;

    const payload = {
      Name: networkName,
      Driver: 'bridge',
      Internal: true, // Strictly blocks external internet egress
      CheckDuplicate: true,
      Options: {
        'com.docker.network.bridge.enable_icc': 'true',
      },
      Labels: {
        [PTAAS_LABELS.MANAGED]: 'true',
        [PTAAS_LABELS.TENANT]: tenantId,
      },
    };

    const res = await this.request('POST', '/networks/create', payload, 10000);
    if (res.statusCode === 409) {
      const raced = await this.inspectNetwork(networkName);
      if (raced) return raced;
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new DockerApiError(
        `Docker create internal network failed (${res.statusCode})`,
        res.statusCode,
        res.body.toString('utf8')
      );
    }
    const created = JSON.parse(res.body.toString('utf8')) as { Id: string };
    return {
      id: created.Id,
      name: networkName,
      internal: true,
      labels: payload.Labels,
    };
  }

  async inspectNetwork(nameOrId: string): Promise<DockerManagedNetwork | null> {
    const res = await this.request('GET', `/networks/${encodeURIComponent(nameOrId)}`, undefined, 5000);
    if (res.statusCode === 404) return null;
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new DockerApiError(
        `Docker inspect network failed (${res.statusCode})`,
        res.statusCode,
        res.body.toString('utf8')
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = JSON.parse(res.body.toString('utf8')) as any;
    return {
      id: String(data?.Id || ''),
      name: String(data?.Name || nameOrId),
      internal: Boolean(data?.Internal),
      labels: data?.Labels || {},
    };
  }

  async connectContainerToNetwork(networkIdOrName: string, containerId: string): Promise<void> {
    const res = await this.request(
      'POST',
      `/networks/${encodeURIComponent(networkIdOrName)}/connect`,
      { Container: containerId },
      8000
    );
    if (res.statusCode >= 400 && res.statusCode !== 403 && res.statusCode !== 409) {
      throw new DockerApiError(
        `Docker connect network failed (${res.statusCode})`,
        res.statusCode,
        res.body.toString('utf8')
      );
    }
  }

  async disconnectContainerFromNetwork(networkIdOrName: string, containerId: string): Promise<void> {
    await this.request(
      'POST',
      `/networks/${encodeURIComponent(networkIdOrName)}/disconnect`,
      { Container: containerId, Force: true },
      8000
    ).catch(() => {});
  }

  async listManagedNetworks(): Promise<DockerManagedNetwork[]> {
    const filters = encodeURIComponent(
      JSON.stringify({ label: [`${PTAAS_LABELS.MANAGED}=true`] })
    );
    const res = await this.request('GET', `/networks?filters=${filters}`, undefined, 8000);
    if (res.statusCode < 200 || res.statusCode >= 300) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = JSON.parse(res.body.toString('utf8')) as any[];
    if (!Array.isArray(list)) return [];
    return list.map((n) => ({
      id: String(n?.Id || ''),
      name: String(n?.Name || ''),
      internal: Boolean(n?.Internal),
      labels: n?.Labels || {},
    }));
  }

  // --- Container Operations ---

  async listManagedContainers(includeInspect = true): Promise<DockerContainerSummary[]> {
    const filters = encodeURIComponent(
      JSON.stringify({ label: [`${PTAAS_LABELS.MANAGED}=true`] })
    );
    const res = await this.request('GET', `/containers/json?all=true&filters=${filters}`);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new DockerApiError(
        `Docker list containers failed (${res.statusCode})`,
        res.statusCode,
        res.body.toString('utf8')
      );
    }

    const items = JSON.parse(res.body.toString('utf8')) as Array<{ Id: string }>;
    if (!Array.isArray(items)) return [];
    if (!includeInspect) {
      return items.map((item) => normalizeDockerContainer(item));
    }

    const inspected = await Promise.all(
      items.map(async (item) => {
        try {
          const detail = await this.inspectContainer(item.Id);
          return detail ?? normalizeDockerContainer(item);
        } catch {
          return normalizeDockerContainer(item);
        }
      })
    );
    return inspected;
  }

  async inspectContainer(containerId: string): Promise<DockerContainerSummary | null> {
    const res = await this.request('GET', `/containers/${encodeURIComponent(containerId)}/json`);
    if (res.statusCode === 404) return null;
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new DockerApiError(
        `Docker inspect failed (${res.statusCode})`,
        res.statusCode,
        res.body.toString('utf8')
      );
    }
    return normalizeDockerContainer(JSON.parse(res.body.toString('utf8')));
  }

  async findContainerByVmId(vmId: string): Promise<DockerContainerSummary | null> {
    const filters = encodeURIComponent(
      JSON.stringify({
        label: [`${PTAAS_LABELS.MANAGED}=true`, `${PTAAS_LABELS.VM_ID}=${vmId}`],
      })
    );
    const res = await this.request('GET', `/containers/json?all=true&filters=${filters}`);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new DockerApiError(
        `Docker findContainerByVmId failed (${res.statusCode})`,
        res.statusCode,
        res.body.toString('utf8')
      );
    }
    const items = JSON.parse(res.body.toString('utf8')) as Array<{ Id: string }>;
    if (!Array.isArray(items) || items.length === 0) return null;
    return this.inspectContainer(items[0].Id);
  }

  async createContainer(opts: CreateContainerOptions): Promise<DockerContainerSummary> {
    const memoryBytes = Math.max(32, Math.round(opts.ramMb)) * 1024 * 1024;
    const nanoCpus = Math.max(1, Math.round(opts.vcpu || 1)) * 1_000_000_000;
    const pidsLimit = opts.pidsLimit ?? (Number.parseInt(process.env.PTAAS_PIDS_LIMIT || '256', 10) || 256);
    const defaultShmMb = Number.parseInt(process.env.PTAAS_SHM_MB || '512', 10) || 512;
    const shmBytes = Math.min(memoryBytes, Math.max(32, opts.shmSizeMb ?? defaultShmMb) * 1024 * 1024);

    // Strictly hardened HostConfig:
    // - No host bind mounts, no /var/run/docker.sock mount, non-privileged
    // - Dedicated named volume mounted at student home
    // - Attached to internal per-tenant bridge network (no fixed host ports!)
    // - Strict CPU, Memory == MemorySwap (no swap escape), PidsLimit, ShmSize
    const hostConfig: Record<string, unknown> = {
      Privileged: false,
      CapDrop: ['ALL'],
      CapAdd: [...KALI_MINIMAL_CAPS],
      SecurityOpt: ['no-new-privileges:true'],
      Memory: memoryBytes,
      MemorySwap: memoryBytes, // Equal to Memory: disables swap overflow
      NanoCpus: nanoCpus,
      PidsLimit: pidsLimit,
      ShmSize: shmBytes,
      NetworkMode: opts.networkName,
      RestartPolicy: { Name: opts.restartPolicy || 'unless-stopped' },
      Mounts: [
        {
          Type: 'volume',
          Source: opts.volumeName,
          Target: opts.volumeTarget || '/home/student',
          ReadOnly: false,
        },
      ],
      Tmpfs: {
        '/tmp': 'rw,noexec,nosuid,size=128m',
        '/run': 'rw,nosuid,size=64m',
      },
    };

    if (opts.readonlyRootfs || process.env.PTAAS_READONLY_ROOTFS === 'true') {
      hostConfig.ReadonlyRootfs = true;
    }

    if (process.env.PTAAS_ENABLE_STORAGE_OPT === 'true' && opts.diskGb > 0) {
      hostConfig.StorageOpt = { size: `${opts.diskGb}G` };
    }

    // Never publish fixed host ports; optional 127.0.0.1 ephemeral port ONLY for local debugging
    if (process.env.PTAAS_DEBUG_EPHEMERAL_PORTS === 'true') {
      hostConfig.PortBindings = {
        [`${opts.rdpPort || 3389}/tcp`]: [{ HostIp: '127.0.0.1', HostPort: '' }],
        [`${opts.sshPort || 2222}/tcp`]: [{ HostIp: '127.0.0.1', HostPort: '' }],
      };
    }

    const labels: Record<string, string> = {
      [PTAAS_LABELS.MANAGED]: 'true',
      [PTAAS_LABELS.VM_ID]: opts.vmId,
      [PTAAS_LABELS.OWNER]: opts.owner,
      [PTAAS_LABELS.TENANT]: opts.tenant,
      [PTAAS_LABELS.IMAGE]: opts.catalogId,
      [PTAAS_LABELS.NAME]: opts.displayName,
      [PTAAS_LABELS.OS]: opts.os,
      [PTAAS_LABELS.VOLUME]: opts.volumeName,
      [PTAAS_LABELS.CREATED_AT]: opts.createdAt,
    };

    const envVars = [
      'USER=student',
      `PASSWORD=${opts.password}`,
      `VNC_PW=${opts.password}`,
      `PTAAS_VM_PASSWORD=${opts.password}`,
      'VNC_RESOLUTION=1920x1080',
      `SSH_PORT=${opts.sshPort || 2222}`,
      `RDP_PORT=${opts.rdpPort || 3389}`,
      ...(opts.env || []),
    ];

    const payload: Record<string, unknown> = {
      Image: opts.image,
      Hostname: opts.displayName.slice(0, 63),
      Labels: labels,
      Env: envVars,
      ExposedPorts: {
        [`${opts.rdpPort || 3389}/tcp`]: {},
        [`${opts.sshPort || 2222}/tcp`]: {},
        [`${opts.vncPort || 5901}/tcp`]: {},
      },
      HostConfig: hostConfig,
    };

    if (opts.cmd && opts.cmd.length > 0) {
      payload.Cmd = opts.cmd;
    }

    if (opts.healthcheck) {
      payload.Healthcheck = opts.healthcheck;
    }

    const res = await this.request(
      'POST',
      `/containers/create?name=${encodeURIComponent(opts.containerName)}`,
      payload,
      15000
    );

    if (res.statusCode < 200 || res.statusCode >= 300) {
      let msg = `Docker create container failed (${res.statusCode})`;
      try {
        const parsed = JSON.parse(res.body.toString('utf8')) as { message?: string };
        if (parsed?.message) msg = parsed.message;
      } catch { /* ignore */ }
      throw new DockerApiError(msg, res.statusCode, res.body.toString('utf8'));
    }

    const created = JSON.parse(res.body.toString('utf8')) as { Id: string };
    const inspected = await this.inspectContainer(created.Id);
    if (!inspected) {
      throw new DockerApiError('Container created but could not be inspected', 500);
    }
    return inspected;
  }

  async startContainer(containerId: string): Promise<DockerContainerSummary | null> {
    const res = await this.request(
      'POST',
      `/containers/${encodeURIComponent(containerId)}/start`,
      undefined,
      15000
    );
    if (res.statusCode !== 204 && res.statusCode !== 304) {
      let msg = `Docker start failed (${res.statusCode})`;
      try {
        const parsed = JSON.parse(res.body.toString('utf8')) as { message?: string };
        if (parsed?.message) msg = parsed.message;
      } catch { /* ignore */ }
      throw new DockerApiError(msg, res.statusCode, res.body.toString('utf8'));
    }
    return this.inspectContainer(containerId);
  }

  async stopContainer(containerId: string, timeoutSec = 5): Promise<DockerContainerSummary | null> {
    const res = await this.request(
      'POST',
      `/containers/${encodeURIComponent(containerId)}/stop?t=${Math.max(1, Math.min(30, timeoutSec))}`,
      undefined,
      (timeoutSec + 10) * 1000
    );
    if (res.statusCode === 404) return null;
    if (res.statusCode !== 204 && res.statusCode !== 304) {
      let msg = `Docker stop failed (${res.statusCode})`;
      try {
        const parsed = JSON.parse(res.body.toString('utf8')) as { message?: string };
        if (parsed?.message) msg = parsed.message;
      } catch { /* ignore */ }
      throw new DockerApiError(msg, res.statusCode, res.body.toString('utf8'));
    }
    return this.inspectContainer(containerId);
  }

  async restartContainer(containerId: string, timeoutSec = 5): Promise<DockerContainerSummary | null> {
    const res = await this.request(
      'POST',
      `/containers/${encodeURIComponent(containerId)}/restart?t=${Math.max(1, Math.min(30, timeoutSec))}`,
      undefined,
      (timeoutSec + 15) * 1000
    );
    if (res.statusCode !== 204) {
      let msg = `Docker restart failed (${res.statusCode})`;
      try {
        const parsed = JSON.parse(res.body.toString('utf8')) as { message?: string };
        if (parsed?.message) msg = parsed.message;
      } catch { /* ignore */ }
      throw new DockerApiError(msg, res.statusCode, res.body.toString('utf8'));
    }
    return this.inspectContainer(containerId);
  }

  async removeContainer(containerId: string, force = true): Promise<boolean> {
    const res = await this.request(
      'DELETE',
      `/containers/${encodeURIComponent(containerId)}?force=${force ? 'true' : 'false'}&v=false`,
      undefined,
      15000
    );
    if (res.statusCode === 404) return true;
    if (res.statusCode !== 204 && res.statusCode !== 200) {
      let msg = `Docker remove failed (${res.statusCode})`;
      try {
        const parsed = JSON.parse(res.body.toString('utf8')) as { message?: string };
        if (parsed?.message) msg = parsed.message;
      } catch { /* ignore */ }
      throw new DockerApiError(msg, res.statusCode, res.body.toString('utf8'));
    }
    return true;
  }

  async getContainerLogs(containerId: string, tail = 20): Promise<string[]> {
    try {
      const res = await this.request(
        'GET',
        `/containers/${encodeURIComponent(containerId)}/logs?stdout=1&stderr=1&tail=${tail}`,
        undefined,
        5000
      );
      if (res.statusCode < 200 || res.statusCode >= 300) return [];
      const text = stripDockerMultiplexHeader(res.body);
      return text
        .split(/\r?\n/)
        .map((l) => l.trimEnd())
        .filter(Boolean)
        .slice(-tail);
    } catch {
      return [];
    }
  }

  async getContainerStats(containerId: string): Promise<VmResourceUsage | null> {
    try {
      const res = await this.request(
        'GET',
        `/containers/${encodeURIComponent(containerId)}/stats?stream=false`,
        undefined,
        5000
      );
      if (res.statusCode < 200 || res.statusCode >= 300) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = JSON.parse(res.body.toString('utf8')) as any;
      const cpuDelta =
        (data?.cpu_stats?.cpu_usage?.total_usage ?? 0) -
        (data?.precpu_stats?.cpu_usage?.total_usage ?? 0);
      const sysDelta =
        (data?.cpu_stats?.system_cpu_usage ?? 0) -
        (data?.precpu_stats?.system_cpu_usage ?? 0);
      const onlineCpus =
        data?.cpu_stats?.online_cpus ??
        data?.cpu_stats?.cpu_usage?.percpu_usage?.length ??
        1;
      const cpuPercent =
        sysDelta > 0 && cpuDelta >= 0
          ? Number(((cpuDelta / sysDelta) * onlineCpus * 100).toFixed(1))
          : 0;
      const memUsage = Math.max(
        0,
        (data?.memory_stats?.usage ?? 0) - (data?.memory_stats?.stats?.cache ?? 0)
      );
      const memLimit = data?.memory_stats?.limit ?? 0;

      return {
        cpuPercent,
        memoryUsedMb: Math.round(memUsage / (1024 * 1024)),
        memoryLimitMb: Math.round(memLimit / (1024 * 1024)),
        sampledAt: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  subscribeEvents(handlers: {
    onEvent: (event: DockerEventMessage) => void;
    onConnect?: () => void;
    onError?: (err: Error) => void;
    onClose?: () => void;
  }): DockerEventSubscription {
    const endpoint = this.getCurrentEndpoint();
    const filters = encodeURIComponent(
      JSON.stringify({
        type: ['container'],
        label: [`${PTAAS_LABELS.MANAGED}=true`],
      })
    );
    const opts = this.buildRequestOptions(endpoint, 'GET', `/events?filters=${filters}`);
    const transport = endpoint.protocol === 'https' ? https : http;

    let closed = false;
    let buffer = '';

    const req = transport.request(opts, (res) => {
      if ((res.statusCode ?? 0) >= 400) {
        handlers.onError?.(new Error(`Docker events stream HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      handlers.onConnect?.();
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        if (closed) return;
        buffer += chunk;
        let idx = buffer.indexOf('\n');
        while (idx !== -1) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (line) {
            try {
              const evt = JSON.parse(line) as DockerEventMessage;
              handlers.onEvent(evt);
            } catch { /* ignore malformed line */ }
          }
          idx = buffer.indexOf('\n');
        }
      });
      res.on('end', () => {
        if (!closed) handlers.onClose?.();
      });
      res.on('error', (err) => {
        if (!closed) handlers.onError?.(err);
      });
    });

    req.on('error', (err) => {
      if (!closed) handlers.onError?.(err);
    });
    req.end();

    return {
      close: () => {
        closed = true;
        try {
          req.destroy();
        } catch { /* ignore */ }
      },
    };
  }
}

export function probeTcpPort(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.on('connect', () => finish(true));
    socket.on('error', () => finish(false));
  });
}
