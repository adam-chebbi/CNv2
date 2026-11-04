import type { Catalog, Product } from '../api/products';
import { IMAGES } from '../config/site';
import { normalize } from './format';

export interface CategoryGroup {
  name: string;
  products: Product[];
}

/**
 * Categories in the system's own order, each with its available products. Categories without any
 * product are left out (nothing to show), and a product whose category is missing from the list
 * still gets a group so nothing sold is ever hidden from the menu.
 */
export function buildGroups(catalog: Catalog): CategoryGroup[] {
  const names = catalog.categories.map((c) => c.name);
  for (const p of catalog.products) if (!names.includes(p.category)) names.push(p.category);
  return names
    .map((name) => ({ name, products: catalog.products.filter((p) => p.category === name) }))
    .filter((g) => g.products.length > 0);
}

/**
 * Photo for a category card: a real product photo uploaded in the system when there is one,
 * otherwise a stock picture matched on the category's name.
 */
export function categoryImage(group: CategoryGroup): { src: string; fromSystem: boolean } {
  const own = group.products.find((p) => p.imageUrl)?.imageUrl;
  if (own) return { src: own, fromSystem: true };

  const n = normalize(group.name);
  if (/(patisser|viennois|gateau|dessert|douceur|croissant|cake|tarte|sucre|crepe|gaufre)/.test(n)) return { src: IMAGES.patisseries, fromSystem: false };
  if (/(sale|snack|sandwich|brunch|petit dej|quiche|salade|burger|tacos|panini|toast|pizza|plat)/.test(n)) return { src: IMAGES.sales, fromSystem: false };
  if (/(boisson|jus|smoothie|matcha|infusion|froid|fraiche|glace|frappe|milkshake|soda|cocktail|limonade|citronnade)/.test(n)) return { src: IMAGES.boissons, fromSystem: false };
  // Coffee, tea and anything unrecognised.
  return { src: IMAGES.cafes, fromSystem: false };
}
