import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler, ApiError, notFound } from '../middleware/errors.js';
import { requireAnyPermission, requireAuth, requirePermission } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';
import { hasPermission } from '../lib/posAccess.js';
import { allowedActions, buildShifts, CLOCK_LABELS, stateAfter, tunisDate, type ClockAction, type ClockEvent } from '../../src/data/timeclock.js';
import { tunisClock } from '../../src/data/pricing.js';

// Équipe, pointage et historique des serveurs (cahier des charges §13).

export const teamRouter = Router();
teamRouter.use(requireAuth);

interface EventRow {
  id: string;
  user_id: string;
  user_name: string;
  action: ClockAction;
  occurred_at: string;
  original_at: string | null;
  status: 'active' | 'voided';
  incoherent: number;
  source: 'self' | 'manual';
  created_at: string;
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// Tunisia is UTC+1 all year round: a Tunis day [D 00:00, D+1 00:00) in UTC.
export const tunisDayRange = (from: string, to: string): [string, string] => {
  const start = new Date(`${from}T00:00:00+01:00`).toISOString();
  const end = new Date(new Date(`${to}T00:00:00+01:00`).getTime() + 86_400_000).toISOString();
  return [start, end];
};

const defaultRange = (q: { from?: string; to?: string }) => {
  const today = tunisClock(new Date()).date;
  const from = q.from ?? tunisClock(new Date(Date.now() - 6 * 86_400_000)).date;
  return { from, to: q.to ?? today };
};

const activeEvents = (userId: string | null, from: string, to: string): EventRow[] => {
  // A shift may start the evening before the period: look one day back, then keep shifts by date.
  const [start, end] = tunisDayRange(tunisClock(new Date(Date.parse(`${from}T12:00:00Z`) - 86_400_000)).date, to);
  return (userId
    ? db.prepare("SELECT * FROM timeclock_events WHERE status = 'active' AND user_id = ? AND occurred_at >= ? AND occurred_at < ? ORDER BY occurred_at").all(userId, start, end)
    : db.prepare("SELECT * FROM timeclock_events WHERE status = 'active' AND occurred_at >= ? AND occurred_at < ? ORDER BY occurred_at").all(start, end)) as EventRow[];
};

const lastAction = (userId: string): ClockAction | null =>
  (db.prepare("SELECT action FROM timeclock_events WHERE user_id = ? AND status = 'active' ORDER BY occurred_at DESC LIMIT 1").get(userId) as { action: ClockAction } | undefined)?.action ?? null;

const shiftsFor = (rows: EventRow[], from: string, to: string) =>
  buildShifts(rows.map((r): ClockEvent => ({ id: r.id, action: r.action, at: r.occurred_at })))
    .filter((s) => s.date >= from && s.date <= to)
    .map((s) => ({ ...s, corrected: s.eventIds.some((id) => rows.find((r) => r.id === id)?.original_at || rows.find((r) => r.id === id)?.source === 'manual') }));

const serializeEvent = (r: EventRow) => ({ id: r.id, action: r.action, at: r.occurred_at, originalAt: r.original_at, incoherent: r.incoherent === 1, source: r.source });

// --- Pointer -----------------------------------------------------------------------------------------

teamRouter.get('/timeclock/me', requirePermission('timeclock:self'), asyncHandler((req, res) => {
  const q = defaultRange(z.object({ from: date.optional(), to: date.optional() }).parse(req.query));
  const user = req.user!;
  const rows = activeEvents(user.id, q.from, q.to);
  const state = stateAfter(lastAction(user.id));
  res.json({ ...q, state, allowed: allowedActions(state), shifts: shiftsFor(rows, q.from, q.to), events: rows.map(serializeEvent) });
}));

// Logging in is never an arrival: the employee taps the action. The time is the server's (§13.2).
// An action out of sequence is still recorded — flagged as incoherent for the managers.
teamRouter.post('/timeclock', requirePermission('timeclock:self'), asyncHandler((req, res) => {
  const { action } = z.object({ action: z.enum(['in', 'break_start', 'break_end', 'out']) }).parse(req.body);
  const user = req.user!;
  const previous = lastAction(user.id);
  // Debounce: the same action twice within a minute is a double tap, not a second event.
  const recent = db
    .prepare("SELECT 1 FROM timeclock_events WHERE user_id = ? AND action = ? AND status = 'active' AND occurred_at > ?")
    .get(user.id, action, new Date(Date.now() - 60_000).toISOString());
  if (!recent) {
    const incoherent = !allowedActions(stateAfter(previous)).includes(action);
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare("INSERT INTO timeclock_events (id, user_id, user_name, action, occurred_at, incoherent, source, created_at) VALUES (?, ?, ?, ?, ?, ?, 'self', ?)").run(
        randomUUID(),
        user.id,
        user.fullName,
        action,
        now,
        incoherent ? 1 : 0,
        now
      );
      recordActivity('Pointage', CLOCK_LABELS[action], incoherent ? `${CLOCK_LABELS[action]} (hors séquence)` : CLOCK_LABELS[action], user.fullName, { userId: user.id });
    })();
  }
  const state = stateAfter(lastAction(user.id));
  res.status(201).json({ state, allowed: allowedActions(state) });
}));

