import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Its own installable PWA, independent from the main app's (different origin, scope, name and
// service worker) — same Café Noir logo, but installs as "Historique et Comptage Café Noir".
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Same deploy-safety policy as the main app (src/pwa/updateManager.ts there): a new build is
      // installed in the background but only applied when no form is being filled in.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png', 'logo.png', 'logo-text.png', 'logo-icon-dark.png'],
      manifest: {
        id: '/',
        name: 'Historique et Comptage Café Noir',
        short_name: 'Historique CN',
        description: 'Caisse du Café Noir : chiffre d’affaires, dépenses et comptage (espèces, TPE, ticket resto).',
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#10B981',
        background_color: '#ffffff',
        icons: [
          { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // Figures are never served from a cache: offline, entries are queued by the app itself
        // (src/api/outbox.ts) and replayed once the connection is back.
        runtimeCaching: [{ urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' }],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:4100', changeOrigin: false },
    },
  },
});
