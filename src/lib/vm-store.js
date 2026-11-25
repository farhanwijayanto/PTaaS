// Single shared frontend VM store fed by GET /api/vms and SSE (/api/vms/events),
// with automatic 5s polling fallback when SSE is unavailable.
// Never persists VM status in localStorage or sessionStorage.
import { useAuth } from './auth.js';
import { emit, on } from './events.js';
import { isDemoMode } from './demo-mode.js';

const POLL_FALLBACK_MS = 5000;
const BATCH_DEBOUNCE_MS = 200;

const listeners = new Set();
const pendingOps = new Map(); // vmId -> 'starting' | 'stopping'

let eventSource = null;
let pollTimer = null;
let reconnectTimer = null;
let batchTimer = null;
let started = false;
let fetchPromise = null;

let state = {
  vms: [],
  orphans: [],
  loading: true,
  initialized: false,
  error: null,
  statusUpdatedAt: null,
  statusSource: isDemoMode() ? 'demo' : 'docker',
  stale: false,
  dockerReachable: true,
  demoMode: isDemoMode(),
  dockerError: null,
  streamState: 'idle', // 'idle' | 'live' | 'reconnecting' | 'polling'
};

function applyPendingOverlays(vms) {
  if (!pendingOps.size) return vms;
  return vms.map((vm) => {
    const op = pendingOps.get(vm.id);
    if (!op) return vm;
    // Never mark a VM as 'running' optimistically before Docker confirms
    return {
      ...vm,
      status: op,
      optimistic: true,
    };
  });
}

function notifyImmediate() {
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
  const snap = getVmState();
  for (const fn of listeners) {
    try { fn(snap); } catch { /* ignore subscriber errors */ }
  }
  emit('vms:changed', snap);
}

function notifyDebounced() {
  if (batchTimer) return;
  batchTimer = setTimeout(() => {
    batchTimer = null;
    notifyImmediate();
  }, BATCH_DEBOUNCE_MS);
}

function applyServerSnapshot(payload, { immediate = false } = {}) {
  if (!payload || typeof payload !== 'object') return;
  const incomingVms = Array.isArray(payload.vms) ? payload.vms : [];
  const incomingOrphans = Array.isArray(payload.orphans) ? payload.orphans : [];

  state = {
    ...state,
    vms: incomingVms,
    orphans: incomingOrphans,
    loading: false,
    initialized: true,
    error: null,
    statusUpdatedAt: payload.statusUpdatedAt || new Date().toISOString(),
    statusSource: payload.statusSource || (payload.demoMode ? 'demo' : 'docker'),
    stale: Boolean(payload.stale),
    dockerReachable: payload.dockerReachable !== undefined ? Boolean(payload.dockerReachable) : true,
    demoMode: payload.demoMode !== undefined ? Boolean(payload.demoMode) : isDemoMode(),
    dockerError: payload.dockerError || null,
  };

  if (immediate) notifyImmediate();
  else notifyDebounced();
}

function startPollingFallback() {
  if (pollTimer) return;
  state = { ...state, streamState: eventSource ? 'reconnecting' : 'polling' };
  notifyDebounced();
  pollTimer = setInterval(() => {
    if (!useAuth().isAuthenticated) return;
    void refreshVms({ silent: true });
  }, POLL_FALLBACK_MS);
}

function stopPollingFallback() {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

function closeEventStream() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (eventSource) {
    try { eventSource.close(); } catch { /* ignore */ }
    eventSource = null;
  }
}

function connectEventStream() {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    startPollingFallback();
    return;
  }
  if (!useAuth().isAuthenticated) return;

  closeEventStream();

  try {
    const es = new EventSource('/api/vms/events', { withCredentials: true });
    eventSource = es;

    es.onopen = () => {
      stopPollingFallback();
      state = { ...state, streamState: 'live' };
      notifyImmediate();
    };

    es.addEventListener('snapshot', (e) => {
      try {
        const data = JSON.parse(e.data);
        stopPollingFallback();
        state = { ...state, streamState: 'live' };
        applyServerSnapshot(data, { immediate: false });
      } catch { /* ignore parse errors */ }
    });

    es.addEventListener('session_invalidated', (e) => {
      try {
        const data = JSON.parse(e.data);
        emit('vm:session_invalidated', data);
      } catch { /* ignore */ }
    });

    es.addEventListener('creation_progress', (e) => {
      try {
        const data = JSON.parse(e.data);
        emit('vm:creation_progress', data);
      } catch { /* ignore */ }
    });

    es.onerror = () => {
      if (eventSource !== es) return;
      state = { ...state, streamState: 'reconnecting' };
      notifyImmediate();
      startPollingFallback();
      // Browser EventSource retries automatically; if CLOSED, reconnect after 4s
      if (es.readyState === EventSource.CLOSED) {
        closeEventStream();
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          if (started && useAuth().isAuthenticated) connectEventStream();
        }, 4000);
      }
    };
  } catch {
    startPollingFallback();
  }
}

