// Restore test (cahier des charges §18.3 — "procédure de restauration vérifiée avant mise en
// production"). Opens a backup read-only — never touching the live data — checks its integrity
// and compares its contents with the live database, then records the date of the successful test.
//
//   npm run backup:verify                 # latest backup in BACKUP_DIR
//   npm run backup:verify -- <file>       # a given backup
//
// To actually restore: stop the application (pm2 stop), copy the backup over
// server/data/cafenoir.sqlite3 (removing the -wal and -shm files), start it again.

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH ?? path.join(here, '..', 'data', 'cafenoir.sqlite3');
const backupDir = process.env.BACKUP_DIR ?? path.join(path.dirname(dbPath), 'backups');

const latest = (): string | null => {
  if (!fs.existsSync(backupDir)) return null;
  const files = fs.readdirSync(backupDir).filter((f) => /^cafenoir-\d{12}\.sqlite3$/.test(f)).sort();
  return files.length ? path.join(backupDir, files[files.length - 1]) : null;
};

const file = process.argv[2] ?? latest();
if (!file || !fs.existsSync(file)) {
  console.error('Aucune sauvegarde à vérifier.');
  process.exit(1);
}

const TABLES = ['users', 'catalog_articles', 'stock_products', 'stock_ledger', 'sales_transactions', 'pos_sales', 'pos_payments', 'cash_sessions', 'customers', 'activity_log'];

const backup = new Database(file, { readonly: true, fileMustExist: true });
const integrity = (backup.pragma('integrity_check') as { integrity_check: string }[])[0]?.integrity_check;
if (integrity !== 'ok') {
  console.error(`ÉCHEC : intégrité de la sauvegarde = ${integrity}`);
  process.exit(2);
}

const live = new Database(dbPath);
const exists = (d: Database.Database, t: string) => Boolean(d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t));
const countOf = (d: Database.Database, t: string) => (exists(d, t) ? (d.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n : null);

console.log(`Sauvegarde : ${file}`);
console.log('Table                  sauvegarde   base actuelle');
let suspicious = false;
TABLES.forEach((t) => {
  const b = countOf(backup, t);
  const l = countOf(live, t);
  // The live database only grows (nothing is ever deleted): a backup holding more rows than the
  // live data, or missing a table, is suspicious.
  if (b === null || (l !== null && b > l)) suspicious = true;
  console.log(`${t.padEnd(22)} ${String(b ?? '—').padStart(10)}   ${String(l ?? '—').padStart(13)}`);
});
backup.close();

if (suspicious) {
  console.error('ATTENTION : contenu inattendu, vérifiez la sauvegarde avant de vous y fier.');
  live.close();
  process.exit(3);
}

live
  .prepare(
    `INSERT INTO pos_settings (key, value, updated_at, updated_by) VALUES ('last_restore_check_at', ?, ?, 'Test de restauration')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  )
  .run(new Date().toISOString(), new Date().toISOString());
live.close();
console.log('OK : sauvegarde intègre et lisible. Date du test enregistrée.');
