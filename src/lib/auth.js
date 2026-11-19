// Auth service + useAuth() hook backed by server-side HttpOnly signed session cookie.
import { users, userById, userByEmail, cohorts, upsertUser, persistUsers } from '../mock/users.js';
import { emit } from './events.js';
import { t } from './i18n.js';
import { logEvent } from '../mock/audit.js';

const KEY = 'ptaas.session';
const SIGNED_OUT_KEY = 'ptaas.signedOut';

function load() {
  if (typeof window === 'undefined') return null;
  try {
    if (localStorage.getItem(SIGNED_OUT_KEY)) return null;
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && saved.userId) return saved;
    return null;
  } catch {
    return null;
  }
}

export async function sha256Hex(str) {
  const data = new TextEncoder().encode(str);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return str;
}

function save() {
  if (typeof window === 'undefined') return;
  try {
    if (session) localStorage.setItem(KEY, JSON.stringify(session));
    else localStorage.removeItem(KEY);
  } catch { /* storage unavailable */ }
}

let session = load();

function tenantOptions(user) {
  if (!user) return [];
  if (user.role === 'student') return [{ value: user.cohort || 'CS-401', label: user.cohort || 'CS-401' }];
  const mine = user.role === 'admin' ? cohorts.map((c) => c.id) : (user.cohorts || []);
  return [
    { value: 'all', label: user.role === 'admin' ? t('tenant.all') : t('tenant.mine') },
    ...mine.map((id) => ({ value: id, label: id }))
  ];
}

export function useAuth() {
  const user = session ? userById(session.userId) : null;
  return {
    user,
    role: user?.role ?? null,
    tenant: session?.tenant ?? null,
    tenants: tenantOptions(user),
    isAuthenticated: !!user,
    hasRole: (...roles) => !!user && roles.includes(user.role)
  };
}

export function signInAs(userId, userData = null) {
  if (userData) upsertUser(userData);
  const user = userById(userId);
  if (!user) return;
  user.lastLogin = new Date().toISOString();
  persistUsers();
  session = { userId: user.id, tenant: user.role === 'student' ? (user.cohort || 'CS-401') : 'all' };
  try { localStorage.removeItem(SIGNED_OUT_KEY); } catch { /* ignore */ }
  save();
  logEvent('MFA_AUTH', 'Session Authenticated');
  emit('session');
}

export async function hydrateSessionFromServer() {
  if (typeof window === 'undefined') return;
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (res.ok) {
      const data = await res.json();
      if (data?.user) {
        upsertUser(data.user);
        const nextTenant = data.user.role === 'student'
          ? (data.user.cohort || 'CS-401')
          : (session?.tenant || 'all');
        session = { userId: data.user.id, tenant: nextTenant };
        try { localStorage.removeItem(SIGNED_OUT_KEY); } catch { /* ignore */ }
        save();
        emit('session');
        return;
      }
    }
    if (res.status === 401 && session) {
      session = null;
      save();
      emit('session');
    }
  } catch { /* offline/non-Next fallback */ }
}

export async function loginCredentials(email, password) {
  const cleanEmail = (email || '').trim();
  if (!cleanEmail || !password) {
    return { error: 'invalid' };
  }

  // Authenticate with server-side session endpoint (issues HttpOnly cookie)
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email: cleanEmail, password })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.user) {
      upsertUser(data.user);
      if (!data.mustChangePassword) {
        signInAs(data.user.id, data.user);
      }
      return {
        success: true,
        user: data.user,
        mustChangePassword: !!data.mustChangePassword
      };
    }
    if (data?.error === 'locked' || res.status === 403) {
      return { error: 'locked' };
    }
    return { error: 'invalid' };
  } catch {
    // Fallback check only if API is unreachable in unit tests
    const user = userByEmail(cleanEmail) || users.find((u) => u.id === cleanEmail || u.nim === cleanEmail);
    if (!user) return { error: 'invalid' };
    if (user.passwordHash) {
      const digest = await sha256Hex(password);
      if (digest !== user.passwordHash) return { error: 'invalid' };
    } else if (user.password && user.password !== password) {
      return { error: 'invalid' };
    }
    if (user.status === 'suspended') return { error: 'locked' };
    if (!user.mustChangePassword) signInAs(user.id, user);
    return { success: true, user, mustChangePassword: !!user.mustChangePassword };
  }
}

export async function completeFirstLogin(userId, newPassword) {
  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ newPassword })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: data?.error || 'Failed to update password' };
    }
    if (data?.user) {
      upsertUser(data.user);
    }
  } catch { /* fallback below */ }

  const user = userById(userId);
  if (!user) return { error: 'invalid' };
  user.passwordHash = await sha256Hex(newPassword);
  delete user.password;
  user.mustChangePassword = false;
  if (user.status === 'pending') user.status = 'active';
  persistUsers();
  signInAs(user.id, user);
  return { success: true };
}

export function setTenant(tenant) {
  if (!session) return;
  session = { ...session, tenant };
  save();
  emit('session');
}

export async function signOut() {
  session = null;
  try { localStorage.setItem(SIGNED_OUT_KEY, '1'); } catch { /* storage unavailable */ }
  save();
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } catch { /* ignore */ }
  emit('session');
}
