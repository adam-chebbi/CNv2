import { randomUUID } from 'node:crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler, ApiError, notFound } from '../middleware/errors.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';
import { emitPosEvent } from '../lib/events.js';
import { rateLimit } from '../lib/rateLimit.js';
import { currentCustomerId } from '../lib/clientIdentity.js';
import { onVisitClosed, registerTableStateProvider } from '../lib/floorState.js';
import { hasPermission } from '../lib/posAccess.js';
import { registerActionProvider } from './serviceDesk.js';
import { openVisit } from './floor.js';
import { readPosSettings } from './posCatalog.js';
import { tunisClock } from '../../src/data/pricing.js';

// Réservations en ligne (cahier des charges §9). A request made online is only ever "en attente"
// until the team confirms it; the team also records phone bookings, checks slot and capacity
// conflicts, assigns a table, and seats the guests on arrival (which opens the table's visit).
// No SMS/WhatsApp is sent automatically (§19.3): the phone number is there to call back.

export type ReservationStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'arrived' | 'no_show' | 'completed';

interface ReservationRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  date: string;
  time: string;
  duration_min: number;
  people: number;
  comment: string | null;
  status: ReservationStatus;
  table_id: string | null;
  customer_id: string | null;
  source: 'online' | 'phone' | 'walk_in';
  change_request: string | null;
  decision_note: string | null;
  visit_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Allowed status changes by the team.
const TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  pending: ['confirmed', 'rejected', 'cancelled'],
  confirmed: ['arrived', 'no_show', 'cancelled'],
  arrived: ['completed'],
  rejected: [],
  cancelled: [],
  no_show: [],
  completed: [],
};

// Minutes on a local (Tunis) timeline, comparable between a reservation and "now".
const localMinutes = (date: string, time: string): number => {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, h, min) / 60_000;
};
const nowLocalMinutes = (): number => {
  const c = tunisClock(new Date());
  return localMinutes(c.date, c.time);
};

const BLOCKING: ReservationStatus[] = ['confirmed', 'arrived'];

// Another confirmed booking on the same table whose slot overlaps (§9.2).
export const findConflict = (tableId: string, date: string, time: string, durationMin: number, exceptId?: string): ReservationRow | null => {
  const start = localMinutes(date, time);
  const end = start + durationMin;
  const rows = db
    .prepare(`SELECT * FROM reservations WHERE table_id = ? AND date = ? AND status IN (${BLOCKING.map(() => '?').join(',')}) AND id != ?`)
    .all(tableId, date, ...BLOCKING, exceptId ?? '') as ReservationRow[];
  return rows.find((r) => {
    const s = localMinutes(r.date, r.time);
    return s < end && start < s + r.duration_min;
  }) ?? null;
};

const tableName = (tableId: string | null): string | null =>
  tableId ? ((db.prepare('SELECT name FROM dining_tables WHERE id = ?').get(tableId) as { name: string } | undefined)?.name ?? null) : null;

const serialize = (r: ReservationRow, withContact = true) => ({
  id: r.id,
  name: r.name,
  phone: withContact ? r.phone : undefined,
  email: withContact ? r.email : undefined,
  date: r.date,
  time: r.time,
  durationMin: r.duration_min,
  people: r.people,
  comment: r.comment,
  status: r.status,
  tableId: r.table_id,
  tableName: tableName(r.table_id),
  source: r.source,
  changeRequest: r.change_request,
  decisionNote: r.decision_note,
  visitId: r.visit_id,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const getReservation = (id: string): ReservationRow => {
  const row = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id) as ReservationRow | undefined;
  if (!row) throw notFound('Réservation');
  return row;
};

const logEvent = (id: string, from: ReservationStatus | null, to: ReservationStatus, note: string | null, by: string): void => {
  db.prepare('INSERT INTO reservation_events (id, reservation_id, from_status, to_status, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    randomUUID(),
    id,
    from,
    to,
    note,
    by,
    new Date().toISOString()
  );
};

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide.');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure invalide.');
const phone = z
  .string()
  .trim()
  .regex(/^(\+216)?\s?\d{2}\s?\d{3}\s?\d{3}$/, 'Numéro de téléphone tunisien attendu (8 chiffres).')
  .transform((v) => v.replace(/\s/g, ''));

const assertBookable = (d: string, t: string, people: number, online: boolean): void => {
  const settings = readPosSettings();
  if (localMinutes(d, t) <= nowLocalMinutes()) throw new ApiError(400, 'Choisissez une date et une heure à venir.');
  if (t < settings.openingTime || t >= settings.closingTime) throw new ApiError(400, `Nous accueillons les réservations de ${settings.openingTime} à ${settings.closingTime}.`);
  if (online && people > settings.reservationMaxPeople) {
    throw new ApiError(400, `Pour un groupe de plus de ${settings.reservationMaxPeople} personnes, appelez-nous directement.`);
  }
};

