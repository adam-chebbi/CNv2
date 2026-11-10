import { db } from '../db/connection.js';
import { fromJson } from '../db/json.js';
import { toMillimes } from '../../src/data/money.js';
import {
  getArticleTtcPrice,
  getArticleVatRate,
  getVariantGroupForCategory,
  type RecipeLine,
  type VariantOption,
} from '../../src/data/manualSalesCatalog.js';
import type { Availability, DiscountRule, PrepDestination, PricedArticle, PricingCatalog } from '../../src/data/pricing.js';

// Builds the pricing engine's view of the catalogue from the V1 tables (catalog_articles,
// catalog_extras) plus the point-of-sale columns. Read fresh for every priced request: a price or
// availability change applies to the very next cart, never to an already validated order.

interface ArticleRow {
  id: string;
  name: string;
  category: string;
  sub_category: string | null;
  price: number;
  description: string | null;
  image_url: string | null;
  extra_ids: string | null;
  variants: string | null;
  vat_rate: number | null;
  price_includes_tax: number | null;
  availability: string;
  prep_destination: string | null;
  prep_target_minutes: number | null;
}

interface ExtraRow {
  id: string;
  name: string;
  price: number;
}

// Drinks go to the bar, food to the kitchen, retail goods are handed over directly. Used when a
// product has no explicit destination; the direction can override it per product.
const BAR_CATEGORY_HINTS = ['café', 'cafe', 'boisson', 'thé', 'the', 'jus', 'soda', 'glac', 'lact', 'smoothie', 'cocktail', 'chocolat'];
const KITCHEN_CATEGORY_HINTS = ['pâtisserie', 'patisserie', 'snack', 'salé', 'sale', 'brunch', 'plat', 'sandwich', 'crêpe', 'crepe', 'gaufre', 'dessert', 'viennoiserie', 'petit-déjeuner'];

export const defaultPrepDestination = (category: string): PrepDestination => {
  const c = category.toLowerCase();
  if (KITCHEN_CATEGORY_HINTS.some((h) => c.includes(h))) return 'kitchen';
  if (BAR_CATEGORY_HINTS.some((h) => c.includes(h))) return 'bar';
  return 'none';
};

const asAvailability = (value: string): Availability => (value === 'unavailable' || value === 'hidden' ? value : 'available');
const asDestination = (value: string | null, category: string): PrepDestination =>
  value === 'kitchen' || value === 'bar' || value === 'none' ? value : defaultPrepDestination(category);

// Per-product variants win; otherwise the category's variant group (V1 behaviour).
const variantsOf = (row: ArticleRow): { label?: string; options: VariantOption[] } => {
  const own = row.variants ? fromJson<VariantOption[]>(row.variants, []) : [];
  if (own.length > 0) return { label: 'Variante', options: own };
  const group = getVariantGroupForCategory(row.category);
  return group ? { label: group.label, options: group.options } : { options: [] };
};

// Photos uploaded from the product form are stored as data URLs; screens get a short cached URL
// instead (the version changes with the photo), so the catalogue stays light on tablets.
export const imageUrlOf = (id: string, stored: string | null): string | undefined => {
  if (!stored) return undefined;
  if (!stored.startsWith('data:')) return stored;
  return `/api/client/images/${id}?v=${stored.length.toString(36)}${stored.slice(-8).replace(/[^a-zA-Z0-9]/g, '')}`;
};

export const toPricedArticle = (row: ArticleRow): PricedArticle => {
  const variants = variantsOf(row);
  const vatInput = { price: row.price, vatRate: row.vat_rate ?? undefined, priceIncludesTax: row.price_includes_tax === null ? undefined : row.price_includes_tax === 1 };
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    subCategory: row.sub_category ?? undefined,
    description: row.description ?? undefined,
    imageUrl: imageUrlOf(row.id, row.image_url),
    unitPriceMil: toMillimes(getArticleTtcPrice(vatInput)),
    vatRate: getArticleVatRate(vatInput),
    availability: asAvailability(row.availability),
    prepDestination: asDestination(row.prep_destination, row.category),
    variantLabel: variants.label,
    variants: variants.options.map((v) => ({ id: v.id, label: v.label, deltaMil: toMillimes(v.priceDelta ?? 0) })),
    extraIds: row.extra_ids ? fromJson<string[]>(row.extra_ids, []) : [],
    prepTargetMinutes: row.prep_target_minutes ?? undefined,
  };
};

