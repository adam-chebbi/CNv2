import { randomUUID } from 'node:crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  ISO_DATE,
  PERM_SUPERVISE,
  SHIFT_LABELS,
  computeCaisse,
  daysBetween,
  formatDT,
  formatDateFr,
  isShiftId,
  userCan,
  validateCaisse,
  type ShiftId,
} from '../../shared/model.js';
import { ApiError, asyncHandler } from '../lib/http.js';
import { mapCaisse, nowIso, type Store } from '../lib/store.js';

const amount = z.number({ error: 'Montant invalide.' }).int('Montant invalide.').min(0, 'Montant négatif interdit.').max(100_000_000, 'Montant trop élevé.');

const caisseSchema = z.object({
  ca: amount,
  depenses: z
    .array(z.object({ libelle: z.string().trim().max(120), montant: amount }))
    .max(50, 'Trop de lignes de dépenses.'),
  tpe: amount,
  ticketsResto: amount,
});

export const caisseRouter = (store: Store): Router => {
  const router = Router();
  const { db } = store;

  const params = (req: Request): { date: string; shift: ShiftId } => {
    const date = String(req.params.date);
    const shift = String(req.params.shift ?? 'matin');
    if (!ISO_DATE.test(date)) throw new ApiError(400, 'Date invalide.');
    if (!isShiftId(shift)) throw new ApiError(400, 'Service inconnu.');
    return { date, shift };
  };

  // Dates a person may pick: from the app's first day up to today. A Gérant can still correct the
  // last few days; older days are read-only unless they supervise.
  const writeCheck = (req: Request, date: string): string | null => {
    const today = store.businessToday();
    if (date > today) return 'Impossible de saisir sur une date future.';
    if (date < store.dateDebut()) return 'Cette date est antérieure à la mise en service de la caisse.';
    const { joursRattrapage } = store.getSettings();
    if (!userCan(req.user, PERM_SUPERVISE) && daysBetween(date, today) > joursRattrapage) {
      return `Journée trop ancienne : seules les ${joursRattrapage + 1} dernières journées peuvent être modifiées. Demandez au responsable.`;
    }
    return null;
  };

  router.get(
    '/caisse/meta',
    asyncHandler((_req, res) => {
      res.json({ dateDebut: store.dateDebut(), today: store.businessToday() });
    })
  );

  // Both services of a day at once — the terminal shows which one is already filled in.
  router.get(
    '/caisse/:date',
    asyncHandler((req, res) => {
      const { date } = params(req);
      const rows = db.prepare('SELECT * FROM caisses WHERE date = ?').all(date) as Record<string, unknown>[];
      const blocked = writeCheck(req, date);
      res.json({ date, items: rows.map(mapCaisse), canWrite: blocked === null, reason: blocked });
    })
  );

  // Save = create or correct. Idempotent on (date, service), so a save replayed by the offline
  // queue just writes the same values again.
  router.put(
    '/caisse/:date/:shift',
    asyncHandler((req, res) => {
      const { date, shift } = params(req);
      const blocked = writeCheck(req, date);
      if (blocked) throw new ApiError(403, blocked, 'LECTURE_SEULE');
      const input = caisseSchema.parse(req.body);
      input.depenses = input.depenses.filter((d) => d.montant > 0 || d.libelle);
      const problem = validateCaisse(input);
      if (problem) throw new ApiError(400, problem);
      const calc = computeCaisse(input);

      const item = db.transaction(() => {
        const beforeRow = db.prepare('SELECT * FROM caisses WHERE date = ? AND shift = ?').get(date, shift) as Record<string, unknown> | undefined;
        const before = beforeRow ? mapCaisse(beforeRow) : null;
        if (before) {
          db.prepare(
            `UPDATE caisses SET ca = ?, depenses = ?, total_depenses = ?, attendu_caisse = ?, tpe = ?, tickets_resto = ?, especes = ?, maj_par_nom = ?, maj_le = ?
             WHERE id = ?`
          ).run(input.ca, JSON.stringify(input.depenses), calc.totalDepenses, calc.attenduCaisse, input.tpe, input.ticketsResto, calc.especes, req.user!.fullName, nowIso(), before.id);
        } else {
          db.prepare(
            `INSERT INTO caisses (id, date, shift, ca, depenses, total_depenses, attendu_caisse, tpe, tickets_resto, especes, cree_par_id, cree_par_nom, cree_le)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(randomUUID(), date, shift, input.ca, JSON.stringify(input.depenses), calc.totalDepenses, calc.attenduCaisse, input.tpe, input.ticketsResto, calc.especes, req.user!.id, req.user!.fullName, nowIso());
        }
        const after = mapCaisse(db.prepare('SELECT * FROM caisses WHERE date = ? AND shift = ?').get(date, shift) as Record<string, unknown>);
        store.log(req, {
          module: 'caisse',
          action: before ? 'modification' : 'creation',
          description: `${before ? 'Correction' : 'Saisie'} caisse ${SHIFT_LABELS[shift].toLowerCase()} du ${formatDateFr(date, false)} : CA ${formatDT(input.ca)}, dépenses ${formatDT(calc.totalDepenses)}, TPE ${formatDT(input.tpe)}, tickets ${formatDT(input.ticketsResto)}, espèces ${formatDT(calc.especes)}`,
          journeeDate: date,
          entityId: after.id,
          details: { avant: before, apres: after },
        });
        return after;
      })();
      res.json({ item });
    })
  );

  // History: every saved service in a period, newest first, with the period's totals.
  router.get(
    '/caisse',
    asyncHandler((req, res) => {
      const q = z
        .object({ from: z.string().regex(ISO_DATE).optional(), to: z.string().regex(ISO_DATE).optional() })
        .parse(req.query);
      const where: string[] = [];
      const p: unknown[] = [];
      if (q.from) (where.push('date >= ?'), p.push(q.from));
      if (q.to) (where.push('date <= ?'), p.push(q.to));
      const rows = db
        .prepare(`SELECT * FROM caisses ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY date DESC, CASE shift WHEN 'soir' THEN 0 ELSE 1 END LIMIT 1000`)
        .all(...p) as Record<string, unknown>[];
      const items = rows.map(mapCaisse);
      const totals = items.reduce(
        (t, i) => ({
          ca: t.ca + i.ca,
          depenses: t.depenses + i.totalDepenses,
          caisse: t.caisse + i.attenduCaisse,
          tpe: t.tpe + i.tpe,
          ticketsResto: t.ticketsResto + i.ticketsResto,
          especes: t.especes + i.especes,
        }),
        { ca: 0, depenses: 0, caisse: 0, tpe: 0, ticketsResto: 0, especes: 0 }
      );
      res.json({ items, totals });
    })
  );

  return router;
};
