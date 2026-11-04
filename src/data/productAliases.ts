// Reusable "OCR label -> stock product" correspondence: pure data/matching logic, no DOM
// dependency, so it can be shared safely between the browser bundle and the Node server (unlike
// invoiceOcr.ts, which pulls in browser-only OCR/PDF/DOCX extraction code).

import { normalizeKey } from './textUtils';
import { StockProduct } from './stockModel';

export interface ProductAlias {
  id: string;
  rawLabel: string;
  normalizedLabel: string;
  productId: string;
  createdAt: string;
}

export const findProductMatch = (rawLabel: string, products: StockProduct[], aliases: ProductAlias[]): string => {
  const key = normalizeKey(rawLabel);
  if (!key) return '';
  const alias = aliases.find((a) => a.normalizedLabel === key);
  if (alias) return alias.productId;
  const exact = products.find((p) => normalizeKey(p.name) === key);
  if (exact) return exact.id;
  const contains = products.find((p) => {
    const pKey = normalizeKey(p.name);
    return key.includes(pKey) || pKey.includes(key);
  });
  return contains?.id ?? '';
};
