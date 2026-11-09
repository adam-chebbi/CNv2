import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler, ApiError, notFound } from '../middleware/errors.js';
import { requireAnyPermission, requireAuth, requirePermission } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';
import { emitPosEvent } from '../lib/events.js';
import { assertTableAccess, assignedTableIds, canSeeAllTables, hasPermission } from '../lib/posAccess.js';
import {
  actorOf,
  getOrderRow,
  lineToCartInput,
  linesOfOrder,
  priceCart,
  replaceOrderLines,
  serializeOrder,
  validateOrder,
  type OrderRow,
} from '../lib/posService.js';
import { serializeServiceRequest, type ServiceRequestRow } from '../lib/serviceRequests.js';
import { cartLineSchema } from './posCatalog.js';
import { formatDt } from '../../src/data/money.js';
import type { AuthedUser } from '../middleware/auth.js';

// Staff side of the QR code and the "Actions à traiter" queue (cahier des charges §4.3, §10, §16.2).

export const serviceDeskRouter = Router();
serviceDeskRouter.use(requireAuth);

const tableOfVisit = (visitId: string | null): { id: string; name: string } | null => {
  if (!visitId) return null;
  return (db.prepare('SELECT t.id, t.name FROM visits v JOIN dining_tables t ON t.id = v.table_id WHERE v.id = ?').get(visitId) as { id: string; name: string } | undefined) ?? null;
};

const assertOrderAccess = (user: AuthedUser, order: OrderRow): void => {
  const table = tableOfVisit(order.visit_id);
  if (table) assertTableAccess(user, table.id);
};

// --- QR order validation --------------------------------------------------------------------------

// Accepting re-prices the order at today's prices: if anything changed since the customer sent it
// (price, availability), the order goes back to the customer for confirmation instead (§4.3, §8.3).
serviceDeskRouter.post('/orders/:id/accept', requirePermission('orders:validate'), asyncHandler((req, res) => {
  const user = req.user!;
  const order = getOrderRow(req.params.id);
  assertOrderAccess(user, order);
  if (order.status === 'validated') {
    res.json(serializeOrder(order));
    return;
  }
  if (order.status !== 'pending_validation') throw new ApiError(409, "Cette commande n'est pas en attente de validation.");

  const result = db.transaction(() => {
    let repriced;
    try {
      repriced = priceCart(linesOfOrder(order.id).map(lineToCartInput));
    } catch (err) {
      throw new ApiError(409, `${(err as Error).message} Demandez une modification au client.`);
    }
    const newTotal = repriced.lines.reduce((s, l) => s + l.grossMil - l.discounts.reduce((t, d) => t + d.amountMil, 0), 0);
    if (newTotal !== order.sent_total_mil) {
      replaceOrderLines(order.id, repriced);
      db.prepare("UPDATE pos_orders SET status = 'awaiting_customer', sent_total_mil = ?, change_request = ?, updated_at = ? WHERE id = ?").run(
        newTotal,
        `Les prix ont été actualisés : nouveau total ${formatDt(newTotal)}.`,
        new Date().toISOString(),
        order.id
      );
      return getOrderRow(order.id);
    }
    const validated = validateOrder(order.id, actorOf(user));
    recordActivity('Commandes', 'Validation QR', `Commande n°${order.order_number} (${tableOfVisit(order.visit_id)?.name ?? '—'}) acceptée`, user.fullName, {
      userId: user.id,
      entityType: 'pos_order',
      entityId: order.id,
    });
    return validated;
  })();
  emitPosEvent({ type: 'orders.changed', visitId: order.visit_id ?? undefined });
  emitPosEvent({ type: 'prep.changed' });
  emitPosEvent({ type: 'actions.changed' });
  emitPosEvent({ type: 'floor.changed' });
  res.json(serializeOrder(result));
}));

serviceDeskRouter.post('/orders/:id/reject', requirePermission('orders:validate'), asyncHandler((req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(2, 'Indiquez un motif.').max(300) }).parse(req.body);
  const user = req.user!;
  const order = getOrderRow(req.params.id);
  assertOrderAccess(user, order);
  if (!['pending_validation', 'awaiting_customer'].includes(order.status)) throw new ApiError(409, 'Cette commande ne peut plus être refusée.');
  db.transaction(() => {
    db.prepare("UPDATE pos_orders SET status = 'rejected', rejection_reason = ?, validated_by_id = ?, validated_by = ?, updated_at = ? WHERE id = ?").run(
      reason,
      user.id,
      user.fullName,
      new Date().toISOString(),
      order.id
    );
    db.prepare("UPDATE pos_order_lines SET status = 'refused' WHERE order_id = ?").run(order.id);
    recordActivity('Commandes', 'Refus', `Commande n°${order.order_number} refusée — ${reason}`, user.fullName, { userId: user.id, entityType: 'pos_order', entityId: order.id });
  })();
  emitPosEvent({ type: 'orders.changed', visitId: order.visit_id ?? undefined });
  emitPosEvent({ type: 'actions.changed' });
  emitPosEvent({ type: 'floor.changed' });
  res.json(serializeOrder(getOrderRow(order.id)));
}));

