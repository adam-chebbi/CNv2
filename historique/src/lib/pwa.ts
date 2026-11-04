import { useCallback, useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

// Same policy as the main app's src/pwa/updateManager.ts: a new build waits in the background and
// is applied only when the tab is hidden and no form is open, or when the user taps "Mettre à jour".

let updateFn: ((reload?: boolean) => Promise<void>) | null = null;
let available = false;
const subs = new Set<(v: boolean) => void>();
const dirty = new Set<symbol>();

export const markDirty = (id: symbol, isDirty: boolean) => {
  if (isDirty) dirty.add(id);
  else dirty.delete(id);
};

export const applyUpdate = () => {
  updateFn?.(true).catch(() => undefined);
};

const tryAuto = () => {
  if (available && document.visibilityState === 'hidden' && dirty.size === 0) applyUpdate();
};

let started = false;
export const initPwa = () => {
  if (started) return;
  started = true;
  updateFn = registerSW({
    onNeedRefresh() {
      available = true;
      subs.forEach((cb) => cb(true));
      tryAuto();
    },
    onRegisteredSW(_url, reg) {
      if (reg) setInterval(() => reg.update().catch(() => undefined), 60 * 60 * 1000);
    },
  });
  document.addEventListener('visibilitychange', tryAuto);
};

export const useUpdateAvailable = () => {
  const [v, setV] = useState(available);
  useEffect(() => {
    subs.add(setV);
    return () => {
      subs.delete(setV);
    };
  }, []);
  return v;
};

// Marks the calling form as "unsaved work" while open, so an update never reloads it away.
export const useDirtyGuard = (isDirty: boolean) => {
  const [id] = useState(() => Symbol('form'));
  useEffect(() => {
    markDirty(id, isDirty);
    return () => markDirty(id, false);
  }, [id, isDirty]);
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const useInstallPrompt = () => {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => window.matchMedia?.('(display-mode: standalone)').matches);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setEvt(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  const promptInstall = useCallback(async () => {
    if (!evt) return;
    await evt.prompt();
    await evt.userChoice;
    setEvt(null);
  }, [evt]);
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return { canInstall: Boolean(evt) && !installed, installed, isIos, promptInstall };
};
