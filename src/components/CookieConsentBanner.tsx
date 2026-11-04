import React, { useState } from 'react';
import { X, Cookie } from 'lucide-react';
import { useCookieConsent } from '../context/CookieConsentContext';

export const CookieConsentBanner: React.FC = () => {
  const { hasDecided, preferencesEnabled, acceptAll, acceptNecessaryOnly, setPreferencesEnabled } = useCookieConsent();
  const [showCustomize, setShowCustomize] = useState(false);
  const [pendingPreferences, setPendingPreferences] = useState(preferencesEnabled);

  if (hasDecided) return null;

  const openCustomize = () => {
    setPendingPreferences(preferencesEnabled);
    setShowCustomize(true);
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] max-w-md w-[calc(100%-2rem)]">
      <div className="rounded-2xl bg-white border border-gray-100 p-4 shadow-xl animate-in fade-in slide-in-from-bottom-2">
        <div className="flex justify-between items-start mb-3">
          <h3 className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
            <Cookie size={15} className="text-primary" />
            {showCustomize ? 'Personnaliser les cookies' : 'Gestion des cookies'}
          </h3>
          <button
            onClick={acceptNecessaryOnly}
            title="Fermer (cookies essentiels uniquement)"
            className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {showCustomize ? (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3 p-2.5 rounded-lg bg-gray-50 border border-gray-100">
              <div>
                <p className="text-xs font-semibold text-gray-800">Cookies essentiels</p>
                <p className="text-[11px] text-gray-500">Session, sécurité (anti-CSRF) — toujours actifs, nécessaires au fonctionnement.</p>
              </div>
              <span className="shrink-0 mt-0.5 inline-flex h-5 w-9 items-center rounded-full bg-primary/40 px-0.5">
                <span className="h-4 w-4 rounded-full bg-primary translate-x-4 transition-transform" />
              </span>
            </div>

            <div className="flex items-start justify-between gap-3 p-2.5 rounded-lg bg-gray-50 border border-gray-100">
              <div>
                <p className="text-xs font-semibold text-gray-800">Cookies de préférence</p>
                <p className="text-[11px] text-gray-500">Mémorisent vos réglages d'affichage (ex. barre latérale réduite).</p>
              </div>
              <button
                type="button"
                onClick={() => setPendingPreferences((v) => !v)}
                className={`shrink-0 mt-0.5 inline-flex h-5 w-9 items-center rounded-full px-0.5 transition-colors cursor-pointer ${
                  pendingPreferences ? 'bg-primary' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    pendingPreferences ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <button
              onClick={() => setPreferencesEnabled(pendingPreferences)}
              className="w-full text-xs font-semibold text-white bg-primary hover:opacity-90 rounded-lg py-2 transition cursor-pointer"
            >
              Confirmer mes choix
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-4">
              Nous utilisons uniquement des cookies essentiels (session, sécurité) et, si vous l'acceptez, un cookie
              de préférence pour mémoriser vos réglages d'affichage. Aucun cookie publicitaire ou de suivi n'est
              utilisé.
            </p>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button
                  onClick={acceptAll}
                  className="flex-1 text-xs font-semibold text-white bg-primary hover:opacity-90 rounded-lg px-3 py-2 transition cursor-pointer"
                >
                  Accepter tout
                </button>
                <button
                  onClick={acceptNecessaryOnly}
                  className="flex-1 text-xs font-semibold text-primary border border-primary/40 hover:bg-primary/5 rounded-lg px-3 py-2 transition cursor-pointer"
                >
                  Seulement nécessaire
                </button>
              </div>
              <button
                onClick={openCustomize}
                className="text-xs font-semibold text-gray-500 hover:text-gray-700 underline text-center cursor-pointer"
              >
                Laisse-moi choisir
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mt-3">
              Pour toute question sur notre politique de cookies, contactez l'administrateur système.
            </p>
          </>
        )}
      </div>
    </div>
  );
};