const ARTICLE_COLUMNS = `id, name, category, sub_category, price, description, image_url, extra_ids, variants, vat_rate,
  price_includes_tax, availability, prep_destination, prep_target_minutes`;

export const loadPricingCatalog = (): PricingCatalog => {
  const articles = (db.prepare(`SELECT ${ARTICLE_COLUMNS} FROM catalog_articles ORDER BY created_at ASC, rowid ASC`).all() as ArticleRow[]).map(toPricedArticle);
  const extras = db.prepare('SELECT id, name, price FROM catalog_extras ORDER BY rowid ASC').all() as ExtraRow[];
  const pairs = db.prepare('SELECT extra_a, extra_b FROM catalog_extra_incompatibilities').all() as { extra_a: string; extra_b: string }[];
  return {
    articles: new Map(articles.map((a) => [a.id, a])),
    extras: new Map(extras.map((e) => [e.id, { id: e.id, name: e.name, priceMil: toMillimes(e.price) }])),
    incompatibleExtras: pairs.map((p) => [p.extra_a, p.extra_b]),
  };
};

// Recipes are needed only for stock consumption, never for pricing — loaded separately.
export const loadVariantRecipe = (articleId: string, variantId: string | undefined): RecipeLine[] => {
  if (!variantId) return [];
  const row = db.prepare('SELECT variants FROM catalog_articles WHERE id = ?').get(articleId) as { variants: string | null } | undefined;
  const variants = row?.variants ? fromJson<VariantOption[]>(row.variants, []) : [];
  return variants.find((v) => v.id === variantId)?.recipe ?? [];
};

// --- Discounts --------------------------------------------------------------------------------

export interface DiscountRow {
  id: string;
  name: string;
  kind: 'percent' | 'fixed';
  value: number;
  scope: 'items' | 'ticket';
  article_ids: string;
  categories: string;
  starts_on: string | null;
  ends_on: string | null;
  weekdays: string;
  start_time: string | null;
  end_time: string | null;
  min_ticket_mil: number;
  identified_only: number;
  customer_ids: string | null;
  stackable: number;
  active: number;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
}

export const rowToDiscount = (r: DiscountRow): DiscountRule & { createdAt: string; createdBy: string; updatedAt?: string; updatedBy?: string } => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  value: r.value,
  scope: r.scope,
  articleIds: fromJson<string[]>(r.article_ids, []),
  categories: fromJson<string[]>(r.categories, []),
  startsOn: r.starts_on ?? undefined,
  endsOn: r.ends_on ?? undefined,
  weekdays: fromJson<number[]>(r.weekdays, []),
  startTime: r.start_time ?? undefined,
  endTime: r.end_time ?? undefined,
  minTicketMil: r.min_ticket_mil,
  identifiedCustomersOnly: r.identified_only === 1,
  customerIds: r.customer_ids ? fromJson<string[]>(r.customer_ids, []) : undefined,
  stackable: r.stackable === 1,
  active: r.active === 1,
  createdAt: r.created_at,
  createdBy: r.created_by,
  updatedAt: r.updated_at ?? undefined,
  updatedBy: r.updated_by ?? undefined,
});

export const loadActiveDiscountRules = (): DiscountRule[] =>
  (db.prepare('SELECT * FROM discounts WHERE active = 1').all() as DiscountRow[]).map(rowToDiscount);

// --- Point-of-sale settings ---------------------------------------------------------------------

export const getPosSetting = (key: string, fallback: string): string => {
  const row = db.prepare('SELECT value FROM pos_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
};

export const setPosSetting = (key: string, value: string, by: string): void => {
  db.prepare(
    `INSERT INTO pos_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
  ).run(key, value, new Date().toISOString(), by);
};
