import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { fromJson } from '../db/json.js';
import { asyncHandler, ApiError, notFound } from '../middleware/errors.js';
import { requireAnyPermission, requireAuth, requirePermission } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';
import { emitPosEvent } from '../lib/events.js';
import { rowToDiscount, type DiscountRow } from '../lib/posCatalog.js';
import { actorOf, getSaleRow, recomputeSale, saleDetail } from '../lib/posService.js';
import {
  adjustPoints,
  applyRewardToSale,
  balanceOf,
  getReward,
  ledgerOf,
  listRewards,
  readLoyaltySettings,
  reversePointsForAdjustment,
  saveLoyaltySettings,
} from '../lib/loyalty.js';
import { onSaleAdjusted } from './cancellations.js';
import { tunisClock, type AppliedDiscount } from '../../src/data/pricing.js';

// Fidélité et connaissance client, staff side (cahier des charges §12): identifying a customer at
// the register, customer file for the direction, loyalty settings, rewards and targeted offers.

export const customersRouter = Router();
customersRouter.use(requireAuth);

onSaleAdjusted((saleId, amountMil, by) => reversePointsForAdjustment(saleId, amountMil, by));

interface CustomerRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  preferences: string | null;
  birthday: string | null;
  marketing_consent: number;
  status: string;
  created_at: string;
}

const summary = (c: CustomerRow) => ({
  id: c.id,
  firstName: c.first_name,
  lastName: c.last_name,
  email: c.email,
  phone: c.phone,
  status: c.status,
  points: balanceOf(c.id).available,
});

const getCustomer = (id: string): CustomerRow => {
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as CustomerRow | undefined;
  if (!row) throw notFound('Client');
  return row;
};

// Search at the register: by phone, email or name.
customersRouter.get('/customers', requireAnyPermission('customers:view', 'pos:sell', 'pos:collect'), asyncHandler((req, res) => {
  const q = z.string().trim().max(100).default('').parse(req.query.q ?? '');
  if (q.length < 2) {
    res.json([]);
    return;
  }
  const like = `%${q.toLowerCase()}%`;
  const digits = q.replace(/\D/g, '');
  const rows = db
    .prepare(
      `SELECT * FROM customers WHERE status = 'active' AND (lower(email) LIKE ? OR lower(first_name || ' ' || last_name) LIKE ? ${digits.length >= 3 ? 'OR phone LIKE ?' : ''})
       ORDER BY last_name LIMIT 20`
    )
    .all(...(digits.length >= 3 ? [like, like, `%${digits}%`] : [like, like])) as CustomerRow[];
  res.json(rows.map(summary));
}));

// Fiche client for the direction (§12.4). Several orders in one visit count as one visit.
customersRouter.get('/customers/:id', requirePermission('customers:view'), asyncHandler((req, res) => {
  const c = getCustomer(req.params.id);
  const sales = db.prepare("SELECT id, visit_id, total_mil, completed_at FROM pos_sales WHERE customer_id = ? AND status = 'completed' ORDER BY completed_at DESC").all(c.id) as {
    id: string;
    visit_id: string | null;
    total_mil: number;
    completed_at: string;
  }[];
  const adjusted = (db.prepare('SELECT COALESCE(SUM(a.amount_mil), 0) AS a FROM sale_adjustments a JOIN pos_sales s ON s.id = a.sale_id WHERE s.customer_id = ?').get(c.id) as { a: number }).a;
  const orderVisits = (db.prepare('SELECT DISTINCT visit_id FROM pos_orders WHERE customer_id = ? AND visit_id IS NOT NULL').all(c.id) as { visit_id: string }[]).map((r) => r.visit_id);
  const visitKeys = new Set([...orderVisits, ...sales.map((s) => s.visit_id ?? `sale:${s.id}`)]);
  const lastVisit = sales[0]?.completed_at ?? null;
  const topProducts = db
    .prepare(
      `SELECT l.name, SUM(l.quantity) AS qty FROM pos_order_lines l JOIN pos_orders o ON o.id = l.order_id
       JOIN pos_sales s ON s.id = o.sale_id WHERE s.customer_id = ? AND s.status = 'completed' AND l.status = 'active'
       GROUP BY l.name ORDER BY qty DESC LIMIT 5`
    )
    .all(c.id) as { name: string; qty: number }[];
  const reservations = db.prepare('SELECT id, date, time, people, status FROM reservations WHERE customer_id = ? ORDER BY date DESC, time DESC LIMIT 20').all(c.id);
  const feedback = db.prepare('SELECT id, rating, comment, status, created_at AS createdAt FROM feedback WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20').all(c.id);
  const advantages = sales.flatMap((s) =>
    fromJson<AppliedDiscount[]>((db.prepare('SELECT ticket_discounts_json FROM pos_sales WHERE id = ?').get(s.id) as { ticket_discounts_json: string }).ticket_discounts_json, []).filter((d) => d.source !== 'manual')
  );
  res.json({
    id: c.id,
    firstName: c.first_name,
    lastName: c.last_name,
    email: c.email,
    phone: c.phone,
    preferences: c.preferences,
    birthday: c.birthday,
    marketingConsent: c.marketing_consent === 1,
    status: c.status,
    createdAt: c.created_at,
    lastVisit,
    visitsCount: visitKeys.size,
    spentMil: sales.reduce((s, x) => s + x.total_mil, 0) - adjusted,
    topProducts,
    reservations,
    feedback,
    advantagesUsed: advantages.length,
    loyalty: { ...balanceOf(c.id), history: ledgerOf(c.id) },
  });
}));

