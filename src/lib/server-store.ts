import crypto from 'crypto';

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

export interface StoredVm {
  id: string;
  name: string;
  os: 'kali' | 'parrot' | 'ubuntu';
  vcpu: number;
  ram: number;
  disk: number;
  ip: string;
  vpc: string;
  status: 'running' | 'stopped' | 'restarting' | 'creating';
  idleSeconds: number;
  owner: string;
  tenant: string;
  rdpHost: string;
  createdAt: string;
}

const DEFAULT_SEED_HASH = '165ef623ce7fa6810f3897eb609750e2be59aa19dbd403c45123ceac04859996';

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

function createInitialVms(): StoredVm[] {
  const defaultHost = process.env.GUAC_DEFAULT_HOST || 'kali-lab-01';
  const now = new Date().toISOString();
  return [
    {
      id: 'vm-1',
      name: 'kali-lab-01',
      os: 'kali',
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
    },
    {
      id: 'vm-3',
      name: 'kali-web-02',
      os: 'kali',
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
    },
    {
      id: 'vm-5',
      name: 'kali-docker-01',
      os: 'kali',
      vcpu: 2,
      ram: 4,
      disk: 30,
      ip: '10.10.1.15',
      vpc: 'vpc-cs401-02',
      status: 'running',
      idleSeconds: 980,
      owner: 'u-jsmith',
      tenant: 'CS-401',
      rdpHost: defaultHost,
      createdAt: now,
    },
    {
      id: 'vm-9',
      name: 'kali-ctf-01',
      os: 'kali',
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
    },
    {
      id: 'vm-10',
      name: 'kali-wifi-01',
      os: 'kali',
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
    },
  ];
}

interface ServerStore {
  users: StoredUser[];
  vms: StoredVm[];
}

const globalForStore = globalThis as unknown as { __ptaasServerStore?: ServerStore };

function getStore(): ServerStore {
  if (!globalForStore.__ptaasServerStore) {
    globalForStore.__ptaasServerStore = {
      users: createInitialUsers(),
      vms: createInitialVms(),
    };
  }
  return globalForStore.__ptaasServerStore;
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

export function listAllVms(): StoredVm[] {
  return getStore().vms;
}

export function findVmByIdOrName(idOrName: string): StoredVm | undefined {
  const needle = idOrName.trim().toLowerCase();
  return getStore().vms.find(
    (v) => v.id.toLowerCase() === needle || v.name.toLowerCase() === needle
  );
}

export function createStoredVm(input: {
  name: string;
  os: 'kali';
  vcpu: number;
  ram: number;
  disk: number;
  vpc?: string;
  owner: string;
  tenant: string;
  rdpHost?: string;
}): StoredVm {
  const store = getStore();
  const safeName =
    input.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || `kali-lab-${Date.now().toString().slice(-4)}`;

  const defaultHost = process.env.GUAC_DEFAULT_HOST || 'kali-lab-01';
  const multiHost = process.env.GUAC_MULTI_HOST === 'true';

  const newVm: StoredVm = {
    id: `vm-${Date.now()}`,
    name: safeName,
    os: 'kali',
    vcpu: Math.min(8, Math.max(1, Number(input.vcpu) || 2)),
    ram: Math.min(16, Math.max(2, Number(input.ram) || 4)),
    disk: Math.min(100, Math.max(20, Number(input.disk) || 30)),
    ip: `10.10.1.${40 + store.vms.length}`,
    vpc: input.vpc || 'vpc-cs401-01',
    status: 'running',
    idleSeconds: 3600,
    owner: input.owner,
    tenant: input.tenant || 'CS-401',
    rdpHost: input.rdpHost || (multiHost ? safeName : defaultHost),
    createdAt: new Date().toISOString(),
  };

  store.vms.push(newVm);
  return newVm;
}
