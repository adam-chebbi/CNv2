import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { fromJson } from '../db/json.js';
import { asyncHandler, ApiError, notFound } from '../middleware/errors.js';
import { requireAnyPermission, requireAuth, requirePermission } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';
import { emitPosEvent } from '../lib/events.js';
import { assignedTableIds, canSeeAllTables, hasPermission } from '../lib/posAccess.js';
import type { PricedExtra, PricedVariant } from '../../src/data/pricing.js';
import type { PrepStatus } from '../lib/posService.js';
import { looksLikeAllergyNote } from '../../src/data/receipts.js';

const allergensOf = (articleId: string): string[] =>
  (db.prepare("SELECT allergen FROM product_allergens WHERE article_id = ? AND state = 'contains'").all(articleId) as { allergen: string }[]).map((a) => a.allergen);

// Préparation en cuisine et au bar (cahier des charges §5). The boards never carry prices.

export const prepRouter = Router();
prepRouter.use(requireAuth);

const ORDER: PrepStatus[] = ['to_prepare', 'in_progress', 'ready', 'served'];

// Forward one or more steps, or back exactly one step (to undo a mistaken tap).
export const isAllowedPrepTransition = (from: PrepStatus, to: PrepStatus): boolean => {
  const a = ORDER.indexOf(from);
  const b = ORDER.indexOf(to);
  return a >= 0 && b >= 0 && (b > a || b === a - 1);
};

interface BoardLineRow {
  id: string;
  order_id: string;
  prep_ticket_id: string;
  display_name: string;
  quantity: number;
  variant_json: string | null;
  extras_json: string;
  instruction: string | null;
  prep_status: PrepStatus;
  responsible_waiter_name: string | null;
  sent_to_prep_at: string;
  prep_started_at: string | null;
  ready_at: string | null;
  label: string;
  order_number: number;
  sent_at: string;
  priority: number;
  pickup_number: number | null;
  article_id: string;
  prep_target_minutes: number | null;
}

const READY_VISIBLE_MINUTES = 30;

prepRouter.get('/prep/:destination', requireAnyPermission('prep:kitchen', 'prep:bar'), asyncHandler((req, res) => {
  const destination = z.enum(['kitchen', 'bar']).parse(req.params.destination);
  if (!hasPermission(req.user!, destination === 'kitchen' ? 'prep:kitchen' : 'prep:bar')) throw new ApiError(403, "Vous n'avez pas accès à cet écran.");
  const readySince = new Date(Date.now() - READY_VISIBLE_MINUTES * 60_000).toISOString();
  const rows = db
    .prepare(
      `SELECT l.id, l.order_id, l.prep_ticket_id, l.display_name, l.quantity, l.variant_json, l.extras_json, l.instruction, l.prep_status,
              l.responsible_waiter_name, l.sent_to_prep_at, l.prep_started_at, l.ready_at, t.label, o.order_number, t.sent_at,
              o.priority, o.pickup_number, l.article_id, a.prep_target_minutes
       FROM pos_order_lines l JOIN prep_tickets t ON t.id = l.prep_ticket_id JOIN pos_orders o ON o.id = l.order_id
       LEFT JOIN catalog_articles a ON a.id = l.article_id
       WHERE l.prep_destination = ? AND l.status = 'active' AND o.status = 'validated'
         AND (l.prep_status IN ('to_prepare', 'in_progress') OR (l.prep_status = 'ready' AND l.ready_at >= ?))
       ORDER BY t.sent_at, l.position`
    )
    .all(destination, readySince) as BoardLineRow[];

  // Lines with a pending cancellation request are flagged, never removed (§5).
  const flagged = new Set(
    (db.prepare("SELECT target_id FROM cancellation_requests WHERE status = 'pending' AND target_type = 'line'").all() as { target_id: string }[]).map((r) => r.target_id)
  );

  const tickets = new Map<string, { id: string; label: string; orderNumber: number; pickupNumber: number | null; sentAt: string; waiter: string | null; urgent: boolean; lines: unknown[] }>();
  rows.forEach((r) => {
    if (!tickets.has(r.prep_ticket_id)) {
      tickets.set(r.prep_ticket_id, { id: r.prep_ticket_id, label: r.label, orderNumber: r.order_number, pickupNumber: r.pickup_number, sentAt: r.sent_at, waiter: r.responsible_waiter_name, urgent: r.priority > 0, lines: [] });
    }
    const variant = r.variant_json ? fromJson<PricedVariant>(r.variant_json, { id: '', label: '', deltaMil: 0 }) : null;
    tickets.get(r.prep_ticket_id)!.lines.push({
      id: r.id,
      name: r.display_name,
      quantity: r.quantity,
      variant: variant?.label ?? null,
      extras: fromJson<PricedExtra[]>(r.extras_json, []).map((e) => e.name),
      instruction: r.instruction,
      status: r.prep_status,
      startedAt: r.prep_started_at,
      readyAt: r.ready_at,
      cancellationRequested: flagged.has(r.id),
      targetMinutes: r.prep_target_minutes,
      // Allergy warning: the instruction mentions one, or the product contains a declared allergen.
      allergyNote: looksLikeAllergyNote(r.instruction),
      allergens: allergensOf(r.article_id),
    });
  });
  // Urgent tickets first, then by dispatch time.
  const list = [...tickets.values()].sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.sentAt.localeCompare(b.sentAt));
  res.json({ destination, tickets: list });
}));

