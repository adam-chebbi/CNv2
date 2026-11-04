import { registerSW } from 'virtual:pwa-register';

// Deploy-safety layer: detects a new build without ever silently pulling the rug out from under a
// user mid-task. Three cooperating pieces:
//   1. Version detection — the service worker (workbox, precache-hash based) notices a new build
//      exists in the background; onNeedRefresh() is our signal, re-checked hourly for tabs left
//      open a long time (a fresh workbox install only otherwise re-checks on full navigation).
//   2. Safe application — an update is only ever applied (a) automatically, the moment the tab is
//      hidden AND no page has reported unsaved work, or (b) immediately, if the user explicitly
//      clicks "Mettre à jour" in the toast — their call, on their schedule.
//   3. Session/auth continuity — nothing to preserve deliberately: the session lives in an httpOnly
//      cookie (untouched by a reload) and every page re-fetches its own data on mount, so a reload
//      always lands the user back in a fully authenticated, up-to-date app. The only real risk is
//      in-progress, not-yet-saved form input, which is exactly what unsaved-work tracking guards.

type AvailabilityListener = (available: boolean) => void;

let updateSWFn: ((reloadPage?: boolean) => Promise<void>) | null = null;
let updateAvailable = false;
const listeners = new Set<AvailabilityListener>();

// Multiple forms could theoretically be mounted (or mid-transition) at once, so this is a set of
// independent "who currently has unsaved work" sources rather than one shared boolean — an update
// is only safe to auto-apply once every source has cleared itself (saved, cancelled, or unmounted).
const dirtySources = new Set<symbol>();

export const hasUnsavedWork = (): boolean => dirtySources.size > 0;

// Used by useUnsavedWorkGuard (src/hooks/useUnsavedWorkGuard.ts) — not meant to be called directly
// from a component; go through the hook so the source is always cleaned up on unmount.
export const setUnsavedWorkSource = (id: symbol, isDirty: boolean): void => {
  if (isDirty) dirtySources.add(id);
  else dirtySources.delete(id);
};

const notifyListeners = (): void => {
  listeners.forEach((cb) => cb(updateAvailable));
};

export const subscribeToUpdateAvailable = (cb: AvailabilityListener): (() => void) => {
  listeners.add(cb);
  cb(updateAvailable);
  return () => listeners.delete(cb);
};

// Activates the waiting service worker and reloads — the one moment the tab's JS actually swaps to
// the new build. Safe to call any time; a no-op if no update is pending.
export const applyUpdate = (): void => {
  if (!updateSWFn) return;
  updateSWFn(true).catch(() => undefined);
};

const tryAutoApply = (): void => {
  if (!updateAvailable) return;
  if (document.visibilityState !== 'hidden') return;
  if (hasUnsavedWork()) return;
  applyUpdate();
};

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly — long-lived open tabs still notice a deploy

let initialized = false;

// Call once, at app startup (see src/main.tsx). A no-op outside a real service-worker context (e.g.
// local dev without HTTPS/localhost SW support) — registerSW degrades to a no-op function there.
export const initUpdateManager = (): void => {
  if (initialized) return;
  initialized = true;

  updateSWFn = registerSW({
    onNeedRefresh() {
      updateAvailable = true;
      notifyListeners();
      tryAutoApply();
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => {
        registration.update().catch(() => undefined);
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });

  document.addEventListener('visibilitychange', tryAutoApply);
};