customersRouter.put('/customers/:id', requirePermission('customers:manage'), asyncHandler((req, res) => {
  const body = z
    .object({
      firstName: z.string().trim().min(1).max(60),
      lastName: z.string().trim().min(1).max(60),
      phone: z.string().trim().max(20).nullable(),
      preferences: z.string().trim().max(500).nullable(),
    })
    .parse(req.body);
  const before = getCustomer(req.params.id);
  db.prepare('UPDATE customers SET first_name = ?, last_name = ?, phone = ?, preferences = ?, updated_at = ? WHERE id = ?').run(
    body.firstName,
    body.lastName,
    body.phone,
    body.preferences,
    new Date().toISOString(),
    before.id
  );
  recordActivity('Clients', 'Fiche modifiée', `${body.firstName} ${body.lastName}`, req.user!.fullName, { userId: req.user!.id, entityType: 'customer', entityId: before.id, before: summary(before), after: body });
  res.json(summary(getCustomer(before.id)));
}));

customersRouter.post('/customers/:id/points', requirePermission('loyalty:adjust'), asyncHandler((req, res) => {
  const body = z.object({ points: z.number().int().min(-100_000).max(100_000), reason: z.string().trim().min(3, 'Le motif est obligatoire.').max(300) }).parse(req.body);
  const c = getCustomer(req.params.id);
  db.transaction(() => adjustPoints(c.id, body.points, body.reason, actorOf(req.user!)))();
  res.json({ ...balanceOf(c.id), history: ledgerOf(c.id) });
}));

// --- Customer on a bill ------------------------------------------------------------------------------

// A sale is attached to a customer only after identification AND the customer's confirmation (§11.2).
customersRouter.post('/sales/:id/customer', requireAnyPermission('pos:sell', 'pos:collect'), asyncHandler((req, res) => {
  const body = z.object({ customerId: z.string().nullable(), confirmedByCustomer: z.boolean() }).parse(req.body);
  const sale = getSaleRow(req.params.id);
  if (sale.status !== 'open') throw new ApiError(409, 'Le client se rattache avant le règlement complet.');
  if (body.customerId) {
    if (!body.confirmedByCustomer) throw new ApiError(400, 'Le client doit confirmer son identité.');
    const c = getCustomer(body.customerId);
    if (c.status !== 'active') throw new ApiError(409, 'Ce compte est fermé.');
  }
  db.transaction(() => {
    if (sale.customer_id !== body.customerId) db.prepare('DELETE FROM sale_rewards WHERE sale_id = ?').run(sale.id);
    db.prepare('UPDATE pos_sales SET customer_id = ? WHERE id = ?').run(body.customerId, sale.id);
    recomputeSale(sale.id);
    recordActivity('Caisse', 'Client identifié', body.customerId ? `Vente rattachée au client ${body.customerId}` : 'Client retiré de la vente', req.user!.fullName, {
      userId: req.user!.id,
      entityType: 'pos_sale',
      entityId: sale.id,
    });
  })();
  res.json(saleDetail(sale.id));
}));

customersRouter.post('/sales/:id/rewards', requireAnyPermission('pos:sell', 'pos:collect'), asyncHandler((req, res) => {
  const { rewardId } = z.object({ rewardId: z.string().min(1) }).parse(req.body);
  db.transaction(() => {
    applyRewardToSale(req.params.id, rewardId, actorOf(req.user!));
    recomputeSale(req.params.id);
    recordActivity('Fidélité', 'Récompense appliquée', getReward(rewardId).name, req.user!.fullName, { userId: req.user!.id, entityType: 'pos_sale', entityId: req.params.id });
  })();
  res.json(saleDetail(req.params.id));
}));

