// Shared UI building blocks for every "Rapports et analyses" page — reuses the app's existing
// card/badge/button visual language (rounded-2xl white/dark cards, xs text, emerald primary)
// rather than inventing a separate look for the reporting section.

import React, { useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Minus, Download, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { ReportPeriod, ReportAlert, formatPeriodLabel, computeVariation, getPreviousPeriod, currentPeriod } from '../data/reportsModel';
import { useQueryParam } from '../hooks/useQueryParam';

export const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';
export const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer';

export const formatAmount = (n: number): string => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DT`;
export const formatPercent = (n: number): string => `${(n * 100).toFixed(1)}%`;
export const formatInt = (n: number): string => n.toLocaleString('fr-FR');

// --- Period navigator (month/year), matching FinancialsPage's existing period control ---------

export const ReportPeriodNav: React.FC<{ period: ReportPeriod; onChange: (p: ReportPeriod) => void }> = ({ period, onChange }) => {
  const goPrev = () => onChange(getPreviousPeriod(period));
  const goNext = () => onChange(period.monthIndex === 11 ? { year: period.year + 1, monthIndex: 0 } : { year: period.year, monthIndex: period.monthIndex + 1 });
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Période :</span>
      <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg p-0.5 bg-gray-50/50 dark:bg-gray-800/50">
        <button onClick={goPrev} title="Mois précédent" className="w-7 h-7 rounded-md flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 transition cursor-pointer">
          <ChevronLeft size={15} />
        </button>
        <span className="px-3 text-xs font-bold text-gray-900 dark:text-white whitespace-nowrap">{formatPeriodLabel(period)}</span>
        <button onClick={goNext} title="Mois suivant" className="w-7 h-7 rounded-md flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 transition cursor-pointer">
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
};

// Syncs a report's selected period with ?month=&year= in the URL — every report page uses this
// instead of a plain useState<ReportPeriod>, so "September 2026's sales report" is a shareable,
// bookmarkable link and survives a page refresh. Invalid or missing values fall back to the
// current period rather than crashing or showing a blank report.
export const useReportPeriodParam = (): [ReportPeriod, (p: ReportPeriod) => void] => {
  const now = currentPeriod();
  const [monthStr, setMonthStr] = useQueryParam('month', String(now.monthIndex));
  const [yearStr, setYearStr] = useQueryParam('year', String(now.year));

  const period = useMemo<ReportPeriod>(() => {
    const monthIndex = Number(monthStr);
    const year = Number(yearStr);
    const validMonth = Number.isInteger(monthIndex) && monthIndex >= 0 && monthIndex <= 11 ? monthIndex : now.monthIndex;
    const validYear = Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : now.year;
    return { year: validYear, monthIndex: validMonth };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStr, yearStr]);

  const setPeriod = useCallback(
    (p: ReportPeriod) => {
      setMonthStr(String(p.monthIndex));
      setYearStr(String(p.year));
    },
    [setMonthStr, setYearStr]
  );

  return [period, setPeriod];
};

// --- Page header (title + description + period + PDF export + related-report nav) -------------

export const ReportPageHeader: React.FC<{
  title: string;
  description: string;
  period: ReportPeriod;
  onPeriodChange: (p: ReportPeriod) => void;
  onExportPdf: () => void;
  navLinks?: { label: string; onClick: () => void; icon: React.ComponentType<{ size?: number; className?: string }> }[];
  onNavigateToDashboard: () => void;
}> = ({ title, description, period, onPeriodChange, onExportPdf, navLinks, onNavigateToDashboard }) => (
  <div className="space-y-4">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
          <span>{title}</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
            Rapports et analyses
          </span>
        </h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-2xl">{description}</p>
      </div>
      <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
        {navLinks?.map(({ label, onClick, icon: Icon }) => (
          <button key={label} onClick={onClick} className={secondaryButtonClass}>
            <Icon size={14} className="text-gray-500 dark:text-gray-400" />
            <span>{label}</span>
          </button>
        ))}
        <button onClick={onExportPdf} className={primaryButtonClass}>
          <Download size={14} />
          <span>Exporter en PDF</span>
        </button>
        <button
          onClick={onNavigateToDashboard}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700/80 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition active:scale-98 cursor-pointer"
        >
          <span>Tableau de bord</span>
        </button>
      </div>
    </div>
    <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs">
      <ReportPeriodNav period={period} onChange={onPeriodChange} />
    </div>
  </div>
);

// --- Variation badge (vs. previous period) ------------------------------------------------------

export const VariationBadge: React.FC<{ current: number; previous: number; invert?: boolean }> = ({ current, previous, invert }) => {
  const variation = computeVariation(current, previous);
  if (variation === null) return <span className="text-[11px] font-medium text-gray-400">vs période préc. —</span>;
  const isFlat = Math.abs(variation) < 0.001;
  const isUp = variation > 0;
  const isGood = isFlat ? true : invert ? !isUp : isUp;
  const Icon = isFlat ? Minus : isUp ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${isFlat ? 'text-gray-400' : isGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
      <Icon size={11} /> {formatPercent(Math.abs(variation))} <span className="text-gray-400 font-normal">vs période préc.</span>
    </span>
  );
};

// --- KPI card ------------------------------------------------------------------------------------

const KPI_ICON_BG: Record<string, string> = {
  blue: 'bg-blue-50/80 dark:bg-blue-950/40 text-blue-500',
  emerald: 'bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-500',
  red: 'bg-red-50/80 dark:bg-red-950/40 text-red-500',
  amber: 'bg-amber-50/80 dark:bg-amber-950/40 text-amber-500',
  indigo: 'bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-500',
  gray: 'bg-gray-100 dark:bg-gray-800 text-gray-500',
};

export const ReportKpiCard: React.FC<{
  label: string;
  value: string;
  caption?: string;
  icon: React.ComponentType<{ size?: number }>;
  color?: keyof typeof KPI_ICON_BG;
  variation?: { current: number; previous: number; invert?: boolean };
}> = ({ label, value, caption, icon: Icon, color = 'blue', variation }) => (
  <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
    <div className="space-y-1 min-w-0">
      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block truncate">{label}</span>
      <span className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight block truncate">{value}</span>
      {variation ? <VariationBadge {...variation} /> : caption ? <p className="text-[11px] text-gray-400">{caption}</p> : null}
    </div>
    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${KPI_ICON_BG[color]}`}>
      <Icon size={22} />
    </div>
  </div>
);