// --- Public side ----------------------------------------------------------------------------------

export const reservationsPublicRouter = Router();

const publicRequestSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone,
  email: z.string().trim().toLowerCase().email().max(200).optional().or(z.literal('')),
  date,
  time,
  people: z.number().int().min(1).max(100),
  comment: z.string().trim().max(500).optional(),
  // Invisible field: only robots fill it.
  website: z.string().max(0, 'Requête refusée.').optional(),
});

reservationsPublicRouter.post('/reservations', rateLimit('reservation-request', 5, 60 * 60_000), asyncHandler((req, res) => {
  const body = publicRequestSchema.parse(req.body);
  assertBookable(body.date, body.time, body.people, true);
  const id = randomUUID();
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO reservations (id, name, phone, email, date, time, duration_min, people, comment, status, customer_id, source, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'online', 'Client (en ligne)', ?, ?)`
    ).run(id, body.name, body.phone, body.email || null, body.date, body.time, readPosSettings().reservationDurationMinutes, body.people, body.comment || null, currentCustomerId(req), now, now);
    logEvent(id, null, 'pending', null, 'Client (en ligne)');
  })();
  emitPosEvent({ type: 'reservations.changed' });
  emitPosEvent({ type: 'actions.changed' });
  res.status(201).json({ ...serialize(getReservation(id), false), message: 'Votre demande est en attente de confirmation. Café Noir vous contactera.' });
}));

const requireCustomerId = (req: Request): string => {
  const id = currentCustomerId(req);
  if (!id) throw new ApiError(401, 'Connectez-vous à votre compte.', 'CUSTOMER_LOGIN_REQUIRED');
  return id;
};

reservationsPublicRouter.get('/account/reservations', asyncHandler((req, res) => {
  const customerId = requireCustomerId(req);
  const rows = db.prepare('SELECT * FROM reservations WHERE customer_id = ? ORDER BY date DESC, time DESC LIMIT 50').all(customerId) as ReservationRow[];
  res.json(rows.map((r) => ({ ...serialize(r, false), tableName: undefined })));
}));

// A customer asks for a change or a cancellation (§9.3). Cancelling frees the slot at once; a
// change is a request the team handles.
reservationsPublicRouter.post('/account/reservations/:id/request', asyncHandler((req, res) => {
  const customerId = requireCustomerId(req);
  const body = z.object({ type: z.enum(['cancel', 'change']), message: z.string().trim().max(300).optional() }).parse(req.body);
  const r = getReservation(req.params.id);
  if (r.customer_id !== customerId) throw notFound('Réservation');
  if (!['pending', 'confirmed'].includes(r.status)) throw new ApiError(409, 'Cette réservation ne peut plus être modifiée.');
  const now = new Date().toISOString();
  db.transaction(() => {
    if (body.type === 'cancel') {
      db.prepare("UPDATE reservations SET status = 'cancelled', updated_at = ? WHERE id = ?").run(now, r.id);
      logEvent(r.id, r.status, 'cancelled', 'Annulée par le client', 'Client');
    } else {
      if (!body.message) throw new ApiError(400, 'Précisez la modification souhaitée.');
      db.prepare('UPDATE reservations SET change_request = ?, updated_at = ? WHERE id = ?').run(body.message, now, r.id);
    }
  })();
  emitPosEvent({ type: 'reservations.changed' });
  emitPosEvent({ type: 'actions.changed' });
  res.json(serialize(getReservation(r.id), false));
}));

// --- Staff side --------------------------------------------------------------------------------------

export const reservationsRouter = Router();
reservationsRouter.use(requireAuth);

reservationsRouter.get('/reservations', requirePermission('reservations:view'), asyncHandler((req, res) => {
  const q = z.object({ from: date.optional(), to: date.optional(), status: z.string().optional() }).parse(req.query);
  const from = q.from ?? tunisClock(new Date()).date;
  const to = q.to ?? from;
  const rows = db.prepare('SELECT * FROM reservations WHERE date >= ? AND date <= ? ORDER BY date, time').all(from, to) as ReservationRow[];
  const statuses = q.status ? q.status.split(',') : null;
  res.json(rows.filter((r) => !statuses || statuses.includes(r.status)).map((r) => serialize(r)));
}));

// Free tables for a slot, smallest suitable first; tables too small are listed apart.
reservationsRouter.get('/reservations/availability', requirePermission('reservations:view'), asyncHandler((req, res) => {
  const q = z.object({ date, time, people: z.coerce.number().int().min(1), exceptId: z.string().optional() }).parse(req.query);
  const duration = readPosSettings().reservationDurationMinutes;
  const tables = db.prepare('SELECT id, name, capacity FROM dining_tables WHERE archived_at IS NULL ORDER BY capacity, name').all() as { id: string; name: string; capacity: number }[];
  res.json(
    tables.map((t) => {
      const conflict = findConflict(t.id, q.date, q.time, duration, q.exceptId);
      return { id: t.id, name: t.name, capacity: t.capacity, fits: t.capacity >= q.people, conflict: conflict ? { id: conflict.id, name: conflict.name, time: conflict.time } : null };
    })
  );
}));

const staffSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone,
  email: z.string().trim().toLowerCase().email().max(200).optional().or(z.literal('')),
  date,
  time,
  people: z.number().int().min(1).max(100),
  comment: z.string().trim().max(500).optional(),
  tableId: z.string().nullable().optional(),
  durationMin: z.number().int().min(15).max(480).optional(),
  source: z.enum(['phone', 'walk_in']).default('phone'),
  confirm: z.boolean().default(true),
});

const assertTableFree = (tableId: string | null | undefined, d: string, t: string, duration: number, exceptId?: string): void => {
  if (!tableId) return;
  if (!db.prepare('SELECT 1 FROM dining_tables WHERE id = ? AND archived_at IS NULL').get(tableId)) throw notFound('Table');
  const conflict = findConflict(tableId, d, t, duration, exceptId);
  if (conflict) throw new ApiError(409, `Conflit : la table est déjà réservée pour ${conflict.name} à ${conflict.time}.`);
};

// A booking taken by phone is usually confirmed on the spot.
reservationsRouter.post('/reservations', requirePermission('reservations:manage'), asyncHandler((req, res) => {
  const body = staffSchema.parse(req.body);
  assertBookable(body.date, body.time, body.people, false);
  const duration = body.durationMin ?? readPosSettings().reservationDurationMinutes;
  assertTableFree(body.tableId, body.date, body.time, duration);
  const status: ReservationStatus = body.confirm ? 'confirmed' : 'pending';
  const id = randomUUID();
  const now = new Date().toISOString();
  const user = req.user!;
  db.transaction(() => {
    db.prepare(
      `INSERT INTO reservations (id, name, phone, email, date, time, duration_min, people, comment, status, table_id, source, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, body.name, body.phone, body.email || null, body.date, body.time, duration, body.people, body.comment || null, status, body.tableId ?? null, body.source, user.fullName, now, now);
    logEvent(id, null, status, null, user.fullName);
    recordActivity('Réservations', 'Création', `${body.name} — ${body.date} ${body.time}, ${body.people} pers.`, user.fullName, { userId: user.id, entityType: 'reservation', entityId: id });
  })();
  emitPosEvent({ type: 'reservations.changed' });
  emitPosEvent({ type: 'floor.changed' });
  res.status(201).json(serialize(getReservation(id)));
}));

