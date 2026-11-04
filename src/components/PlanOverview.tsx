import React, { useState } from 'react';
import { Target, TrendingUp, CheckCircle2, Pencil } from 'lucide-react';
import { CategoryShare } from '../data/dashboardModel';
import { ObjectivePicker } from './ObjectivePicker';

interface PlanOverviewProps {
  categories: CategoryShare[];
  monthlyTarget: number;
  achievedToDate: number;
  isCustomTarget?: boolean;
  onSetMonthlyTarget?: (amount: number) => Promise<void>;
}

const formatDT = (v: number): string => `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DT`;

export const PlanOverview: React.FC<PlanOverviewProps> = ({
  categories,
  monthlyTarget,
  achievedToDate,
  isCustomTarget = false,
  onSetMonthlyTarget,
}) => {
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [showObjectivePicker, setShowObjectivePicker] = useState(false);

  // Circle geometry for SVG donut (r=40 -> circumference = 2 * PI * 40 ≈ 251.32)
  const circumference = 251.32;
  const targetPercent = monthlyTarget > 0 ? Math.round((achievedToDate / monthlyTarget) * 1000) / 10 : 0;
  const currentMonthLabel = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const hovered = categories.find((c) => c.id === hoveredCategory);

  return (
    <div
      id="plan-overview-card"
      className="rounded-lg bg-white dark:bg-slate-900 border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden h-full flex flex-col"
    >
      {/* Header */}
      <div className="flex flex-col space-y-1.5 p-5 pb-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="tracking-tight text-base font-semibold text-gray-900 dark:text-white truncate">Vue d'ensemble du plan</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">Répartition des ventes par catégorie</p>
          </div>
          <span className="inline-flex items-center shrink-0 rounded-md border border-primary/30 px-2 py-1 ring-1 ring-inset ring-primary/20 text-xs font-medium text-primary capitalize">
            {currentMonthLabel}
          </span>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 dark:divide-gray-800 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <button
          type="button"
          onClick={() => onSetMonthlyTarget && setShowObjectivePicker(true)}
          disabled={!onSetMonthlyTarget}
          title={onSetMonthlyTarget ? "Cliquer pour définir l'objectif du mois" : undefined}
          className={`group flex items-center gap-3 px-4 py-3 text-left transition-colors ${
            onSetMonthlyTarget ? 'cursor-pointer hover:bg-blue-50/60 dark:hover:bg-blue-950/20' : ''
          }`}
        >
          <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0 transition-transform group-hover:scale-105">
            <Target className="h-4 w-4 text-blue-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate flex items-center gap-1">
              Objectif mois
              {onSetMonthlyTarget && (
                <Pencil size={10} className="text-gray-300 dark:text-gray-600 group-hover:text-blue-500 transition-colors shrink-0" />
              )}
            </p>
            <p className="text-sm font-bold text-gray-900 dark:text-white font-mono truncate">{formatDT(monthlyTarget)}</p>
          </div>
        </button>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center shrink-0">
            <TrendingUp className="h-4 w-4 text-orange-500" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">Réalisé</p>
            <p className="text-sm font-bold text-gray-900 dark:text-white font-mono truncate">{formatDT(achievedToDate)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">Progression</p>
            <p className="text-sm font-bold truncate text-emerald-600 dark:text-emerald-400">{targetPercent}%</p>
          </div>
        </div>
      </div>

      {/* Donut chart & category legend — the ring (with the overall progression %) always shows,
          even with zero sales; only the per-category legend is replaced by an empty-state note. */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-center">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-2">
          <div className="relative flex items-center justify-center w-full min-h-[180px] sm:min-h-[220px] flex-1">
            <svg className="w-36 h-36 sm:w-44 sm:h-44 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" className="stroke-gray-100 dark:stroke-gray-800" strokeWidth="9" fill="transparent" />
              {categories.map((cat) => {
                const dashLength = (circumference * cat.strokeLength) / 100;
                const dashGap = circumference - dashLength;
                const rotationAngle = (cat.strokeOffset / 100) * 360;
                const isSelected = hoveredCategory === cat.id;

                return (
                  <circle
                    key={cat.id}
                    cx="50"
                    cy="50"
                    r="40"
                    stroke={cat.color}
                    strokeWidth={isSelected ? '11' : '9'}
                    strokeDasharray={`${dashLength} ${dashGap}`}
                    strokeDashoffset="0"
                    transform={`rotate(${rotationAngle} 50 50)`}
                    fill="transparent"
                    className="transition-all duration-200 cursor-pointer"
                    onMouseEnter={() => setHoveredCategory(cat.id)}
                    onMouseLeave={() => setHoveredCategory(null)}
                  />
                );
              })}
            </svg>

            <div className="absolute flex flex-col items-center pointer-events-none text-center">
              <span className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">
                {hovered ? `${hovered.percent}%` : `${targetPercent}%`}
              </span>
              <span className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white mt-0.5 max-w-[110px] leading-tight truncate">
                {hovered ? hovered.label : 'Progression'}
              </span>
            </div>
          </div>

          {categories.length === 0 ? (
            <div className="w-full sm:w-32 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 border-gray-100 dark:border-gray-800">
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center sm:text-left">
                Aucune vente enregistrée sur la période.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:flex sm:flex-col gap-2.5 sm:gap-3 w-full sm:w-32 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 border-gray-100 dark:border-gray-800">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center gap-1.5 min-w-0 cursor-pointer"
                  onMouseEnter={() => setHoveredCategory(cat.id)}
                  onMouseLeave={() => setHoveredCategory(null)}
                >
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                  <p
                    className={`text-xs truncate transition-colors ${
                      hoveredCategory === cat.id ? 'text-gray-900 dark:text-white font-semibold' : 'text-gray-400 dark:text-gray-500'
                    }`}
                  >
                    {cat.label}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showObjectivePicker && onSetMonthlyTarget && (
        <ObjectivePicker
          currentTarget={monthlyTarget}
          achievedToDate={achievedToDate}
          isCustomTarget={isCustomTarget}
          monthLabel={currentMonthLabel}
          onSave={onSetMonthlyTarget}
          onClose={() => setShowObjectivePicker(false)}
        />
      )}
    </div>
  );
};
