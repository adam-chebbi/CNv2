import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  ArrowUpDown,
  Filter,
  Info,
  HelpCircle,
} from 'lucide-react';
import { TimeFilterPeriod } from '../types';

interface AnalysisFilterBarProps {
  activePeriod: TimeFilterPeriod;
  onPeriodChange: (period: TimeFilterPeriod) => void;
  compareWithPrevious: boolean;
  onToggleCompare: () => void;
  customStartDate?: string;
  customEndDate?: string;
  onCustomDateChange?: (start: string, end: string) => void;
}

export const AnalysisFilterBar: React.FC<AnalysisFilterBarProps> = ({
  activePeriod,
  onPeriodChange,
  compareWithPrevious,
  onToggleCompare,
  customStartDate = '2026-09-01',
  customEndDate = '2026-09-07',
  onCustomDateChange,
}) => {
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [showCalcExplanation, setShowCalcExplanation] = useState(false);
  const [startDate, setStartDate] = useState(customStartDate);
  const [endDate, setEndDate] = useState(customEndDate);

  const periods: { id: TimeFilterPeriod; label: string; sub: string; rule: string }[] = [
    { id: 'today', label: "Aujourd'hui", sub: '07 Sept.', rule: "Comparé à hier (06 Sept.)" },
    { id: 'yesterday', label: 'Hier', sub: '06 Sept.', rule: "Comparé à avant-hier (05 Sept.)" },
    { id: 'week', label: 'Semaine', sub: 'Sem. 36', rule: "Comparé à la semaine précédente (Sem. 35 / J-7)" },
    { id: 'month', label: 'Mois', sub: 'Septembre', rule: "Comparé au mois précédent (Août 2026)" },
    { id: 'custom', label: 'Période personnalisée', sub: 'Dates', rule: "Comparé à la même durée consécutive antérieure" },
  ];

  const currentPeriodConfig = periods.find((p) => p.id === activePeriod) || periods[0];

  const handleApplyCustom = () => {
    if (onCustomDateChange) {
      onCustomDateChange(startDate, endDate);
    }
    onPeriodChange('custom');
    setShowCustomModal(false);
  };

  return (
    <div className="space-y-2">
      <div
        id="analysis-filter-bar"
        className="bg-white dark:bg-[#151D2A] rounded-xl border border-gray-100 dark:border-gray-800 p-3 sm:p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3"
      >
        {/* Left title & filters label */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-900/40">
            <Filter size={15} />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-1.5">
              <span>Analyse de gestion</span>
              <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                Café Noir POS
              </span>
            </h2>
            <p className="text-[11px] text-gray-400 dark:text-gray-400">
              Filtrer les indicateurs et comparer à la période précédente
            </p>
          </div>
        </div>

        {/* Center / Right controls */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 w-full md:w-auto min-w-0">
          {/* Filter Pills — its own horizontal scroller on narrow screens so 5 pills never force
              the whole card (or page) to overflow sideways. */}
          <div className="flex p-1 bg-gray-50 dark:bg-gray-800/80 rounded-xl border border-gray-100 dark:border-gray-700/60 shadow-2xs overflow-x-auto min-w-0 max-w-full">
            {periods.map((p) => {
              const isActive = activePeriod === p.id;
              return (
                <button
                  key={p.id}
                  id={`filter-period-${p.id}`}
                  onClick={() => {
                    if (p.id === 'custom') {
                      setShowCustomModal(true);
                    } else {
                      onPeriodChange(p.id);
                    }
                  }}
                  className={`shrink-0 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <span>{p.label}</span>
                  {isActive && p.id === 'custom' && (
                    <span className="text-[10px] opacity-80 font-normal hidden sm:inline">
                      ({startDate.slice(5)} - {endDate.slice(5)})
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Previous Period Comparison Toggle */}
            <button
              id="toggle-previous-period-comparison"
              onClick={onToggleCompare}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition shadow-2xs cursor-pointer ${
                compareWithPrevious
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50'
              }`}
              title="Afficher la comparaison avec la période précédente sur les indicateurs et graphiques"
            >
              <ArrowUpDown size={13} className={compareWithPrevious ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'} />
              <span className="hidden sm:inline">Vs période préc.</span>
              <span className="sm:hidden">Vs préc.</span>
              <span
                className={`w-2 h-2 rounded-full ${
                  compareWithPrevious ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              />
            </button>

            {/* Explain calculation info button */}
            <button
              id="toggle-calc-explanation"
              onClick={() => setShowCalcExplanation(!showCalcExplanation)}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs transition cursor-pointer ${
                showCalcExplanation
                  ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-semibold'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50'
              }`}
              title="Comment sont calculées les valeurs de la période précédente ?"
            >
              <HelpCircle size={13} />
              <span className="hidden sm:inline">Calcul</span>
              {showCalcExplanation ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
        </div>
      </div>

      {/* Explanatory text banner on how previous period values are calculated */}
      {showCalcExplanation && (
        <div
          id="previous-period-calculation-explanation"
          className="bg-blue-50/70 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60 rounded-xl p-3.5 sm:p-4 text-xs text-blue-950 dark:text-blue-200 space-y-2.5 animate-in fade-in slide-in-from-top-1"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-blue-900 dark:text-blue-100">
              <Info size={15} className="text-blue-600 dark:text-blue-400 shrink-0" />
              <span>Méthode de calcul des valeurs de la période précédente :</span>
            </div>
            <button
              onClick={() => setShowCalcExplanation(false)}
              className="text-[11px] text-blue-500 hover:text-blue-700 dark:hover:text-blue-300"
            >
              Fermer
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] leading-relaxed">
            <div className="space-y-1.5">
              <p className="font-semibold text-blue-900 dark:text-blue-200">
                1. Formule de variation relative en pourcentage :
              </p>
              <div className="p-2 bg-white/80 dark:bg-blue-900/50 rounded-lg font-mono text-[10px] text-blue-800 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
                Variation (%) = ((Valeur Période Actuelle - Valeur Période Précédente) / Valeur Période Précédente) × 100
              </div>
              <p className="text-blue-700 dark:text-blue-300 text-[11px]">
                Une valeur positive (+14.2%) indique une croissance de l'activité, tandis qu'une valeur négative (-8.8%) indique un repli par rapport au référentiel antérieur.
              </p>
            </div>

            <div className="space-y-1.5">
              <p className="font-semibold text-blue-900 dark:text-blue-200">
                2. Périodes de référence équivalentes appliquées :
              </p>
              <ul className="space-y-1 list-disc list-inside text-blue-800 dark:text-blue-300 text-[11px]">
                <li><span className="font-semibold">Aujourd'hui :</span> comparé aux ventes réelles d'hier (J-1).</li>
                <li><span className="font-semibold">Hier :</span> comparé à la journée d'avant-hier (J-2).</li>
                <li><span className="font-semibold">Semaine :</span> comparée à la semaine calendaire précédente (S-1 / J-7 à J-13).</li>
                <li><span className="font-semibold">Mois :</span> comparé au mois civil précédent (M-1).</li>
                <li><span className="font-semibold">Période personnalisée :</span> comparée au même nombre de jours consécutifs immédiatement antérieurs.</li>
              </ul>
            </div>
          </div>

          <div className="pt-1 text-[10px] text-blue-600 dark:text-blue-400 flex items-center gap-1.5 border-t border-blue-200/50 dark:border-blue-900/40">
            <span className="font-semibold">Référentiel actuellement actif :</span>
            <span>{currentPeriodConfig.rule}</span>
          </div>
        </div>
      )}

      {/* Custom Date Modal */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in" onClick={() => setShowCustomModal(false)}>
          <div className="bg-white dark:bg-[#151D2A] rounded-2xl p-5 border border-gray-100 dark:border-gray-800 shadow-2xl max-w-sm w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <CalendarIcon size={16} className="text-emerald-600" />
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  Période personnalisée
                </h3>
              </div>
              <button
                onClick={() => setShowCustomModal(false)}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">
                  Date de début
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">
                  Date de fin
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCustomModal(false)}
                className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition"
              >
                Annuler
              </button>
              <button
                onClick={handleApplyCustom}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition"
              >
                Appliquer le filtre
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