reservationsRouter.put('/reservations/:id', requirePermission('reservations:manage'), asyncHandler((req, res) => {
  const body = staffSchema.omit({ confirm: true, source: true }).parse(req.body);
  const before = getReservation(req.params.id);
  if (!['pending', 'confirmed'].includes(before.status)) throw new ApiError(409, 'Cette réservation ne peut plus être modifiée.');
  if (before.date !== body.date || before.time !== body.time) assertBookable(body.date, body.time, body.people, false);
  const duration = body.durationMin ?? before.duration_min;
  assertTableFree(body.tableId, body.date, body.time, duration, before.id);
  const user = req.user!;
  db.transaction(() => {
    db.prepare(
      'UPDATE reservations SET name = ?, phone = ?, email = ?, date = ?, time = ?, duration_min = ?, people = ?, comment = ?, table_id = ?, change_request = NULL, updated_at = ? WHERE id = ?'
    ).run(body.name, body.phone, body.email || null, body.date, body.time, duration, body.people, body.comment || null, body.tableId ?? null, new Date().toISOString(), before.id);
    recordActivity('Réservations', 'Modification', `${body.name} — ${body.date} ${body.time}, ${body.people} pers.`, user.fullName, {
      userId: user.id,
      entityType: 'reservation',
      entityId: before.id,
      before: serialize(before),
      after: body,
    });
  })();
  emitPosEvent({ type: 'reservations.changed' });
  emitPosEvent({ type: 'floor.changed' });
  res.json(serialize(getReservation(before.id)));
}));

const statusSchema = z.object({
  status: z.enum(['confirmed', 'rejected', 'cancelled', 'arrived', 'no_show']),
  note: z.string().trim().max(300).optional(),
  tableId: z.string().optional(),
});

