import React, { useMemo, useState } from 'react';
import {
  Boxes,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FilterX,
  Wallet,
  AlertTriangle,
  TrendingDown,
  Warehouse,
  Building2,
  ArrowRightLeft,
  ClipboardList,
  PackageMinus,
  CalendarClock,
} from 'lucide-react';
import {
  StockProduct,
  StockLot,
  StockCategory,
  StockZone,
  StockStatus,
  STOCK_CATEGORIES,
  STOCK_ZONES,
  STOCK_STATUSES,
  DEFAULT_EXPIRY_ALERT_DAYS,
  getZoneQty,
  getProductQtyForZoneFilter,
  getProductValue,
  computeProductFlags,
  getProductStatus,
  getStatusBadgeClass,
} from '../data/stockModel';

interface StockPageProps {
  products: StockProduct[];
  lots: StockLot[];
  onNavigateToDashboard: () => void;
  onNavigateToMovements: () => void;
  onNavigateToInventory: () => void;
  onNavigateToLosses: () => void;
  onNavigateToLots: () => void;
  isDarkMode?: boolean;
}

type ZoneFilter = StockZone | 'Tous';
type SortField = 'name' | 'qty' | 'value';

export const StockPage: React.FC<StockPageProps> = ({
  products,
  lots,
  onNavigateToDashboard,
  onNavigateToMovements,
  onNavigateToInventory,
  onNavigateToLosses,
  onNavigateToLots,
}) => {
  const [selectedZone, setSelectedZone] = useState<ZoneFilter>('Tous');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<StockCategory | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<StockStatus | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleResetFilters = () => {
    setSelectedZone('Tous');
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedStatus('all');
    setCurrentPage(1);
  };

  const enrichedProducts = useMemo(
    () =>
      products.map((p) => {
        const flags = computeProductFlags(p, lots, DEFAULT_EXPIRY_ALERT_DAYS, selectedZone);
        return { product: p, flags, status: getProductStatus(flags), qty: getProductQtyForZoneFilter(p, selectedZone), value: getProductValue(p, selectedZone) };
      }),
    [products, lots, selectedZone]
  );

  const filteredRows = useMemo(() => {
    return enrichedProducts.filter(({ product, status }) => {
      if (selectedCategory !== 'all' && product.category !== selectedCategory) return false;
      if (selectedStatus !== 'all' && status !== selectedStatus) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matches = product.name.toLowerCase().includes(q) || product.sku.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [enrichedProducts, selectedCategory, selectedStatus, searchQuery]);

  const sortedRows = useMemo(() => {
    const list = [...filteredRows];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = a.product.name.localeCompare(b.product.name);
      else if (sortField === 'qty') cmp = a.qty - b.qty;
      else if (sortField === 'value') cmp = a.value - b.value;
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filteredRows, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // KPIs follow the same filtered dataset as the table (zone + search + category + status),
  // matching how KPIs already behave on the Ventes page and satisfying the explicit zone rule.
  const totalStockValue = useMemo(() => filteredRows.reduce((sum, r) => sum + r.value, 0), [filteredRows]);
  const belowThresholdCount = useMemo(() => filteredRows.filter((r) => r.flags.belowThreshold).length, [filteredRows]);
  const totalAlertsCount = useMemo(
    () =>
      filteredRows.reduce(
        (sum, r) => sum + (r.flags.belowThreshold ? 1 : 0) + (r.flags.negative ? 1 : 0) + (r.flags.hasExpired ? 1 : 0) + (r.flags.hasExpiringSoon ? 1 : 0),
        0
      ),
    [filteredRows]
  );

  const totalResults = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / rowsPerPage));
  const paginatedRows = useMemo(
    () => sortedRows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage),
    [sortedRows, currentPage, rowsPerPage]
  );

  const showBothZoneColumns = selectedZone === 'Tous';

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Page Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>Gestion du stock</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Café & Caisse
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Consultation du stock par produit, par zone et pilotage des alertes.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            onClick={onNavigateToMovements}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer"
          >
            <ArrowRightLeft size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Mouvements</span>
          </button>
          <button
            onClick={onNavigateToInventory}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer"
          >
            <ClipboardList size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Inventaires</span>
          </button>
          <button
            onClick={onNavigateToLosses}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer"
          >
            <PackageMinus size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Pertes</span>
          </button>
          <button
            onClick={onNavigateToLots}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer"
          >
            <CalendarClock size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Lots</span>
          </button>
          <button
            onClick={onNavigateToDashboard}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700/80 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition active:scale-98 cursor-pointer"
          >
            <span>Tableau de bord</span>
          </button>
        </div>
      </div>

      {/* 3 KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">
              Valeur totale du stock {selectedZone !== 'Tous' ? `(${selectedZone})` : ''}
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                {totalStockValue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-xs font-bold text-gray-600 dark:text-gray-400">DT</span>
            </div>
            <p className="text-[11px] text-gray-400">Valorisation au coût moyen pondéré (CMP)</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-500 shrink-0">
            <Wallet size={22} />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Articles sous seuil</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                {belowThresholdCount}
              </span>
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-md">
                Produits
              </span>
            </div>
            <p className="text-[11px] text-gray-400">Sous le seuil minimum configuré</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 flex items-center justify-center text-amber-500 shrink-0">
            <TrendingDown size={22} />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Alertes stock</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                {totalAlertsCount}
              </span>
              <span className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 px-2 py-0.5 rounded-md">
                Alertes
              </span>
            </div>
            <p className="text-[11px] text-gray-400">Sous seuil, négatif, expiré, expiration proche</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-red-50/80 dark:bg-red-950/40 flex items-center justify-center text-red-500 shrink-0">
            <AlertTriangle size={22} />
          </div>
        </div>
      </div>

      {/* Filter Row */}
      <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2.5 flex-1">
            {/* Search */}
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Produit, SKU..."
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Zone filter */}
            <div className="relative">
              <select
                value={selectedZone}
                onChange={(e) => {
                  setSelectedZone(e.target.value as ZoneFilter);
                  setCurrentPage(1);
                }}
                title="Zone"
                className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="Tous">Zone : Tous</option>
                {STOCK_ZONES.map((z) => (
                  <option key={z} value={z}>
                    Zone : {z}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            {/* Category filter */}
            <div className="relative">
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value as StockCategory | 'all');
                  setCurrentPage(1);
                }}
                className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="all">Toutes les catégories</option>
                {STOCK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            {/* Status filter */}
            <div className="relative">
              <select
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value as StockStatus | 'all');
                  setCurrentPage(1);
                }}
                className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="all">Tous les statuts</option>
                {STOCK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
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

      {/* Stock Table */}
      <div className="rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 text-[11px] font-bold text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-gray-800/30">
                <th
                  onClick={() => handleSort('name')}
                  className="py-3.5 px-4 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>Produit</span>
                    <span className="text-[10px] opacity-70">⇅</span>
                  </div>
                </th>
                <th className="py-3.5 px-4">Catégorie</th>
                {showBothZoneColumns ? (
                  <>
                    <th className="py-3.5 px-4 text-center">Réserve principale</th>
                    <th className="py-3.5 px-4 text-center">Dépôt</th>
                  </>
                ) : (
                  <th className="py-3.5 px-4 text-center">Quantité ({selectedZone})</th>
                )}
                <th
                  onClick={() => handleSort('qty')}
                  className="py-3.5 px-4 text-center cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none"
                >
                  <div className="flex items-center gap-1 justify-center">
                    <span>{showBothZoneColumns ? 'Stock total' : 'Total (zone)'}</span>
                    <span className="text-[10px] opacity-70">⇅</span>
                  </div>
                </th>
                <th className="py-3.5 px-4">Unité</th>
                <th className="py-3.5 px-4 text-center">Seuil min.</th>
                <th className="py-3.5 px-4 text-center">Stock cible</th>
                <th className="py-3.5 px-4">Statut</th>
                <th
                  onClick={() => handleSort('value')}
                  className="py-3.5 px-4 text-right cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none"
                >
                  <div className="flex items-center gap-1 justify-end">
                    <span>Valeur du stock</span>
                    <span className="text-[10px] opacity-70">⇅</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 text-xs">
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={showBothZoneColumns ? 9 : 8} className="text-center py-12 text-gray-400">
                    <div className="max-w-sm mx-auto space-y-2">
                      <Boxes className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600" />
                      <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">
                        Aucun article ne correspond à ces filtres
                      </p>
                      <p className="text-xs text-gray-400">Essayez de modifier ou réinitialiser les filtres.</p>
                      <button
                        onClick={handleResetFilters}
                        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer"
                      >
                        Réinitialiser les filtres
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedRows.map(({ product, status, value }) => (
                  <tr key={product.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-gray-900 dark:text-white">{product.name}</p>
                      <p className="text-[11px] text-gray-400">{product.sku}</p>
                    </td>
                    <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300">{product.category}</td>
                    {showBothZoneColumns ? (
                      <>
                        <td className="py-3.5 px-4 text-center">
                          <span className="inline-flex items-center gap-1 text-gray-700 dark:text-gray-300">
                            <Building2 size={12} className="text-gray-400" />
                            {getZoneQty(product, 'Réserve principale').toLocaleString('fr-FR')}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="inline-flex items-center gap-1 text-gray-700 dark:text-gray-300">
                            <Warehouse size={12} className="text-gray-400" />
                            {getZoneQty(product, 'Dépôt').toLocaleString('fr-FR')}
                          </span>
                        </td>
                      </>
                    ) : null}
                    <td
                      className={`py-3.5 px-4 text-center font-bold ${
                        getProductQtyForZoneFilter(product, selectedZone) < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      {getProductQtyForZoneFilter(product, selectedZone).toLocaleString('fr-FR')}
                    </td>
                    <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300">{product.unit}</td>
                    <td className="py-3.5 px-4 text-center text-gray-600 dark:text-gray-300">{product.minThreshold}</td>
                    <td className="py-3.5 px-4 text-center text-gray-600 dark:text-gray-300">{product.targetStock}</td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${getStatusBadgeClass(status)}`}>
                        {status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-gray-900 dark:text-white">
                      {value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                      <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">DT</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <span>Afficher</span>
            <select
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="py-1 px-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-medium cursor-pointer"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
            <span>sur un total de {totalResults} articles</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 py-1 font-semibold text-gray-700 dark:text-gray-300">
              Page {currentPage} sur {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
