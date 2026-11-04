import { useEffect, useRef } from 'react';
import { apiGet } from '../api/client';

// Shared devices (register, tablets): signs the user out after N minutes without any interaction
// (cahier des charges §18.1). N comes from Paramètres caisse; 0 disables it.
export const useIdleLogout = (logout: () => void | Promise<void>): void => {
  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  useEffect(() => {
    let minutes = 0;
    let last = Date.now();
    let cancelled = false;
    void apiGet<{ idleLogoutMinutes: number }>('/pos/session-policy')
      .then((p) => {
        if (!cancelled) minutes = p.idleLogoutMinutes;
      })
      .catch(() => undefined);
    const touch = () => (last = Date.now());
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = window.setInterval(() => {
      if (minutes > 0 && Date.now() - last > minutes * 60_000) {
        last = Date.now();
        void logoutRef.current();
      }
    }, 15_000);
    return () => {
      cancelled = true;
      events.forEach((e) => window.removeEventListener(e, touch));
      window.clearInterval(timer);
    };
  }, []);
};
