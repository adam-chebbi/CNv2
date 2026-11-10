import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, Maximize, Menu, Minimize, UserRoundCog, Wallet } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import type { CashSessionDetail } from '../api';
import { StaffNotifications } from '../StaffNotifications';
import { cx, time } from '../ui';

// Frame of the Caisse: covers the whole screen (100dvh, no page scroll), a 48 px strip on top with
// the café, the cashier, the cash session, notifications, menu and full screen. The tablet is kept
// awake while the Caisse is open.

const FS_KEY = 'cn_caisse_fullscreen';
const wantsFullscreen = (): boolean => {
  try {
    return localStorage.getItem(FS_KEY) === '1';
  } catch {
    return false;
  }
};

export const CaisseShell: React.FC<{ session: CashSessionDetail | null; onSession: () => void; children: React.ReactNode }> = ({ session, onSession, children }) => {
  const { user, logout } = useAuth();
  const [isFull, setIsFull] = useState(() => Boolean(document.fullscreenElement));

  useEffect(() => {
    const onChange = () => setIsFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    // Browsers only allow full screen after a tap: restore the device's choice on the first one.
    const restore = () => {
      if (wantsFullscreen() && !document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => undefined);
    };
    window.addEventListener('pointerdown', restore, { once: true });
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      window.removeEventListener('pointerdown', restore);
    };
  }, []);

  // Screen Wake Lock: the tablet doesn't go to sleep while the Caisse is open.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const take = () => {
      if (document.visibilityState === 'visible') void nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => undefined);
    };
    take();
    document.addEventListener('visibilitychange', take);
    return () => {
      document.removeEventListener('visibilitychange', take);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  const toggleFull = () => {
    const next = !document.fullscreenElement;
    try {
      localStorage.setItem(FS_KEY, next ? '1' : '0');
    } catch {
      /* per device only */
    }
    if (next) void document.documentElement.requestFullscreen?.().catch(() => undefined);
    else void document.exitFullscreen?.().catch(() => undefined);
  };

  const strip = 'inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50';
  // Rendered on top of the page itself, so no surrounding layout can scroll or cover it.
  return createPortal(
    <div className="fixed inset-0 z-[35] flex flex-col bg-gray-50 h-[100dvh] overflow-hidden">
      <header className="h-14 shrink-0 flex items-center gap-2 px-3 bg-white border-b border-gray-200">
        <button onClick={() => window.dispatchEvent(new Event('cn:open-menu'))} className={strip} aria-label="Ouvrir le menu" title="Menu (Alt+M)">
          <Menu size={18} />
        </button>
        <button onClick={() => void logout()} className="min-w-0 leading-tight text-left px-1 rounded-lg hover:bg-gray-50" title="Changer d’utilisateur">
          <p className="text-sm font-bold text-gray-900 truncate">Café Noir · Caisse</p>
          <p className="text-xs text-gray-500 truncate flex items-center gap-1"><UserRoundCog size={12} /> {user?.fullName} · changer</p>
        </button>
        <span className="flex-1" />
        <button onClick={onSession} className={cx(strip, session ? 'text-emerald-800 border-emerald-200 bg-emerald-50' : 'text-amber-800 border-amber-200 bg-amber-50')} title="Session de caisse : mouvements, clôture">
          <Wallet size={16} />
          <span className="hidden sm:inline">{session ? `Ouverte ${time(session.openedAt)}` : 'Caisse fermée'}</span>
        </button>
        <button onClick={() => window.dispatchEvent(new Event('cn:open-help'))} className={strip} aria-label="Aide" title="Comment ça marche">
          <HelpCircle size={18} />
        </button>
        <StaffNotifications onOpen={(sub) => window.dispatchEvent(new CustomEvent('cn:open-pos', { detail: sub }))} />
        <button onClick={toggleFull} className={strip} aria-label={isFull ? 'Quitter le plein écran' : 'Plein écran'} title={isFull ? 'Quitter le plein écran' : 'Plein écran'}>
          {isFull ? <Minimize size={18} /> : <Maximize size={18} />}
        </button>
      </header>
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </div>,
    document.body
  );
};
