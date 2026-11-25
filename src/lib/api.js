// API layer. Pages call these functions or vm-store.js directly.
import { vmRequestDb, policyDb, userVmLimitDb } from '../mock/vms.js';
import {
  getVisibleVms,
  refreshVms,
  performVmAction,
  createVmInStore,
  cancelVmCreation,
  cleanupOrphanContainer,
} from './vm-store.js';
import { auditDb, logEvent } from '../mock/audit.js';
import { metricsDb } from '../mock/metrics.js';
import { users, userById, cohorts, persistUsers, upsertUser, replaceUsersFromServer } from '../mock/users.js';
import { useAuth, sha256Hex } from './auth.js';
import { emit } from './events.js';

const wait = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(fn) {
  await wait();
  return fn();
}

function forbidden() {
  const err = new Error('Forbidden');
  err.status = 403;
  return err;
}

export const api = {
  vms: {
    list: async ({ force = false } = {}) => {
      await refreshVms({ force, silent: true });
      return getVisibleVms();
    },
    action: async (id, action) => {
      const result = await performVmAction(id, action);
      logEvent(`VM_${String(action).toUpperCase()}`, id);
      return result;
    },
    create: async (data) => {
      const { user } = useAuth();
      if (!user) throw forbidden();

      const newVm = await createVmInStore({
        name: data.name,
        imageId: data.imageId || 'kali-2024.3',
        os: data.os || 'kali',
        vcpu: Number(data.vcpu) || 2,
        ram: Number(data.ram) || 4,
        disk: Number(data.disk) || 30,
        vpc: data.vpc || 'vpc-cs401-01',
        cohort: data.cohort || user.cohort || (user.cohorts ? user.cohorts[0] : 'CS-401'),
        grantId: data.grantId,
        idempotencyKey: data.idempotencyKey,
        restartPolicy: data.restartPolicy,
      });

      logEvent('VM_CREATE', newVm.name);
      return newVm;
    },
    cancelCreation: async (vmId) => cancelVmCreation(vmId),
    cleanupOrphan: async (containerId) => {
      return cleanupOrphanContainer(containerId);
    },
    getQuota: async (studentId) => {
      const { user } = useAuth();
      const targetId = studentId || user?.id;
      const list = getVisibleVms();
      const activeCount = list.filter((v) => v.owner === targetId).length;
      const limit = userVmLimitDb.get(targetId) || user?.maxSelfServiceVms || policyDb.maxSelfServiceVms;
      return {
        used: activeCount,
        limit,
        remaining: Math.max(0, limit - activeCount),
        isAtLimit: activeCount >= limit
      };
    }
  },
  metrics: () => call(() => metricsDb),
  activity: () =>
    call(() => {
      const { user } = useAuth();
      const list = user?.role === 'student' ? auditDb.filter((e) => e.actor === user.email) : auditDb;
      return list.slice(0, 5);
    }),

  users: {
    list: async () => {
      const { user } = useAuth();
      if (!user || user.role === 'student') throw forbidden();
      try {
        const res = await fetch('/api/admin/users', { credentials: 'same-origin' });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.users)) {
            if (user.role === 'admin') replaceUsersFromServer(data.users);
            return data.users;
          }
        }
      } catch { /* fallback to local store */ }
      return call(() => {
        if (user.role === 'admin') return [...users];
        return users.filter((u) => u.role === 'student' && (user.cohorts || []).includes(u.cohort));
      });
    },
    create: async (data) => {
      const { user } = useAuth();
      if (!user || user.role === 'student') throw forbidden();
      if (user.role === 'instructor' && data.role !== 'student') throw forbidden();

      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(data)
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to create user');
      }
      if (payload?.user) {
        upsertUser({
          ...payload.user,
          passwordHash: payload.tempPassword ? await sha256Hex(payload.tempPassword) : undefined
        });
      }
      logEvent('USER_CREATE', payload?.user?.email || data.email);
      emit('users:changed');
      return { user: payload.user, tempPassword: payload.tempPassword };
    },
    bulkImport: async (rows) => {
      const { user } = useAuth();
      if (!user || user.role === 'student') throw forbidden();
      const created = [];
      for (const row of rows) {
        const res = await api.users.create({
          name: row.name,
          email: row.email,
          idNum: row.nim,
          cohort: row.cohort,
          role: 'student',
          mustChangePassword: true
        });
        created.push(res.user);
      }
      logEvent('USER_IMPORT_BULK', `${created.length} students`);
      emit('users:changed');
      return created;
    },
    update: async (id, updates) => {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(updates)
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to update user');
      }
      const u = userById(id);
      const localUpdates = { ...(payload?.user || updates) };
      if (updates.password) {
        localUpdates.passwordHash = await sha256Hex(updates.password);
        delete localUpdates.password;
      }
      if (u) {
        Object.assign(u, localUpdates);
        persistUsers();
      } else if (payload?.user) {
        upsertUser(localUpdates);
      }
      logEvent('USER_UPDATE', localUpdates.email || id);
      emit('users:changed');
      return payload?.user || u;
    },
    setPassword: async (id, password, mustChangePassword = false) => {
      return api.users.update(id, { password, mustChangePassword });
    },
    delete: async (id) => {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin'
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to delete user');
      }
      const idx = users.findIndex((u) => u.id === id);
      if (idx !== -1) {
        const [removed] = users.splice(idx, 1);
        persistUsers();
        logEvent('USER_DELETE', removed.email);
      }
      emit('users:changed');
      return true;
    },
    action: async (id, action) => {
      const u = userById(id);
      if (!u) throw new Error('User not found');
      if (action === 'approve') {
        await api.users.update(id, { status: 'active' });
        logEvent('USER_APPROVE', u.email);
      } else if (action === 'reject') {
        await api.users.delete(id);
        logEvent('USER_REJECT', u.email);
      } else if (action === 'suspend') {
        await api.users.update(id, { status: 'suspended' });
        logEvent('USER_SUSPEND', u.email);
      } else if (action === 'activate') {
        await api.users.update(id, { status: 'active' });
        logEvent('USER_ACTIVATE', u.email);
      } else if (action === 'resetPass') {
        const newPass = `PTaaS-${Math.random().toString(36).slice(2, 10)}!`;
        await api.users.update(id, { password: newPass, mustChangePassword: true });
        logEvent('USER_RESET_PASSWORD', u.email);
        return { tempPassword: newPass };
      } else if (action === 'resetMfa') {
        logEvent('USER_RESET_MFA', u.email);
      }
      emit('users:changed');
      return true;
    }
  },

  cohorts: {
    list: () =>
      call(() => {
        const { user } = useAuth();
        if (!user || user.role === 'student') throw forbidden();
        if (user.role === 'admin') return [...cohorts];
        return cohorts.filter((c) => user.cohorts.includes(c.id));
      }),
    create: (data) =>
      call(() => {
        const { user } = useAuth();
        if (user?.role !== 'admin') throw forbidden();
        const cohort = {
          id: data.id,
          name: data.name,
          instructor: data.instructor,
          studentCount: 0,
          defaultQuota: data.defaultQuota || { vcpu: 8, ram: 16, storage: 150, vms: 4 }
        };
        cohorts.push(cohort);
        logEvent('COHORT_CREATE', cohort.id);
        emit('cohorts:changed');
        return cohort;
      })
  },

  audit: {
    list: () =>
      call(() => {
        const { user } = useAuth();
        if (user?.role !== 'admin') throw forbidden();
        return [...auditDb];
      })
  },

  desktop: {
    createSession: async (vmId) => {
      const res = await fetch(`/api/vms/${encodeURIComponent(vmId)}/desktop-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'session_failed' }));
        const e = new Error(err.message || 'Failed to create desktop session');
        e.code = err.error || 'session_failed';
        e.status = res.status;
        throw e;
      }
      return res.json();
    },
    terminateSession: async (vmId) => {
      const res = await fetch(`/api/vms/${encodeURIComponent(vmId)}/desktop-session`, {
        method: 'DELETE',
        credentials: 'include'
      });
      return res.json().catch(() => ({ success: true }));
    },
    getHealth: async (vmId) => {
      try {
        const res = await fetch(`/api/vms/${encodeURIComponent(vmId)}/health`, {
          credentials: 'include'
        });
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },
    startVm: async (vmId) => {
      const res = await fetch(`/api/vms/${encodeURIComponent(vmId)}/start`, {
        method: 'POST',
        credentials: 'include'
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'start_failed' }));
        throw new Error(err.message || 'Failed to start VM');
      }
      return res.json();
    }
  },

  terminal: {
    createSession: async (vmId) => {
      const res = await fetch(`/api/vms/${encodeURIComponent(vmId)}/terminal-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'session_failed' }));
        const e = new Error(err.message || 'Failed to create terminal session');
        e.code = err.error || 'session_failed';
        throw e;
      }
      return res.json();
    },
    terminateSession: async (vmId) => {
      const res = await fetch(`/api/vms/${encodeURIComponent(vmId)}/terminal-session`, {
        method: 'DELETE',
        credentials: 'include'
      });
      return res.json().catch(() => ({ success: true }));
    }
  },

  // Part B: VM Approval Requests State Machine API
  vmRequests: {
    list: (filter = {}) =>
      call(() => {
        const { user } = useAuth();
        if (!user) throw forbidden();

        let list = [...vmRequestDb];
        if (user.role === 'student') {
          list = list.filter((r) => r.studentId === user.id);
        } else if (user.role === 'instructor') {
          list = list.filter((r) => user.cohorts && user.cohorts.includes(r.cohort));
        }

        if (filter.status) {
          list = list.filter((r) => r.status === filter.status);
        }
        return list;
      }),

    create: (data) =>
      call(() => {
        const { user } = useAuth();
        if (!user) throw forbidden();
        const studentId = user.id;

        // Anti-abuse Check 1: Max 2 pending requests
        const pendingCount = vmRequestDb.filter((r) => r.studentId === studentId && r.status === 'pending').length;
        if (pendingCount >= 2) {
          const err = new Error('You already have 2 pending VM requests. Please wait for them to be reviewed.');
          err.code = 'too_many_pending_requests';
          throw err;
        }

        // Anti-abuse Check 2: Max 5 per day
        const oneDayAgo = Date.now() - 86400000;
        const dailyCount = vmRequestDb.filter((r) => r.studentId === studentId && new Date(r.requestedAt).getTime() > oneDayAgo).length;
        if (dailyCount >= 5) {
          const err = new Error('Daily limit of 5 VM requests reached. Please try again tomorrow.');
          err.code = 'daily_request_limit_reached';
          throw err;
        }

        // Anti-abuse Check 3: Duplicate within 1 hour
        const oneHourAgo = Date.now() - 3600000;
        const isDup = vmRequestDb.some((r) =>
          r.studentId === studentId &&
          new Date(r.requestedAt).getTime() > oneHourAgo &&
          r.requestedSpecs.os === data.os &&
          r.purpose === data.purpose
        );
        if (isDup) {
          const err = new Error('An identical VM request was submitted within the last hour.');
          err.code = 'duplicate_request';
          throw err;
        }

        const newRequest = {
          id: `req-vm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          studentId,
          studentName: user.name,
          studentEmail: user.email,
          cohort: user.cohort || (user.cohorts ? user.cohorts[0] : 'CS-401'),
          requestedSpecs: {
            name: data.name,
            os: data.os,
            vcpu: Number(data.vcpu) || 2,
            ram: Number(data.ram) || 4,
            disk: Number(data.disk) || 30
          },
          purpose: data.purpose,
          durationDays: Number(data.durationDays) || 14,
          status: 'pending',
          requestedAt: new Date().toISOString(),
          reviewedAt: null,
          reviewedBy: null,
          reviewerName: null,
          reviewNote: null,
          approvalExpiresAt: null,
          grantId: null,
          idempotencyKey: `idemp-${Date.now()}`
        };

        vmRequestDb.unshift(newRequest);
        logEvent('VM_REQUEST_SUBMIT', newRequest.requestedSpecs.name);
        emit('requests:changed');
        return newRequest;
      }),

    approve: (id, options = {}) =>
      call(() => {
        const { user } = useAuth();
        if (!user || user.role === 'student') throw forbidden();

        const req = vmRequestDb.find((r) => r.id === id);
        if (!req) throw new Error('Request not found');
        if (req.status !== 'pending') throw new Error(`Cannot approve request with status '${req.status}'`);

        const grantId = `grant_${Math.random().toString(36).slice(2, 10)}`;
        const expiresAt = new Date(Date.now() + (policyDb.grantValidityDays || 7) * 86400000).toISOString();

        req.status = 'approved';
        req.reviewedAt = new Date().toISOString();
        req.reviewedBy = user.id;
        req.reviewerName = user.name;
        req.reviewNote = options.reviewNote || 'Approved for academic lab coursework.';
        req.grantId = grantId;
        req.approvalExpiresAt = expiresAt;

        if (options.approvedSpecs) {
          req.approvedSpecs = options.approvedSpecs;
        }

        // Auto-provision VM if enabled by policy
        if (policyDb.autoProvisionOnApproval) {
          const specs = req.approvedSpecs || req.requestedSpecs;
          req.status = 'fulfilled';
          req.fulfilledAt = new Date().toISOString();
          void createVmInStore({
            name: specs.name || req.requestedSpecs.name,
            os: specs.os || req.requestedSpecs.os,
            vcpu: specs.vcpu || req.requestedSpecs.vcpu,
            ram: specs.ram || req.requestedSpecs.ram,
            disk: specs.disk || req.requestedSpecs.disk,
            cohort: req.cohort,
          }).catch(() => {});
          logEvent('VM_REQUEST_AUTO_PROVISION', specs.name || req.requestedSpecs.name);
        } else {
          logEvent('VM_REQUEST_APPROVE', req.requestedSpecs.name);
        }

        emit('requests:changed');
        return req;
      }),

    reject: (id, note) =>
      call(() => {
        const { user } = useAuth();
        if (!user || user.role === 'student') throw forbidden();

        const req = vmRequestDb.find((r) => r.id === id);
        if (!req) throw new Error('Request not found');
        if (req.status !== 'pending') throw new Error(`Cannot reject request with status '${req.status}'`);

        if (!note || note.trim().length < 5) {
          throw new Error('A feedback note (min 5 characters) is required when rejecting a request.');
        }

        req.status = 'rejected';
        req.reviewedAt = new Date().toISOString();
        req.reviewedBy = user.id;
        req.reviewerName = user.name;
        req.reviewNote = note.trim();

        logEvent('VM_REQUEST_REJECT', req.requestedSpecs.name);
        emit('requests:changed');
        return req;
      }),

    cancel: (id) =>
      call(() => {
        const { user } = useAuth();
        const req = vmRequestDb.find((r) => r.id === id);
        if (!req) throw new Error('Request not found');
        if (req.status !== 'pending') throw new Error('Only pending requests can be cancelled.');
        if (user.role === 'student' && req.studentId !== user.id) throw forbidden();

        req.status = 'cancelled';
        logEvent('VM_REQUEST_CANCEL', req.requestedSpecs.name);
        emit('requests:changed');
        return req;
      })
  },

  images: {
    health: async () => {
      const res = await fetch('/api/images/health', { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to check image readiness');
      return res.json();
    },
    prepare: async (imageId) => {
      const res = await fetch('/api/images/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ imageId }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || 'Failed to prepare image');
      return payload;
    }
  },

  policies: {
    get: async () => {
      try {
        const res = await fetch('/api/policies', { credentials: 'same-origin', cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          Object.assign(policyDb, data);
          return data;
        }
      } catch { /* fallback below */ }
      return { ...policyDb };
    },
    update: async (updates) => {
      const { user } = useAuth();
      if (user?.role !== 'admin') throw forbidden();
      const res = await fetch('/api/policies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(updates),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to update policies');
      Object.assign(policyDb, data);
      logEvent('POLICY_UPDATE', `maxVms=${policyDb.maxSelfServiceVms}`);
      emit('policies:changed');
      return data;
    },
    setUserLimit: (userId, limit) =>
      call(() => {
        const { user } = useAuth();
        if (!user || user.role === 'student') throw forbidden();
        userVmLimitDb.set(userId, Number(limit));
        logEvent('USER_LIMIT_OVERRIDE', `userId=${userId}, limit=${limit}`);
        emit('users:changed');
        return { userId, limit };
      }),
    getUserLimit: (userId) =>
      call(() => userVmLimitDb.get(userId) || policyDb.maxSelfServiceVms)
  }
};
