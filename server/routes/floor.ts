import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler, ApiError, notFound } from '../middleware/errors.js';
import { requireAnyPermission, requireAuth, requirePermission } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';
import { emitPosEvent } from '../lib/events.js';
import { runIdempotent } from '../lib/idempotency.js';
import { assertTableAccess, assignedTableIds, canSeeAllTables, currentWaiterOfTable } from '../lib/posAccess.js';
import { actorOf, createOrder, openSaleForVisit, pendingOrdersOfVisit, priceCart, saleDetail, validateOrder, type OrderRow } from '../lib/posService.js';
import { serializeOrder } from '../lib/posService.js';
import { cartLineSchema } from './posCatalog.js';
import { visitCloseBlockers, floorExtensions } from '../lib/floorState.js';

// Plan de salle, tables, carrés et visites (cahier des charges §6).

export const floorRouter = Router();
floorRouter.use(requireAuth);

interface TableRow {
  id: string;
  area_id: string;
  name: string;
  shape: 'round' | 'square' | 'rect';
  capacity: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  qr_token: string;
  qr_checked_at: string | null;
  archived_at: string | null;
}

interface VisitRow {
  id: string;
  table_id: string;
  status: 'open' | 'closed';
  opened_at: string;
  opened_by: string;
  covers: number | null;
  join_code: string;
  join_failures: number;
  primary_waiter_id: string | null;
  primary_waiter_name: string | null;
  reservation_id: string | null;
  closed_at: string | null;
  closed_by: string | null;
}

export const newQrToken = (): string => randomBytes(12).toString('base64url');
// Short code the staff reads out to the customer; renewed at every opening of the table (§4.1).
const newJoinCode = (): string => String(randomInt(0, 10_000)).padStart(4, '0');

const getTable = (id: string): TableRow => {
  const row = db.prepare('SELECT * FROM dining_tables WHERE id = ?').get(id) as TableRow | undefined;
  if (!row) throw notFound('Table');
  return row;
};

export const getVisit = (id: string): VisitRow => {
  const row = db.prepare('SELECT * FROM visits WHERE id = ?').get(id) as VisitRow | undefined;
  if (!row) throw notFound('Visite');
  return row;
};

const serializeTable = (t: TableRow, withQr: boolean) => ({
  id: t.id,
  areaId: t.area_id,
  name: t.name,
  shape: t.shape,
  capacity: t.capacity,
  x: t.x,
  y: t.y,
  width: t.width,
  height: t.height,
  rotation: t.rotation,
  qrToken: withQr ? t.qr_token : undefined,
  qrCheckedAt: t.qr_checked_at,
});

const serializeVisit = (v: VisitRow, withCode: boolean) => ({
  id: v.id,
  tableId: v.table_id,
  status: v.status,
  openedAt: v.opened_at,
  openedBy: v.opened_by,
  covers: v.covers,
  joinCode: withCode ? v.join_code : undefined,
  primaryWaiter: v.primary_waiter_name,
  reservationId: v.reservation_id,
  closedAt: v.closed_at,
  closedBy: v.closed_by,
});

// --- Live floor ----------------------------------------------------------------------------------

