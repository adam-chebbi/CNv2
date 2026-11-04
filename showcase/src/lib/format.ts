import type { Product } from '../api/products';

/** Tunisian dinar, 3 decimals (millimes) — "2.000 TND". */
export function formatTND(value: number): string {
  return `${value.toFixed(3)} TND`;
}

/** Lowest price a customer can pay for the product (base price + cheapest variant). */
export function startingPrice(product: Product): number {
  const deltas = product.variants.map((v) => v.priceDelta ?? 0);
  return product.price + (deltas.length ? Math.min(...deltas) : 0);
}

/** Lowercase, accent-free text for forgiving search / category matching. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
