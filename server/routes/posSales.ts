import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler, ApiError } from '../middleware/errors.js';
import { requireAnyPermission, requireAuth, requirePermission } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';
import { emitPosEvent } from '../lib/events.js';
import { runIdempotent } from '../lib/idempotency.js';
import { assertTableAccess, hasPermission } from '../lib/posAccess.js';
import {
  actorOf,
  activeLinesOfSale,
  createOrder,
  createSale,
  getSaleRow,
  priceCart,
  recomputeSale,
  recordPayment,
  saleDetail,
  storedLineToPriced,
  validateOrder,
  type SaleRow,
} from '../lib/posService.js';
import { getOpenSession } from './cashSessions.js';
import { assertManualDiscountAllowed, cartLineSchema, manualDiscountSchema } from './posCatalog.js';
import { formatDt } from '../../src/data/money.js';
import { PAYMENT_METHOD_LABELS } from '../../src/data/cashSession.js';
import { applyTicketDiscounts, tunisClock } from '../../src/data/pricing.js';
import { loadActiveDiscountRules } from '../lib/posCatalog.js';
import { queueDrawer, queueReceipt } from '../lib/printing.js';

// Ventes et encaissements (cahier des charges §2): counter sales, bills, payments, tickets.

export const posSalesRouter = Router();
posSalesRouter.use(requireAuth);

// A table bill can be read by whoever may act on that table; any other bill by the register.
const assertSaleReadable = (user: NonNullable<Express.Request['user']>, sale: SaleRow): void => {
  if (['pos:sell', 'pos:collect', 'pos:history'].some((k) => hasPermission(user, k))) return;
  if (sale.visit_id && hasPermission(user, 'orders:take')) {
    const visit = db.prepare('SELECT table_id FROM visits WHERE id = ?').get(sale.visit_id) as { table_id: string } | undefined;
    if (visit) {
      assertTableAccess(user, visit.table_id);
      return;
    }
  }
  throw new ApiError(403, "Vous n'avez pas la permission de consulter cette vente.");
};

const counterSaleSchema = z.object({
  sessionId: z.string().min(1),
  serviceType: z.enum(['dine_in', 'takeaway']),
  lines: z.array(cartLineSchema).min(1).max(100),
  customerId: z.string().nullable().optional(),
  manualDiscount: manualDiscountSchema.nullable().optional(),
});

// Vente au comptoir / à emporter: no table, validated at once (lines go to preparation and the
// stock is consumed), then collected with one or more payments.
posSalesRouter.post('/sales/counter', requirePermission('pos:sell'), (req, res) => {
  const body = counterSaleSchema.parse(req.body);
  const user = req.user!;
  const by = actorOf(user);
  let saleId = '';
  runIdempotent(req, res, `counter-sale:${user.id}`, () => {
    const session = getOpenSession(body.sessionId);
    const cart = priceCart(body.lines, { customerId: body.customerId });
    const sale = createSale({ serviceType: body.serviceType, visitId: null, customerId: body.customerId ?? null, by, sessionId: session.id });
    saleId = sale.id;
    const order = createOrder({ channel: 'counter', serviceType: body.serviceType, visitId: null, saleId: sale.id, status: 'pending_validation', customerId: body.customerId, cart, createdBy: by });
    validateOrder(order.id, by);
    if (body.manualDiscount) applyManualDiscount(sale.id, body.manualDiscount, user);
    recordActivity('Caisse', 'Vente comptoir', `Vente ${body.serviceType === 'takeaway' ? 'à emporter' : 'sur place'} — ${formatDt(getSaleRow(sale.id).total_mil)}`, user.fullName, {
      userId: user.id,
      entityType: 'pos_sale',
      entityId: sale.id,
    });
    return { status: 201, body: saleDetail(sale.id) };
  });
  if (saleId) {
    emitPosEvent({ type: 'prep.changed' });
    emitPosEvent({ type: 'orders.changed' });
  }
});

