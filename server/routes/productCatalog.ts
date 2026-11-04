import { todayIso } from '../../src/data/dateUtils.js';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { fromJson, toJson, toBool, fromBool } from '../db/json.js';
import { asyncHandler, ApiError, notFound } from '../middleware/errors.js';
import { requireAuth, requirePermission, requireAnyPermission } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';
import type { ProductCategory, ProductSubCategory } from '../../src/data/productsModel.js';
import { getCategoryUsageCount, getSubCategoryUsageCount, getSubRecipeUsageCount, detectCircularReference, type SubRecipe } from '../../src/data/productsModel.js';
import type { CatalogArticle, CatalogExtra, RecipeLine, VariantOption } from '../../src/data/manualSalesCatalog.js';

const nowIso = () => todayIso();

// --- Row <-> entity mappers ------------------------------------------------------------------

interface CategoryRow { id: string; name: string; created_at: string }
const rowToCategory = (r: CategoryRow): ProductCategory => ({ id: r.id, name: r.name, createdAt: r.created_at });

interface SubCategoryRow { id: string; category_id: string; name: string; created_at: string }
const rowToSubCategory = (r: SubCategoryRow): ProductSubCategory => ({ id: r.id, categoryId: r.category_id, name: r.name, createdAt: r.created_at });

interface ExtraRow { id: string; name: string; price: number; recipe: string | null }
const rowToExtra = (r: ExtraRow): CatalogExtra => ({
  id: r.id,
  name: r.name,
  price: r.price,
  recipe: r.recipe ? fromJson<RecipeLine[]>(r.recipe, []) : undefined,
});

interface ArticleRow {
  id: string; name: string; category: string; sub_category: string | null; price: number;
  description: string | null; image_url: string | null; is_available: number | null;
  extra_ids: string | null; variants: string | null; recipe: string | null;
  target_margin_rate: number | null; vat_rate: number | null; price_includes_tax: number | null;
  created_at: string | null;
}
const rowToArticle = (r: ArticleRow): CatalogArticle => ({
  id: r.id,
  name: r.name,
  category: r.category as CatalogArticle['category'],
  subCategory: r.sub_category ?? undefined,
  price: r.price,
  description: r.description ?? undefined,
  imageUrl: r.image_url ?? undefined,
  isAvailable: fromBool(r.is_available),
  extraIds: r.extra_ids ? fromJson<string[]>(r.extra_ids, []) : undefined,
  variants: r.variants ? fromJson<VariantOption[]>(r.variants, []) : undefined,
  recipe: r.recipe ? fromJson<RecipeLine[]>(r.recipe, []) : undefined,
  targetMarginRate: r.target_margin_rate ?? undefined,
  vatRate: r.vat_rate ?? undefined,
  priceIncludesTax: fromBool(r.price_includes_tax),
  createdAt: r.created_at ?? undefined,
});

interface SubRecipeRow { id: string; name: string; description: string | null; yield_quantity: number; yield_unit: string; ingredients: string; created_at: string }
const rowToSubRecipe = (r: SubRecipeRow): SubRecipe => ({
  id: r.id,
  name: r.name,
  description: r.description ?? undefined,
  yieldQuantity: r.yield_quantity,
  yieldUnit: r.yield_unit,
  ingredients: fromJson<RecipeLine[]>(r.ingredients, []),
  createdAt: r.created_at,
});

// Reused by sales.ts to resolve a sold item's recipe (ingredients / sub-recipes / composed
// products) for automatic stock deduction — the same row data the catalog routes themselves read.
export const getAllArticlesRaw = (): CatalogArticle[] => (db.prepare('SELECT * FROM catalog_articles').all() as ArticleRow[]).map(rowToArticle);
export const getAllSubRecipesRaw = (): SubRecipe[] =>
  (db.prepare('SELECT * FROM sub_recipes ORDER BY created_at ASC').all() as SubRecipeRow[]).map(rowToSubRecipe);
