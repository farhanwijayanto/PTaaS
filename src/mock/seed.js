// Centralized source of truth for demo seed identities, cohorts, VMs, lab targets, and audit log.
// Strictly RFC 2606 compliant: ONLY @example.com, @example.org, @example.edu.
// Fictional phone numbers (+1 555 01xx) and private RFC 1918 / RFC 5737 doc IP ranges only.

export const cohorts = [
  {
    id: 'CS-401',
    name: 'Acme University - CS-401 (Cyber Security Lab A)',
    instructor: 'u-sjohnson',
    studentCount: 5,
    defaultQuota: { vcpu: 8, ram: 16, storage: 150, vms: 4 }
  },
  {
    id: 'CS-402',
    name: 'Acme University - CS-402 (Advanced Pentesting)',
    instructor: 'u-sjohnson',
    studentCount: 5,
    defaultQuota: { vcpu: 8, ram: 16, storage: 150, vms: 4 }
  },
  {
    id: 'SEC-301',
    name: 'Acme University - SEC-301 (Network Security & Forensics)',
    instructor: 'u-mbrown',
    studentCount: 5,
    defaultQuota: { vcpu: 8, ram: 16, storage: 150, vms: 4 }
  }
];

export const users = [
  // System Administrator
  {
    id: 'u-admin',
    name: 'Alex Morgan',
    email: 'admin@example.com',
    role: 'admin',
    staffId: 'ADM-0001',
    title: 'System Administrator',
    cohorts: [],
    status: 'active',
    passwordHash: '165ef623ce7fa6810f3897eb609750e2be59aa19dbd403c45123ceac04859996',
    mustChangePassword: false,
    lastLogin: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    quota: { vcpu: 64, ram: 128, storage: 1000, vms: 40 },
    idleTimeoutMin: 120
  },

  // Instructors
  {
    id: 'u-sjohnson',
    name: 'Dr. Sarah Johnson',
    email: 'sarah.johnson@example.edu',
    role: 'instructor',
    staffId: 'INS-0101',
    title: 'Associate Professor of Computer Science',
    cohorts: ['CS-401', 'CS-402'],
    status: 'active',
    passwordHash: '165ef623ce7fa6810f3897eb609750e2be59aa19dbd403c45123ceac04859996',
    mustChangePassword: false,
    lastLogin: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    quota: { vcpu: 32, ram: 64, storage: 500, vms: 20 },
    idleTimeoutMin: 90
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
    passwordHash: '165ef623ce7fa6810f3897eb609750e2be59aa19dbd403c45123ceac04859996',
    mustChangePassword: false,
    lastLogin: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    quota: { vcpu: 32, ram: 64, storage: 500, vms: 20 },
    idleTimeoutMin: 90
  },

  // Students - Cohort CS-401 (Default demo persona: John Doe)
  {
    id: 'u-jdoe',
    name: 'John Doe',
    email: 'john.doe@example.edu',
    role: 'student',
    studentId: 'STU-0001',
    cohort: 'CS-401',
    status: 'active',
    passwordHash: '165ef623ce7fa6810f3897eb609750e2be59aa19dbd403c45123ceac04859996',
    mustChangePassword: false,
    lastLogin: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    quota: { vcpu: 8, ram: 16, storage: 150, vms: 4 },
    idleTimeoutMin: 60
  },
  {
    id: 'u-jsmith',
    name: 'Jane Smith',
    email: 'jane.smith@example.edu',
    role: 'student',
    studentId: 'STU-0002',
    cohort: 'CS-401',
    status: 'active',
    passwordHash: '165ef623ce7fa6810f3897eb609750e2be59aa19dbd403c45123ceac04859996',
    mustChangePassword: false,
    lastLogin: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    quota: { vcpu: 8, ram: 16, storage: 150, vms: 4 },
    idleTimeoutMin: 60
  },
  {
    id: 'u-edavis',
    name: 'Emily Davis',
    email: 'emily.davis@example.edu',
    role: 'student',
    studentId: 'STU-0003',
    cohort: 'CS-401',
    status: 'active',
    passwordHash: '165ef623ce7fa6810f3897eb609750e2be59aa19dbd403c45123ceac04859996',
    mustChangePassword: false,
    lastLogin: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    quota: { vcpu: 8, ram: 16, storage: 150, vms: 4 },
    idleTimeoutMin: 60
  },
  {
    id: 'u-mwilson',
    name: 'Michael Wilson',
    email: 'michael.wilson@example.edu',
    role: 'student',
    studentId: 'STU-0004',
    cohort: 'CS-401',
    status: 'active',
    passwordHash: '165ef623ce7fa6810f3897eb609750e2be59aa19dbd403c45123ceac04859996',
    mustChangePassword: false,
    lastLogin: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    quota: { vcpu: 8, ram: 16, storage: 150, vms: 4 },
    idleTimeoutMin: 60
  },
  {
    id: 'u-smartinez',
    name: 'Sophia Martinez',
    email: 'sophia.martinez@example.edu',
    role: 'student',
    studentId: 'STU-0005',
    cohort: 'CS-401',
    status: 'active',
    passwordHash: '165ef623ce7fa6810f3897eb609750e2be59aa19dbd403c45123ceac04859996',
    mustChangePassword: false,
    lastLogin: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
    quota: { vcpu: 8, ram: 16, storage: 150, vms: 4 },
    idleTimeoutMin: 60
  },

  // Students - Cohort CS-402
  {
    id: 'u-dlee',
    name: 'David Lee',
    email: 'david.lee@example.edu',
    role: 'student',
    studentId: 'STU-0006',
    cohort: 'CS-402',
    status: 'active',
    passwordHash: '165ef623ce7fa6810f3897eb609750e2be59aa19dbd403c45123ceac04859996',
    mustChangePassword: false,
    lastLogin: new Date(Date.now() - 1000 * 60 * 300).toISOString(),
    quota: { vcpu: 8, ram: 16, storage: 150, vms: 4 },
    idleTimeoutMin: 60
  },
  {
    id: 'u-otaylor',
    name: 'Olivia Taylor',
    email: 'olivia.taylor@example.edu',
    role: 'student',
    studentId: 'STU-0007',
    cohort: 'CS-402',
    status: 'active',
    passwordHash: '165ef623ce7fa6810f3897eb609750e2be59aa19dbd403c45123ceac04859996',
    mustChangePassword: false,
    lastLogin: new Date(Date.now() - 1000 * 60 * 350).toISOString(),
    quota: { vcpu: 8, ram: 16, storage: 150, vms: 4 },
    idleTimeoutMin: 60
  },
  {
    id: 'u-danderson',
    name: 'Daniel Anderson',
    email: 'daniel.anderson@example.edu',
    role: 'student',
    studentId: 'STU-0008',
    cohort: 'CS-402',
    status: 'active',
    passwordHash: '165ef623ce7fa6810f3897eb609750e2be59aa19dbd403c45123ceac04859996',
    mustChangePassword: false,
    lastLogin: new Date(Date.now() - 1000 * 60 * 400).toISOString(),
    quota: { vcpu: 8, ram: 16, storage: 150, vms: 4 },
    idleTimeoutMin: 60
  },
  {
    id: 'u-ethomas',
    name: 'Emma Thomas',
    email: 'emma.thomas@example.edu',
    role: 'student',
    studentId: 'STU-0009',
    cohort: 'CS-402',
    status: 'pending', // Pending first login completed
    passwordHash: '165ef623ce7fa6810f3897eb609750e2be59aa19dbd403c45123ceac04859996',
    mustChangePassword: true,
    lastLogin: null,
    quota: { vcpu: 8, ram: 16, storage: 150, vms: 4 },
    idleTimeoutMin: 60
  },
  {
    id: 'u-jjackson',
    name: 'James Jackson',
    email: 'james.jackson@example.edu',
    role: 'student',
    studentId: 'STU-0010',
    cohort: 'CS-402',
    status: 'active',
    passwordHash: '165ef623ce7fa6810f3897eb609750e2be59aa19dbd403c45123ceac04859996',
    mustChangePassword: false,
    lastLogin: new Date(Date.now() - 1000 * 60 * 500).toISOString(),
    quota: { vcpu: 8, ram: 16, storage: 150, vms: 4 },
    idleTimeoutMin: 60
  },

  // Students - Cohort SEC-301
  {
    id: 'u-lharris',
    name: 'Liam Harris',
    email: 'liam.harris@example.edu',
    role: 'student',
    studentId: 'STU-0011',
    cohort: 'SEC-301',
    status: 'suspended', // Suspended account
    passwordHash: '165ef623ce7fa6810f3897eb609750e2be59aa19dbd403c45123ceac04859996',
    mustChangePassword: false,
    lastLogin: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    quota: { vcpu: 8, ram: 16, storage: 150, vms: 4 },
    idleTimeoutMin: 60
  },
  {
    id: 'u-aclark',
    name: 'Ava Clark',
    email: 'ava.clark@example.edu',
    role: 'student',
    studentId: 'STU-0012',
    cohort: 'SEC-301',
    status: 'active',
    passwordHash: '165ef623ce7fa6810f3897eb609750e2be59aa19dbd403c45123ceac04859996',
    mustChangePassword: false,
    lastLogin: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    quota: { vcpu: 8, ram: 16, storage: 150, vms: 4 },
    idleTimeoutMin: 60
  },
  {
    id: 'u-nlewis',
    name: 'Noah Lewis',
    email: 'noah.lewis@example.edu',
    role: 'student',
    studentId: 'STU-0013',
    cohort: 'SEC-301',
    status: 'pending_approval', // Pending instructor approval
    passwordHash: '165ef623ce7fa6810f3897eb609750e2be59aa19dbd403c45123ceac04859996',
    mustChangePassword: false,
    lastLogin: null,
    quota: { vcpu: 8, ram: 16, storage: 150, vms: 4 },
    idleTimeoutMin: 60
  },
  {
    id: 'u-mwalker',
    name: 'Mia Walker',
    email: 'mia.walker@example.edu',
    role: 'student',
    studentId: 'STU-0014',
    cohort: 'SEC-301',
    status: 'active',
    passwordHash: '165ef623ce7fa6810f3897eb609750e2be59aa19dbd403c45123ceac04859996',
    mustChangePassword: false,
    lastLogin: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    quota: { vcpu: 8, ram: 16, storage: 150, vms: 4 },
    idleTimeoutMin: 60
  },
  {
    id: 'u-ehall',
    name: 'Ethan Hall',
    email: 'ethan.hall@example.edu',
    role: 'student',
    studentId: 'STU-0015',
    cohort: 'SEC-301',
    status: 'active',
    passwordHash: '165ef623ce7fa6810f3897eb609750e2be59aa19dbd403c45123ceac04859996',
    mustChangePassword: false,
    lastLogin: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
    quota: { vcpu: 8, ram: 16, storage: 150, vms: 4 },
    idleTimeoutMin: 60
  }
];

