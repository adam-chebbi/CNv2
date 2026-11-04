import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler, ApiError, notFound } from '../middleware/errors.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';
import { dotationBetween, schedule, situationAt, type DepreciableAsset } from '../../src/data/depreciation.js';
import { tunisClock } from '../../src/data/pricing.js';

// Registre des équipements et amortissement (cahier des charges §15). Equipment is kept apart from
// consumable stock; purchase, payment and depreciation are reported separately.

export const equipmentRouter = Router();
equipmentRouter.use(requireAuth);

interface EquipmentRow {
  id: string;
  name: string;
  reference: string | null;
  category: string;
  serial_number: string | null;
  supplier: string | null;
  purchase_date: string | null;
  in_service_date: string;
  value_mil: number;
  residual_mil: number;
  duration_months: number;
  document: string | null;
  status: 'active' | 'retired';
  retired_on: string | null;
  retired_reason: string | null;
  created_by: string;
  created_at: string;
}

export const toAsset = (r: EquipmentRow): DepreciableAsset => ({
  valueMil: r.value_mil,
  residualMil: r.residual_mil,
  durationMonths: r.duration_months,
  inServiceDate: r.in_service_date,
  retiredOn: r.retired_on,
});

const currentMonth = () => tunisClock(new Date()).date.slice(0, 7);

const serialize = (r: EquipmentRow) => ({
  id: r.id,
  name: r.name,
  reference: r.reference,
  category: r.category,
  serialNumber: r.serial_number,
  supplier: r.supplier,
  purchaseDate: r.purchase_date,
  inServiceDate: r.in_service_date,
  valueMil: r.value_mil,
  residualMil: r.residual_mil,
  durationMonths: r.duration_months,
  document: r.document,
  status: r.status,
  retiredOn: r.retired_on,
  retiredReason: r.retired_reason,
  situation: situationAt(toAsset(r), currentMonth()),
});

const get = (id: string): EquipmentRow => {
  const row = db.prepare('SELECT * FROM equipment WHERE id = ?').get(id) as EquipmentRow | undefined;
  if (!row) throw notFound('Équipement');
  return row;
};

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format AAAA-MM-JJ.');
const schema = z
  .object({
    name: z.string().trim().min(1).max(100),
    reference: z.string().trim().max(100).nullable().optional(),
    category: z.string().trim().min(1).max(60),
    serialNumber: z.string().trim().max(100).nullable().optional(),
    supplier: z.string().trim().max(100).nullable().optional(),
    purchaseDate: date.nullable().optional(),
    inServiceDate: date,
    valueMil: z.number().int().positive().max(10_000_000_000),
    residualMil: z.number().int().min(0).default(0),
    durationMonths: z.number().int().min(1).max(600),
    document: z.string().trim().max(300).nullable().optional(),
  })
  .refine((e) => e.residualMil < e.valueMil, { message: 'La valeur résiduelle doit être inférieure à la valeur amortissable.', path: ['residualMil'] });

const params = (e: z.infer<typeof schema>) => ({
  name: e.name,
  reference: e.reference ?? null,
  category: e.category,
  serial_number: e.serialNumber ?? null,
  supplier: e.supplier ?? null,
  purchase_date: e.purchaseDate ?? null,
  in_service_date: e.inServiceDate,
  value_mil: e.valueMil,
  residual_mil: e.residualMil,
  duration_months: e.durationMonths,
  document: e.document ?? null,
});

equipmentRouter.get('/equipment', requirePermission('equipment:view'), asyncHandler((_req, res) => {
  const rows = db.prepare('SELECT * FROM equipment ORDER BY status, name').all() as EquipmentRow[];
  res.json(rows.map(serialize));
}));

equipmentRouter.get('/equipment/:id/schedule', requirePermission('equipment:view'), asyncHandler((req, res) => {
  const row = get(req.params.id);
  res.json({ equipment: serialize(row), schedule: schedule(toAsset(row)) });
}));

