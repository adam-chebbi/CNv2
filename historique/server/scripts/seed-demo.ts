// Fills the terminal with ~3 months of realistic demo data for a Tunisian café, so the history and
// totals can be tried out. Every row is tagged with DEMO_USER_ID, so it can be removed in one go
// without touching real entries:
//
//   npx tsx server/scripts/seed-demo.ts --from 2026-07-10 --to 2026-10-08   # insert
//   npx tsx server/scripts/seed-demo.ts --remove                            # delete demo rows
//
// Existing (real) records are never overwritten: a (date, service) that already exists is skipped.
// Uses HISTORIQUE_DB_PATH like the server. Deterministic (seeded random), so a re-run is identical.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { DEFAULT_DATA_DIR, openDatabase } from '../db/connection.js';
import { addDays, computeCaisse, type DepenseLigne, type ShiftId } from '../../shared/model.js';

process.env.TZ = process.env.TZ || 'Africa/Tunis';

export const DEMO_USER_ID = 'seed-demo';
const DEMO_USER_NAME = 'Données de démonstration';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const db = openDatabase(process.env.HISTORIQUE_DB_PATH || path.join(DEFAULT_DATA_DIR, 'historique.sqlite3'));

if (args.includes('--remove')) {
  const n = db.prepare('DELETE FROM caisses WHERE cree_par_id = ?').run(DEMO_USER_ID).changes;
  db.prepare('DELETE FROM activity_log WHERE user_id = ?').run(DEMO_USER_ID);
  console.log(`${n} enregistrement(s) de démonstration supprimé(s).`);
  process.exit(0);
}

const from = arg('--from');
const to = arg('--to');
if (!from || !to || from > to) {
  console.error('Usage : --from AAAA-MM-JJ --to AAAA-MM-JJ   (ou --remove)');
  process.exit(1);
}

// Mulberry32 — small seeded PRNG, re-seeded per (date, service) so every service always gets the
// same values and the same "no entry" decision, whatever was generated before it.
let seed = 0x5eed2026;
const reseed = (key: string) => {
  let h = 0x5eed2026;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  seed = h;
};
const rand = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (min: number, max: number) => min + rand() * (max - min);
const pick = <T,>(list: T[]): T => list[Math.floor(rand() * list.length)];
// Till amounts end in 100 millimes (prices like 1,800 or 2,500 DT).
const roundTo = (millimes: number, step: number) => Math.round(millimes / step) * step;

// Public holidays and busy dates in the period (Tunisia, 2026).
const HOLIDAYS: Record<string, number> = {
  '2026-07-25': 1.35, // Fête de la République
  '2026-08-13': 1.3, // Fête de la Femme
  '2026-08-25': 1.25, // Mouled (approx.)
  '2026-10-15': 1.2, // Fête de l'Évacuation
};

// [label, min DT, max DT, weight] — what a café pays cash from the till during a service.
const DEPENSES: [string, number, number, number][] = [
  ['Lait Délice', 18, 60, 9],
  ['Pain et baguettes', 8, 25, 8],
  ['Croissants (boulangerie)', 20, 70, 5],
  ['Eau minérale Safia', 15, 45, 6],
  ['Glaçons', 6, 18, 5],
  ['Citrons et oranges (jus)', 12, 40, 5],
  ['Sucre', 10, 30, 3],
  ['Bouteille de gaz', 25, 32, 2],
  ['Charbon chicha', 15, 40, 4],
  ['Produits de nettoyage', 10, 35, 3],
  ['Transport / taxi', 5, 20, 3],
  ['Journal', 1.2, 2.4, 2],
  ['Petite réparation', 20, 90, 1],
  ['Avance employé', 20, 100, 1],
];
const depenseWeights = DEPENSES.reduce((s, d) => s + d[3], 0);
const pickDepense = (): DepenseLigne => {
  let r = rand() * depenseWeights;
  for (const [libelle, min, max, w] of DEPENSES) {
    r -= w;
    if (r <= 0) return { libelle, montant: roundTo(between(min, max) * 1000, 100) };
  }
  return { libelle: 'Divers', montant: 10000 };
};