customersRouter.delete('/sales/:id/rewards/:rewardId', requireAnyPermission('pos:sell', 'pos:collect'), asyncHandler((req, res) => {
  const sale = getSaleRow(req.params.id);
  if (sale.status !== 'open' || sale.paid_mil > 0) throw new ApiError(409, 'La récompense ne peut plus être retirée.');
  db.transaction(() => {
    db.prepare('DELETE FROM sale_rewards WHERE sale_id = ? AND reward_id = ?').run(sale.id, req.params.rewardId);
    recomputeSale(sale.id);
  })();
  res.json(saleDetail(sale.id));
}));

// Rewards usable on a bill (for the register).
customersRouter.get('/sales/:id/rewards', requireAnyPermission('pos:sell', 'pos:collect'), asyncHandler((req, res) => {
  const sale = getSaleRow(req.params.id);
  if (!sale.customer_id) {
    res.json({ available: 0, rewards: [] });
    return;
  }
  const applied = new Set((db.prepare('SELECT reward_id FROM sale_rewards WHERE sale_id = ?').all(sale.id) as { reward_id: string }[]).map((r) => r.reward_id));
  res.json({ ...balanceOf(sale.customer_id), rewards: listRewards(true).map((r) => ({ ...r, applied: applied.has(r.id) })) });
}));

// --- Loyalty settings, rewards, targeted offers --------------------------------------------------------

const settingsSchema = z.object({
  enabled: z.boolean(),
  pointsPerDt: z.number().min(0).max(100),
  excludedCategories: z.array(z.string()).max(100),
  excludedArticleIds: z.array(z.string()).max(500),
  validityDays: z.number().int().min(0).max(3650),
});

customersRouter.get('/loyalty/settings', requireAnyPermission('loyalty:manage', 'customers:view'), asyncHandler((_req, res) => {
  res.json({ settings: readLoyaltySettings(), rewards: listRewards(false) });
}));

customersRouter.put('/loyalty/settings', requirePermission('loyalty:manage'), asyncHandler((req, res) => {
  const body = settingsSchema.parse(req.body);
  const before = readLoyaltySettings();
  db.transaction(() => {
    saveLoyaltySettings(body, req.user!.fullName);
    recordActivity('Fidélité', 'Paramètres', 'Barème de fidélité modifié', req.user!.fullName, { userId: req.user!.id, before, after: body });
  })();
  res.json({ settings: readLoyaltySettings(), rewards: listRewards(false) });
}));

const rewardSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    pointsCost: z.number().int().positive().max(1_000_000),
    kind: z.enum(['fixed', 'percent', 'product']),
    value: z.number().int().min(0).default(0),
    articleId: z.string().nullable().optional(),
    active: z.boolean().default(true),
  })
  .refine((r) => r.kind !== 'product' || Boolean(r.articleId), { message: 'Choisissez le produit offert.', path: ['articleId'] })
  .refine((r) => r.kind === 'product' || r.value > 0, { message: 'Indiquez la valeur de la récompense.', path: ['value'] })
  .refine((r) => r.kind !== 'percent' || r.value <= 10_000, { message: 'Un pourcentage ne peut pas dépasser 100 %.', path: ['value'] });

customersRouter.post('/loyalty/rewards', requirePermission('loyalty:manage'), asyncHandler((req, res) => {
  const body = rewardSchema.parse(req.body);
  const id = randomUUID();
  db.prepare('INSERT INTO loyalty_rewards (id, name, points_cost, kind, value, article_id, active, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    id,
    body.name,
    body.pointsCost,
    body.kind,
    body.value,
    body.articleId ?? null,
    body.active ? 1 : 0,
    req.user!.fullName,
    new Date().toISOString()
  );
  recordActivity('Fidélité', 'Récompense créée', body.name, req.user!.fullName, { userId: req.user!.id, after: body });
  res.status(201).json(getReward(id));
}));

customersRouter.put('/loyalty/rewards/:id', requirePermission('loyalty:manage'), asyncHandler((req, res) => {
  const body = rewardSchema.parse(req.body);
  const before = getReward(req.params.id);
  db.prepare('UPDATE loyalty_rewards SET name = ?, points_cost = ?, kind = ?, value = ?, article_id = ?, active = ?, updated_at = ? WHERE id = ?').run(
    body.name,
    body.pointsCost,
    body.kind,
    body.value,
    body.articleId ?? null,
    body.active ? 1 : 0,
    new Date().toISOString(),
    before.id
  );
  recordActivity('Fidélité', 'Récompense modifiée', body.name, req.user!.fullName, { userId: req.user!.id, before, after: body });
  res.json(getReward(before.id));
}));

