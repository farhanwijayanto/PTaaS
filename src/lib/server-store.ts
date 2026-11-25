import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { VmMetadataRecord, VmRuntimeStatus } from './docker-status';

export type UserRole = 'admin' | 'instructor' | 'student';
export type UserStatus = 'active' | 'pending' | 'suspended';

export interface UserQuota {
  vcpu: number;
  ram: number;
  storage: number;
  vms: number;
}

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  staffId?: string;
  studentId?: string;
  nim?: string;
  title?: string;
  cohort?: string;
  cohorts: string[];
  status: UserStatus;
  passwordHash: string;
  mustChangePassword: boolean;
  lastLogin: string | null;
  quota: UserQuota;
  idleTimeoutMin: number;
  maxSelfServiceVms?: number;
}

export type PublicUser = Omit<StoredUser, 'passwordHash'>;

/** Demo-only simulated VM shape (only used when DEMO_MODE=true). */
export interface DemoVm extends VmMetadataRecord {
  status: VmRuntimeStatus;
  idleSeconds: number;
  startedAt: string | null;
}

const DEFAULT_SEED_HASH = '165ef623ce7fa6810f3897eb609750e2be59aa19dbd403c45123ceac04859996';

export function isServerDemoMode(): boolean {
  if (process.env.DEMO_MODE === 'false' || process.env.NEXT_PUBLIC_DEMO_MODE === 'false') {
    return false;
  }
  return true;
}

export function hashPassword(plain: string): string {
  return crypto.createHash('sha256').update(plain, 'utf8').digest('hex');
}

