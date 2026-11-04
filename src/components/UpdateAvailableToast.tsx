import React, { useEffect, useState } from 'react';
import { RefreshCw, X, Loader2 } from 'lucide-react';
import { applyUpdate, subscribeToUpdateAvailable } from '../pwa/updateManager';

// A new deploy is never applied silently while this tab is open and in use — see
// src/pwa/updateManager.ts for the auto-apply rule (only when hidden and no unsaved work). This
// toast is the visible, user-driven way to apply it sooner: dismissing it just hides the toast,
// it does not cancel the pending update — the background auto-apply logic still takes over the
// next time it's safe to.
export const UpdateAvailableToast: React.FC = () => {
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => subscribeToUpdateAvailable((next) => {
    setAvailable(next);
    if (next) setDismissed(false);
  }), []);

  if (!available || dismissed) return null;

  const handleUpdate = () => {
    setIsUpdating(true);
    applyUpdate();
  };

  return (
    <div className="fixed bottom-4 right-4 z-[60] max-w-xs w-[calc(100%-2rem)] animate-in fade-in slide-in-from-bottom-2">
      <div className="rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 p-4 shadow-xl">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h3 className="font-bold text-xs text-gray-900 dark:text-white flex items-center gap-1.5">
            <RefreshCw size={14} className="text-emerald-500" />
            Nouvelle version disponible
          </h3>
          <button
            onClick={() => setDismissed(true)}
            title="Plus tard"
            className="p-1 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer shrink-0"
          >
            <X size={14} />
          </button>
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
          Vos données et votre session sont conservées — la mise à jour ne fait que recharger l'application.
        </p>
        <button
          onClick={handleUpdate}
          disabled={isUpdating}
          className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-lg py-2 transition cursor-pointer"
        >
          {isUpdating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          <span>{isUpdating ? 'Mise à jour…' : 'Mettre à jour maintenant'}</span>
        </button>
      </div>
    </div>
  );
};
