import { randomBytes, randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler, ApiError, notFound } from '../middleware/errors.js';
import { emitPosEvent } from '../lib/events.js';
import { runIdempotent } from '../lib/idempotency.js';
import { rateLimit } from '../lib/rateLimit.js';
import { currentCustomerId, sha256 } from '../lib/clientIdentity.js';
import { loadPricingCatalog } from '../lib/posCatalog.js';
import {
  activeLinesOfSale,
  createOrder,
  getOrderRow,
  linesOfOrder,
  priceCart,
  serializeLine,
  type OrderRow,
} from '../lib/posService.js';
import { cartLineSchema, readPosSettings } from './posCatalog.js';
import { createServiceRequest } from '../lib/serviceRequests.js';
import { fromJson } from '../db/json.js';
import type { AppliedDiscount } from '../../src/data/pricing.js';

// Public pages reached from the QR code on each table (cahier des charges §4, §10). No staff
// session is involved: reading the menu is open to anyone; acting on the table requires having
// joined the current visit with the code the staff gave (cookie cn_visit, valid for that visit
// only). Mounted before every authenticated router.

export const clientRouter = Router();

const VISIT_COOKIE = 'cn_visit';
const isProd = process.env.NODE_ENV === 'production';
const MAX_JOIN_FAILURES = 8;

interface TableRow {
  id: string;
  name: string;
  qr_token: string;
}
interface VisitRow {
  id: string;
  table_id: string;
  status: string;
  join_code: string;
  join_failures: number;
}

const tableByToken = (qrToken: string): TableRow => {
  const table = db.prepare('SELECT id, name, qr_token FROM dining_tables WHERE qr_token = ? AND archived_at IS NULL').get(qrToken) as TableRow | undefined;
  if (!table) throw notFound('Table');
  return table;
};

const openVisitOf = (tableId: string): VisitRow | undefined =>
  db.prepare("SELECT id, table_id, status, join_code, join_failures FROM visits WHERE table_id = ? AND status = 'open'").get(tableId) as VisitRow | undefined;

