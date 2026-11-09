import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler, ApiError, notFound } from '../middleware/errors.js';
import { requireAnyPermission, requireAuth, requirePermission } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';
import { emitPosEvent } from '../lib/events.js';
import { runIdempotent } from '../lib/idempotency.js';
import { getOpenSession } from './cashSessions.js';
import { creditEarn, eligibleOfSale, readLoyaltySettings } from '../lib/loyalty.js';
import { queueDrawer } from '../lib/printing.js';
import { activeLinesOfSale, actorOf, getSaleRow, recomputeSale, recordPayment, saleDetail } from '../lib/posService.js';
import { allocateProportionally } from '../../src/data/pricing.js';
import { pointsFor } from '../../src/data/loyalty.js';
import { formatDt } from '../../src/data/money.js';
import { splitReceiptDocument } from '../../src/data/receipts.js';
import { equalShares } from '../../src/data/splitBill.js';

// Addition partagée (amélioration 08): one bill, several payers. The bill stays one sale with one
// ticket number; each part is settled on its own (its own payments, its own receipt) and a payer
// identified on a part earns loyalty points on that part only. Parts by item, equal or free amount.

export const splitsRouter = Router();
splitsRouter.use(requireAuth);

interface SplitRow {
  id: string;
  sale_id: string;
  part: number;
  parts: number;
  mode: 'items' | 'equal' | 'amount';
  label: string | null;
  amount_mil: number;
  paid_mil: number;
  line_ids: string;
  customer_id: string | null;
}

const splitsOf = (saleId: string) => db.prepare('SELECT * FROM sale_splits WHERE sale_id = ? ORDER BY part').all(saleId) as SplitRow[];

const serialize = (saleId: string) =>
  splitsOf(saleId).map((s) => ({
    id: s.id,
    part: s.part,
    parts: s.parts,
    mode: s.mode,
    label: s.label,
    amountMil: s.amount_mil,
    paidMil: s.paid_mil,
    dueMil: Math.max(0, s.amount_mil - s.paid_mil),
    lineIds: JSON.parse(s.line_ids) as string[],
    customerId: s.customer_id,
    customerName: s.customer_id ? ((db.prepare("SELECT first_name || ' ' || last_name AS name FROM customers WHERE id = ?").get(s.customer_id) as { name: string } | undefined)?.name ?? null) : null,
  }));

const partInput = z.object({ label: z.string().trim().max(40).optional(), customerId: z.string().nullable().optional() });
const splitSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('items'), parts: z.array(partInput.extend({ lineIds: z.array(z.string()).min(1) })).min(1).max(20) }),
  z.object({ mode: z.literal('equal'), count: z.number().int().min(2).max(20) }),
  z.object({ mode: z.literal('amount'), parts: z.array(partInput.extend({ amountMil: z.number().int().positive() })).min(2).max(20) }),
]);

const assertCustomer = (id: string | null | undefined): void => {
  if (id && !db.prepare('SELECT 1 FROM customers WHERE id = ?').get(id)) throw notFound('Client');
};

const openSale = (id: string) => {
  const sale = recomputeSale(id);
  if (sale.status !== 'open') throw new ApiError(409, 'Cette addition est déjà réglée ou annulée.');
  return sale;
};

splitsRouter.get('/sales/:id/splits', requireAnyPermission('pos:collect', 'pos:sell', 'pos:history'), asyncHandler((req, res) => {
  getSaleRow(req.params.id);
  res.json(serialize(req.params.id));
}));

