import { randomBytes, randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { fromJson } from '../db/json.js';
import { asyncHandler, ApiError, notFound } from '../middleware/errors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { rateLimit } from '../lib/rateLimit.js';
import { setCustomerResolver, sha256 } from '../lib/clientIdentity.js';
import { getMailer } from '../lib/mailer.js';
import { loadPricingCatalog, rowToDiscount, type DiscountRow } from '../lib/posCatalog.js';
import { linesOfOrder, serializeLine, type OrderRow } from '../lib/posService.js';
import { balanceOf, ledgerOf, listRewards, readLoyaltySettings } from '../lib/loyalty.js';
import { readPosSettings } from './posCatalog.js';
import { isDiscountActiveAt, priceLine, PricingError, type AppliedDiscount, type CartLineInput } from '../../src/data/pricing.js';

// Compte et espace personnel client (cahier des charges §11). Customer accounts are optional and
// completely separate from staff accounts: own table, own cookie (cn_customer, scoped to
// /api/client), own routes. A customer session can never reach an internal route.

export const customerAccountRouter = Router();

const CUSTOMER_COOKIE = 'cn_customer';
const isProd = process.env.NODE_ENV === 'production';
const SESSION_DAYS = 90;
const LOCK_THRESHOLD = 5;
const LOCK_MINUTES = 15;
const RESET_MINUTES = 60;

interface CustomerRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  password_hash: string | null;
  preferences: string | null;
  birthday: string | null;
  marketing_consent: number;
  status: 'active' | 'closed';
  failed_attempts: number;
  locked_until: string | null;
  created_at: string;
}