export const getAllExtrasRaw = (): CatalogExtra[] => (db.prepare('SELECT * FROM catalog_extras ORDER BY rowid ASC').all() as ExtraRow[]).map(rowToExtra);

export const productCatalogRouter = Router();
productCatalogRouter.use(requireAuth);

// --- Categories --------------------------------------------------------------------------------

const categorySchema = z.object({ name: z.string().trim().min(1) });

productCatalogRouter.get(
  '/product-categories',
  requireAnyPermission('products:view', 'products:manage', 'sales:create', 'sales:view', 'stock:inventory', 'stock:manage', 'purchases:create', 'purchases:edit'),
  asyncHandler((_req, res) => {
    const rows = db.prepare('SELECT * FROM product_categories ORDER BY created_at ASC').all() as CategoryRow[];
    res.json(rows.map(rowToCategory));
  })
);

productCatalogRouter.post(
  '/product-categories',
  requirePermission('products:manage'),
  asyncHandler((req, res) => {
    const body = categorySchema.parse(req.body);
    const row: CategoryRow = { id: randomUUID(), name: body.name, created_at: nowIso() };
    db.prepare('INSERT INTO product_categories (id, name, created_at) VALUES (?, ?, ?)').run(row.id, row.name, row.created_at);
    recordActivity('Catalogue', 'Création', `Catégorie créée — ${row.name}`, req.user!.fullName);
    res.status(201).json(rowToCategory(row));
  })
);

productCatalogRouter.put(
  '/product-categories/:id',
  requirePermission('products:manage'),
  asyncHandler((req, res) => {
    const body = categorySchema.parse(req.body);
    const existing = db.prepare('SELECT * FROM product_categories WHERE id = ?').get(req.params.id) as CategoryRow | undefined;
    if (!existing) throw notFound('Catégorie');
    db.prepare('UPDATE product_categories SET name = ? WHERE id = ?').run(body.name, req.params.id);
    db.prepare('UPDATE catalog_articles SET category = ? WHERE category = ?').run(body.name, existing.name);
    recordActivity('Catalogue', 'Modification', `Catégorie renommée — ${existing.name} → ${body.name}`, req.user!.fullName);
    res.json(rowToCategory({ ...existing, name: body.name }));
  })
);

productCatalogRouter.delete(
  '/product-categories/:id',
  requirePermission('products:manage'),
  asyncHandler((req, res) => {
    const existing = db.prepare('SELECT * FROM product_categories WHERE id = ?').get(req.params.id) as CategoryRow | undefined;
    if (!existing) throw notFound('Catégorie');
    const articles = (db.prepare('SELECT * FROM catalog_articles').all() as ArticleRow[]).map(rowToArticle);
    if (getCategoryUsageCount(rowToCategory(existing), articles) > 0) {
      throw new ApiError(409, 'Cette catégorie est utilisée par des produits et ne peut pas être supprimée.');
    }
    db.prepare('DELETE FROM product_categories WHERE id = ?').run(req.params.id);
    recordActivity('Catalogue', 'Suppression', `Catégorie supprimée — ${existing.name}`, req.user!.fullName);
    res.status(204).end();
  })
);

// --- Subcategories -------------------------------------------------------------------------------

const subCategorySchema = z.object({ categoryId: z.string().min(1), name: z.string().trim().min(1) });

productCatalogRouter.get(
  '/product-subcategories',
  requireAnyPermission('products:view', 'products:manage', 'sales:create', 'sales:view', 'stock:inventory', 'stock:manage', 'purchases:create', 'purchases:edit'),
  asyncHandler((_req, res) => {
    const rows = db.prepare('SELECT * FROM product_subcategories ORDER BY created_at ASC').all() as SubCategoryRow[];
    res.json(rows.map(rowToSubCategory));
  })
);

