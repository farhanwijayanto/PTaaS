// Frontend Security & Validation Helper
// Provides client-side defense-in-depth, Unicode normalization, XSS encoding, and CSV formula sanitization.

export function sanitizeInput(val) {
  if (typeof val !== 'string') return val;
  return val.replace(/\0/g, '').normalize('NFKC').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

export function stripAnsi(val) {
  if (typeof val !== 'string') return val;
  return val.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

export function sanitizeCsvCell(val) {
  if (typeof val !== 'string') return val;
  const clean = val.trim();
  if (/^[=+\-@\t\r]/.test(clean)) {
    return `'${clean}`;
  }
  return clean;
}

export function validateEmail(email) {
  if (!email || typeof email !== 'string') return { valid: false, message: 'Email is required' };
  const clean = email.trim().toLowerCase();
  const rfcCheck = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!rfcCheck.test(clean)) return { valid: false, message: 'Invalid email format' };
  const domainCheck = /^[a-zA-Z0-9._%+-]+@([a-zA-Z0-9-]+\.)?example\.(com|org|edu)$/i;
  if (!domainCheck.test(clean)) {
    return { valid: false, message: 'Institutional domain required (@example.com, @example.org, @example.edu)' };
  }
  return { valid: true, value: clean };
}

export function validateVmName(name) {
  if (!name || typeof name !== 'string') return { valid: false, message: 'VM name is required' };
  const clean = name.trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]{2,30}$/.test(clean)) {
    return { valid: false, message: 'VM name must be 3-30 lowercase alphanumeric characters or hyphens (start with a letter)' };
  }
  return { valid: true, value: clean };
}

export function validatePassword(password) {
  if (!password || typeof password !== 'string') return { valid: false, message: 'Password is required' };
  if (password.length < 12) return { valid: false, message: 'Password must be at least 12 characters' };
  if (password.length > 128) return { valid: false, message: 'Password cannot exceed 128 characters' };
  return { valid: true };
}

export function validateIdentifier(id) {
  if (!id || typeof id !== 'string') return { valid: false, message: 'ID is required' };
  if (!/^[A-Z]{3}-\d{4,8}$/.test(id.trim())) {
    return { valid: false, message: 'ID must match standard format ABC-1234 (e.g. STU-0001)' };
  }
  return { valid: true, value: id.trim() };
}
