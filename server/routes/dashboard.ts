import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler, ApiError } from '../middleware/errors.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';

interface MonthlyTargetRow {
  month: string;
  target_amount: number;
  updated_at: string;
  updated_by: string;
}

const rowToTarget = (r: MonthlyTargetRow) => ({
  month: r.month,
  targetAmount: r.target_amount,
  updatedAt: r.updated_at,
  updatedBy: r.updated_by,
});

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get(
  '/monthly-targets',
  requirePermission('dashboard:view'),
  asyncHandler((_req, res) => {
    const rows = db.prepare('SELECT * FROM monthly_sales_targets').all() as MonthlyTargetRow[];
    res.json(rows.map(rowToTarget));
  })
);

const targetSchema = z.object({ targetAmount: z.number().gt(0) });
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

dashboardRouter.put(
  '/monthly-targets/:month',
  requirePermission('dashboard:manage'),
  asyncHandler((req, res) => {
    const { month } = req.params;
    if (!MONTH_PATTERN.test(month)) throw new ApiError(400, 'Mois invalide (format attendu : AAAA-MM).');
    const { targetAmount } = targetSchema.parse(req.body);

    const updatedAt = new Date().toISOString();
    const updatedBy = req.user!.fullName;
    db.prepare(
      `INSERT INTO monthly_sales_targets (month, target_amount, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(month) DO UPDATE SET target_amount = excluded.target_amount, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    ).run(month, targetAmount, updatedAt, updatedBy);

    recordActivity('Ventes', 'Modification', `Objectif mensuel défini — ${month} : ${targetAmount.toFixed(2)} DT`, updatedBy);
    res.json(rowToTarget({ month, target_amount: targetAmount, updated_at: updatedAt, updated_by: updatedBy }));
  })
);
