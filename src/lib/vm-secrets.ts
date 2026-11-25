import crypto from 'crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+';

function getEncryptionKey(): Buffer {
  const raw =
    process.env.VM_SECRET_ENCRYPTION_KEY ||
    process.env.SESSION_SECRET ||
    process.env.GUAC_SECRET_KEY ||
    'ptaas-vm-secret-encryption-fallback-32b';
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

/**
 * Generates a cryptographically strong random per-VM password (>= 24 chars).
 * Never reused across VMs and never returns hardcoded defaults like `student123`.
 */
export function generateStrongVmPassword(length = 28): string {
  const len = Math.max(20, length);
  const bytes = crypto.randomBytes(len * 2);
  let out = '';
  for (let i = 0; i < bytes.length && out.length < len; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  // Guarantee at least one upper, lower, digit, and symbol
  const prefix = [
    'ABCDEFGHJKLMNPQRSTUVWXYZ'[bytes[0] % 24],
    'abcdefghijkmnopqrstuvwxyz'[bytes[1] % 25],
    '23456789'[bytes[2] % 8],
    '!@#$%^&*'[bytes[3] % 8],
  ].join('');
  return (prefix + out).slice(0, len);
}

/**
 * Encrypts a VM secret at rest using AES-256-GCM.
 */
export function encryptVmSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

/**
 * Decrypts a stored VM secret for backend-only tunnel injection (Guacamole / SSH).
 * Never expose decrypted values in REST API responses or logs.
 */
export function decryptVmSecret(ciphertext: string | undefined | null): string | null {
  if (!ciphertext || typeof ciphertext !== 'string') return null;
  const parts = ciphertext.split('.');
  if (parts.length !== 3) return null;
  try {
    const iv = Buffer.from(parts[0], 'base64url');
    const tag = Buffer.from(parts[1], 'base64url');
    const enc = Buffer.from(parts[2], 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return null;
  }
}