productCatalogRouter.post(
  '/product-subcategories',
  requirePermission('products:manage'),
  asyncHandler((req, res) => {
    const body = subCategorySchema.parse(req.body);
    const category = db.prepare('SELECT * FROM product_categories WHERE id = ?').get(body.categoryId) as CategoryRow | undefined;
    if (!category) throw new ApiError(400, 'Catégorie invalide.');
    const row: SubCategoryRow = { id: randomUUID(), category_id: body.categoryId, name: body.name, created_at: nowIso() };
    db.prepare('INSERT INTO product_subcategories (id, category_id, name, created_at) VALUES (?, ?, ?, ?)').run(row.id, row.category_id, row.name, row.created_at);
    recordActivity('Catalogue', 'Création', `Sous-catégorie créée — ${row.name}`, req.user!.fullName);
    res.status(201).json(rowToSubCategory(row));
  })
);

productCatalogRouter.put(
  '/product-subcategories/:id',
  requirePermission('products:manage'),
  asyncHandler((req, res) => {
    const body = subCategorySchema.parse(req.body);
    const existing = db.prepare('SELECT * FROM product_subcategories WHERE id = ?').get(req.params.id) as SubCategoryRow | undefined;
    if (!existing) throw notFound('Sous-catégorie');
    db.prepare('UPDATE product_subcategories SET name = ?, category_id = ? WHERE id = ?').run(body.name, body.categoryId, req.params.id);
    db.prepare('UPDATE catalog_articles SET sub_category = ? WHERE sub_category = ?').run(body.name, existing.name);
    recordActivity('Catalogue', 'Modification', `Sous-catégorie renommée — ${existing.name} → ${body.name}`, req.user!.fullName);
    res.json(rowToSubCategory({ ...existing, name: body.name, category_id: body.categoryId }));
  })
);

productCatalogRouter.delete(
  '/product-subcategories/:id',
  requirePermission('products:manage'),
  asyncHandler((req, res) => {
    const existing = db.prepare('SELECT * FROM product_subcategories WHERE id = ?').get(req.params.id) as SubCategoryRow | undefined;
    if (!existing) throw notFound('Sous-catégorie');
    const articles = (db.prepare('SELECT * FROM catalog_articles').all() as ArticleRow[]).map(rowToArticle);
    if (getSubCategoryUsageCount(rowToSubCategory(existing), articles) > 0) {
      throw new ApiError(409, 'Cette sous-catégorie est utilisée par des produits et ne peut pas être supprimée.');
    }
    db.prepare('DELETE FROM product_subcategories WHERE id = ?').run(req.params.id);
    recordActivity('Catalogue', 'Suppression', `Sous-catégorie supprimée — ${existing.name}`, req.user!.fullName);
    res.status(204).end();
  })
);

// --- Extras ----------------------------------------------------------------------------------

// Shared with articleSchema below — defined here since extras need it first.
const recipeLineSchema = z.object({
  id: z.string(),
  kind: z.enum(['ingredient', 'subrecipe', 'product']),
  ingredientId: z.string().optional(),
  subRecipeId: z.string().optional(),
  productId: z.string().optional(),
  quantity: z.number(),
  unit: z.string(),
});

const extraSchema = z.object({ name: z.string().trim().min(1), price: z.number().min(0), recipe: z.array(recipeLineSchema).optional() });

productCatalogRouter.get(
  '/catalog-extras',
  requireAnyPermission('products:view', 'products:manage', 'sales:create', 'sales:view', 'stock:inventory', 'stock:manage', 'purchases:create', 'purchases:edit'),
  asyncHandler((_req, res) => {
    const rows = db.prepare('SELECT * FROM catalog_extras ORDER BY rowid ASC').all() as ExtraRow[];
    res.json(rows.map(rowToExtra));
  })
);

productCatalogRouter.post(
  '/catalog-extras',
  requirePermission('products:manage'),
  asyncHandler((req, res) => {
    const body = extraSchema.parse(req.body);
    const row: ExtraRow = { id: randomUUID(), name: body.name, price: body.price, recipe: body.recipe ? toJson(body.recipe) : null };
    db.prepare('INSERT INTO catalog_extras (id, name, price, recipe) VALUES (?, ?, ?, ?)').run(row.id, row.name, row.price, row.recipe);
    recordActivity('Produits', 'Création', `Extra créé — ${row.name}`, req.user!.fullName);
    res.status(201).json(rowToExtra(row));
  })
);