posSalesRouter.get('/sales/:id', asyncHandler((req, res) => {
  const sale = getSaleRow(req.params.id);
  assertSaleReadable(req.user!, sale);
  res.json(saleDetail(sale.id));
}));

const applyManualDiscount = (saleId: string, discount: z.infer<typeof manualDiscountSchema> | null, user: NonNullable<Express.Request['user']>): void => {
  const sale = getSaleRow(saleId);
  if (sale.status !== 'open') throw new ApiError(409, 'Cette vente est déjà réglée.');
  if (discount) {
    // Measures the discount on the bill as it stands, to check it against the ceiling.
    const lines = activeLinesOfSale(saleId).map(storedLineToPriced);
    const withoutManual = applyTicketDiscounts(lines, loadActiveDiscountRules(), { now: new Date(), customerId: sale.customer_id });
    const withManual = applyTicketDiscounts(lines, loadActiveDiscountRules(), { now: new Date(), customerId: sale.customer_id, manualDiscount: discount });
    assertManualDiscountAllowed(user, discount, withoutManual.totalMil, withoutManual.totalMil - withManual.totalMil);
    if (withManual.totalMil < sale.paid_mil) throw new ApiError(409, 'La remise rendrait le total inférieur à ce qui est déjà réglé.');
  }
  db.prepare('UPDATE pos_sales SET manual_discount_json = ? WHERE id = ?').run(discount ? JSON.stringify(discount) : null, saleId);
  const after = recomputeSale(saleId);
  recordActivity('Caisse', 'Remise manuelle', discount ? `Remise ${discount.kind === 'percent' ? `${discount.value / 100} %` : formatDt(discount.value)} — ${discount.reason}` : 'Remise retirée', user.fullName, {
    userId: user.id,
    entityType: 'pos_sale',
    entityId: saleId,
    before: sale.manual_discount_json ? JSON.parse(sale.manual_discount_json) : null,
    after: { discount, totalMil: after.total_mil },
  });
};

posSalesRouter.post('/sales/:id/manual-discount', requirePermission('pos:discount'), asyncHandler((req, res) => {
  const { discount } = z.object({ discount: manualDiscountSchema.nullable() }).parse(req.body);
  db.transaction(() => applyManualDiscount(req.params.id, discount, req.user!))();
  emitPosEvent({ type: 'orders.changed' });
  res.json(saleDetail(req.params.id));
}));

const paymentSchema = z.object({
  sessionId: z.string().min(1),
  method: z.enum(['cash', 'card', 'voucher']),
  amountMil: z.number().int().positive().max(100_000_000),
  note: z.string().trim().max(200).optional(),
});

posSalesRouter.post('/sales/:id/payments', requirePermission('pos:collect'), (req, res) => {
  const body = paymentSchema.parse(req.body);
  const user = req.user!;
  runIdempotent(req, res, `payment:${req.params.id}`, () => {
    // A split bill is settled part by part (amélioration 08).
    if (db.prepare('SELECT 1 FROM sale_splits WHERE sale_id = ? LIMIT 1').get(req.params.id)) throw new ApiError(409, 'Cette addition est partagée : encaissez part par part.');
    const session = getOpenSession(body.sessionId);
    const { sale, payment } = recordPayment(req.params.id, session.id, body, actorOf(user));
    // Cash: the drawer opens if one is connected to this register's printer (amélioration 04).
    if (body.method === 'cash') queueDrawer(session.register_id, payment.id, user.fullName);
    recordActivity(
      'Caisse',
      'Règlement',
      `${PAYMENT_METHOD_LABELS[body.method]} ${formatDt(payment.amount_mil)}${payment.change_mil ? ` (rendu ${formatDt(payment.change_mil)})` : ''}${sale.ticket_number ? ` — ticket ${sale.ticket_number}` : ''}`,
      user.fullName,
      { userId: user.id, entityType: 'pos_sale', entityId: sale.id, after: { method: body.method, amountMil: payment.amount_mil, changeMil: payment.change_mil } }
    );
    return { status: 201, body: { sale: saleDetail(sale.id), payment: { id: payment.id, amountMil: payment.amount_mil, changeMil: payment.change_mil } } };
  });
  emitPosEvent({ type: 'cash.changed' });
  emitPosEvent({ type: 'floor.changed' });
});

