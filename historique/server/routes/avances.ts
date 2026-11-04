import { randomUUID } from 'node:crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  AVANCE_DELETE_WINDOW_MS,
  ISO_DATE,
  PERM_SUPERVISE,
  cleanName,
  formatDT,
  formatDateFr,
  normalizeName,
  toIsoDate,
  userCan,
  type Avance,
} from '../../shared/model.js';
import { ApiError, asyncHandler, notFound } from '../lib/http.js';
import type { LocalAuth } from '../lib/localAuth.js';
import { nowIso, type Store } from '../lib/store.js';

// Avances au personnel — independent from the caisse (see shared/model.ts). Nothing here reads or
// writes the `caisses` table.

const createSchema = z
  .object({
    id: z.string().uuid().optional(),
    employe: z.string().trim().min(2, "Indiquez le nom de l'employé.").max(80, 'Nom trop long.'),
    montant: z.number({ error: 'Montant invalide.' }).int('Montant invalide.').positive("Saisissez le montant de l'avance.").max(100_000_000, 'Montant trop élevé.'),
    motif: z.string().trim().max(40).nullable().optional(),
    commentaire: z.string().trim().max(300).nullable().optional(),
    saisieManuelle: z.boolean().default(false),
    date: z.string().regex(ISO_DATE, 'Date invalide.').optional(),
    heure: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure invalide.').optional(),
  })
  .superRefine((v, ctx) => {
    if (v.saisieManuelle && (!v.date || !v.heure)) ctx.addIssue({ code: 'custom', path: ['date'], message: "Indiquez la date et l'heure de l'avance." });
  });