// The device's membership of the table's CURRENT visit. The table always comes from the QR code,
// never from the phone (§4.2): a token for another table, or for a closed visit, is worthless.
const joinedDevice = (req: Request, table: TableRow): { deviceId: string; visitId: string } | null => {
  const token = req.cookies?.[VISIT_COOKIE];
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT d.id, d.visit_id FROM visit_devices d JOIN visits v ON v.id = d.visit_id
       WHERE d.token_hash = ? AND d.revoked_at IS NULL AND v.status = 'open' AND v.table_id = ?`
    )
    .get(sha256(token), table.id) as { id: string; visit_id: string } | undefined;
  return row ? { deviceId: row.id, visitId: row.visit_id } : null;
};

const requireJoined = (req: Request, table: TableRow): { deviceId: string; visitId: string } => {
  const device = joinedDevice(req, table);
  if (!device) throw new ApiError(401, 'Saisissez le code de la table, communiqué par notre équipe.', 'VISIT_CODE_REQUIRED');
  return device;
};

// --- Menu (open to everyone) ---------------------------------------------------------------------

clientRouter.get('/menu', asyncHandler((_req, res) => {
  const catalog = loadPricingCatalog();
  const categories = (db.prepare('SELECT name FROM product_categories ORDER BY created_at ASC, rowid ASC').all() as { name: string }[]).map((c) => c.name);
  const allergens = db.prepare('SELECT article_id, allergen, state FROM product_allergens').all() as { article_id: string; allergen: string; state: string }[];
  res.set('Cache-Control', 'no-cache');
  res.json({
    categories,
    articles: [...catalog.articles.values()]
      .filter((a) => a.availability !== 'hidden')
      .map((a) => ({ ...a, allergens: allergens.filter((x) => x.article_id === a.id).map((x) => ({ name: x.allergen, state: x.state })) })),
    extras: [...catalog.extras.values()],
    incompatibleExtras: catalog.incompatibleExtras,
  });
}));

clientRouter.get('/faq', asyncHandler((_req, res) => {
  const rows = db.prepare('SELECT id, question, answer, article_id FROM faq_entries WHERE published = 1 ORDER BY sort, updated_at').all() as {
    id: string;
    question: string;
    answer: string;
    article_id: string | null;
  }[];
  res.json(rows.map((r) => ({ id: r.id, question: r.question, answer: r.answer, articleId: r.article_id })));
}));

// --- Table page --------------------------------------------------------------------------------

clientRouter.get('/tables/:qrToken', asyncHandler((req, res) => {
  const table = tableByToken(req.params.qrToken);
  const visit = openVisitOf(table.id);
  const settings = readPosSettings();
  res.json({
    table: { name: table.name },
    visitOpen: Boolean(visit),
    joined: Boolean(joinedDevice(req, table)),
    googleReviewUrl: settings.googleReviewUrl || null,
  });
}));

clientRouter.post('/tables/:qrToken/join', rateLimit('visit-join', 20, 10 * 60_000), asyncHandler((req, res) => {
  const { code } = z.object({ code: z.string().trim().min(1).max(10) }).parse(req.body);
  const table = tableByToken(req.params.qrToken);
  const visit = openVisitOf(table.id);
  if (!visit) throw new ApiError(409, "Cette table n'est pas encore ouverte. Demandez à notre équipe.");
  if (visit.join_failures >= MAX_JOIN_FAILURES) throw new ApiError(429, 'Trop de codes erronés. Demandez un nouveau code à notre équipe.');
  if (code !== visit.join_code) {
    db.prepare('UPDATE visits SET join_failures = join_failures + 1 WHERE id = ?').run(visit.id);
    throw new ApiError(400, 'Code incorrect.');
  }
  const token = randomBytes(24).toString('base64url');
  db.prepare('INSERT INTO visit_devices (id, visit_id, token_hash, customer_id, created_at) VALUES (?, ?, ?, ?, ?)').run(
    randomUUID(),
    visit.id,
    sha256(token),
    currentCustomerId(req),
    new Date().toISOString()
  );
  res.cookie(VISIT_COOKIE, token, { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/api/client', maxAge: 12 * 3600_000 });
  res.json({ joined: true });
}));

const orderView = (o: OrderRow) => ({
  id: o.id,
  number: o.order_number,
  status: o.status,
  createdAt: o.created_at,
  changeRequest: o.change_request,
  rejectionReason: o.rejection_reason,
  totalMil: o.sent_total_mil,
  lines: linesOfOrder(o.id).map((l) => {
    const s = serializeLine(l);
    return { id: s.id, displayName: s.displayName, quantity: s.quantity, instruction: s.instruction, totalMil: s.totalMil, prepStatus: s.prepStatus, status: s.status };
  }),
});

// What the phone shows: its own orders with their state, and the table bill (accepted items only,
// pending items listed apart — §10.2).
clientRouter.get('/tables/:qrToken/visit', asyncHandler((req, res) => {
  const table = tableByToken(req.params.qrToken);
  const device = requireJoined(req, table);
  const mine = db.prepare('SELECT * FROM pos_orders WHERE visit_id = ? AND device_id = ? ORDER BY order_number DESC').all(device.visitId, device.deviceId) as OrderRow[];
  const sales = db.prepare("SELECT id, total_mil, paid_mil, discount_mil, ticket_discounts_json, status FROM pos_sales WHERE visit_id = ? AND status != 'cancelled' ORDER BY created_at").all(device.visitId) as {
    id: string;
    total_mil: number;
    paid_mil: number;
    discount_mil: number;
    ticket_discounts_json: string;
    status: string;
  }[];
  const accepted = sales.flatMap((s) => activeLinesOfSale(s.id).map(serializeLine));
  const pending = db
    .prepare("SELECT * FROM pos_orders WHERE visit_id = ? AND status IN ('pending_validation', 'awaiting_customer') ORDER BY order_number")
    .all(device.visitId) as OrderRow[];
  const requests = db.prepare("SELECT type, status FROM service_requests WHERE visit_id = ? AND status != 'done'").all(device.visitId) as { type: string; status: string }[];
  res.json({
    tableName: table.name,
    myOrders: mine.map(orderView),
    bill: {
      lines: accepted.map((l) => ({ displayName: l.displayName, quantity: l.quantity, grossMil: l.grossMil, totalMil: l.totalMil, discounts: l.itemDiscounts })),
      pendingLines: pending.flatMap((o) => linesOfOrder(o.id).map(serializeLine)).map((l) => ({ displayName: l.displayName, quantity: l.quantity, totalMil: l.totalMil })),
      ticketDiscounts: sales.flatMap((s) => fromJson<AppliedDiscount[]>(s.ticket_discounts_json, [])),
      totalMil: sales.reduce((s, x) => s + x.total_mil, 0),
      paidMil: sales.reduce((s, x) => s + x.paid_mil, 0),
    },
    activeRequests: requests,
  });
}));

const clientOrderSchema = z.object({ lines: z.array(cartLineSchema).min(1).max(50), note: z.string().trim().max(300).optional() });

// A QR order always starts "En attente de validation": nothing is prepared nor consumed before the
// team accepts it (§4.3). A double tap or a reconnection resends the same Idempotency-Key and gets
// the same order back (§4.4).
clientRouter.post('/tables/:qrToken/orders', rateLimit('qr-order', 30, 10 * 60_000), (req: Request, res: Response) => {
  const body = clientOrderSchema.parse(req.body);
  const table = tableByToken(req.params.qrToken);
  const device = requireJoined(req, table);
  let created = false;
  runIdempotent(req, res, `qr-order:${device.deviceId}`, () => {
    const cart = priceCart(body.lines);
    const order = createOrder({
      channel: 'qr',
      serviceType: 'dine_in',
      visitId: device.visitId,
      saleId: null,
      status: 'pending_validation',
      customerId: currentCustomerId(req),
      deviceId: device.deviceId,
      note: body.note,
      cart,
      createdBy: { id: null, name: `Client — ${table.name}` },
    });
    created = true;
    return { status: 201, body: orderView(order) };
  });
  if (created) {
    emitPosEvent({ type: 'orders.changed', visitId: device.visitId });
    emitPosEvent({ type: 'actions.changed' });
    emitPosEvent({ type: 'floor.changed' });
  }
});

// The team changed the order (content or price): the customer confirms or drops it (§4.3).
clientRouter.post('/tables/:qrToken/orders/:orderId/confirm', asyncHandler((req, res) => {
  const { accept } = z.object({ accept: z.boolean() }).parse(req.body);
  const table = tableByToken(req.params.qrToken);
  const device = requireJoined(req, table);
  const order = getOrderRow(req.params.orderId);
  if (order.visit_id !== device.visitId || order.device_id !== device.deviceId) throw notFound('Commande');
  if (order.status !== 'awaiting_customer') throw new ApiError(409, "Cette commande n'attend pas de confirmation.");
  db.prepare('UPDATE pos_orders SET status = ?, updated_at = ? WHERE id = ?').run(accept ? 'pending_validation' : 'cancelled', new Date().toISOString(), order.id);
  emitPosEvent({ type: 'orders.changed', visitId: device.visitId });
  emitPosEvent({ type: 'actions.changed' });
  res.json(orderView(getOrderRow(order.id)));
}));

clientRouter.post('/tables/:qrToken/requests', rateLimit('service-request', 30, 10 * 60_000), asyncHandler((req, res) => {
  const { type } = z.object({ type: z.enum(['call_waiter', 'bill']) }).parse(req.body);
  const table = tableByToken(req.params.qrToken);
  const device = requireJoined(req, table);
  const request = db.transaction(() => createServiceRequest(device.visitId, table.id, type))();
  emitPosEvent({ type: 'actions.changed' });
  emitPosEvent({ type: 'floor.changed' });
  res.status(201).json(request);
}));

const feedbackSchema = z.object({
  qrToken: z.string().optional(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

// Internal review, available whatever the rating — the Google link is shown next to it (§10.4).
clientRouter.post('/feedback', rateLimit('feedback', 5, 60 * 60_000), asyncHandler((req, res) => {
  const body = feedbackSchema.parse(req.body);
  let visitId: string | null = null;
  let tableName: string | null = null;
  if (body.qrToken) {
    const table = tableByToken(body.qrToken);
    tableName = table.name;
    visitId = joinedDevice(req, table)?.visitId ?? null;
  }
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO feedback (id, visit_id, table_name, customer_id, rating, comment, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'to_handle', ?, ?)`
  ).run(id, visitId, tableName, currentCustomerId(req), body.rating, body.comment || null, now, now);
  emitPosEvent({ type: 'actions.changed' });
  res.status(201).json({ id, googleReviewUrl: readPosSettings().googleReviewUrl || null });
}));
