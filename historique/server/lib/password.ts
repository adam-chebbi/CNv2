import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// Same scheme as the main app (server/lib/password.ts there), but this app keeps its own accounts:
// scrypt with a per-password salt, stored as "<salt-hex>:<hash-hex>".
const KEY_LENGTH = 64;

export const hashPassword = (password: string): string => {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, KEY_LENGTH).toString('hex')}`;
};

export const verifyPassword = (password: string, stored: string | null | undefined): boolean => {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const candidate = scryptSync(password, salt, KEY_LENGTH);
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
};
