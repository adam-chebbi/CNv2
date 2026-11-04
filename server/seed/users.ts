import { db } from '../db/connection.js';
import { hashPassword } from '../lib/password.js';

const CIN = '12345678';

export const seedUsers = (): void => {
  // Temporary password is always the account's own CIN (see server/routes/roles.ts) — the seeded
  // Super Admin logs in with CIN 12345678 as both identifier and password, then is forced to set a
  // real one via the change-password screen, same flow as any other new account.
  db.prepare(
    'INSERT INTO users (id, full_name, cin, password_hash, must_change_password, created_at) VALUES (?, ?, ?, ?, 1, ?)'
  ).run('user-1', 'Adam CHEBBI', CIN, hashPassword(CIN), new Date().toISOString());
};
