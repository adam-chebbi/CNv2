import { todayIso } from '../../src/data/dateUtils.js';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { fromJson, toJson } from '../db/json.js';
import { asyncHandler, ApiError, notFound } from '../middleware/errors.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';
import { getAllProducts, postEntries } from './stock.js';
import {
  generatePurchaseOrderNumber,
  applyReceptionToOrder,
  buildReceptionLedgerEntries,
  getAllowedManualTransitions,
  computeInvoiceStatus,
  type Supplier,
  type PurchaseOrder,
  type PurchaseOrderLine,
  type PurchaseReception,
  type PurchaseReceptionLine,
  type SupplierInvoice,
} from '../../src/data/purchasesModel.js';
import { normalizeKey } from '../../src/data/textUtils.js';
import type { ProductAlias } from '../../src/data/productAliases.js';
import { STOCK_ZONES, type StockZone } from '../../src/data/stockModel.js';
import { recordAutoExpense } from '../lib/expenses.js';
import { resolveEffectiveEmployeeName } from '../lib/employeeSelection.js';

const nowIso = () => new Date().toISOString();

// --- Row <-> entity mappers ---------------------------------------------------------------------

interface SupplierRow { id: string; name: string; tax_id: string | null; phone: string | null; whatsapp: string | null; email: string | null; address: string | null; main_contact: string | null; notes: string | null; created_at: string }
const rowToSupplier = (r: SupplierRow): Supplier => ({
  id: r.id, name: r.name, taxId: r.tax_id ?? undefined, phone: r.phone ?? undefined, whatsapp: r.whatsapp ?? undefined,
  email: r.email ?? undefined, address: r.address ?? undefined, mainContact: r.main_contact ?? undefined,
  notes: r.notes ?? undefined, createdAt: r.created_at,
});

interface OrderRow { id: string; order_number: string; supplier_id: string; order_date: string; expected_date: string | null; status: string; lines: string; notes: string | null; created_at: string; created_by: string }
const rowToOrder = (r: OrderRow): PurchaseOrder => ({
  id: r.id, orderNumber: r.order_number, supplierId: r.supplier_id, orderDate: r.order_date,
  expectedDate: r.expected_date ?? undefined, status: r.status as PurchaseOrder['status'],
  lines: fromJson<PurchaseOrderLine[]>(r.lines, []), notes: r.notes ?? undefined, createdAt: r.created_at, createdBy: r.created_by,
});

interface ReceptionRow { id: string; purchase_order_id: string; reception_date: string; zone: string; lines: string; performed_by: string; created_at: string }
const rowToReception = (r: ReceptionRow): PurchaseReception => ({
  id: r.id, purchaseOrderId: r.purchase_order_id, receptionDate: r.reception_date, zone: r.zone as PurchaseReception['zone'],
  lines: fromJson<PurchaseReceptionLine[]>(r.lines, []), performedBy: r.performed_by, createdAt: r.created_at,
});

interface InvoiceRow { id: string; invoice_number: string; supplier_id: string; purchase_order_id: string | null; invoice_date: string; due_date: string; amount_ht: number; vat_amount: number; amount_ttc: number; amount_paid: number; payment_method: string; created_at: string }
const rowToInvoice = (r: InvoiceRow): SupplierInvoice => ({
  id: r.id, invoiceNumber: r.invoice_number, supplierId: r.supplier_id, purchaseOrderId: r.purchase_order_id ?? undefined,
  invoiceDate: r.invoice_date, dueDate: r.due_date, amountHT: r.amount_ht, vatAmount: r.vat_amount, amountTTC: r.amount_ttc,
  amountPaid: r.amount_paid, paymentMethod: r.payment_method as SupplierInvoice['paymentMethod'], createdAt: r.created_at,
});

const getAllOrders = (): PurchaseOrder[] => (db.prepare('SELECT * FROM purchase_orders').all() as OrderRow[]).map(rowToOrder);

export const purchasesRouter = Router();
purchasesRouter.use(requireAuth);

// --- Suppliers ---------------------------------------------------------------------------------

const supplierSchema = z.object({
  name: z.string().trim().min(1),
  taxId: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  mainContact: z.string().optional(),
  notes: z.string().optional(),
});

