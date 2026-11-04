import React, { useEffect, useRef, useState } from 'react';
import { Copy, Check, X } from 'lucide-react';
import { DailySalesCalendarData, DailySalesCalendarCell } from '../data/dashboardModel';

interface ActivityHeatmapProps {
  data: DailySalesCalendarData;
}

const LEVEL_CLASSES = ['bg-primary/5', 'bg-primary/20', 'bg-primary/40', 'bg-primary/60', 'bg-primary/80', 'bg-primary'];
const WEEKDAY_SHORT_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

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

interface TooltipState {
  cell: DailySalesCalendarCell;
  weekTotal: number;
  x: number;
  y: number;
}

const buildCopyText = (t: TooltipState): string => {
  const avg = t.cell.operations > 0 ? t.cell.revenue / t.cell.operations : 0;
  const pct = t.weekTotal > 0 ? (t.cell.revenue / t.weekTotal) * 100 : 0;
  return [
    formatCellDateLabel(t.cell.dateIso),
    `Ventes du jour: ${formatDT(t.cell.revenue)}`,
    `Opérations: ${t.cell.operations}`,
    `Articles vendus: ${t.cell.itemsSold}`,
    `Vente moyenne: ${formatDT(avg)}`,
    `% de cette semaine: ${pct.toFixed(1)}%`,
  ].join('\n');
};

export const ActivityHeatmap: React.FC<ActivityHeatmapProps> = ({ data }) => {
  const [hovered, setHovered] = useState<TooltipState | null>(null);
  const [pinned, setPinned] = useState<TooltipState | null>(null);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const active = pinned ?? hovered;

  const buildTooltipState = (
    cell: DailySalesCalendarCell,
    weekTotal: number,
    e: React.MouseEvent<HTMLDivElement>
  ): TooltipState => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { cell, weekTotal, x: rect.left + rect.width / 2, y: rect.top };
  };

  const handleCellClick = (cell: DailySalesCalendarCell, weekTotal: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (!cell.inRange) return;
    // Read the DOM rect synchronously, right now — e.currentTarget is nulled by React once this
    // handler returns, so it can't be read lazily from inside a setState updater callback.
    const nextState = buildTooltipState(cell, weekTotal, e);
    setHovered(null);
    setPinned((prev) => (prev && prev.cell.dateIso === cell.dateIso ? null : nextState));
  };

  // A click anywhere outside the card closes a pinned tooltip; clicks on the tooltip itself
  // (e.g. the copy button) stay inside the card ref, so they never trigger this.
  useEffect(() => {
    if (!pinned) return;
    const handleOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setPinned(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [pinned]);

  useEffect(() => {
    setCopied(false);
  }, [pinned]);

  const handleCopy = () => {
    if (!active) return;
    navigator.clipboard
      .writeText(buildCopyText(active))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  };

  return (
    <div
      id="daily-sales-calendar-card"
      ref={rootRef}
      className="rounded-lg bg-white dark:bg-slate-900 border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden h-full flex flex-col"
    >
      {/* Header */}
      <div className="flex flex-col space-y-1.5 p-5 pb-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="tracking-tight text-base font-semibold text-gray-900 dark:text-white">Ventes par jour</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Les 8 derniers mois · plus sombre = plus occupé</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
            <span>Faible</span>
            <div className="w-4 h-4 rounded-sm bg-primary/20" />
            <div className="w-4 h-4 rounded-sm bg-primary/40" />
            <div className="w-4 h-4 rounded-sm bg-primary/60" />
            <div className="w-4 h-4 rounded-sm bg-primary/80" />
            <div className="w-4 h-4 rounded-sm bg-primary" />
            <span>Très haut</span>
          </div>
        </div>
      </div>

      {/* Calendar grid: rows = weekdays, columns = weeks grouped under month labels, centered in the card */}
      <div className="p-4 overflow-x-auto flex-1 flex flex-col items-center justify-center">
        <div className="w-max">
          {/* Month labels row */}
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

          {/* Day rows x week columns */}
          <div className="flex items-start gap-1.5">
            <div className="w-10 shrink-0 flex flex-col gap-1.5">
              {WEEKDAY_SHORT_FR.map((label) => (
                <div key={label} className="h-3.5 flex items-center justify-end pr-2 text-[10px] text-gray-400 dark:text-gray-500">
                  {label}
                </div>
              ))}
            </div>
            <div className="flex gap-1">
              {data.weeks.map((week, wi) => {
                const weekTotal = week.cells.reduce((s, c) => (c.inRange ? s + c.revenue : s), 0);
                return (
                  <div key={wi} className="flex flex-col gap-1.5">
                    {week.cells.map((cell) => {
                      const level = computeLevel(cell.revenue, data.maxValue);
                      const isPinned = pinned?.cell.dateIso === cell.dateIso;
                      return (
                        <div
                          key={cell.dateIso}
                          onMouseEnter={(e) => !pinned && cell.inRange && setHovered(buildTooltipState(cell, weekTotal, e))}
                          onMouseLeave={() => !pinned && setHovered(null)}
                          onClick={(e) => handleCellClick(cell, weekTotal, e)}
                          className={`w-3.5 h-3.5 rounded-sm transition-transform ${
                            cell.inRange
                              ? `cursor-pointer hover:scale-125 hover:z-10 ${LEVEL_CLASSES[level]} ${
                                  isPinned ? 'ring-2 ring-offset-1 ring-primary dark:ring-offset-slate-900' : ''
                                }`
                              : 'bg-transparent pointer-events-none'
                          }`}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Tooltip: transient preview on hover, or pinned (interactive + copyable) after a click */}
      {active && (
        <div
          className={`fixed z-50 bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-3 text-xs min-w-[190px] ${
            pinned ? 'pointer-events-auto select-text' : 'pointer-events-none select-none'
          }`}
          style={{ left: active.x, top: active.y - 10, transform: 'translate(-50%, -100%)' }}
        >
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="font-bold text-gray-900 dark:text-white">{formatCellDateLabel(active.cell.dateIso)}</p>
            {pinned && (
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={handleCopy}
                  title="Copier les détails"
                  className="p-1 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                >
                  {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                </button>
                <button
                  type="button"
                  onClick={() => setPinned(null)}
                  title="Fermer"
                  className="p-1 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>
          <div className="space-y-1">
            <div className="flex justify-between gap-4 text-gray-400 dark:text-gray-500">
              <span>Ventes du jour:</span>
              <span className="font-semibold text-gray-900 dark:text-white">{formatDT(active.cell.revenue)}</span>
            </div>
            <div className="flex justify-between gap-4 text-gray-400 dark:text-gray-500">
              <span>Opérations:</span>
              <span className="font-semibold text-gray-900 dark:text-white">{active.cell.operations}</span>
            </div>
            <div className="flex justify-between gap-4 text-gray-400 dark:text-gray-500">
              <span>Articles vendus:</span>
              <span className="font-semibold text-gray-900 dark:text-white">{active.cell.itemsSold}</span>
            </div>
            <div className="border-t border-gray-100 dark:border-gray-800 my-1.5" />
            <div className="flex justify-between gap-4 text-gray-400 dark:text-gray-500">
              <span>Vente moyenne:</span>
              <span className="font-mono text-gray-900 dark:text-white">
                {formatDT(active.cell.operations > 0 ? active.cell.revenue / active.cell.operations : 0)}
              </span>
            </div>
            <div className="flex justify-between gap-4 text-gray-400 dark:text-gray-500">
              <span>% de cette semaine:</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {active.weekTotal > 0 ? ((active.cell.revenue / active.weekTotal) * 100).toFixed(1) : '0.0'}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
