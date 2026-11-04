import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// Password hashing via Node's built-in scrypt — no extra dependency (bcrypt/argon2 would each add
// a native module to build on the VPS, on top of the one better-sqlite3 already needs). Stored as
// "<salt-hex>:<hash-hex>" in users.password_hash so the salt travels with the hash, no separate
// column needed.

const KEY_LENGTH = 64;

export const hashPassword = (password: string): string => {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
};

export const verifyPassword = (password: string, stored: string | null | undefined): boolean => {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, 'hex');
  const candidateBuffer = scryptSync(password, salt, KEY_LENGTH);
  // Buffers of different lengths would throw in timingSafeEqual rather than just comparing false —
  // guarded explicitly since a corrupted/foreign hash format must never crash the login request.
  if (hashBuffer.length !== candidateBuffer.length) return false;
  return timingSafeEqual(hashBuffer, candidateBuffer);
};
