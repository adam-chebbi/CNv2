import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { ApiError, asyncHandler, notFound } from '../middleware/errors.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';

// "Chiffres d'affaires" typed by hand on the Calcul du quotidien page. Deliberately a table of its
// own (not sales_transactions): these are day-level totals with no products, no stock deduction
// and no VAT expense — see src/data/revenueEntriesModel.ts. paymentMethod NULL = "CA général" (the
// règlement wasn't specified); otherwise the amount also feeds that method's system total on the
// daily reconciliation.
//
// Reuses the page's own permission: whoever can run the daily cash check can manage its revenue
// entries, and nobody else (the page is already flagged `sensitive`).

interface RevenueRow {
  id: string;
  revenue_date: string;
  amount: number;
  payment_method: string | null;
  note: string | null;
  created_at: string;
  created_by: string;
  updated_at: string | null;
  updated_by: string | null;
}

const rowToEntry = (r: RevenueRow) => ({
  id: r.id,
  date: r.revenue_date,
  amount: r.amount,
  paymentMethod: r.payment_method,
  note: r.note ?? undefined,
  createdAt: r.created_at,
  createdBy: r.created_by,
  updatedAt: r.updated_at ?? undefined,
  updatedBy: r.updated_by ?? undefined,
});

const PAYMENT_METHODS = ['Espèces', 'Carte bancaire', 'Ticket resto', 'Autre'] as const;

const entrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (format attendu : AAAA-MM-JJ).'),
  amount: z
    .number({ error: 'Le montant est obligatoire.' })
    .positive('Le montant doit être supérieur à 0.')
    .max(10_000_000, 'Montant trop élevé.'),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
  note: z.string().trim().max(500, 'La note ne peut pas dépasser 500 caractères.').optional(),
});

// Dinars have three decimals (millimes) — store exactly that, never floating-point dust.
const roundMillimes = (v: number): number => Math.round(v * 1000) / 1000;

const describe = (date: string, amount: number, method: string | null): string =>
  `${date} — ${amount.toFixed(2)} DT (${method ?? 'règlement non précisé'})`;

export const revenueEntriesRouter = Router();
revenueEntriesRouter.use(requireAuth);

revenueEntriesRouter.get(
  '/',
  requirePermission('sales:cash_check'),
  asyncHandler((_req, res) => {
    const rows = db.prepare('SELECT * FROM revenue_entries ORDER BY revenue_date DESC, created_at DESC').all() as RevenueRow[];
    res.json(rows.map(rowToEntry));
  })
);

revenueEntriesRouter.post(
  '/',
  requirePermission('sales:cash_check'),
  asyncHandler((req, res) => {
    const body = entrySchema.parse(req.body);
    const amount = roundMillimes(body.amount);
    if (amount <= 0) throw new ApiError(400, 'Le montant doit être supérieur à 0.');
    const id = randomUUID();
    const user = req.user!.fullName;

    db.prepare(
      `INSERT INTO revenue_entries (id, revenue_date, amount, payment_method, note, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, body.date, amount, body.paymentMethod, body.note || null, new Date().toISOString(), user);

    recordActivity('Ventes', 'Création', `Chiffre d'affaires saisi — ${describe(body.date, amount, body.paymentMethod)}`, user);
    const row = db.prepare('SELECT * FROM revenue_entries WHERE id = ?').get(id) as RevenueRow;
    res.status(201).json(rowToEntry(row));
  })
);

revenueEntriesRouter.put(
  '/:id',
  requirePermission('sales:cash_check'),
  asyncHandler((req, res) => {
    const existing = db.prepare('SELECT * FROM revenue_entries WHERE id = ?').get(req.params.id) as RevenueRow | undefined;
    if (!existing) throw notFound("Chiffre d'affaires");
    const body = entrySchema.parse(req.body);
    const amount = roundMillimes(body.amount);
    if (amount <= 0) throw new ApiError(400, 'Le montant doit être supérieur à 0.');
    const user = req.user!.fullName;

    db.prepare(
      `UPDATE revenue_entries
       SET revenue_date = ?, amount = ?, payment_method = ?, note = ?, updated_at = ?, updated_by = ?
       WHERE id = ?`
    ).run(body.date, amount, body.paymentMethod, body.note || null, new Date().toISOString(), user, req.params.id);

    recordActivity(
      'Ventes',
      'Modification',
      `Chiffre d'affaires modifié — ${describe(existing.revenue_date, existing.amount, existing.payment_method)} → ${describe(body.date, amount, body.paymentMethod)}`,
      user
    );
    const row = db.prepare('SELECT * FROM revenue_entries WHERE id = ?').get(req.params.id) as RevenueRow;
    res.json(rowToEntry(row));
  })
);

revenueEntriesRouter.delete(
  '/:id',
  requirePermission('sales:cash_check'),
  asyncHandler((req, res) => {
    const existing = db.prepare('SELECT * FROM revenue_entries WHERE id = ?').get(req.params.id) as RevenueRow | undefined;
    if (!existing) throw notFound("Chiffre d'affaires");
    db.prepare('DELETE FROM revenue_entries WHERE id = ?').run(req.params.id);
    recordActivity(
      'Ventes',
      'Suppression',
      `Chiffre d'affaires supprimé — ${describe(existing.revenue_date, existing.amount, existing.payment_method)}`,
      req.user!.fullName
    );
    res.status(204).end();
  })
);
