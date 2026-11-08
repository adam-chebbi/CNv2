import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { ApiError } from '../middleware/errors.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';
import { emitPosEvent } from '../lib/events.js';
import { runIdempotent } from '../lib/idempotency.js';
import { loadActiveDiscountRules, loadPricingCatalog } from '../lib/posCatalog.js';
import { actorOf, createOrder, createSale, getSaleRow, recordPayment, saleDetail, validateOrder } from '../lib/posService.js';
import { registerActionProvider } from './serviceDesk.js';
import { cartLineSchema } from './posCatalog.js';
import { computeCart, PricingError } from '../../src/data/pricing.js';
import { formatDt } from '../../src/data/money.js';
import { hasPermission } from '../lib/posAccess.js';

// Ventes enregistrées pendant une coupure d'Internet (amélioration 05).
//
// The register keeps the sale on the device (with its own Idempotency-Key) and sends it when the
// connection returns: applied exactly once, stock and loyalty computed once at that moment. The
// sale is priced at today's catalogue; a difference with what the device computed, or a balance
// left unpaid, is never corrected silently — it goes to "Actions à traiter".

export const offlineRouter = Router();
offlineRouter.use(requireAuth);

const schema = z.object({
  sessionId: z.string().min(1),
  offlineRef: z.string().regex(/^HL-[A-Za-z0-9-]{3,40}$/),
  occurredAt: z.string().datetime({ offset: true }),
  serviceType: z.enum(['dine_in', 'takeaway']),
  lines: z.array(cartLineSchema).min(1).max(100),
  payments: z.array(z.object({ method: z.enum(['cash', 'card', 'voucher']), amountMil: z.number().int().positive() })).max(10),
  clientTotalMil: z.number().int().min(0),
});

offlineRouter.post('/offline-sales', requirePermission('pos:sell'), (req, res) => {
  const body = schema.parse(req.body);
  const user = req.user!;
  if (body.payments.length > 0 && !hasPermission(user, 'pos:collect')) throw new ApiError(403, "Vous n'avez pas la permission d'encaisser.");
  runIdempotent(req, res, `offline-sale:${user.id}`, () => {
    const session = db.prepare('SELECT id, status FROM cash_sessions WHERE id = ?').get(body.sessionId) as { id: string; status: string } | undefined;
    if (!session) throw new ApiError(404, 'Session de caisse introuvable.');
    // Closing is blocked on the device while sales wait; a session closed elsewhere meanwhile is a conflict.
    if (session.status !== 'open') throw new ApiError(409, 'La session de caisse a été clôturée entre-temps : vente à régulariser.', 'SESSION_CLOSED');

    // The sale happened: an item made unavailable since must not refuse it.
    const catalog = loadPricingCatalog();
    catalog.articles.forEach((a) => (a.availability = 'available'));
    let cart;
    try {
      cart = computeCart(body.lines, catalog, loadActiveDiscountRules(), { now: new Date(body.occurredAt) });
    } catch (err) {
      if (err instanceof PricingError) throw new ApiError(400, err.message);
      throw err;
    }
    const by = actorOf(user);
    const sale = createSale({ serviceType: body.serviceType, visitId: null, by, sessionId: session.id });
    db.prepare('UPDATE pos_sales SET offline_ref = ?, occurred_at = ?, client_total_mil = ? WHERE id = ?').run(body.offlineRef, body.occurredAt, body.clientTotalMil, sale.id);
    const order = createOrder({ channel: 'counter', serviceType: body.serviceType, visitId: null, saleId: sale.id, status: 'pending_validation', cart, createdBy: by, note: `Saisie hors ligne ${body.offlineRef}` });
    validateOrder(order.id, by);
    body.payments.forEach((p) => {
      if (getSaleRow(sale.id).status === 'open') recordPayment(sale.id, session.id, p, by);
    });
    const after = getSaleRow(sale.id);
    recordActivity(
      'Caisse',
      'Vente hors ligne',
      `${body.offlineRef} (saisie ${new Date(body.occurredAt).toLocaleString('fr-FR', { timeZone: 'Africa/Tunis' })}) — ${formatDt(after.total_mil)}${after.total_mil !== body.clientTotalMil ? `, écart avec l'appareil ${formatDt(after.total_mil - body.clientTotalMil)}` : ''}`,
      user.fullName,
      { userId: user.id, entityType: 'pos_sale', entityId: sale.id, after: { offlineRef: body.offlineRef, clientTotalMil: body.clientTotalMil, totalMil: after.total_mil } }
    );
    return { status: 201, body: saleDetail(sale.id) };
  });
  emitPosEvent({ type: 'cash.changed' });
  emitPosEvent({ type: 'prep.changed' });
  emitPosEvent({ type: 'actions.changed' });
});

// Offline sales whose price differs from what the device showed, or not fully paid.
registerActionProvider((user) => {
  if (!hasPermission(user, 'pos:collect') && !hasPermission(user, 'pos:history')) return [];
  const rows = db
    .prepare(
      `SELECT id, offline_ref, total_mil, paid_mil, client_total_mil, status, created_at FROM pos_sales
       WHERE offline_ref IS NOT NULL AND status != 'cancelled' AND (total_mil != client_total_mil OR (status = 'open' AND paid_mil < total_mil))
       AND created_at > ? ORDER BY created_at`
    )
    .all(new Date(Date.now() - 7 * 86_400_000).toISOString()) as { id: string; offline_ref: string; total_mil: number; paid_mil: number; client_total_mil: number; status: string; created_at: string }[];
  return rows.map((r) => ({
    id: `offline:${r.id}`,
    kind: 'offline_sale' as const,
    title: `Vente hors ligne ${r.offline_ref} à régulariser`,
    detail:
      r.total_mil !== r.client_total_mil
        ? `Total caisse ${formatDt(r.client_total_mil)}, total actuel ${formatDt(r.total_mil)}${r.status === 'open' ? ` — reste ${formatDt(r.total_mil - r.paid_mil)}` : ''}`
        : `Reste à encaisser ${formatDt(r.total_mil - r.paid_mil)}`,
    tableName: null,
    tableId: null,
    status: 'open',
    createdAt: r.created_at,
    refId: r.id,
  }));
});
