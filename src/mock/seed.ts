// Type definitions and re-export of central seed identities
export interface Quota {
  vcpu: number;
  ram: number;
  storage: number;
  vms: number;
}

export type UserRole = 'admin' | 'instructor' | 'student';
export type UserStatus = 'active' | 'pending' | 'suspended' | 'pending_approval';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  studentId?: string;
  staffId?: string;
  title?: string;
  cohort?: string;
  cohorts?: string[];
  status: UserStatus;
  passwordHash?: string;
  mustChangePassword?: boolean;
  lastLogin: string | null;
  quota: Quota;
  idleTimeoutMin: number;
}

export interface Cohort {
  id: string;
  name: string;
  instructor: string;
  studentCount: number;
  defaultQuota: Quota;
}

export interface VM {
  id: string;
  name: string;
  os: string;
  vcpu: number;
  ram: number;
  disk: number;
  ip: string;
  vpc: string;
  status: 'running' | 'stopped' | 'booting';
  idleSeconds: number;
  owner: string;
  tenant: string;
}

export interface LabTarget {
  id: string;
  name: string;
  ip: string;
  os: string;
  desc: string;
  status: string;
}

export interface AuditEvent {
  id: string;
  time: string;
  actor: string;
  action: string;
  target: string;
  ip: string;
  status: string;
}