productCatalogRouter.put(
  '/catalog-extras/:id',
  requirePermission('products:manage'),
  asyncHandler((req, res) => {
    const body = extraSchema.parse(req.body);
    const existing = db.prepare('SELECT * FROM catalog_extras WHERE id = ?').get(req.params.id) as ExtraRow | undefined;
    if (!existing) throw notFound('Extra');
    const recipe = body.recipe ? toJson(body.recipe) : null;
    db.prepare('UPDATE catalog_extras SET name = ?, price = ?, recipe = ? WHERE id = ?').run(body.name, body.price, recipe, req.params.id);
    recordActivity('Produits', 'Modification', `Extra modifié — ${existing.name} → ${body.name}`, req.user!.fullName);
    res.json(rowToExtra({ id: req.params.id, name: body.name, price: body.price, recipe }));
  })
);

productCatalogRouter.delete(
  '/catalog-extras/:id',
  requirePermission('products:manage'),
  asyncHandler((req, res) => {
    const existing = db.prepare('SELECT * FROM catalog_extras WHERE id = ?').get(req.params.id) as ExtraRow | undefined;
    if (!existing) throw notFound('Extra');
    // extra_ids is a JSON array embedded per article — no SQL foreign key can guard it, so usage
    // is checked here by scanning every article's own extra_ids list.
    const articleRows = db.prepare('SELECT extra_ids FROM catalog_articles').all() as { extra_ids: string | null }[];
    const inUse = articleRows.some((r) => (r.extra_ids ? fromJson<string[]>(r.extra_ids, []) : []).includes(req.params.id));
    if (inUse) throw new ApiError(409, 'Cet extra est utilisé par au moins un produit et ne peut pas être supprimé.');
    db.prepare('DELETE FROM catalog_extras WHERE id = ?').run(req.params.id);
    recordActivity('Produits', 'Suppression', `Extra supprimé — ${existing.name}`, req.user!.fullName);
    res.status(204).end();
  })
);

// --- Articles (products) ------------------------------------------------------------------------

const variantSchema = z.object({ id: z.string(), label: z.string(), priceDelta: z.number().optional() });

const articleSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1),
  category: z.string().min(1),
  subCategory: z.string().optional(),
  price: z.number().gt(0),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  isAvailable: z.boolean().optional(),
  extraIds: z.array(z.string()).optional(),
  variants: z.array(variantSchema).optional(),
  recipe: z.array(recipeLineSchema).optional(),
  targetMarginRate: z.number().min(0).max(1).optional(),
  vatRate: z.number().min(0).max(1).optional(),
  priceIncludesTax: z.boolean().optional(),
});

const articleToRow = (a: CatalogArticle): ArticleRow => ({
  id: a.id,
  name: a.name,
  category: a.category,
  sub_category: a.subCategory ?? null,
  price: a.price,
  description: a.description ?? null,
  image_url: a.imageUrl ?? null,
  is_available: toBool(a.isAvailable),
  extra_ids: toJson(a.extraIds),
  variants: toJson(a.variants),
  recipe: toJson(a.recipe),
  target_margin_rate: a.targetMarginRate ?? null,
  vat_rate: a.vatRate ?? null,
  price_includes_tax: toBool(a.priceIncludesTax),
  created_at: a.createdAt ?? null,
});

productCatalogRouter.get(
  '/catalog-articles',
  requireAnyPermission('products:view', 'products:manage', 'sales:create', 'sales:view', 'stock:inventory', 'stock:manage', 'purchases:create', 'purchases:edit'),
  asyncHandler((_req, res) => {
    const rows = db.prepare('SELECT * FROM catalog_articles ORDER BY created_at ASC').all() as ArticleRow[];
    res.json(rows.map(rowToArticle));
  })
);

