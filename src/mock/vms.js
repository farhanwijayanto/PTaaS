// OS metadata + Demo-mode-only seed stores.
// Runtime VM status is NEVER stored in localStorage or seeded into real mode.
import { vmRequests as seedRequests, policies as seedPolicies } from './seed.js';

export const OS = {
  kali: { label: 'Kali Linux 2026.2', mono: 'K', available: true },
  parrot: { label: 'Parrot Security 6.1', mono: 'P', available: false },
  ubuntu: { label: 'Ubuntu 24.04 LTS', mono: 'U', available: false }
};

export const vmRequestDb = seedRequests.map((r) => ({ ...r }));
export const policyDb = { ...seedPolicies };
export const userVmLimitDb = new Map();
