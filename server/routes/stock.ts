import { todayIso } from '../../src/data/dateUtils.js';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler, ApiError, notFound } from '../middleware/errors.js';
import { requireAuth, requirePermission, requireAnyPermission } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';
import { resolveEffectiveEmployeeName } from '../lib/employeeSelection.js';
import {
  applyLedgerEntries,
  reverseLedgerEntry,
  renameStockUnitAcrossProducts,
  getUnitUsageCount,
  type StockProduct,
  type StockUnit,
  type StockLot,
  type StockLedgerEntry,
  type StockZone,
} from '../../src/data/stockModel.js';

const nowIso = () => todayIso();

// --- Row <-> entity mappers ---------------------------------------------------------------------

interface UnitRow { id: string; name: string; created_at: string }
const rowToUnit = (r: UnitRow): StockUnit => ({ id: r.id, name: r.name, createdAt: r.created_at });

interface ProductRow {
  id: string; name: string; sku: string; category: string; unit: string;
  min_threshold: number; target_stock: number; lot_tracked: number; average_cost: number;
  reserve_qty: number; depot_qty: number;
}
const rowToProduct = (r: ProductRow): StockProduct => ({
  id: r.id, name: r.name, sku: r.sku, category: r.category as StockProduct['category'], unit: r.unit,
  minThreshold: r.min_threshold, targetStock: r.target_stock, lotTracked: r.lot_tracked === 1,
  averageCost: r.average_cost, reserveQty: r.reserve_qty, depotQty: r.depot_qty,
});

interface LotRow { id: string; product_id: string; lot_number: string; zone: string; quantity: number; expiry_date: string; received_at: string }
const rowToLot = (r: LotRow): StockLot => ({ id: r.id, productId: r.product_id, lotNumber: r.lot_number, zone: r.zone as StockZone, quantity: r.quantity, expiryDate: r.expiry_date, receivedAt: r.received_at });

interface LedgerRow {
  id: string; group_id: string | null; timestamp: string; type: string; product_id: string; zone: string;
  related_zone: string | null; quantity_before: number; quantity_delta: number; quantity_after: number;
  reason: string; comment: string | null; lot_id: string | null; lot_number: string | null; expiry_date: string | null;
  performed_by: string; status: string; cancelled_at: string | null; cancelled_by: string | null; cancel_reason: string | null;
  value_impact: number; theoretical_qty: number | null; real_qty: number | null; discrepancy_qty: number | null;
  discrepancy_value: number | null; inventory_choice: string | null; inventory_scope: string | null;
}
const rowToLedger = (r: LedgerRow): StockLedgerEntry => ({
  id: r.id, groupId: r.group_id ?? undefined, timestamp: r.timestamp, type: r.type as StockLedgerEntry['type'],
  productId: r.product_id, zone: r.zone as StockZone, relatedZone: (r.related_zone as StockZone) ?? undefined,
  quantityBefore: r.quantity_before, quantityDelta: r.quantity_delta, quantityAfter: r.quantity_after,
  reason: r.reason, comment: r.comment ?? undefined, lotId: r.lot_id ?? undefined, lotNumber: r.lot_number ?? undefined,
  expiryDate: r.expiry_date ?? undefined, performedBy: r.performed_by, status: r.status as StockLedgerEntry['status'],
  cancelledAt: r.cancelled_at ?? undefined, cancelledBy: r.cancelled_by ?? undefined, cancelReason: r.cancel_reason ?? undefined,
  valueImpact: r.value_impact, theoreticalQty: r.theoretical_qty ?? undefined, realQty: r.real_qty ?? undefined,
  discrepancyQty: r.discrepancy_qty ?? undefined, discrepancyValue: r.discrepancy_value ?? undefined,
  inventoryChoice: (r.inventory_choice as StockLedgerEntry['inventoryChoice']) ?? undefined, inventoryScope: r.inventory_scope ?? undefined,
});

