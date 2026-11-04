import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './auth/AuthContext';
import { AuthGate } from './auth/AuthGate';
import { CookieConsentProvider } from './context/CookieConsentContext';
import { CookieConsentBanner } from './components/CookieConsentBanner';
import { UpdateAvailableToast } from './components/UpdateAvailableToast';
import { initUpdateManager } from './pwa/updateManager';
import './index.css';

// Deploy-safety: detects a new build in the background (service worker) and applies it either
// when the user explicitly asks (the toast below) or automatically the moment it's safe to (tab
// hidden, no page reporting unsaved work) — see src/pwa/updateManager.ts for the full rationale.
// A no-op outside a real service-worker context (e.g. plain HTTP local dev).
initUpdateManager();

// A browser tab opened before a new deploy keeps running the JS it already loaded, whose lazy
// routes (React.lazy in App.tsx) reference content-hashed chunk filenames baked in at build time
// (e.g. "ProductsPage-<hash>.js"). Once a new deploy replaces dist/assets/ wholesale, those exact
// files no longer exist — the server's SPA fallback returns index.html (text/html) for the 404,
// which the browser rejects as "not a JavaScript module". Vite fires `vite:preloadError` for
// exactly this failure; reloading once fetches the current index.html and its correct chunk
// references, self-healing the tab instead of leaving it permanently broken until the user
// manually refreshes. Guarded by sessionStorage so a real, persistent network/module error can't
// trigger a reload loop — at most one automatic reload per tab session.
window.addEventListener('vite:preloadError', () => {
  const key = 'vitePreloadErrorReloaded';
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, '1');
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CookieConsentProvider>
      <AuthProvider>
        <AuthGate>
          <App />
        </AuthGate>
      </AuthProvider>
      <CookieConsentBanner />
      <UpdateAvailableToast />
    </CookieConsentProvider>
  </StrictMode>,
);