const resolveCustomer = (req: Request): CustomerRow | null => {
  const token = req.cookies?.[CUSTOMER_COOKIE];
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT c.* FROM customer_sessions s JOIN customers c ON c.id = s.customer_id
       WHERE s.token_hash = ? AND s.revoked_at IS NULL AND c.status = 'active' AND s.last_seen_at > ?`
    )
    .get(sha256(token), new Date(Date.now() - SESSION_DAYS * 86_400_000).toISOString()) as CustomerRow | undefined;
  return row ?? null;
};

// Lets QR orders, reviews and reservations be attached to the signed-in customer.
setCustomerResolver((req) => resolveCustomer(req)?.id ?? null);

const requireCustomer = (req: Request): CustomerRow => {
  const customer = resolveCustomer(req);
  if (!customer) throw new ApiError(401, 'Connectez-vous à votre compte.', 'CUSTOMER_LOGIN_REQUIRED');
  db.prepare('UPDATE customer_sessions SET last_seen_at = ? WHERE token_hash = ?').run(new Date().toISOString(), sha256(req.cookies[CUSTOMER_COOKIE]));
  return customer;
};

const startSession = (res: Response, customerId: string): void => {
  const token = randomBytes(32).toString('base64url');
  const now = new Date().toISOString();
  db.prepare('INSERT INTO customer_sessions (token_hash, customer_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)').run(sha256(token), customerId, now, now);
  res.cookie(CUSTOMER_COOKIE, token, { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/api/client', maxAge: SESSION_DAYS * 86_400_000 });
};

const profile = (c: CustomerRow) => ({
  id: c.id,
  firstName: c.first_name,
  lastName: c.last_name,
  email: c.email,
  phone: c.phone,
  preferences: c.preferences,
  birthday: c.birthday,
  marketingConsent: c.marketing_consent === 1,
  createdAt: c.created_at,
});

const password = z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.').max(200);
const phone = z
  .string()
  .trim()
  .regex(/^(\+216)?\s?\d{2}\s?\d{3}\s?\d{3}$/, 'Numéro de téléphone tunisien attendu (8 chiffres).')
  .transform((v) => v.replace(/\s/g, ''));
const profileFields = {
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  phone: phone.nullable().optional(),
  preferences: z.string().trim().max(500).nullable().optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  marketingConsent: z.boolean().default(false),
};

// --- Sign-up, sign-in, recovery ------------------------------------------------------------------

customerAccountRouter.post('/account/register', rateLimit('customer-register', 10, 60 * 60_000), asyncHandler((req, res) => {
  const body = z.object({ ...profileFields, email: z.string().trim().toLowerCase().email().max(200), password }).parse(req.body);
  if (db.prepare('SELECT 1 FROM customers WHERE email = ?').get(body.email)) throw new ApiError(409, 'Un compte existe déjà avec cet email.');
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO customers (id, first_name, last_name, email, phone, password_hash, preferences, birthday, marketing_consent, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
  ).run(id, body.firstName, body.lastName, body.email, body.phone ?? null, hashPassword(body.password), body.preferences ?? null, body.birthday ?? null, body.marketingConsent ? 1 : 0, now, now);
  startSession(res, id);
  res.status(201).json(profile(db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as CustomerRow));
}));

customerAccountRouter.post('/account/login', rateLimit('customer-login', 20, 10 * 60_000), asyncHandler((req, res) => {
  const body = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) }).parse(req.body);
  const customer = db.prepare("SELECT * FROM customers WHERE email = ? AND status = 'active'").get(body.email) as CustomerRow | undefined;
  const generic = new ApiError(401, 'Email ou mot de passe incorrect.');
  if (!customer) throw generic;
  if (customer.locked_until && customer.locked_until > new Date().toISOString()) {
    throw new ApiError(429, `Compte temporairement verrouillé après plusieurs erreurs. Réessayez dans ${LOCK_MINUTES} minutes.`);
  }
  if (!verifyPassword(body.password, customer.password_hash)) {
    const failures = customer.failed_attempts + 1;
    const lock = failures >= LOCK_THRESHOLD ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null;
    db.prepare('UPDATE customers SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(lock ? 0 : failures, lock, customer.id);
    throw generic;
  }
  db.prepare('UPDATE customers SET failed_attempts = 0, locked_until = NULL WHERE id = ?').run(customer.id);
  startSession(res, customer.id);
  res.json(profile(customer));
}));

customerAccountRouter.post('/account/logout', asyncHandler((req, res) => {
  const token = req.cookies?.[CUSTOMER_COOKIE];
  if (token) db.prepare('UPDATE customer_sessions SET revoked_at = ? WHERE token_hash = ?').run(new Date().toISOString(), sha256(token));
  res.clearCookie(CUSTOMER_COOKIE, { path: '/api/client' });
  res.status(204).end();
}));

const publicBaseUrl = (req: Request): string => readPosSettings().publicAppUrl || `${req.protocol}://${req.get('host')}`;

// Always answers the same, whether or not the email exists — never reveals who has an account.
customerAccountRouter.post('/account/forgot', rateLimit('customer-forgot', 5, 60 * 60_000), asyncHandler(async (req, res) => {
  const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(req.body);
  const customer = db.prepare("SELECT * FROM customers WHERE email = ? AND status = 'active'").get(email) as CustomerRow | undefined;
  if (customer) {
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    db.prepare('INSERT INTO customer_password_resets (token_hash, customer_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
      sha256(token),
      customer.id,
      now.toISOString(),
      new Date(now.getTime() + RESET_MINUTES * 60_000).toISOString()
    );
    const link = `${publicBaseUrl(req)}/compte?reinitialiser=${token}`;
    await getMailer().send({
      to: customer.email,
      subject: 'Café Noir — réinitialiser votre mot de passe',
      text: `Bonjour ${customer.first_name},\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable ${RESET_MINUTES} minutes, une seule fois) :\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.\n\nCafé Noir`,
      html: `<p>Bonjour ${customer.first_name.replace(/[<>&]/g, '')},</p><p>Pour choisir un nouveau mot de passe, ouvrez ce lien (valable ${RESET_MINUTES} minutes, une seule fois) :</p><p><a href="${link}">Réinitialiser mon mot de passe</a></p><p>Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p><p>Café Noir</p>`,
    });
  }
  res.json({ sent: true });
}));

customerAccountRouter.post('/account/reset', rateLimit('customer-reset', 10, 60 * 60_000), asyncHandler((req, res) => {
  const body = z.object({ token: z.string().min(10), password }).parse(req.body);
  const reset = db.prepare('SELECT * FROM customer_password_resets WHERE token_hash = ?').get(sha256(body.token)) as
    | { customer_id: string; expires_at: string; used_at: string | null }
    | undefined;
  if (!reset || reset.used_at || reset.expires_at < new Date().toISOString()) throw new ApiError(400, 'Ce lien est invalide ou expiré. Faites une nouvelle demande.');
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare('UPDATE customer_password_resets SET used_at = ? WHERE token_hash = ?').run(now, sha256(body.token));
    db.prepare('UPDATE customers SET password_hash = ?, failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?').run(hashPassword(body.password), now, reset.customer_id);
    // Every other device is signed out.
    db.prepare('UPDATE customer_sessions SET revoked_at = ? WHERE customer_id = ? AND revoked_at IS NULL').run(now, reset.customer_id);
  })();
  startSession(res, reset.customer_id);
  res.json({ ok: true });
}));