export function verifyUserPassword(user: StoredUser, plain: string): boolean {
  if (!plain || !user.passwordHash) return false;
  const candidate = Buffer.from(hashPassword(plain), 'utf8');
  const expected = Buffer.from(user.passwordHash, 'utf8');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

export function sanitizeUser(user: StoredUser): PublicUser {
  const { passwordHash: _passwordHash, ...rest } = user;
  void _passwordHash;
  return { ...rest };
}

function createInitialUsers(): StoredUser[] {
  const adminHash = process.env.ADMIN_INITIAL_PASSWORD
    ? hashPassword(process.env.ADMIN_INITIAL_PASSWORD)
    : DEFAULT_SEED_HASH;

  return [
    {
      id: 'u-admin',
      name: 'Alex Morgan',
      email: 'admin@example.com',
      role: 'admin',
      staffId: 'ADM-0001',
      title: 'System Administrator',
      cohorts: ['CS-401', 'CS-402', 'SEC-301'],
      status: 'active',
      passwordHash: adminHash,
      mustChangePassword: false,
      lastLogin: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      quota: { vcpu: 64, ram: 128, storage: 1000, vms: 40 },
      idleTimeoutMin: 120,
    },
    {
      id: 'u-sjohnson',
      name: 'Dr. Sarah Johnson',
      email: 'sarah.johnson@example.edu',
      role: 'instructor',
      staffId: 'INS-0101',
      title: 'Associate Professor of Computer Science',
      cohorts: ['CS-401', 'CS-402'],
      status: 'active',
      passwordHash: DEFAULT_SEED_HASH,
      mustChangePassword: false,
      lastLogin: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
      quota: { vcpu: 32, ram: 64, storage: 500, vms: 20 },
      idleTimeoutMin: 90,
    },
    {
      id: 'u-mbrown',
      name: 'Prof. Michael Brown',
      email: 'michael.brown@example.edu',
      role: 'instructor',
      staffId: 'INS-0102',
      title: 'Professor of Network Engineering',
      cohorts: ['SEC-301'],
      status: 'active',
      passwordHash: DEFAULT_SEED_HASH,
      mustChangePassword: false,
      lastLogin: new Date(Date.now() - 1000 * 60 * 300).toISOString(),
      quota: { vcpu: 32, ram: 64, storage: 500, vms: 20 },
      idleTimeoutMin: 90,
    },
    {
      id: 'u-jdoe',
      name: 'John Doe',
      email: 'john.doe@example.edu',
      role: 'student',
      studentId: 'STU-0001',
      nim: 'STU-0001',
      cohort: 'CS-401',
      cohorts: ['CS-401'],
      status: 'active',
      passwordHash: DEFAULT_SEED_HASH,
      mustChangePassword: false,
      lastLogin: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      quota: { vcpu: 8, ram: 16, storage: 150, vms: 4 },
      idleTimeoutMin: 60,
      maxSelfServiceVms: 3,
    },
    {
      id: 'u-jsmith',
      name: 'Jane Smith',
      email: 'jane.smith@example.edu',
      role: 'student',
      studentId: 'STU-0002',
      nim: 'STU-0002',
      cohort: 'CS-401',
      cohorts: ['CS-401'],
      status: 'active',
      passwordHash: DEFAULT_SEED_HASH,
      mustChangePassword: false,
      lastLogin: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      quota: { vcpu: 8, ram: 16, storage: 150, vms: 4 },
      idleTimeoutMin: 60,
      maxSelfServiceVms: 3,
    },
    {
      id: 'u-edavis',
      name: 'Emily Davis',
      email: 'emily.davis@example.edu',
      role: 'student',
      studentId: 'STU-0003',
      nim: 'STU-0003',
      cohort: 'CS-401',
      cohorts: ['CS-401'],
      status: 'active',
      passwordHash: DEFAULT_SEED_HASH,
      mustChangePassword: false,
      lastLogin: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
      quota: { vcpu: 8, ram: 16, storage: 150, vms: 4 },
      idleTimeoutMin: 60,
      maxSelfServiceVms: 3,
    },
    {
      id: 'u-mwilson',
      name: 'Michael Wilson',
      email: 'michael.wilson@example.edu',
      role: 'student',
      studentId: 'STU-0004',
      nim: 'STU-0004',
      cohort: 'CS-401',
      cohorts: ['CS-401'],
      status: 'active',
      passwordHash: DEFAULT_SEED_HASH,
      mustChangePassword: false,
      lastLogin: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
      quota: { vcpu: 8, ram: 16, storage: 150, vms: 4 },
      idleTimeoutMin: 60,
      maxSelfServiceVms: 3,
    },
    {
      id: 'u-smartinez',
      name: 'Sophia Martinez',
      email: 'sophia.martinez@example.edu',
      role: 'student',
      studentId: 'STU-0005',
      nim: 'STU-0005',
      cohort: 'CS-401',
      cohorts: ['CS-401'],
      status: 'active',
      passwordHash: DEFAULT_SEED_HASH,
      mustChangePassword: false,
      lastLogin: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
      quota: { vcpu: 8, ram: 16, storage: 150, vms: 4 },
      idleTimeoutMin: 60,
      maxSelfServiceVms: 3,
    },
    {
      id: 'u-ethomas',
      name: 'Emma Thomas',
      email: 'emma.thomas@example.edu',
      role: 'student',
      studentId: 'STU-0011',
      nim: 'STU-0011',
      cohort: 'SEC-301',
      cohorts: ['SEC-301'],
      status: 'pending',
      passwordHash: DEFAULT_SEED_HASH,
      mustChangePassword: true,
      lastLogin: null,
      quota: { vcpu: 8, ram: 16, storage: 150, vms: 4 },
      idleTimeoutMin: 60,
      maxSelfServiceVms: 3,
    },
  ];
}

/**
 * Demo seed VMs: ONLY loaded when DEMO_MODE=true.
 * Real mode (DEMO_MODE=false) never seeds fake running VMs.
 */
function createDemoSeedVms(): DemoVm[] {
  const defaultHost = process.env.GUAC_DEFAULT_HOST || 'kali-lab-01';
  const now = new Date().toISOString();
  const startedAt = new Date(Date.now() - 1000 * 60 * 18).toISOString();
  return [
    {
      id: 'vm-1',
      name: 'kali-lab-01',
      os: 'kali',
      image: 'kasmweb/kali-rolling-desktop:1.15.0',
      vcpu: 2,
      ram: 4,
      disk: 30,
      ip: '10.10.1.5',
      vpc: 'vpc-cs401-01',
      status: 'running',
      idleSeconds: 3420,
      owner: 'u-jdoe',
      tenant: 'CS-401',
      rdpHost: defaultHost,
      createdAt: now,
      startedAt,
      idleTimeoutMin: 60,
    },
    {
      id: 'vm-2',
      name: 'parrot-sec-01',
      os: 'parrot',
      image: 'parrotsec/security:latest',
      vcpu: 2,
      ram: 4,
      disk: 30,
      ip: '10.10.1.8',
      vpc: 'vpc-cs401-01',
      status: 'stopped',
      idleSeconds: 3600,
      owner: 'u-jdoe',
      tenant: 'CS-401',
      rdpHost: defaultHost,
      createdAt: now,
      startedAt: null,
      idleTimeoutMin: 60,
    },
    {
      id: 'vm-3',
      name: 'kali-web-02',
      os: 'kali',
      image: 'kasmweb/kali-rolling-desktop:1.15.0',
      vcpu: 2,
      ram: 4,
      disk: 30,
      ip: '10.10.1.12',
      vpc: 'vpc-cs401-02',
      status: 'running',
      idleSeconds: 1210,
      owner: 'u-jsmith',
      tenant: 'CS-401',
      rdpHost: defaultHost,
      createdAt: now,
      startedAt,
      idleTimeoutMin: 60,
    },
    {
      id: 'vm-5',
      name: 'kali-docker-01',
      os: 'kali',
      image: 'kasmweb/kali-rolling-desktop:1.15.0',
      vcpu: 2,
      ram: 4,
      disk: 30,
      ip: '10.10.1.15',
      vpc: 'vpc-cs401-02',
      status: 'stopped',
      idleSeconds: 3600,
      owner: 'u-jsmith',
      tenant: 'CS-401',
      rdpHost: defaultHost,
      createdAt: now,
      startedAt: null,
      idleTimeoutMin: 60,
    },
    {
      id: 'vm-9',
      name: 'kali-ctf-01',
      os: 'kali',
      image: 'kasmweb/kali-rolling-desktop:1.15.0',
      vcpu: 2,
      ram: 4,
      disk: 30,
      ip: '10.10.1.23',
      vpc: 'vpc-cs401-03',
      status: 'running',
      idleSeconds: 840,
      owner: 'u-edavis',
      tenant: 'CS-401',
      rdpHost: defaultHost,
      createdAt: now,
      startedAt,
      idleTimeoutMin: 60,
    },
    {
      id: 'vm-10',
      name: 'kali-wifi-01',
      os: 'kali',
      image: 'kasmweb/kali-rolling-desktop:1.15.0',
      vcpu: 2,
      ram: 4,
      disk: 30,
      ip: '10.10.1.31',
      vpc: 'vpc-cs401-04',
      status: 'running',
      idleSeconds: 1540,
      owner: 'u-mwilson',
      tenant: 'CS-401',
      rdpHost: defaultHost,
      createdAt: now,
      startedAt,
      idleTimeoutMin: 60,
    },
  ];
}

function getVmStoreFilePath(): string | null {
  if (isServerDemoMode()) return null;
  if (process.env.PTAAS_VM_STORE_PATH === 'memory') return null;
  return process.env.PTAAS_VM_STORE_PATH || path.join(process.cwd(), '.data', 'vms.json');
}

function loadRealVmRecordsFromDisk(): VmMetadataRecord[] {
  const filePath = getVmStoreFilePath();
  if (!filePath) return [];
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Strip any legacy runtime status field if present on disk
    return parsed.map((item) => {
      const {
        status: _s,
        idleSeconds: _i,
        startedAt: _st,
        ...meta
      } = item as Record<string, unknown>;
      void _s;
      void _i;
      void _st;
      return meta as unknown as VmMetadataRecord;
    });
  } catch {
    return [];
  }
}

