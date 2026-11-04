import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler } from '../middleware/errors.js';
import { requireAnyPermission, requireAuth } from '../middleware/auth.js';
import { toMillimes } from '../../src/data/money.js';
import { tunisClock } from '../../src/data/pricing.js';
import { tunisDayRange, waiterStats } from './team.js';
import { depreciationBetween } from './equipment.js';
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

// --- Tableau de bord de la direction (§16.1) ----------------------------------------------------------

interface SaleAgg {
  id: string;
  total_mil: number;
  visit_id: string | null;
  ticket_discounts_json: string;
}

const sumBy = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + f(r), 0);
const count = (sql: string, ...args: unknown[]): number => (db.prepare(sql).get(...args) as { n: number }).n;

posReportsRouter.get('/dashboard', requireAnyPermission('dashboard:view', 'reports:view'), asyncHandler((req, res) => {
  const q = z.object({ from: date.optional(), to: date.optional() }).parse(req.query);
  const to = q.to ?? tunisClock(new Date()).date;
  const from = q.from ?? to;
  const [start, end] = tunisDayRange(from, to);

  // Finalised sales (register) — never mixed with open bills (§16.1).
  const sales = db
    .prepare("SELECT id, total_mil, visit_id, ticket_discounts_json FROM pos_sales WHERE status = 'completed' AND completed_at >= ? AND completed_at < ?")
    .all(start, end) as SaleAgg[];
  const adjustments = (db.prepare('SELECT COALESCE(SUM(amount_mil), 0) AS a FROM sale_adjustments WHERE created_at >= ? AND created_at < ?').get(start, end) as { a: number }).a;
  const registerRevenue = sumBy(sales, (s) => s.total_mil) - adjustments;
  // Sales entered or imported in the V1 screens (days the register did not cover).
  const manualRevenue = toMillimes(
    (db.prepare("SELECT COALESCE(SUM(total_amount), 0) AS t FROM sales_transactions WHERE status = 'Payé' AND date >= ? AND date <= ?").get(from, to) as { t: number }).t
  );

  const payments = db.prepare('SELECT method, kind, SUM(amount_mil) AS total FROM pos_payments WHERE created_at >= ? AND created_at < ? GROUP BY method, kind').all(start, end) as {
    method: string;
    kind: string;
    total: number;
  }[];
  const paymentsByMethod: Record<string, number> = { cash: 0, card: 0, voucher: 0 };
  payments.forEach((p) => (paymentsByMethod[p.method] += p.total));

  const sessions = db.prepare('SELECT id, opened_at, opened_by, status, difference_mil FROM cash_sessions WHERE opened_at >= ? AND opened_at < ? ORDER BY opened_at').all(start, end) as {
    id: string;
    opened_at: string;
    opened_by: string;
    status: string;
    difference_mil: number | null;
  }[];

  // Discounts by origin: manual, offers, loyalty — each counted once (§8.5).
  const discounts: Record<string, number> = { manual: 0, offer: 0, loyalty: 0 };
  sales.forEach((s) => (JSON.parse(s.ticket_discounts_json) as { source: string; amountMil: number }[]).forEach((d) => (discounts[d.source] = (discounts[d.source] ?? 0) + d.amountMil)));
  if (sales.length > 0) {
    discounts.offer += (db
      .prepare(`SELECT COALESCE(SUM(l.item_discount_mil), 0) AS d FROM pos_order_lines l JOIN pos_orders o ON o.id = l.order_id WHERE l.status = 'active' AND o.sale_id IN (${sales.map(() => '?').join(',')})`)
      .get(...sales.map((s) => s.id)) as { d: number }).d;
  }

  const visits = db.prepare("SELECT id, covers FROM visits WHERE status = 'closed' AND closed_at >= ? AND closed_at < ?").all(start, end) as { id: string; covers: number | null }[];
  const covers = sumBy(visits, (v) => v.covers ?? 0);
  const coveredVisitIds = new Set(visits.filter((v) => v.covers).map((v) => v.id));
  const revenueOfCoveredVisits = sumBy(sales.filter((s) => s.visit_id && coveredVisitIds.has(s.visit_id)), (s) => s.total_mil);

  const cancellations = db.prepare('SELECT status, COUNT(*) AS n, COALESCE(SUM(amount_mil), 0) AS amount FROM cancellation_requests WHERE created_at >= ? AND created_at < ? GROUP BY status').all(start, end) as {
    status: string;
    n: number;
    amount: number;
  }[];
  const loyalty = db.prepare('SELECT type, COALESCE(SUM(points), 0) AS pts FROM loyalty_ledger WHERE created_at >= ? AND created_at < ? GROUP BY type').all(start, end) as { type: string; pts: number }[];

  // "Maintenant" — live, independent of the period.
  const openVisits = db.prepare("SELECT opened_at FROM visits WHERE status = 'open'").all() as { opened_at: string }[];
  const openBills = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total_mil - paid_mil), 0) AS due FROM pos_sales WHERE status = 'open' AND total_mil > 0").get() as { n: number; due: number };
  const now = Date.now();

  res.json({
    from,
    to,
    live: {
      openTables: openVisits.length,
      averageOpenMinutes: openVisits.length ? Math.round(sumBy(openVisits, (v) => (now - Date.parse(v.opened_at)) / 60_000) / openVisits.length) : 0,
      pendingQrOrders: count("SELECT COUNT(*) AS n FROM pos_orders WHERE status IN ('pending_validation', 'awaiting_customer')"),
      billsRequested: count("SELECT COUNT(*) AS n FROM service_requests WHERE type = 'bill' AND status != 'done'"),
      waiterCalls: count("SELECT COUNT(*) AS n FROM service_requests WHERE type = 'call_waiter' AND status != 'done'"),
      reservationsToHandle: count("SELECT COUNT(*) AS n FROM reservations WHERE status = 'pending' OR (change_request IS NOT NULL AND status IN ('pending', 'confirmed'))"),
      pendingCancellations: count("SELECT COUNT(*) AS n FROM cancellation_requests WHERE status = 'pending'"),
      openBills: openBills.n,
      openBillsDueMil: openBills.due,
      openSessions: count("SELECT COUNT(*) AS n FROM cash_sessions WHERE status = 'open'"),
    },
    revenue: { registerMil: registerRevenue, manualMil: manualRevenue, totalMil: registerRevenue + manualRevenue, creditNotesMil: adjustments },
    tickets: sales.length,
    averageTicketMil: sales.length ? Math.round(registerRevenue / sales.length) : 0,
    covers,
    visitsClosed: visits.length,
    averagePerCoverMil: covers ? Math.round(revenueOfCoveredVisits / covers) : 0,
    visitsWithoutCovers: visits.filter((v) => !v.covers).length,
    paymentsByMethod,
    refundsMil: -sumBy(payments.filter((p) => p.kind === 'refund'), (p) => p.total),
    sessions: {
      count: sessions.length,
      totalDifferenceMil: sumBy(sessions, (s) => s.difference_mil ?? 0),
      withDifference: sessions.filter((s) => (s.difference_mil ?? 0) !== 0).length,
      list: sessions.map((s) => ({ id: s.id, openedAt: s.opened_at, openedBy: s.opened_by, status: s.status, differenceMil: s.difference_mil })),
    },
    discounts,
    cancellations: Object.fromEntries(cancellations.map((c) => [c.status, { count: c.n, amountMil: c.amount }])),
    loyalty: { earned: loyalty.find((l) => l.type === 'earn')?.pts ?? 0, redeemed: -(loyalty.find((l) => l.type === 'redeem')?.pts ?? 0) },
    qrOrders: count("SELECT COUNT(*) AS n FROM pos_orders WHERE channel = 'qr' AND created_at >= ? AND created_at < ?", start, end),
    depreciationMil: depreciationBetween(from.slice(0, 7), to.slice(0, 7)),
    waiters: waiterStats(from, to).slice(0, 8),
  });
}));

