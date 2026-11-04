import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { currentBusinessDate, toIsoDate } from '../../shared/model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type Db = Database.Database;

export const DEFAULT_DATA_DIR = path.join(__dirname, '..', 'data');

// Tables of the first, richer version of the app (ventes, notes, clôture…), replaced by the single
// `caisses` table. Dropped only while still empty, so no data is ever lost by this cleanup.
const LEGACY_TABLES = ['chiffres_affaires', 'comptages', 'ventes', 'depenses', 'mouvements', 'notes', 'referentiels', 'journees'];

// Opens (and creates/migrates) the Historique database. Taking the path as a parameter lets the
// tests run against a throwaway file without touching the real one.
export const openDatabase = (dbPath: string): Db => {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8'));

  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?");
  LEGACY_TABLES.forEach((t) => {
    if (!exists.get(t)) return;
    const { n } = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number };
    if (n === 0) db.exec(`DROP TABLE ${t}`);
  });

  // The first day the app existed — the earliest date the terminal lets anyone pick. Taken from the
  // oldest trace in the database (first login), else today, and then frozen.
  if (!db.prepare("SELECT 1 FROM settings WHERE key = 'dateDebut'").get()) {
    const first = db.prepare('SELECT MIN(timestamp) AS t FROM activity_log').get() as { t: string | null };
    const firstCaisse = db.prepare('SELECT MIN(date) AS d FROM caisses').get() as { d: string | null };
    // Business date (not the calendar date): before the 5 a.m. switch it is still yesterday's service.
    const candidates = [first.t ? toIsoDate(new Date(first.t)) : null, firstCaisse.d, currentBusinessDate()].filter(Boolean) as string[];
    db.prepare("INSERT INTO settings (key, value) VALUES ('dateDebut', ?)").run(JSON.stringify(candidates.sort()[0]));
  }

  return db;
};