function persistRealVmRecordsToDisk(records: VmMetadataRecord[]): void {
  const filePath = getVmStoreFilePath();
  if (!filePath) return;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    // Store metadata only, never runtime status
    fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf8');
  } catch {
    // Ignore disk write errors in read-only environments
  }
}

export interface SystemPolicies {
  maxSelfServiceVms: number;
  hardCapVms: number;
  grantValidityDays: number;
  autoProvisionOnApproval: boolean;
  maxTotalVms: number;
  maxRunningVms: number;
  maxConcurrentCreations: number;
  hostMemoryReserveMb: number;
  hostDiskReserveGb: number;
}

export interface ServerAuditEntry {
  id: string;
  time: string;
  action: string;
  actor: string;
  tenant: string;
  target: string;
  image?: string;
  spec?: string;
  result: 'SUCCESS' | 'FAILED' | 'BLOCKED';
  detail?: string;
}

interface ServerStore {
  users: StoredUser[];
  /** Authoritative metadata-only VM records for real mode (never holds runtime status). */
  vmRecords: VmMetadataRecord[];
  /** Demo-mode simulated VMs (strictly isolated to DEMO_MODE=true). */
  demoVms: DemoVm[];
  policies: SystemPolicies;
  audit: ServerAuditEntry[];
}