// --- Profile -----------------------------------------------------------------------------------------

customerAccountRouter.get('/account/me', asyncHandler((req, res) => {
  const customer = resolveCustomer(req);
  if (!customer) {
    res.json(null);
    return;
  }
  res.json({ ...profile(customer), loyalty: balanceOf(customer.id) });
}));

customerAccountRouter.put('/account/me', asyncHandler((req, res) => {
  const customer = requireCustomer(req);
  const body = z.object(profileFields).parse(req.body);
  db.prepare('UPDATE customers SET first_name = ?, last_name = ?, phone = ?, preferences = ?, birthday = ?, marketing_consent = ?, updated_at = ? WHERE id = ?').run(
    body.firstName,
    body.lastName,
    body.phone ?? null,
    body.preferences ?? null,
    body.birthday ?? null,
    body.marketingConsent ? 1 : 0,
    new Date().toISOString(),
    customer.id
  );
  res.json(profile(db.prepare('SELECT * FROM customers WHERE id = ?').get(customer.id) as CustomerRow));
}));

customerAccountRouter.post('/account/password', asyncHandler((req, res) => {
  const customer = requireCustomer(req);
  const body = z.object({ currentPassword: z.string().min(1), newPassword: password }).parse(req.body);
  if (!verifyPassword(body.currentPassword, customer.password_hash)) throw new ApiError(400, 'Mot de passe actuel incorrect.');
  const now = new Date().toISOString();
  db.prepare('UPDATE customers SET password_hash = ?, updated_at = ? WHERE id = ?').run(hashPassword(body.newPassword), now, customer.id);
  db.prepare('UPDATE customer_sessions SET revoked_at = ? WHERE customer_id = ? AND token_hash != ? AND revoked_at IS NULL').run(now, customer.id, sha256(req.cookies[CUSTOMER_COOKIE]));
  res.json({ ok: true });
}));

// Closing an account removes the personal data; sales stay in the books without identifying anyone.
customerAccountRouter.post('/account/close', asyncHandler((req, res) => {
  const customer = requireCustomer(req);
  const { password: pw } = z.object({ password: z.string().min(1) }).parse(req.body);
  if (!verifyPassword(pw, customer.password_hash)) throw new ApiError(400, 'Mot de passe incorrect.');
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      `UPDATE customers SET first_name = 'Compte', last_name = 'fermé', email = ?, phone = NULL, password_hash = NULL, preferences = NULL, birthday = NULL,
       marketing_consent = 0, status = 'closed', closed_at = ?, updated_at = ? WHERE id = ?`
    ).run(`ferme-${customer.id}@invalid.local`, now, now, customer.id);
    db.prepare('UPDATE customer_sessions SET revoked_at = ? WHERE customer_id = ? AND revoked_at IS NULL').run(now, customer.id);
    db.prepare('DELETE FROM customer_favorites WHERE customer_id = ?').run(customer.id);
    db.prepare('UPDATE reservations SET name = ?, phone = ?, email = NULL, comment = NULL WHERE customer_id = ?').run('Compte fermé', '—', customer.id);
  })();
  res.clearCookie(CUSTOMER_COOKIE, { path: '/api/client' });
  res.json({ closed: true });
}));