const statusSchema = z.object({ status: z.enum(['to_prepare', 'in_progress', 'ready', 'served']) });

const STAMP: Partial<Record<PrepStatus, string>> = { in_progress: 'prep_started_at', ready: 'ready_at', served: 'served_at' };

const updateLines = (lineIds: string[], to: PrepStatus, actor: { id: string; fullName: string }): number => {
  const now = new Date().toISOString();
  let changed = 0;
  lineIds.forEach((id) => {
    const line = db.prepare("SELECT id, prep_status, display_name FROM pos_order_lines WHERE id = ? AND status = 'active'").get(id) as
      | { id: string; prep_status: PrepStatus; display_name: string }
      | undefined;
    if (!line || line.prep_status === 'none' || line.prep_status === to) return;
    if (!isAllowedPrepTransition(line.prep_status, to)) return;
    const stamp = STAMP[to];
    db.prepare(`UPDATE pos_order_lines SET prep_status = ?${stamp ? `, ${stamp} = COALESCE(${stamp}, ?)` : ''} WHERE id = ?`).run(
      ...(stamp ? [to, now, line.id] : [to, line.id])
    );
    changed += 1;
  });
  if (changed > 0) {
    recordActivity('Préparation', 'État', `${changed} ligne(s) → ${to}`, actor.fullName, { userId: actor.id, after: { lineIds, status: to } });
  }
  return changed;
};

prepRouter.post('/prep/lines/:id/status', requirePermission('prep:update'), asyncHandler((req, res) => {
  const { status } = statusSchema.parse(req.body);
  const line = db.prepare('SELECT prep_status FROM pos_order_lines WHERE id = ?').get(req.params.id) as { prep_status: PrepStatus } | undefined;
  if (!line) throw notFound('Ligne');
  if (line.prep_status !== status && !isAllowedPrepTransition(line.prep_status, status)) throw new ApiError(409, 'Changement d’état non autorisé.');
  db.transaction(() => updateLines([req.params.id], status, req.user!))();
  emitPosEvent({ type: 'prep.changed' });
  emitPosEvent({ type: 'floor.changed' });
  res.json({ ok: true });
}));

prepRouter.post('/prep/tickets/:id/status', requirePermission('prep:update'), asyncHandler((req, res) => {
  const { status } = statusSchema.parse(req.body);
  const ids = (db.prepare("SELECT id FROM pos_order_lines WHERE prep_ticket_id = ? AND status = 'active'").all(req.params.id) as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) throw notFound('Bon de préparation');
  const changed = db.transaction(() => updateLines(ids, status, req.user!))();
  emitPosEvent({ type: 'prep.changed' });
  emitPosEvent({ type: 'floor.changed' });
  res.json({ changed });
}));