const pad = (n: number) => String(n).padStart(2, '0');
const clockNow = () => {
  const d = new Date();
  return { date: toIsoDate(d), heure: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
};

export const avancesRouter = (store: Store, auth: Pick<LocalAuth, 'verifyPassword'>): Router => {
  const router = Router();
  const { db } = store;

  const canDelete = (req: Request, r: Record<string, unknown>) =>
    !r.supprime_le &&
    Date.now() - new Date(String(r.cree_le)).getTime() < AVANCE_DELETE_WINDOW_MS &&
    (r.cree_par_id === req.user!.id || userCan(req.user, PERM_SUPERVISE));

  const map = (req: Request, r: Record<string, unknown>): Avance => ({
    id: String(r.id),
    employe: String(r.employe),
    montant: Number(r.montant),
    motif: (r.motif as string) ?? null,
    commentaire: (r.commentaire as string) ?? null,
    date: String(r.date),
    heure: String(r.heure),
    saisieManuelle: Number(r.saisie_manuelle) === 1,
    creeParId: String(r.cree_par_id),
    creeParNom: String(r.cree_par_nom),
    creeLe: String(r.cree_le),
    supprimable: canDelete(req, r),
    supprimableJusqua: new Date(new Date(String(r.cree_le)).getTime() + AVANCE_DELETE_WINDOW_MS).toISOString(),
  });

  // Names typed before, most recently used first — suggested in the form.
  router.get(
    '/avances/employes',
    asyncHandler((_req, res) => {
      const rows = db
        .prepare(
          `SELECT e.nom, COUNT(a.id) AS nb, COALESCE(SUM(a.montant), 0) AS total
           FROM avance_employes e LEFT JOIN avances a ON a.employe_cle = e.cle AND a.supprime_le IS NULL
           GROUP BY e.cle ORDER BY e.dernier_usage DESC LIMIT 200`
        )
        .all() as { nom: string; nb: number; total: number }[];
      res.json({ items: rows });
    })
  );

  // How much an employee already received this month — shown before confirming a new avance.
  router.get(
    '/avances/employe-mois',
    asyncHandler((req, res) => {
      const nom = z.string().trim().min(1).max(80).parse(req.query.nom);
      const month = store.businessToday().slice(0, 7);
      const r = db
        .prepare("SELECT COUNT(*) AS nb, COALESCE(SUM(montant), 0) AS total FROM avances WHERE employe_cle = ? AND supprime_le IS NULL AND substr(date, 1, 7) = ?")
        .get(normalizeName(nom), month) as { nb: number; total: number };
      res.json(r);
    })
  );

  router.get(
    '/avances',
    asyncHandler((req, res) => {
      const q = z
        .object({ from: z.string().regex(ISO_DATE).optional(), to: z.string().regex(ISO_DATE).optional(), employe: z.string().max(80).optional() })
        .parse(req.query);
      const where = ['supprime_le IS NULL'];
      const p: unknown[] = [];
      if (q.from) (where.push('date >= ?'), p.push(q.from));
      if (q.to) (where.push('date <= ?'), p.push(q.to));
      if (q.employe) (where.push('employe_cle = ?'), p.push(normalizeName(q.employe)));
      const rows = db.prepare(`SELECT * FROM avances WHERE ${where.join(' AND ')} ORDER BY date DESC, heure DESC LIMIT 2000`).all(...p) as Record<string, unknown>[];
      const items = rows.map((r) => map(req, r));
      const byEmploye = new Map<string, { employe: string; nb: number; total: number }>();
      items.forEach((a) => {
        const k = normalizeName(a.employe);
        const e = byEmploye.get(k) ?? { employe: a.employe, nb: 0, total: 0 };
        e.nb += 1;
        e.total += a.montant;
        byEmploye.set(k, e);
      });
      res.json({
        items,
        total: items.reduce((s, a) => s + a.montant, 0),
        parEmploye: [...byEmploye.values()].sort((a, b) => b.total - a.total),
      });
    })
  );

  router.post(
    '/avances',
    asyncHandler((req, res) => {
      const v = createSchema.parse(req.body);
      if (v.id) {
        const existing = db.prepare('SELECT * FROM avances WHERE id = ?').get(v.id) as Record<string, unknown> | undefined;
        if (existing) {
          res.json({ item: map(req, existing), duplicate: true });
          return;
        }
      }
      const { date, heure } = v.saisieManuelle ? { date: v.date!, heure: v.heure! } : clockNow();
      if (v.saisieManuelle) {
        const when = new Date(`${date}T${heure}:00`);
        if (when.getTime() > Date.now() + 2 * 60 * 1000) throw new ApiError(400, "La date et l'heure ne peuvent pas être dans le futur.");
        if (date < store.dateDebut()) throw new ApiError(400, `Date trop ancienne : pas avant le ${formatDateFr(store.dateDebut(), false)}.`);
      }
      const employe = cleanName(v.employe);
      const cle = normalizeName(employe);
      const id = v.id ?? randomUUID();
      const item = db.transaction(() => {
        db.prepare(
          `INSERT INTO avances (id, employe, employe_cle, montant, motif, commentaire, date, heure, saisie_manuelle, cree_par_id, cree_par_nom, cree_le)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(id, employe, cle, v.montant, v.motif || null, v.commentaire || null, date, heure, v.saisieManuelle ? 1 : 0, req.user!.id, req.user!.fullName, nowIso());
        // Remember the name (keeps the most recent spelling).
        db.prepare('INSERT INTO avance_employes (cle, nom, dernier_usage) VALUES (?, ?, ?) ON CONFLICT(cle) DO UPDATE SET nom = excluded.nom, dernier_usage = excluded.dernier_usage').run(
          cle,
          employe,
          nowIso()
        );
        store.log(req, {
          module: 'avance',
          action: 'creation',
          description: `Avance de ${formatDT(v.montant)} à ${employe} le ${formatDateFr(date, false)} à ${heure}${v.saisieManuelle ? ' (date saisie manuellement)' : ''}`,
          journeeDate: date,
          entityId: id,
          details: { ...v, date, heure, employe },
        });
        return map(req, db.prepare('SELECT * FROM avances WHERE id = ?').get(id) as Record<string, unknown>);
      })();
      res.status(201).json({ item });
    })
  );

  // Deletion: within 24 h of the entry, by its author or a supervisor, after the password check.
  // The row is kept (hidden from every list) with who deleted it and when.
  router.post(
    '/avances/:id/supprimer',
    asyncHandler(async (req, res) => {
      const { password } = z.object({ password: z.string().min(1, 'Saisissez votre mot de passe.') }).parse(req.body);
      const row = db.prepare('SELECT * FROM avances WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
      if (!row || row.supprime_le) throw notFound('Avance');
      if (Date.now() - new Date(String(row.cree_le)).getTime() >= AVANCE_DELETE_WINDOW_MS) {
        throw new ApiError(403, 'Plus de 24 h se sont écoulées : cette avance ne peut plus être supprimée.', 'DELAI_DEPASSE');
      }
      if (row.cree_par_id !== req.user!.id && !userCan(req.user, PERM_SUPERVISE)) {
        throw new ApiError(403, "Seule la personne qui a saisi l'avance (ou un responsable) peut la supprimer.");
      }
      await auth.verifyPassword(req, password);
      db.prepare('UPDATE avances SET supprime_par_nom = ?, supprime_le = ? WHERE id = ? AND supprime_le IS NULL').run(req.user!.fullName, nowIso(), row.id);
      store.log(req, {
        module: 'avance',
        action: 'suppression',
        description: `Suppression de l'avance de ${formatDT(Number(row.montant))} à ${row.employe} (${formatDateFr(String(row.date), false)} ${row.heure})`,
        journeeDate: String(row.date),
        entityId: String(row.id),
        details: { avant: row },
      });
      res.status(204).end();
    })
  );

  return router;
};