export const getAllProducts = (): StockProduct[] => (db.prepare('SELECT * FROM stock_products').all() as ProductRow[]).map(rowToProduct);
export const getAllLots = (): StockLot[] => (db.prepare('SELECT * FROM stock_lots').all() as LotRow[]).map(rowToLot);

const saveProduct = (p: StockProduct): void => {
  db.prepare('UPDATE stock_products SET reserve_qty = ?, depot_qty = ? WHERE id = ?').run(p.reserveQty, p.depotQty, p.id);
};

// Upserts the lot referenced by a ledger entry (by lotId if given, else by product+lotNumber+zone).
const upsertLotForEntry = (entry: StockLedgerEntry): string | undefined => {
  if (!entry.lotNumber) return entry.lotId;
  const existing = entry.lotId
    ? (db.prepare('SELECT * FROM stock_lots WHERE id = ?').get(entry.lotId) as LotRow | undefined)
    : (db.prepare('SELECT * FROM stock_lots WHERE product_id = ? AND lot_number = ? AND zone = ?').get(entry.productId, entry.lotNumber, entry.zone) as LotRow | undefined);

  if (existing) {
    db.prepare('UPDATE stock_lots SET quantity = quantity + ? WHERE id = ?').run(entry.quantityDelta, existing.id);
    return existing.id;
  }
  const id = randomUUID();
  db.prepare('INSERT INTO stock_lots (id, product_id, lot_number, zone, quantity, expiry_date, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id, entry.productId, entry.lotNumber, entry.zone, entry.quantityDelta, entry.expiryDate ?? nowIso(), nowIso()
  );
  return id;
};

const ledgerEntryInputSchema = z.object({
  type: z.enum(['Entrée', 'Sortie', 'Transfert', 'Inventaire', 'Perte', 'Ajustement']),
  productId: z.string().min(1),
  zone: z.enum(['Réserve principale', 'Dépôt']),
  relatedZone: z.enum(['Réserve principale', 'Dépôt']).optional(),
  quantityDelta: z.number(),
  reason: z.string().min(1),
  comment: z.string().optional(),
  lotNumber: z.string().optional(),
  expiryDate: z.string().optional(),
  performedBy: z.string().min(1),
  groupId: z.string().optional(),
  theoreticalQty: z.number().optional(),
  realQty: z.number().optional(),
  discrepancyQty: z.number().optional(),
  discrepancyValue: z.number().optional(),
  inventoryChoice: z.enum(['Ajusté', 'Conservé']).optional(),
  inventoryScope: z.string().optional(),
  // Which automated process created this entry (e.g. 'sale') and its own id — lets a later
  // reversal (e.g. sales.ts's refund handler) find and cancel exactly the entries it caused.
  // Never set by any UI-driven manual movement.
  sourceType: z.string().optional(),
  sourceId: z.string().optional(),
});
export type LedgerEntryInput = z.infer<typeof ledgerEntryInputSchema>;

