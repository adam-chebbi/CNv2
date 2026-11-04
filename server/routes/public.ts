import { Router, type RequestHandler } from 'express';
import { db } from '../db/connection.js';
import { fromJson, fromBool } from '../db/json.js';
import { readShowcaseInfo } from '../lib/showcaseInfo.js';
import { toPublicShowcaseSiteInfo } from '../../src/data/showcaseSettingsModel.js';

// Public, read-only, unauthenticated product catalog — the one slice of this app's data meant to
// be fetched directly by a future public storefront ("vitrine"), possibly on a different domain
// and built by a different developer. Never mounted behind requireAuth, and never returns
// anything beyond what a storefront needs: no cost/recipe/margin data, no business-internal
// fields, and unavailable products are excluded entirely.
//
// See PUBLIC_PRODUCTS_API.md at the repo root for the field-by-field contract a freelancer
// building the storefront should follow.
export const publicRouter = Router();

// CORS is intentionally wide open here (GET-only, no cookies/credentials involved, no secrets in
// the payload) so a storefront hosted on any other domain can call this endpoint directly.
export const openCors: RequestHandler = (_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  next();
};
publicRouter.use(openCors);

interface CategoryRow {
  id: string;
  name: string;
}
interface SubCategoryRow {
  id: string;
  category_id: string;
  name: string;
}
interface ExtraRow {
  id: string;
  name: string;
  price: number;
}
interface ArticleRow {
  id: string;
  name: string;
  category: string;
  sub_category: string | null;
  price: number;
  description: string | null;
  image_url: string | null;
  is_available: number | null;
  extra_ids: string | null;
  variants: string | null;
}

// Served at both GET /api/public/products and GET /api/products (mounted in server/index.ts).
export const listPublicProducts: RequestHandler = (_req, res) => {
  // Order = the order the source keeps them in. created_at is a plain date, so rows created the same
  // day tie: rowid (insertion order) makes that order stable instead of left to the query planner.
  const categories = db.prepare('SELECT id, name FROM product_categories ORDER BY created_at ASC, rowid ASC').all() as CategoryRow[];
  const subCategories = db
    .prepare('SELECT id, category_id, name FROM product_subcategories ORDER BY created_at ASC, rowid ASC')
    .all() as SubCategoryRow[];
  const extras = db.prepare('SELECT id, name, price FROM catalog_extras ORDER BY rowid ASC').all() as ExtraRow[];
  const articleRows = db
    .prepare(
      `SELECT id, name, category, sub_category, price, description, image_url, is_available, extra_ids, variants
       FROM catalog_articles ORDER BY created_at ASC, rowid ASC`
    )
    .all() as ArticleRow[];

  const products = articleRows
    // is_available is NULL for every article that never had its availability toggled — treated
    // as available by the rest of the app, so only an explicit `false` excludes it here too.
    .filter((r) => fromBool(r.is_available) !== false)
    .map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      subCategory: r.sub_category,
      price: r.price,
      description: r.description,
      imageUrl: r.image_url,
      extraIds: r.extra_ids ? fromJson<string[]>(r.extra_ids, []) : [],
      variants: r.variants ? fromJson<{ id: string; label: string; priceDelta?: number }[]>(r.variants, []) : [],
    }));

  // 'no-cache' = a copy may be kept but must be revalidated (ETag) every time, so a change made in
  // the system reaches the public menu on its next refresh.
  res.set('Cache-Control', 'no-cache');
  res.json({
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    subCategories: subCategories.map((s) => ({ id: s.id, categoryId: s.category_id, name: s.name })),
    extras: extras.map((e) => ({ id: e.id, name: e.name, price: e.price })),
    products,
  });
};

publicRouter.get('/products', listPublicProducts);

// Content of the public site (contact details, hours, social links, Google map), managed from the
// management app's Paramètres → "Site vitrine". Links without an address are not published.
// Read-only and unauthenticated like the catalogue; never returns anything but that record.
publicRouter.get('/site-info', (_req, res) => {
  const { info, updatedAt } = readShowcaseInfo();
  res.set('Cache-Control', 'no-cache');
  res.json({ ...toPublicShowcaseSiteInfo(info), updatedAt });
});