export const vms = [
  // John Doe (u-jdoe) - 2 VMs (1 slot free)
  { id: 'vm-1', name: 'kali-lab-01', os: 'kali', vcpu: 2, ram: 4, disk: 30, ip: '10.10.1.5', vpc: 'vpc-cs401-01', status: 'running', idleSeconds: 3420, owner: 'u-jdoe', tenant: 'CS-401' },
  { id: 'vm-2', name: 'parrot-sec-01', os: 'parrot', vcpu: 2, ram: 4, disk: 30, ip: '10.10.1.8', vpc: 'vpc-cs401-01', status: 'running', idleSeconds: 2890, owner: 'u-jdoe', tenant: 'CS-401' },

  // Jane Smith (u-jsmith) - 3 VMs (limit reached, 1 pending request)
  { id: 'vm-3', name: 'kali-web-02', os: 'kali', vcpu: 2, ram: 4, disk: 30, ip: '10.10.1.12', vpc: 'vpc-cs401-02', status: 'running', idleSeconds: 1210, owner: 'u-jsmith', tenant: 'CS-401' },
  { id: 'vm-5', name: 'kali-docker-01', os: 'kali', vcpu: 2, ram: 4, disk: 30, ip: '10.10.1.15', vpc: 'vpc-cs401-02', status: 'running', idleSeconds: 980, owner: 'u-jsmith', tenant: 'CS-401' },
  { id: 'vm-6', name: 'ubuntu-test-01', os: 'ubuntu', vcpu: 2, ram: 4, disk: 30, ip: '10.10.1.16', vpc: 'vpc-cs401-02', status: 'stopped', idleSeconds: 3600, owner: 'u-jsmith', tenant: 'CS-401' },

  // Emily Davis (u-edavis) - 3 VMs (limit reached, 1 rejected request)
  { id: 'vm-7', name: 'parrot-lab-02', os: 'parrot', vcpu: 2, ram: 4, disk: 30, ip: '10.10.1.21', vpc: 'vpc-cs401-03', status: 'running', idleSeconds: 2100, owner: 'u-edavis', tenant: 'CS-401' },
  { id: 'vm-8', name: 'ubuntu-sec-01', os: 'ubuntu', vcpu: 2, ram: 4, disk: 30, ip: '10.10.1.22', vpc: 'vpc-cs401-03', status: 'stopped', idleSeconds: 3600, owner: 'u-edavis', tenant: 'CS-401' },
  { id: 'vm-9', name: 'kali-ctf-01', os: 'kali', vcpu: 2, ram: 4, disk: 30, ip: '10.10.1.23', vpc: 'vpc-cs401-03', status: 'running', idleSeconds: 840, owner: 'u-edavis', tenant: 'CS-401' },

  // Michael Wilson (u-mwilson) - 3 VMs (limit reached, 1 approved unused grant token)
  { id: 'vm-10', name: 'kali-wifi-01', os: 'kali', vcpu: 2, ram: 4, disk: 30, ip: '10.10.1.31', vpc: 'vpc-cs401-04', status: 'running', idleSeconds: 1540, owner: 'u-mwilson', tenant: 'CS-401' },
  { id: 'vm-11', name: 'ubuntu-audit-01', os: 'ubuntu', vcpu: 2, ram: 4, disk: 30, ip: '10.10.1.32', vpc: 'vpc-cs401-04', status: 'stopped', idleSeconds: 3600, owner: 'u-mwilson', tenant: 'CS-401' },
  { id: 'vm-12', name: 'parrot-recon-01', os: 'parrot', vcpu: 2, ram: 4, disk: 30, ip: '10.10.1.33', vpc: 'vpc-cs401-04', status: 'running', idleSeconds: 620, owner: 'u-mwilson', tenant: 'CS-401' },

  // Other cohorts
  { id: 'vm-4', name: 'ubuntu-dev-01', os: 'ubuntu', vcpu: 1, ram: 2, disk: 20, ip: '10.10.3.10', vpc: 'vpc-sec301-01', status: 'stopped', idleSeconds: 3600, owner: 'u-lharris', tenant: 'SEC-301' }
];