floorRouter.get('/floor', requireAnyPermission('floor:view', 'floor:manage', 'pos:sell'), asyncHandler((req, res) => {
  const user = req.user!;
  const seeAll = canSeeAllTables(user);
  const mine = assignedTableIds(user.id);
  const areas = db.prepare('SELECT id, name, sort FROM floor_areas WHERE archived_at IS NULL ORDER BY sort, created_at').all();
  const tables = db.prepare('SELECT * FROM dining_tables WHERE archived_at IS NULL ORDER BY name').all() as TableRow[];
  const sections = db
    .prepare(
      `SELECT s.id, s.name, s.color, sa.waiter_id, sa.waiter_name FROM sections s
       LEFT JOIN section_assignments sa ON sa.section_id = s.id AND sa.ends_at IS NULL
       WHERE s.archived_at IS NULL ORDER BY s.created_at`
    )
    .all() as { id: string; name: string; color: string; waiter_id: string | null; waiter_name: string | null }[];
  const sectionOfTable = new Map((db.prepare('SELECT table_id, section_id FROM section_tables').all() as { table_id: string; section_id: string }[]).map((r) => [r.table_id, r.section_id]));
  const openVisits = new Map((db.prepare("SELECT * FROM visits WHERE status = 'open'").all() as VisitRow[]).map((v) => [v.table_id, v]));
  const canManage = user.isSuperAdmin || user.permissions.includes('floor:manage');

  res.json({
    areas,
    sections: sections.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      waiterId: s.waiter_id,
      waiterName: s.waiter_name,
      tableIds: [...sectionOfTable.entries()].filter(([, sid]) => sid === s.id).map(([tid]) => tid),
    })),
    tables: tables.map((t) => {
      const accessible = seeAll || mine.has(t.id);
      const visit = openVisits.get(t.id);
      const bill = visit
        ? (db.prepare("SELECT COALESCE(SUM(total_mil), 0) AS total, COALESCE(SUM(paid_mil), 0) AS paid FROM pos_sales WHERE visit_id = ? AND status = 'open'").get(visit.id) as {
            total: number;
            paid: number;
          })
        : null;
      return {
        ...serializeTable(t, canManage),
        sectionId: sectionOfTable.get(t.id) ?? null,
        accessible,
        visit: visit && accessible ? serializeVisit(visit, true) : visit ? { id: visit.id, openedAt: visit.opened_at, status: 'open' } : null,
        pendingOrders: visit ? pendingOrdersOfVisit(visit.id) : 0,
        billTotalMil: bill?.total ?? 0,
        billPaidMil: bill?.paid ?? 0,
        ...floorExtensions(t.id, visit?.id ?? null),
      };
    }),
  });
}));

// --- Plan editing (floor:manage) ---------------------------------------------------------------

const areaSchema = z.object({ name: z.string().trim().min(1).max(60), sort: z.number().int().min(0).max(1000).optional() });

floorRouter.post('/floor/areas', requirePermission('floor:manage'), asyncHandler((req, res) => {
  const body = areaSchema.parse(req.body);
  const id = randomUUID();
  db.prepare('INSERT INTO floor_areas (id, name, sort, created_at) VALUES (?, ?, ?, ?)').run(id, body.name, body.sort ?? 0, new Date().toISOString());
  recordActivity('Salle', 'Espace créé', body.name, req.user!.fullName, { userId: req.user!.id, entityType: 'floor_area', entityId: id });
  emitPosEvent({ type: 'floor.changed' });
  res.status(201).json({ id, name: body.name, sort: body.sort ?? 0 });
}));

floorRouter.put('/floor/areas/:id', requirePermission('floor:manage'), asyncHandler((req, res) => {
  const body = areaSchema.parse(req.body);
  const r = db.prepare('UPDATE floor_areas SET name = ?, sort = COALESCE(?, sort) WHERE id = ? AND archived_at IS NULL').run(body.name, body.sort ?? null, req.params.id);
  if (r.changes === 0) throw notFound('Espace');
  emitPosEvent({ type: 'floor.changed' });
  res.json({ ok: true });
}));

floorRouter.post('/floor/areas/:id/archive', requirePermission('floor:manage'), asyncHandler((req, res) => {
  const busy = db.prepare("SELECT 1 FROM dining_tables WHERE area_id = ? AND archived_at IS NULL").get(req.params.id);
  if (busy) throw new ApiError(409, "Retirez d'abord les tables de cet espace.");
  db.prepare('UPDATE floor_areas SET archived_at = ? WHERE id = ?').run(new Date().toISOString(), req.params.id);
  emitPosEvent({ type: 'floor.changed' });
  res.json({ ok: true });
}));