// Lines ready to be served, for the waiter's view (filtered to tables they can access by the caller).
prepRouter.get('/prep-ready', requireAnyPermission('floor:view', 'pos:sell'), asyncHandler((req, res) => {
  const seeAll = canSeeAllTables(req.user!);
  const mine = assignedTableIds(req.user!.id);
  const rows = db
    .prepare(
      `SELECT l.id, l.display_name, l.quantity, l.ready_at, t.name AS table_name, v.table_id
       FROM pos_order_lines l JOIN pos_orders o ON o.id = l.order_id
       LEFT JOIN visits v ON v.id = o.visit_id LEFT JOIN dining_tables t ON t.id = v.table_id
       WHERE l.prep_status = 'ready' AND l.status = 'active' ORDER BY l.ready_at`
    )
    .all() as { id: string; display_name: string; quantity: number; ready_at: string; table_name: string | null; table_id: string | null }[];
  res.json(rows.filter((r) => seeAll || (r.table_id !== null && mine.has(r.table_id))).map((r) => ({ id: r.id, name: r.display_name, quantity: r.quantity, readyAt: r.ready_at, tableName: r.table_name, tableId: r.table_id })));
}));

// --- Recall and statistics (amélioration 06) -------------------------------------------------------

// The last finished dispatches of a station, to bring one back by mistake or check what was sent.
prepRouter.get('/prep/:destination/recent', requireAnyPermission('prep:kitchen', 'prep:bar'), asyncHandler((req, res) => {
  const destination = z.enum(['kitchen', 'bar']).parse(req.params.destination);
  const since = new Date(Date.now() - 3 * 3600_000).toISOString();
  const rows = db
    .prepare(
      `SELECT t.id, t.label, t.sent_at, o.order_number, MAX(l.ready_at) AS ready_at, GROUP_CONCAT(l.quantity || ' × ' || l.display_name, ' · ') AS summary,
              SUM(CASE WHEN l.prep_status IN ('to_prepare', 'in_progress') THEN 1 ELSE 0 END) AS open_lines
       FROM prep_tickets t JOIN pos_order_lines l ON l.prep_ticket_id = t.id JOIN pos_orders o ON o.id = t.order_id
       WHERE t.destination = ? AND t.sent_at >= ? AND l.status = 'active'
       GROUP BY t.id HAVING open_lines = 0 ORDER BY ready_at DESC LIMIT 20`
    )
    .all(destination, since) as { id: string; label: string; sent_at: string; order_number: number; ready_at: string | null; summary: string }[];
  res.json(rows.map((r) => ({ id: r.id, label: r.label, sentAt: r.sent_at, orderNumber: r.order_number, readyAt: r.ready_at, summary: r.summary })));
}));

// Average preparation time per product: from dispatch to "ready".
prepRouter.get('/prep-metrics', requireAnyPermission('prep:kitchen', 'prep:bar', 'reports:view'), asyncHandler((req, res) => {
  const q = z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }).parse(req.query);
  const since = new Date(Date.now() - q.days * 86_400_000).toISOString();
  const rows = db
    .prepare(
      `SELECT l.prep_destination AS destination, l.name, COUNT(*) AS n,
              AVG((julianday(l.ready_at) - julianday(l.sent_to_prep_at)) * 1440) AS avg_minutes,
              MAX((julianday(l.ready_at) - julianday(l.sent_to_prep_at)) * 1440) AS max_minutes,
              a.prep_target_minutes AS target,
              SUM(CASE WHEN a.prep_target_minutes IS NOT NULL AND (julianday(l.ready_at) - julianday(l.sent_to_prep_at)) * 1440 > a.prep_target_minutes THEN 1 ELSE 0 END) AS late
       FROM pos_order_lines l LEFT JOIN catalog_articles a ON a.id = l.article_id
       WHERE l.ready_at IS NOT NULL AND l.sent_to_prep_at IS NOT NULL AND l.sent_to_prep_at >= ? AND l.status = 'active'
       GROUP BY l.prep_destination, l.name ORDER BY avg_minutes DESC`
    )
    .all(since) as { destination: string; name: string; n: number; avg_minutes: number; max_minutes: number; target: number | null; late: number }[];
  res.json(rows.map((r) => ({ destination: r.destination, name: r.name, count: r.n, avgMinutes: Math.round(r.avg_minutes * 10) / 10, maxMinutes: Math.round(r.max_minutes), targetMinutes: r.target, late: r.late })));
}));
