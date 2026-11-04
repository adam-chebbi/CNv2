import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Search,
  FilterX,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Eye,
  ArrowUpRight,
  CheckCircle2,
  Undo2,
  X,
  AlertOctagon,
  PackageX,
  TrendingDown,
  Clock,
  CalendarX,
  Receipt,
  ClipboardCheck,
  Percent,
  ShieldAlert,
  AlertTriangle,
  Info,
  RefreshCw,
} from 'lucide-react';
import { StockProduct, StockLot, StockLedgerEntry } from '../data/stockModel';
import { CatalogArticle } from '../data/manualSalesCatalog';
import { SubRecipe } from '../data/productsModel';
import { Supplier, SupplierInvoice } from '../data/purchasesModel';
import {
  OperationalAlert,
  AlertType,
  AlertSeverity,
  AlertStatus,
  ALERT_TYPE_LABELS,
  ALERT_SEVERITIES,
  computeOperationalAlerts,
} from '../data/alertsModel';
import { useQueryParam } from '../hooks/useQueryParam';

interface NotificationsPageProps {
  stockProducts: StockProduct[];
  stockLots: StockLot[];
  stockLedger: StockLedgerEntry[];
  articles: CatalogArticle[];
  subRecipes: SubRecipe[];
  suppliers: Supplier[];
  invoices: SupplierInvoice[];
  treatedAlerts: Record<string, { treatedAt: string; treatedBy: string }>;
  onNavigate: (tab: string, subItem?: string) => void;
  onMarkAlertTreated: (alert: OperationalAlert) => void;
  onMarkAlertUnread: (alertId: string) => void;
  isDarkMode?: boolean;
}

const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';