// Targeted offers (§12.5): the matching customers are computed when the offer is created, using
// the regular discount mechanism (restricted to those customers) for a limited period.
const offerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(['percent', 'fixed']),
  value: z.number().int().positive(),
  scope: z.enum(['items', 'ticket']),
  validDays: z.number().int().min(1).max(365),
  segment: z.object({
    notSeenForDays: z.number().int().min(1).max(3650).optional(),
    minVisitsLast90Days: z.number().int().min(1).max(500).optional(),
    boughtArticleId: z.string().optional(),
    birthdayThisMonth: z.boolean().optional(),
  }),
});

export const matchSegment = (segment: z.infer<typeof offerSchema>['segment']): string[] => {
  const customers = db.prepare("SELECT id, birthday FROM customers WHERE status = 'active'").all() as { id: string; birthday: string | null }[];
  const now = Date.now();
  const month = tunisClock(new Date()).date.slice(5, 7);
  return customers
    .filter((c) => {
      const sales = db.prepare("SELECT completed_at, visit_id, id FROM pos_sales WHERE customer_id = ? AND status = 'completed' ORDER BY completed_at DESC").all(c.id) as {
        completed_at: string;
        visit_id: string | null;
        id: string;
      }[];
      if (segment.notSeenForDays !== undefined) {
        const last = sales[0]?.completed_at;
        if (last && now - Date.parse(last) < segment.notSeenForDays * 86_400_000) return false;
      }
      if (segment.minVisitsLast90Days !== undefined) {
        const recent = new Set(sales.filter((s) => now - Date.parse(s.completed_at) <= 90 * 86_400_000).map((s) => s.visit_id ?? s.id));
        if (recent.size < segment.minVisitsLast90Days) return false;
      }
      if (segment.boughtArticleId) {
        const bought = db
          .prepare("SELECT 1 FROM pos_order_lines l JOIN pos_orders o ON o.id = l.order_id JOIN pos_sales s ON s.id = o.sale_id WHERE s.customer_id = ? AND l.article_id = ? AND l.status = 'active' LIMIT 1")
          .get(c.id, segment.boughtArticleId);
        if (!bought) return false;
      }
      if (segment.birthdayThisMonth && (!c.birthday || c.birthday.slice(5, 7) !== month)) return false;
      return true;
    })
    .map((c) => c.id);
};

customersRouter.get('/loyalty/offers', requirePermission('loyalty:manage'), asyncHandler((_req, res) => {
  const rows = db.prepare('SELECT * FROM discounts WHERE customer_ids IS NOT NULL ORDER BY created_at DESC').all() as DiscountRow[];
  res.json(rows.map(rowToDiscount).map((d) => ({ ...d, customerCount: d.customerIds?.length ?? 0, customerIds: undefined })));
}));

customersRouter.post('/loyalty/offers/preview', requirePermission('loyalty:manage'), asyncHandler((req, res) => {
  const { segment } = offerSchema.pick({ segment: true }).parse(req.body);
  res.json({ customerCount: matchSegment(segment).length });
}));

customersRouter.post('/loyalty/offers', requirePermission('loyalty:manage'), asyncHandler((req, res) => {
  const body = offerSchema.parse(req.body);
  if (body.kind === 'percent' && body.value > 10_000) throw new ApiError(400, 'Un pourcentage ne peut pas dépasser 100 %.');
  const customerIds = matchSegment(body.segment);
  if (customerIds.length === 0) throw new ApiError(409, 'Aucun client ne correspond à ces critères.');
  const today = tunisClock(new Date()).date;
  const endsOn = tunisClock(new Date(Date.now() + (body.validDays - 1) * 86_400_000)).date;
  const id = randomUUID();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO discounts (id, name, kind, value, scope, starts_on, ends_on, identified_only, customer_ids, stackable, active, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 0, 1, ?, ?)`
    ).run(id, body.name, body.kind, body.value, body.scope, today, endsOn, JSON.stringify(customerIds), req.user!.fullName, new Date().toISOString());
    recordActivity('Fidélité', 'Offre ciblée', `« ${body.name} » pour ${customerIds.length} client(s)`, req.user!.fullName, { userId: req.user!.id, entityType: 'discount', entityId: id, after: { ...body, customerCount: customerIds.length } });
  })();
  emitPosEvent({ type: 'catalog.changed' });
  res.status(201).json({ id, customerCount: customerIds.length, endsOn });
}));

customersRouter.post('/loyalty/offers/:id/deactivate', requirePermission('loyalty:manage'), asyncHandler((req, res) => {
  const r = db.prepare('UPDATE discounts SET active = 0, updated_by = ?, updated_at = ? WHERE id = ? AND customer_ids IS NOT NULL').run(req.user!.fullName, new Date().toISOString(), req.params.id);
  if (r.changes === 0) throw notFound('Offre');
  res.json({ ok: true });
}));