const globalForStore = globalThis as unknown as { __ptaasServerStore?: ServerStore };

function createDefaultPolicies(): SystemPolicies {
  return {
    maxSelfServiceVms: Number.parseInt(process.env.MAX_SELF_SERVICE_VMS || '3', 10) || 3,
    hardCapVms: Number.parseInt(process.env.HARD_CAP_VMS || '6', 10) || 6,
    grantValidityDays: 7,
    autoProvisionOnApproval: true,
    maxTotalVms: Number.parseInt(process.env.MAX_TOTAL_VMS || '40', 10) || 40,
    maxRunningVms: Number.parseInt(process.env.MAX_RUNNING_VMS || '20', 10) || 20,
    maxConcurrentCreations: Number.parseInt(process.env.MAX_CONCURRENT_CREATIONS || '2', 10) || 2,
    hostMemoryReserveMb: Number.parseInt(process.env.HOST_MEMORY_RESERVE_MB || '512', 10) || 512,
    hostDiskReserveGb: Number.parseInt(process.env.HOST_DISK_RESERVE_GB || '2', 10) || 2,
  };
}

function getStore(): ServerStore {
  if (!globalForStore.__ptaasServerStore) {
    globalForStore.__ptaasServerStore = {
      users: createInitialUsers(),
      vmRecords: loadRealVmRecordsFromDisk(),
      demoVms: createDemoSeedVms(),
      policies: createDefaultPolicies(),
      audit: [],
    };
  }
  return globalForStore.__ptaasServerStore;
}

export function getSystemPolicies(): SystemPolicies {
  return { ...getStore().policies };
}

