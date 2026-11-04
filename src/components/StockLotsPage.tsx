import React, { useMemo, useState } from 'react';
import {
  CalendarClock,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FilterX,
  AlertTriangle,
  PackageCheck,
  History,
  ArrowRightLeft,
  Info,
} from 'lucide-react';
import {
  StockProduct,
  StockLot,
  StockZone,
  STOCK_ZONES,
  LotStatus,
  DEFAULT_EXPIRY_ALERT_DAYS,
  getLotStatus,
  getLotStatusBadgeClass,
  daysUntil,
} from '../data/stockModel';

interface StockLotsPageProps {
  products: StockProduct[];
  lots: StockLot[];
  onNavigateToDashboard: () => void;
  onNavigateToStock: () => void;
  onNavigateToMovements: () => void;
  isDarkMode?: boolean;
}

const LOT_STATUSES: LotStatus[] = ['Valide', 'Expiration proche', 'Expiré'];

export const StockLotsPage: React.FC<StockLotsPageProps> = ({
  products,
  lots,
  onNavigateToDashboard,
  onNavigateToStock,
  onNavigateToMovements,
}) => {
  const [alertDays, setAlertDays] = useState(DEFAULT_EXPIRY_ALERT_DAYS);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProduct, setFilterProduct] = useState('all');
  const [filterZone, setFilterZone] = useState<'all' | StockZone>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | LotStatus>('all');
  const [expireBefore, setExpireBefore] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  const lotTrackedProducts = useMemo(() => products.filter((p) => p.lotTracked), [products]);

  const enrichedLots = useMemo(
    () =>
      lots.map((lot) => {
        const product = products.find((p) => p.id === lot.productId);
        const status = getLotStatus(lot, alertDays);
        const days = daysUntil(lot.expiryDate);
        return { lot, product, status, days };
      }),
    [lots, products, alertDays]
  );

  const filteredLots = useMemo(() => {
    return enrichedLots.filter(({ lot, product, status }) => {
      if (filterProduct !== 'all' && lot.productId !== filterProduct) return false;
      if (filterZone !== 'all' && lot.zone !== filterZone) return false;
      if (filterStatus !== 'all' && status !== filterStatus) return false;
      if (expireBefore && lot.expiryDate > expireBefore) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        if (!product?.name.toLowerCase().includes(q) && !lot.lotNumber.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [enrichedLots, filterProduct, filterZone, filterStatus, expireBefore, searchQuery]);

  const expiredCount = useMemo(() => enrichedLots.filter((l) => l.status === 'Expiré').length, [enrichedLots]);
  const expiringSoonCount = useMemo(() => enrichedLots.filter((l) => l.status === 'Expiration proche').length, [enrichedLots]);

  const totalPages = Math.max(1, Math.ceil(filteredLots.length / rowsPerPage));
  const paginatedLots = useMemo(
    () => filteredLots.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage),
    [filteredLots, currentPage]
  );

  const handleResetFilters = () => {
    setSearchQuery('');
    setFilterProduct('all');
    setFilterZone('all');
    setFilterStatus('all');
    setExpireBefore('');
    setCurrentPage(1);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>Lots & péremptions</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Café & Caisse
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Suivi des lots et des dates de péremption pour les produits concernés.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button onClick={onNavigateToStock} className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer">
            <History size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Voir le stock</span>
          </button>
          <button onClick={onNavigateToMovements} className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer">
            <ArrowRightLeft size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Nouveau lot (via une entrée)</span>
          </button>
          <button
            onClick={onNavigateToDashboard}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700/80 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition active:scale-98 cursor-pointer"
          >
            <span>Tableau de bord</span>
          </button>
        </div>
      </div>

      <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/50 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
        <Info size={14} className="shrink-0" />
        <span>
          {lotTrackedProducts.length} produit{lotTrackedProducts.length > 1 ? 's utilisent' : ' utilise'} la gestion par lot. Les lots
          se créent lors d'un mouvement d'entrée ; les sorties et transferts consomment ou déplacent un lot existant.
        </span>
      </div>

      {/* KPIs + configurable alert delay */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Lots suivis</span>
            <span className="text-2xl font-black text-gray-900 dark:text-white">{lots.length}</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-500 shrink-0">
            <PackageCheck size={22} />
          </div>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Expiration proche</span>
            <span className="text-2xl font-black text-gray-900 dark:text-white">{expiringSoonCount}</span>
            <p className="text-[11px] text-gray-400">Sous {alertDays} jours</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-orange-50/80 dark:bg-orange-950/40 flex items-center justify-center text-orange-500 shrink-0">
            <AlertTriangle size={22} />
          </div>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between">
          <div className="space-y-2 flex-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Lots expirés</span>
            <span className="text-2xl font-black text-red-600 dark:text-red-400">{expiredCount}</span>
            <div className="flex items-center gap-2 pt-1">
              <label className="text-[11px] text-gray-400">Délai d'alerte (jours) :</label>
              <input
                type="number"
                min={1}
                value={alertDays}
                onChange={(e) => setAlertDays(Math.max(1, Number(e.target.value) || 1))}
                className="w-16 px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2.5 flex-1">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                placeholder="Produit, numéro de lot..."
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div className="relative">
              <select
                value={filterProduct}
                onChange={(e) => { setFilterProduct(e.target.value); setCurrentPage(1); }}
                className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="all">Tous les produits</option>
                {lotTrackedProducts.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <div className="relative">
              <select
                value={filterZone}
                onChange={(e) => { setFilterZone(e.target.value as 'all' | StockZone); setCurrentPage(1); }}
                className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="all">Toutes les zones</option>
                {STOCK_ZONES.map((z) => (<option key={z} value={z}>{z}</option>))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <div className="relative">
              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value as 'all' | LotStatus); setCurrentPage(1); }}
                className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="all">Tous les statuts</option>
                {LOT_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <div>
              <input
                type="date"
                value={expireBefore}
                onChange={(e) => { setExpireBefore(e.target.value); setCurrentPage(1); }}
                title="Expire avant le"
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>
          <button
            onClick={handleResetFilters}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 shadow-2xs transition active:scale-98 shrink-0 cursor-pointer"
          >
            <FilterX size={14} className="text-gray-500" />
            <span>Réinitialiser</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 text-[11px] font-bold text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-gray-800/30">
                <th className="py-3.5 px-4">Produit</th>
                <th className="py-3.5 px-4">N° de lot</th>
                <th className="py-3.5 px-4 text-center">Quantité</th>
                <th className="py-3.5 px-4">Zone</th>
                <th className="py-3.5 px-4">Date de péremption</th>
                <th className="py-3.5 px-4">Statut</th>
                <th className="py-3.5 px-4 text-center">Jours avant expiration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 text-xs">
              {paginatedLots.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    <div className="max-w-sm mx-auto space-y-2">
                      <CalendarClock className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600" />
                      <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">Aucun lot pour ces filtres</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedLots.map(({ lot, product, status, days }) => (
                  <tr key={lot.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-gray-900 dark:text-white">{product?.name ?? '—'}</td>
                    <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300 font-mono">{lot.lotNumber}</td>
                    <td className={`py-3.5 px-4 text-center font-bold ${lot.quantity < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                      {lot.quantity} {product?.unit}
                    </td>
                    <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300">{lot.zone}</td>
                    <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300">{lot.expiryDate}</td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${getLotStatusBadgeClass(status)}`}>
                        {status}
                      </span>
                    </td>
                    <td className={`py-3.5 px-4 text-center font-semibold ${days < 0 ? 'text-red-600 dark:text-red-400' : days <= alertDays ? 'text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-gray-300'}`}>
                      {days < 0 ? `Expiré depuis ${Math.abs(days)} j` : `${days} j`}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span>sur un total de {filteredLots.length} lots</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer">
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 py-1 font-semibold text-gray-700 dark:text-gray-300">Page {currentPage} sur {totalPages}</span>
            <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
