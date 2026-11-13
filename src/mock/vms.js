import { vms as seedVms, vmRequests as seedRequests, policies as seedPolicies } from './seed.js';

export const OS = {
  kali: { label: 'Kali Linux 2024.3', mono: 'K' },
  parrot: { label: 'Parrot Security 6.1', mono: 'P' },
  ubuntu: { label: 'Ubuntu 24.04 LTS', mono: 'U' }
};

// Mutable in-memory "database". api.js is the only thing that should touch it.
export const vmDb = seedVms.map((v) => ({ ...v }));
export const vmRequestDb = seedRequests.map((r) => ({ ...r }));
export const policyDb = { ...seedPolicies };
export const userVmLimitDb = new Map();