export const vmRequests = [
  {
    id: 'req-vm-1',
    studentId: 'u-jsmith',
    studentName: 'Jane Smith',
    studentEmail: 'jane.smith@example.edu',
    cohort: 'CS-401',
    requestedSpecs: { name: 'kali-advanced-01', os: 'kali', vcpu: 2, ram: 4, disk: 30 },
    purpose: 'Required for advanced reverse engineering lab assignment in module 4',
    durationDays: 14,
    status: 'pending',
    requestedAt: new Date(Date.now() - 3600000 * 4).toISOString(), // 4h ago (Green SLA)
    reviewedAt: null,
    reviewedBy: null,
    reviewerName: null,
    reviewNote: null,
    approvalExpiresAt: null,
    grantId: null,
    idempotencyKey: 'idemp-req-1'
  },
  {
    id: 'req-vm-2',
    studentId: 'u-edavis',
    studentName: 'Emily Davis',
    studentEmail: 'emily.davis@example.edu',
    cohort: 'CS-401',
    requestedSpecs: { name: 'kali-gpu-crack', os: 'kali', vcpu: 4, ram: 8, disk: 50 },
    purpose: 'Password cracking lab target with hashcat GPU',
    durationDays: 7,
    status: 'rejected',
    requestedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    reviewedAt: new Date(Date.now() - 86400000).toISOString(),
    reviewedBy: 'u-sjohnson',
    reviewerName: 'Dr. Sarah Johnson',
    reviewNote: 'GPU acceleration is reserved for capstone projects. Please complete module 3 assignments first.',
    approvalExpiresAt: null,
    grantId: null,
    idempotencyKey: 'idemp-req-2'
  },
  {
    id: 'req-vm-3',
    studentId: 'u-mwilson',
    studentName: 'Michael Wilson',
    studentEmail: 'michael.wilson@example.edu',
    cohort: 'CS-401',
    requestedSpecs: { name: 'ubuntu-forensics-01', os: 'ubuntu', vcpu: 2, ram: 4, disk: 30 },
    approvedSpecs: { vcpu: 2, ram: 4, disk: 30 },
    purpose: 'Network forensics memory dump analysis for midterm lab',
    durationDays: 14,
    status: 'approved',
    requestedAt: new Date(Date.now() - 3600000 * 18).toISOString(),
    reviewedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    reviewedBy: 'u-sjohnson',
    reviewerName: 'Dr. Sarah Johnson',
    reviewNote: 'Approved for forensics research assignment.',
    grantId: 'grant_mwilson_7b29f',
    approvalExpiresAt: new Date(Date.now() + 86400000 * 5).toISOString(),
    idempotencyKey: 'idemp-req-3'
  }
];

