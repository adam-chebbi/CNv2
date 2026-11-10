import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler, ApiError, notFound } from '../middleware/errors.js';
import { requireAnyPermission, requireAuth, requirePermission } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';
import { emitPosEvent } from '../lib/events.js';
import { getPosSetting, loadActiveDiscountRules, loadPricingCatalog, rowToDiscount, setPosSetting, type DiscountRow } from '../lib/posCatalog.js';
import { computeCart, PricingError } from '../../src/data/pricing.js';
import { POS_SETTING_DEFAULTS, type PosSettings } from '../../src/data/posSettings.js';
import { getVariantGroupForCategory, type VariantOption } from '../../src/data/manualSalesCatalog.js';

export const posCatalogRouter = Router();
posCatalogRouter.use(requireAuth);

const CATALOG_READERS = ['pos:sell', 'orders:take', 'orders:validate', 'products:view', 'prep:kitchen', 'prep:bar'];

// --- Catalogue for the point of sale ----------------------------------------------------------

posCatalogRouter.get('/catalog', requireAnyPermission(...CATALOG_READERS), asyncHandler((req, res) => {
  const catalog = loadPricingCatalog();
  const includeHidden = req.query.all === '1';
  const categories = (db.prepare('SELECT name FROM product_categories ORDER BY created_at ASC, rowid ASC').all() as { name: string }[]).map((c) => c.name);
  res.json({
    categories,
    articles: [...catalog.articles.values()].filter((a) => includeHidden || a.availability !== 'hidden'),
    extras: [...catalog.extras.values()],
    incompatibleExtras: catalog.incompatibleExtras,
  });
}));

const articlePatchSchema = z.object({
  availability: z.enum(['available', 'unavailable', 'hidden']).optional(),
  prepDestination: z.enum(['kitchen', 'bar', 'none']).optional(),
  prepTargetMinutes: z.number().int().min(1).max(240).nullable().optional(),
});

// Availability can be switched from the cash register (out of stock during service); the
// preparation destination is a catalogue setting.
posCatalogRouter.patch('/catalog/articles/:id', requireAnyPermission('products:manage', 'pos:sell'), asyncHandler((req, res) => {
  const body = articlePatchSchema.parse(req.body);
  const user = req.user!;
  const canManage = user.isSuperAdmin || user.permissions.includes('products:manage');
  if ((body.prepDestination || body.prepTargetMinutes !== undefined) && !canManage) throw new ApiError(403, "Vous n'avez pas la permission de modifier la destination de préparation.");
  if (body.availability === 'hidden' && !canManage) throw new ApiError(403, "Seule la gestion des produits peut masquer un produit.");

  const before = db.prepare('SELECT id, name, availability, prep_destination FROM catalog_articles WHERE id = ?').get(req.params.id) as
    | { id: string; name: string; availability: string; prep_destination: string | null }
    | undefined;
  if (!before) throw notFound('Produit');

  db.transaction(() => {
    if (body.availability) {
      db.prepare('UPDATE catalog_articles SET availability = ?, is_available = ? WHERE id = ?').run(
        body.availability,
        body.availability === 'available' ? 1 : 0,
        before.id
      );
    }
    if (body.prepDestination) db.prepare('UPDATE catalog_articles SET prep_destination = ? WHERE id = ?').run(body.prepDestination, before.id);
    if (body.prepTargetMinutes !== undefined) db.prepare('UPDATE catalog_articles SET prep_target_minutes = ? WHERE id = ?').run(body.prepTargetMinutes, before.id);
    recordActivity('Produits', 'Disponibilité', `${before.name} — ${[body.availability, body.prepDestination].filter(Boolean).join(', ')}`, user.fullName, {
      userId: user.id,
      entityType: 'catalog_article',
      entityId: before.id,
      before: { availability: before.availability, prepDestination: before.prep_destination },
      after: body,
    });
  })();
  emitPosEvent({ type: 'catalog.changed' });
  const article = loadPricingCatalog().articles.get(before.id);
  res.json(article);
}));

const pairsSchema = z.object({ pairs: z.array(z.tuple([z.string().min(1), z.string().min(1)])).max(500) });

