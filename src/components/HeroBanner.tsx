import React, { useEffect, useState } from 'react';
import {
  Monitor,
  Wallet,
  ShoppingCart,
  FileText,
} from 'lucide-react';

interface HeroBannerProps {
  todaySalesLabel: string;
  growthLabel: string;
  growthIsPositive: boolean;
  onNavigate: (tab: string, sub?: string) => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  todaySalesLabel,
  growthLabel,
  growthIsPositive,
  onNavigate,
}) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      id="hero-greeting-banner"
      className={`group relative overflow-hidden rounded-2xl bg-slate-800 dark:bg-slate-900 px-4 sm:px-6 py-5 transition-all duration-700 ${
        mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      {/* Ambient blurred glows */}
      <span
        className="pointer-events-none absolute -top-10 -left-10 w-48 h-48 rounded-full bg-emerald-500/10 blur-2xl animate-pulse"
        style={{ animationDuration: '4s' }}
      />
      <span
        className="pointer-events-none absolute -bottom-10 right-0 w-56 h-56 rounded-full bg-blue-500/10 blur-2xl animate-pulse"
        style={{ animationDuration: '5s', animationDelay: '1.5s' }}
      />
      <span
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full bg-violet-500/5 blur-2xl animate-pulse"
        style={{ animationDuration: '6s', animationDelay: '0.8s' }}
      />

      {/* Twinkling accent dots */}
      <span
        className="pointer-events-none absolute top-4 left-1/3 w-1.5 h-1.5 rounded-full bg-emerald-400/80 shadow-[0_0_6px_2px_rgba(52,211,153,0.6)] animate-ping"
        style={{ animationDuration: '3s' }}
      />
      <span
        className="pointer-events-none absolute bottom-4 left-1/4 w-1 h-1 rounded-full bg-blue-400/70 shadow-[0_0_4px_2px_rgba(96,165,250,0.5)] animate-ping"
        style={{ animationDuration: '4s', animationDelay: '1s' }}
      />
      <span
        className="pointer-events-none absolute top-3 right-1/4 w-1.5 h-1.5 rounded-full bg-violet-400/70 shadow-[0_0_6px_2px_rgba(167,139,250,0.5)] animate-ping"
        style={{ animationDuration: '3.5s', animationDelay: '0.5s' }}
      />
      <span
        className="pointer-events-none absolute bottom-3 right-1/3 w-1 h-1 rounded-full bg-emerald-300/80 shadow-[0_0_4px_2px_rgba(110,231,183,0.5)] animate-ping"
        style={{ animationDuration: '2.8s', animationDelay: '1.8s' }}
      />

      {/* Animated wave background */}
      <div className="pointer-events-none absolute bottom-0 left-0 w-full overflow-hidden" style={{ height: 40 }}>
        <div className="absolute bottom-0 left-0 w-[200%] animate-water-wave-1">
          <svg viewBox="0 0 2400 40" preserveAspectRatio="none" className="w-full h-[40px]">
            <path
              fill="rgba(52,211,153,0.12)"
              d="M0,20 C150,38 350,0 600,20 C850,38 1050,0 1200,20 C1350,38 1550,0 1800,20 C2050,38 2250,0 2400,20 L2400,40 L0,40 Z"
            />
          </svg>
        </div>
        <div className="absolute bottom-0 left-0 w-[200%] animate-water-wave-2">
          <svg viewBox="0 0 2400 40" preserveAspectRatio="none" className="w-full h-[40px]">
            <path
              fill="rgba(96,165,250,0.09)"
              d="M0,26 C200,10 400,38 600,22 C800,8 1000,36 1200,24 C1400,10 1600,38 1800,22 C2000,8 2200,36 2400,24 L2400,40 L0,40 Z"
            />
          </svg>
        </div>
        <div className="absolute bottom-0 left-0 w-[200%] animate-water-wave-3">
          <svg viewBox="0 0 2400 40" preserveAspectRatio="none" className="w-full h-[40px]">
            <path
              fill="rgba(167,139,250,0.07)"
              d="M0,30 C300,14 500,38 700,28 C900,16 1100,38 1200,28 C1400,14 1600,38 1900,28 C2100,16 2300,38 2400,28 L2400,40 L0,40 Z"
            />
          </svg>
        </div>
      </div>

      <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Left greeting & day's summary */}
        <div className="group-hover:translate-x-1 transition-transform duration-300 min-w-0">
          <p className="text-slate-400 text-sm mb-0.5">Je vous salue,</p>
          <div className="flex items-center gap-2">
            <h2 className="text-white text-xl sm:text-2xl font-bold truncate group-hover:text-primary transition-colors duration-300">
              Café Noir
            </h2>
            <span className="text-2xl sm:text-3xl select-none animate-pulse">☕</span>
          </div>
          <p className="text-slate-400 text-xs mt-1 group-hover:text-slate-300 transition-colors duration-300">
            Voici ce qui se passe dans votre café aujourd'hui.
          </p>
          <div className="flex items-center gap-3 mt-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-primary/70 rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1.2s' }} />
              <div className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '150ms', animationDuration: '1.2s' }} />
              <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '300ms', animationDuration: '1.2s' }} />
            </div>
            <span className="text-primary font-semibold text-sm font-mono">{todaySalesLabel} Les ventes de ce jour</span>
          </div>
        </div>

        {/* Right side stats & quick action tiles */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-xl bg-white/10 px-4 py-2.5 text-center min-w-[80px] hover:bg-white/15 hover:scale-105 transition-all duration-300">
            <p className="text-white text-lg font-mono leading-tight">{todaySalesLabel}</p>
            <p className="text-slate-400 text-[11px]">Aujourd'hui, les ventes</p>
          </div>

          <div className="rounded-xl bg-white/10 px-4 py-2.5 text-center min-w-[80px] hover:bg-white/15 hover:scale-105 transition-all duration-300">
            <p className={`text-lg font-bold leading-tight ${growthIsPositive ? 'text-emerald-400' : 'text-rose-400'}`}>{growthLabel}</p>
            <p className="text-slate-400 text-[11px]">La croissance</p>
          </div>

          {/* Ventes */}
          <button
            id="hero-quick-sales"
            onClick={() => onNavigate('sales')}
            className="flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all duration-200 hover:bg-emerald-400/10 group/qa cursor-pointer"
          >
            <Monitor size={20} className="text-emerald-300 group-hover/qa:text-emerald-200 transition-all duration-200 group-hover/qa:-translate-y-0.5" />
            <span className="text-slate-400 text-[10px] whitespace-nowrap group-hover/qa:text-slate-300 transition-colors duration-200">Ventes</span>
          </button>

          {/* Dépenses */}
          <button
            id="hero-quick-expenses"
            onClick={() => onNavigate('expenses_mgmt', 'expenses')}
            className="flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all duration-200 hover:bg-blue-400/10 group/qa cursor-pointer"
          >
            <Wallet size={20} className="text-blue-300 group-hover/qa:text-blue-200 transition-all duration-200 group-hover/qa:-translate-y-0.5" />
            <span className="text-slate-400 text-[10px] whitespace-nowrap group-hover/qa:text-slate-300 transition-colors duration-200">Dépenses</span>
          </button>

          {/* Achats */}
          <button
            id="hero-quick-purchases"
            onClick={() => onNavigate('purchases_mgmt', 'purchases_acquisitions')}
            className="flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all duration-200 hover:bg-violet-400/10 group/qa cursor-pointer"
          >
            <ShoppingCart size={20} className="text-violet-300 group-hover/qa:text-violet-200 transition-all duration-200 group-hover/qa:-translate-y-0.5" />
            <span className="text-slate-400 text-[10px] whitespace-nowrap group-hover/qa:text-slate-300 transition-colors duration-200">Achats</span>
          </button>

          {/* Rapports mensuels */}
          <button
            id="hero-quick-reports"
            onClick={() => onNavigate('reports_mgmt', 'report_monthly')}
            className="flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all duration-200 hover:bg-white/10 group/qa cursor-pointer"
          >
            <FileText size={20} className="text-slate-300 group-hover/qa:text-slate-200 transition-all duration-200 group-hover/qa:-translate-y-0.5" />
            <span className="text-slate-400 text-[10px] whitespace-nowrap group-hover/qa:text-slate-300 transition-colors duration-200">Rapports mensuels</span>
          </button>
        </div>
      </div>
    </div>
  );
};