// --- Rapport des ventes détaillé (§16.3) --------------------------------------------------------------

interface SalesReportRow {
  ticket_number: string | null;
  sale_status: string;
  completed_at: string | null;
  created_at: string;
  table_name: string | null;
  service_type: string;
  display_name: string;
  category: string;
  quantity: number;
  gross_mil: number;
  item_discount_mil: number;
  line_status: string;
  responsible_waiter_name: string | null;
}

posReportsRouter.get('/reports/sales', requireAnyPermission('reports:view', 'pos:history'), asyncHandler((req, res) => {
  const q = z
    .object({ from: date, to: date, sessionId: z.string().optional(), waiter: z.string().optional(), category: z.string().optional(), status: z.enum(['completed', 'open', 'cancelled']).optional() })
    .parse(req.query);
  const [start, end] = tunisDayRange(q.from, q.to);
  const where = ['s.created_at >= ?', 's.created_at < ?', "o.status = 'validated'"];
  const params: unknown[] = [start, end];
  if (q.sessionId) {
    where.push('s.session_id = ?');
    params.push(q.sessionId);
  }
  if (q.waiter) {
    where.push('l.responsible_waiter_name = ?');
    params.push(q.waiter);
  }
  if (q.category) {
    where.push('l.category = ?');
    params.push(q.category);
  }
  if (q.status) {
    where.push('s.status = ?');
    params.push(q.status);
  }
  const rows = db
    .prepare(
      `SELECT s.ticket_number, s.status AS sale_status, s.completed_at, s.created_at, s.table_name, s.service_type, l.display_name, l.category,
              l.quantity, l.gross_mil, l.item_discount_mil, l.status AS line_status, l.responsible_waiter_name
       FROM pos_order_lines l JOIN pos_orders o ON o.id = l.order_id JOIN pos_sales s ON s.id = o.sale_id
       WHERE ${where.join(' AND ')} ORDER BY s.created_at, l.position LIMIT 5000`
    )
    .all(...params) as SalesReportRow[];
  res.json({
    rows: rows.map((r) => ({
      ticketNumber: r.ticket_number,
      saleStatus: r.sale_status,
      at: r.completed_at ?? r.created_at,
      table: r.table_name ?? (r.service_type === 'takeaway' ? 'À emporter' : 'Comptoir'),
      waiter: r.responsible_waiter_name ?? 'Non attribué',
      category: r.category,
      product: r.display_name,
      quantity: r.quantity,
      grossMil: r.gross_mil,
      discountMil: r.item_discount_mil,
      totalMil: r.gross_mil - r.item_discount_mil,
      lineStatus: r.line_status,
    })),
    waiters: (db.prepare('SELECT DISTINCT responsible_waiter_name AS w FROM pos_order_lines WHERE responsible_waiter_name IS NOT NULL ORDER BY 1').all() as { w: string }[]).map((r) => r.w),
    categories: (db.prepare('SELECT DISTINCT category AS c FROM pos_order_lines ORDER BY 1').all() as { c: string }[]).map((r) => r.c),
    sessions: (db.prepare('SELECT id, opened_at AS openedAt, opened_by AS openedBy FROM cash_sessions ORDER BY opened_at DESC LIMIT 60').all() as { id: string; openedAt: string; openedBy: string }[]),
  });
}));