export function updateSystemPolicies(updates: Partial<SystemPolicies>): SystemPolicies {
  const p = getStore().policies;
  if (typeof updates.maxSelfServiceVms === 'number' && updates.maxSelfServiceVms >= 1) {
    p.maxSelfServiceVms = Math.min(20, Math.round(updates.maxSelfServiceVms));
  }
  if (typeof updates.hardCapVms === 'number' && updates.hardCapVms >= 1) {
    p.hardCapVms = Math.min(50, Math.round(updates.hardCapVms));
  }
  if (typeof updates.grantValidityDays === 'number' && updates.grantValidityDays >= 1) {
    p.grantValidityDays = Math.min(90, Math.round(updates.grantValidityDays));
  }
  if (typeof updates.autoProvisionOnApproval === 'boolean') {
    p.autoProvisionOnApproval = updates.autoProvisionOnApproval;
  }
  if (typeof updates.maxTotalVms === 'number' && updates.maxTotalVms >= 1) {
    p.maxTotalVms = Math.min(500, Math.round(updates.maxTotalVms));
  }
  if (typeof updates.maxRunningVms === 'number' && updates.maxRunningVms >= 1) {
    p.maxRunningVms = Math.min(500, Math.round(updates.maxRunningVms));
  }
  if (typeof updates.maxConcurrentCreations === 'number' && updates.maxConcurrentCreations >= 1) {
    p.maxConcurrentCreations = Math.min(10, Math.round(updates.maxConcurrentCreations));
  }
  if (typeof updates.hostMemoryReserveMb === 'number' && updates.hostMemoryReserveMb >= 0) {
    p.hostMemoryReserveMb = Math.round(updates.hostMemoryReserveMb);
  }
  if (typeof updates.hostDiskReserveGb === 'number' && updates.hostDiskReserveGb >= 0) {
    p.hostDiskReserveGb = Math.round(updates.hostDiskReserveGb);
  }
  return { ...p };
}

export function recordServerAudit(
  entry: Omit<ServerAuditEntry, 'id' | 'time'>
): ServerAuditEntry {
  const full: ServerAuditEntry = {
    id: `aud-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    time: new Date().toISOString(),
    ...entry,
  };
  const audit = getStore().audit;
  audit.unshift(full);
  if (audit.length > 500) audit.pop();
  return full;
}

export function listServerAudit(limit = 100): ServerAuditEntry[] {
  return getStore().audit.slice(0, limit);
}

export function listAllUsers(): StoredUser[] {
  return getStore().users;
}

export function findUserById(id: string): StoredUser | undefined {
  return getStore().users.find((u) => u.id === id);
}

export function findUserByIdentifier(identifier: string): StoredUser | undefined {
  const needle = identifier.trim().toLowerCase();
  if (!needle) return undefined;
  return getStore().users.find(
    (u) =>
      u.email.toLowerCase() === needle ||
      u.id.toLowerCase() === needle ||
      u.nim?.toLowerCase() === needle ||
      u.studentId?.toLowerCase() === needle
  );
}

export function createStoredUser(input: {
  name: string;
  email: string;
  role?: UserRole;
  idNum?: string;
  cohort?: string;
  password?: string;
  mustChangePassword?: boolean;
  status?: UserStatus;
  quota?: UserQuota;
  idleTimeoutMin?: number;
}): { user: StoredUser; plainPassword: string } {
  const store = getStore();
  const normalizedEmail = input.email.trim().toLowerCase();
  if (store.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
    throw new Error('A user with this email already exists');
  }

  const plainPassword =
    input.password && input.password.trim().length > 0
      ? input.password.trim()
      : `PTaaS-${crypto.randomBytes(4).toString('hex')}!`;

  const role: UserRole = input.role || 'student';
  const cohort = input.cohort || 'CS-401';

  const newUser: StoredUser = {
    id: `u-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name: input.name.trim(),
    email: normalizedEmail,
    role,
    studentId: role === 'student' ? input.idNum || undefined : undefined,
    nim: role === 'student' ? input.idNum || undefined : undefined,
    staffId: role !== 'student' ? input.idNum || undefined : undefined,
    cohort: role === 'student' ? cohort : undefined,
    cohorts: role === 'admin' ? ['CS-401', 'CS-402', 'SEC-301'] : cohort ? [cohort] : [],
    status: input.status || 'active',
    passwordHash: hashPassword(plainPassword),
    mustChangePassword: input.mustChangePassword ?? false,
    lastLogin: null,
    quota: input.quota || { vcpu: 8, ram: 16, storage: 150, vms: 4 },
    idleTimeoutMin: input.idleTimeoutMin || 60,
    maxSelfServiceVms: 3,
  };

  store.users.push(newUser);
  return { user: newUser, plainPassword };
}

