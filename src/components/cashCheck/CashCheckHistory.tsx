import React, { useState } from 'react';
import { History, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, MessageSquare } from 'lucide-react';
import {
  CashVerification,
  CASH_DENOMINATIONS,
  isSignificantDifference,
  sortVerificationsByConfirmedAtDesc,
} from '../../data/cashCheckModel';

const formatDT = (v: number): string => `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DT`;
const formatDate = (iso: string): string => new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR');
const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const STATUS_STYLES: Record<string, string> = {
  'Vérifiée': 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
  'Vérifiée avec écart': 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/60',
  'Vérifiée avec justification': 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
};

interface CashCheckHistoryProps {
  verifications: CashVerification[];
}

export const CashCheckHistory: React.FC<CashCheckHistoryProps> = ({ verifications }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const sorted = sortVerificationsByConfirmedAtDesc(verifications);

  return (
    <div className="rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <History size={16} className="text-emerald-500" />
          Historique des vérifications de l'argent
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
            {sorted.length}
          </span>
        </h2>
      </div>

      {sorted.length === 0 ? (
        <div className="p-10 text-center space-y-2">
          <History className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600" />
          <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">Aucune vérification enregistrée</p>
          <p className="text-xs text-gray-400">Lancez une vérification pour un jour afin de commencer l'historique.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {sorted.map((v) => {
            const isExpanded = expandedId === v.id;
            return (
              <div key={v.id}>
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : v.id)}
                  className="w-full flex flex-wrap items-center gap-3 sm:gap-6 px-4 sm:px-5 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/40 transition cursor-pointer"
                >
                  <div className="min-w-[110px]">
                    <p className="text-xs font-bold text-gray-900 dark:text-white">{formatDate(v.coveredDate)}</p>
                    <p className="text-[10px] text-gray-400">{formatDateTime(v.confirmedAt)}</p>
                  </div>
                  <div className="text-[11px] text-gray-500 dark:text-gray-400 min-w-[100px]">{v.confirmedBy}</div>
                  <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-gray-500 dark:text-gray-400 min-w-[220px]">
                    <span>
                      Espèces <strong className="text-gray-800 dark:text-gray-200 block">{formatDT(v.cashCountedAmount)}</strong>
                    </span>
                    <span>
                      Tickets net <strong className="text-gray-800 dark:text-gray-200 block">{formatDT(v.restoCountedNet)}</strong>
                    </span>
                    <span>
                      Carte <strong className="text-gray-800 dark:text-gray-200 block">{formatDT(v.cardVerifiedAmount)}</strong>
                    </span>
                    <span>
                      Total <strong className="text-gray-900 dark:text-white block">{formatDT(v.totalCounted)}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-auto">
                    {isSignificantDifference(v.totalDifference) && (
                      <span className="text-[11px] font-semibold text-red-500">
                        {v.totalDifference > 0 ? '+' : ''}
                        {v.totalDifference.toFixed(2)} DT
                      </span>
                    )}
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${STATUS_STYLES[v.status]}`}>
                      {v.status === 'Vérifiée' ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
                      {v.status}
                    </span>
                    {isExpanded ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 sm:px-5 pb-5 space-y-4 bg-gray-50/60 dark:bg-gray-900/20">
                    {v.supersedesId && (
                      <p className="text-[11px] text-gray-400 italic pt-3">
                        Corrige une vérification précédente pour ce jour (conservée dans l'historique).
                      </p>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
                      <div className="p-3 rounded-xl bg-white dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
                        <p className="text-[11px] font-bold text-gray-600 dark:text-gray-300 mb-1.5">Espèces</p>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-gray-400">
                          {CASH_DENOMINATIONS.filter((d) => (v.cashCounts[d.id] || 0) > 0).map((d) => (
                            <span key={d.id}>
                              {d.label} × {v.cashCounts[d.id]}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs font-bold text-gray-900 dark:text-white mt-1.5">
                          Système {formatDT(v.cashSystemAmount)} → Compté {formatDT(v.cashCountedAmount)}
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-white dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
                        <p className="text-[11px] font-bold text-gray-600 dark:text-gray-300 mb-1.5">Tickets restaurant</p>
                        <p className="text-[10px] text-gray-400">Montant compté : {formatDT(v.restoCountedGross)}</p>
                        <p className="text-xs font-bold text-gray-900 dark:text-white mt-1.5">
                          Système {formatDT(v.restoSystemAmount)} (net) → Net {formatDT(v.restoCountedNet)}
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-white dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
                        <p className="text-[11px] font-bold text-gray-600 dark:text-gray-300 mb-1.5">Carte bancaire</p>
                        <p className="text-[10px] text-gray-400">
                          {v.cardVerifiedCount != null ? `${v.cardVerifiedCount} paiement(s)` : 'Nombre non renseigné'}
                        </p>
                        <p className="text-xs font-bold text-gray-900 dark:text-white mt-1.5">
                          Système {formatDT(v.cardSystemAmount)} → Vérifié {formatDT(v.cardVerifiedAmount)}
                        </p>
                      </div>
                    </div>

                    {v.justifications.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-bold text-gray-600 dark:text-gray-300 inline-flex items-center gap-1.5">
                          <MessageSquare size={12} /> Justifications
                        </p>
                        {v.justifications.map((j) => (
                          <div key={j.id} className="p-2.5 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-[11px]">
                            <p className="font-semibold text-gray-800 dark:text-gray-200">
                              {j.category} — {j.difference > 0 ? '+' : ''}
                              {j.difference.toFixed(2)} DT
                            </p>
                            <p className="text-gray-500 dark:text-gray-400">{j.comment}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