purchasesRouter.get('/suppliers', requirePermission('purchases:view'), asyncHandler((_req, res) => {
  res.json((db.prepare('SELECT * FROM suppliers ORDER BY created_at ASC').all() as SupplierRow[]).map(rowToSupplier));
}));

purchasesRouter.post('/suppliers', requirePermission('purchases:suppliers'), asyncHandler((req, res) => {
  const body = supplierSchema.parse(req.body);
  const id = randomUUID();
  const createdAt = nowIso().slice(0, 10);
  db.prepare(
    `INSERT INTO suppliers (id, name, tax_id, phone, whatsapp, email, address, main_contact, notes, created_at)
     VALUES (@id, @name, @taxId, @phone, @whatsapp, @email, @address, @mainContact, @notes, @createdAt)`
  ).run({ id, createdAt, name: body.name, taxId: body.taxId || null, phone: body.phone || null, whatsapp: body.whatsapp || null,
    email: body.email || null, address: body.address || null, mainContact: body.mainContact || null, notes: body.notes || null });
  recordActivity('Achats', 'Création', `Fournisseur créé — ${body.name}`, req.user!.fullName);
  res.status(201).json({ id, createdAt, ...body });
}));

purchasesRouter.put('/suppliers/:id', requirePermission('purchases:suppliers'), asyncHandler((req, res) => {
  const body = supplierSchema.parse(req.body);
  const existing = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id) as SupplierRow | undefined;
  if (!existing) throw notFound('Fournisseur');
  db.prepare(
    `UPDATE suppliers SET name=@name, tax_id=@taxId, phone=@phone, whatsapp=@whatsapp, email=@email, address=@address,
     main_contact=@mainContact, notes=@notes WHERE id=@id`
  ).run({ id: req.params.id, name: body.name, taxId: body.taxId || null, phone: body.phone || null, whatsapp: body.whatsapp || null,
    email: body.email || null, address: body.address || null, mainContact: body.mainContact || null, notes: body.notes || null });
  recordActivity('Achats', 'Modification', `Fournisseur modifié — ${body.name}`, req.user!.fullName);
  res.json(rowToSupplier({ ...existing, name: body.name }));
}));

purchasesRouter.delete('/suppliers/:id', requirePermission('purchases:delete'), asyncHandler((req, res) => {
  const existing = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id) as SupplierRow | undefined;
  if (!existing) throw notFound('Fournisseur');
  // Checks both commandes AND factures — a supplier referenced only by a manually-entered invoice
  // (no linked order) used to be deletable, silently orphaning that invoice's supplier_id.
  const orderUsage = db.prepare('SELECT COUNT(*) as c FROM purchase_orders WHERE supplier_id = ?').get(req.params.id) as { c: number };
  const invoiceUsage = db.prepare('SELECT COUNT(*) as c FROM supplier_invoices WHERE supplier_id = ?').get(req.params.id) as { c: number };
  if (orderUsage.c > 0 || invoiceUsage.c > 0) {
    throw new ApiError(409, 'Ce fournisseur a des commandes ou des factures et ne peut pas être supprimé.');
  }
  db.prepare('DELETE FROM suppliers WHERE id = ?').run(req.params.id);
  recordActivity('Achats', 'Suppression', `Fournisseur supprimé — ${existing.name}`, req.user!.fullName);
  res.status(204).end();
}));

// --- Purchase orders -----------------------------------------------------------------------------

const orderLineSchema = z.object({ id: z.string(), productId: z.string().min(1), quantity: z.number().gt(0), unit: z.string(), unitPrice: z.number().min(0) });

const orderSchema = z.object({
  supplierId: z.string().min(1),
  orderDate: z.string().min(1),
  expectedDate: z.string().optional(),
  notes: z.string().optional(),
  createdBy: z.string().min(1),
  lines: z.array(orderLineSchema).min(1),
});

purchasesRouter.get('/orders', requirePermission('purchases:view'), asyncHandler((_req, res) => {
  res.json(getAllOrders());
}));

