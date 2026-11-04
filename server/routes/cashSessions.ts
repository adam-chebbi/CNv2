import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { fromJson } from '../db/json.js';
import { asyncHandler, ApiError, notFound } from '../middleware/errors.js';
import { requireAnyPermission, requireAuth, requirePermission } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';
import { emitPosEvent } from '../lib/events.js';
import { runIdempotent } from '../lib/idempotency.js';
import { countedTotal, summarizeSession, type PaymentMethod, type SessionSummary } from '../../src/data/cashSession.js';
import { formatDt } from '../../src/data/money.js';

// Sessions de caisse (cahier des charges §2.7 – §2.9): opening float, cash movements outside
// sales, closing count with the expected amount, corrections of a closed session.

export const cashSessionsRouter = Router();
cashSessionsRouter.use(requireAuth);

interface SessionRow {
  id: string;
  register_id: string;
  status: 'open' | 'closed';
  opened_by_id: string;
  opened_by: string;
  opened_at: string;
  opening_float_mil: number;
  opening_comment: string | null;
  closed_by_id: string | null;
  closed_by: string | null;
  closed_at: string | null;
  expected_cash_mil: number | null;
  counted_cash_mil: number | null;
  difference_mil: number | null;
  closing_comment: string | null;
  counts_json: string | null;
  summary_json: string | null;
}

interface MovementRow {
  id: string;
  session_id: string;
  type: 'in' | 'out';
  amount_mil: number;
  reason: string;
  comment: string | null;
  expense_id: string | null;
  created_by: string;
  created_at: string;
}

const getSession = (id: string): SessionRow => {
  const row = db.prepare('SELECT * FROM cash_sessions WHERE id = ?').get(id) as SessionRow | undefined;
  if (!row) throw notFound('Session de caisse');
  return row;
};

export const getOpenSession = (id: string): SessionRow => {
  const session = getSession(id);
  if (session.status !== 'open') throw new ApiError(409, 'Cette session de caisse est clôturée.');
  return session;
};

export const computeSessionSummary = (session: SessionRow): SessionSummary => {
  const byMethod = db
    .prepare('SELECT method, SUM(amount_mil) AS total FROM pos_payments WHERE session_id = ? GROUP BY method')
    .all(session.id) as { method: PaymentMethod; total: number }[];
  const paymentsByMethod: Record<PaymentMethod, number> = { cash: 0, card: 0, voucher: 0 };
  byMethod.forEach((r) => (paymentsByMethod[r.method] = r.total));
  const refunds = db
    .prepare("SELECT COALESCE(SUM(-amount_mil), 0) AS total FROM pos_payments WHERE session_id = ? AND method = 'cash' AND kind = 'refund'")
    .get(session.id) as { total: number };
  const movements = db
    .prepare('SELECT type, COALESCE(SUM(amount_mil), 0) AS total FROM cash_movements WHERE session_id = ? GROUP BY type')
    .all(session.id) as { type: 'in' | 'out'; total: number }[];
  return summarizeSession({
    openingFloatMil: session.opening_float_mil,
    paymentsByMethod,
    cashRefundsMil: refunds.total,
    cashInMil: movements.find((m) => m.type === 'in')?.total ?? 0,
    cashOutMil: movements.find((m) => m.type === 'out')?.total ?? 0,
  });
};

const serializeSession = (s: SessionRow) => {
  const register = db.prepare('SELECT name FROM cash_registers WHERE id = ?').get(s.register_id) as { name: string } | undefined;
  return {
    id: s.id,
    registerId: s.register_id,
    registerName: register?.name ?? '',
    status: s.status,
    openedBy: s.opened_by,
    openedAt: s.opened_at,
    openingFloatMil: s.opening_float_mil,
    openingComment: s.opening_comment,
    closedBy: s.closed_by,
    closedAt: s.closed_at,
    expectedCashMil: s.expected_cash_mil,
    countedCashMil: s.counted_cash_mil,
    differenceMil: s.difference_mil,
    closingComment: s.closing_comment,
    counts: s.counts_json ? fromJson<Record<string, number>>(s.counts_json, {}) : null,
  };
};