export function updateStoredUser(
  id: string,
  updates: Partial<{
    name: string;
    email: string;
    role: UserRole;
    cohort: string;
    status: UserStatus;
    password: string;
    mustChangePassword: boolean;
    maxSelfServiceVms: number;
    quota: UserQuota;
    idleTimeoutMin: number;
  }>
): StoredUser {
  const store = getStore();
  const user = store.users.find((u) => u.id === id);
  if (!user) throw new Error('User not found');

  if (updates.email) {
    const nextEmail = updates.email.trim().toLowerCase();
    const conflict = store.users.find((u) => u.id !== id && u.email.toLowerCase() === nextEmail);
    if (conflict) throw new Error('Email is already in use');
    user.email = nextEmail;
  }
  if (typeof updates.name === 'string' && updates.name.trim()) {
    user.name = updates.name.trim();
  }
  if (updates.role) {
    user.role = updates.role;
    if (updates.role === 'admin') {
      user.cohorts = ['CS-401', 'CS-402', 'SEC-301'];
    }
  }
  if (typeof updates.cohort === 'string') {
    user.cohort = updates.cohort;
    if (user.role !== 'admin') {
      user.cohorts = updates.cohort ? [updates.cohort] : [];
    }
  }
  if (updates.status) {
    user.status = updates.status;
  }
  if (typeof updates.password === 'string' && updates.password.length > 0) {
    user.passwordHash = hashPassword(updates.password);
  }
  if (typeof updates.mustChangePassword === 'boolean') {
    user.mustChangePassword = updates.mustChangePassword;
  }
  if (typeof updates.maxSelfServiceVms === 'number') {
    user.maxSelfServiceVms = updates.maxSelfServiceVms;
  }
  if (updates.quota) {
    user.quota = updates.quota;
  }
  if (typeof updates.idleTimeoutMin === 'number') {
    user.idleTimeoutMin = updates.idleTimeoutMin;
  }

  return user;
}

export function deleteStoredUser(id: string): boolean {
  const store = getStore();
  const idx = store.users.findIndex((u) => u.id === id);
  if (idx === -1) return false;
  store.users.splice(idx, 1);
  return true;
}

// --- Real-mode VM Metadata Store (NO runtime status persisted) ---

export function listVmRecords(): VmMetadataRecord[] {
  return getStore().vmRecords;
}

export function reloadVmRecordsFromDisk(): VmMetadataRecord[] {
  const store = getStore();
  store.vmRecords = loadRealVmRecordsFromDisk();
  return store.vmRecords;
}

export function findVmRecordById(id: string): VmMetadataRecord | undefined {
  return getStore().vmRecords.find((v) => v.id === id);
}

export function findVmRecordByIdOrName(idOrName: string): VmMetadataRecord | undefined {
  const needle = idOrName.trim().toLowerCase();
  if (isServerDemoMode()) {
    return getStore().demoVms.find(
      (v) => v.id.toLowerCase() === needle || v.name.toLowerCase() === needle
    );
  }
  return getStore().vmRecords.find(
    (v) => v.id.toLowerCase() === needle || v.name.toLowerCase() === needle
  );
}