// The one place server-side that turns validated input into persisted ledger rows + updated
// product/lot quantities -- reused by /ledger/post, /import, and purchase-order receiving so
// posting a stock movement never happens two different ways. Exported for reuse from purchases.ts.
export const postEntries = (inputs: LedgerEntryInput[]): { products: StockProduct[]; lots: StockLot[]; ledger: StockLedgerEntry[] } => {
  const sharedGroupId = inputs.some((e) => e.type === 'Transfert') ? randomUUID() : undefined;
  const products = getAllProducts();
  const inserted: StockLedgerEntry[] = [];

  for (const input of inputs) {
    const product = products.find((p) => p.id === input.productId);
    if (!product) throw new ApiError(400, `Produit introuvable : ${input.productId}`);

    const before = input.zone === 'Réserve principale' ? product.reserveQty : product.depotQty;
    const after = before + input.quantityDelta;
    const entry: StockLedgerEntry = {
      id: randomUUID(),
      groupId: input.groupId ?? (input.type === 'Transfert' ? sharedGroupId : undefined),
      timestamp: new Date().toISOString(),
      type: input.type,
      productId: input.productId,
      zone: input.zone,
      relatedZone: input.relatedZone,
      quantityBefore: before,
      quantityDelta: input.quantityDelta,
      quantityAfter: after,
      reason: input.reason,
      comment: input.comment,
      lotNumber: input.lotNumber,
      expiryDate: input.expiryDate,
      performedBy: input.performedBy,
      status: 'Confirmé',
      valueImpact: input.quantityDelta * product.averageCost,
      theoreticalQty: input.theoreticalQty,
      realQty: input.realQty,
      discrepancyQty: input.discrepancyQty,
      discrepancyValue: input.discrepancyValue,
      inventoryChoice: input.inventoryChoice,
      inventoryScope: input.inventoryScope,
    };

    const lotId = upsertLotForEntry(entry);
    entry.lotId = lotId;

    db.prepare(
      `INSERT INTO stock_ledger (id, group_id, timestamp, type, product_id, zone, related_zone, quantity_before, quantity_delta,
       quantity_after, reason, comment, lot_id, lot_number, expiry_date, performed_by, status, value_impact,
       theoretical_qty, real_qty, discrepancy_qty, discrepancy_value, inventory_choice, inventory_scope, source_type, source_id)
       VALUES (@id, @groupId, @timestamp, @type, @productId, @zone, @relatedZone, @quantityBefore, @quantityDelta,
       @quantityAfter, @reason, @comment, @lotId, @lotNumber, @expiryDate, @performedBy, @status, @valueImpact,
       @theoreticalQty, @realQty, @discrepancyQty, @discrepancyValue, @inventoryChoice, @inventoryScope, @sourceType, @sourceId)`
    ).run({
      id: entry.id, groupId: entry.groupId ?? null, timestamp: entry.timestamp, type: entry.type, productId: entry.productId,
      zone: entry.zone, relatedZone: entry.relatedZone ?? null, quantityBefore: entry.quantityBefore, quantityDelta: entry.quantityDelta,
      quantityAfter: entry.quantityAfter, reason: entry.reason, comment: entry.comment ?? null, lotId: entry.lotId ?? null,
      lotNumber: entry.lotNumber ?? null, expiryDate: entry.expiryDate ?? null, performedBy: entry.performedBy, status: entry.status,
      valueImpact: entry.valueImpact, theoreticalQty: entry.theoreticalQty ?? null, realQty: entry.realQty ?? null,
      discrepancyQty: entry.discrepancyQty ?? null, discrepancyValue: entry.discrepancyValue ?? null,
      inventoryChoice: entry.inventoryChoice ?? null, inventoryScope: entry.inventoryScope ?? null,
      sourceType: input.sourceType ?? null, sourceId: input.sourceId ?? null,
    });

    const updated = applyLedgerEntries(products, [entry]);
    const changedProduct = updated.find((p) => p.id === product.id)!;
    Object.assign(product, changedProduct);
    saveProduct(product);
    inserted.push(entry);
  }

  return { products: getAllProducts(), lots: getAllLots(), ledger: inserted };
};