// --- History, favourites, reorder ----------------------------------------------------------------

const ORDER_STATUS_ORDER = ['pending_validation', 'awaiting_customer', 'validated', 'rejected', 'cancelled'];

// Only what is attached to the account — never what others at the same table consumed (§11.2).
customerAccountRouter.get('/account/orders', asyncHandler((req, res) => {
  const customer = requireCustomer(req);
  const orders = db
    .prepare(
      `SELECT o.*, t.name AS table_name FROM pos_orders o LEFT JOIN visits v ON v.id = o.visit_id LEFT JOIN dining_tables t ON t.id = v.table_id
       WHERE o.customer_id = ? ORDER BY o.created_at DESC LIMIT 100`
    )
    .all(customer.id) as (OrderRow & { table_name: string | null })[];
  res.json(
    orders
      .filter((o) => ORDER_STATUS_ORDER.includes(o.status))
      .map((o) => ({
        id: o.id,
        number: o.order_number,
        status: o.status,
        tableName: o.table_name,
        createdAt: o.created_at,
        totalMil: linesOfOrder(o.id).filter((l) => l.status === 'active').reduce((s, l) => s + l.gross_mil - l.item_discount_mil, 0),
        lines: linesOfOrder(o.id).map(serializeLine).map((l) => ({ id: l.id, articleId: l.articleId, displayName: l.displayName, quantity: l.quantity, totalMil: l.totalMil, status: l.status, prepStatus: l.prepStatus, variantId: l.variant?.id ?? null, extraIds: l.extras.map((e) => e.id) })),
      }))
  );
}));

// Receipts of the sales attached to the account (justificatifs, §11.4).
customerAccountRouter.get('/account/receipts', asyncHandler((req, res) => {
  const customer = requireCustomer(req);
  const sales = db
    .prepare("SELECT id, ticket_number, completed_at, total_mil, ticket_discounts_json, table_name FROM pos_sales WHERE customer_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT 100")
    .all(customer.id) as { id: string; ticket_number: string; completed_at: string; total_mil: number; ticket_discounts_json: string; table_name: string | null }[];
  res.json(
    sales.map((s) => ({
      id: s.id,
      ticketNumber: s.ticket_number,
      completedAt: s.completed_at,
      totalMil: s.total_mil,
      tableName: s.table_name,
      advantages: fromJson<AppliedDiscount[]>(s.ticket_discounts_json, []).filter((d) => d.source !== 'manual'),
    }))
  );
}));

customerAccountRouter.get('/account/favorites', asyncHandler((req, res) => {
  const customer = requireCustomer(req);
  const catalog = loadPricingCatalog();
  const rows = db.prepare('SELECT * FROM customer_favorites WHERE customer_id = ? ORDER BY created_at DESC').all(customer.id) as {
    id: string;
    article_id: string;
    variant_id: string | null;
    extra_ids: string;
  }[];
  res.json(
    rows.map((f) => {
      const input: CartLineInput = { articleId: f.article_id, quantity: 1, variantId: f.variant_id ?? undefined, extraIds: fromJson<string[]>(f.extra_ids, []) };
      try {
        const line = priceLine(input, catalog);
        return { id: f.id, ...input, displayName: line.displayName, unitPriceMil: line.unitPriceMil + line.optionsPriceMil, available: true };
      } catch (err) {
        const article = catalog.articles.get(f.article_id);
        return { id: f.id, ...input, displayName: article?.name ?? 'Produit retiré de la carte', unitPriceMil: null, available: false, reason: (err as Error).message };
      }
    })
  );
}));