export async function refreshVms({ force = false, silent = false } = {}) {
  if (typeof window === 'undefined') return getVmState();
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    state = { ...state, vms: [], orphans: [], loading: false, initialized: false };
    notifyImmediate();
    return getVmState();
  }

  if (fetchPromise && !force) return fetchPromise;

  if (!silent && !state.initialized) {
    state = { ...state, loading: true, error: null };
    notifyImmediate();
  }

  fetchPromise = (async () => {
    try {
      const url = force ? '/api/vms?refresh=true' : '/api/vms';
      const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
      if (res.status === 401) {
        state = { ...state, vms: [], orphans: [], loading: false, initialized: true };
        notifyImmediate();
        return getVmState();
      }
      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        throw new Error(errPayload?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      applyServerSnapshot(data, { immediate: true });
      return getVmState();
    } catch (err) {
      state = {
        ...state,
        loading: false,
        initialized: true,
        error: err instanceof Error ? err.message : 'Failed to load virtual machines',
      };
      notifyImmediate();
      return getVmState();
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

export function initVmStore() {
  if (typeof window === 'undefined') return;
  if (!started) {
    started = true;
    // Purge any legacy client-side VM status cache from localStorage
    try { localStorage.removeItem('ptaas.vms.v1'); } catch { /* ignore */ }

    on('session', () => {
      if (useAuth().isAuthenticated) {
        void refreshVms({ force: true, silent: false });
        connectEventStream();
      } else {
        stopVmStore();
      }
    });
  }

  if (useAuth().isAuthenticated) {
    if (!state.initialized) {
      void refreshVms({ force: false, silent: false });
    }
    if (!eventSource) {
      connectEventStream();
    }
  }
}

export function stopVmStore() {
  closeEventStream();
  stopPollingFallback();
  pendingOps.clear();
  state = {
    vms: [],
    orphans: [],
    loading: false,
    initialized: false,
    error: null,
    statusUpdatedAt: null,
    statusSource: isDemoMode() ? 'demo' : 'docker',
    stale: false,
    dockerReachable: true,
    demoMode: isDemoMode(),
    dockerError: null,
    streamState: 'idle',
  };
  notifyImmediate();
}

export function getVmState() {
  return {
    ...state,
    vms: applyPendingOverlays(state.vms),
  };
}

export function getVisibleVms() {
  const { user, tenant } = useAuth();
  if (!user) return [];
  let list = applyPendingOverlays(state.vms);
  if (tenant && tenant !== 'all') {
    list = list.filter((vm) => vm.tenant === tenant);
  }
  return list;
}

export function getRunningVms() {
  return getVisibleVms().filter((vm) => vm.status === 'running' && !vm.stale);
}

export function subscribeVms(fn) {
  listeners.add(fn);
  initVmStore();
  return () => listeners.delete(fn);
}

export async function performVmAction(id, action) {
  const optimisticState =
    action === 'start' || action === 'restart' || action === 'recreate'
      ? 'starting'
      : action === 'stop' || action === 'delete'
        ? 'stopping'
        : null;

  if (optimisticState) {
    pendingOps.set(id, optimisticState);
    notifyImmediate();
  }

  try {
    const res =
      action === 'delete'
        ? await fetch(`/api/vms/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            credentials: 'same-origin',
          })
        : await fetch(`/api/vms/${encodeURIComponent(id)}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ action }),
          });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(payload?.error || `Failed to ${action} VM`);
      if (payload?.code) err.code = payload.code;
      throw err;
    }

    pendingOps.delete(id);

    if (payload?.deleted) {
      state = { ...state, vms: state.vms.filter((v) => v.id !== id) };
      notifyImmediate();
    } else if (payload?.vm) {
      const idx = state.vms.findIndex((v) => v.id === id);
      const nextVms = [...state.vms];
      if (idx >= 0) nextVms[idx] = payload.vm;
      else nextVms.push(payload.vm);
      state = {
        ...state,
        vms: nextVms,
        statusUpdatedAt: payload.statusUpdatedAt || state.statusUpdatedAt,
        stale: payload.stale !== undefined ? Boolean(payload.stale) : state.stale,
        dockerReachable: payload.dockerReachable !== undefined ? Boolean(payload.dockerReachable) : state.dockerReachable,
      };
      notifyImmediate();
    }

    // Reconcile full snapshot right after action
    await refreshVms({ force: true, silent: true });
    return payload?.vm || true;
  } catch (err) {
    // Roll back optimistic state immediately on failure
    pendingOps.delete(id);
    notifyImmediate();
    throw err;
  }
}

export async function createVmInStore(data) {
  const headers = { 'Content-Type': 'application/json' };
  if (data?.idempotencyKey) {
    headers['Idempotency-Key'] = String(data.idempotencyKey);
  }
  const res = await fetch('/api/vms', {
    method: 'POST',
    headers,
    credentials: 'same-origin',
    body: JSON.stringify(data),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(payload?.error || 'Failed to create VM');
    if (payload?.code) err.code = payload.code;
    err.status = res.status;
    throw err;
  }
  await refreshVms({ force: true, silent: true });
  const latest = state.vms.find((v) => v.id === payload.vm?.id);
  return latest || payload.vm;
}

export async function cancelVmCreation(vmId) {
  const res = await fetch(`/api/vms/${encodeURIComponent(vmId)}/cancel`, {
    method: 'POST',
    credentials: 'same-origin',
  });
  const payload = await res.json().catch(() => ({}));
  await refreshVms({ force: true, silent: true });
  if (!res.ok) {
    throw new Error(payload?.error || 'Failed to cancel creation');
  }
  return payload;
}

export async function cleanupOrphanContainer(containerId) {
  const res = await fetch(`/api/vms/orphans/${encodeURIComponent(containerId)}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error || 'Failed to clean up orphaned container');
  }
  await refreshVms({ force: true, silent: true });
  return true;
}
