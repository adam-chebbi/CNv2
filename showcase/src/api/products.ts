import { API_BASE_URL } from '../config/site';

// Mirrors the contract in PUBLIC_PRODUCTS_API.md (GET /api/products).
export interface Category {
  id: string;
  name: string;
}
export interface SubCategory {
  id: string;
  categoryId: string;
  name: string;
}
export interface Extra {
  id: string;
  name: string;
  price: number;
}
export interface VariantOption {
  id: string;
  label: string;
  priceDelta?: number;
}
export interface Product {
  id: string;
  name: string;
  category: string;
  subCategory: string | null;
  price: number;
  description: string | null;
  imageUrl: string | null;
  extraIds: string[];
  variants: VariantOption[];
}
export interface Catalog {
  categories: Category[];
  subCategories: SubCategory[];
  extras: Extra[];
  products: Product[];
}

const CACHE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 1_500;
let cache: { at: number; data: Catalog } | null = null;
let inflight: Promise<Catalog> | null = null;

/** Thrown for answers a retry cannot fix (401/404, or a body that is not the catalog). */
class PermanentError extends Error {}

async function requestCatalog(): Promise<Catalog> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    // A plain GET with only a CORS-safelisted header: no preflight request is needed cross-origin.
    const res = await fetch(`${API_BASE_URL}/api/products`, {
      headers: { Accept: 'application/json' },
      // Always revalidate with the server (ETag): a product changed in the system must show up on the next refresh.
      cache: 'no-cache',
      signal: controller.signal,
    });
    if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) throw new PermanentError(`HTTP ${res.status}`);

    const raw = (await res.json().catch(() => null)) as Partial<Catalog> | null;
    // Anything that is not the documented shape (e.g. the site's index.html served for a wrong URL)
    // must surface as an error, not as a silently empty menu.
    if (!raw || !Array.isArray(raw.products)) throw new PermanentError('Unexpected response');

    return {
      categories: raw.categories ?? [],
      subCategories: raw.subCategories ?? [],
      extras: raw.extras ?? [],
      products: raw.products.map((p) => ({
        ...p,
        extraIds: p.extraIds ?? [],
        variants: p.variants ?? [],
      })),
    };
  } finally {
    window.clearTimeout(timer);
  }
}

/** One quick retry covers a network blip, a timeout or a server restart; permanent errors fail at once. */
async function requestCatalogWithRetry(): Promise<Catalog> {
  try {
    return await requestCatalog();
  } catch (err) {
    if (err instanceof PermanentError) throw err;
    await new Promise((r) => window.setTimeout(r, RETRY_DELAY_MS));
    return requestCatalog();
  }
}

/** Fetches the live catalog. Results are shared for a minute so page changes don't refetch. */
export function fetchCatalog(force = false): Promise<Catalog> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return Promise.resolve(cache.data);
  if (inflight) return inflight;

  inflight = requestCatalogWithRetry()
    .then((data) => {
      cache = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
