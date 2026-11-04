import React, { useState } from 'react';
import {
  ChevronRight,
  Coffee,
  CupSoda,
  Cookie,
  Milk,
  Flame,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  TrendingUp,
  Percent,
  Package,
  Wrench,
  ShieldAlert,
} from 'lucide-react';
import { TopProduct, LowStockProduct, CoffeeAlert } from '../types';

interface ProductsAndStockProps {
  topProducts: TopProduct[];
  leastProducts: TopProduct[];
  topRevenueProducts: TopProduct[];
  topMarginProducts: TopProduct[];
  lowStockProducts: LowStockProduct[];
  alerts: CoffeeAlert[];
  onViewAllProducts?: () => void;
  onRestockClick?: () => void;
}

export const ProductsAndStock: React.FC<ProductsAndStockProps> = ({
  topProducts,
  leastProducts,
  topRevenueProducts,
  topMarginProducts,
  lowStockProducts,
  alerts,
  onViewAllProducts,
  onRestockClick,
}) => {
  const [salesTab, setSalesTab] = useState<'top' | 'least'>('top');
  const [financeTab, setFinanceTab] = useState<'revenue' | 'margin'>('revenue');
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);

  const topSoldList = topProducts;
  const leastSoldList = leastProducts;
  const topRevenueList = topRevenueProducts;
  const topMarginList = topMarginProducts;
  const lowStockList = lowStockProducts;
  const activeAlerts = alerts.filter((a) => !dismissedAlerts.includes(a.id));

  const getCoffeeIcon = (sku: string, category?: string) => {
    if (sku.startsWith('CF-') || category?.includes('Café')) {
      return <Coffee size={15} className="text-amber-700 dark:text-amber-400" />;
    }
    if (sku.startsWith('TH-') || category?.includes('Infusion') || category?.includes('Thé')) {
      return <CupSoda size={15} className="text-emerald-600 dark:text-emerald-400" />;
    }
    if (sku.startsWith('BK-') || category?.includes('Pâtisserie') || category?.includes('Viennoiserie')) {
      return <Cookie size={15} className="text-orange-600 dark:text-orange-400" />;
    }
    if (sku.startsWith('ST-OAT') || category?.includes('Lait')) {
      return <Milk size={15} className="text-sky-600 dark:text-sky-400" />;
    }
    return <Coffee size={15} className="text-emerald-600 dark:text-emerald-400" />;
  };

  const getAlertIcon = (category: CoffeeAlert['category']) => {
    switch (category) {
      case 'Stock':
        return <Package size={14} className="text-rose-500" />;
      case 'Machine':
        return <Wrench size={14} className="text-amber-500" />;
      case 'Hygiène':
        return <ShieldAlert size={14} className="text-blue-500" />;
      case 'Fournisseur':
        return <Clock size={14} className="text-purple-500" />;
      default:
        return <AlertTriangle size={14} className="text-amber-500" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* 2-Columns Top: Sales Analysis & Financial Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Card 1: Produits les plus et les moins vendus */}
        <div
          id="products-sales-volume-card"
          className="bg-white dark:bg-[#151D2A] rounded-xl border border-gray-100 dark:border-gray-800 p-4 sm:p-5 shadow-2xs flex flex-col justify-between"
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-50 dark:border-gray-800/80">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                {salesTab === 'top' ? 'Produits les plus vendables' : 'Produits les moins vendus'}
              </h3>
              <p className="text-[11px] text-gray-400 dark:text-gray-400">
                Top 5 par volume de commandes encaissées
              </p>
            </div>

            {/* Switch Tabs */}
            <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-800/60 p-1 rounded-full border border-gray-100 dark:border-gray-700/60 self-start sm:self-auto">
              <button
                onClick={() => setSalesTab('top')}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
                  salesTab === 'top'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900'
                }`}
              >
                Plus vendus (5)
              </button>
              <button
                onClick={() => setSalesTab('least')}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
                  salesTab === 'least'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900'
                }`}
              >
                Moins vendus (5)
              </button>
            </div>
          </div>

          {/* List */}
          <div className="divide-y divide-gray-50 dark:divide-gray-800/60 mt-1">
            {(salesTab === 'top' ? topSoldList : leastSoldList).map((prod, idx) => (
              <div
                key={prod.id}
                className="py-2.5 flex items-center justify-between hover:bg-gray-50/50 dark:hover:bg-gray-800/30 px-1 rounded-lg transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-[11px] font-bold text-gray-400 w-4 text-center">
                    #{idx + 1}
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-amber-50/60 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/40 flex items-center justify-center shrink-0">
                    {getCoffeeIcon(prod.sku, prod.category)}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
                      {prod.name}
                    </h4>
                    <div className="flex items-center gap-2 text-[10px] text-gray-400">
                      <span className="font-mono">{prod.sku}</span>
                      <span>·</span>
                      <span className="text-gray-500 dark:text-gray-400">{prod.category}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0 pl-2">
                  <div className="text-xs font-bold text-gray-900 dark:text-white">
                    {prod.price}
                  </div>
                  <span
                    className={`mt-0.5 inline-block px-2 py-0.5 text-[9px] font-semibold rounded-full border ${
                      salesTab === 'top'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60'
                        : 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/60'
                    }`}
                  >
                    {prod.soldLabel}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 text-right">
            <button
              onClick={onViewAllProducts}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 transition"
            >
              <span>Voir toute la carte du café</span>
              <ChevronRight size={12} />
            </button>
          </div>
        </div>

        {/* Card 2: Produits générant le plus de CA ou de marge */}
        <div
          id="products-revenue-margin-card"
          className="bg-white dark:bg-[#151D2A] rounded-xl border border-gray-100 dark:border-gray-800 p-4 sm:p-5 shadow-2xs flex flex-col justify-between"
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-50 dark:border-gray-800/80">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                {financeTab === 'revenue' ? 'Top Chiffre d\'Affaires' : 'Meilleures Marges'}
              </h3>
              <p className="text-[11px] text-gray-400 dark:text-gray-400">
                {financeTab === 'revenue'
                  ? 'Produits générant le plus de chiffre d\'affaires'
                  : 'Produits avec le plus fort taux de marge brute'}
              </p>
            </div>

            {/* Switch Tabs */}
            <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-800/60 p-1 rounded-full border border-gray-100 dark:border-gray-700/60 self-start sm:self-auto">
              <button
                onClick={() => setFinanceTab('revenue')}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
                  financeTab === 'revenue'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900'
                }`}
              >
                Par CA (5)
              </button>
              <button
                onClick={() => setFinanceTab('margin')}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
                  financeTab === 'margin'
                    ? 'bg-purple-600 text-white shadow-2xs'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900'
                }`}
              >
                Par Marge (5)
              </button>
            </div>
          </div>

          {/* List */}
          <div className="divide-y divide-gray-50 dark:divide-gray-800/60 mt-1">
            {(financeTab === 'revenue' ? topRevenueList : topMarginList).map((prod, idx) => (
              <div
                key={prod.id}
                className="py-2.5 flex items-center justify-between hover:bg-gray-50/50 dark:hover:bg-gray-800/30 px-1 rounded-lg transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-[11px] font-bold text-gray-400 w-4 text-center">
                    #{idx + 1}
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-blue-50/60 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/40 flex items-center justify-center shrink-0">
                    {getCoffeeIcon(prod.sku, prod.category)}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
                      {prod.name}
                    </h4>
                    <div className="flex items-center gap-2 text-[10px] text-gray-400">
                      <span>{prod.category}</span>
                      {prod.costPrice && (
                        <>
                          <span>·</span>
                          <span className="text-gray-500">Coût: {prod.costPrice}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0 pl-2">
                  <div className="text-xs font-bold text-gray-900 dark:text-white">
                    {financeTab === 'revenue' ? prod.revenue : `${prod.marginPercent}%`}
                  </div>
                  <span
                    className={`mt-0.5 inline-flex items-center gap-0.5 px-2 py-0.5 text-[9px] font-semibold rounded-full border ${
                      financeTab === 'revenue'
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/60'
                        : 'bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/60'
                    }`}
                  >
                    {financeTab === 'revenue' ? (
                      <>
                        <TrendingUp size={9} />
                        <span>Marge {prod.marginPercent}%</span>
                      </>
                    ) : (
                      <>
                        <Percent size={9} />
                        <span>CA: {prod.revenue}</span>
                      </>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 text-right">
            <button
              onClick={onViewAllProducts}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 transition"
            >
              <span>Rapport de rentabilité complet</span>
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* 2-Columns Bottom: Faible stock (Top 5) & Principales alertes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Card 3: Faible stock (Top 5 alertes de réapprovisionnement) */}
        <div
          id="low-stock-card"
          className="bg-white dark:bg-[#151D2A] rounded-xl border border-gray-100 dark:border-gray-800 p-4 sm:p-5 shadow-2xs flex flex-col justify-between"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-gray-50 dark:border-gray-800/80">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                <span>Faible stock</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60">
                  5 alertes
                </span>
              </h3>
              <p className="text-[11px] text-gray-400 dark:text-gray-400">
                Produits Café Noir en dessous du seuil de sécurité
              </p>
            </div>

            <button
              id="restock-action-button"
              onClick={onRestockClick}
              className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/60 transition shadow-2xs"
            >
              <span>Réapprovisionner</span>
              <ChevronRight size={12} />
            </button>
          </div>

          {/* Low Stock Items (Exact Top 5) */}
          <div className="divide-y divide-gray-50 dark:divide-gray-800/60 mt-1">
            {lowStockList.map((item) => (
              <div
                key={item.id}
                className="py-2.5 flex items-center justify-between hover:bg-gray-50/50 dark:hover:bg-gray-800/30 px-1 rounded-lg transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-rose-50/60 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/40 flex items-center justify-center shrink-0">
                    {getCoffeeIcon(item.sku)}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
                      {item.name}
                    </h4>
                    <p className="text-[10px] text-gray-400 dark:text-gray-400 font-mono">
                      {item.sku}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0 pl-2">
                  <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                    {item.stock} {item.unit} restant(s)
                  </span>
                  <div className="mt-0.5 flex items-center justify-end gap-1.5">
                    <span className="text-[10px] text-gray-400">
                      Seuil : {item.minThreshold} {item.unit}
                    </span>
                    <span
                      className={`inline-block px-1.5 py-0.2 text-[9px] font-bold rounded-full border ${
                        item.urgency === 'Critique'
                          ? 'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 border-rose-300'
                          : 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 border-amber-300'
                      }`}
                    >
                      {item.urgency}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 text-right">
            <button
              onClick={onRestockClick}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-emerald-600 transition"
            >
              <span>Créer bon de commande fournisseur</span>
              <ChevronRight size={12} />
            </button>
          </div>
        </div>

        {/* Card 4: Principales alertes */}
        <div
          id="primary-coffee-alerts-card"
          className="bg-white dark:bg-[#151D2A] rounded-xl border border-gray-100 dark:border-gray-800 p-4 sm:p-5 shadow-2xs flex flex-col justify-between"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-gray-50 dark:border-gray-800/80">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                <span>Principales alertes</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60">
                  {activeAlerts.length} en cours
                </span>
              </h3>
              <p className="text-[11px] text-gray-400 dark:text-gray-400">
                Événements critiques, logistiques et matériels de Café Noir
              </p>
            </div>

            <span className="text-[11px] text-gray-400">Temps réel</span>
          </div>

          {/* Alert items */}
          <div className="divide-y divide-gray-50 dark:divide-gray-800/60 mt-1 space-y-1">
            {activeAlerts.slice(0, 4).map((alert) => (
              <div
                key={alert.id}
                className="py-2.5 flex items-start justify-between gap-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 px-1 rounded-lg transition"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border ${
                      alert.level === 'danger'
                        ? 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/60 dark:border-rose-800'
                        : alert.level === 'warning'
                        ? 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/60 dark:border-amber-800'
                        : 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/60 dark:border-blue-800'
                    }`}
                  >
                    {getAlertIcon(alert.category)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-semibold text-gray-900 dark:text-white">
                        {alert.title}
                      </h4>
                      <span className="text-[9px] px-1.5 py-0.2 rounded-md font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                        {alert.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">
                      {alert.description}
                    </p>
                    <span className="text-[9px] text-gray-400 font-mono">{alert.timeAgo}</span>
                  </div>
                </div>

                <div className="shrink-0 flex flex-col items-end gap-1">
                  {alert.actionLabel && (
                    <button
                      onClick={() => setDismissedAlerts((prev) => [...prev, alert.id])}
                      className="px-2.5 py-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 rounded-lg border border-emerald-200 dark:border-emerald-800 transition whitespace-nowrap"
                    >
                      {alert.actionLabel}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 text-right">
            <button
              onClick={() => setDismissedAlerts([])}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-emerald-600 transition"
            >
              <CheckCircle2 size={12} className="text-emerald-500" />
              <span>Historique des alertes traitées</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
