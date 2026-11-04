import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { seoPlugin } from './seo/seoPlugin';

// The showcase is a standalone static site — in dev it reaches the management app's public API
// through this proxy (same-origin, no CORS involved); in production it calls the API's absolute
// URL directly (see src/config/site.ts, API_BASE_URL) since the two live on different domains.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // The public address of the deployed site: canonical links, Open Graph URLs, sitemap, robots.
  const siteUrl = env.VITE_SITE_URL || 'https://cafenoir.tn';
  return {
    plugins: [react(), tailwindcss(), seoPlugin(siteUrl)],
    server: {
      proxy: {
        '/api': {
          target: env.SHOWCASE_DEV_API_TARGET || 'http://localhost:4000',
          changeOrigin: true,
        },
      },
    },
  };
});