const sessionDetail = (s: SessionRow) => {
  const movements = db.prepare('SELECT * FROM cash_movements WHERE session_id = ? ORDER BY created_at').all(s.id) as MovementRow[];
  const corrections = db.prepare('SELECT * FROM cash_session_corrections WHERE session_id = ? ORDER BY created_at').all(s.id) as {
    id: string;
    counted_before_mil: number;
    counted_after_mil: number;
    reason: string;
    created_by: string;
    created_at: string;
  }[];
  // Bills still open when the session is closed are listed, never settled automatically (§2.9).
  const openBills = db
    .prepare("SELECT id, table_name, total_mil, paid_mil FROM pos_sales WHERE status = 'open' AND total_mil > 0 ORDER BY created_at")
    .all() as { id: string; table_name: string | null; total_mil: number; paid_mil: number }[];
  const ticketCount = (db.prepare("SELECT COUNT(*) AS n FROM pos_sales WHERE session_id = ? AND status = 'completed'").get(s.id) as { n: number }).n;
  return {
    ...serializeSession(s),
    summary: s.status === 'closed' && s.summary_json ? fromJson<SessionSummary>(s.summary_json, computeSessionSummary(s)) : computeSessionSummary(s),
    ticketCount,
    movements: movements.map((m) => ({
      id: m.id,
      type: m.type,
      amountMil: m.amount_mil,
      reason: m.reason,
      comment: m.comment,
      expenseId: m.expense_id,
      createdBy: m.created_by,
      createdAt: m.created_at,
    })),
    corrections: corrections.map((c) => ({
      id: c.id,
      countedBeforeMil: c.counted_before_mil,
      countedAfterMil: c.counted_after_mil,
      reason: c.reason,
      createdBy: c.created_by,
      createdAt: c.created_at,
    })),
    openBills: openBills.map((b) => ({ id: b.id, tableName: b.table_name, totalMil: b.total_mil, paidMil: b.paid_mil })),
  };
};

const SELLERS = ['pos:sell', 'pos:collect', 'cash:view', 'cash:open'];

cashSessionsRouter.get('/registers', requireAnyPermission(...SELLERS), asyncHandler((_req, res) => {
  const rows = db.prepare('SELECT id, name FROM cash_registers WHERE active = 1 ORDER BY created_at').all() as { id: string; name: string }[];
  const open = db.prepare("SELECT id, register_id FROM cash_sessions WHERE status = 'open'").all() as { id: string; register_id: string }[];
  res.json(rows.map((r) => ({ ...r, openSessionId: open.find((o) => o.register_id === r.id)?.id ?? null })));
}));

cashSessionsRouter.get('/cash-sessions', requirePermission('cash:view'), asyncHandler((req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 60) || 60, 500);
  const rows = db.prepare('SELECT * FROM cash_sessions ORDER BY opened_at DESC LIMIT ?').all(limit) as SessionRow[];
  res.json(rows.map((s) => ({ ...serializeSession(s), summary: s.summary_json ? fromJson<SessionSummary>(s.summary_json, computeSessionSummary(s)) : computeSessionSummary(s) })));
}));

cashSessionsRouter.get('/cash-sessions/:id', requireAnyPermission(...SELLERS), asyncHandler((req, res) => {
  res.json(sessionDetail(getSession(req.params.id)));
}));

const openSchema = z.object({
  registerId: z.string().min(1),
  openingFloatMil: z.number().int().min(0).max(100_000_000),
  comment: z.string().trim().max(300).optional(),
});

cashSessionsRouter.post('/cash-sessions', requirePermission('cash:open'), (req, res) => {
  const body = openSchema.parse(req.body);
  const user = req.user!;
  runIdempotent(req, res, `cash-open:${user.id}`, () => {
    const register = db.prepare('SELECT id, name FROM cash_registers WHERE id = ? AND active = 1').get(body.registerId) as { id: string; name: string } | undefined;
    if (!register) throw notFound('Caisse');
    if (db.prepare("SELECT 1 FROM cash_sessions WHERE register_id = ? AND status = 'open'").get(register.id)) {
      throw new ApiError(409, 'Une session est déjà ouverte sur cette caisse.');
    }
    const id = randomUUID();
    db.prepare(
      `INSERT INTO cash_sessions (id, register_id, status, opened_by_id, opened_by, opened_at, opening_float_mil, opening_comment)
       VALUES (?, ?, 'open', ?, ?, ?, ?, ?)`
    ).run(id, register.id, user.id, user.fullName, new Date().toISOString(), body.openingFloatMil, body.comment || null);
    recordActivity('Caisse', 'Ouverture', `${register.name} ouverte — fond ${formatDt(body.openingFloatMil)}`, user.fullName, {
      userId: user.id,
      entityType: 'cash_session',
      entityId: id,
      after: { openingFloatMil: body.openingFloatMil, comment: body.comment },
    });
    return { status: 201, body: sessionDetail(getSession(id)) };
  });
  emitPosEvent({ type: 'cash.changed' });
});

const movementSchema = z.object({
  type: z.enum(['in', 'out']),
  amountMil: z.number().int().positive().max(100_000_000),
  reason: z.string().trim().min(1, 'Le motif est obligatoire.').max(120),
  comment: z.string().trim().max(500).optional(),
  // Links a cash-out to an expense already recorded in Dépenses instead of creating a new one (§2.8).
  expenseId: z.string().optional(),
});

