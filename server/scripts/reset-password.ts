// Resets an account's password from the server console, e.g. when the Super Admin is locked out.
// Generates a strong temporary password, forces a change at the next login and signs the account
// out everywhere. Run: npm run reset-password -- <CIN>   (DB_PATH selects the database)

import { randomInt } from 'node:crypto';

const cin = process.argv[2]?.trim();
if (!cin) {
  console.error('usage: npm run reset-password -- <CIN>');
  process.exit(1);
}

const { prepareDatabase } = await import('../app.js');
const { db } = await import('../db/connection.js');
const { hashPassword } = await import('../lib/password.js');
prepareDatabase();

const user = db.prepare('SELECT id, full_name FROM users WHERE cin = ?').get(cin) as { id: string; full_name: string } | undefined;
if (!user) {
  console.error(`Aucun compte avec le CIN ${cin}.`);
  process.exit(1);
}

// No look-alike characters (0/O, 1/l/I) so it can be read out over the phone.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
const temp = Array.from({ length: 14 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

db.transaction(() => {
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1, password_updated_at = ? WHERE id = ?').run(hashPassword(temp), new Date().toISOString(), user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
})();

console.log(`Mot de passe réinitialisé pour ${user.full_name} (CIN ${cin}).`);
console.log(`Mot de passe temporaire : ${temp}`);
console.log('Il devra être changé à la prochaine connexion.');