// --- Team view and corrections -----------------------------------------------------------------------

teamRouter.get('/timeclock/team', requirePermission('timeclock:team'), asyncHandler((req, res) => {
  const q = defaultRange(z.object({ from: date.optional(), to: date.optional() }).parse(req.query));
  const rows = activeEvents(null, q.from, q.to);
  const byUser = new Map<string, EventRow[]>();
  rows.forEach((r) => byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]));
  res.json({
    ...q,
    people: [...byUser.entries()].map(([userId, list]) => {
      const shifts = shiftsFor(list, q.from, q.to);
      return {
        userId,
        name: list[0].user_name,
        state: stateAfter(lastAction(userId)),
        workedMinutes: shifts.reduce((s, x) => s + (x.workedMinutes ?? 0), 0),
        incompleteShifts: shifts.filter((s) => s.workedMinutes === null).length,
        shifts,
        events: list.map(serializeEvent),
      };
    }),
  });
}));

teamRouter.get('/timeclock/events/:id/corrections', requireAnyPermission('timeclock:team', 'timeclock:self'), asyncHandler((req, res) => {
  const event = db.prepare('SELECT * FROM timeclock_events WHERE id = ?').get(req.params.id) as EventRow | undefined;
  if (!event) throw notFound('Pointage');
  if (event.user_id !== req.user!.id && !hasPermission(req.user!, 'timeclock:team')) throw new ApiError(403, "Vous n'avez pas accès à ce pointage.");
  res.json(db.prepare('SELECT kind, before_at AS beforeAt, after_at AS afterAt, reason, created_by AS createdBy, created_at AS createdAt FROM timeclock_corrections WHERE event_id = ? ORDER BY created_at').all(event.id));
}));

const isoNotFuture = z.string().datetime({ offset: true }).refine((v) => Date.parse(v) <= Date.now() + 60_000, 'Une heure future ne peut pas être enregistrée.');
const reason = z.string().trim().min(3, 'Le motif est obligatoire.').max(300);

// Correction keeps the initial value (original_at) and the author (§13.3).
teamRouter.post('/timeclock/events/:id/correct', requirePermission('timeclock:correct'), asyncHandler((req, res) => {
  const body = z.object({ at: isoNotFuture.optional(), void: z.boolean().optional(), reason }).parse(req.body);
  const event = db.prepare('SELECT * FROM timeclock_events WHERE id = ?').get(req.params.id) as EventRow | undefined;
  if (!event || event.status !== 'active') throw notFound('Pointage');
  if (!body.at && !body.void) throw new ApiError(400, 'Indiquez la nouvelle heure ou l’annulation du pointage.');
  const user = req.user!;
  const now = new Date().toISOString();
  db.transaction(() => {
    if (body.void) {
      db.prepare("UPDATE timeclock_events SET status = 'voided' WHERE id = ?").run(event.id);
    } else {
      db.prepare('UPDATE timeclock_events SET occurred_at = ?, original_at = COALESCE(original_at, ?) WHERE id = ?').run(new Date(body.at!).toISOString(), event.occurred_at, event.id);
    }
    db.prepare('INSERT INTO timeclock_corrections (id, event_id, kind, before_at, after_at, reason, created_by_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      randomUUID(),
      event.id,
      body.void ? 'void' : 'edit',
      event.occurred_at,
      body.void ? null : new Date(body.at!).toISOString(),
      body.reason,
      user.id,
      user.fullName,
      now
    );
    recordActivity('Pointage', 'Correction', `${event.user_name} — ${CLOCK_LABELS[event.action]} ${body.void ? 'annulé' : `→ ${body.at}`} — ${body.reason}`, user.fullName, {
      userId: user.id,
      entityType: 'timeclock_event',
      entityId: event.id,
      before: { at: event.occurred_at },
      after: body,
    });
  })();
  res.json({ ok: true });
}));

// Completing a forgotten event (typically a departure) — entered by a manager, with a reason.
teamRouter.post('/timeclock/events', requirePermission('timeclock:correct'), asyncHandler((req, res) => {
  const body = z.object({ userId: z.string().min(1), action: z.enum(['in', 'break_start', 'break_end', 'out']), at: isoNotFuture, reason }).parse(req.body);
  const employee = db.prepare('SELECT id, full_name FROM users WHERE id = ?').get(body.userId) as { id: string; full_name: string } | undefined;
  if (!employee) throw notFound('Salarié');
  const user = req.user!;
  const id = randomUUID();
  const at = new Date(body.at).toISOString();
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare("INSERT INTO timeclock_events (id, user_id, user_name, action, occurred_at, source, created_at) VALUES (?, ?, ?, ?, ?, 'manual', ?)").run(id, employee.id, employee.full_name, body.action, at, now);
    db.prepare("INSERT INTO timeclock_corrections (id, event_id, kind, after_at, reason, created_by_id, created_by, created_at) VALUES (?, ?, 'add', ?, ?, ?, ?, ?)").run(randomUUID(), id, at, body.reason, user.id, user.fullName, now);
    recordActivity('Pointage', 'Ajout', `${employee.full_name} — ${CLOCK_LABELS[body.action]} ${tunisDate(at)} — ${body.reason}`, user.fullName, { userId: user.id, entityType: 'timeclock_event', entityId: id, after: body });
  })();
  res.status(201).json({ id });
}));

