import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // The web manifest is hand-authored at public/site.webmanifest (with its own icon set
        // and <link rel="manifest"> tag in index.html) — the plugin only generates/registers the
        // service worker here, it doesn't own or duplicate the manifest.
        manifest: false,
        // 'prompt' (not 'autoUpdate') + injectRegister: false — a new service worker is installed
        // in the background but never silently takes over. src/pwa/updateManager.ts registers it
        // manually (via the virtual:pwa-register module) so the app decides exactly when to apply
        // it: only when the tab is hidden and no page has reported unsaved work, or when the user
        // explicitly clicks "Mettre à jour" — never yanking someone off a form they're mid-typing.
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png', 'logo.png'],
        workbox: {
          // Precache the built app shell (hashed JS/CSS/fonts/images) so the UI loads instantly,
          // including fully offline, once it's been opened once.
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          // Business data (sales, stock, purchases...) must never be served stale from a cache —
          // API calls always go to the network, and fail honestly (surfaced by the app's existing
          // error state) rather than silently showing outdated figures when offline.
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkOnly',
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: 'http://localhost:4000',
          changeOrigin: true,
        },
      },
    },
  };
});
