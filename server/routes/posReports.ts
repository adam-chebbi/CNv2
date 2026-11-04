import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler } from '../middleware/errors.js';
import { requireAnyPermission, requireAuth } from '../middleware/auth.js';
import { toMillimes } from '../../src/data/money.js';
import { tunisClock } from '../../src/data/pricing.js';
import { tunisDayRange } from './team.js';
import { POS_LINE_SOURCE } from '../lib/stockConsumption.js';

// Fiche de consommation des matières (cahier des charges §14.5): what the sales should have used
// according to the recipes (theoretical), next to losses, adjustments and inventory differences
// (observed). Imports and manual entries are identified by their own source and never mixed in.

export const posReportsRouter = Router();
posReportsRouter.use(requireAuth);

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

interface LedgerAgg {
  product_id: string;
  name: string;
  unit: string;
  average_cost: number;
  theoretical: number;
  other_sales: number;
  internal: number;
  losses: number;
  adjustments: number;
  inventory_gap: number;
  inventory_gap_value: number;
}

posReportsRouter.get('/reports/consumption', requireAnyPermission('reports:view', 'stock:view'), asyncHandler((req, res) => {
  const q = z.object({ from: date.optional(), to: date.optional() }).parse(req.query);
  const to = q.to ?? tunisClock(new Date()).date;
  const from = q.from ?? `${to.slice(0, 8)}01`;
  const [start, end] = tunisDayRange(from, to);

  const ingredients = db
    .prepare(
      `SELECT p.id AS product_id, p.name, p.unit, p.average_cost,
         COALESCE(SUM(CASE WHEN l.source_type = ? THEN -l.quantity_delta END), 0) AS theoretical,
         COALESCE(SUM(CASE WHEN l.source_type = 'sale' THEN -l.quantity_delta END), 0) AS other_sales,
         COALESCE(SUM(CASE WHEN l.source_type = 'internal_consumption' THEN -l.quantity_delta END), 0) AS internal,
         COALESCE(SUM(CASE WHEN l.type = 'Perte' THEN -l.quantity_delta END), 0) AS losses,
         COALESCE(SUM(CASE WHEN l.type = 'Ajustement' THEN l.quantity_delta END), 0) AS adjustments,
         COALESCE(SUM(CASE WHEN l.type = 'Inventaire' THEN l.discrepancy_qty END), 0) AS inventory_gap,
         COALESCE(SUM(CASE WHEN l.type = 'Inventaire' THEN l.discrepancy_value END), 0) AS inventory_gap_value
       FROM stock_ledger l JOIN stock_products p ON p.id = l.product_id
       WHERE l.status != 'Annulé' AND l.timestamp >= ? AND l.timestamp < ?
       GROUP BY p.id ORDER BY p.name`
    )
    .all(POS_LINE_SOURCE, start, end) as LedgerAgg[];

  const products = db
    .prepare(
      `SELECT l.article_id, l.name, SUM(l.quantity) AS quantity FROM pos_order_lines l JOIN pos_orders o ON o.id = l.order_id
       WHERE o.status = 'validated' AND l.status = 'active' AND o.validated_at >= ? AND o.validated_at < ?
       GROUP BY l.article_id ORDER BY quantity DESC`
    )
    .all(start, end) as { article_id: string; name: string; quantity: number }[];

  // Cancelled lines whose ingredients were not returned (prepared, then lost/offered…).
  const treatments = db
    .prepare("SELECT stock_treatment AS treatment, COUNT(*) AS n, SUM(amount_mil) AS amount FROM cancellation_requests WHERE status = 'approved' AND decided_at >= ? AND decided_at < ? GROUP BY stock_treatment")
    .all(start, end) as { treatment: string; n: number; amount: number }[];

  const rows = ingredients
    .filter((i) => i.theoretical || i.other_sales || i.internal || i.losses || i.adjustments || i.inventory_gap)
    .map((i) => ({
      productId: i.product_id,
      name: i.name,
      unit: i.unit,
      theoretical: i.theoretical,
      importedSales: i.other_sales,
      internal: i.internal,
      losses: i.losses,
      adjustments: i.adjustments,
      inventoryGap: i.inventory_gap,
      estimatedCostMil: toMillimes(i.theoretical * i.average_cost),
      lossCostMil: toMillimes(i.losses * i.average_cost),
      inventoryGapValueMil: toMillimes(i.inventory_gap_value),
    }));
  res.json({
    from,
    to,
    ingredients: rows,
    products: products.map((p) => ({ articleId: p.article_id, name: p.name, quantity: p.quantity })),
    cancellationTreatments: treatments,
    totals: {
      estimatedCostMil: rows.reduce((s, r) => s + r.estimatedCostMil, 0),
      lossCostMil: rows.reduce((s, r) => s + r.lossCostMil, 0),
      inventoryGapValueMil: rows.reduce((s, r) => s + r.inventoryGapValueMil, 0),
    },
  });
}));