// Asks the customer to confirm a modified order: an item removed or changed, an unavailability.
serviceDeskRouter.post('/orders/:id/request-change', requirePermission('orders:validate'), asyncHandler((req, res) => {
  const body = z.object({ message: z.string().trim().min(2).max(300), lines: z.array(cartLineSchema).min(1).max(50) }).parse(req.body);
  const user = req.user!;
  const order = getOrderRow(req.params.id);
  assertOrderAccess(user, order);
  if (order.status !== 'pending_validation') throw new ApiError(409, "Cette commande n'est pas en attente de validation.");
  const cart = priceCart(body.lines);
  db.transaction(() => {
    replaceOrderLines(order.id, cart);
    const total = cart.lines.reduce((s, l) => s + l.grossMil - l.discounts.reduce((t, d) => t + d.amountMil, 0), 0);
    db.prepare("UPDATE pos_orders SET status = 'awaiting_customer', change_request = ?, sent_total_mil = ?, updated_at = ? WHERE id = ?").run(
      body.message,
      total,
      new Date().toISOString(),
      order.id
    );
    recordActivity('Commandes', 'Modification demandée', `Commande n°${order.order_number} — ${body.message}`, user.fullName, {
      userId: user.id,
      entityType: 'pos_order',
      entityId: order.id,
    });
  })();
  emitPosEvent({ type: 'orders.changed', visitId: order.visit_id ?? undefined });
  emitPosEvent({ type: 'actions.changed' });
  res.json(serializeOrder(getOrderRow(order.id)));
}));

// --- Service requests ------------------------------------------------------------------------------

const updateRequest = (id: string, to: 'in_progress' | 'done', user: AuthedUser) => {
  const row = db.prepare('SELECT * FROM service_requests WHERE id = ?').get(id) as ServiceRequestRow | undefined;
  if (!row) throw notFound('Demande');
  assertTableAccess(user, row.table_id);
  if (row.status === 'done') return serializeServiceRequest(row);
  const now = new Date().toISOString();
  if (to === 'in_progress') {
    db.prepare("UPDATE service_requests SET status = 'in_progress', taken_by = ?, taken_at = ? WHERE id = ?").run(user.fullName, now, id);
  } else {
    db.prepare("UPDATE service_requests SET status = 'done', taken_by = COALESCE(taken_by, ?), taken_at = COALESCE(taken_at, ?), done_by = ?, done_at = ? WHERE id = ?").run(
      user.fullName,
      now,
      user.fullName,
      now,
      id
    );
  }
  emitPosEvent({ type: 'actions.changed' });
  emitPosEvent({ type: 'floor.changed' });
  return serializeServiceRequest(db.prepare('SELECT * FROM service_requests WHERE id = ?').get(id) as ServiceRequestRow);
};

serviceDeskRouter.post('/service-requests/:id/take', requireAnyPermission('actions:view', 'floor:view'), asyncHandler((req, res) => {
  res.json(updateRequest(req.params.id, 'in_progress', req.user!));
}));
serviceDeskRouter.post('/service-requests/:id/done', requireAnyPermission('actions:view', 'floor:view'), asyncHandler((req, res) => {
  res.json(updateRequest(req.params.id, 'done', req.user!));
}));

// --- FAQ & allergens -------------------------------------------------------------------------------

const faqSchema = z.object({
  question: z.string().trim().min(3).max(300),
  answer: z.string().trim().min(1).max(2000),
  articleId: z.string().nullable().optional(),
  sort: z.number().int().min(0).max(1000).default(0),
  published: z.boolean().default(true),
});

serviceDeskRouter.get('/faq', requireAnyPermission('pos:settings', 'products:manage'), asyncHandler((_req, res) => {
  res.json(
    (db.prepare('SELECT * FROM faq_entries ORDER BY sort, updated_at').all() as { id: string; question: string; answer: string; article_id: string | null; sort: number; published: number; updated_by: string; updated_at: string }[]).map((r) => ({
      id: r.id,
      question: r.question,
      answer: r.answer,
      articleId: r.article_id,
      sort: r.sort,
      published: r.published === 1,
      updatedBy: r.updated_by,
      updatedAt: r.updated_at,
    }))
  );
}));

