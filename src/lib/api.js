// API layer. Pages only call these functions, never the mock db directly.
// Each call has simulated latency so loading states are real. Swap the bodies for fetch() later.
import { vmDb, vmRequestDb, policyDb, userVmLimitDb } from '../mock/vms.js';
import { auditDb, logEvent } from '../mock/audit.js';
import { metricsDb } from '../mock/metrics.js';
import { users, userById, cohorts } from '../mock/users.js';
import { useAuth } from './auth.js';
import { emit } from './events.js';

const wait = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms + Math.random() * 200));

async function call(fn) {
  await wait();
  return fn();
}

function forbidden() {
  const err = new Error('Forbidden');
  err.status = 403;
  return err;
}

function visibleVms() {
  const { user, tenant } = useAuth();
  if (!user) throw forbidden();
  let list = vmDb;
  if (user.role === 'student') list = list.filter((vm) => vm.owner === user.id);
  else if (user.role === 'instructor') list = list.filter((vm) => user.cohorts.includes(vm.tenant));
  if (tenant && tenant !== 'all') list = list.filter((vm) => vm.tenant === tenant);
  return list.map((vm) => ({ ...vm, ownerName: userById(vm.owner)?.name ?? '—' }));
}

function findManageable(id) {
  const { user } = useAuth();
  const vm = vmDb.find((v) => v.id === id);
  if (!vm) throw new Error('VM not found');
  const allowed =
    user?.role === 'admin' ||
    (user?.role === 'instructor' && user.cohorts.includes(vm.tenant)) ||
    vm.owner === user?.id;
  if (!allowed) throw forbidden();
  return vm;
}

