import type { DocPage, Manifest, SearchEntry } from './types';
import manifestJson from './generated/manifest.json';

export const manifest = manifestJson as Manifest;

// Every generated page, keyed by slug — import.meta.glob so a new page (new .md file, new build)
// is picked up automatically, no per-page import to add here.
const pageModules = import.meta.glob<DocPage>('./generated/pages/*.json', { eager: true, import: 'default' });
const pagesBySlug = new Map<string, DocPage>();
for (const mod of Object.values(pageModules)) {
  pagesBySlug.set(mod.slug, mod);
}
export const getPage = (slug: string): DocPage | undefined => pagesBySlug.get(slug);

export const searchIndex: SearchEntry[] = (
  import.meta.glob<SearchEntry[]>('./generated/search-index.json', { eager: true, import: 'default' })['./generated/search-index.json'] ?? []
);

// Previous/next within the flattened, category-then-order sidebar sequence — lets an article page
// offer "article précédent / suivant" without any manually maintained ordering.
export const flattenedSlugs: string[] = manifest.categories.flatMap((c) => c.pages.map((p) => p.slug));
export const getAdjacentPages = (slug: string): { prev?: DocPage; next?: DocPage } => {
  const idx = flattenedSlugs.indexOf(slug);
  if (idx === -1) return {};
  const prevSlug = idx > 0 ? flattenedSlugs[idx - 1] : undefined;
  const nextSlug = idx < flattenedSlugs.length - 1 ? flattenedSlugs[idx + 1] : undefined;
  return {
    prev: prevSlug ? getPage(prevSlug) : undefined,
    next: nextSlug ? getPage(nextSlug) : undefined,
  };
};