// --- Simple, functional charts (no charting library in this project) --------------------------

export const MiniBarChart: React.FC<{ data: { label: string; value: number }[]; formatValue?: (n: number) => string; color?: string }> = ({
  data,
  formatValue = formatAmount,
  color = 'bg-emerald-500',
}) => {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.label}>
          <div className="flex justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-1">
            <span className="truncate pr-2">{d.label}</span>
            <span className="shrink-0 font-medium text-gray-700 dark:text-gray-300">{formatValue(d.value)}</span>
          </div>
          <div className="h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
};

// A lightweight inline-SVG line chart for "évolution mensuelle" trends — no external dependency.
export const MiniLineChart: React.FC<{ data: { label: string; value: number }[]; formatValue?: (n: number) => string; color?: string }> = ({
  data,
  formatValue = formatAmount,
  color = '#00A86B',
}) => {
  const width = 560;
  const height = 160;
  const padding = 28;
  const max = Math.max(...data.map((d) => d.value), 1);
  const min = Math.min(...data.map((d) => d.value), 0);
  const range = max - min || 1;
  const stepX = data.length > 1 ? (width - padding * 2) / (data.length - 1) : 0;
  const points = data.map((d, i) => {
    const x = padding + i * stepX;
    const y = height - padding - ((d.value - min) / range) * (height - padding * 2);
    return { x, y, ...d };
  });
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1]?.x ?? padding} ${height - padding} L ${padding} ${height - padding} Z`;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[420px]" preserveAspectRatio="xMidYMid meet">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="currentColor" className="text-gray-200 dark:text-gray-700" strokeWidth={1} />
        <path d={areaD} fill={color} fillOpacity={0.08} stroke="none" />
        <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p) => (
          <g key={p.label}>
            <circle cx={p.x} cy={p.y} r={3} fill={color} />
            <text x={p.x} y={height - padding + 14} textAnchor="middle" className="fill-gray-400 dark:fill-gray-500" fontSize={9}>
              {p.label}
            </text>
            <title>{`${p.label} : ${formatValue(p.value)}`}</title>
          </g>
        ))}
      </svg>
    </div>
  );
};

// --- Alerts panel (severity-colored, matches the due-soon banner pattern used elsewhere) -------

const SEVERITY_STYLES: Record<ReportAlert['severity'], { wrap: string; icon: React.ComponentType<{ size?: number; className?: string }>; iconColor: string }> = {
  critical: { wrap: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300', icon: AlertCircle, iconColor: 'text-red-500' },
  warning: { wrap: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-300', icon: AlertTriangle, iconColor: 'text-amber-500' },
  info: { wrap: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300', icon: Info, iconColor: 'text-blue-500' },
};

export const ReportAlertsPanel: React.FC<{ alerts: ReportAlert[] }> = ({ alerts }) => {
  if (alerts.length === 0) {
    return (
      <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
        <Info size={14} /> Aucune alerte pour cette période — rien d'anormal détecté.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {alerts.map((a, i) => {
        const s = SEVERITY_STYLES[a.severity];
        const Icon = s.icon;
        return (
          <div key={i} className={`p-2.5 rounded-xl border text-xs flex items-start gap-2 ${s.wrap}`}>
            <Icon size={13} className={`shrink-0 mt-0.5 ${s.iconColor}`} />
            <span><strong className="font-semibold">{a.category}</strong> — {a.message}</span>
          </div>
        );
      })}
    </div>
  );
};

// --- Report card / table section wrapper --------------------------------------------------------

export const ReportSection: React.FC<{ title: string; description?: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, description, action, children }) => (
  <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-3.5">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h2>
        {description && <p className="text-[11px] text-gray-400 mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
    {children}
  </div>
);

export const ReportTable: React.FC<{
  columns: string[];
  align?: ('left' | 'right' | 'center')[];
  rows: React.ReactNode[][];
  totalsRow?: React.ReactNode[];
  emptyLabel?: string;
}> = ({ columns, align, rows, totalsRow, emptyLabel = 'Aucune donnée pour cette période.' }) => (
  <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden overflow-x-auto">
    <table className="w-full text-left border-collapse text-xs">
      <thead>
        <tr className="bg-gray-50/60 dark:bg-gray-800/40 text-[11px] font-bold text-gray-400">
          {columns.map((c, i) => (
            <th key={c} className={`py-2.5 px-3 ${align?.[i] === 'right' ? 'text-right' : align?.[i] === 'center' ? 'text-center' : 'text-left'}`}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
        {rows.length === 0 ? (
          <tr><td colSpan={columns.length} className="text-center py-8 text-gray-400">{emptyLabel}</td></tr>
        ) : (
          rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/30 transition-colors">
              {row.map((cell, ci) => (
                <td key={ci} className={`py-2 px-3 ${align?.[ci] === 'right' ? 'text-right' : align?.[ci] === 'center' ? 'text-center' : 'text-left'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
      {totalsRow && rows.length > 0 && (
        <tfoot>
          <tr className="border-t border-gray-200 dark:border-gray-700 font-bold text-gray-900 dark:text-white bg-gray-50/60 dark:bg-gray-800/40">
            {totalsRow.map((cell, ci) => (
              <td key={ci} className={`py-2 px-3 ${align?.[ci] === 'right' ? 'text-right' : align?.[ci] === 'center' ? 'text-center' : 'text-left'}`}>
                {cell}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  </div>
);