reservationsRouter.post('/reservations/:id/status', requirePermission('reservations:manage'), asyncHandler((req, res) => {
  const body = statusSchema.parse(req.body);
  const r = getReservation(req.params.id);
  const user = req.user!;
  if (!TRANSITIONS[r.status].includes(body.status)) throw new ApiError(409, 'Changement d’état non autorisé pour cette réservation.');
  if (body.status === 'rejected' && !body.note) throw new ApiError(400, 'Indiquez la raison du refus.');
  const tableId = body.tableId ?? r.table_id;
  if (body.status === 'confirmed') assertTableFree(tableId, r.date, r.time, r.duration_min, r.id);
  if (body.status === 'arrived' && !tableId) throw new ApiError(400, 'Choisissez la table où installer les clients.');
  if (body.status === 'arrived' && !hasPermission(user, 'visits:manage')) throw new ApiError(403, "Vous n'avez pas la permission d'ouvrir une table.");

  db.transaction(() => {
    let visitId: string | null = r.visit_id;
    if (body.status === 'arrived') visitId = openVisit(tableId!, r.people, { id: user.id, name: user.fullName }, r.id).id;
    db.prepare('UPDATE reservations SET status = ?, table_id = ?, decision_note = COALESCE(?, decision_note), visit_id = ?, change_request = NULL, updated_at = ? WHERE id = ?').run(
      body.status,
      tableId,
      body.note ?? null,
      visitId,
      new Date().toISOString(),
      r.id
    );
    logEvent(r.id, r.status, body.status, body.note ?? null, user.fullName);
    recordActivity('Réservations', 'État', `${r.name} (${r.date} ${r.time}) : ${r.status} → ${body.status}`, user.fullName, { userId: user.id, entityType: 'reservation', entityId: r.id });
  })();
  emitPosEvent({ type: 'reservations.changed' });
  emitPosEvent({ type: 'floor.changed' });
  emitPosEvent({ type: 'actions.changed' });
  res.json(serialize(getReservation(r.id)));
}));

reservationsRouter.get('/reservations/:id/history', requirePermission('reservations:view'), asyncHandler((req, res) => {
  getReservation(req.params.id);
  res.json(db.prepare('SELECT from_status AS "from", to_status AS "to", note, created_by AS createdBy, created_at AS createdAt FROM reservation_events WHERE reservation_id = ? ORDER BY created_at').all(req.params.id));
}));

// --- Integration ----------------------------------------------------------------------------------

// A seated reservation is completed when its table is released.
onVisitClosed((visitId, by) => {
  const r = db.prepare("SELECT id, status FROM reservations WHERE visit_id = ? AND status = 'arrived'").get(visitId) as { id: string; status: ReservationStatus } | undefined;
  if (!r) return;
  db.prepare("UPDATE reservations SET status = 'completed', updated_at = ? WHERE id = ?").run(new Date().toISOString(), r.id);
  logEvent(r.id, 'arrived', 'completed', null, by);
});

// The floor shows a table as reserved only close to the slot — never the whole day (§6.2).
const SHOW_BEFORE_MIN = 60;
const SHOW_AFTER_MIN = 15;
registerTableStateProvider((tableId, visitId) => {
  if (visitId) return { upcomingReservation: null };
  const today = tunisClock(new Date()).date;
  const now = nowLocalMinutes();
  const rows = db.prepare("SELECT * FROM reservations WHERE table_id = ? AND date = ? AND status = 'confirmed' ORDER BY time").all(tableId, today) as ReservationRow[];
  const soon = rows.find((r) => {
    const start = localMinutes(r.date, r.time);
    return start - SHOW_BEFORE_MIN <= now && now <= start + SHOW_AFTER_MIN;
  });
  return { upcomingReservation: soon ? { id: soon.id, name: soon.name, time: soon.time, people: soon.people } : null };
});

registerActionProvider((user) => {
  if (!hasPermission(user, 'reservations:view')) return [];
  const rows = db.prepare("SELECT * FROM reservations WHERE status = 'pending' OR (change_request IS NOT NULL AND status IN ('pending', 'confirmed')) ORDER BY created_at").all() as ReservationRow[];
  return rows.map((r) => ({
    id: `reservation:${r.id}`,
    kind: 'reservation' as const,
    title: r.change_request ? `Modification demandée — ${r.name}` : `Réservation à confirmer — ${r.name}`,
    detail: `${r.date} à ${r.time} · ${r.people} pers.${r.change_request ? ` · « ${r.change_request} »` : ''}`,
    tableId: null,
    tableName: tableName(r.table_id),
    status: r.status,
    createdAt: r.created_at,
    refId: r.id,
  }));
});
