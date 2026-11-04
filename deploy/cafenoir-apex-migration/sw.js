// Kill-switch service worker for cafenoir.tn (the apex domain) — this domain used to host the
// management app itself (before it moved to cafe.cafenoir.tn during the server migration, and
// then to its final home at system.cafenoir.tn — see ../cafe-migration/sw.js for that later leg).
// The apex was then freed up for the showcase site (showcase/dist, see
// ../../showcase/deploy/cafenoir.tn.nginx.conf).
//
// Anyone who visited cafenoir.tn back when it ran the app, and still has that old service worker
// active (an installed PWA, or just a tab never reopened since), gets served the OLD app shell
// straight from that worker's own cache-only navigation fallback — nginx now correctly serves the
// showcase, but the request never reaches nginx for them at all. That old app shell's own code is
// what redirects them to https://system.cafenoir.tn/, since the app has since been told that's
// its real home — hence "typing cafenoir.tn redirects me to system.cafenoir.tn" for exactly the
// visitors who used the app here before the move (which is why it doesn't show up in a plain
// curl/server-side check: the server was never involved).
//
// The fix reuses the same mechanism as ../cafe-migration/sw.js: nginx serves THIS file at the
// exact old script path (/sw.js), the browser's routine "has this worker's script changed?" check
// (on navigation, or the old app's own hourly self-update timer — see src/pwa/updateManager.ts)
// is never intercepted by the very worker it's checking, so it reaches nginx even while the old
// worker is in full control of everything else. Once installed, this worker wipes every cache it
// owns, unregisters itself, and pushes any page it still controls to reload cafenoir.tn itself
// (NOT system.cafenoir.tn — the apex is the real, correct destination now, so this only needs to
// get the old worker out of the way and let the current showcase load normally).
const HOME = 'https://cafenoir.tn/';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));

      await self.clients.claim();

      const openClients = await self.clients.matchAll({ type: 'window' });
      openClients.forEach((client) => {
        if ('navigate' in client) client.navigate(HOME);
      });

      await self.registration.unregister();
    })()
  );
});