// Creates (or replaces, while nothing has been paid) the split of an open bill.
splitsRouter.post('/sales/:id/split', requirePermission('pos:collect'), asyncHandler((req, res) => {
  const body = splitSchema.parse(req.body);
  const user = req.user!;
  const sale = openSale(req.params.id);
  if (sale.paid_mil > 0) throw new ApiError(409, 'Un règlement a déjà été enregistré : le partage n’est plus possible.');
  if (sale.total_mil <= 0) throw new ApiError(409, 'L’addition est vide.');

  let parts: { label: string | null; amountMil: number; lineIds: string[]; customerId: string | null }[];
  if (body.mode === 'equal') {
    parts = equalShares(sale.total_mil, body.count).map((amountMil) => ({ label: null, amountMil, lineIds: [], customerId: null }));
  } else if (body.mode === 'amount') {
    const sum = body.parts.reduce((s, p) => s + p.amountMil, 0);
    if (sum !== sale.total_mil) throw new ApiError(400, `La somme des parts (${formatDt(sum)}) doit égaler l’addition (${formatDt(sale.total_mil)}).`);
    parts = body.parts.map((p) => ({ label: p.label ?? null, amountMil: p.amountMil, lineIds: [], customerId: p.customerId ?? null }));
  } else {
    const lines = activeLinesOfSale(sale.id);
    const byId = new Map(lines.map((l) => [l.id, l]));
    const seen = new Set<string>();
    for (const p of body.parts) {
      for (const id of p.lineIds) {
        if (!byId.has(id)) throw new ApiError(400, 'Un article ne fait pas partie de cette addition.');
        if (seen.has(id)) throw new ApiError(400, 'Un article ne peut appartenir qu’à une seule part.');
        seen.add(id);
      }
    }
    const groups = body.parts.map((p) => ({ label: p.label ?? null, customerId: p.customerId ?? null, lineIds: p.lineIds }));
    const rest = lines.filter((l) => !seen.has(l.id)).map((l) => l.id);
    if (rest.length) groups.push({ label: 'Reste', customerId: null, lineIds: rest });
    if (groups.length < 2) throw new ApiError(400, 'Répartissez les articles sur au moins deux parts.');
    // Ticket discounts are shared in proportion to each part's items (same engine as everywhere).
    const amounts = allocateProportionally(sale.total_mil, groups.map((g) => g.lineIds.reduce((s, id) => s + byId.get(id)!.gross_mil - byId.get(id)!.item_discount_mil, 0)));
    parts = groups.map((g, i) => ({ ...g, amountMil: amounts[i] }));
  }
  parts.forEach((p) => assertCustomer(p.customerId));

  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare('DELETE FROM sale_splits WHERE sale_id = ?').run(sale.id);
    const insert = db.prepare('INSERT INTO sale_splits (id, sale_id, part, parts, mode, label, amount_mil, line_ids, customer_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    parts.forEach((p, i) => insert.run(randomUUID(), sale.id, i + 1, parts.length, body.mode, p.label, p.amountMil, JSON.stringify(p.lineIds), p.customerId, user.fullName, now));
    recordActivity('Caisse', 'Addition partagée', `${sale.table_name ? `Table ${sale.table_name} — ` : ''}${parts.length} parts (${{ items: 'par article', equal: 'parts égales', amount: 'montants libres' }[body.mode]})`, user.fullName, {
      userId: user.id,
      entityType: 'pos_sale',
      entityId: sale.id,
      after: parts.map((p) => p.amountMil),
    });
  })();
  emitPosEvent({ type: 'floor.changed' });
  res.status(201).json(serialize(sale.id));
}));

splitsRouter.delete('/sales/:id/split', requirePermission('pos:collect'), asyncHandler((req, res) => {
  const sale = openSale(req.params.id);
  if (splitsOf(sale.id).some((s) => s.paid_mil > 0)) throw new ApiError(409, 'Une part est déjà réglée : le partage ne peut plus être annulé.');
  db.prepare('DELETE FROM sale_splits WHERE sale_id = ?').run(sale.id);
  recordActivity('Caisse', 'Partage annulé', sale.table_name ? `Table ${sale.table_name}` : sale.id, req.user!.fullName, { userId: req.user!.id, entityType: 'pos_sale', entityId: sale.id });
  res.json([]);
}));

// Identify the payer of a part (their points are earned on this part only).
splitsRouter.patch('/sales/:id/splits/:splitId', requirePermission('pos:collect'), asyncHandler((req, res) => {
  const body = z.object({ customerId: z.string().nullable().optional(), label: z.string().trim().max(40).nullable().optional() }).parse(req.body);
  const split = getSplit(req.params.id, req.params.splitId);
  if (split.paid_mil >= split.amount_mil) throw new ApiError(409, 'Cette part est déjà réglée.');
  assertCustomer(body.customerId);
  db.prepare('UPDATE sale_splits SET customer_id = ?, label = ? WHERE id = ?').run(body.customerId === undefined ? split.customer_id : body.customerId, body.label === undefined ? split.label : body.label, split.id);
  res.json(serialize(split.sale_id));
}));