// Cancels one ledger entry by id: reverses its quantity delta on the product and marks it
// 'Annulé'. Shared by POST /ledger/:id/cancel (a manual, user-initiated cancellation) and
// sales.ts's refund handler (which cancels every entry a given sale's automatic stock deduction
// created) — one cancellation mechanism, not two.
export const cancelLedgerEntryById = (id: string, cancelledBy: string, cancelReason?: string): StockProduct => {
  const row = db.prepare('SELECT * FROM stock_ledger WHERE id = ?').get(id) as LedgerRow | undefined;
  if (!row) throw notFound('Mouvement de stock');
  const entry = rowToLedger(row);
  if (entry.status === 'Annulé') throw new ApiError(409, 'Ce mouvement est déjà annulé.');

  const products = getAllProducts();
  const product = products.find((p) => p.id === entry.productId);
  if (!product) throw notFound('Produit de stock');
  const reversed = reverseLedgerEntry(products, entry).find((p) => p.id === product.id)!;
  saveProduct(reversed);
  db.prepare('UPDATE stock_ledger SET status = ?, cancelled_at = ?, cancelled_by = ?, cancel_reason = ? WHERE id = ?').run(
    'Annulé', new Date().toISOString(), cancelledBy, cancelReason ?? null, entry.id
  );
  return reversed;
};

// Every ledger entry a given automated process created (source_type/source_id, see
// ledgerEntryInputSchema above) that hasn't already been cancelled — e.g. every stock deduction a
// specific sale generated, for a refund to reverse.
export const getLedgerEntryIdsBySource = (sourceType: string, sourceId: string): string[] =>
  (db.prepare("SELECT id FROM stock_ledger WHERE source_type = ? AND source_id = ? AND status != 'Annulé'").all(sourceType, sourceId) as { id: string }[]).map((r) => r.id);

export const stockRouter = Router();
stockRouter.use(requireAuth);

// --- Units -----------------------------------------------------------------------------------

const unitSchema = z.object({ name: z.string().trim().min(1) });

stockRouter.get('/units', requireAnyPermission('stock:view', 'stock:manage', 'stock:inventory', 'products:manage', 'sales:create'), asyncHandler((_req, res) => {
  res.json((db.prepare('SELECT * FROM stock_units ORDER BY created_at ASC').all() as UnitRow[]).map(rowToUnit));
}));

stockRouter.post('/units', requirePermission('stock:manage'), asyncHandler((req, res) => {
  const body = unitSchema.parse(req.body);
  const row: UnitRow = { id: randomUUID(), name: body.name, created_at: nowIso() };
  db.prepare('INSERT INTO stock_units (id, name, created_at) VALUES (?, ?, ?)').run(row.id, row.name, row.created_at);
  recordActivity('Stock', 'Création', `Unité créée — ${row.name}`, req.user!.fullName);
  res.status(201).json(rowToUnit(row));
}));

stockRouter.put('/units/:id', requirePermission('stock:manage'), asyncHandler((req, res) => {
  const body = unitSchema.parse(req.body);
  const existing = db.prepare('SELECT * FROM stock_units WHERE id = ?').get(req.params.id) as UnitRow | undefined;
  if (!existing) throw notFound('Unité');
  db.prepare('UPDATE stock_units SET name = ? WHERE id = ?').run(body.name, req.params.id);
  const renamed = renameStockUnitAcrossProducts(getAllProducts(), existing.name, body.name);
  const tx = db.transaction(() => {
    renamed.forEach((p) => db.prepare('UPDATE stock_products SET unit = ? WHERE id = ?').run(p.unit, p.id));
  });
  tx();
  recordActivity('Stock', 'Modification', `Unité renommée — ${existing.name} → ${body.name}`, req.user!.fullName);
  res.json(rowToUnit({ ...existing, name: body.name }));
}));

stockRouter.delete('/units/:id', requirePermission('stock:manage'), asyncHandler((req, res) => {
  const existing = db.prepare('SELECT * FROM stock_units WHERE id = ?').get(req.params.id) as UnitRow | undefined;
  if (!existing) throw notFound('Unité');
  if (getUnitUsageCount(rowToUnit(existing), getAllProducts()) > 0) {
    throw new ApiError(409, 'Cette unité est utilisée par des produits et ne peut pas être supprimée.');
  }
  db.prepare('DELETE FROM stock_units WHERE id = ?').run(req.params.id);
  recordActivity('Stock', 'Suppression', `Unité supprimée — ${existing.name}`, req.user!.fullName);
  res.status(204).end();
}));

