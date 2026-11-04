import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler, ApiError, notFound } from '../middleware/errors.js';
import { requireAnyPermission, requireAuth, requirePermission, type AuthedUser } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';
import { emitPosEvent } from '../lib/events.js';
import { runIdempotent } from '../lib/idempotency.js';
import { assertTableAccess, hasPermission } from '../lib/posAccess.js';
import { registerTableStateProvider, registerVisitCloseBlocker } from '../lib/floorState.js';
import { registerActionProvider } from './serviceDesk.js';
import { actorOf, getSaleRow, recomputeSale, saleDetail, type LineRow, type PrepStatus } from '../lib/posService.js';
import { restoreStockForLine } from '../lib/stockConsumption.js';
import { getOpenSession } from './cashSessions.js';
import { formatDt } from '../../src/data/money.js';
import { PAYMENT_METHOD_LABELS } from '../../src/data/cashSession.js';

// Annulations et double validation (cahier des charges §7).
//
// A validated item, order or whole visit is never removed directly: someone asks (with a reason),
// someone else decides. Until the decision nothing changes — neither the bill nor the stock.
// Approval before preparation gives the ingredients back; after preparation it never does, and
// the manager records what happened to them (loss, offered, preparation error, other).
// A sale already paid is corrected with a credit note (avoir) instead.

export const cancellationsRouter = Router();
cancellationsRouter.use(requireAuth);

type TargetType = 'line' | 'order' | 'visit';
type Treatment = 'restored' | 'loss' | 'offered' | 'prep_error' | 'other';

interface RequestRow {
  id: string;
  target_type: TargetType;
  target_id: string;
  visit_id: string | null;
  sale_id: string | null;
  description: string;
  amount_mil: number;
  prep_status_at_request: PrepStatus | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requester_id: string;
  requester_name: string;
  created_at: string;
  decided_by_id: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  stock_treatment: Treatment | null;
  stock_note: string | null;
}

const PREP_RANK: Record<PrepStatus, number> = { none: 0, to_prepare: 0, in_progress: 1, ready: 2, served: 3 };
const isPrepared = (status: PrepStatus): boolean => PREP_RANK[status] >= 1;

const TREATMENT_LABELS: Record<Treatment, string> = {
  restored: 'Remis en stock',
  loss: 'Perte',
  offered: 'Produit offert',
  prep_error: 'Erreur de préparation',
  other: 'Autre',
};

// Active, validated lines concerned by a target, with the bill and table they belong to.
const resolveTarget = (type: TargetType, id: string): { lines: LineRow[]; visitId: string | null; saleId: string | null; description: string } => {
  const baseQuery = `SELECT l.*, o.sale_id AS sale_id_, o.visit_id AS visit_id_, o.order_number AS order_number_ FROM pos_order_lines l
     JOIN pos_orders o ON o.id = l.order_id WHERE o.status = 'validated' AND l.status = 'active'`;
  type Row = LineRow & { sale_id_: string | null; visit_id_: string | null; order_number_: number };
  let rows: Row[];
  let description: string;
  if (type === 'line') {
    rows = db.prepare(`${baseQuery} AND l.id = ?`).all(id) as Row[];
    description = rows[0] ? `${rows[0].quantity} × ${rows[0].display_name}` : '';
  } else if (type === 'order') {
    rows = db.prepare(`${baseQuery} AND o.id = ?`).all(id) as Row[];
    description = rows[0] ? `Commande n°${rows[0].order_number_}` : '';
  } else {
    rows = db.prepare(`${baseQuery} AND o.visit_id = ?`).all(id) as Row[];
    description = 'Visite entière';
  }
  if (rows.length === 0) throw new ApiError(404, 'Aucun article actif à annuler.');
  const saleIds = [...new Set(rows.map((r) => r.sale_id_))];
  for (const saleId of saleIds) {
    if (saleId && getSaleRow(saleId).status !== 'open') throw new ApiError(409, 'Cette vente est déjà réglée : utilisez la correction de vente.');
  }
  return { lines: rows, visitId: rows[0].visit_id_, saleId: rows[0].sale_id_, description };
};