purchasesRouter.post('/orders', requirePermission('purchases:create'), asyncHandler((req, res) => {
  const body = orderSchema.parse(req.body);
  resolveEffectiveEmployeeName(req.user!, body.createdBy);
  const supplier = db.prepare('SELECT id FROM suppliers WHERE id = ?').get(body.supplierId);
  if (!supplier) throw new ApiError(400, 'Fournisseur invalide.');
  const id = randomUUID();
  const createdAt = nowIso();
  const orderNumber = generatePurchaseOrderNumber(getAllOrders());
  const lines: PurchaseOrderLine[] = body.lines.map((l) => ({ ...l, receivedQuantity: 0 }));
  db.prepare(
    `INSERT INTO purchase_orders (id, order_number, supplier_id, order_date, expected_date, status, lines, notes, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, 'Brouillon', ?, ?, ?, ?)`
  ).run(id, orderNumber, body.supplierId, body.orderDate, body.expectedDate ?? null, toJson(lines), body.notes ?? null, createdAt, body.createdBy);
  recordActivity('Achats', 'Création', `Commande créée — ${orderNumber}`, req.user!.fullName);
  res.status(201).json(rowToOrder({ id, order_number: orderNumber, supplier_id: body.supplierId, order_date: body.orderDate,
    expected_date: body.expectedDate ?? null, status: 'Brouillon', lines: toJson(lines)!, notes: body.notes ?? null, created_at: createdAt, created_by: body.createdBy }));
}));

purchasesRouter.put('/orders/:id', requirePermission('purchases:edit'), asyncHandler((req, res) => {
  const body = orderSchema.parse(req.body);
  resolveEffectiveEmployeeName(req.user!, body.createdBy);
  const existing = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id) as OrderRow | undefined;
  if (!existing) throw notFound('Commande');
  const priorLines = fromJson<PurchaseOrderLine[]>(existing.lines, []);
  const lines: PurchaseOrderLine[] = body.lines.map((l) => ({ ...l, receivedQuantity: priorLines.find((pl) => pl.id === l.id)?.receivedQuantity ?? 0 }));
  db.prepare('UPDATE purchase_orders SET supplier_id=?, order_date=?, expected_date=?, lines=?, notes=? WHERE id=?').run(
    body.supplierId, body.orderDate, body.expectedDate ?? null, toJson(lines), body.notes ?? null, req.params.id
  );
  recordActivity('Achats', 'Modification', `Commande modifiée — ${existing.order_number}`, req.user!.fullName);
  res.json(rowToOrder({ ...existing, supplier_id: body.supplierId, order_date: body.orderDate, expected_date: body.expectedDate ?? null, lines: toJson(lines)!, notes: body.notes ?? null }));
}));

purchasesRouter.patch('/orders/:id/status', requirePermission('purchases:cancel'), asyncHandler((req, res) => {
  const body = z.object({ status: z.enum(['Brouillon', 'Commandée', 'Partiellement reçue', 'Reçue', 'Annulée']) }).parse(req.body);
  const existing = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id) as OrderRow | undefined;
  if (!existing) throw notFound('Commande');
  const allowed = getAllowedManualTransitions(existing.status as PurchaseOrder['status']);
  if (!allowed.includes(body.status)) throw new ApiError(409, `Transition de statut non autorisée : ${existing.status} → ${body.status}.`);
  db.prepare('UPDATE purchase_orders SET status = ? WHERE id = ?').run(body.status, req.params.id);
  recordActivity('Achats', 'Modification', `Statut de commande modifié — ${existing.order_number} (${body.status})`, req.user!.fullName);
  res.json(rowToOrder({ ...existing, status: body.status }));
}));

purchasesRouter.delete('/orders/:id', requirePermission('purchases:delete'), asyncHandler((req, res) => {
  const existing = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id) as OrderRow | undefined;
  if (!existing) throw notFound('Commande');
  // The UI only ever offers this action on a Brouillon order — enforce the same rule here, so a
  // direct API call can't delete a sent/received order (which would also silently orphan any
  // supplier invoice already linked to it, since supplier_invoices.purchase_order_id has no
  // ON DELETE CASCADE/SET NULL and foreign_keys=ON would otherwise surface a raw SQLite error).
  if (existing.status !== 'Brouillon') {
    throw new ApiError(409, 'Seule une commande au statut Brouillon peut être supprimée.');
  }
  db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(req.params.id);
  recordActivity('Achats', 'Suppression', `Commande supprimée — ${existing.order_number}`, req.user!.fullName);
  res.status(204).end();
}));

// --- Receptions (transactional: reception + stock ledger + order status, all-or-nothing) --------