const caFor = (date: string, shift: ShiftId): number => {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0 = Sunday
  const weekend = dow === 0 || dow === 6;
  const summer = m === 7 || m === 8;
  let base = shift === 'matin' ? between(420, 820) : between(650, 1350);
  if (weekend) base *= shift === 'matin' ? 1.2 : 1.3;
  if (summer && shift === 'soir') base *= 1.25; // terraces full on summer evenings
  if (m === 9 && d <= 20) base *= 0.92; // rentrée: households tighten their budget
  base *= HOLIDAYS[date] ?? 1;
  return roundTo(base * 1000, 100);
};

const insert = db.prepare(
  `INSERT INTO caisses (id, date, shift, ca, depenses, total_depenses, attendu_caisse, tpe, tickets_resto, especes, cree_par_id, cree_par_nom, cree_le)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const exists = db.prepare('SELECT 1 FROM caisses WHERE date = ? AND shift = ?');

let inserted = 0;
let skipped = 0;
db.transaction(() => {
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const [y, m, d] = date.split('-').map(Number);
    const weekend = [0, 6].includes(new Date(y, m - 1, d).getDay());
    for (const shift of ['matin', 'soir'] as ShiftId[]) {
      reseed(`${date}:${shift}`);
      if (exists.get(date, shift)) {
        skipped += 1;
        continue;
      }
      if (rand() < 0.02) continue; // the odd service with no entry (closure, power cut…)

      const ca = caFor(date, shift);
      const nbDepenses = Math.floor(between(0, shift === 'matin' ? 4 : 3.2));
      const depenses = Array.from({ length: nbDepenses }, pickDepense);
      const tpe = roundTo(ca * between(0.14, weekend ? 0.32 : 0.26), 100);
      // Tickets resto: weekday lunch mostly (5, 7 and 10 DT tickets).
      const nbTickets = shift === 'matin' && !weekend ? Math.floor(between(3, 14)) : rand() < 0.25 ? Math.floor(between(0, 3)) : 0;
      const ticketsResto = Array.from({ length: nbTickets }, () => pick([5000, 5000, 7000, 10000])).reduce((s, v) => s + v, 0);

      const input = { ca, depenses, tpe, ticketsResto };
      const c = computeCaisse(input);
      if (c.especes < 0) continue;
      const createdAt = new Date(`${date}T${shift === 'matin' ? '15:3' : '23:4'}${Math.floor(rand() * 10)}:00`);
      if (shift === 'soir' && rand() < 0.4) {
        // late closings are entered after midnight
        createdAt.setDate(createdAt.getDate() + 1);
        createdAt.setHours(0, Math.floor(rand() * 50));
      }
      insert.run(randomUUID(), date, shift, ca, JSON.stringify(depenses), c.totalDepenses, c.attenduCaisse, tpe, ticketsResto, c.especes, DEMO_USER_ID, DEMO_USER_NAME, createdAt.toISOString());
      inserted += 1;
    }
  }
  db.prepare(
    `INSERT INTO activity_log (id, timestamp, user_id, user_name, module, action, description) VALUES (?, ?, ?, ?, 'caisse', 'import', ?)`
  ).run(randomUUID(), new Date().toISOString(), DEMO_USER_ID, DEMO_USER_NAME, `Import de données de démonstration du ${from} au ${to} (${inserted} services)`);
})();

const totals = db.prepare('SELECT COUNT(*) AS n, SUM(ca) AS ca, SUM(especes) AS esp, MIN(date) AS d1, MAX(date) AS d2 FROM caisses WHERE cree_par_id = ?').get(DEMO_USER_ID) as {
  n: number;
  ca: number;
  esp: number;
  d1: string;
  d2: string;
};
console.log(`${inserted} service(s) ajouté(s), ${skipped} déjà existant(s) laissé(s) intact(s).`);
console.log(`Démo : ${totals.n} services du ${totals.d1} au ${totals.d2}, CA total ${(totals.ca / 1000).toFixed(3)} DT, espèces ${(totals.esp / 1000).toFixed(3)} DT.`);