serviceDeskRouter.post('/faq', requireAnyPermission('pos:settings', 'products:manage'), asyncHandler((req, res) => {
  const body = faqSchema.parse(req.body);
  const id = randomUUID();
  db.prepare('INSERT INTO faq_entries (id, question, answer, article_id, sort, published, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    id,
    body.question,
    body.answer,
    body.articleId ?? null,
    body.sort,
    body.published ? 1 : 0,
    req.user!.fullName,
    new Date().toISOString()
  );
  res.status(201).json({ id });
}));

serviceDeskRouter.put('/faq/:id', requireAnyPermission('pos:settings', 'products:manage'), asyncHandler((req, res) => {
  const body = faqSchema.parse(req.body);
  const r = db.prepare('UPDATE faq_entries SET question = ?, answer = ?, article_id = ?, sort = ?, published = ?, updated_by = ?, updated_at = ? WHERE id = ?').run(
    body.question,
    body.answer,
    body.articleId ?? null,
    body.sort,
    body.published ? 1 : 0,
    req.user!.fullName,
    new Date().toISOString(),
    req.params.id
  );
  if (r.changes === 0) throw notFound('Question');
  res.json({ ok: true });
}));

serviceDeskRouter.delete('/faq/:id', requireAnyPermission('pos:settings', 'products:manage'), asyncHandler((req, res) => {
  db.prepare('DELETE FROM faq_entries WHERE id = ?').run(req.params.id);
  res.status(204).end();
}));

serviceDeskRouter.get('/catalog/allergens', requireAnyPermission('products:manage', 'products:view'), asyncHandler((_req, res) => {
  res.json(db.prepare('SELECT article_id AS articleId, allergen, state FROM product_allergens ORDER BY allergen').all());
}));

serviceDeskRouter.put('/catalog/articles/:id/allergens', requirePermission('products:manage'), asyncHandler((req, res) => {
  const { allergens } = z.object({ allergens: z.array(z.object({ name: z.string().trim().min(1).max(60), state: z.enum(['contains', 'free']) })).max(40) }).parse(req.body);
  const article = db.prepare('SELECT id, name FROM catalog_articles WHERE id = ?').get(req.params.id) as { id: string; name: string } | undefined;
  if (!article) throw notFound('Produit');
  db.transaction(() => {
    db.prepare('DELETE FROM product_allergens WHERE article_id = ?').run(article.id);
    const insert = db.prepare('INSERT OR REPLACE INTO product_allergens (article_id, allergen, state) VALUES (?, ?, ?)');
    allergens.forEach((a) => insert.run(article.id, a.name, a.state));
    recordActivity('Produits', 'Allergènes', article.name, req.user!.fullName, { userId: req.user!.id, entityType: 'catalog_article', entityId: article.id, after: allergens });
  })();
  emitPosEvent({ type: 'catalog.changed' });
  res.json({ ok: true });
}));

// --- Feedback --------------------------------------------------------------------------------------

interface FeedbackRow {
  id: string;
  visit_id: string | null;
  table_name: string | null;
  customer_id: string | null;
  rating: number;
  comment: string | null;
  status: 'to_handle' | 'in_progress' | 'resolved';
  internal_notes: string | null;
  handled_by: string | null;
  created_at: string;
  updated_at: string;
}

