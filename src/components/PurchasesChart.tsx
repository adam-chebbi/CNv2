import React, { useState } from 'react';
import { PurchasesPeriodPoint, buildPurchasesByPeriod } from '../data/dashboardModel';
import type { PurchaseOrder } from '../data/purchasesModel';

interface PurchasesChartProps {
  orders: PurchaseOrder[];
}

type Tab = 'days' | 'months' | 'years';
const TABS: { id: Tab; label: string }[] = [
  { id: 'days', label: 'Jours' },
  { id: 'months', label: 'Mois' },
  { id: 'years', label: 'Année' },
];

// Top-corners-only rounded bar (matches the reference chart's bar shape).
const roundedTopBarPath = (x: number, y: number, w: number, h: number, baseline: number): string => {
  const r = Math.min(4, h, w / 2);
  if (h <= 0) return '';
  return `M${x},${y + r} A${r},${r},0,0,1,${x + r},${y} L${x + w - r},${y} A${r},${r},0,0,1,${x + w},${y + r} L${x + w},${baseline} L${x},${baseline} Z`;
};

const formatDT = (v: number): string => `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DT`;

export const PurchasesChart: React.FC<PurchasesChartProps> = ({ orders }) => {
  const [activeTab, setActiveTab] = useState<Tab>('days');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const byPeriod = buildPurchasesByPeriod(orders);
  const data: PurchasesPeriodPoint[] = byPeriod[activeTab];

  const width = 800;
  const height = 270;
  const paddingLeft = 65;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 30;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const baseline = paddingTop + chartHeight;

  const maxVal = Math.max(...data.map((d) => d.amount));
  const roundMax = Math.max(100, Math.ceil((maxVal * 1.15) / 100) * 100);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ value: roundMax * f, label: formatDT(roundMax * f) }));

  const slotWidth = chartWidth / data.length;
  const barWidth = Math.min(38, Math.max(10, slotWidth * 0.5));

  return (
    <div id="purchases-chart-card" className="rounded-lg bg-white dark:bg-slate-900 border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex flex-col space-y-1.5 p-5 pb-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="tracking-tight text-base font-semibold text-gray-900 dark:text-white">Vue d'ensemble des achats</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Approvisionnements de café, laits et stocks</p>
          </div>
          <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-800/60 p-1 rounded-full border border-gray-100 dark:border-gray-700/60 self-start sm:self-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                id={`purchases-tab-${tab.id}`}
                onClick={() => {
                  setActiveTab(tab.id);
                  setHoveredIdx(null);
                }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-primary text-white shadow-2xs font-semibold'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bar chart */}
      <div className="p-4 sm:p-5">
        <div className="relative w-full overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[650px] overflow-visible select-none">
            {/* Horizontal dashed grid + Y labels */}
            {yTicks.map((tick) => {
              const y = baseline - (tick.value / roundMax) * chartHeight;
              return (
                <g key={tick.value}>
                  <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="currentColor" className="text-primary/20" strokeDasharray="3 3" />
                  <text x={paddingLeft - 10} y={y + 3.5} textAnchor="end" className="text-[10px] fill-gray-400 dark:fill-gray-500 font-mono">
                    {tick.label}
                  </text>
                </g>
              );
            })}
            <line x1={paddingLeft} y1={baseline} x2={width - paddingRight} y2={baseline} stroke="currentColor" className="text-primary/40" />

            {/* Bars */}
            {data.map((pt, i) => {
              const slotCenterX = paddingLeft + i * slotWidth + slotWidth / 2;
              const barH = Math.max(2, (pt.amount / roundMax) * chartHeight);
              const barY = baseline - barH;
              const isHovered = hoveredIdx === i;

              return (
                <g key={pt.dateKey} className="cursor-pointer" onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)}>
                  <path
                    d={roundedTopBarPath(slotCenterX - barWidth / 2, barY, barWidth, barH, baseline)}
                    className="fill-primary transition-opacity"
                    fillOpacity={isHovered ? 1 : 0.7}
                  />
                  {pt.amount > 0 && (
                    <text x={slotCenterX} y={barY - 6} textAnchor="middle" className="text-[10px] font-semibold fill-primary hidden sm:block">
                      {formatDT(pt.amount)}
                    </text>
                  )}
                  <text
                    x={slotCenterX}
                    y={baseline + 20}
                    textAnchor="middle"
                    className={`text-[10px] font-medium transition-colors ${
                      isHovered ? 'fill-primary font-bold' : 'fill-gray-400 dark:fill-gray-500'
                    }`}
                  >
                    {pt.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Hover tooltip */}
          {hoveredIdx !== null && data[hoveredIdx] && (
            <div className="absolute top-2 right-4 bg-slate-900/90 text-white rounded-xl px-3 py-2 text-xs shadow-lg backdrop-blur-xs border border-slate-800 space-y-1 pointer-events-none animate-in fade-in">
              <div className="font-bold border-b border-slate-700/80 pb-1 text-primary">{data[hoveredIdx].label}</div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-300">Achats :</span>
                <span className="font-bold text-white">{formatDT(data[hoveredIdx].amount)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
