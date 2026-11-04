// Daily backup of the database (cahier des charges §18.3), meant to run from cron:
//
//   0 3 * * *  cd /var/www/CNv2 && TZ=Africa/Tunis npm run backup
//
// Uses SQLite's online backup API: a consistent copy even while the café is working (never a plain
// file copy of a WAL database). Keeps BACKUP_KEEP_DAYS days (30 by default) in BACKUP_DIR
// (server/data/backups by default) and records the time of the last backup, shown on the
// "Mise en service" screen. Copy BACKUP_DIR off the server as well.

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH ?? path.join(here, '..', 'data', 'cafenoir.sqlite3');
const backupDir = process.env.BACKUP_DIR ?? path.join(path.dirname(dbPath), 'backups');
const keepDays = Number(process.env.BACKUP_KEEP_DAYS ?? 30);

if (!fs.existsSync(dbPath)) {
  console.error(`Base introuvable : ${dbPath}`);
  process.exit(1);
}
fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Africa/Tunis' }).replace(/[-: ]/g, '').slice(0, 12);
const target = path.join(backupDir, `cafenoir-${stamp}.sqlite3`);

const db = new Database(dbPath);
await db.backup(target);
db.prepare(
  `INSERT INTO pos_settings (key, value, updated_at, updated_by) VALUES ('last_backup_at', ?, ?, 'Sauvegarde')
   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
).run(new Date().toISOString(), new Date().toISOString());
db.close();

// Retention.
const cutoff = Date.now() - keepDays * 86_400_000;
let removed = 0;
fs.readdirSync(backupDir)
  .filter((f) => /^cafenoir-\d{12}\.sqlite3$/.test(f))
  .forEach((f) => {
    const full = path.join(backupDir, f);
    if (fs.statSync(full).mtimeMs < cutoff) {
      fs.rmSync(full);
      removed += 1;
    }
  });

console.log(`Sauvegarde créée : ${target} (${Math.round(fs.statSync(target).size / 1024)} Ko). ${removed} ancienne(s) supprimée(s).`);