// --- Journal d'activité détaillé (§16.4): read-only, with the values before and after -------------

posReportsRouter.get('/journal', requireAnyPermission('activity_log:view'), asyncHandler((req, res) => {
  const q = z.object({ from: date, to: date, module: z.string().optional(), user: z.string().optional() }).parse(req.query);
  const [start, end] = tunisDayRange(q.from, q.to);
  const where = ['timestamp >= ?', 'timestamp < ?'];
  const params: unknown[] = [start, end];
  if (q.module) {
    where.push('module = ?');
    params.push(q.module);
  }
  if (q.user) {
    where.push('user = ?');
    params.push(q.user);
  }
  const rows = db
    .prepare(`SELECT id, timestamp, user, module, action, description, entity_type, entity_id, before_json, after_json FROM activity_log WHERE ${where.join(' AND ')} ORDER BY timestamp DESC LIMIT 2000`)
    .all(...params) as { id: string; timestamp: string; user: string; module: string; action: string; description: string; entity_type: string | null; entity_id: string | null; before_json: string | null; after_json: string | null }[];
  res.json({
    rows: rows.map((r) => ({
      id: r.id,
      at: r.timestamp,
      user: r.user,
      module: r.module,
      action: r.action,
      description: r.description,
      entity: r.entity_type ? `${r.entity_type}:${r.entity_id}` : null,
      before: r.before_json ? JSON.parse(r.before_json) : null,
      after: r.after_json ? JSON.parse(r.after_json) : null,
    })),
    modules: (db.prepare('SELECT DISTINCT module AS m FROM activity_log ORDER BY 1').all() as { m: string }[]).map((r) => r.m),
  });
}));