posCatalogRouter.put('/catalog/incompatibilities', requirePermission('products:manage'), asyncHandler((req, res) => {
  const { pairs } = pairsSchema.parse(req.body);
  const normalized = [...new Map(pairs.filter(([a, b]) => a !== b).map(([a, b]) => (a < b ? [a, b] : [b, a])).map((p) => [p.join('|'), p])).values()];
  db.transaction(() => {
    db.prepare('DELETE FROM catalog_extra_incompatibilities').run();
    const insert = db.prepare('INSERT INTO catalog_extra_incompatibilities (extra_a, extra_b) VALUES (?, ?)');
    normalized.forEach(([a, b]) => insert.run(a, b));
    recordActivity('Produits', 'Incompatibilités', `${normalized.length} paire(s) de suppléments incompatibles`, req.user!.fullName, { userId: req.user!.id, after: normalized });
  })();
  emitPosEvent({ type: 'catalog.changed' });
  res.json({ pairs: normalized });
}));

// --- Réductions & offres ------------------------------------------------------------------------

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure au format HH:MM.');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format AAAA-MM-JJ.');

const discountSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    kind: z.enum(['percent', 'fixed']),
    value: z.number().int().positive(),
    scope: z.enum(['items', 'ticket']),
    articleIds: z.array(z.string()).max(500).default([]),
    categories: z.array(z.string()).max(100).default([]),
    startsOn: date.optional().nullable(),
    endsOn: date.optional().nullable(),
    weekdays: z.array(z.number().int().min(1).max(7)).max(7).default([]),
    startTime: time.optional().nullable(),
    endTime: time.optional().nullable(),
    minTicketMil: z.number().int().min(0).default(0),
    identifiedCustomersOnly: z.boolean().default(false),
    stackable: z.boolean().default(false),
    active: z.boolean().default(true),
  })
  .refine((d) => d.kind !== 'percent' || d.value <= 10_000, { message: 'Un pourcentage ne peut pas dépasser 100 %.', path: ['value'] })
  .refine((d) => !d.startsOn || !d.endsOn || d.startsOn <= d.endsOn, { message: 'La fin doit suivre le début.', path: ['endsOn'] })
  .refine((d) => !d.startTime || !d.endTime || d.startTime < d.endTime, { message: "L'heure de fin doit suivre l'heure de début.", path: ['endTime'] });

const discountParams = (d: z.infer<typeof discountSchema>) => ({
  name: d.name,
  kind: d.kind,
  value: d.value,
  scope: d.scope,
  article_ids: JSON.stringify(d.articleIds),
  categories: JSON.stringify(d.categories),
  starts_on: d.startsOn ?? null,
  ends_on: d.endsOn ?? null,
  weekdays: JSON.stringify([...new Set(d.weekdays)].sort()),
  start_time: d.startTime ?? null,
  end_time: d.endTime ?? null,
  min_ticket_mil: d.minTicketMil,
  identified_only: d.identifiedCustomersOnly ? 1 : 0,
  stackable: d.stackable ? 1 : 0,
  active: d.active ? 1 : 0,
});

posCatalogRouter.get('/discounts', requireAnyPermission('offers:manage', 'pos:sell', 'orders:take'), asyncHandler((_req, res) => {
  // Targeted loyalty offers (customer_ids set) are managed from the loyalty screen.
  const rows = db.prepare('SELECT * FROM discounts WHERE customer_ids IS NULL ORDER BY active DESC, created_at DESC').all() as DiscountRow[];
  res.json(rows.map(rowToDiscount));
}));

posCatalogRouter.post('/discounts', requirePermission('offers:manage'), asyncHandler((req, res) => {
  const body = discountSchema.parse(req.body);
  const id = randomUUID();
  const user = req.user!;
  db.transaction(() => {
    db.prepare(
      `INSERT INTO discounts (id, name, kind, value, scope, article_ids, categories, starts_on, ends_on, weekdays, start_time, end_time,
       min_ticket_mil, identified_only, stackable, active, created_by, created_at)
       VALUES (@id, @name, @kind, @value, @scope, @article_ids, @categories, @starts_on, @ends_on, @weekdays, @start_time, @end_time,
       @min_ticket_mil, @identified_only, @stackable, @active, @created_by, @created_at)`
    ).run({ id, ...discountParams(body), created_by: user.fullName, created_at: new Date().toISOString() });
    recordActivity('Offres', 'Création', `Offre « ${body.name} » créée`, user.fullName, { userId: user.id, entityType: 'discount', entityId: id, after: body });
  })();
  emitPosEvent({ type: 'catalog.changed' });
  res.status(201).json(rowToDiscount(db.prepare('SELECT * FROM discounts WHERE id = ?').get(id) as DiscountRow));
}));

