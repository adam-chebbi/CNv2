import React, { useState } from 'react';
import { SeriesPoint } from '../data/dashboardModel';
import { TrendingUp, TrendingDown, ArrowUpRight } from 'lucide-react';

interface SalesChartProps {
  data: { days: SeriesPoint[]; months: SeriesPoint[]; years: SeriesPoint[] };
  compareWithPrevious?: boolean;
}

export const SalesChart: React.FC<SalesChartProps> = ({ data: salesByPeriod, compareWithPrevious = true }) => {
  const [activeTab, setActiveTab] = useState<'days' | 'months' | 'years'>('days');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const data = salesByPeriod[activeTab];

  // SVG viewBox coordinates
  const width = 800;
  const height = 270;
  const paddingLeft = 65;
  const paddingRight = 30;
  const paddingTop = 25;
  const paddingBottom = 40;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Max scale calculation
  const maxVal = Math.max(
    ...data.map((d) => Math.max(d.current, d.previous || 0))
  );
  // Round up to nice number (minimum scale so an all-zero dataset still renders a valid axis)
  const roundMax = Math.max(100, Math.ceil((maxVal * 1.15) / 100) * 100);

  // Compute points
  const pointsCurrent = data.map((d, i) => {
    const x = paddingLeft + (i / Math.max(1, data.length - 1)) * chartWidth;
    const y = paddingTop + chartHeight - (d.current / roundMax) * chartHeight;
    return { ...d, x, y };
  });

  const pointsPrevious = data.map((d, i) => {
    const x = paddingLeft + (i / Math.max(1, data.length - 1)) * chartWidth;
    const y = paddingTop + chartHeight - ((d.previous || 0) / roundMax) * chartHeight;
    return { ...d, x, y };
  });

  // Smooth SVG path generator
  const createSmoothPath = (pts: { x: number; y: number }[]) => {
    if (pts.length < 2) return '';
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? i : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
  };

  const linePathCurrent = createSmoothPath(pointsCurrent);
  const linePathPrevious = createSmoothPath(pointsPrevious);
  const areaPath = `${linePathCurrent} L ${pointsCurrent[pointsCurrent.length - 1].x} ${
    paddingTop + chartHeight
  } L ${pointsCurrent[0].x} ${paddingTop + chartHeight} Z`;

  // Dynamic Y ticks
  const yTicks = [
    { label: `${roundMax.toLocaleString()} DT`, value: roundMax },
    { label: `${Math.round((roundMax * 0.75)).toLocaleString()} DT`, value: roundMax * 0.75 },
    { label: `${Math.round((roundMax * 0.5)).toLocaleString()} DT`, value: roundMax * 0.5 },
    { label: `${Math.round((roundMax * 0.25)).toLocaleString()} DT`, value: roundMax * 0.25 },
    { label: '0 DT', value: 0 },
  ];

  const totalCurrent = data.reduce((acc, d) => acc + d.current, 0);
  const totalPrevious = data.reduce((acc, d) => acc + (d.previous || 0), 0);
  const growthRate = (totalPrevious > 0 ? ((totalCurrent - totalPrevious) / totalPrevious) * 100 : totalCurrent > 0 ? 100 : 0).toFixed(1);

  const hoveredPoint = hoveredIndex !== null ? pointsCurrent[hoveredIndex] : null;
  const hoveredPrev = hoveredIndex !== null ? pointsPrevious[hoveredIndex] : null;

  return (
    <div
      id="sales-chart-card"
      className="bg-white dark:bg-[#151D2A] rounded-xl border border-gray-100 dark:border-gray-800 p-4 sm:p-5 shadow-2xs"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-50 dark:border-gray-800/80">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Ventes par jours
            </h3>
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
              <TrendingUp size={10} />
              <span>+{growthRate}% vs précédente</span>
            </span>
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-400">
            Comparatif des ventes avec la période précédente
          </p>
        </div>

        {/* Filter controls: Jours, Mois, Année */}
        <div className="flex items-center gap-3 self-start sm:self-auto">
          {/* Legend */}
          <div className="hidden md:flex items-center gap-3 text-[11px] text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-emerald-600 dark:bg-emerald-400 rounded-full" />
              <span>Période en cours</span>
            </span>
            {compareWithPrevious && (
              <span className="flex items-center gap-1.5 text-gray-400">
                <span className="w-3 h-0.5 border-b border-dashed border-gray-400 dark:border-gray-500" />
                <span>Période précédente</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-800/60 p-1 rounded-full border border-gray-100 dark:border-gray-700/60">
            {(
              [
                { id: 'days', label: 'Jours' },
                { id: 'months', label: 'Mois' },
                { id: 'years', label: 'Année' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                id={`sales-tab-${tab.id}`}
                onClick={() => {
                  setActiveTab(tab.id);
                  setHoveredIndex(null);
                }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-emerald-600 text-white shadow-2xs font-semibold'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SVG Chart */}
      <div className="relative w-full pt-4 overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto min-w-[650px] overflow-visible select-none"
        >
          <defs>
            <linearGradient id="salesPeriodGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Grid lines and Y labels */}
          {yTicks.map((tick) => {
            const y = paddingTop + chartHeight - (tick.value / roundMax) * chartHeight;
            return (
              <g key={tick.value}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="#E2E8F0"
                  strokeOpacity="0.6"
                  strokeDasharray="3 3"
                  className="dark:stroke-gray-800"
                />
                <text
                  x={paddingLeft - 10}
                  y={y + 3.5}
                  textAnchor="end"
                  className="text-[10px] fill-gray-400 dark:fill-gray-500 font-mono"
                >
                  {tick.label}
                </text>
              </g>
            );
          })}

          {/* Area fill for current period */}
          <path d={areaPath} fill="url(#salesPeriodGradient)" />

          {/* Previous Period Line (Dashed) */}
          {compareWithPrevious && (
            <path
              d={linePathPrevious}
              fill="none"
              stroke="#94A3B8"
              strokeWidth="2"
              strokeDasharray="4 4"
              className="dark:stroke-gray-500"
            />
          )}

          {/* Current Period Line (Solid Emerald) */}
          <path
            d={linePathCurrent}
            fill="none"
            stroke="#10B981"
            strokeWidth="2.75"
            strokeLinecap="round"
          />

          {/* X axis tick labels and interactive hover columns */}
          {pointsCurrent.map((pt, i) => (
            <g key={pt.label}>
              <text
                x={pt.x}
                y={paddingTop + chartHeight + 20}
                textAnchor="middle"
                className={`text-[10px] font-medium transition-colors ${
                  hoveredIndex === i
                    ? 'fill-emerald-600 dark:fill-emerald-400 font-bold'
                    : 'fill-gray-400 dark:fill-gray-500'
                }`}
              >
                {pt.label}
              </text>

              {/* Invisible touch/hover target bar */}
              <rect
                x={pt.x - chartWidth / (data.length * 2)}
                y={paddingTop}
                width={chartWidth / data.length}
                height={chartHeight}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              />

              {/* Highlight dot if hovered */}
              {hoveredIndex === i && (
                <>
                  <line
                    x1={pt.x}
                    y1={paddingTop}
                    x2={pt.x}
                    y2={paddingTop + chartHeight}
                    stroke="#10B981"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                    strokeOpacity="0.5"
                  />
                  {pointsPrevious[i] && (
                    <circle
                      cx={pointsPrevious[i].x}
                      cy={pointsPrevious[i].y}
                      r={4}
                      className="fill-slate-400 dark:fill-slate-500 stroke-white dark:stroke-[#151D2A]"
                      strokeWidth={2}
                    />
                  )}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={5}
                    className="fill-emerald-600 dark:fill-emerald-400 stroke-white dark:stroke-[#151D2A]"
                    strokeWidth={2.5}
                  />
                </>
              )}
            </g>
          ))}
        </svg>

        {/* Hover Tooltip Box */}
        {hoveredPoint && hoveredPrev && (
          <div
            className="absolute top-2 right-4 bg-slate-900/90 text-white rounded-xl px-3 py-2 text-xs shadow-lg backdrop-blur-xs border border-slate-800 space-y-1 pointer-events-none animate-in fade-in"
          >
            <div className="font-bold border-b border-slate-700/80 pb-1 text-emerald-400">
              {hoveredPoint.label}
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-300">Période actuelle :</span>
              <span className="font-bold text-white">{hoveredPoint.current.toLocaleString()} DT</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-400">Période précédente :</span>
              <span className="text-slate-300">{hoveredPrev.previous?.toLocaleString()} DT</span>
            </div>
            <div className="flex items-center justify-between gap-4 pt-0.5 border-t border-slate-800 text-[11px]">
              <span className="text-slate-400">Tickets encaissés :</span>
              <span className="font-semibold text-emerald-300">{hoveredPoint.tickets} tickets</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