const receptionLineSchema = z.object({ lineId: z.string(), quantityReceived: z.number().min(0) });
const receptionSchema = z.object({
  receptionDate: z.string().min(1),
  // Reuses the app's single list of stock zones (src/data/stockModel.ts) rather than a separately
  // hardcoded enum, so a zone added/renamed there never silently falls out of sync here.
  zone: z.enum(STOCK_ZONES as [StockZone, ...StockZone[]]),
  lines: z.array(receptionLineSchema).min(1),
  performedBy: z.string().min(1),
});

purchasesRouter.post('/orders/:id/receive', requirePermission('purchases:receive'), asyncHandler((req, res) => {
  const body = receptionSchema.parse(req.body);
  resolveEffectiveEmployeeName(req.user!, body.performedBy);
  const orderRow = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id) as OrderRow | undefined;
  if (!orderRow) throw notFound('Commande');
  const order = rowToOrder(orderRow);
  if (order.status === 'Annulée') throw new ApiError(409, 'Une commande annulée ne peut pas être réceptionnée.');

  // Previously only the UI capped a reception at the remaining ordered quantity — a direct API call
  // could push receivedQuantity past quantity with nothing to stop it. Enforce the same ceiling here.
  for (const rl of body.lines) {
    const orderLine = order.lines.find((l) => l.id === rl.lineId);
    if (!orderLine) continue;
    const remaining = orderLine.quantity - orderLine.receivedQuantity;
    if (rl.quantityReceived > remaining + 1e-9) {
      throw new ApiError(400, `Quantité reçue (${rl.quantityReceived}) supérieure à la quantité restante à recevoir (${remaining}) pour cette ligne.`);
    }
  }

  const tx = db.transaction(() => {
    // Recompute each received product's coût moyen pondéré (weighted-average cost) BEFORE building
    // the ledger entries below, so this reception's own valueImpact already reflects the freshly
    // recalculated cost. Weighted by total stock (both zones combined) against the order line's
    // actual unit price — what was really paid — never against the product's own stale average.
    // Previously `average_cost` was only ever set once, manually, at product creation; every
    // reception since then silently left it stale.
    const productMap = new Map(getAllProducts().map((p) => [p.id, { ...p }]));
    const updateCost = db.prepare('UPDATE stock_products SET average_cost = ? WHERE id = ?');
    body.lines.forEach((rl) => {
      if (rl.quantityReceived <= 0) return;
      const orderLine = order.lines.find((l) => l.id === rl.lineId);
      const product = orderLine ? productMap.get(orderLine.productId) : undefined;
      if (!orderLine || !product) return;
      const oldTotalQty = product.reserveQty + product.depotQty;
      const newTotalQty = oldTotalQty + rl.quantityReceived;
      const newCmp = newTotalQty > 0
        ? (oldTotalQty * product.averageCost + rl.quantityReceived * orderLine.unitPrice) / newTotalQty
        : orderLine.unitPrice;
      const rounded = Math.round(newCmp * 1000) / 1000;
      updateCost.run(rounded, product.id);
      product.averageCost = rounded; // keep the local map in sync in case the same product appears twice in this reception
    });

    const products = getAllProducts(); // re-fetch so downstream ledger entries see the recalculated costs
    const receptionId = randomUUID();
    const createdAt = nowIso();
    const reception: PurchaseReception = { id: receptionId, purchaseOrderId: order.id, receptionDate: body.receptionDate, zone: body.zone, lines: body.lines, performedBy: body.performedBy, createdAt };

    const ledgerEntries = buildReceptionLedgerEntries(order, reception, products);
    if (ledgerEntries.length > 0) {
      postEntries(ledgerEntries.map((e) => ({
        type: e.type, productId: e.productId, zone: e.zone, quantityDelta: e.quantityDelta, reason: e.reason,
        performedBy: e.performedBy,
      })));
    }

    db.prepare('INSERT INTO purchase_receptions (id, purchase_order_id, reception_date, zone, lines, performed_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      receptionId, order.id, body.receptionDate, body.zone, toJson(body.lines), body.performedBy, createdAt
    );

    const updatedOrder = applyReceptionToOrder(order, reception);
    db.prepare('UPDATE purchase_orders SET lines = ?, status = ? WHERE id = ?').run(toJson(updatedOrder.lines), updatedOrder.status, order.id);

    return { reception, order: updatedOrder, products: getAllProducts() };
  });

  const result = tx();
  recordActivity('Achats', 'Réception', `Réception enregistrée — ${order.orderNumber}`, req.user!.fullName);
  res.status(201).json(result);
}));

