// Auth service + useAuth() hook.
// Everything role-related reads from here. To move to Keycloak later, replace the
// internals of this file (session load/save, signIn/signOut) and keep the exported API.
import { users, userById, userByEmail, cohorts } from '../mock/users.js';
import { emit } from './events.js';
import { t } from './i18n.js';
import { logEvent } from '../mock/audit.js';

const KEY = 'ptaas.session';
const SIGNED_OUT_KEY = 'ptaas.signedOut';

function load() {
  try {
    if (localStorage.getItem(SIGNED_OUT_KEY)) return null;
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && saved.userId) return saved;
    return null;
  } catch {
    return null;
  }
}

async function sha256Hex(str) {
  const data = new TextEncoder().encode(str);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return str;
}
function save() {
  try {
    if (session) localStorage.setItem(KEY, JSON.stringify(session));
    else localStorage.removeItem(KEY);
  } catch { /* storage unavailable */ }
}

let session = load();

function tenantOptions(user) {
  if (!user) return [];
  if (user.role === 'student') return [{ value: user.cohort, label: user.cohort }];
  const mine = user.role === 'admin' ? cohorts.map((c) => c.id) : user.cohorts;
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

export function signInAs(userId) {
  const user = userById(userId);
  if (!user) return;
  user.lastLogin = new Date().toISOString();
  session = { userId, tenant: user.role === 'student' ? user.cohort : 'all' };
  localStorage.removeItem(SIGNED_OUT_KEY);
  save();
  logEvent('MFA_AUTH', 'Keycloak TOTP');
  emit('session');
}

export async function loginCredentials(email, password) {
  await new Promise((r) => setTimeout(r, 400));
  const user = userByEmail(email) || users.find((u) => u.id === email || u.nim === email);
  if (!user) {
    return { error: 'invalid' };
  }
  if (user.passwordHash) {
    const digest = await sha256Hex(password);
    if (digest !== user.passwordHash) return { error: 'invalid' };
  } else if (user.password && user.password !== password) {
    return { error: 'invalid' };
  }
  if (user.status === 'suspended') {
    return { error: 'locked' };
  }
  return {
    success: true,
    user,
    mustChangePassword: !!user.mustChangePassword
  };
}

export async function verifyMfaCode(userId, code) {
  await new Promise((r) => setTimeout(r, 400));
  const user = userById(userId);
  if (!user) return { error: 'invalid' };
  const clean = code.replace(/\s+/g, '');
  // Demo mode: documented fixed dummy TOTP (000000) or any 6-digit demo code
  if (clean.length !== 6 || !/^\d{6}$/.test(clean)) {
    return { error: 'mfa' };
  }
  if (user.mustChangePassword) {
    return { success: true, mustChangePassword: true };
  }
  signInAs(user.id);
  return { success: true };
}

export async function completeFirstLogin(userId, newPassword) {
  await new Promise((r) => setTimeout(r, 400));
  const user = userById(userId);
  if (!user) return { error: 'invalid' };
  user.passwordHash = await sha256Hex(newPassword);
  delete user.password;
  user.mustChangePassword = false;
  if (user.status === 'pending') user.status = 'active';
  signInAs(user.id);
  return { success: true };
}

// Demo helper: switch persona without signing out.
export function viewAs(role) {
  const user = users.find((u) => u.role === role);
  if (user) signInAs(user.id);
}

export function setTenant(tenant) {
  if (!session) return;
  session = { ...session, tenant };
  save();
  emit('session');
}

export function signOut() {
  session = null;
  try { localStorage.setItem(SIGNED_OUT_KEY, '1'); } catch { /* storage unavailable */ }
  save();
  emit('session');
}