const serializeFeedback = (r: FeedbackRow) => ({
  id: r.id,
  tableName: r.table_name,
  customerId: r.customer_id,
  rating: r.rating,
  comment: r.comment,
  status: r.status,
  internalNotes: r.internal_notes,
  handledBy: r.handled_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

serviceDeskRouter.get('/feedback', requirePermission('feedback:manage'), asyncHandler((req, res) => {
  const status = z.enum(['to_handle', 'in_progress', 'resolved']).optional().parse(req.query.status);
  const rows = (status
    ? db.prepare('SELECT * FROM feedback WHERE status = ? ORDER BY created_at DESC LIMIT 300').all(status)
    : db.prepare('SELECT * FROM feedback ORDER BY created_at DESC LIMIT 300').all()) as FeedbackRow[];
  res.json(rows.map(serializeFeedback));
}));

serviceDeskRouter.patch('/feedback/:id', requirePermission('feedback:manage'), asyncHandler((req, res) => {
  const body = z.object({ status: z.enum(['to_handle', 'in_progress', 'resolved']), internalNotes: z.string().trim().max(2000).optional() }).parse(req.body);
  const r = db.prepare('UPDATE feedback SET status = ?, internal_notes = COALESCE(?, internal_notes), handled_by = ?, updated_at = ? WHERE id = ?').run(
    body.status,
    body.internalNotes ?? null,
    req.user!.fullName,
    new Date().toISOString(),
    req.params.id
  );
  if (r.changes === 0) throw notFound('Avis');
  emitPosEvent({ type: 'actions.changed' });
  res.json(serializeFeedback(db.prepare('SELECT * FROM feedback WHERE id = ?').get(req.params.id) as FeedbackRow));
}));

// --- "Actions à traiter" ---------------------------------------------------------------------------

export interface ActionItem {
  id: string;
  kind: 'qr_order' | 'call_waiter' | 'bill' | 'cancellation' | 'reservation' | 'feedback' | 'missing_covers' | 'offline_sale';
  title: string;
  detail?: string;
  tableId?: string | null;
  tableName?: string | null;
  status: string;
  createdAt: string;
  refId: string;
}

type ActionProvider = (user: AuthedUser) => ActionItem[];
const actionProviders: ActionProvider[] = [];
export const registerActionProvider = (provider: ActionProvider): void => {
  actionProviders.push(provider);
};

registerActionProvider((user) => {
  if (!(user.isSuperAdmin || user.permissions.includes('orders:validate'))) return [];
  const rows = db
    .prepare(
      `SELECT o.*, t.id AS table_id, t.name AS table_name FROM pos_orders o JOIN visits v ON v.id = o.visit_id JOIN dining_tables t ON t.id = v.table_id
       WHERE o.status IN ('pending_validation', 'awaiting_customer') ORDER BY o.created_at`
    )
    .all() as (OrderRow & { table_id: string; table_name: string })[];
  return rows.map((o) => ({
    id: `order:${o.id}`,
    kind: 'qr_order',
    title: `Commande QR n°${o.order_number}`,
    detail: `${linesOfOrder(o.id).length} article(s) — ${formatDt(o.sent_total_mil)}${o.status === 'awaiting_customer' ? ' — en attente du client' : ''}`,
    tableId: o.table_id,
    tableName: o.table_name,
    status: o.status,
    createdAt: o.created_at,
    refId: o.id,
  }));
});

registerActionProvider(() => {
  const rows = db
    .prepare("SELECT r.*, t.name AS table_name FROM service_requests r JOIN dining_tables t ON t.id = r.table_id WHERE r.status != 'done' ORDER BY r.created_at")
    .all() as (ServiceRequestRow & { table_name: string })[];
  return rows.map((r) => ({
    id: `request:${r.id}`,
    kind: r.type,
    title: r.type === 'call_waiter' ? 'Appel serveur' : 'Addition demandée',
    detail: r.press_count > 1 ? `${r.press_count} appuis` : undefined,
    tableId: r.table_id,
    tableName: r.table_name,
    status: r.status,
    createdAt: r.created_at,
    refId: r.id,
  }));
});

registerActionProvider((user) => {
  if (!(user.isSuperAdmin || user.permissions.includes('feedback:manage'))) return [];
  const rows = db.prepare("SELECT * FROM feedback WHERE status != 'resolved' ORDER BY created_at").all() as FeedbackRow[];
  return rows.map((f) => ({
    id: `feedback:${f.id}`,
    kind: 'feedback',
    title: `Avis client ${'★'.repeat(f.rating)}`,
    detail: f.comment ?? undefined,
    tableName: f.table_name,
    status: f.status,
    createdAt: f.created_at,
    refId: f.id,
  }));
});

// Open visits whose covers are still unknown — to be fixed before release (§6.5).
registerActionProvider(() => {
  const rows = db
    .prepare("SELECT v.id, v.opened_at, t.id AS table_id, t.name FROM visits v JOIN dining_tables t ON t.id = v.table_id WHERE v.status = 'open' AND v.covers IS NULL ORDER BY v.opened_at")
    .all() as { id: string; opened_at: string; table_id: string; name: string }[];
  return rows.map((v) => ({
    id: `covers:${v.id}`,
    kind: 'missing_covers',
    title: 'Couverts non renseignés',
    tableId: v.table_id,
    tableName: v.name,
    status: 'open',
    createdAt: v.opened_at,
    refId: v.id,
  }));
});

const actionsFor = (user: AuthedUser) => {
  const seeAll = canSeeAllTables(user);
  const mine = assignedTableIds(user.id);
  return actionProviders
    .flatMap((p) => p(user))
    .filter((item) => seeAll || !item.tableId || mine.has(item.tableId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};

serviceDeskRouter.get('/actions', requireAnyPermission('actions:view'), asyncHandler((req, res) => {
  res.json(actionsFor(req.user!));
}));

// Staff notifications ("Roles, flows and screens", waiter): ready to serve, waiter call and bill asked
// on the person's tables, and the decision on their own cancellation requests. Derived from the live
// state, so an item disappears by itself once handled. Also the count of actions to handle, shown
// as a badge in the top bar on every screen.
serviceDeskRouter.get('/my-notifications', asyncHandler((req, res) => {
  const user = req.user!;
  const seeAll = canSeeAllTables(user);
  const mine = assignedTableIds(user.id);
  const isMine = (tableId: string | null, waiterId: string | null) => seeAll || waiterId === user.id || (tableId !== null && mine.has(tableId));
  const items: { id: string; kind: 'ready' | 'call_waiter' | 'bill' | 'cancel_approved' | 'cancel_rejected'; tableName: string | null; text: string; at: string }[] = [];

  if (hasPermission(user, 'floor:view') || hasPermission(user, 'orders:take')) {
    const ready = db
      .prepare(
        `SELECT l.id, l.display_name, l.quantity, l.ready_at, v.table_id, v.primary_waiter_id, t.name AS table_name
         FROM pos_order_lines l JOIN pos_orders o ON o.id = l.order_id
         LEFT JOIN visits v ON v.id = o.visit_id LEFT JOIN dining_tables t ON t.id = v.table_id
         WHERE l.prep_status = 'ready' AND l.status = 'active' ORDER BY l.ready_at`
      )
      .all() as { id: string; display_name: string; quantity: number; ready_at: string; table_id: string | null; primary_waiter_id: string | null; table_name: string | null }[];
    ready.filter((r) => isMine(r.table_id, r.primary_waiter_id)).forEach((r) =>
      items.push({ id: `ready:${r.id}`, kind: 'ready', tableName: r.table_name, text: `${r.quantity} × ${r.display_name} prêt à servir`, at: r.ready_at })
    );
    const calls = db
      .prepare(
        `SELECT sr.id, sr.type, sr.created_at, sr.press_count, sr.table_id, v.primary_waiter_id, t.name AS table_name
         FROM service_requests sr JOIN visits v ON v.id = sr.visit_id JOIN dining_tables t ON t.id = sr.table_id
         WHERE sr.status = 'open'`
      )
      .all() as { id: string; type: 'call_waiter' | 'bill'; created_at: string; press_count: number; table_id: string; primary_waiter_id: string | null; table_name: string }[];
    calls.filter((c) => isMine(c.table_id, c.primary_waiter_id)).forEach((c) =>
      items.push({
        id: `sr:${c.id}`, kind: c.type, tableName: c.table_name, at: c.created_at,
        text: (c.type === 'bill' ? 'Addition demandée' : 'Appel serveur') + (c.press_count > 1 ? ` (${c.press_count} fois)` : ''),
      })
    );
  }

  const since = new Date(Date.now() - 2 * 3600_000).toISOString();
  const decided = db
    .prepare(
      `SELECT c.id, c.status, c.description, c.decided_by, c.decided_at, c.decision_note, t.name AS table_name
       FROM cancellation_requests c LEFT JOIN visits v ON v.id = c.visit_id LEFT JOIN dining_tables t ON t.id = v.table_id
       WHERE c.requester_id = ? AND c.status != 'pending' AND c.decided_at >= ? ORDER BY c.decided_at DESC`
    )
    .all(user.id, since) as { id: string; status: 'approved' | 'rejected'; description: string; decided_by: string | null; decided_at: string; decision_note: string | null; table_name: string | null }[];
  decided.forEach((c) =>
    items.push({
      id: `cancel:${c.id}`, kind: c.status === 'approved' ? 'cancel_approved' : 'cancel_rejected', tableName: c.table_name, at: c.decided_at,
      text: `Annulation ${c.status === 'approved' ? 'acceptée' : 'refusée'} : ${c.description}${c.decided_by ? ` (${c.decided_by})` : ''}${c.decision_note ? ` — ${c.decision_note}` : ''}`,
    })
  );

  res.json({
    items: items.sort((x, y) => y.at.localeCompare(x.at)),
    actionsCount: hasPermission(user, 'actions:view') ? actionsFor(user).length : null,
  });
}));