purchasesRouter.get('/receptions', requirePermission('purchases:view'), asyncHandler((_req, res) => {
  res.json((db.prepare('SELECT * FROM purchase_receptions ORDER BY created_at DESC').all() as ReceptionRow[]).map(rowToReception));
}));

// --- Supplier invoices ---------------------------------------------------------------------------

const invoiceSchema = z.object({
  supplierId: z.string().min(1),
  purchaseOrderId: z.string().optional(),
  invoiceNumber: z.string().trim().min(1),
  invoiceDate: z.string().min(1),
  dueDate: z.string().min(1),
  amountHT: z.number().min(0),
  vatAmount: z.number().min(0),
  amountTTC: z.number().gt(0),
  amountPaid: z.number().min(0).default(0),
  paymentMethod: z.enum(['Espèces', 'Carte bancaire', 'Chèque', 'Virement bancaire']),
});

purchasesRouter.get('/invoices', requirePermission('purchases:view'), asyncHandler((_req, res) => {
  res.json((db.prepare('SELECT * FROM supplier_invoices ORDER BY created_at DESC').all() as InvoiceRow[]).map(rowToInvoice));
}));

purchasesRouter.post('/invoices', requirePermission('purchases:invoices'), asyncHandler((req, res) => {
  const body = invoiceSchema.parse(req.body);
  if (body.amountPaid > body.amountTTC) throw new ApiError(400, 'Le montant payé ne peut pas dépasser le montant TTC.');
  const id = randomUUID();
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO supplier_invoices (id, invoice_number, supplier_id, purchase_order_id, invoice_date, due_date, amount_ht, vat_amount, amount_ttc, amount_paid, payment_method, created_at)
     VALUES (@id, @invoiceNumber, @supplierId, @purchaseOrderId, @invoiceDate, @dueDate, @amountHT, @vatAmount, @amountTTC, @amountPaid, @paymentMethod, @createdAt)`
  ).run({ id, createdAt, ...body, purchaseOrderId: body.purchaseOrderId ?? null });
  recordActivity('Achats', 'Création', `Facture fournisseur créée — ${body.invoiceNumber}`, req.user!.fullName);
  res.status(201).json(rowToInvoice({ id, invoice_number: body.invoiceNumber, supplier_id: body.supplierId, purchase_order_id: body.purchaseOrderId ?? null,
    invoice_date: body.invoiceDate, due_date: body.dueDate, amount_ht: body.amountHT, vat_amount: body.vatAmount, amount_ttc: body.amountTTC,
    amount_paid: body.amountPaid, payment_method: body.paymentMethod, created_at: createdAt }));
}));

purchasesRouter.put('/invoices/:id', requirePermission('purchases:invoices'), asyncHandler((req, res) => {
  const body = invoiceSchema.parse(req.body);
  const existing = db.prepare('SELECT * FROM supplier_invoices WHERE id = ?').get(req.params.id) as InvoiceRow | undefined;
  if (!existing) throw notFound('Facture');
  db.prepare(
    `UPDATE supplier_invoices SET invoice_number=@invoiceNumber, supplier_id=@supplierId, purchase_order_id=@purchaseOrderId,
     invoice_date=@invoiceDate, due_date=@dueDate, amount_ht=@amountHT, vat_amount=@vatAmount, amount_ttc=@amountTTC,
     amount_paid=@amountPaid, payment_method=@paymentMethod WHERE id=@id`
  ).run({ id: req.params.id, ...body, purchaseOrderId: body.purchaseOrderId ?? null });
  recordActivity('Achats', 'Modification', `Facture fournisseur modifiée — ${body.invoiceNumber}`, req.user!.fullName);
  res.json(rowToInvoice({ ...existing, invoice_number: body.invoiceNumber, amount_paid: body.amountPaid }));
}));

purchasesRouter.post('/invoices/:id/payment', requirePermission('purchases:pay'), asyncHandler((req, res) => {
  const body = z.object({ amount: z.number().gt(0) }).parse(req.body);
  const existing = db.prepare('SELECT * FROM supplier_invoices WHERE id = ?').get(req.params.id) as InvoiceRow | undefined;
  if (!existing) throw notFound('Facture');
  const newPaid = existing.amount_paid + body.amount;
  if (newPaid > existing.amount_ttc) throw new ApiError(400, 'Le paiement dépasserait le montant TTC de la facture.');
  db.prepare('UPDATE supplier_invoices SET amount_paid = ? WHERE id = ?').run(newPaid, req.params.id);
  const updated = rowToInvoice({ ...existing, amount_paid: newPaid });
  const supplier = db.prepare('SELECT name FROM suppliers WHERE id = ?').get(existing.supplier_id) as { name: string } | undefined;
  // Same auto-expense mechanism as a sale's VAT — every real payment out the door ends up in
  // Gestion des dépenses, whether or not it was also entered manually there before. One expense
  // row per payment (a partial payment made in two calls creates two rows), tagged so it's
  // traceable back to this exact payment via source_id = invoice id + a running total wouldn't be
  // representable in a single tag — the amount itself is the payment increment, not the balance.
  recordAutoExpense({
    title: `Facture fournisseur ${existing.invoice_number}${supplier ? ` — ${supplier.name}` : ''}`,
    amount: body.amount,
    date: todayIso(),
    categoryName: 'Fournitures',
    paymentMethod: existing.payment_method as 'Espèces' | 'Carte bancaire' | 'Chèque' | 'Virement bancaire',
    comment: `Paiement de la facture ${existing.invoice_number} — généré automatiquement.`,
    sourceType: 'invoice_payment',
    sourceId: existing.id,
    performedBy: req.user!.fullName,
  });
  recordActivity('Achats', 'Paiement', `Paiement enregistré — ${existing.invoice_number} (+${body.amount} DT, statut: ${computeInvoiceStatus(updated)})`, req.user!.fullName);
  res.json(updated);
}));

purchasesRouter.delete('/invoices/:id', requirePermission('purchases:delete'), asyncHandler((req, res) => {
  const existing = db.prepare('SELECT * FROM supplier_invoices WHERE id = ?').get(req.params.id) as InvoiceRow | undefined;
  if (!existing) throw notFound('Facture');
  db.prepare('DELETE FROM supplier_invoices WHERE id = ?').run(req.params.id);
  recordActivity('Achats', 'Suppression', `Facture fournisseur supprimée — ${existing.invoice_number}`, req.user!.fullName);
  res.status(204).end();
}));

// --- OCR invoice-line -> product aliases (reusable across future imports) ------------------------

interface AliasRow { id: string; normalized_label: string; raw_label: string; product_id: string; created_at: string }
const rowToAlias = (r: AliasRow): ProductAlias => ({
  id: r.id, rawLabel: r.raw_label, normalizedLabel: r.normalized_label, productId: r.product_id, createdAt: r.created_at,
});

purchasesRouter.get('/product-aliases', requirePermission('purchases:view'), asyncHandler((_req, res) => {
  res.json((db.prepare('SELECT * FROM invoice_product_aliases ORDER BY created_at ASC').all() as AliasRow[]).map(rowToAlias));
}));

const aliasSchema = z.object({ rawLabel: z.string().trim().min(1), productId: z.string().min(1) });

purchasesRouter.post('/product-aliases', requirePermission('purchases:ocr'), asyncHandler((req, res) => {
  const body = aliasSchema.parse(req.body);
  const product = db.prepare('SELECT id FROM stock_products WHERE id = ?').get(body.productId);
  if (!product) throw new ApiError(400, 'Produit invalide.');
  const normalizedLabel = normalizeKey(body.rawLabel);
  const createdAt = nowIso();
  const existing = db.prepare('SELECT id FROM invoice_product_aliases WHERE normalized_label = ?').get(normalizedLabel) as { id: string } | undefined;
  const id = existing?.id ?? randomUUID();
  db.prepare(
    `INSERT INTO invoice_product_aliases (id, normalized_label, raw_label, product_id, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(normalized_label) DO UPDATE SET raw_label = excluded.raw_label, product_id = excluded.product_id`
  ).run(id, normalizedLabel, body.rawLabel, body.productId, createdAt);
  recordActivity('Achats', 'Création', `Correspondance OCR enregistrée — « ${body.rawLabel} »`, req.user!.fullName);
  res.status(201).json(rowToAlias({ id, normalized_label: normalizedLabel, raw_label: body.rawLabel, product_id: body.productId, created_at: createdAt }));
}));
