/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute base URL of the Café Noir management API (no trailing slash). Overrides the default. */
  readonly VITE_API_BASE_URL?: string;
  /** Public address of the deployed site (canonical URLs, sitemap, Open Graph). Defaults to https://cafenoir.tn. */
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