// Total depreciation of the period, for the dashboard and reports (months, inclusive).
export const depreciationBetween = (fromMonth: string, toMonth: string): number =>
  (db.prepare('SELECT * FROM equipment').all() as EquipmentRow[]).reduce((s, r) => s + dotationBetween(toAsset(r), fromMonth, toMonth), 0);

equipmentRouter.get('/equipment-depreciation', requirePermission('equipment:view'), asyncHandler((req, res) => {
  const q = z.object({ from: z.string().regex(/^\d{4}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}$/) }).parse(req.query);
  const rows = db.prepare('SELECT * FROM equipment ORDER BY name').all() as EquipmentRow[];
  const lines = rows.map((r) => ({ id: r.id, name: r.name, dotationMil: dotationBetween(toAsset(r), q.from, q.to) })).filter((l) => l.dotationMil > 0);
  res.json({ ...q, totalMil: lines.reduce((s, l) => s + l.dotationMil, 0), lines });
}));

equipmentRouter.post('/equipment', requirePermission('equipment:manage'), asyncHandler((req, res) => {
  const body = schema.parse(req.body);
  const id = randomUUID();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO equipment (id, name, reference, category, serial_number, supplier, purchase_date, in_service_date, value_mil, residual_mil, duration_months,
       document, status, created_by, created_at) VALUES (@id, @name, @reference, @category, @serial_number, @supplier, @purchase_date, @in_service_date,
       @value_mil, @residual_mil, @duration_months, @document, 'active', @created_by, @created_at)`
    ).run({ id, ...params(body), created_by: req.user!.fullName, created_at: new Date().toISOString() });
    recordActivity('Équipements', 'Ajout', body.name, req.user!.fullName, { userId: req.user!.id, entityType: 'equipment', entityId: id, after: body });
  })();
  res.status(201).json(serialize(get(id)));
}));

equipmentRouter.put('/equipment/:id', requirePermission('equipment:manage'), asyncHandler((req, res) => {
  const body = schema.parse(req.body);
  const before = get(req.params.id);
  db.transaction(() => {
    db.prepare(
      `UPDATE equipment SET name=@name, reference=@reference, category=@category, serial_number=@serial_number, supplier=@supplier, purchase_date=@purchase_date,
       in_service_date=@in_service_date, value_mil=@value_mil, residual_mil=@residual_mil, duration_months=@duration_months, document=@document,
       updated_by=@updated_by, updated_at=@updated_at WHERE id=@id`
    ).run({ id: before.id, ...params(body), updated_by: req.user!.fullName, updated_at: new Date().toISOString() });
    recordActivity('Équipements', 'Modification', body.name, req.user!.fullName, { userId: req.user!.id, entityType: 'equipment', entityId: before.id, before: serialize(before), after: body });
  })();
  res.json(serialize(get(before.id)));
}));

// Leaving the register (sold, broken beyond repair): no more depreciation afterwards; kept on record.
equipmentRouter.post('/equipment/:id/retire', requirePermission('equipment:manage'), asyncHandler((req, res) => {
  const body = z.object({ date, reason: z.string().trim().min(3).max(300) }).parse(req.body);
  const row = get(req.params.id);
  if (row.status === 'retired') throw new ApiError(409, 'Cet équipement est déjà sorti du suivi.');
  if (body.date < row.in_service_date) throw new ApiError(400, 'La date de sortie précède la mise en service.');
  db.transaction(() => {
    db.prepare("UPDATE equipment SET status = 'retired', retired_on = ?, retired_reason = ?, updated_by = ?, updated_at = ? WHERE id = ?").run(
      body.date,
      body.reason,
      req.user!.fullName,
      new Date().toISOString(),
      row.id
    );
    recordActivity('Équipements', 'Sortie du suivi', `${row.name} — ${body.reason}`, req.user!.fullName, { userId: req.user!.id, entityType: 'equipment', entityId: row.id, after: body });
  })();
  res.json(serialize(get(row.id)));
}));
