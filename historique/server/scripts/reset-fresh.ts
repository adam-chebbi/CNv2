// Wipes EVERYTHING in the Historique database (caisses, avances, names, journal, accounts,
// sessions, legacy tables) and creates the given accounts — a fresh start. Back up the database
// first. Accounts are read as JSON from stdin, so no password is ever written in the repository or
// visible in the process list:
//
//   echo '[{"email":"a@b.tn","fullName":"…","password":"…","role":"admin","mustChangePassword":true}]' \
//     | npx tsx server/scripts/reset-fresh.ts --confirm
//
// Uses HISTORIQUE_DB_PATH like the server. Restart the server afterwards.
import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';
import { DEFAULT_DATA_DIR, openDatabase } from '../db/connection.js';
import { createUser, MIN_PASSWORD_LENGTH } from '../lib/localAuth.js';
import { currentBusinessDate } from '../../shared/model.js';

process.env.TZ = process.env.TZ || 'Africa/Tunis';

if (!process.argv.includes('--confirm')) {
  console.error('Refusé : ajoutez --confirm (toutes les données Historique seront effacées).');
  process.exit(1);
}

const accountsSchema = z
  .array(
    z.object({
      email: z.string().email(),
      fullName: z.string().trim().min(1),
      password: z.string().min(MIN_PASSWORD_LENGTH, `mot de passe : ${MIN_PASSWORD_LENGTH} caractères minimum`),
      role: z.enum(['admin', 'gerant']),
      mustChangePassword: z.boolean(),
    })
  )
  .min(1, 'au moins un compte');

const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
};

const accounts = accountsSchema.parse(JSON.parse(await readStdin()));
const db = openDatabase(process.env.HISTORIQUE_DB_PATH || path.join(DEFAULT_DATA_DIR, 'historique.sqlite3'));

const DATA_TABLES = ['caisses', 'avances', 'avance_employes', 'activity_log', 'sessions', 'users'];
const LEGACY_TABLES = ['chiffres_affaires', 'comptages', 'ventes', 'depenses', 'mouvements', 'notes', 'referentiels', 'journees'];

const counts: Record<string, number> = {};
db.pragma('foreign_keys = OFF');
db.transaction(() => {
  for (const t of DATA_TABLES) counts[t] = db.prepare(`DELETE FROM ${t}`).run().changes;
  for (const t of LEGACY_TABLES) {
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t)) {
      counts[t] = (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
      db.exec(`DROP TABLE ${t}`);
    }
  }
  // The terminal's first selectable day starts again from today.
  db.prepare("INSERT INTO settings (key, value) VALUES ('dateDebut', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(currentBusinessDate()));
  for (const a of accounts) createUser(db, a);
})();
db.pragma('foreign_keys = ON');
db.exec('VACUUM');

console.log('Supprimé :', JSON.stringify(counts));
console.log(`Date de début : ${currentBusinessDate()}`);
for (const a of accounts) console.log(`Compte créé : ${a.email} (${a.role}${a.mustChangePassword ? ', mot de passe temporaire' : ''})`);