const tableIdOfVisit = (visitId: string | null): string | null =>
  visitId ? ((db.prepare('SELECT table_id FROM visits WHERE id = ?').get(visitId) as { table_id: string } | undefined)?.table_id ?? null) : null;

const tableNameOfVisit = (visitId: string | null): string | null =>
  visitId ? ((db.prepare('SELECT t.name FROM visits v JOIN dining_tables t ON t.id = v.table_id WHERE v.id = ?').get(visitId) as { name: string } | undefined)?.name ?? null) : null;

const serialize = (r: RequestRow) => ({
  id: r.id,
  targetType: r.target_type,
  targetId: r.target_id,
  visitId: r.visit_id,
  saleId: r.sale_id,
  tableName: tableNameOfVisit(r.visit_id),
  description: r.description,
  amountMil: r.amount_mil,
  prepStatusAtRequest: r.prep_status_at_request,
  reason: r.reason,
  status: r.status,
  requester: r.requester_name,
  createdAt: r.created_at,
  decidedBy: r.decided_by,
  decidedAt: r.decided_at,
  decisionNote: r.decision_note,
  stockTreatment: r.stock_treatment,
  stockNote: r.stock_note,
});

const getRequest = (id: string): RequestRow => {
  const row = db.prepare('SELECT * FROM cancellation_requests WHERE id = ?').get(id) as RequestRow | undefined;
  if (!row) throw notFound("Demande d'annulation");
  return row;
};

const assertAccess = (user: AuthedUser, visitId: string | null): void => {
  const tableId = tableIdOfVisit(visitId);
  if (tableId) assertTableAccess(user, tableId);
};

const requestSchema = z.object({
  targetType: z.enum(['line', 'order', 'visit']),
  targetId: z.string().min(1),
  reason: z.string().trim().min(3, 'Indiquez le motif.').max(300),
});

