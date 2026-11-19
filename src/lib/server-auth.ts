import crypto from 'crypto';
import { cookies } from 'next/headers';
import { findUserById, sanitizeUser, type PublicUser, type StoredUser, type UserRole } from './server-store';

export const SESSION_COOKIE_NAME = 'ptaas_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24 hours

export interface SessionPayload {
  userId: string;
  email: string;
  role: UserRole;
  name: string;
  cohort?: string;
  exp: number;
}

function getSigningSecret(): string {
  return process.env.SESSION_SECRET || process.env.GUAC_SECRET_KEY || 'ptaas-dev-session-fallback-secret-32b';
}

function sign(encodedPayload: string): string {
  return crypto
    .createHmac('sha256', getSigningSecret())
    .update(encodedPayload)
    .digest('base64url');
}

export function createSessionToken(user: Pick<StoredUser, 'id' | 'email' | 'role' | 'name' | 'cohort'>): string {
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    cohort: user.cohort,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token || !token.includes('.')) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.userId || !parsed.role || !parsed.exp) return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  const map: Record<string, string> = {};
  if (!cookieHeader) return map;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        map[key] = decodeURIComponent(val);
      } catch {
        map[key] = val;
      }
    }
  }
  return map;
}

export function getSessionFromRequest(req: Request): SessionPayload | null {
  const parsed = parseCookieHeader(req.headers.get('cookie'));
  return verifySessionToken(parsed[SESSION_COOKIE_NAME]);
}

export async function getServerSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}

export function getAuthenticatedUserFromSession(session: SessionPayload | null): PublicUser | null {
  if (!session) return null;
  const stored = findUserById(session.userId);
  if (stored) {
    if (stored.status === 'suspended') return null;
    return sanitizeUser(stored);
  }
  // Stateless fallback if serverless cold-started after user creation
  return {
    id: session.userId,
    name: session.name,
    email: session.email,
    role: session.role,
    cohort: session.cohort,
    cohorts: session.cohort ? [session.cohort] : [],
    status: 'active',
    mustChangePassword: false,
    lastLogin: null,
    quota: { vcpu: 8, ram: 16, storage: 150, vms: 4 },
    idleTimeoutMin: 60,
  };
}

export function getSessionCookieConfig(token: string) {
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function getClearSessionCookieConfig() {
  return {
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  };
}
