// Kill-switch service worker for cafe.cafenoir.tn — this domain no longer hosts the app (it moved
// to system.cafenoir.tn, see ../system.cafenoir.tn.nginx.conf and ../cafe.cafenoir.tn.nginx.conf).
//
// Why this file has to exist at all: anyone who still has the OLD app's service worker active here
// (an installed PWA, or just a tab left open from before the move) will keep seeing the stale
// cached app FOREVER if all we do is 301-redirect at nginx — the old worker's navigation fallback
// (Workbox, cache-only) answers every page load straight from its own precache, so the request
// never even reaches nginx's redirect for them. A server-side redirect only ever helps a visitor
// who has no service worker yet.
//
// The fix reuses the exact mechanism the real app already relies on for its own update flow (see
// src/pwa/updateManager.ts): browsers periodically re-fetch a registered service worker's own
// script (here, on an hourly timer the old app's own still-running code keeps calling, plus every
// browser's built-in on-navigation check) to see if it changed — and that one specific fetch is
// never intercepted by the very worker it's checking, so it reaches nginx even while the old
// worker is fully in control of everything else. nginx serves THIS file at that exact path
// (/sw.js — see the `location = /sw.js` block), the browser sees different bytes, installs it as
// the new worker, and once active it wipes every cache it owns, unregisters itself, and pushes
// any page it still controls straight over to the new domain — no reload or click needed from
// the person on the other end.
const NEW_HOME = 'https://system.cafenoir.tn/';

self.addEventListener('install', () => {
  // Don't wait for old tabs to close — there's nothing here worth keeping around for.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));

      // Take control of any page this worker's scope already covers, without waiting for a
      // reload, so the navigate() call below actually reaches something live.
      await self.clients.claim();

      const openClients = await self.clients.matchAll({ type: 'window' });
      openClients.forEach((client) => {
        if ('navigate' in client) client.navigate(NEW_HOME);
      });

      // Nothing left to control and nothing left to do — remove the registration entirely so a
      // future visit (if DNS/bookmarks ever point back here) starts clean instead of re-running
      // this same install/activate cycle pointlessly.
      await self.registration.unregister();
    })()
  );
});