const getSplit = (saleId: string, splitId: string): SplitRow => {
  const s = db.prepare('SELECT * FROM sale_splits WHERE id = ? AND sale_id = ?').get(splitId, saleId) as SplitRow | undefined;
  if (!s) throw notFound('Part');
  return s;
};

const paymentSchema = z.object({
  sessionId: z.string().min(1),
  method: z.enum(['cash', 'card', 'voucher']),
  amountMil: z.number().int().positive().max(100_000_000),
  note: z.string().trim().max(200).optional(),
});

splitsRouter.post('/sales/:id/splits/:splitId/payments', requirePermission('pos:collect'), (req, res) => {
  const body = paymentSchema.parse(req.body);
  const user = req.user!;
  runIdempotent(req, res, `split-payment:${req.params.splitId}`, () =>
    db.transaction(() => {
      const session = getOpenSession(body.sessionId);
      const sale = openSale(req.params.id);
      const split = getSplit(sale.id, req.params.splitId);
      const all = splitsOf(sale.id);
      if (all.reduce((s, p) => s + p.amount_mil, 0) !== sale.total_mil) throw new ApiError(409, 'L’addition a changé depuis le partage : refaites le partage.');
      const due = split.amount_mil - split.paid_mil;
      if (due <= 0) throw new ApiError(409, 'Cette part est déjà réglée.');
      let applied = body.amountMil;
      let change = 0;
      if (body.method === 'cash') {
        applied = Math.min(body.amountMil, due);
        change = body.amountMil - applied;
      } else if (body.amountMil > due) throw new ApiError(400, 'Le montant dépasse le reste de cette part.');

      const by = actorOf(user);
      const { payment } = recordPayment(sale.id, session.id, { method: body.method, amountMil: applied, note: body.note ?? `Part ${split.part}/${split.parts}` }, by);
      db.prepare('UPDATE pos_payments SET split_id = ?, tendered_mil = ?, change_mil = ? WHERE id = ?').run(split.id, body.method === 'cash' ? body.amountMil : null, change, payment.id);
      db.prepare('UPDATE sale_splits SET paid_mil = paid_mil + ? WHERE id = ?').run(applied, split.id);

      // The payer of this part earns points on it, once the part is fully paid (§12.2).
      const settings = readLoyaltySettings();
      if (split.customer_id && settings.enabled && applied === due) {
        const row = getSaleRow(sale.id);
        const share = Math.round((Math.min(eligibleOfSale(row), row.total_mil) * split.amount_mil) / Math.max(row.total_mil, 1));
        const points = pointsFor(share, settings);
        if (points > 0) creditEarn(split.customer_id, points, sale.id, split.id, `Ticket ${row.ticket_number ?? ''} — part ${split.part}/${split.parts}`.trim(), user.fullName);
      }
      if (body.method === 'cash') queueDrawer(session.register_id, payment.id, user.fullName);
      recordActivity('Caisse', 'Règlement d’une part', `Part ${split.part}/${split.parts} : ${formatDt(applied)}${change ? ` (rendu ${formatDt(change)})` : ''}`, user.fullName, {
        userId: user.id,
        entityType: 'pos_sale',
        entityId: sale.id,
        after: { splitId: split.id, method: body.method, amountMil: applied, changeMil: change },
      });
      return { status: 201, body: { sale: saleDetail(sale.id), splits: serialize(sale.id), payment: { id: payment.id, amountMil: applied, changeMil: change } } };
    })()
  );
  emitPosEvent({ type: 'cash.changed' });
  emitPosEvent({ type: 'floor.changed' });
});

// The payer's own receipt: their items (or their share) and their payments.
splitsRouter.get('/sales/:id/splits/:splitId/receipt-document', requireAnyPermission('pos:sell', 'pos:collect', 'pos:history'), asyncHandler((req, res) => {
  const split = getSplit(req.params.id, req.params.splitId);
  const sale = saleDetail(split.sale_id);
  const payments = db.prepare('SELECT id FROM pos_payments WHERE split_id = ?').all(split.id) as { id: string }[];
  const ids = new Set(payments.map((p) => p.id));
  res.json(
    splitReceiptDocument(sale, {
      part: split.part,
      parts: split.parts,
      label: split.label,
      amountMil: split.amount_mil,
      paidMil: split.paid_mil,
      lineIds: split.mode === 'items' ? (JSON.parse(split.line_ids) as string[]) : null,
      payments: sale.payments.filter((p: { id: string }) => ids.has(p.id)),
    })
  );
}));