export const policies = {
  maxSelfServiceVms: 3,
  hardCapVms: 6,
  grantValidityDays: 7,
  autoProvisionOnApproval: true
};

export const targets = [
  { id: 'tgt-1', name: 'dvwa-lab', ip: '10.10.2.10', os: 'Linux / Apache', desc: 'Damn Vulnerable Web App 2.0', status: 'ready' },
  { id: 'tgt-2', name: 'metasploitable-01', ip: '10.10.2.20', os: 'Linux 2.6', desc: 'Metasploitable 2 Vulnerable Target', status: 'ready' },
  { id: 'tgt-3', name: 'juice-shop-01', ip: '10.10.2.30', os: 'Node.js', desc: 'OWASP Juice Shop Modern Target', status: 'ready' }
];

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();

export const auditEvents = [
  { id: 'a-1', time: ago(3), actor: 'john.doe@example.edu', action: 'VM_START', target: 'kali-lab-01', ip: '192.0.2.104', status: 'SUCCESS' },
  { id: 'a-2', time: ago(9), actor: 'john.doe@example.edu', action: 'MFA_AUTH', target: 'Keycloak TOTP', ip: '192.0.2.104', status: 'SUCCESS' },
  { id: 'a-3', time: ago(26), actor: 'egress-filter', action: 'OUTBOUND_DROP', target: '8.8.8.8:53', ip: '10.10.1.5', status: 'BLOCKED' },
  { id: 'a-4', time: ago(41), actor: 'ovs-bridge', action: 'INTER_TENANT_BLOCK', target: '10.10.3.10', ip: '10.10.1.5', status: 'BLOCKED' },
  { id: 'a-5', time: ago(95), actor: 'jane.smith@example.edu', action: 'VM_START', target: 'kali-web-02', ip: '192.0.2.131', status: 'SUCCESS' },
  { id: 'a-6', time: ago(140), actor: 'sarah.johnson@example.edu', action: 'USER_APPROVE', target: 'sophia.martinez@example.edu', ip: '198.51.100.22', status: 'SUCCESS' },
  { id: 'a-7', time: ago(210), actor: 'admin@example.com', action: 'COHORT_CREATE', target: 'CS-402', ip: '203.0.113.15', status: 'SUCCESS' }
];

