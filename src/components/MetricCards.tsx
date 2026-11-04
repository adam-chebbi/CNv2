import React, { useState } from 'react';
import {
  Banknote,
  ShoppingCart,
  Wallet,
  TrendingUp,
  Coins,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Users2,
  Package,
  ReceiptText,
  Percent,
  type LucideIcon,
} from 'lucide-react';
import { DashboardPeriodData } from '../data/dashboardModel';

interface MetricCardsProps {
  data: DashboardPeriodData;
  caisseActuelle: string;
  compareWithPrevious: boolean;
  onNavigate: (tab: string, sub?: string) => void;
}

type AccentColor = 'emerald' | 'blue' | 'rose' | 'purple' | 'sky' | 'amber' | 'teal' | 'indigo';

interface KpiCardDef {
  id: string;
  title: string;
  amount: string;
  subtitle: string;
  change?: string;
  accentColor: AccentColor;
  icon: LucideIcon;
  nav: { tab: string; sub?: string };
}

const CARD_STYLES: Record<AccentColor, {
  border: string; bg: string; iconBoxBg: string; iconColor: string;
  arrowIdle: string; arrowHover: string; titleColor: string; valueColor: string; subtitleColor: string;
  circle1: string; circle2: string; circle3: string;
}> = {
  emerald: {
    border: 'border-emerald-300 dark:border-emerald-800', bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    iconBoxBg: 'bg-emerald-100 dark:bg-emerald-900/60', iconColor: 'text-emerald-600 dark:text-emerald-400',
    arrowIdle: 'text-emerald-300 dark:text-emerald-700', arrowHover: 'group-hover:text-emerald-600 dark:group-hover:text-emerald-400',
    titleColor: 'text-emerald-700 dark:text-emerald-400', valueColor: 'text-emerald-900 dark:text-emerald-100',
    subtitleColor: 'text-emerald-600 dark:text-emerald-500',
    circle1: 'bg-emerald-300/40 dark:bg-emerald-500/10', circle2: 'bg-emerald-200/30 dark:bg-emerald-600/10', circle3: 'bg-emerald-400/30 dark:bg-emerald-400/10',
  },
  blue: {
    border: 'border-blue-300 dark:border-blue-800', bg: 'bg-blue-50 dark:bg-blue-950/40',
    iconBoxBg: 'bg-blue-100 dark:bg-blue-900/60', iconColor: 'text-blue-600 dark:text-blue-400',
    arrowIdle: 'text-blue-300 dark:text-blue-700', arrowHover: 'group-hover:text-blue-600 dark:group-hover:text-blue-400',
    titleColor: 'text-blue-700 dark:text-blue-400', valueColor: 'text-blue-900 dark:text-blue-100',
    subtitleColor: 'text-blue-600 dark:text-blue-500',
    circle1: 'bg-blue-300/40 dark:bg-blue-500/10', circle2: 'bg-blue-200/30 dark:bg-blue-600/10', circle3: 'bg-blue-400/30 dark:bg-blue-400/10',
  },
  rose: {
    border: 'border-rose-300 dark:border-rose-800', bg: 'bg-rose-50 dark:bg-rose-950/40',
    iconBoxBg: 'bg-rose-100 dark:bg-rose-900/60', iconColor: 'text-rose-600 dark:text-rose-400',
    arrowIdle: 'text-rose-300 dark:text-rose-700', arrowHover: 'group-hover:text-rose-600 dark:group-hover:text-rose-400',
    titleColor: 'text-rose-700 dark:text-rose-400', valueColor: 'text-rose-900 dark:text-rose-100',
    subtitleColor: 'text-rose-600 dark:text-rose-500',
    circle1: 'bg-rose-300/40 dark:bg-rose-500/10', circle2: 'bg-rose-200/30 dark:bg-rose-600/10', circle3: 'bg-rose-400/30 dark:bg-rose-400/10',
  },
  purple: {
    border: 'border-purple-300 dark:border-purple-800', bg: 'bg-purple-50 dark:bg-purple-950/40',
    iconBoxBg: 'bg-purple-100 dark:bg-purple-900/60', iconColor: 'text-purple-600 dark:text-purple-400',
    arrowIdle: 'text-purple-300 dark:text-purple-700', arrowHover: 'group-hover:text-purple-600 dark:group-hover:text-purple-400',
    titleColor: 'text-purple-700 dark:text-purple-400', valueColor: 'text-purple-900 dark:text-purple-100',
    subtitleColor: 'text-purple-600 dark:text-purple-500',
    circle1: 'bg-purple-300/40 dark:bg-purple-500/10', circle2: 'bg-purple-200/30 dark:bg-purple-600/10', circle3: 'bg-purple-400/30 dark:bg-purple-400/10',
  },
  sky: {
    border: 'border-sky-300 dark:border-sky-800', bg: 'bg-sky-50 dark:bg-sky-950/40',
    iconBoxBg: 'bg-sky-100 dark:bg-sky-900/60', iconColor: 'text-sky-600 dark:text-sky-400',
    arrowIdle: 'text-sky-300 dark:text-sky-700', arrowHover: 'group-hover:text-sky-600 dark:group-hover:text-sky-400',
    titleColor: 'text-sky-700 dark:text-sky-400', valueColor: 'text-sky-900 dark:text-sky-100',
    subtitleColor: 'text-sky-600 dark:text-sky-500',
    circle1: 'bg-sky-300/40 dark:bg-sky-500/10', circle2: 'bg-sky-200/30 dark:bg-sky-600/10', circle3: 'bg-sky-400/30 dark:bg-sky-400/10',
  },
  amber: {
    border: 'border-amber-300 dark:border-amber-800', bg: 'bg-amber-50 dark:bg-amber-950/40',
    iconBoxBg: 'bg-amber-100 dark:bg-amber-900/60', iconColor: 'text-amber-600 dark:text-amber-400',
    arrowIdle: 'text-amber-300 dark:text-amber-700', arrowHover: 'group-hover:text-amber-600 dark:group-hover:text-amber-400',
    titleColor: 'text-amber-700 dark:text-amber-400', valueColor: 'text-amber-900 dark:text-amber-100',
    subtitleColor: 'text-amber-600 dark:text-amber-500',
    circle1: 'bg-amber-300/40 dark:bg-amber-500/10', circle2: 'bg-amber-200/30 dark:bg-amber-600/10', circle3: 'bg-amber-400/30 dark:bg-amber-400/10',
  },
  teal: {
    border: 'border-teal-300 dark:border-teal-800', bg: 'bg-teal-50 dark:bg-teal-950/40',
    iconBoxBg: 'bg-teal-100 dark:bg-teal-900/60', iconColor: 'text-teal-600 dark:text-teal-400',
    arrowIdle: 'text-teal-300 dark:text-teal-700', arrowHover: 'group-hover:text-teal-600 dark:group-hover:text-teal-400',
    titleColor: 'text-teal-700 dark:text-teal-400', valueColor: 'text-teal-900 dark:text-teal-100',
    subtitleColor: 'text-teal-600 dark:text-teal-500',
    circle1: 'bg-teal-300/40 dark:bg-teal-500/10', circle2: 'bg-teal-200/30 dark:bg-teal-600/10', circle3: 'bg-teal-400/30 dark:bg-teal-400/10',
  },
  indigo: {
    border: 'border-indigo-300 dark:border-indigo-800', bg: 'bg-indigo-50 dark:bg-indigo-950/40',
    iconBoxBg: 'bg-indigo-100 dark:bg-indigo-900/60', iconColor: 'text-indigo-600 dark:text-indigo-400',
    arrowIdle: 'text-indigo-300 dark:text-indigo-700', arrowHover: 'group-hover:text-indigo-600 dark:group-hover:text-indigo-400',
    titleColor: 'text-indigo-700 dark:text-indigo-400', valueColor: 'text-indigo-900 dark:text-indigo-100',
    subtitleColor: 'text-indigo-600 dark:text-indigo-500',
    circle1: 'bg-indigo-300/40 dark:bg-indigo-500/10', circle2: 'bg-indigo-200/30 dark:bg-indigo-600/10', circle3: 'bg-indigo-400/30 dark:bg-indigo-400/10',
  },
};