// --- Waiter statistics (§13.4) -----------------------------------------------------------------------

export interface WaiterStats {
  userId: string | null;
  name: string;
  visitsServed: number;
  covers: number;
  revenueMil: number;
  ordersHandled: number;
  cancellationsRequested: number;
  workedMinutes: number;
  incompleteShifts: number;
}

// Rules: a table served = a closed visit credited to its main waiter at closing; revenue = settled
// lines credited to the waiter responsible when they were validated (a manager validating or
// collecting does not take the credit); lines without a known waiter are reported as such.
export const waiterStats = (from: string, to: string, onlyUserId?: string): WaiterStats[] => {
  const [start, end] = tunisDayRange(from, to);
  const visits = db
    .prepare("SELECT primary_waiter_id AS id, primary_waiter_name AS name, COUNT(*) AS n, COALESCE(SUM(covers), 0) AS covers FROM visits WHERE status = 'closed' AND closed_at >= ? AND closed_at < ? GROUP BY primary_waiter_id")
    .all(start, end) as { id: string | null; name: string | null; n: number; covers: number }[];
  const revenue = db
    .prepare(
      `SELECT l.responsible_waiter_id AS id, l.responsible_waiter_name AS name, SUM(l.gross_mil - l.item_discount_mil) AS revenue, COUNT(DISTINCT l.order_id) AS orders
       FROM pos_order_lines l JOIN pos_orders o ON o.id = l.order_id JOIN pos_sales s ON s.id = o.sale_id
       WHERE s.status = 'completed' AND s.completed_at >= ? AND s.completed_at < ? AND l.status = 'active'
       GROUP BY l.responsible_waiter_id`
    )
    .all(start, end) as { id: string | null; name: string | null; revenue: number; orders: number }[];
  const cancellations = db
    .prepare('SELECT requester_id AS id, requester_name AS name, COUNT(*) AS n FROM cancellation_requests WHERE created_at >= ? AND created_at < ? GROUP BY requester_id')
    .all(start, end) as { id: string; name: string; n: number }[];
  const clock = activeEvents(null, from, to);

  const ids = new Set<string | null>([...visits.map((v) => v.id), ...revenue.map((r) => r.id), ...cancellations.map((c) => c.id), ...clock.map((c) => c.user_id)]);
  const rows: WaiterStats[] = [...ids].map((id) => {
    const shifts = shiftsFor(clock.filter((c) => c.user_id === id), from, to);
    return {
      userId: id,
      name: (visits.find((v) => v.id === id)?.name ?? revenue.find((r) => r.id === id)?.name ?? cancellations.find((c) => c.id === id)?.name ?? clock.find((c) => c.user_id === id)?.user_name) || 'Non attribué',
      visitsServed: visits.find((v) => v.id === id)?.n ?? 0,
      covers: visits.find((v) => v.id === id)?.covers ?? 0,
      revenueMil: revenue.find((r) => r.id === id)?.revenue ?? 0,
      ordersHandled: revenue.find((r) => r.id === id)?.orders ?? 0,
      cancellationsRequested: cancellations.find((c) => c.id === id)?.n ?? 0,
      workedMinutes: shifts.reduce((s, x) => s + (x.workedMinutes ?? 0), 0),
      incompleteShifts: shifts.filter((s) => s.workedMinutes === null).length,
    };
  });
  return (onlyUserId ? rows.filter((r) => r.userId === onlyUserId) : rows).sort((a, b) => b.revenueMil - a.revenueMil);
};

// A waiter sees only their own figures — the filter is applied here, not in the screen (§3.2).
teamRouter.get('/stats/waiters/me', requirePermission('stats:self'), asyncHandler((req, res) => {
  const q = defaultRange(z.object({ from: date.optional(), to: date.optional() }).parse(req.query));
  const user = req.user!;
  const mine = waiterStats(q.from, q.to, user.id)[0];
  res.json({ ...q, stats: mine ?? { userId: user.id, name: user.fullName, visitsServed: 0, covers: 0, revenueMil: 0, ordersHandled: 0, cancellationsRequested: 0, workedMinutes: 0, incompleteShifts: 0 } });
}));

teamRouter.get('/stats/waiters', requirePermission('stats:team'), asyncHandler((req, res) => {
  const q = defaultRange(z.object({ from: date.optional(), to: date.optional() }).parse(req.query));
  res.json({ ...q, rows: waiterStats(q.from, q.to) });
}));

teamRouter.get('/team/members', requireAnyPermission('timeclock:correct', 'timeclock:team'), asyncHandler((_req, res) => {
  res.json((db.prepare('SELECT id, full_name AS name FROM users WHERE is_active = 1 ORDER BY full_name').all() as { id: string; name: string }[]));
}));