posCatalogRouter.put('/discounts/:id', requirePermission('offers:manage'), asyncHandler((req, res) => {
  const body = discountSchema.parse(req.body);
  const before = db.prepare('SELECT * FROM discounts WHERE id = ? AND customer_ids IS NULL').get(req.params.id) as DiscountRow | undefined;
  if (!before) throw notFound('Offre');
  const user = req.user!;
  db.transaction(() => {
    db.prepare(
      `UPDATE discounts SET name=@name, kind=@kind, value=@value, scope=@scope, article_ids=@article_ids, categories=@categories,
       starts_on=@starts_on, ends_on=@ends_on, weekdays=@weekdays, start_time=@start_time, end_time=@end_time, min_ticket_mil=@min_ticket_mil,
       identified_only=@identified_only, stackable=@stackable, active=@active, updated_by=@updated_by, updated_at=@updated_at WHERE id=@id`
    ).run({ id: before.id, ...discountParams(body), updated_by: user.fullName, updated_at: new Date().toISOString() });
    recordActivity('Offres', 'Modification', `Offre « ${body.name} » modifiée`, user.fullName, {
      userId: user.id,
      entityType: 'discount',
      entityId: before.id,
      before: rowToDiscount(before),
      after: body,
    });
  })();
  emitPosEvent({ type: 'catalog.changed' });
  res.json(rowToDiscount(db.prepare('SELECT * FROM discounts WHERE id = ?').get(before.id) as DiscountRow));
}));

// --- Quote (price preview for any cart) --------------------------------------------------------

export const cartLineSchema = z.object({
  articleId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
  variantId: z.string().optional(),
  extraIds: z.array(z.string()).max(20).optional(),
  instruction: z.string().trim().max(200).optional(),
});

export const manualDiscountSchema = z.object({
  kind: z.enum(['percent', 'fixed']),
  value: z.number().int().positive(),
  reason: z.string().trim().max(120).optional(),
});

// Manual discounts require pos:discount and stay under the configured ceiling (% of the ticket).
export const assertManualDiscountAllowed = (
  user: NonNullable<Express.Request['user']>,
  manual: z.infer<typeof manualDiscountSchema> | null | undefined,
  subtotalMil: number,
  appliedMil: number
): void => {
  if (!manual) return;
  if (!user.isSuperAdmin && !user.permissions.includes('pos:discount')) throw new ApiError(403, "Vous n'avez pas la permission d'appliquer une remise.");
  if (!manual.reason?.trim()) throw new ApiError(400, 'Une remise manuelle doit avoir un motif.');
  const capPercent = Number(getPosSetting('manual_discount_max_percent', String(POS_SETTING_DEFAULTS.manualDiscountMaxPercent)));
  if (subtotalMil > 0 && appliedMil > Math.round((subtotalMil * capPercent) / 100)) {
    throw new ApiError(403, `La remise dépasse le plafond autorisé (${capPercent} % du ticket).`);
  }
};

posCatalogRouter.post('/quote', requireAnyPermission('pos:sell', 'orders:take'), asyncHandler((req, res) => {
  const body = z
    .object({ lines: z.array(cartLineSchema).max(100), customerId: z.string().nullable().optional(), manualDiscount: manualDiscountSchema.nullable().optional() })
    .parse(req.body);
  try {
    const cart = computeCart(body.lines, loadPricingCatalog(), loadActiveDiscountRules(), {
      now: new Date(),
      customerId: body.customerId ?? null,
      manualDiscount: body.manualDiscount ?? null,
    });
    res.json(cart);
  } catch (err) {
    if (err instanceof PricingError) throw new ApiError(400, err.message);
    throw err;
  }
}));

// --- Settings -------------------------------------------------------------------------------------

