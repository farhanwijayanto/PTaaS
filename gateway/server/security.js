// Comprehensive Security & Input Validation Layer for PTaaS Cloud
// Implements B1 (Universal Input Handling), B2 (Auth, Sessions & RBAC), B3 (Headers & Browser Hardening),
// B4 (Rate Limiting & Abuse Defense), and B5 (Multi-Tenant Isolation & SSRF/Injection Prevention).

const { z } = require('zod');
const path = require('path');
const crypto = require('crypto');

// --- 1. UNIFORM ERROR RESPONSE & REQUEST ID ---
function generateRequestId() {
  return `req_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function makeError(code, message, requestId = generateRequestId()) {
  return {
    error: {
      code,
      message,
      requestId,
      timestamp: new Date().toISOString()
    }
  };
}

// --- 2. INPUT SANITIZATION & INJECTION DEFENSE ---

/**
 * Normalizes Unicode to NFKC, strips null bytes (\0), and strips harmful ASCII control characters
 */
function sanitizeInput(val) {
  if (typeof val !== 'string') return val;
  // Strip null bytes and normalize NFKC
  let clean = val.replace(/\0/g, '').normalize('NFKC');
  // Strip non-printable control characters except newline and tab
  clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return clean.trim();
}

/**
 * Strips ANSI and OSC escape sequences to prevent terminal escape injection in web UI and log files
 */
function stripAnsi(val) {
  if (typeof val !== 'string') return val;
  return val.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

/**
 * Neutralizes CSV formula injection by prefixing formula triggers with single-quote (')
 */
function sanitizeCsvCell(val) {
  if (typeof val !== 'string') return val;
  const trimmed = val.trim();
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}

/**
 * Rejects prototype pollution payloads (__proto__, constructor, prototype)
 */
function checkPrototypePollution(obj, depth = 0) {
  if (depth > 10 || !obj || typeof obj !== 'object') return false;
  const keys = Object.keys(obj);
  for (const k of keys) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
      return true;
    }
    if (typeof obj[k] === 'object' && checkPrototypePollution(obj[k], depth + 1)) {
      return true;
    }
  }
  return false;
}

/**
 * Prevents directory traversal attacks by validating resolved path against allowed root
 */
function isSafePath(baseDir, userPath) {
  if (!userPath || typeof userPath !== 'string') return false;
  if (userPath.includes('\0') || userPath.includes('..') || userPath.includes('%2e')) return false;
  const safeResolved = path.resolve(baseDir, path.normalize(userPath));
  return safeResolved.startsWith(path.resolve(baseDir));
}

/**
 * SSRF & Private Network Protection: Rejects loopback, link-local, cloud metadata, and unauthorized private IPs
 */
function isSsrfSafe(ipOrUrl) {
  if (!ipOrUrl || typeof ipOrUrl !== 'string') return false;

  let host = ipOrUrl;
  try {
    if (ipOrUrl.includes('://')) {
      const u = new URL(ipOrUrl);
      host = u.hostname;
      // Enforce HTTPS or standard schemes
      if (!['http:', 'https:'].includes(u.protocol)) return false;
    }
  } catch {
    return false;
  }

  // Normalize host
  host = host.toLowerCase().replace(/[\[\]]/g, '');

  // Block AWS / GCP / Azure metadata endpoint
  if (host === '169.254.169.254' || host === 'metadata.google.internal' || host.startsWith('169.254.')) {
    return false;
  }

  // Block localhost / loopback
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.startsWith('127.')) {
    return false;
  }

  // Allow permitted lab subnet (10.10.2.0/24)
  if (host.startsWith('10.10.2.')) {
    return true;
  }

  // Block all other RFC 1918 private / link-local addresses
  if (
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
    host.startsWith('0.0.0.0')
  ) {
    return false;
  }

  return true;
}

// --- 3. STRICT ZOD SCHEMAS ---

// User Name: 1-80 characters, Unicode letters, spaces, hyphens, apostrophes
const NameSchema = z.string()
  .min(1, 'Name is required')
  .max(80, 'Name must be 80 characters or less')
  .regex(/^[\p{L}\s'-]+$/u, 'Name contains invalid characters')
  .transform(sanitizeInput);

// RFC-compliant email, strictly ending in example.com, example.org, or example.edu
const EmailSchema = z.string()
  .email('Invalid email address')
  .max(254, 'Email must be 254 characters or less')
  .toLowerCase()
  .refine(
    (e) => /^[a-zA-Z0-9._%+-]+@([a-zA-Z0-9-]+\.)?example\.(com|org|edu)$/i.test(e),
    { message: 'Only RFC 2606 reserved domains (@example.com, @example.org, @example.edu) are permitted' }
  )
  .transform(sanitizeInput);

// Student / Staff ID: ^[A-Z]{3}-\d{4,8}$
const IdentifierSchema = z.string()
  .regex(/^[A-Z]{3}-\d{4,8}$/, 'ID must match format ABC-1234 (e.g. STU-0001 or ADM-0001)');

// Password: Min 12 chars, max 128
const PasswordSchema = z.string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password cannot exceed 128 characters');

// VM Name: ^[a-z][a-z0-9-]{2,30}$
const VmNameSchema = z.string()
  .regex(/^[a-z][a-z0-9-]{2,30}$/, 'VM name must be 3-30 lowercase alphanumeric characters or hyphens, starting with a letter');

// Quota schema
const QuotaSchema = z.object({
  vcpu: z.number().int().min(1).max(32),
  ram: z.number().int().min(2).max(64),
  storage: z.number().int().min(10).max(500),
  vms: z.number().int().min(1).max(20)
}).strict();

// Request Schemas
const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(128)
}).strict();

const MfaVerifySchema = z.object({
  userId: z.string().min(1).max(50),
  code: z.string().regex(/^\d{6}$/, 'MFA code must be exactly 6 digits')
}).strict();

const VmCreateSchema = z.object({
  name: VmNameSchema,
  os: z.enum(['kali', 'parrot', 'ubuntu']),
  vcpu: z.number().int().min(1).max(8).default(2),
  ram: z.number().int().min(2).max(16).default(4),
  disk: z.number().int().min(10).max(100).default(30),
  cohort: z.string().min(1).max(50).optional(),
  owner: z.string().optional(),
  grantId: z.string().optional()
}).strict();

const VmRequestCreateSchema = z.object({
  name: VmNameSchema,
  os: z.enum(['kali', 'parrot', 'ubuntu']),
  vcpu: z.number().int().min(1).max(8).default(2).optional(),
  ram: z.number().int().min(2).max(16).default(4).optional(),
  disk: z.number().int().min(10).max(100).default(30).optional(),
  purpose: z.string().min(15, 'Purpose must be at least 15 characters').max(500),
  durationDays: z.number().int().min(1).max(30).default(14).optional(),
  studentId: z.string().optional(),
  studentName: z.string().optional(),
  studentEmail: z.string().optional(),
  cohort: z.string().optional(),
  idempotencyKey: z.string().optional()
}).strict();

const UserCreateSchema = z.object({
  name: NameSchema,
  email: EmailSchema,
  role: z.enum(['student', 'instructor', 'admin']),
  studentId: IdentifierSchema.optional(),
  staffId: IdentifierSchema.optional(),
  cohort: z.string().min(1).max(50).optional(),
  cohorts: z.array(z.string().min(1).max(50)).optional(),
  quota: QuotaSchema.optional(),
  idleTimeoutMin: z.number().int().min(15).max(240).optional().default(60)
}).strict();

const AclRuleSchema = z.object({
  dir: z.enum(['INBOUND', 'OUTBOUND']),
  action: z.enum(['ALLOW', 'DROP']),
  proto: z.enum(['TCP', 'UDP', 'ICMP', 'ALL']),
  port: z.string().max(20).regex(/^(\d{1,5}(-\d{1,5})?|\*|ANY)$/i, 'Invalid port specification'),
  target: z.string().max(40).refine((t) => {
    // Target must be inside 10.10.x.x lab network or standard documentation CIDR
    return /^10\.10\.\d{1,3}\.\d{1,3}(\/\d{1,2})?$/.test(t) ||
           /^192\.0\.2\.\d{1,3}(\/\d{1,2})?$/.test(t) ||
           /^198\.51\.100\.\d{1,3}(\/\d{1,2})?$/.test(t) ||
           /^203\.0\.113\.\d{1,3}(\/\d{1,2})?$/.test(t) ||
           t === 'ANY' || t === '*';
  }, { message: 'Target IP/CIDR must be within permitted lab ranges' }),
  desc: z.string().max(100).transform(sanitizeInput).optional()
}).strict();

const ScriptRunSchema = z.object({
  language: z.enum(['python', 'bash', 'powershell']),
  code: z.string().max(100000, 'Script exceeds 100 KB limit'),
  vmId: z.string().min(1).max(50)
}).strict();

// --- 4. RATE LIMITING & BRUTE FORCE PROTECTION ---
class RateLimiter {
  constructor() {
    this.requests = new Map(); // ip -> [timestamps]
    this.authFailures = new Map(); // ip/user -> { count, lockedUntil }
  }

  // Global API rate limit: maxRequests per windowMs
  checkGlobal(ip, maxRequests = 100, windowMs = 60000) {
    const now = Date.now();
    const timestamps = (this.requests.get(ip) || []).filter(t => now - t < windowMs);
    if (timestamps.length >= maxRequests) {
      const oldest = timestamps[0];
      const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
      return { allowed: false, retryAfter };
    }
    timestamps.push(now);
    this.requests.set(ip, timestamps);
    return { allowed: true };
  }

  // Brute force defense: 5 failed attempts locks for 15 minutes
  checkAuthLockout(key) {
    const record = this.authFailures.get(key);
    if (!record) return { locked: false };
    const now = Date.now();
    if (record.lockedUntil && now < record.lockedUntil) {
      const waitSec = Math.ceil((record.lockedUntil - now) / 1000);
      return { locked: true, waitSec };
    }
    return { locked: false };
  }

  recordAuthFailure(key) {
    const now = Date.now();
    const record = this.authFailures.get(key) || { count: 0, lockedUntil: 0 };
    record.count += 1;
    if (record.count >= 5) {
      record.lockedUntil = now + (15 * 60 * 1000); // 15 minutes lockout
    }
    this.authFailures.set(key, record);
    return record;
  }

  resetAuthFailure(key) {
    this.authFailures.delete(key);
  }
}

const rateLimiter = new RateLimiter();

// --- 5. STRICT SECURITY HEADERS GENERATOR ---
function applySecurityHeaders(res, isApi = false) {
  // Strict Content-Security-Policy (no unsafe-eval, strict sources, no frame-ancestors)
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self' ws: wss:",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'"
  ];
  if (process.env.NODE_ENV === 'production') {
    cspDirectives.push("upgrade-insecure-requests");
  }
  const csp = cspDirectives.join('; ');

  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), clipboard-read=(self), clipboard-write=(self), fullscreen=(self)');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.removeHeader('X-Powered-By');

  if (isApi) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}

// --- 6. CENTRALIZED RBAC & TENANT AUTHORIZATION POLICY ---
function authorize(user, action, target) {
  if (!user) return { allowed: false, reason: 'unauthenticated' };

  // Admin has global least-privilege administrative access
  if (user.role === 'admin') return { allowed: true };

  // Instructor access rules: scoped only to their assigned cohorts
  if (user.role === 'instructor') {
    if (action.startsWith('admin.')) return { allowed: false, reason: 'insufficient_role' };
    if (target?.cohort && !user.cohorts?.includes(target.cohort)) {
      return { allowed: false, reason: 'cross_tenant_forbidden' };
    }
    return { allowed: true };
  }

  // Student access rules: strictly scoped to self and own cohort
  if (user.role === 'student') {
    if (action.startsWith('admin.') || action.startsWith('instructor.')) {
      return { allowed: false, reason: 'insufficient_role' };
    }
    if (target?.owner && target.owner !== user.id) {
      return { allowed: false, reason: 'ownership_violation' };
    }
    if (target?.tenant && target.tenant !== user.cohort) {
      return { allowed: false, reason: 'cross_tenant_forbidden' };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: 'unknown_role' };
}

// --- 7. CSRF VALIDATION ---
function validateCsrf(req) {
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;

  const origin = req.headers['origin'];
  const host = req.headers['host'];

  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) return false;
    } catch {
      return false;
    }
  }

  return true;
}

// --- 8. ISOLATED VM GATEWAY PROBE VALIDATOR ---
/**
 * Verifies that the connected VM is a sandboxed guest and NOT the developer/platform host
 */
function validateVmIsolation(probeOutput, hostMachineName = '') {
  if (!probeOutput || typeof probeOutput !== 'string') {
    return { safe: false, reason: 'empty_probe_output' };
  }
  const lower = probeOutput.toLowerCase();
  const host = (hostMachineName || '').toLowerCase();

  // Reject if kernel release indicates Microsoft WSL
  if (lower.includes('microsoft') || lower.includes('wsl')) {
    return { safe: false, reason: 'host_kernel_leak' };
  }
  // Reject if /mnt/c or Windows drive is mounted
  if (probeOutput.includes('HAS_MNTC') || lower.includes('/mnt/c')) {
    return { safe: false, reason: 'host_filesystem_leak' };
  }
  // Reject if hostname matches developer machine
  if (host && host.length > 2 && lower.includes(host)) {
    return { safe: false, reason: 'host_machine_leak' };
  }

  return { safe: true };
}

module.exports = {
  makeError,
  generateRequestId,
  sanitizeInput,
  stripAnsi,
  sanitizeCsvCell,
  checkPrototypePollution,
  isSafePath,
  isSsrfSafe,
  rateLimiter,
  applySecurityHeaders,
  authorize,
  validateCsrf,
  validateVmIsolation,
  // Zod Schemas
  LoginSchema,
  MfaVerifySchema,
  VmCreateSchema,
  VmRequestCreateSchema,
  UserCreateSchema,
  AclRuleSchema,
  ScriptRunSchema
};