cancellationsRouter.post('/cancellations', requirePermission('cancel:request'), (req, res) => {
  const body = requestSchema.parse(req.body);
  const user = req.user!;
  runIdempotent(req, res, `cancel-request:${user.id}`, () => {
    const target = resolveTarget(body.targetType, body.targetId);
    assertAccess(user, target.visitId);
    if (db.prepare("SELECT 1 FROM cancellation_requests WHERE target_type = ? AND target_id = ? AND status = 'pending'").get(body.targetType, body.targetId)) {
      throw new ApiError(409, 'Une demande est déjà en attente pour cet élément.');
    }
    const amount = target.lines.reduce((s, l) => s + l.gross_mil - l.item_discount_mil, 0);
    const mostAdvanced = target.lines.map((l) => l.prep_status).sort((a, b) => PREP_RANK[b] - PREP_RANK[a])[0];
    const id = randomUUID();
    db.prepare(
      `INSERT INTO cancellation_requests (id, target_type, target_id, visit_id, sale_id, description, amount_mil, prep_status_at_request, reason, status,
       requester_id, requester_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
    ).run(id, body.targetType, body.targetId, target.visitId, target.saleId, target.description, amount, mostAdvanced, body.reason, user.id, user.fullName, new Date().toISOString());
    recordActivity('Annulations', 'Demande', `${target.description} (${formatDt(amount)}) — ${body.reason}`, user.fullName, {
      userId: user.id,
      entityType: 'cancellation_request',
      entityId: id,
    });
    return { status: 201, body: serialize(getRequest(id)) };
  });
  emitPosEvent({ type: 'actions.changed' });
  emitPosEvent({ type: 'prep.changed' });
  emitPosEvent({ type: 'floor.changed' });
});

cancellationsRouter.get('/cancellations', requireAnyPermission('cancel:request', 'cancel:approve'), asyncHandler((req, res) => {
  const user = req.user!;
  const status = z.enum(['pending', 'approved', 'rejected']).optional().parse(req.query.status);
  const rows = (status
    ? db.prepare('SELECT * FROM cancellation_requests WHERE status = ? ORDER BY created_at DESC LIMIT 300').all(status)
    : db.prepare('SELECT * FROM cancellation_requests ORDER BY created_at DESC LIMIT 300').all()) as RequestRow[];
  // Deciders see everything; a requester sees their own requests.
  const visible = hasPermission(user, 'cancel:approve') ? rows : rows.filter((r) => r.requester_id === user.id);
  res.json(visible.map(serialize));
}));

const decisionSchema = z.object({
  note: z.string().trim().max(300).optional(),
  // Required when at least one item was already being prepared (§7.3).
  stockTreatment: z.enum(['loss', 'offered', 'prep_error', 'other']).optional(),
  stockNote: z.string().trim().max(300).optional(),
});

const assertDecider = (user: AuthedUser, request: RequestRow): void => {
  if (request.status !== 'pending') throw new ApiError(409, 'Cette demande a déjà été traitée.');
  // Nobody approves their own request — not even an administrator (§3.3, §7.2).
  if (request.requester_id === user.id) throw new ApiError(403, 'Vous ne pouvez pas décider de votre propre demande.');
};

cancellationsRouter.post('/cancellations/:id/approve', requirePermission('cancel:approve'), asyncHandler((req, res) => {
  const body = decisionSchema.parse(req.body);
  const user = req.user!;
  const request = getRequest(req.params.id);
  assertDecider(user, request);
  assertAccess(user, request.visit_id);

  const result = db.transaction(() => {
    const target = resolveTarget(request.target_type, request.target_id);
    const prepared = target.lines.filter((l) => isPrepared(l.prep_status));
    if (prepared.length > 0 && !body.stockTreatment) {
      throw new ApiError(400, 'Des articles sont déjà en préparation : indiquez le traitement (perte, offert, erreur de préparation ou autre).');
    }
    const now = new Date().toISOString();
    target.lines.forEach((line) => {
      db.prepare("UPDATE pos_order_lines SET status = 'cancelled' WHERE id = ?").run(line.id);
      // Before preparation the ingredients go back to stock; after, never automatically.
      if (!isPrepared(line.prep_status)) restoreStockForLine(line.id, user.fullName, `Annulation approuvée — ${request.reason}`);
    });
    const treatment: Treatment = prepared.length > 0 ? body.stockTreatment! : 'restored';
    db.prepare(
      `UPDATE cancellation_requests SET status = 'approved', decided_by_id = ?, decided_by = ?, decided_at = ?, decision_note = ?, stock_treatment = ?, stock_note = ? WHERE id = ?`
    ).run(user.id, user.fullName, now, body.note ?? null, treatment, body.stockNote ?? null, request.id);

    const saleIds = [...new Set(target.lines.map((l) => (l as LineRow & { sale_id_: string | null }).sale_id_).filter((s): s is string => Boolean(s)))];
    saleIds.forEach((saleId) => {
      const sale = recomputeSale(saleId);
      if (sale.total_mil < sale.paid_mil) throw new ApiError(409, "L'annulation rendrait le total inférieur à ce qui est déjà réglé.");
    });
    recordActivity(
      'Annulations',
      'Acceptée',
      `${request.description} (${formatDt(request.amount_mil)}) — demandée par ${request.requester_name} — ${TREATMENT_LABELS[treatment]}`,
      user.fullName,
      { userId: user.id, entityType: 'cancellation_request', entityId: request.id, before: { status: 'pending' }, after: { status: 'approved', treatment, note: body.note } }
    );
    return serialize(getRequest(request.id));
  })();
  emitPosEvent({ type: 'actions.changed' });
  emitPosEvent({ type: 'prep.changed' });
  emitPosEvent({ type: 'floor.changed' });
  res.json(result);
}));

cancellationsRouter.post('/cancellations/:id/reject', requirePermission('cancel:approve'), asyncHandler((req, res) => {
  const body = z.object({ note: z.string().trim().min(2, 'Indiquez la raison du refus.').max(300) }).parse(req.body);
  const user = req.user!;
  const request = getRequest(req.params.id);
  assertDecider(user, request);
  assertAccess(user, request.visit_id);
  db.transaction(() => {
    db.prepare("UPDATE cancellation_requests SET status = 'rejected', decided_by_id = ?, decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ?").run(
      user.id,
      user.fullName,
      new Date().toISOString(),
      body.note,
      request.id
    );
    recordActivity('Annulations', 'Refusée', `${request.description} — ${body.note}`, user.fullName, { userId: user.id, entityType: 'cancellation_request', entityId: request.id });
  })();
  emitPosEvent({ type: 'actions.changed' });
  emitPosEvent({ type: 'prep.changed' });
  res.json(serialize(getRequest(request.id)));
}));

// --- Correction of a paid sale (avoir) ---------------------------------------------------------------

type AdjustmentHook = (saleId: string, amountMil: number, by: { id: string | null; name: string }) => void;
const adjustmentHooks: AdjustmentHook[] = [];
// Lets loyalty take back the points of a corrected sale (§12.3).
export const onSaleAdjusted = (hook: AdjustmentHook): void => {
  adjustmentHooks.push(hook);
};

const correctionSchema = z.object({
  lineIds: z.array(z.string()).min(1).max(200),
  reason: z.string().trim().min(3).max(300),
  stockTreatment: z.enum(['restored', 'loss', 'offered', 'prep_error', 'other', 'none']),
  refund: z.object({ sessionId: z.string().min(1), method: z.enum(['cash', 'card', 'voucher']), amountMil: z.number().int().positive() }).nullable(),
});

cancellationsRouter.post('/sales/:id/corrections', requirePermission('pos:correct'), (req, res) => {
  const body = correctionSchema.parse(req.body);
  const user = req.user!;
  runIdempotent(req, res, `sale-correction:${req.params.id}`, () => {
    const sale = getSaleRow(req.params.id);
    if (sale.status !== 'completed') throw new ApiError(409, 'Seule une vente réglée se corrige par un avoir.');
    const lines = db
      .prepare(
        `SELECT l.* FROM pos_order_lines l JOIN pos_orders o ON o.id = l.order_id
         WHERE o.sale_id = ? AND l.status = 'active' AND l.id IN (${body.lineIds.map(() => '?').join(',')})`
      )
      .all(sale.id, ...body.lineIds) as LineRow[];
    if (lines.length !== new Set(body.lineIds).size) throw new ApiError(400, 'Article introuvable sur ce ticket.');
    const already = new Set(
      (db.prepare('SELECT lines_json FROM sale_adjustments WHERE sale_id = ?').all(sale.id) as { lines_json: string }[]).flatMap((r) => JSON.parse(r.lines_json) as string[])
    );
    if (lines.some((l) => already.has(l.id))) throw new ApiError(409, 'Un de ces articles a déjà été corrigé.');

    // Value taken back = what these lines finally cost, ticket discounts included.
    const detail = saleDetail(sale.id);
    const allLines = detail.orders.flatMap((o) => o.lines).filter((l) => l.status === 'active');
    const linesGross = allLines.reduce((s, l) => s + l.totalMil, 0);
    const selectedGross = lines.reduce((s, l) => s + l.gross_mil - l.item_discount_mil, 0);
    const amount = linesGross > 0 ? Math.round((selectedGross * sale.total_mil) / linesGross) : 0;
    if (amount <= 0) throw new ApiError(400, 'Rien à corriger.');
    if (body.refund && body.refund.amountMil > amount) throw new ApiError(400, `Le remboursement ne peut pas dépasser ${formatDt(amount)}.`);

    let refundPaymentId: string | null = null;
    if (body.refund) {
      const session = getOpenSession(body.refund.sessionId);
      refundPaymentId = randomUUID();
      db.prepare(
        `INSERT INTO pos_payments (id, sale_id, session_id, method, kind, amount_mil, change_mil, note, created_by_id, created_by, created_at)
         VALUES (?, ?, ?, ?, 'refund', ?, 0, ?, ?, ?, ?)`
      ).run(refundPaymentId, sale.id, session.id, body.refund.method, -body.refund.amountMil, body.reason, user.id, user.fullName, new Date().toISOString());
    }
    if (body.stockTreatment === 'restored') lines.forEach((l) => restoreStockForLine(l.id, user.fullName, `Avoir ${sale.ticket_number} — ${body.reason}`));

    const id = randomUUID();
    db.prepare(
      `INSERT INTO sale_adjustments (id, sale_id, reason, amount_mil, lines_json, refund_payment_id, stock_treatment, created_by_id, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, sale.id, body.reason, amount, JSON.stringify(lines.map((l) => l.id)), refundPaymentId, body.stockTreatment, user.id, user.fullName, new Date().toISOString());
    adjustmentHooks.forEach((hook) => hook(sale.id, amount, actorOf(user)));
    recordActivity(
      'Caisse',
      'Avoir',
      `Ticket ${sale.ticket_number} — avoir ${formatDt(amount)}${body.refund ? `, remboursé ${formatDt(body.refund.amountMil)} (${PAYMENT_METHOD_LABELS[body.refund.method]})` : ''} — ${body.reason}`,
      user.fullName,
      { userId: user.id, entityType: 'pos_sale', entityId: sale.id, after: { amount, lines: lines.map((l) => l.display_name), refund: body.refund, stockTreatment: body.stockTreatment } }
    );
    return { status: 201, body: { adjustmentId: id, amountMil: amount, sale: saleDetail(sale.id), adjustments: adjustmentsOf(sale.id) } };
  });
  emitPosEvent({ type: 'cash.changed' });
});

export const adjustmentsOf = (saleId: string) =>
  (db.prepare('SELECT * FROM sale_adjustments WHERE sale_id = ? ORDER BY created_at').all(saleId) as {
    id: string;
    reason: string;
    amount_mil: number;
    lines_json: string;
    refund_payment_id: string | null;
    stock_treatment: string;
    created_by: string;
    created_at: string;
  }[]).map((a) => ({
    id: a.id,
    reason: a.reason,
    amountMil: a.amount_mil,
    lineIds: JSON.parse(a.lines_json) as string[],
    refunded: Boolean(a.refund_payment_id),
    stockTreatment: a.stock_treatment,
    createdBy: a.created_by,
    createdAt: a.created_at,
  }));

cancellationsRouter.get('/sales/:id/adjustments', requireAnyPermission('pos:history', 'pos:correct'), asyncHandler((req, res) => {
  getSaleRow(req.params.id);
  res.json(adjustmentsOf(req.params.id));
}));

// --- Integration with the floor and the action queue ------------------------------------------------

registerVisitCloseBlocker((visitId) => {
  const n = (db.prepare("SELECT COUNT(*) AS n FROM cancellation_requests WHERE visit_id = ? AND status = 'pending'").get(visitId) as { n: number }).n;
  return n > 0 ? "Une demande d'annulation de cette table attend une décision." : null;
});

registerTableStateProvider((_tableId, visitId) => {
  if (!visitId) return { pendingCancellations: 0 };
  const n = (db.prepare("SELECT COUNT(*) AS n FROM cancellation_requests WHERE visit_id = ? AND status = 'pending'").get(visitId) as { n: number }).n;
  return { pendingCancellations: n };
});

registerActionProvider((user) => {
  if (!hasPermission(user, 'cancel:approve')) return [];
  const rows = db.prepare("SELECT * FROM cancellation_requests WHERE status = 'pending' ORDER BY created_at").all() as RequestRow[];
  return rows
    .filter((r) => r.requester_id !== user.id)
    .map((r) => ({
      id: `cancel:${r.id}`,
      kind: 'cancellation' as const,
      title: `Annulation : ${r.description}`,
      detail: `${formatDt(r.amount_mil)} — ${r.reason} (${r.requester_name})`,
      tableId: tableIdOfVisit(r.visit_id),
      tableName: tableNameOfVisit(r.visit_id),
      status: r.status,
      createdAt: r.created_at,
      refId: r.id,
    }));
});