export const readPosSettings = (): PosSettings => ({
  manualDiscountMaxPercent: Number(getPosSetting('manual_discount_max_percent', String(POS_SETTING_DEFAULTS.manualDiscountMaxPercent))),
  consumptionZone: getPosSetting('consumption_zone', POS_SETTING_DEFAULTS.consumptionZone) as PosSettings['consumptionZone'],
  googleReviewUrl: getPosSetting('google_review_url', POS_SETTING_DEFAULTS.googleReviewUrl),
  reservationDurationMinutes: Number(getPosSetting('reservation_duration_minutes', String(POS_SETTING_DEFAULTS.reservationDurationMinutes))),
  reservationMaxPeople: Number(getPosSetting('reservation_max_people', String(POS_SETTING_DEFAULTS.reservationMaxPeople))),
  openingTime: getPosSetting('opening_time', POS_SETTING_DEFAULTS.openingTime),
  closingTime: getPosSetting('closing_time', POS_SETTING_DEFAULTS.closingTime),
  publicAppUrl: getPosSetting('public_app_url', POS_SETTING_DEFAULTS.publicAppUrl),
  idleLogoutMinutes: Number(getPosSetting('idle_logout_minutes', String(POS_SETTING_DEFAULTS.idleLogoutMinutes))),
  legalName: getPosSetting('legal_name', POS_SETTING_DEFAULTS.legalName),
  address: getPosSetting('legal_address', POS_SETTING_DEFAULTS.address),
  phone: getPosSetting('legal_phone', POS_SETTING_DEFAULTS.phone),
  website: getPosSetting('legal_website', POS_SETTING_DEFAULTS.website),
  taxId: getPosSetting('legal_tax_id', POS_SETTING_DEFAULTS.taxId),
  tradeRegister: getPosSetting('legal_trade_register', POS_SETTING_DEFAULTS.tradeRegister),
  receiptThanks: getPosSetting('receipt_thanks', POS_SETTING_DEFAULTS.receiptThanks),
  openingHoursText: getPosSetting('opening_hours_text', POS_SETTING_DEFAULTS.openingHoursText),
  autoPrintReceipt: getPosSetting('auto_print_receipt', POS_SETTING_DEFAULTS.autoPrintReceipt ? '1' : '0') === '1',
  releaseTableAfterPayment: getPosSetting('release_table_after_payment', POS_SETTING_DEFAULTS.releaseTableAfterPayment ? '1' : '0') === '1',
  returnToPlanAfterSend: getPosSetting('return_to_plan_after_send', POS_SETTING_DEFAULTS.returnToPlanAfterSend ? '1' : '0') === '1',
  counterNextSaleSeconds: Number(getPosSetting('counter_next_sale_seconds', String(POS_SETTING_DEFAULTS.counterNextSaleSeconds))),
});

/** Identity printed on customer documents. */
export const receiptIdentity = () => {
  const s = readPosSettings();
  return { name: s.legalName, address: s.address, phone: s.phone, website: s.website, taxId: s.taxId, tradeRegister: s.tradeRegister, thanks: s.receiptThanks, openingHours: s.openingHoursText };
};

const settingsSchema = z.object({
  manualDiscountMaxPercent: z.number().int().min(0).max(100),
  consumptionZone: z.enum(['Réserve principale', 'Dépôt']),
  googleReviewUrl: z.union([z.literal(''), z.string().url().max(500)]),
  reservationDurationMinutes: z.number().int().min(15).max(480),
  reservationMaxPeople: z.number().int().min(1).max(100),
  openingTime: time,
  closingTime: time,
  publicAppUrl: z.union([z.literal(''), z.string().url().max(200)]),
  idleLogoutMinutes: z.number().int().min(0).max(720).default(0),
  legalName: z.string().trim().min(1).max(80).default(POS_SETTING_DEFAULTS.legalName),
  address: z.string().trim().max(160).default(''),
  phone: z.union([z.literal(''), z.string().trim().regex(/^\+?[0-9 ]{8,16}$/, 'Téléphone : chiffres uniquement, ex. +216 71 000 000')]).default(''),
  website: z.string().trim().max(80).default(''),
  taxId: z.string().trim().max(40).default(''),
  tradeRegister: z.string().trim().max(40).default(''),
  receiptThanks: z.string().trim().max(80).default(POS_SETTING_DEFAULTS.receiptThanks),
  openingHoursText: z.string().trim().max(120).default(''),
  autoPrintReceipt: z.boolean().default(false),
  releaseTableAfterPayment: z.boolean().default(false),
  returnToPlanAfterSend: z.boolean().default(true),
  counterNextSaleSeconds: z.number().int().min(0).max(30).default(4),
});

posCatalogRouter.get('/settings', requireAnyPermission('pos:settings', 'pos:sell', 'orders:take', 'reservations:view'), asyncHandler((_req, res) => {
  res.json(readPosSettings());
}));