// Ticket search: by number, Tunis date, table, status.
posSalesRouter.get('/sales', requirePermission('pos:history'), asyncHandler((req, res) => {
  const q = z
    .object({
      number: z.string().trim().optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      table: z.string().trim().optional(),
      status: z.enum(['open', 'completed', 'cancelled']).optional(),
      sessionId: z.string().optional(),
    })
    .parse(req.query);
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.number) {
    where.push('ticket_number LIKE ?');
    params.push(`%${q.number}%`);
  }
  if (q.table) {
    where.push('table_name LIKE ?');
    params.push(`%${q.table}%`);
  }
  if (q.status) {
    where.push('status = ?');
    params.push(q.status);
  }
  if (q.sessionId) {
    where.push('session_id = ?');
    params.push(q.sessionId);
  }
  if (q.date) {
    // created_at is UTC; widen the window by a day on each side, then keep the Tunis date exactly.
    const d = new Date(`${q.date}T00:00:00Z`);
    where.push('created_at >= ? AND created_at < ?');
    params.push(new Date(d.getTime() - 86_400_000).toISOString(), new Date(d.getTime() + 2 * 86_400_000).toISOString());
  }
  const rows = db
    .prepare(`SELECT * FROM pos_sales ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT 300`)
    .all(...params) as SaleRow[];
  const filtered = q.date ? rows.filter((r) => tunisClock(new Date(r.completed_at ?? r.created_at)).date === q.date) : rows;
  res.json(
    filtered.map((s) => ({
      id: s.id,
      ticketNumber: s.ticket_number,
      status: s.status,
      serviceType: s.service_type,
      tableName: s.table_name,
      totalMil: s.total_mil,
      paidMil: s.paid_mil,
      createdAt: s.created_at,
      completedAt: s.completed_at,
      createdBy: s.created_by,
      reprintCount: s.reprint_count,
    }))
  );
}));

// Printing never creates a sale nor sends anything to preparation (§2.6). The first print is the
// original; every later one is a numbered duplicate and needs pos:reprint.
posSalesRouter.post('/sales/:id/print', requireAnyPermission('pos:sell', 'pos:collect', 'pos:reprint'), asyncHandler((req, res) => {
  const user = req.user!;
  const sale = getSaleRow(req.params.id);
  if (sale.status !== 'completed') throw new ApiError(409, "Le ticket n'est disponible qu'une fois la vente réglée.");
  const printed = (db.prepare('SELECT COUNT(*) AS n FROM pos_ticket_prints WHERE sale_id = ?').get(sale.id) as { n: number }).n;
  const duplicate = printed > 0;
  let queued = false;
  if (duplicate && !hasPermission(user, 'pos:reprint')) throw new ApiError(403, "Vous n'avez pas la permission de réimprimer un ticket.");
  db.transaction(() => {
    db.prepare('INSERT INTO pos_ticket_prints (id, sale_id, duplicate, printed_by, printed_at) VALUES (?, ?, ?, ?, ?)').run(
      randomUUID(),
      sale.id,
      duplicate ? 1 : 0,
      user.fullName,
      new Date().toISOString()
    );
    // On the register's printer when one is configured; otherwise the screen prints via the browser.
    queued = queueReceipt(sale.id, duplicate ? printed : 0, user.fullName);
    if (duplicate) {
      db.prepare('UPDATE pos_sales SET reprint_count = reprint_count + 1 WHERE id = ?').run(sale.id);
      recordActivity('Caisse', 'Réimpression', `Duplicata du ticket ${sale.ticket_number}`, user.fullName, { userId: user.id, entityType: 'pos_sale', entityId: sale.id });
    }
  })();
  res.json({ duplicate, duplicateNumber: duplicate ? printed : 0, queued, sale: saleDetail(sale.id) });
}));