export const api = {
  vms: {
    list: () => call(() => visibleVms()),
    action: (id, action) =>
      call(() => {
        const vm = findManageable(id);
        switch (action) {
          case 'start':
            vm.status = 'running';
            vm.idleSeconds = 3600;
            logEvent('VM_START', vm.name);
            break;
          case 'stop':
            vm.status = 'stopped';
            logEvent('VM_STOP', vm.name);
            break;
          case 'restart':
            vm.status = 'restarting';
            logEvent('VM_RESTART', vm.name);
            setTimeout(() => {
              vm.status = 'running';
              vm.idleSeconds = 3600;
              emit('vms:changed');
            }, 1800);
            break;
          case 'reset':
            vm.idleSeconds = 3600;
            break;
          case 'delete':
            vmDb.splice(vmDb.indexOf(vm), 1);
            logEvent('VM_DELETE', vm.name);
            break;
          default:
            throw new Error(`Unknown action: ${action}`);
        }
        emit('vms:changed');
        return true;
      }),
    create: (data) =>
      call(() => {
        const { user } = useAuth();
        if (!user) throw forbidden();
        const studentId = user.id;

        // Count non-deleted VMs for this student
        const activeStatuses = ['creating', 'running', 'stopped', 'error', 'restarting'];
        const activeCount = vmDb.filter((v) => v.owner === studentId && activeStatuses.includes(v.status)).length;
        const limit = userVmLimitDb.get(studentId) || policyDb.maxSelfServiceVms;

        if (user.role === 'student' && activeCount >= limit) {
          if (!data.grantId) {
            const err = new Error(`Maximum self-service VM limit (${limit}) reached. Request approval for additional VMs.`);
            err.code = 'vm_limit_reached';
            err.limit = limit;
            err.current = activeCount;
            err.canRequest = true;
            throw err;
          }

          // Validate grant token
          const grant = vmRequestDb.find((r) => r.grantId === data.grantId && r.studentId === studentId);
          if (!grant || grant.status !== 'approved') {
            const err = new Error('Invalid or already fulfilled approval grant token');
            err.code = 'invalid_grant';
            throw err;
          }
          if (grant.approvalExpiresAt && new Date(grant.approvalExpiresAt).getTime() < Date.now()) {
            grant.status = 'expired';
            const err = new Error('Approval grant has expired');
            err.code = 'grant_expired';
            throw err;
          }

          grant.status = 'fulfilled';
          grant.fulfilledAt = new Date().toISOString();
        }

        const newId = `vm-${Date.now()}`;
        const newVm = {
          id: newId,
          name: data.name || `lab-vm-${Date.now().toString().slice(-4)}`,
          os: data.os || 'kali',
          vcpu: Number(data.vcpu) || 2,
          ram: Number(data.ram) || 4,
          disk: Number(data.disk) || 30,
          ip: `10.10.1.${40 + vmDb.length}`,
          vpc: data.vpc || 'vpc-cs401-01',
          status: 'running',
          idleSeconds: 3600,
          owner: studentId,
          tenant: data.cohort || (user.cohorts ? user.cohorts[0] : 'CS-401')
        };

        vmDb.push(newVm);
        logEvent('VM_CREATE', newVm.name);
        emit('vms:changed');
        return newVm;
      }),
    getQuota: (studentId) =>
      call(() => {
        const { user } = useAuth();
        const targetId = studentId || user?.id;
        const activeStatuses = ['creating', 'running', 'stopped', 'error', 'restarting'];
        const activeCount = vmDb.filter((v) => v.owner === targetId && activeStatuses.includes(v.status)).length;
        const limit = userVmLimitDb.get(targetId) || policyDb.maxSelfServiceVms;
        return {
          used: activeCount,
          limit,
          remaining: Math.max(0, limit - activeCount),
          isAtLimit: activeCount >= limit
        };
      })
  },
  metrics: () => call(() => metricsDb),
  activity: () =>
    call(() => {
      const { user } = useAuth();
      const list = user?.role === 'student' ? auditDb.filter((e) => e.actor === user.email) : auditDb;
      return list.slice(0, 5);
    }),

  users: {
    list: () =>
      call(() => {
        const { user } = useAuth();
        if (!user || user.role === 'student') throw forbidden();
        if (user.role === 'admin') return [...users];
        // Instructor only sees students in their own cohorts
        return users.filter((u) => u.role === 'student' && user.cohorts.includes(u.cohort));
      }),
    create: (data) =>
      call(() => {
        const { user } = useAuth();
        if (!user || user.role === 'student') throw forbidden();
        if (user.role === 'instructor' && data.role !== 'student') throw forbidden();
        if (user.role === 'instructor' && !user.cohorts.includes(data.cohort)) throw forbidden();

        const tempPass = `temp-${Math.random().toString(36).slice(2, 10)}`;
        const newUser = {
          id: `u-${Date.now()}`,
          name: data.name,
          email: data.email,
          role: data.role || 'student',
          nim: data.idNum,
          staffId: data.role !== 'student' ? data.idNum : undefined,
          cohort: data.cohort,
          cohorts: data.cohort ? [data.cohort] : [],
          status: user.role === 'instructor' ? 'pending' : 'active',
          password: tempPass,
          mustChangePassword: true,
          lastLogin: null,
          quota: data.quota || { vcpu: 8, ram: 16, storage: 150, vms: 4 },
          idleTimeoutMin: data.idleTimeoutMin || 60,
          createdBy: user.id
        };
        users.push(newUser);
        logEvent('USER_CREATE', newUser.email);
        emit('users:changed');
        return { user: newUser, tempPassword: tempPass };
      }),
    bulkImport: (rows) =>
      call(() => {
        const { user } = useAuth();
        if (!user || user.role === 'student') throw forbidden();
        const created = [];
        for (const row of rows) {
          const tempPass = `temp-${Math.random().toString(36).slice(2, 10)}`;
          const u = {
            id: `u-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            name: row.name,
            email: row.email,
            role: 'student',
            nim: row.nim,
            cohort: row.cohort,
            cohorts: [row.cohort],
            status: user.role === 'instructor' ? 'pending' : 'active',
            password: tempPass,
            mustChangePassword: true,
            lastLogin: null,
            quota: { vcpu: 8, ram: 16, storage: 150, vms: 4 },
            idleTimeoutMin: 60,
            createdBy: user.id
          };
          users.push(u);
          created.push(u);
        }
        logEvent('USER_IMPORT_BULK', `${created.length} students`);
        emit('users:changed');
        return created;
      }),
    update: (id, updates) =>
      call(() => {
        const u = userById(id);
        if (!u) throw new Error('User not found');
        Object.assign(u, updates);
        emit('users:changed');
        return u;
      }),
    delete: (id) =>
      call(() => {
        const idx = users.findIndex((u) => u.id === id);
        if (idx === -1) throw new Error('User not found');
        const [u] = users.splice(idx, 1);
        logEvent('USER_DELETE', u.email);
        emit('users:changed');
        return true;
      }),
    action: (id, action) =>
      call(() => {
        const u = userById(id);
        if (!u) throw new Error('User not found');
        if (action === 'approve') {
          u.status = 'active';
          logEvent('USER_APPROVE', u.email);
        } else if (action === 'reject') {
          users.splice(users.indexOf(u), 1);
          logEvent('USER_REJECT', u.email);
        } else if (action === 'suspend') {
          u.status = 'suspended';
          logEvent('USER_SUSPEND', u.email);
        } else if (action === 'activate') {
          u.status = 'active';
          logEvent('USER_ACTIVATE', u.email);
        } else if (action === 'resetPass') {
          const newPass = `reset-${Math.random().toString(36).slice(2, 10)}`;
          u.password = newPass;
          u.mustChangePassword = true;
          logEvent('USER_RESET_PASSWORD', u.email);
          emit('users:changed');
          return { tempPassword: newPass };
        } else if (action === 'resetMfa') {
          logEvent('USER_RESET_MFA', u.email);
        }
        emit('users:changed');
        return true;
      })
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
          const newId = `vm-${Date.now()}`;
          const newVm = {
            id: newId,
            name: specs.name || req.requestedSpecs.name,
            os: specs.os || req.requestedSpecs.os,
            vcpu: specs.vcpu || req.requestedSpecs.vcpu,
            ram: specs.ram || req.requestedSpecs.ram,
            disk: specs.disk || req.requestedSpecs.disk,
            ip: `10.10.1.${40 + vmDb.length}`,
            vpc: 'vpc-cs401-01',
            status: 'running',
            idleSeconds: 3600,
            owner: req.studentId,
            tenant: req.cohort
          };
          vmDb.push(newVm);
          req.status = 'fulfilled';
          req.createdVmId = newId;
          req.fulfilledAt = new Date().toISOString();
          logEvent('VM_REQUEST_AUTO_PROVISION', newVm.name);
          emit('vms:changed');
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

  policies: {
    get: () => call(() => ({ ...policyDb })),
    update: (updates) =>
      call(() => {
        const { user } = useAuth();
        if (user?.role !== 'admin') throw forbidden();
        Object.assign(policyDb, updates);
        logEvent('POLICY_UPDATE', `maxVms=${policyDb.maxSelfServiceVms}`);
        emit('policies:changed');
        return { ...policyDb };
      }),
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