cashSessionsRouter.post('/cash-sessions/:id/movements', requirePermission('cash:movement'), (req, res) => {
  const body = movementSchema.parse(req.body);
  const user = req.user!;
  runIdempotent(req, res, `cash-movement:${req.params.id}`, () => {
    const session = getOpenSession(req.params.id);
    if (body.expenseId && !db.prepare('SELECT 1 FROM expenses WHERE id = ?').get(body.expenseId)) throw notFound('Dépense');
    const id = randomUUID();
    db.prepare(
      `INSERT INTO cash_movements (id, session_id, type, amount_mil, reason, comment, expense_id, created_by_id, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, session.id, body.type, body.amountMil, body.reason, body.comment || null, body.expenseId ?? null, user.id, user.fullName, new Date().toISOString());
    recordActivity('Caisse', body.type === 'in' ? "Entrée d'espèces" : "Sortie d'espèces", `${formatDt(body.amountMil)} — ${body.reason}`, user.fullName, {
      userId: user.id,
      entityType: 'cash_movement',
      entityId: id,
      after: body,
    });
    return { status: 201, body: sessionDetail(getSession(session.id)) };
  });
  emitPosEvent({ type: 'cash.changed' });
});

const closeSchema = z.object({
  countedCashMil: z.number().int().min(0).max(1_000_000_000).optional(),
  counts: z.record(z.string(), z.number().int().min(0).max(100_000)).optional(),
  comment: z.string().trim().max(500).optional(),
});

cashSessionsRouter.post('/cash-sessions/:id/close', requirePermission('cash:close'), (req, res) => {
  const body = closeSchema.parse(req.body);
  const user = req.user!;
  runIdempotent(req, res, `cash-close:${req.params.id}`, () => {
    const session = getOpenSession(req.params.id);
    const counted = body.countedCashMil ?? (body.counts ? countedTotal(body.counts) : null);
    if (counted === null) throw new ApiError(400, 'Saisissez le montant des espèces comptées.');
    const summary = computeSessionSummary(session);
    const difference = counted - summary.expectedCashMil;
    if (difference !== 0 && !body.comment) throw new ApiError(400, 'Un écart de caisse doit être commenté.');
    db.prepare(
      `UPDATE cash_sessions SET status = 'closed', closed_by_id = ?, closed_by = ?, closed_at = ?, expected_cash_mil = ?, counted_cash_mil = ?,
       difference_mil = ?, closing_comment = ?, counts_json = ?, summary_json = ? WHERE id = ?`
    ).run(
      user.id,
      user.fullName,
      new Date().toISOString(),
      summary.expectedCashMil,
      counted,
      difference,
      body.comment || null,
      body.counts ? JSON.stringify(body.counts) : null,
      JSON.stringify(summary),
      session.id
    );
    recordActivity(
      'Caisse',
      'Clôture',
      `Session clôturée — attendu ${formatDt(summary.expectedCashMil)}, compté ${formatDt(counted)}, écart ${formatDt(difference)}`,
      user.fullName,
      { userId: user.id, entityType: 'cash_session', entityId: session.id, after: { expected: summary.expectedCashMil, counted, difference, comment: body.comment } }
    );
    return { status: 200, body: sessionDetail(getSession(session.id)) };
  });
  emitPosEvent({ type: 'cash.changed' });
});

const correctionSchema = z.object({
  countedCashMil: z.number().int().min(0).max(1_000_000_000),
  reason: z.string().trim().min(3, 'Le motif est obligatoire.').max(500),
});

cashSessionsRouter.post('/cash-sessions/:id/corrections', requirePermission('cash:session_correct'), asyncHandler((req, res) => {
  const body = correctionSchema.parse(req.body);
  const user = req.user!;
  const session = getSession(req.params.id);
  if (session.status !== 'closed' || session.counted_cash_mil === null || session.expected_cash_mil === null) {
    throw new ApiError(409, 'Seule une session clôturée peut être corrigée.');
  }
  db.transaction(() => {
    db.prepare(
      `INSERT INTO cash_session_corrections (id, session_id, counted_before_mil, counted_after_mil, reason, created_by_id, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(randomUUID(), session.id, session.counted_cash_mil, body.countedCashMil, body.reason, user.id, user.fullName, new Date().toISOString());
    db.prepare('UPDATE cash_sessions SET counted_cash_mil = ?, difference_mil = ? WHERE id = ?').run(
      body.countedCashMil,
      body.countedCashMil - session.expected_cash_mil!,
      session.id
    );
    recordActivity('Caisse', 'Correction de clôture', `Comptage corrigé de ${formatDt(session.counted_cash_mil!)} à ${formatDt(body.countedCashMil)} — ${body.reason}`, user.fullName, {
      userId: user.id,
      entityType: 'cash_session',
      entityId: session.id,
      before: { countedCashMil: session.counted_cash_mil },
      after: { countedCashMil: body.countedCashMil, reason: body.reason },
    });
  })();
  emitPosEvent({ type: 'cash.changed' });
  res.json(sessionDetail(getSession(session.id)));
}));