customerAccountRouter.post('/account/favorites', asyncHandler((req, res) => {
  const customer = requireCustomer(req);
  const body = z.object({ articleId: z.string().min(1), variantId: z.string().nullable().optional(), extraIds: z.array(z.string()).max(20).default([]) }).parse(req.body);
  if (!loadPricingCatalog().articles.has(body.articleId)) throw notFound('Produit');
  const count = (db.prepare('SELECT COUNT(*) AS n FROM customer_favorites WHERE customer_id = ?').get(customer.id) as { n: number }).n;
  if (count >= 50) throw new ApiError(409, 'Vous avez atteint le nombre maximal de favoris.');
  const id = randomUUID();
  db.prepare('INSERT INTO customer_favorites (id, customer_id, article_id, variant_id, extra_ids, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    customer.id,
    body.articleId,
    body.variantId ?? null,
    JSON.stringify(body.extraIds),
    new Date().toISOString()
  );
  res.status(201).json({ id });
}));

customerAccountRouter.delete('/account/favorites/:id', asyncHandler((req, res) => {
  const customer = requireCustomer(req);
  db.prepare('DELETE FROM customer_favorites WHERE id = ? AND customer_id = ?').run(req.params.id, customer.id);
  res.status(204).end();
}));

// Rebuilds a past order as a new cart at today's prices and availability; the customer reviews it
// and sends it from their table, where it is validated by the team like any QR order (§11.3).
customerAccountRouter.post('/account/reorder/:orderId', asyncHandler((req, res) => {
  const customer = requireCustomer(req);
  const order = db.prepare('SELECT id FROM pos_orders WHERE id = ? AND customer_id = ?').get(req.params.orderId, customer.id) as { id: string } | undefined;
  if (!order) throw notFound('Commande');
  const catalog = loadPricingCatalog();
  const lines: (CartLineInput & { displayName: string; unitPriceMil: number })[] = [];
  const dropped: { name: string; reason: string }[] = [];
  linesOfOrder(order.id)
    .filter((l) => l.status !== 'refused')
    .forEach((l) => {
      const s = serializeLine(l);
      const input: CartLineInput = { articleId: s.articleId, quantity: s.quantity, variantId: s.variant?.id, extraIds: s.extras.map((e) => e.id), instruction: s.instruction ?? undefined };
      try {
        const priced = priceLine(input, catalog);
        lines.push({ ...input, displayName: priced.displayName, unitPriceMil: priced.unitPriceMil + priced.optionsPriceMil });
      } catch (err) {
        dropped.push({ name: s.displayName, reason: err instanceof PricingError ? err.message : 'Indisponible' });
      }
    });
  res.json({ lines, dropped });
}));

// --- Loyalty and offers -----------------------------------------------------------------------------

customerAccountRouter.get('/account/loyalty', asyncHandler((req, res) => {
  const customer = requireCustomer(req);
  const settings = readLoyaltySettings();
  res.json({
    enabled: settings.enabled,
    pointsPerDt: settings.pointsPerDt,
    validityDays: settings.validityDays,
    ...balanceOf(customer.id),
    history: ledgerOf(customer.id),
    rewards: listRewards(true),
  });
}));

// Offers this customer can use now: targeted ones and those reserved to identified customers.
customerAccountRouter.get('/account/offers', asyncHandler((req, res) => {
  const customer = requireCustomer(req);
  const now = new Date();
  const rows = db.prepare('SELECT * FROM discounts WHERE active = 1').all() as DiscountRow[];
  res.json(
    rows
      .map(rowToDiscount)
      .filter((d) => (d.customerIds || d.identifiedCustomersOnly) && isDiscountActiveAt(d, now, customer.id))
      .map((d) => ({ id: d.id, name: d.name, kind: d.kind, value: d.value, scope: d.scope, endsOn: d.endsOn ?? null, categories: d.categories }))
  );
}));