const tableSchema = z.object({
  areaId: z.string().min(1),
  name: z.string().trim().min(1).max(30),
  shape: z.enum(['round', 'square', 'rect']),
  capacity: z.number().int().min(1).max(40),
  x: z.number().int().min(0).max(4000),
  y: z.number().int().min(0).max(4000),
  width: z.number().int().min(30).max(600),
  height: z.number().int().min(30).max(600),
  rotation: z.number().int().min(0).max(359).default(0),
});

const assertUniqueTableName = (name: string, exceptId?: string): void => {
  const dup = db.prepare('SELECT id FROM dining_tables WHERE lower(name) = lower(?) AND archived_at IS NULL AND id != ?').get(name, exceptId ?? '');
  if (dup) throw new ApiError(409, `Une table « ${name} » existe déjà.`);
};

floorRouter.post('/floor/tables', requirePermission('floor:manage'), asyncHandler((req, res) => {
  const body = tableSchema.parse(req.body);
  if (!db.prepare('SELECT 1 FROM floor_areas WHERE id = ? AND archived_at IS NULL').get(body.areaId)) throw notFound('Espace');
  assertUniqueTableName(body.name);
  const id = randomUUID();
  db.prepare(
    `INSERT INTO dining_tables (id, area_id, name, shape, capacity, x, y, width, height, rotation, qr_token, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, body.areaId, body.name, body.shape, body.capacity, body.x, body.y, body.width, body.height, body.rotation, newQrToken(), new Date().toISOString());
  recordActivity('Salle', 'Table ajoutée', body.name, req.user!.fullName, { userId: req.user!.id, entityType: 'table', entityId: id, after: body });
  emitPosEvent({ type: 'floor.changed' });
  res.status(201).json(serializeTable(getTable(id), true));
}));

floorRouter.put('/floor/tables/:id', requirePermission('floor:manage'), asyncHandler((req, res) => {
  const body = tableSchema.parse(req.body);
  const before = getTable(req.params.id);
  assertUniqueTableName(body.name, before.id);
  db.prepare('UPDATE dining_tables SET area_id=?, name=?, shape=?, capacity=?, x=?, y=?, width=?, height=?, rotation=? WHERE id=?').run(
    body.areaId,
    body.name,
    body.shape,
    body.capacity,
    body.x,
    body.y,
    body.width,
    body.height,
    body.rotation,
    before.id
  );
  emitPosEvent({ type: 'floor.changed' });
  res.json(serializeTable(getTable(before.id), true));
}));

// Saves the positions of many tables at once (drag & drop in the editor).
floorRouter.put('/floor/layout', requirePermission('floor:manage'), asyncHandler((req, res) => {
  const { tables } = z
    .object({
      tables: z
        .array(z.object({ id: z.string(), x: z.number().int().min(0).max(4000), y: z.number().int().min(0).max(4000), width: z.number().int().min(30).max(600), height: z.number().int().min(30).max(600), rotation: z.number().int().min(0).max(359) }))
        .max(300),
    })
    .parse(req.body);
  const update = db.prepare('UPDATE dining_tables SET x = ?, y = ?, width = ?, height = ?, rotation = ? WHERE id = ?');
  db.transaction(() => tables.forEach((t) => update.run(t.x, t.y, t.width, t.height, t.rotation, t.id)))();
  emitPosEvent({ type: 'floor.changed' });
  res.json({ ok: true });
}));

floorRouter.post('/floor/tables/:id/archive', requirePermission('floor:manage'), asyncHandler((req, res) => {
  const table = getTable(req.params.id);
  if (db.prepare("SELECT 1 FROM visits WHERE table_id = ? AND status = 'open'").get(table.id)) throw new ApiError(409, 'Cette table est occupée.');
  db.transaction(() => {
    db.prepare('UPDATE dining_tables SET archived_at = ? WHERE id = ?').run(new Date().toISOString(), table.id);
    db.prepare('DELETE FROM section_tables WHERE table_id = ?').run(table.id);
    recordActivity('Salle', 'Table retirée', table.name, req.user!.fullName, { userId: req.user!.id, entityType: 'table', entityId: table.id });
  })();
  emitPosEvent({ type: 'floor.changed' });
  res.json({ ok: true });
}));

// A lost or copied QR code is replaced: the previous one stops working at once.
floorRouter.post('/floor/tables/:id/regenerate-qr', requirePermission('floor:manage'), asyncHandler((req, res) => {
  const table = getTable(req.params.id);
  db.transaction(() => {
    db.prepare('UPDATE dining_tables SET qr_token = ?, qr_checked_at = NULL WHERE id = ?').run(newQrToken(), table.id);
    recordActivity('Salle', 'QR code renouvelé', table.name, req.user!.fullName, { userId: req.user!.id, entityType: 'table', entityId: table.id });
  })();
  res.json(serializeTable(getTable(table.id), true));
}));

floorRouter.post('/floor/tables/:id/qr-checked', requirePermission('floor:manage'), asyncHandler((req, res) => {
  const table = getTable(req.params.id);
  db.prepare('UPDATE dining_tables SET qr_checked_at = ? WHERE id = ?').run(new Date().toISOString(), table.id);
  res.json(serializeTable(getTable(table.id), true));
}));

// --- Sections and assignments (tables:assign) ----------------------------------------------------

const sectionSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#10b981'),
  tableIds: z.array(z.string()).max(300).default([]),
});

const saveSectionTables = (sectionId: string, tableIds: string[]): void => {
  db.prepare('DELETE FROM section_tables WHERE section_id = ?').run(sectionId);
  const upsert = db.prepare('INSERT INTO section_tables (table_id, section_id) VALUES (?, ?) ON CONFLICT(table_id) DO UPDATE SET section_id = excluded.section_id');
  tableIds.forEach((tid) => upsert.run(tid, sectionId));
};

floorRouter.post('/floor/sections', requirePermission('tables:assign'), asyncHandler((req, res) => {
  const body = sectionSchema.parse(req.body);
  const id = randomUUID();
  db.transaction(() => {
    db.prepare('INSERT INTO sections (id, name, color, created_at) VALUES (?, ?, ?, ?)').run(id, body.name, body.color, new Date().toISOString());
    saveSectionTables(id, body.tableIds);
    recordActivity('Salle', 'Carré créé', body.name, req.user!.fullName, { userId: req.user!.id, entityType: 'section', entityId: id, after: body });
  })();
  emitPosEvent({ type: 'floor.changed' });
  res.status(201).json({ id });
}));

floorRouter.put('/floor/sections/:id', requirePermission('tables:assign'), asyncHandler((req, res) => {
  const body = sectionSchema.parse(req.body);
  const before = db.prepare('SELECT * FROM sections WHERE id = ? AND archived_at IS NULL').get(req.params.id);
  if (!before) throw notFound('Carré');
  const beforeTables = db.prepare('SELECT table_id FROM section_tables WHERE section_id = ?').all(req.params.id);
  db.transaction(() => {
    db.prepare('UPDATE sections SET name = ?, color = ? WHERE id = ?').run(body.name, body.color, req.params.id);
    saveSectionTables(req.params.id, body.tableIds);
    recordActivity('Salle', 'Carré modifié', body.name, req.user!.fullName, {
      userId: req.user!.id,
      entityType: 'section',
      entityId: req.params.id,
      before: { section: before, tables: beforeTables },
      after: body,
    });
  })();
  emitPosEvent({ type: 'floor.changed' });
  res.json({ ok: true });
}));

floorRouter.post('/floor/sections/:id/archive', requirePermission('tables:assign'), asyncHandler((req, res) => {
  db.transaction(() => {
    db.prepare('UPDATE sections SET archived_at = ? WHERE id = ?').run(new Date().toISOString(), req.params.id);
    db.prepare('UPDATE section_assignments SET ends_at = ? WHERE section_id = ? AND ends_at IS NULL').run(new Date().toISOString(), req.params.id);
    db.prepare('DELETE FROM section_tables WHERE section_id = ?').run(req.params.id);
  })();
  emitPosEvent({ type: 'floor.changed' });
  res.json({ ok: true });
}));

// Staff who can take orders — the candidates for a section.
floorRouter.get('/floor/waiters', requireAnyPermission('tables:assign', 'floor:view'), asyncHandler((_req, res) => {
  const rows = db
    .prepare(
      `SELECT DISTINCT u.id, u.full_name FROM users u JOIN roles r ON r.id = u.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id AND rp.permission_key = 'orders:take'
       WHERE u.is_active = 1 AND (r.is_system = 1 OR rp.permission_key IS NOT NULL) ORDER BY u.full_name`
    )
    .all() as { id: string; full_name: string }[];
  res.json(rows.map((r) => ({ id: r.id, name: r.full_name })));
}));

// Reassignment during service keeps the history (former and new waiter, date): lines already
// validated keep their waiter, new ones take the new assignment (§6.4).
floorRouter.post('/floor/sections/:id/assign', requirePermission('tables:assign'), asyncHandler((req, res) => {
  const { waiterId } = z.object({ waiterId: z.string().nullable() }).parse(req.body);
  const section = db.prepare('SELECT id, name FROM sections WHERE id = ? AND archived_at IS NULL').get(req.params.id) as { id: string; name: string } | undefined;
  if (!section) throw notFound('Carré');
  const waiter = waiterId ? (db.prepare('SELECT id, full_name FROM users WHERE id = ? AND is_active = 1').get(waiterId) as { id: string; full_name: string } | undefined) : null;
  if (waiterId && !waiter) throw notFound('Serveur');
  const now = new Date().toISOString();
  db.transaction(() => {
    const current = db.prepare('SELECT * FROM section_assignments WHERE section_id = ? AND ends_at IS NULL').get(section.id) as { id: string; waiter_name: string } | undefined;
    if (current) db.prepare('UPDATE section_assignments SET ends_at = ? WHERE id = ?').run(now, current.id);
    if (waiter) {
      db.prepare(
        'INSERT INTO section_assignments (id, section_id, waiter_id, waiter_name, starts_at, assigned_by, previous_waiter_name) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(randomUUID(), section.id, waiter.id, waiter.full_name, now, req.user!.fullName, current?.waiter_name ?? null);
    }
    recordActivity('Salle', 'Affectation', `${section.name} : ${current?.waiter_name ?? '—'} → ${waiter?.full_name ?? '—'}`, req.user!.fullName, {
      userId: req.user!.id,
      entityType: 'section',
      entityId: section.id,
      before: { waiter: current?.waiter_name ?? null },
      after: { waiter: waiter?.full_name ?? null },
    });
  })();
  emitPosEvent({ type: 'floor.changed' });
  res.json({ ok: true });
}));

floorRouter.get('/floor/sections/:id/history', requireAnyPermission('tables:assign'), asyncHandler((req, res) => {
  const rows = db.prepare('SELECT * FROM section_assignments WHERE section_id = ? ORDER BY starts_at DESC LIMIT 100').all(req.params.id) as {
    waiter_name: string;
    starts_at: string;
    ends_at: string | null;
    assigned_by: string;
    previous_waiter_name: string | null;
  }[];
  res.json(rows.map((r) => ({ waiter: r.waiter_name, startsAt: r.starts_at, endsAt: r.ends_at, assignedBy: r.assigned_by, previousWaiter: r.previous_waiter_name })));
}));

// --- Visits ----------------------------------------------------------------------------------------

const visitDetail = (visit: VisitRow) => {
  const table = getTable(visit.table_id);
  const sales = db.prepare('SELECT id FROM pos_sales WHERE visit_id = ? ORDER BY created_at').all(visit.id) as { id: string }[];
  const pending = db
    .prepare("SELECT * FROM pos_orders WHERE visit_id = ? AND status IN ('pending_validation', 'awaiting_customer', 'rejected') ORDER BY order_number")
    .all(visit.id) as OrderRow[];
  return {
    ...serializeVisit(visit, true),
    table: { id: table.id, name: table.name, capacity: table.capacity },
    sales: sales.map((s) => saleDetail(s.id)),
    pendingOrders: pending.map(serializeOrder),
    ...floorExtensions(table.id, visit.id),
  };
};

floorRouter.get('/visits/:id', requireAnyPermission('floor:view', 'pos:sell', 'pos:collect'), asyncHandler((req, res) => {
  const visit = getVisit(req.params.id);
  assertTableAccess(req.user!, visit.table_id);
  res.json(visitDetail(visit));
}));

const openVisitSchema = z.object({ tableId: z.string().min(1), covers: z.number().int().min(1).max(100).nullable().optional(), reservationId: z.string().nullable().optional() });

// Opening a table starts a new visit with its own history and a fresh customer code (§4.1, §6.3).
export const openVisit = (tableId: string, covers: number | null, by: { id: string; name: string }, reservationId: string | null = null): VisitRow => {
  const table = getTable(tableId);
  if (table.archived_at) throw notFound('Table');
  if (db.prepare("SELECT 1 FROM visits WHERE table_id = ? AND status = 'open'").get(table.id)) throw new ApiError(409, `La table ${table.name} est déjà ouverte.`);
  const waiter = currentWaiterOfTable(table.id) ?? { id: by.id, name: by.name };
  const id = randomUUID();
  db.prepare(
    `INSERT INTO visits (id, table_id, status, opened_at, opened_by_id, opened_by, covers, join_code, primary_waiter_id, primary_waiter_name, reservation_id)
     VALUES (?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, table.id, new Date().toISOString(), by.id, by.name, covers, newJoinCode(), waiter.id, waiter.name, reservationId);
  recordActivity('Salle', 'Table ouverte', `${table.name}${covers ? ` — ${covers} couvert(s)` : ''}`, by.name, { userId: by.id, entityType: 'visit', entityId: id });
  return getVisit(id);
};

floorRouter.post('/visits', requirePermission('visits:manage'), (req, res) => {
  const body = openVisitSchema.parse(req.body);
  const user = req.user!;
  assertTableAccess(user, body.tableId);
  runIdempotent(req, res, `visit-open:${body.tableId}`, () => {
    const visit = db.transaction(() => openVisit(body.tableId, body.covers ?? null, { id: user.id, name: user.fullName }, body.reservationId ?? null))();
    return { status: 201, body: visitDetail(visit) };
  }, { required: false });
  emitPosEvent({ type: 'floor.changed' });
});

floorRouter.patch('/visits/:id', requirePermission('visits:manage'), asyncHandler((req, res) => {
  const { covers } = z.object({ covers: z.number().int().min(1).max(100) }).parse(req.body);
  const visit = getVisit(req.params.id);
  assertTableAccess(req.user!, visit.table_id);
  if (visit.status !== 'open') throw new ApiError(409, 'Cette visite est clôturée.');
  db.transaction(() => {
    db.prepare('UPDATE visits SET covers = ? WHERE id = ?').run(covers, visit.id);
    recordActivity('Salle', 'Couverts', `${getTable(visit.table_id).name} : ${visit.covers ?? '—'} → ${covers}`, req.user!.fullName, {
      userId: req.user!.id,
      entityType: 'visit',
      entityId: visit.id,
      before: { covers: visit.covers },
      after: { covers },
    });
  })();
  emitPosEvent({ type: 'floor.changed' });
  res.json(visitDetail(getVisit(visit.id)));
}));

floorRouter.post('/visits/:id/regenerate-code', requirePermission('visits:manage'), asyncHandler((req, res) => {
  const visit = getVisit(req.params.id);
  assertTableAccess(req.user!, visit.table_id);
  if (visit.status !== 'open') throw new ApiError(409, 'Cette visite est clôturée.');
  db.prepare('UPDATE visits SET join_code = ?, join_failures = 0 WHERE id = ?').run(newJoinCode(), visit.id);
  res.json(visitDetail(getVisit(visit.id)));
}));

// Releasing a table: covers known, nothing left to settle or to validate. Closing the visit
// invalidates every phone that joined it (§4.1).
floorRouter.post('/visits/:id/close', requirePermission('visits:manage'), asyncHandler((req, res) => {
  const visit = getVisit(req.params.id);
  const user = req.user!;
  assertTableAccess(user, visit.table_id);
  if (visit.status !== 'open') throw new ApiError(409, 'Cette visite est déjà clôturée.');
  if (!visit.covers) throw new ApiError(409, 'Renseignez le nombre de couverts avant de libérer la table.');
  const blockers = visitCloseBlockers(visit.id);
  if (blockers.length > 0) throw new ApiError(409, blockers[0]);
  const now = new Date().toISOString();
  const table = getTable(visit.table_id);
  db.transaction(() => {
    // The visit is credited to the waiter in charge at closing (§13.4).
    const waiter = currentWaiterOfTable(table.id) ?? (visit.primary_waiter_name ? { id: visit.primary_waiter_id, name: visit.primary_waiter_name } : null);
    db.prepare("UPDATE visits SET status = 'closed', closed_at = ?, closed_by = ?, primary_waiter_id = ?, primary_waiter_name = ? WHERE id = ?").run(
      now,
      user.fullName,
      waiter?.id ?? null,
      waiter?.name ?? null,
      visit.id
    );
    db.prepare('UPDATE visit_devices SET revoked_at = ? WHERE visit_id = ? AND revoked_at IS NULL').run(now, visit.id);
    // An empty bill (everything cancelled) is closed with the visit.
    db.prepare("UPDATE pos_sales SET status = 'cancelled' WHERE visit_id = ? AND status = 'open' AND total_mil = 0").run(visit.id);
    recordActivity('Salle', 'Table libérée', `${table.name} — ${visit.covers} couvert(s)`, user.fullName, { userId: user.id, entityType: 'visit', entityId: visit.id });
  })();
  emitPosEvent({ type: 'floor.changed' });
  emitPosEvent({ type: 'actions.changed' });
  res.json(visitDetail(getVisit(visit.id)));
}));

// --- Staff orders on a table ------------------------------------------------------------------------

const staffOrderSchema = z.object({ lines: z.array(cartLineSchema).min(1).max(100), note: z.string().trim().max(300).optional() });

// An order taken by the staff is validated immediately (only QR orders wait for validation).
floorRouter.post('/visits/:id/orders', requirePermission('orders:take'), (req, res) => {
  const body = staffOrderSchema.parse(req.body);
  const user = req.user!;
  const visit = getVisit(req.params.id);
  assertTableAccess(user, visit.table_id);
  runIdempotent(req, res, `staff-order:${visit.id}`, () => {
    if (visit.status !== 'open') throw new ApiError(409, 'Cette visite est clôturée.');
    const by = actorOf(user);
    const cart = priceCart(body.lines);
    const sale = openSaleForVisit(visit.id, by);
    const order = createOrder({ channel: 'staff', serviceType: 'dine_in', visitId: visit.id, saleId: sale.id, status: 'pending_validation', note: body.note, cart, createdBy: by });
    validateOrder(order.id, by);
    recordActivity('Commandes', 'Commande', `${getTable(visit.table_id).name} — commande n°${order.order_number}`, user.fullName, { userId: user.id, entityType: 'pos_order', entityId: order.id });
    return { status: 201, body: visitDetail(getVisit(visit.id)) };
  });
  emitPosEvent({ type: 'prep.changed' });
  emitPosEvent({ type: 'floor.changed', visitId: visit.id });
});
