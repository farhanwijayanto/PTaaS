import { vms as seedVms, vmRequests as seedRequests, policies as seedPolicies } from './seed.js';

const VM_STORAGE_KEY = 'ptaas.vms.v1';

export const OS = {
  kali: { label: 'Kali Linux 2026.2', mono: 'K', available: true },
  parrot: { label: 'Parrot Security 6.1', mono: 'P', available: false },
  ubuntu: { label: 'Ubuntu 24.04 LTS', mono: 'U', available: false }
};

function loadInitialVms() {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(VM_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch { /* ignore storage errors */ }
  }
  return seedVms.map((v) => ({ ...v }));
}

// Mutable database backed by localStorage + synced with /api/vms.
export const vmDb = loadInitialVms();
export const vmRequestDb = seedRequests.map((r) => ({ ...r }));
export const policyDb = { ...seedPolicies };
export const userVmLimitDb = new Map();

export function persistVms() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VM_STORAGE_KEY, JSON.stringify(vmDb));
  } catch { /* ignore storage errors */ }
}

export function mergeServerVms(serverVms) {
  if (!Array.isArray(serverVms) || serverVms.length === 0) return;
  for (const svm of serverVms) {
    const idx = vmDb.findIndex((v) => v.id === svm.id);
    if (idx >= 0) {
      vmDb[idx] = { ...vmDb[idx], ...svm };
    } else {
      vmDb.push({ ...svm });
    }
  }
  persistVms();
}