const SEVERITY_STYLES: Record<AlertSeverity, { badge: string; bar: string; icon: string }> = {
  Critique: { badge: 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/70', bar: 'bg-red-500', icon: 'text-red-500' },
  Important: { badge: 'bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800/70', bar: 'bg-orange-500', icon: 'text-orange-500' },
  Attention: { badge: 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/70', bar: 'bg-amber-500', icon: 'text-amber-500' },
  Information: { badge: 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/70', bar: 'bg-blue-500', icon: 'text-blue-500' },
};

const SEVERITY_ICON: Record<AlertSeverity, React.ComponentType<{ size?: number; className?: string }>> = {
  Critique: ShieldAlert,
  Important: AlertTriangle,
  Attention: AlertTriangle,
  Information: Info,
};

const TYPE_ICON: Record<AlertType, React.ComponentType<{ size?: number; className?: string }>> = {
  stock_low: TrendingDown,
  stock_out: PackageX,
  stock_negative: AlertOctagon,
  expiry_soon: Clock,
  expiry_passed: CalendarX,
  invoice_due: Receipt,
  inventory_discrepancy: ClipboardCheck,
  margin_below_target: Percent,
};

const formatDisplayDate = (iso: string): string => {
  const raw = (iso || '').slice(0, 10);
  const [y, m, d] = raw.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso || '—';
};

const AlertCardSkeleton: React.FC = () => (
  <div className="p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs animate-pulse flex gap-3">
    <div className="w-1 rounded-full bg-gray-100 dark:bg-gray-800" />
    <div className="flex-1 space-y-2">
      <div className="h-3 w-1/3 bg-gray-100 dark:bg-gray-800 rounded" />
      <div className="h-2.5 w-2/3 bg-gray-100 dark:bg-gray-800 rounded" />
      <div className="h-2.5 w-1/2 bg-gray-100 dark:bg-gray-800 rounded" />
    </div>
  </div>
);

export const NotificationsPage: React.FC<NotificationsPageProps> = ({
  stockProducts,
  stockLots,
  stockLedger,
  articles,
  subRecipes,
  suppliers,
  invoices,
  treatedAlerts,
  onNavigate,
  onMarkAlertTreated,
  onMarkAlertUnread,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [computeToken, setComputeToken] = useState(0);

  // Filters synced to the URL (?q=&type=&severity=&status=&unread=) so a filtered alert view is
  // bookmarkable/shareable — every value is validated against its known domain.
  const [searchQuery, setSearchQuery] = useQueryParam('q');
  const [filterTypeRaw, setFilterType] = useQueryParam('type', 'all');
  const filterType = useMemo<'all' | AlertType>(() => (filterTypeRaw in ALERT_TYPE_LABELS ? (filterTypeRaw as AlertType) : 'all'), [filterTypeRaw]);
  const [filterSeverityRaw, setFilterSeverity] = useQueryParam('severity', 'all');
  const filterSeverity = useMemo<'all' | AlertSeverity>(
    () => (ALERT_SEVERITIES.includes(filterSeverityRaw as AlertSeverity) ? (filterSeverityRaw as AlertSeverity) : 'all'),
    [filterSeverityRaw]
  );
  const [filterStatusRaw, setFilterStatus] = useQueryParam('status', 'all');
  const filterStatus = useMemo<'all' | AlertStatus>(
    () => (filterStatusRaw === 'Non traité' || filterStatusRaw === 'Traité' ? filterStatusRaw : 'all'),
    [filterStatusRaw]
  );
  const [onlyUnreadRaw, setOnlyUnreadRaw] = useQueryParam('unread');
  const onlyUnread = onlyUnreadRaw === '1';
  const setOnlyUnread = (value: boolean) => setOnlyUnreadRaw(value ? '1' : '');
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 8;
  // "Voir le détail" opens ?alert=<id> — a shareable deep link straight into that alert. Deriving
  // viewingAlert from the live `alerts` list (rather than holding a separate copy) means marking
  // it treated/unread is reflected here automatically once the parent's state updates.
  const [alertParam, setAlertParam] = useQueryParam('alert');

  useEffect(() => {
    setIsLoading(true);
    const t = setTimeout(() => setIsLoading(false), 350);
    return () => clearTimeout(t);
  }, [computeToken]);

  const baseAlerts = useMemo<OperationalAlert[]>(() => {
    try {
      setLoadError(null);
      return computeOperationalAlerts({ stockProducts, stockLots, stockLedger, articles, subRecipes, suppliers, invoices });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Une erreur est survenue lors du calcul des alertes.");
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockProducts, stockLots, stockLedger, articles, subRecipes, suppliers, invoices, computeToken]);

  const alerts = useMemo<OperationalAlert[]>(
    () =>
      baseAlerts.map((a) => {
        const override = treatedAlerts[a.id];
        return override ? { ...a, status: 'Traité' as AlertStatus } : a;
      }),
    [baseAlerts, treatedAlerts]
  );

  const viewingAlert = useMemo(() => alerts.find((a) => a.id === alertParam) ?? null, [alerts, alertParam]);
  const setViewingAlert = (alert: OperationalAlert | null) => setAlertParam(alert ? alert.id : '');

  const severityCounts = useMemo(() => {
    const counts: Record<AlertSeverity, number> = { Critique: 0, Important: 0, Attention: 0, Information: 0 };
    alerts.forEach((a) => { if (a.status === 'Non traité') counts[a.severity] += 1; });
    return counts;
  }, [alerts]);

  const unreadCount = useMemo(() => alerts.filter((a) => a.status === 'Non traité').length, [alerts]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => {
      if (onlyUnread && a.status !== 'Non traité') return false;
      if (filterType !== 'all' && a.type !== filterType) return false;
      if (filterSeverity !== 'all' && a.severity !== filterSeverity) return false;
      if (filterStatus !== 'all' && a.status !== filterStatus) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        if (!a.title.toLowerCase().includes(q) && !a.message.toLowerCase().includes(q) && !a.entity.label.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [alerts, onlyUnread, filterType, filterSeverity, filterStatus, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredAlerts.length / rowsPerPage));
  const paginatedAlerts = useMemo(() => filteredAlerts.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage), [filteredAlerts, currentPage]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setFilterType('all');
    setFilterSeverity('all');
    setFilterStatus('all');
    setOnlyUnread(false);
    setCurrentPage(1);
  };
  const hasActiveFilters = Boolean(searchQuery.trim() || filterType !== 'all' || filterSeverity !== 'all' || filterStatus !== 'all' || onlyUnread);

  const handleRetry = () => setComputeToken((t) => t + 1);

  const handleMarkTreated = (alert: OperationalAlert) => onMarkAlertTreated(alert);
  const handleMarkUnread = (alert: OperationalAlert) => onMarkAlertUnread(alert.id);

  const handleMarkVisibleTreated = () => {
    filteredAlerts.filter((a) => a.status === 'Non traité').forEach((a) => onMarkAlertTreated(a));
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>Notifications &amp; Alertes</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              {unreadCount} non traitée{unreadCount > 1 ? 's' : ''}
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-2xl">
            Centre d'alertes opérationnelles — stock, péremption, fournisseurs et marges. Affichées uniquement dans la plateforme (aucun SMS, WhatsApp ou email en V1).
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button onClick={handleMarkVisibleTreated} disabled={filteredAlerts.every((a) => a.status === 'Traité')} className={secondaryButtonClass}>
            <CheckCircle2 size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Marquer les alertes affichées comme traitées</span>
          </button>
        </div>
      </div>

      {/* Severity summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {ALERT_SEVERITIES.map((sev) => {
          const Icon = SEVERITY_ICON[sev];
          const s = SEVERITY_STYLES[sev];
          const active = filterSeverity === sev;
          return (
            <button
              key={sev}
              onClick={() => { setFilterSeverity(active ? 'all' : sev); setCurrentPage(1); }}
              className={`p-4 rounded-2xl bg-white dark:bg-[#151D2A] border shadow-2xs flex items-center justify-between transition text-left cursor-pointer ${active ? 'border-gray-900 dark:border-white' : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700'}`}
            >
              <div>
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 block">{sev}</span>
                <span className="text-xl font-black text-gray-900 dark:text-white">{severityCounts[sev]}</span>
              </div>
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${s.badge}`}>
                <Icon size={18} className={s.icon} />
              </span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 flex-1">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                placeholder="Titre, produit, facture..."
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div className="relative">
              <select value={filterType} onChange={(e) => { setFilterType(e.target.value as 'all' | AlertType); setCurrentPage(1); }} className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer">
                <option value="all">Tous les types</option>
                {(Object.keys(ALERT_TYPE_LABELS) as AlertType[]).map((t) => (<option key={t} value={t}>{ALERT_TYPE_LABELS[t]}</option>))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <div className="relative">
              <select value={filterSeverity} onChange={(e) => { setFilterSeverity(e.target.value as 'all' | AlertSeverity); setCurrentPage(1); }} className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer">
                <option value="all">Toutes les priorités</option>
                {ALERT_SEVERITIES.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <div className="relative">
              <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value as 'all' | AlertStatus); setCurrentPage(1); }} className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer">
                <option value="all">Tous les statuts</option>
                <option value="Non traité">Non traité</option>
                <option value="Traité">Traité</option>
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
          <button onClick={handleResetFilters} className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 shadow-2xs transition active:scale-98 shrink-0 cursor-pointer">
            <FilterX size={14} className="text-gray-500" />
            <span>Réinitialiser</span>
          </button>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300 cursor-pointer w-fit">
          <span className={`w-10 h-5 rounded-full relative shrink-0 transition ${onlyUnread ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`} onClick={() => { setOnlyUnread(!onlyUnread); setCurrentPage(1); }}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${onlyUnread ? 'left-5' : 'left-0.5'}`} />
          </span>
          <span onClick={() => { setOnlyUnread(!onlyUnread); setCurrentPage(1); }}>Afficher uniquement les alertes non traitées</span>
        </label>
      </div>

      {/* Alerts list */}
      {loadError ? (
        <div className="p-6 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-center space-y-3">
          <AlertOctagon className="w-8 h-8 mx-auto text-red-500" />
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">Impossible de calculer les alertes</p>
          <p className="text-xs text-red-600/80 dark:text-red-400/80">{loadError}</p>
          <button onClick={handleRetry} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer">
            <RefreshCw size={13} /> Réessayer
          </button>
        </div>
      ) : isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (<AlertCardSkeleton key={i} />))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs text-center space-y-2">
          <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500" />
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Tout est sous contrôle</p>
          <p className="text-xs text-gray-400">Aucune alerte opérationnelle détectée pour le moment.</p>
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs text-center space-y-2">
          <Search className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600" />
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Aucune alerte ne correspond à ces filtres</p>
          <button onClick={handleResetFilters} className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer">
            <FilterX size={13} /> Réinitialiser les filtres
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-2.5">
            {paginatedAlerts.map((a) => {
              const s = SEVERITY_STYLES[a.severity];
              const TypeIcon = TYPE_ICON[a.type];
              const isTreated = a.status === 'Traité';
              return (
                <div key={a.id} className={`rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs overflow-hidden flex ${isTreated ? 'opacity-60' : ''}`}>
                  <div className={`w-1.5 shrink-0 ${s.bar}`} />
                  <div className="flex-1 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${s.badge}`}>
                        <TypeIcon size={16} className={s.icon} />
                      </span>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold border ${s.badge}`}>{a.severity}</span>
                          <span className="text-[10px] font-semibold text-gray-400">{ALERT_TYPE_LABELS[a.type]}</span>
                          <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold border ${isTreated ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700' : 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 border-blue-200 dark:border-blue-800/60'}`}>
                            {a.status}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">{a.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{a.message}</p>
                        <div className="flex items-center gap-2 text-[11px] text-gray-400 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded bg-gray-50 dark:bg-gray-800/60 font-medium text-gray-500 dark:text-gray-400">{a.entity.label}</span>
                          <span>{formatDisplayDate(a.detectedAt)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                      <button onClick={() => setViewingAlert(a)} title="Voir le détail" className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer"><Eye size={15} /></button>
                      <button onClick={() => onNavigate(a.navigateTo.tab, a.navigateTo.subItem)} title={a.actionLabel} className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer"><ArrowUpRight size={15} /></button>
                      {isTreated ? (
                        <button onClick={() => handleMarkUnread(a)} title="Marquer comme non traité" className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition cursor-pointer"><Undo2 size={15} /></button>
                      ) : (
                        <button onClick={() => handleMarkTreated(a)} title="Marquer comme traité" className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer"><CheckCircle2 size={15} /></button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span>sur un total de {filteredAlerts.length} alerte{filteredAlerts.length > 1 ? 's' : ''}{hasActiveFilters ? ' (filtrées)' : ''}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"><ChevronLeft size={16} /></button>
              <span className="px-3 py-1 font-semibold text-gray-700 dark:text-gray-300">Page {currentPage} sur {totalPages}</span>
              <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"><ChevronRight size={16} /></button>
            </div>
          </div>
        </>
      )}

      {/* Detail modal */}
      {viewingAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200" onClick={() => setViewingAlert(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-200 dark:border-gray-700 shadow-2xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold border ${SEVERITY_STYLES[viewingAlert.severity].badge}`}>{viewingAlert.severity}</span>
                <h3 className="font-bold text-sm text-gray-900 dark:text-white">{viewingAlert.title}</h3>
              </div>
              <button onClick={() => setViewingAlert(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <p className="text-gray-600 dark:text-gray-300">{viewingAlert.message}</p>
              <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 grid grid-cols-2 gap-3">
                <div><span className="text-gray-400 font-semibold block mb-0.5">Type</span><span className="font-bold text-gray-900 dark:text-white">{ALERT_TYPE_LABELS[viewingAlert.type]}</span></div>
                <div><span className="text-gray-400 font-semibold block mb-0.5">Élément concerné</span><span className="font-bold text-gray-900 dark:text-white">{viewingAlert.entity.label}</span></div>
                <div><span className="text-gray-400 font-semibold block mb-0.5">Date</span><span className="font-bold text-gray-900 dark:text-white">{formatDisplayDate(viewingAlert.detectedAt)}</span></div>
                <div><span className="text-gray-400 font-semibold block mb-0.5">Statut</span><span className="font-bold text-gray-900 dark:text-white">{viewingAlert.status}</span></div>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300">
                <span className="font-semibold block mb-0.5">Action recommandée</span>
                {viewingAlert.recommendedAction}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                {viewingAlert.status === 'Traité' ? (
                  <button onClick={() => handleMarkUnread(viewingAlert)} className={secondaryButtonClass}><Undo2 size={13} /><span>Marquer non traité</span></button>
                ) : (
                  <button onClick={() => handleMarkTreated(viewingAlert)} className={secondaryButtonClass}><CheckCircle2 size={13} /><span>Marquer traité</span></button>
                )}
                <button onClick={() => onNavigate(viewingAlert.navigateTo.tab, viewingAlert.navigateTo.subItem)} className={primaryButtonClass}>
                  <ArrowUpRight size={13} /><span>{viewingAlert.actionLabel}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
