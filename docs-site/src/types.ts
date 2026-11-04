// Mirrors exactly what scripts/build-content.mjs writes to src/generated/*.json.

export interface ManifestPageRef {
  slug: string;
  title: string;
  description: string;
}

export interface ManifestCategory {
  name: string;
  icon: string | null;
  pages: ManifestPageRef[];
}

export interface FeaturedRef extends ManifestPageRef {
  category: string;
}

export interface Manifest {
  categories: ManifestCategory[];
  featured: FeaturedRef[];
  pageCount: number;
  generatedAt: string;
}

export interface TocEntry {
  id: string;
  text: string;
  depth: number;
}

export interface DocPage {
  slug: string;
  title: string;
  description: string;
  category: string;
  categoryIcon?: string;
  order: number;
  categoryOrder: number;
  featured: boolean;
  featuredOrder: number;
  html: string;
  toc: TocEntry[];
}

export interface SearchEntry {
  slug: string;
  title: string;
  description: string;
  category: string;
  text: string;
}