const KpiCard: React.FC<{ card: KpiCardDef; compareWithPrevious: boolean; onNavigate: (tab: string, sub?: string) => void }> = ({
  card,
  compareWithPrevious,
  onNavigate,
}) => {
  const s = CARD_STYLES[card.accentColor];
  const Icon = card.icon;
  const isPositive = card.change ? card.change.startsWith('+') : true;

  return (
    <button
      id={`kpi-card-${card.id}`}
      onClick={() => onNavigate(card.nav.tab, card.nav.sub)}
      className={`group text-left rounded-lg h-full border ${s.border} shadow-sm ${s.bg} hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer w-full`}
    >
      <div className="relative overflow-hidden p-3 sm:p-5">
        <span className={`pointer-events-none absolute -top-3 right-4 w-10 h-10 rounded-full ${s.circle1} animate-ping`} style={{ animationDuration: '6s' }} />
        <span className={`pointer-events-none absolute top-1 right-1 w-14 h-14 rounded-full ${s.circle2} animate-pulse`} style={{ animationDuration: '7s' }} />
        <span className={`pointer-events-none absolute bottom-1 right-8 w-7 h-7 rounded-full ${s.circle3} animate-ping`} style={{ animationDuration: '5s', animationDelay: '2s' }} />

        <div className="flex items-start justify-between mb-3 sm:mb-4">
          <div className={`rounded-xl ${s.iconBoxBg} p-2 sm:p-2.5`}>
            <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${s.iconColor}`} />
          </div>
          <ArrowUpRight className={`h-4 w-4 ${s.arrowIdle} ${s.arrowHover} group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all duration-200`} />
        </div>

        <p className={`${s.titleColor} text-xs mb-1 truncate`}>{card.title}</p>
        <h3 className={`${s.valueColor} text-lg xl:text-2xl font-mono tracking-tight truncate`}>{card.amount}</h3>
        <p className={`${s.subtitleColor} text-[11px] mt-1.5 truncate flex items-center gap-0.5`}>
          {compareWithPrevious && card.change ? (
            isPositive ? <ArrowUpRight size={11} className="shrink-0" /> : <ArrowDownRight size={11} className="shrink-0" />
          ) : null}
          <span className="truncate">{card.subtitle}</span>
        </p>
      </div>
    </button>
  );
};

export const MetricCards: React.FC<MetricCardsProps> = ({
  data,
  caisseActuelle,
  compareWithPrevious,
  onNavigate,
}) => {
  const [showMoreKpis, setShowMoreKpis] = useState(false);

  const coreCards: KpiCardDef[] = [
    {
      id: 'total-sales',
      title: 'Ventes totales',
      amount: data.turnover,
      subtitle: compareWithPrevious ? `${data.turnoverChange} vs période préc.` : 'ventes de la période',
      change: data.turnoverChange,
      accentColor: 'emerald',
      icon: Banknote,
      nav: { tab: 'sales' },
    },
    {
      id: 'total-purchases',
      title: 'Achat total des biens et services',
      amount: data.purchases,
      subtitle: compareWithPrevious ? `${data.purchasesChange} vs période préc.` : 'achats de la période',
      change: data.purchasesChange,
      accentColor: 'blue',
      icon: ShoppingCart,
      nav: { tab: 'purchases_mgmt', sub: 'purchases_acquisitions' },
    },
    {
      id: 'total-expenses',
      title: 'Total des dépenses',
      amount: data.expenses,
      subtitle: compareWithPrevious ? `${data.expensesChange} vs période préc.` : 'dépenses approuvées',
      change: data.expensesChange,
      accentColor: 'rose',
      icon: Wallet,
      nav: { tab: 'expenses_mgmt', sub: 'expenses' },
    },
    {
      id: 'benefice',
      title: 'Bénéfices',
      amount: data.benefice,
      subtitle: compareWithPrevious ? `${data.beneficeChange} vs période préc.` : 'ventes nettes − achats − dépenses',
      change: data.beneficeChange,
      accentColor: 'purple',
      icon: TrendingUp,
      nav: { tab: 'reports_mgmt', sub: 'report_finance' },
    },
    {
      id: 'caisse-actuelle',
      title: 'Total caisse actuelle',
      amount: caisseActuelle,
      subtitle: 'Espèces + Carte + Tickets resto',
      accentColor: 'sky',
      icon: Coins,
      nav: { tab: 'sales_mgmt', sub: 'sales_cash_check' },
    },
  ];

  const additionalKpis: KpiCardDef[] = [
    {
      id: 'staff-cost',
      title: 'Coût du personnel',
      amount: data.staffCost,
      subtitle: compareWithPrevious ? `${data.staffCostChange} (${data.staffCostRatio})` : data.staffCostRatio,
      change: data.staffCostChange,
      accentColor: 'amber',
      icon: Users2,
      nav: { tab: 'staff_mgmt', sub: 'staff_finance' },
    },
    {
      id: 'stock-value',
      title: 'Valeur du stock',
      amount: data.stockValue,
      subtitle: 'Valeur actuelle du stock (instantané)',
      accentColor: 'teal',
      icon: Package,
      nav: { tab: 'stock', sub: 'stock_overview' },
    },
    {
      id: 'ticket-count',
      title: 'Nombre de tickets',
      amount: `${data.ticketCount} tickets`,
      subtitle: compareWithPrevious ? `${data.ticketCountChange} (${data.itemsPerTicket})` : data.itemsPerTicket,
      change: data.ticketCountChange,
      accentColor: 'indigo',
      icon: ReceiptText,
      nav: { tab: 'sales' },
    },
    {
      id: 'estimated-margin',
      title: 'Marge estimée',
      amount: data.estimatedMargin,
      subtitle: compareWithPrevious ? `${data.estimatedMarginChange} (taux: ${data.marginPercent})` : `${data.marginPercent} de marge brute`,
      change: data.estimatedMarginChange,
      accentColor: 'emerald',
      icon: Percent,
      nav: { tab: 'reports_mgmt', sub: 'report_finance' },
    },
  ];

  return (
    <div id="metric-cards-section" className="space-y-3">
      {/* 5 Classic Core Metric Cards */}
      <div id="metric-cards-container" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {coreCards.map((card) => (
          <KpiCard key={card.id} card={card} compareWithPrevious={compareWithPrevious} onNavigate={onNavigate} />
        ))}
      </div>

      {/* Button to see more KPI cards: Coût du personnel, Valeur du stock, Nombre de tickets, Marge estimée */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">
          {showMoreKpis
            ? "9 indicateurs d'exploitation affichés pour Café Noir"
            : '5 indicateurs principaux affichés'}
        </span>

        <button
          id="toggle-more-kpis-button"
          onClick={() => setShowMoreKpis(!showMoreKpis)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer"
        >
          <SlidersHorizontal size={13} className="text-emerald-600 dark:text-emerald-400" />
          <span>
            {showMoreKpis ? 'Masquer les indicateurs additionnels' : "Voir plus d'indicateurs (KPIs)"}
          </span>
          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
            +4
          </span>
          {showMoreKpis ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {/* Additional 4 KPI cards shown when toggled */}
      {showMoreKpis && (
        <div id="additional-kpi-cards-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-1 animate-in fade-in slide-in-from-top-2">
          {additionalKpis.map((kpi) => (
            <KpiCard key={kpi.id} card={kpi} compareWithPrevious={compareWithPrevious} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
};
