import { SaleItem } from './salesTransactions';

export type ArticleCategory = SaleItem['category'];

// A recipe line is a raw ingredient (a stockable StockProduct from the Stock module), a
// sub-recipe (a reusable SubRecipe — e.g. "Pâte à Crêpe" shared by every crêpe product — defined
// and CRUD-managed in Gestion des produits → Sous-recettes), or another sellable product (a
// "composed" bundle like "Petit Déjeuner Français" = 1 Cappuccino + 2 Croissants + ... — the
// referenced product's own recipe is resolved recursively for cost/margin/stock purposes). See
// productsModel.ts for the cost/margin calculations and circular-reference guards built on top of
// this shape, and server/routes/sales.ts for the recursive stock deduction on sale.
export interface RecipeLine {
  id: string;
  kind: 'ingredient' | 'subrecipe' | 'product';
  ingredientId?: string; // StockProduct.id, when kind === 'ingredient'
  subRecipeId?: string; // SubRecipe.id, when kind === 'subrecipe'
  productId?: string; // CatalogArticle.id, when kind === 'product'
  quantity: number; // for kind === 'product', a plain count (e.g. 2 for "2x Croissant") — no unit conversion applies
  unit: string; // a StockUnit name (see stockModel.ts) — ignored when kind === 'product'
}

export interface CatalogArticle {
  id: string;
  name: string;
  category: ArticleCategory;
  subCategory?: string;
  price: number;
  description?: string;
  imageUrl?: string;
  // Undefined is treated as available — most seeded articles never set this explicitly.
  isAvailable?: boolean;
  extraIds?: string[]; // references CatalogExtra.id — reuses the existing extras catalog
  variants?: VariantOption[]; // per-product variants (distinct from the category-level groups below)
  recipe?: RecipeLine[];
  targetMarginRate?: number; // overrides DEFAULT_TARGET_MARGIN_RATE when set
  vatRate?: number; // overrides DEFAULT_VAT_RATE when set — see getArticleVatRate
  // Whether `price` already includes VAT. Undefined is treated as true — every Café Noir selling
  // price is tax-inclusive by default. Set to false only for a product whose price is entered HT,
  // in which case the customer-facing (TTC) price is derived via getArticleTtcPrice.
  priceIncludesTax?: boolean;
  createdAt?: string;
}

export interface CatalogExtra {
  id: string;
  name: string;
  price: number;
  // Ingredient consumption for this extra alone (e.g. "Chantilly" -> 30g crème fraîche), on top of
  // whatever the base product's own recipe already consumes — see server/routes/sales.ts's
  // deductStockForSale, which expands both the sold article's recipe and every selected extra's own
  // recipe. Ingredient-only lines (no sub-recipe/composed-product nesting, unlike a product's recipe)
  // since an extra is a small, self-contained add-on.
  recipe?: RecipeLine[];
}

// Tunisia's standard VAT rate — the fallback for any article that hasn't been given a specific
// (reduced) rate. Real per-product accuracy only comes from setting vatRate explicitly in Gestion
// des produits for anything eligible for a reduced rate (0% / 7% / 13%) — this is only the default.
export const DEFAULT_VAT_RATE = 0.19;

// Common Tunisian VAT tiers, offered as quick choices in the product form — vatRate itself stays a
// free numeric field so an uncommon rate can still be entered.
export const COMMON_VAT_RATES: { rate: number; label: string }[] = [
  { rate: 0, label: '0% (exonéré)' },
  { rate: 0.07, label: '7% (taux réduit)' },
  { rate: 0.13, label: '13% (taux intermédiaire)' },
  { rate: 0.19, label: '19% (taux standard)' },
];

export const getArticleVatRate = (article: Pick<CatalogArticle, 'vatRate'>): number => article.vatRate ?? DEFAULT_VAT_RATE;

// The actual price charged to the customer (TTC). Every Café Noir price is entered tax-inclusive
// by default (priceIncludesTax undefined/true) so this is normally just `price` — it only differs
// when a product was deliberately configured with an HT price, in which case VAT is added on top
// so the customer still ends up paying a TTC amount, never a bare HT one.
export const getArticleTtcPrice = (article: Pick<CatalogArticle, 'price' | 'vatRate' | 'priceIncludesTax'>): number =>
  article.priceIncludesTax === false ? article.price * (1 + getArticleVatRate(article)) : article.price;

// The price without VAT — the base every margin is computed on (VAT collected belongs to the state,
// it is never part of what the café earns).
export const getArticleHtPrice = (article: Pick<CatalogArticle, 'price' | 'vatRate' | 'priceIncludesTax'>): number =>
  article.priceIncludesTax === false ? article.price : article.price / (1 + getArticleVatRate(article));

export interface VariantOption {
  id: string;
  label: string;
  priceDelta?: number;
}

export interface VariantGroup {
  id: string;
  label: string;
  options: VariantOption[];
}

// Variants are proposed only for the drink categories where a size/milk choice is meaningful;
// Pâtisserie / Snack / Épicerie Café intentionally have no variant group.
export const VARIANT_GROUPS_BY_CATEGORY: Partial<Record<ArticleCategory, VariantGroup>> = {
  'Café chaud': {
    id: 'taille-chaud',
    label: 'Taille',
    options: [
      { id: 'petit', label: 'Petit' },
      { id: 'moyen', label: 'Moyen', priceDelta: 1.0 },
      { id: 'grand', label: 'Grand', priceDelta: 2.0 },
    ],
  },
  'Boisson lactée': {
    id: 'lait-type',
    label: 'Type de lait',
    options: [
      { id: 'entier', label: 'Lait entier' },
      { id: 'ecreme', label: 'Lait écrémé' },
      { id: 'avoine', label: "Lait d'avoine", priceDelta: 1.0 },
      { id: 'amande', label: "Lait d'amande", priceDelta: 1.0 },
    ],
  },
  'Boisson glacée': {
    id: 'taille-glace',
    label: 'Taille',
    options: [
      { id: 'moyen-g', label: 'Moyen' },
      { id: 'grand-g', label: 'Grand', priceDelta: 1.5 },
    ],
  },
};

export const getArticleById = (id: string, articles: CatalogArticle[]): CatalogArticle | undefined =>
  articles.find((a) => a.id === id);

export const getExtraById = (id: string, extras: CatalogExtra[]): CatalogExtra | undefined =>
  extras.find((e) => e.id === id);

export const getVariantGroupForCategory = (category: ArticleCategory): VariantGroup | undefined =>
  VARIANT_GROUPS_BY_CATEGORY[category];

export const getVariantOption = (category: ArticleCategory, optionId: string): VariantOption | undefined =>
  VARIANT_GROUPS_BY_CATEGORY[category]?.options.find((o) => o.id === optionId);

// Categories to group articles under when building <optgroup> pickers (manual sales entry,
// quantities entry, sales import). Categories are managed dynamically (Gestion des produits →
// Catalogue → Catégories), so this is derived live from whatever categories are actually present
// on `articles` — never a fixed list — sorted alphabetically (French collation) for a stable,
// predictable order without depending on category-creation order being threaded through as a prop.
export const getArticleCategoriesInUse = (articles: CatalogArticle[]): string[] =>
  Array.from(new Set(articles.map((a) => a.category))).sort((a, b) => a.localeCompare(b, 'fr'));
