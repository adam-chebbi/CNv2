import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { CashCheckCalendarData, CashCheckCalendarCell } from '../../data/cashCheckModel';

interface CashCheckHeatmapProps {
  data: CashCheckCalendarData;
  selectedDate: string;
  todayIso: string;
  onSelectDate: (dateIso: string) => void;
  onResetToToday: () => void;
}

type Metric = 'ventes' | 'depenses' | 'combined';

const WEEKDAY_SHORT_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const LEVEL_CLASSES: Record<Metric, string[]> = {
  ventes: ['bg-emerald-500/10', 'bg-emerald-500/25', 'bg-emerald-500/45', 'bg-emerald-500/65', 'bg-emerald-500/85', 'bg-emerald-500'],
  depenses: ['bg-red-500/10', 'bg-red-500/25', 'bg-red-500/45', 'bg-red-500/65', 'bg-red-500/85', 'bg-red-500'],
  combined: ['bg-blue-500/10', 'bg-blue-500/25', 'bg-blue-500/45', 'bg-blue-500/65', 'bg-blue-500/85', 'bg-blue-500'],
};

const RING_CLASSES: Record<Metric, string> = {
  ventes: 'ring-emerald-500',
  depenses: 'ring-red-500',
  combined: 'ring-blue-500',
};

const METRIC_OPTIONS: { id: Metric; label: string; dot: string }[] = [
  { id: 'ventes', label: 'Ventes', dot: 'bg-emerald-500' },
  { id: 'depenses', label: 'Dépenses / Achats', dot: 'bg-red-500' },
  { id: 'combined', label: 'Ventes + Dépenses/Achats', dot: 'bg-blue-500' },
];

const computeLevel = (value: number, max: number): number => {
  if (value <= 0 || max <= 0) return 0;
  const ratio = value / max;
  if (ratio <= 0.2) return 1;
  if (ratio <= 0.4) return 2;
  if (ratio <= 0.6) return 3;
  if (ratio <= 0.8) return 4;
  return 5;
};

const formatDT = (v: number): string => `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DT`;

const formatCellDateLabel = (iso: string): string => {
  const label = new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

interface HoverState {
  cell: CashCheckCalendarCell;
  x: number;
  y: number;
}

export const CashCheckHeatmap: React.FC<CashCheckHeatmapProps> = ({ data, selectedDate, todayIso, onSelectDate, onResetToToday }) => {
  const [metric, setMetric] = useState<Metric>('ventes');
  const [hovered, setHovered] = useState<HoverState | null>(null);

  const maxValue = metric === 'ventes' ? data.maxVentes : metric === 'depenses' ? data.maxDepenses : data.maxCombined;
  const valueOf = (cell: CashCheckCalendarCell): number =>
    metric === 'ventes' ? cell.ventes : metric === 'depenses' ? cell.depenses : cell.combined;

  return (
    <div className="rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs overflow-hidden">
      <div className="flex flex-col space-y-2.5 p-4 sm:p-5 pb-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Évolution quotidienne</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Les 8 derniers mois · cliquez un jour pour l'inspecter en détail
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
            {selectedDate !== todayIso && (
              <button
                onClick={onResetToToday}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/70 font-semibold cursor-pointer"
              >
                <RotateCcw size={11} />
                <span>Revenir à aujourd'hui</span>
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {METRIC_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setMetric(opt.id)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                metric === opt.id
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${opt.dot}`} />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 overflow-x-auto flex flex-col items-center justify-center">
        <div className="w-max">
          <div className="flex items-start gap-1.5 mb-1.5">
            <div className="w-10 shrink-0" />
            <div className="flex gap-1">
              {data.weeks.map((_, wi) => {
                const monthLabel = data.monthLabels.find((m) => m.weekIndex === wi);
                return (
                  <div key={wi} className="w-3.5 relative h-3.5">
                    {monthLabel && (
                      <span className="absolute left-0 top-0 text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                        {monthLabel.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-start gap-1.5">
            <div className="w-10 shrink-0 flex flex-col gap-1.5">
              {WEEKDAY_SHORT_FR.map((label) => (
                <div key={label} className="h-3.5 flex items-center justify-end pr-2 text-[10px] text-gray-400 dark:text-gray-500">
                  {label}
                </div>
              ))}
            </div>
            <div className="flex gap-1">
              {data.weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-1.5">
                  {week.cells.map((cell) => {
                    const level = computeLevel(valueOf(cell), maxValue);
                    const isSelected = cell.dateIso === selectedDate;
                    return (
                      <div
                        key={cell.dateIso}
                        onMouseEnter={(e) => {
                          if (!cell.inRange) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHovered({ cell, x: rect.left + rect.width / 2, y: rect.top });
                        }}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => cell.inRange && onSelectDate(cell.dateIso)}
                        className={`w-3.5 h-3.5 rounded-sm transition-transform ${
                          cell.inRange
                            ? `cursor-pointer hover:scale-125 hover:z-10 ${LEVEL_CLASSES[metric][level]} ${
                                isSelected ? `ring-2 ring-offset-1 ${RING_CLASSES[metric]} dark:ring-offset-slate-900` : ''
                              }`
                            : 'bg-transparent pointer-events-none'
                        }`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {hovered && (
        <div
          className="fixed z-50 bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-3 text-xs min-w-[180px] pointer-events-none select-none"
          style={{ left: hovered.x, top: hovered.y - 10, transform: 'translate(-50%, -100%)' }}
        >
          <p className="font-bold text-gray-900 dark:text-white mb-1.5">{formatCellDateLabel(hovered.cell.dateIso)}</p>
          <div className="space-y-1">
            <div className="flex justify-between gap-4 text-gray-400 dark:text-gray-500">
              <span>Ventes:</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatDT(hovered.cell.ventes)}</span>
            </div>
            <div className="flex justify-between gap-4 text-gray-400 dark:text-gray-500">
              <span>Dépenses / Achats:</span>
              <span className="font-semibold text-red-600 dark:text-red-400">{formatDT(hovered.cell.depenses)}</span>
            </div>
            <div className="flex justify-between gap-4 text-gray-400 dark:text-gray-500">
              <span>Total activité:</span>
              <span className="font-semibold text-blue-600 dark:text-blue-400">{formatDT(hovered.cell.combined)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