productCatalogRouter.post(
  '/catalog-articles',
  requirePermission('products:manage'),
  asyncHandler((req, res) => {
    const body = articleSchema.parse(req.body);
    const article: CatalogArticle = { ...body, id: body.id ?? randomUUID(), createdAt: nowIso() };
    const row = articleToRow(article);
    db.prepare(
      `INSERT INTO catalog_articles (id, name, category, sub_category, price, description, image_url, is_available, extra_ids, variants, recipe, target_margin_rate, vat_rate, price_includes_tax, created_at)
       VALUES (@id, @name, @category, @sub_category, @price, @description, @image_url, @is_available, @extra_ids, @variants, @recipe, @target_margin_rate, @vat_rate, @price_includes_tax, @created_at)`
    ).run(row);
    recordActivity('Produits', 'Création', `Produit créé — ${article.name}`, req.user!.fullName);
    res.status(201).json(article);
  })
);

productCatalogRouter.put(
  '/catalog-articles/:id',
  requirePermission('products:manage'),
  asyncHandler((req, res) => {
    const body = articleSchema.parse(req.body);
    const existing = db.prepare('SELECT * FROM catalog_articles WHERE id = ?').get(req.params.id) as ArticleRow | undefined;
    if (!existing) throw notFound('Produit');
    const article: CatalogArticle = { ...body, id: req.params.id, createdAt: existing.created_at ?? nowIso() };
    const row = articleToRow(article);
    db.prepare(
      `UPDATE catalog_articles SET name=@name, category=@category, sub_category=@sub_category, price=@price, description=@description,
       image_url=@image_url, is_available=@is_available, extra_ids=@extra_ids, variants=@variants, recipe=@recipe, target_margin_rate=@target_margin_rate,
       vat_rate=@vat_rate, price_includes_tax=@price_includes_tax
       WHERE id=@id`
    ).run(row);
    recordActivity('Produits', 'Modification', `Produit modifié — ${article.name}`, req.user!.fullName);
    res.json(article);
  })
);

productCatalogRouter.patch(
  '/catalog-articles/:id/availability',
  requirePermission('products:manage'),
  asyncHandler((req, res) => {
    const body = z.object({ isAvailable: z.boolean() }).parse(req.body);
    const existing = db.prepare('SELECT * FROM catalog_articles WHERE id = ?').get(req.params.id) as ArticleRow | undefined;
    if (!existing) throw notFound('Produit');
    db.prepare('UPDATE catalog_articles SET is_available = ? WHERE id = ?').run(toBool(body.isAvailable), req.params.id);
    recordActivity('Produits', 'Modification', `Disponibilité modifiée — ${existing.name} (${body.isAvailable ? 'disponible' : 'indisponible'})`, req.user!.fullName);
    res.json(rowToArticle({ ...existing, is_available: toBool(body.isAvailable) }));
  })
);

productCatalogRouter.delete(
  '/catalog-articles/:id',
  requirePermission('products:manage'),
  asyncHandler((req, res) => {
    const existing = db.prepare('SELECT * FROM catalog_articles WHERE id = ?').get(req.params.id) as ArticleRow | undefined;
    if (!existing) throw notFound('Produit');
    db.prepare('DELETE FROM catalog_articles WHERE id = ?').run(req.params.id);
    recordActivity('Produits', 'Suppression', `Produit supprimé — ${existing.name}`, req.user!.fullName);
    res.status(204).end();
  })
);

// --- Sub-recipes -----------------------------------------------------------------------------

const subRecipeSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1),
  description: z.string().optional(),
  yieldQuantity: z.number().gt(0),
  yieldUnit: z.string().min(1),
  ingredients: z.array(recipeLineSchema),
});