export function createVmMetadataRecord(input: {
  id?: string;
  name: string;
  os?: 'kali' | 'parrot' | 'ubuntu';
  catalogId?: string;
  image: string;
  containerName: string;
  volumeName: string;
  networkName: string;
  vcpu: number;
  ram: number;
  disk: number;
  vpc?: string;
  owner: string;
  tenant: string;
  rdpHost?: string;
  rdpPort?: number;
  sshPort?: number;
  vncPort?: number;
  protocol?: string;
  idleTimeoutMin?: number;
  restartPolicy?: string;
  passwordEnc?: string;
}): VmMetadataRecord {
  const store = getStore();
  const safeName =
    input.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || `kali-lab-${crypto.randomBytes(3).toString('hex')}`;

  const id = input.id || crypto.randomUUID();

  const record: VmMetadataRecord = {
    id,
    name: safeName,
    os: input.os || 'kali',
    catalogId: input.catalogId || 'kali-2024.3',
    image: input.image,
    containerName: input.containerName,
    volumeName: input.volumeName,
    networkName: input.networkName,
    vcpu: Math.min(8, Math.max(1, Number(input.vcpu) || 2)),
    ram: Math.min(16, Math.max(1, Number(input.ram) || 4)),
    disk: Math.min(100, Math.max(20, Number(input.disk) || 30)),
    ip: '',
    vpc: input.vpc || input.networkName,
    owner: input.owner,
    tenant: input.tenant || 'CS-401',
    rdpHost: input.rdpHost || input.containerName,
    rdpPort: input.rdpPort ?? 3389,
    sshPort: input.sshPort ?? 2222,
    vncPort: input.vncPort ?? 5901,
    protocol: input.protocol || 'rdp',
    createdAt: new Date().toISOString(),
    idleTimeoutMin: input.idleTimeoutMin ?? findUserById(input.owner)?.idleTimeoutMin ?? 60,
    restartPolicy: input.restartPolicy || 'unless-stopped',
    passwordEnc: input.passwordEnc,
  };

  store.vmRecords.push(record);
  persistRealVmRecordsToDisk(store.vmRecords);
  return record;
}

export function updateVmMetadataIp(id: string, ip: string): void {
  const store = getStore();
  const rec = store.vmRecords.find((v) => v.id === id);
  if (!rec || !ip) return;
  rec.ip = ip;
  rec.rdpHost = ip;
  persistRealVmRecordsToDisk(store.vmRecords);
}

export function deleteVmMetadataRecord(id: string): boolean {
  const store = getStore();
  const idx = store.vmRecords.findIndex((v) => v.id === id);
  if (idx === -1) return false;
  store.vmRecords.splice(idx, 1);
  persistRealVmRecordsToDisk(store.vmRecords);
  return true;
}

// --- Demo-mode VM Store (strictly DEMO_MODE=true) ---

export function listDemoVms(): DemoVm[] {
  return getStore().demoVms;
}

export function createDemoVm(input: {
  name: string;
  os?: 'kali' | 'parrot' | 'ubuntu';
  vcpu: number;
  ram: number;
  disk: number;
  vpc?: string;
  owner: string;
  tenant: string;
  rdpHost?: string;
}): DemoVm {
  const store = getStore();
  const safeName =
    input.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || `kali-lab-${Date.now().toString().slice(-4)}`;

  const now = new Date().toISOString();
  const vm: DemoVm = {
    id: `vm-${Date.now()}`,
    name: safeName,
    os: input.os || 'kali',
    image: 'kasmweb/kali-rolling-desktop:1.15.0',
    vcpu: Math.min(8, Math.max(1, Number(input.vcpu) || 2)),
    ram: Math.min(16, Math.max(2, Number(input.ram) || 4)),
    disk: Math.min(100, Math.max(20, Number(input.disk) || 30)),
    ip: `10.10.1.${40 + store.demoVms.length}`,
    vpc: input.vpc || 'vpc-cs401-01',
    status: 'running',
    idleSeconds: 3600,
    owner: input.owner,
    tenant: input.tenant || 'CS-401',
    rdpHost: input.rdpHost || process.env.GUAC_DEFAULT_HOST || 'kali-lab-01',
    createdAt: now,
    startedAt: now,
    idleTimeoutMin: 60,
  };
  store.demoVms.push(vm);
  return vm;
}

export function deleteDemoVm(id: string): boolean {
  const store = getStore();
  const idx = store.demoVms.findIndex((v) => v.id === id);
  if (idx === -1) return false;
  store.demoVms.splice(idx, 1);
  return true;
}