// Deterministic faker-like generator for bulk students pagination / load testing
export function generateBulkStudents(count = 200, seed = 42) {
  const firstNames = [
    'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda',
    'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
    'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Nancy', 'Daniel', 'Lisa',
    'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra', 'Donald', 'Ashley'
  ];
  const lastNames = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
    'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas',
    'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White'
  ];
  const cohortIds = ['CS-401', 'CS-402', 'SEC-301'];

  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

  const generated = [];
  for (let i = 1; i <= count; i++) {
    const fn = firstNames[Math.floor(rnd() * firstNames.length)];
    const ln = lastNames[Math.floor(rnd() * lastNames.length)];
    const idNum = String(1000 + i).padStart(4, '0');
    const studentId = `STU-${idNum}`;
    const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${i > 50 ? i : ''}@example.edu`;
    const cohort = cohortIds[Math.floor(rnd() * cohortIds.length)];
    const statusRand = rnd();
    const status = statusRand < 0.85 ? 'active' : statusRand < 0.93 ? 'pending' : 'suspended';

    generated.push({
      id: `u-bulk-${i}`,
      name: `${fn} ${ln}`,
      email,
      role: 'student',
      studentId,
      cohort,
      status,
      passwordHash: '165ef623ce7fa6810f3897eb609750e2be59aa19dbd403c45123ceac04859996',
      mustChangePassword: status === 'pending',
      lastLogin: status === 'active' ? new Date(Date.now() - Math.floor(rnd() * 86400000 * 7)).toISOString() : null,
      quota: { vcpu: 8, ram: 16, storage: 150, vms: 4 },
      idleTimeoutMin: 60
    });
  }
  return generated;
}

export const userById = (id) => users.find((u) => u.id === id) || null;
export const userByEmail = (email) => users.find((u) => u.email.toLowerCase() === email?.toLowerCase().trim()) || null;