productCatalogRouter.get(
  '/sub-recipes',
  requireAnyPermission('products:view', 'products:manage', 'sales:create', 'sales:view', 'stock:inventory', 'stock:manage', 'purchases:create', 'purchases:edit'),
  asyncHandler((_req, res) => {
    const rows = db.prepare('SELECT * FROM sub_recipes ORDER BY created_at ASC').all() as SubRecipeRow[];
    res.json(rows.map(rowToSubRecipe));
  })
);

productCatalogRouter.post(
  '/sub-recipes',
  requirePermission('products:manage'),
  asyncHandler((req, res) => {
    const body = subRecipeSchema.parse(req.body);
    const id = body.id ?? randomUUID();
    if (detectCircularReference(id, body.ingredients, (db.prepare('SELECT * FROM sub_recipes').all() as SubRecipeRow[]).map(rowToSubRecipe))) {
      throw new ApiError(400, 'Référence circulaire détectée dans les ingrédients de la sous-recette.');
    }
    const createdAt = nowIso();
    db.prepare('INSERT INTO sub_recipes (id, name, description, yield_quantity, yield_unit, ingredients, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id, body.name, body.description ?? null, body.yieldQuantity, body.yieldUnit, toJson(body.ingredients), createdAt
    );
    recordActivity('Produits', 'Création', `Sous-recette créée — ${body.name}`, req.user!.fullName);
    res.status(201).json(rowToSubRecipe({ id, name: body.name, description: body.description ?? null, yield_quantity: body.yieldQuantity, yield_unit: body.yieldUnit, ingredients: toJson(body.ingredients)!, created_at: createdAt }));
  })
);

productCatalogRouter.put(
  '/sub-recipes/:id',
  requirePermission('products:manage'),
  asyncHandler((req, res) => {
    const body = subRecipeSchema.parse(req.body);
    const existing = db.prepare('SELECT * FROM sub_recipes WHERE id = ?').get(req.params.id) as SubRecipeRow | undefined;
    if (!existing) throw notFound('Sous-recette');
    const others = (db.prepare('SELECT * FROM sub_recipes WHERE id != ?').all(req.params.id) as SubRecipeRow[]).map(rowToSubRecipe);
    if (detectCircularReference(req.params.id, body.ingredients, others)) {
      throw new ApiError(400, 'Référence circulaire détectée dans les ingrédients de la sous-recette.');
    }
    db.prepare('UPDATE sub_recipes SET name=?, description=?, yield_quantity=?, yield_unit=?, ingredients=? WHERE id=?').run(
      body.name, body.description ?? null, body.yieldQuantity, body.yieldUnit, toJson(body.ingredients), req.params.id
    );
    recordActivity('Produits', 'Modification', `Sous-recette modifiée — ${body.name}`, req.user!.fullName);
    res.json(rowToSubRecipe({ id: req.params.id, name: body.name, description: body.description ?? null, yield_quantity: body.yieldQuantity, yield_unit: body.yieldUnit, ingredients: toJson(body.ingredients)!, created_at: existing.created_at }));
  })
);

productCatalogRouter.delete(
  '/sub-recipes/:id',
  requirePermission('products:manage'),
  asyncHandler((req, res) => {
    const existing = db.prepare('SELECT * FROM sub_recipes WHERE id = ?').get(req.params.id) as SubRecipeRow | undefined;
    if (!existing) throw notFound('Sous-recette');
    const articles = (db.prepare('SELECT * FROM catalog_articles').all() as ArticleRow[]).map(rowToArticle);
    const allSubRecipes = (db.prepare('SELECT * FROM sub_recipes').all() as SubRecipeRow[]).map(rowToSubRecipe);
    if (getSubRecipeUsageCount(rowToSubRecipe(existing), articles, allSubRecipes) > 0) {
      throw new ApiError(409, 'Cette sous-recette est utilisée par un produit ou une autre sous-recette et ne peut pas être supprimée.');
    }
    db.prepare('DELETE FROM sub_recipes WHERE id = ?').run(req.params.id);
    recordActivity('Produits', 'Suppression', `Sous-recette supprimée — ${existing.name}`, req.user!.fullName);
    res.status(204).end();
  })
);