posCatalogRouter.put('/settings', requirePermission('pos:settings'), asyncHandler((req, res) => {
  const body = settingsSchema.parse(req.body);
  const user = req.user!;
  const before = readPosSettings();
  db.transaction(() => {
    setPosSetting('manual_discount_max_percent', String(body.manualDiscountMaxPercent), user.fullName);
    setPosSetting('consumption_zone', body.consumptionZone, user.fullName);
    setPosSetting('google_review_url', body.googleReviewUrl, user.fullName);
    setPosSetting('reservation_duration_minutes', String(body.reservationDurationMinutes), user.fullName);
    setPosSetting('reservation_max_people', String(body.reservationMaxPeople), user.fullName);
    setPosSetting('opening_time', body.openingTime, user.fullName);
    setPosSetting('closing_time', body.closingTime, user.fullName);
    setPosSetting('public_app_url', body.publicAppUrl.replace(/\/$/, ''), user.fullName);
    setPosSetting('idle_logout_minutes', String(body.idleLogoutMinutes), user.fullName);
    setPosSetting('legal_name', body.legalName, user.fullName);
    setPosSetting('legal_address', body.address, user.fullName);
    setPosSetting('legal_phone', body.phone, user.fullName);
    setPosSetting('legal_website', body.website, user.fullName);
    setPosSetting('legal_tax_id', body.taxId, user.fullName);
    setPosSetting('legal_trade_register', body.tradeRegister, user.fullName);
    setPosSetting('receipt_thanks', body.receiptThanks, user.fullName);
    setPosSetting('opening_hours_text', body.openingHoursText, user.fullName);
    setPosSetting('auto_print_receipt', body.autoPrintReceipt ? '1' : '0', user.fullName);
    setPosSetting('release_table_after_payment', body.releaseTableAfterPayment ? '1' : '0', user.fullName);
    setPosSetting('return_to_plan_after_send', body.returnToPlanAfterSend ? '1' : '0', user.fullName);
    setPosSetting('counter_next_sale_seconds', String(body.counterNextSaleSeconds), user.fullName);
    recordActivity('Caisse', 'Paramètres', 'Paramètres de la caisse modifiés', user.fullName, { userId: user.id, before, after: body });
  })();
  res.json(readPosSettings());
}));

// --- Variant consumption (§8.2, §14.2) -------------------------------------------------------------

// Extra ingredients consumed by a variant (e.g. "Grand": +8 g café, +50 ml lait). A product using
// its category's variant group gets its own copy of that group (same ids and prices) when edited.
const variantsForEdit = (articleId: string) => {
  const row = db.prepare('SELECT id, name, category, variants FROM catalog_articles WHERE id = ?').get(articleId) as
    | { id: string; name: string; category: string; variants: string | null }
    | undefined;
  if (!row) throw notFound('Produit');
  const own = row.variants ? (JSON.parse(row.variants) as VariantOption[]) : [];
  const variants = own.length > 0 ? own : (getVariantGroupForCategory(row.category)?.options ?? []);
  return { row, variants };
};

posCatalogRouter.get('/catalog/articles/:id/variant-recipes', requirePermission('products:manage'), asyncHandler((req, res) => {
  const { variants } = variantsForEdit(req.params.id);
  const ingredients = db.prepare('SELECT id, name, unit FROM stock_products ORDER BY name').all();
  const units = (db.prepare('SELECT name FROM stock_units ORDER BY name').all() as { name: string }[]).map((u) => u.name);
  res.json({ variants: variants.map((v) => ({ id: v.id, label: v.label, recipe: v.recipe ?? [] })), ingredients, units });
}));

const variantRecipeSchema = z.object({
  variants: z.array(
    z.object({
      id: z.string().min(1),
      recipe: z.array(z.object({ ingredientId: z.string().min(1), quantity: z.number().positive().max(100_000), unit: z.string().min(1).max(20) })).max(30),
    })
  ),
});

posCatalogRouter.put('/catalog/articles/:id/variant-recipes', requirePermission('products:manage'), asyncHandler((req, res) => {
  const body = variantRecipeSchema.parse(req.body);
  const { row, variants } = variantsForEdit(req.params.id);
  if (variants.length === 0) throw new ApiError(400, "Ce produit n'a pas de variante.");
  const updated: VariantOption[] = variants.map((v) => {
    const edit = body.variants.find((e) => e.id === v.id);
    if (!edit) return v;
    return { ...v, recipe: edit.recipe.map((l) => ({ id: randomUUID(), kind: 'ingredient' as const, ingredientId: l.ingredientId, quantity: l.quantity, unit: l.unit })) };
  });
  db.transaction(() => {
    db.prepare('UPDATE catalog_articles SET variants = ? WHERE id = ?').run(JSON.stringify(updated), row.id);
    recordActivity('Produits', 'Consommation des variantes', row.name, req.user!.fullName, { userId: req.user!.id, entityType: 'catalog_article', entityId: row.id, before: variants, after: updated });
  })();
  res.json({ variants: updated.map((v) => ({ id: v.id, label: v.label, recipe: v.recipe ?? [] })) });
}));

// Session policy for every signed-in screen (shared devices: automatic sign-out, §18.1).
posCatalogRouter.get('/session-policy', asyncHandler((_req, res) => {
  res.json({ idleLogoutMinutes: readPosSettings().idleLogoutMinutes });
}));