// --- Products (ingredients) -------------------------------------------------------------------

const productSchema = z.object({
  name: z.string().trim().min(1),
  sku: z.string().trim().min(1),
  category: z.string().min(1),
  unit: z.string().min(1),
  minThreshold: z.number().min(0),
  targetStock: z.number().min(0),
  lotTracked: z.boolean(),
  averageCost: z.number().min(0),
  reserveQty: z.number(),
  depotQty: z.number(),
  // Optional, manual-add-ingredient-form-only: when given, the initial reserve/depot quantity is
  // also recorded as a real lot (one row per zone with a positive quantity) instead of being an
  // untraceable number on the product itself — same lot shape as a normal stock reception.
  lotNumber: z.string().trim().optional(),
  expiryDate: z.string().optional(),
});

stockRouter.get('/products', requireAnyPermission('stock:view', 'stock:manage', 'stock:inventory', 'products:manage', 'sales:create'), asyncHandler((_req, res) => {
  res.json(getAllProducts());
}));

stockRouter.post('/products', requirePermission('stock:manage'), asyncHandler((req, res) => {
  const body = productSchema.parse(req.body);
  const row: ProductRow = {
    id: randomUUID(), name: body.name, sku: body.sku, category: body.category, unit: body.unit,
    min_threshold: body.minThreshold, target_stock: body.targetStock, lot_tracked: body.lotTracked ? 1 : 0,
    average_cost: body.averageCost, reserve_qty: body.reserveQty, depot_qty: body.depotQty,
  };
  db.prepare(
    `INSERT INTO stock_products (id, name, sku, category, unit, min_threshold, target_stock, lot_tracked, average_cost, reserve_qty, depot_qty)
     VALUES (@id, @name, @sku, @category, @unit, @min_threshold, @target_stock, @lot_tracked, @average_cost, @reserve_qty, @depot_qty)`
  ).run(row);

  // If a lot number was given, back the initial quantity with a real lot per zone instead of
  // leaving it as an untraceable number on the product — same shape as receiving stock normally.
  if (body.lotNumber) {
    const insertLot = db.prepare(
      'INSERT INTO stock_lots (id, product_id, lot_number, zone, quantity, expiry_date, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const expiry = body.expiryDate || nowIso();
    if (body.reserveQty > 0) insertLot.run(randomUUID(), row.id, body.lotNumber, 'Réserve principale', body.reserveQty, expiry, nowIso());
    if (body.depotQty > 0) insertLot.run(randomUUID(), row.id, body.lotNumber, 'Dépôt', body.depotQty, expiry, nowIso());
  }

  recordActivity('Stock', 'Création', `Produit de stock créé — ${row.name}`, req.user!.fullName);
  res.status(201).json(rowToProduct(row));
}));

stockRouter.put('/products/:id', requirePermission('stock:manage'), asyncHandler((req, res) => {
  const body = productSchema.parse(req.body);
  const existing = db.prepare('SELECT * FROM stock_products WHERE id = ?').get(req.params.id) as ProductRow | undefined;
  if (!existing) throw notFound('Produit de stock');
  db.prepare(
    `UPDATE stock_products SET name=@name, sku=@sku, category=@category, unit=@unit, min_threshold=@min_threshold,
     target_stock=@target_stock, lot_tracked=@lot_tracked, average_cost=@average_cost, reserve_qty=@reserve_qty, depot_qty=@depot_qty
     WHERE id=@id`
  ).run({
    id: req.params.id, name: body.name, sku: body.sku, category: body.category, unit: body.unit,
    min_threshold: body.minThreshold, target_stock: body.targetStock, lot_tracked: body.lotTracked ? 1 : 0,
    average_cost: body.averageCost, reserve_qty: body.reserveQty, depot_qty: body.depotQty,
  });
  recordActivity('Stock', 'Modification', `Produit de stock modifié — ${body.name}`, req.user!.fullName);
  res.json(rowToProduct({ ...existing, ...{
    name: body.name, sku: body.sku, category: body.category, unit: body.unit, min_threshold: body.minThreshold,
    target_stock: body.targetStock, lot_tracked: body.lotTracked ? 1 : 0, average_cost: body.averageCost,
    reserve_qty: body.reserveQty, depot_qty: body.depotQty,
  } }));
}));

// --- Lots (read-only via API; mutated only through ledger postings) ----------------------------

stockRouter.get('/lots', requireAnyPermission('stock:view', 'stock:manage', 'stock:inventory'), asyncHandler((_req, res) => {
  res.json(getAllLots());
}));

// --- Ledger ----------------------------------------------------------------------------------

stockRouter.get('/ledger', requireAnyPermission('stock:view', 'stock:manage', 'stock:inventory'), asyncHandler((_req, res) => {
  const rows = db.prepare('SELECT * FROM stock_ledger ORDER BY timestamp DESC').all() as LedgerRow[];
  res.json(rows.map(rowToLedger));
}));

stockRouter.post('/ledger/post', requirePermission('stock:manage'), asyncHandler((req, res) => {
  const body = z.object({ entries: z.array(ledgerEntryInputSchema).min(1) }).parse(req.body);
  body.entries.forEach((e) => resolveEffectiveEmployeeName(req.user!, e.performedBy));
  const tx = db.transaction(() => postEntries(body.entries));
  const result = tx();
  recordActivity('Stock', body.entries[0].type, `${body.entries.length} mouvement(s) de stock enregistré(s)`, req.user!.fullName);
  res.status(201).json(result);
}));

stockRouter.post('/import', requirePermission('stock:import'), asyncHandler((req, res) => {
  const body = z.object({
    entries: z.array(ledgerEntryInputSchema),
    productUpdates: z.array(z.object({ id: z.string(), minThreshold: z.number().optional(), targetStock: z.number().optional() })).optional(),
  }).parse(req.body);
  body.entries.forEach((e) => resolveEffectiveEmployeeName(req.user!, e.performedBy));

  const tx = db.transaction(() => {
    const result = body.entries.length > 0 ? postEntries(body.entries) : { products: getAllProducts(), lots: getAllLots(), ledger: [] };
    (body.productUpdates ?? []).forEach((u) => {
      if (u.minThreshold !== undefined) db.prepare('UPDATE stock_products SET min_threshold = ? WHERE id = ?').run(u.minThreshold, u.id);
      if (u.targetStock !== undefined) db.prepare('UPDATE stock_products SET target_stock = ? WHERE id = ?').run(u.targetStock, u.id);
    });
    return { products: getAllProducts(), lots: getAllLots(), ledger: result.ledger };
  });
  const result = tx();
  recordActivity('Stock', 'Import', `Import stock — ${body.entries.length} mouvement(s)`, req.user!.fullName);
  res.status(201).json(result);
}));

stockRouter.post('/ledger/:id/cancel', requirePermission('stock:manage'), asyncHandler((req, res) => {
  const body = z.object({ cancelledBy: z.string().min(1), cancelReason: z.string().optional() }).parse(req.body);
  resolveEffectiveEmployeeName(req.user!, body.cancelledBy);
  const row = db.prepare('SELECT * FROM stock_ledger WHERE id = ?').get(req.params.id) as LedgerRow | undefined;
  if (!row) throw notFound('Mouvement de stock');
  const entry = rowToLedger(row);
  const tx = db.transaction(() => cancelLedgerEntryById(req.params.id, body.cancelledBy, body.cancelReason));
  const updatedProduct = tx();
  recordActivity('Stock', 'Annulation', `Mouvement annulé — ${entry.reason} (${entry.productId})`, req.user!.fullName);
  res.json({ product: updatedProduct, ledgerId: entry.id });
}));
