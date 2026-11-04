import React from 'react';
import { X, Check, ArrowRight, ShieldCheck, ShoppingCart } from 'lucide-react';

interface ActionModalProps {
  type: 'upgrade' | 'restock' | 'sales_returns' | 'purchase_returns' | 'products' | 'clients' | 'vendors' | null;
  onClose: () => void;
}

export const ActionModals: React.FC<ActionModalProps> = ({ type, onClose }) => {
  if (!type) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in" onClick={onClose}>
      <div className="relative w-full max-w-lg bg-white dark:bg-[#151D2A] rounded-2xl p-6 shadow-2xl border border-gray-100 dark:border-gray-800 space-y-4" onClick={(e) => e.stopPropagation()}>
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
        >
          <X size={18} />
        </button>

        {/* Upgrade Plan Modal */}
        {type === 'upgrade' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <span className="px-2.5 py-0.5 text-xs font-semibold text-emerald-600 bg-emerald-50 rounded-full border border-emerald-200">
                Abonnement POS
              </span>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white pt-1">
                Passez au niveau supérieur
              </h3>
              <p className="text-xs text-gray-500">
                Votre abonnement actuel expire le 06 mai 2027.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/30 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-gray-900 dark:text-white">Plan Entreprise Pro+</span>
                <span className="text-lg font-black text-emerald-600">79.99 DT / mois</span>
              </div>
              <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1.5 pt-1">
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-emerald-500" /> Caisses et terminaux POS illimités
                </li>
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-emerald-500" /> Synchronisation multi-boutiques en temps réel
                </li>
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-emerald-500" /> Export comptable & analytique automatisé
                </li>
              </ul>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
              >
                Plus tard
              </button>
              <button
                onClick={onClose}
                className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition flex items-center gap-1.5"
              >
                <span>Confirmer la mise à niveau</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Restock Modal */}
        {type === 'restock' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <ShoppingCart size={18} className="text-emerald-600" />
                Commande de réapprovisionnement
              </h3>
              <p className="text-xs text-gray-500">
                Génération automatique du bon d'achat pour les articles en rupture.
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl flex justify-between items-center">
                <div>
                  <p className="font-semibold text-gray-800 dark:text-gray-200">Lait d'Avoine Barista Oatly</p>
                  <p className="text-[10px] text-gray-400">ST-OAT-01 · Fournisseur Oatly France</p>
                </div>
                <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold rounded-md">
                  +48 briques
                </span>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl flex justify-between items-center">
                <div>
                  <p className="font-semibold text-gray-800 dark:text-gray-200">Grains Éthiopie Yirgacheffe Bio</p>
                  <p className="text-[10px] text-gray-400">ST-COF-ETH · Torréfaction L'Arbre à Café</p>
                </div>
                <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold rounded-md">
                  +20 kg
                </span>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl flex justify-between items-center">
                <div>
                  <p className="font-semibold text-gray-800 dark:text-gray-200">Gobelets Carton Recyclé 350ml</p>
                  <p className="text-[10px] text-gray-400">ST-CUP-350 · EcoCup Distribution</p>
                </div>
                <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold rounded-md">
                  +500 unités
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
              >
                Annuler
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition"
              >
                Envoyer le bon de commande
              </button>
            </div>
          </div>
        )}

        {/* View All Details generic view */}
        {type !== 'upgrade' && type !== 'restock' && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white capitalize">
              {type.replace('_', ' ')}
            </h3>
            <p className="text-xs text-gray-500">
              Liste détaillée et options d'export CSV / PDF synchronisées en direct.
            </p>
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/60 text-center text-xs text-gray-600 dark:text-gray-300 space-y-1">
              <ShieldCheck size={24} className="mx-auto text-emerald-600 mb-2" />
              <p className="font-semibold">Données validées et synchronisées</p>
              <p className="text-[11px] text-gray-400">Toutes les opérations récentes sont archivées.</p>
            </div>
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 rounded-lg transition"
              >
                Fermer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
