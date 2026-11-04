import { todayIso } from './data/dateUtils';
import React, { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react';
import { useCookieConsent } from './context/CookieConsentContext';
import { getCookie, setCookie } from './lib/cookies';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { HeroBanner } from './components/HeroBanner';
import { MetricCards } from './components/MetricCards';
import { AnalysisFilterBar } from './components/AnalysisFilterBar';
import { ActivityHeatmap } from './components/ActivityHeatmap';
import { PlanOverview } from './components/PlanOverview';
import { SalesChart } from './components/SalesChart';
import { PurchasesChart } from './components/PurchasesChart';
import { ProductsAndStock } from './components/ProductsAndStock';
import { ActionModals } from './components/ActionModals';
import { SalesPage } from './components/SalesPage';
import { ManualSalesEntryPage } from './components/ManualSalesEntryPage';
import { TimeFilterPeriod } from './types';
import { useUrlNavigation } from './hooks/useUrlNavigation';
import { useAuth } from './auth/AuthContext';
import { ApiError } from './api/client';
import { SaleTransaction } from './data/salesTransactions';
import { StockProduct, StockLot, StockLedgerEntry, StockUnit } from './data/stockModel';
import { CatalogArticle, CatalogExtra } from './data/manualSalesCatalog';
import { ProductCategory, ProductSubCategory, SubRecipe } from './data/productsModel';
import { ActivityLogEntry } from './data/activityLog';
import { Expense, ExpenseCategory, ExpenseStatus } from './data/expensesModel';
import { Supplier, PurchaseOrder, PurchaseOrderStatus, PurchaseReception, SupplierInvoice, PurchasePaymentMethod } from './data/purchasesModel';
import { ProductAlias } from './data/productAliases';
import { OperationalAlert } from './data/alertsModel';
import { Employee, Shift, DayRecord, RecurringPlan, FinancialRecord, AttendanceStatus, WeeklyPattern, getEmployeeFullName } from './data/hrModel';
import {
  resolveDashboardRange,
  computeDashboardPeriodData,
  buildProductRankings,
  buildLowStockList,
  buildDashboardAlerts,
  buildDailySalesCalendar,
  buildSalesByPeriod,
  buildCategoryShares,
  formatDT as formatDashboardAmount,
} from './data/dashboardModel';
import * as productCatalogApi from './api/productCatalog';
import * as stockApi from './api/stock';
import * as salesApi from './api/sales';
import * as internalConsumptionApi from './api/internalConsumption';
import type { buildInternalConsumptionPayload } from './data/internalConsumptionModel';
import * as expensesApi from './api/expenses';
import * as purchasesApi from './api/purchases';
import * as hrApi from './api/hr';
import * as notificationsApi from './api/notifications';
import * as activityLogApi from './api/activityLog';
import * as dashboardApi from './api/dashboard';
import type { MonthlyTarget } from './api/dashboard';
import * as cashVerificationsApi from './api/cashVerifications';
import * as revenueEntriesApi from './api/revenueEntries';
import { RevenueEntry, RevenueEntryInput } from './data/revenueEntriesModel';
import { CashVerification, CashVerificationInput, computeCashKpis } from './data/cashCheckModel';
import * as settingsApi from './api/settings';
import { AppSettings, DEFAULT_APP_SETTINGS, applySettingsToRuntime } from './data/settingsModel';
import { RotateCw, CheckCircle2, Loader2, WifiOff } from 'lucide-react';

// Lazy-loaded: pulls in the xlsx/papaparse parsing libraries only when the user
// actually opens the Import Excel/CSV page, keeping the main bundle lean.
const ImportSalesPage = lazy(() =>
  import('./components/ImportSalesPage').then((m) => ({ default: m.ImportSalesPage }))
);

// Lazy-loaded: "Calcul du quotidien" is a large, self-contained reconciliation tool most sessions
// never open.
const CashCheckPage = lazy(() => import('./components/CashCheckPage').then((m) => ({ default: m.CashCheckPage })));

// Lazy-loaded: the Stock module (5 pages) is only fetched when the user opens the Stock section.
const StockPage = lazy(() => import('./components/StockPage').then((m) => ({ default: m.StockPage })));
const StockMovementsPage = lazy(() =>
  import('./components/StockMovementsPage').then((m) => ({ default: m.StockMovementsPage }))
);
const StockInventoryPage = lazy(() =>
  import('./components/StockInventoryPage').then((m) => ({ default: m.StockInventoryPage }))
);
const StockLossesPage = lazy(() =>
  import('./components/StockLossesPage').then((m) => ({ default: m.StockLossesPage }))
);
const StockLotsPage = lazy(() => import('./components/StockLotsPage').then((m) => ({ default: m.StockLotsPage })));
const StockUnitsPage = lazy(() => import('./components/StockUnitsPage').then((m) => ({ default: m.StockUnitsPage })));
const StockImportPage = lazy(() => import('./components/StockImportPage').then((m) => ({ default: m.StockImportPage })));

// Lazy-loaded: the "Produits, recettes & marges" module (4 pages).
const ProductsPage = lazy(() => import('./components/ProductsPage').then((m) => ({ default: m.ProductsPage })));
const ProductFormPage = lazy(() => import('./components/ProductFormPage').then((m) => ({ default: m.ProductFormPage })));
const ProductCatalogPage = lazy(() => import('./components/ProductCatalogPage').then((m) => ({ default: m.ProductCatalogPage })));
const ProductsImportPage = lazy(() => import('./components/ProductsImportPage').then((m) => ({ default: m.ProductsImportPage })));
const SubRecipesPage = lazy(() => import('./components/SubRecipesPage').then((m) => ({ default: m.SubRecipesPage })));

// Lazy-loaded: Journal d'activité.
const ActivityLogPage = lazy(() => import('./components/ActivityLogPage').then((m) => ({ default: m.ActivityLogPage })));
const SettingsPage = lazy(() => import('./components/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const SessionsPage = lazy(() => import('./components/SessionsPage').then((m) => ({ default: m.SessionsPage })));
const RolesPermissionsPage = lazy(() => import('./components/RolesPermissionsPage').then((m) => ({ default: m.RolesPermissionsPage })));

// Lazy-loaded: the "Achat et dépenses" → Dépenses module (2 pages).
const ExpensesPage = lazy(() => import('./components/ExpensesPage').then((m) => ({ default: m.ExpensesPage })));
const ExpenseCategoriesPage = lazy(() =>
  import('./components/ExpenseCategoriesPage').then((m) => ({ default: m.ExpenseCategoriesPage }))
);

// Lazy-loaded: the "Achat et dépenses" → Achats et acquisitions page.
const PurchasesPage = lazy(() => import('./components/PurchasesPage').then((m) => ({ default: m.PurchasesPage })));
const SuppliersPage = lazy(() => import('./components/SuppliersPage').then((m) => ({ default: m.SuppliersPage })));
const InvoicesPage = lazy(() => import('./components/InvoicesPage').then((m) => ({ default: m.InvoicesPage })));
// Lazy-loaded: the OCR page itself, and the tesseract.js/pdfjs-dist/mammoth libraries it dynamically
// imports internally, are only ever fetched when the user opens "OCR des factures".
const InvoiceOcrPage = lazy(() => import('./components/InvoiceOcrPage').then((m) => ({ default: m.InvoiceOcrPage })));
const PurchasesImportPage = lazy(() => import('./components/PurchasesImportPage').then((m) => ({ default: m.PurchasesImportPage })));

// Lazy-loaded: "Gestion du personnel" module (3 pages).
const EmployeesPage = lazy(() => import('./components/EmployeesPage').then((m) => ({ default: m.EmployeesPage })));
const PlanningPage = lazy(() => import('./components/PlanningPage').then((m) => ({ default: m.PlanningPage })));
const FinancialsPage = lazy(() => import('./components/FinancialsPage').then((m) => ({ default: m.FinancialsPage })));

// Lazy-loaded: "Rapports et analyses" module (7 pages) — each pulls in the jsPDF/autotable PDF
// engine only when opened, keeping the main bundle lean.
const SalesReportPage = lazy(() => import('./components/SalesReportPage').then((m) => ({ default: m.SalesReportPage })));
const PurchasesReportPage = lazy(() => import('./components/PurchasesReportPage').then((m) => ({ default: m.PurchasesReportPage })));
const ExpensesReportPage = lazy(() => import('./components/ExpensesReportPage').then((m) => ({ default: m.ExpensesReportPage })));
const StockReportPage = lazy(() => import('./components/StockReportPage').then((m) => ({ default: m.StockReportPage })));
const FinancialReportPage = lazy(() => import('./components/FinancialReportPage').then((m) => ({ default: m.FinancialReportPage })));
const TaxReportPage = lazy(() => import('./components/TaxReportPage').then((m) => ({ default: m.TaxReportPage })));
const MonthlyReportPage = lazy(() => import('./components/MonthlyReportPage').then((m) => ({ default: m.MonthlyReportPage })));
const ExportDataPage = lazy(() => import('./components/ExportDataPage').then((m) => ({ default: m.ExportDataPage })));
const ArchivePage = lazy(() => import('./components/ArchivePage').then((m) => ({ default: m.ArchivePage })));

// Lazy-loaded: Notifications & Alertes.
const NotificationsPage = lazy(() => import('./components/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));

const StockPageLoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center gap-2 py-24 text-sm text-gray-500 dark:text-gray-400">
    <Loader2 size={18} className="animate-spin" />
    <span>Chargement du module Stock…</span>
  </div>
);

const SIDEBAR_COLLAPSED_COOKIE = 'cn_sidebar_collapsed';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { preferencesEnabled } = useCookieConsent();
  // The collapsed/expanded state is the one real "user preference" this app currently has (no
  // theme/language toggle exists) — it's only persisted across visits when the user has opted
  // into preference cookies via the cookie consent banner; otherwise it just resets each session.
  const [isSidebarCollapsed, setIsSidebarCollapsedRaw] = useState(
    () => preferencesEnabled && getCookie(SIDEBAR_COLLAPSED_COOKIE) === '1'
  );
  const setIsSidebarCollapsed = (value: boolean) => {
    setIsSidebarCollapsedRaw(value);
    if (preferencesEnabled) setCookie(SIDEBAR_COLLAPSED_COOKIE, value ? '1' : '0', 365);
  };
  // Drop-in replacement for two plain useState calls: same external shape (setActiveTab/
  // setActiveSubItem take a plain string), but kept in sync with the URL's ?tab=&sub= — deep
  // links, page refreshes and the browser back/forward buttons all work. 'dashboard' has no
  // subitem, so the default subitem is '' (not a stray leftover like 'sales'), matching how every
  // onNavigateToDashboard handler below already resets it.
  const { activeTab, activeSubItem, setActiveTab, setActiveSubItem } = useUrlNavigation({ tab: 'dashboard', sub: '' });
  // The project handles light mode only — no dark-mode toggle exists in the UI. Kept as a plain
  // constant (rather than removing the prop from every page) so the many existing
  // isDarkMode={isDarkMode} call sites throughout this file don't need to change.
  const isDarkMode = false;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRefreshToast, setShowRefreshToast] = useState(false);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);

  // Business data (sales, stock, purchases...) is never cached for offline use — the app shell
  // itself works offline (installed PWA), but data actions correctly need connectivity. This
  // banner gives an honest, app-like signal instead of leaving failed requests unexplained.
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);
  const [activePeriod, setActivePeriod] = useState<TimeFilterPeriod>('today');
  const [compareWithPrevious, setCompareWithPrevious] = useState(true);
  const [customRange, setCustomRange] = useState({ start: '2026-09-01', end: '2026-09-07' });
  const [modalType, setModalType] = useState<
    'upgrade' | 'restock' | 'sales_returns' | 'purchase_returns' | 'products' | 'clients' | 'vendors' | null
  >(null);
  const { user, logout, hasPermission } = useAuth();
  const performedBy = user?.fullName ?? 'Utilisateur';

  // Defense in depth only — the real gate is server-side (every /roles, /users and /permissions
  // request requires roles:manage, see server/middleware/auth.ts). This just prevents a user
  // without the permission from sitting on a blank/erroring screen if they land here directly
  // (e.g. a stale bookmark from before their role was downgraded).
  useEffect(() => {
    if (activeTab === 'roles_permissions' && !hasPermission('roles:manage')) {
      setActiveTab('dashboard');
      setActiveSubItem('');
    }
  }, [activeTab, hasPermission, setActiveTab, setActiveSubItem]);

  const [salesTransactions, setSalesTransactions] = useState<SaleTransaction[]>([]);
  const [stockProducts, setStockProducts] = useState<StockProduct[]>([]);
  const [stockLots, setStockLots] = useState<StockLot[]>([]);
  const [stockLedger, setStockLedger] = useState<StockLedgerEntry[]>([]);
  const [stockUnits, setStockUnits] = useState<StockUnit[]>([]);
  const [catalogArticles, setCatalogArticles] = useState<CatalogArticle[]>([]);
  const [catalogExtras, setCatalogExtras] = useState<CatalogExtra[]>([]);
  const [productCategories, setProductCategories] = useState<ProductCategory[]>([]);
  const [productSubCategories, setProductSubCategories] = useState<ProductSubCategory[]>([]);
  const [subRecipes, setSubRecipes] = useState<SubRecipe[]>([]);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [purchaseReceptions, setPurchaseReceptions] = useState<PurchaseReception[]>([]);
  const [supplierInvoices, setSupplierInvoices] = useState<SupplierInvoice[]>([]);
  const [productAliases, setProductAliases] = useState<ProductAlias[]>([]);
  const [hrEmployees, setHrEmployees] = useState<Employee[]>([]);
  const [hrShifts, setHrShifts] = useState<Shift[]>([]);
  const [hrDayRecords, setHrDayRecords] = useState<DayRecord[]>([]);
  const [hrRecurringPlans, setHrRecurringPlans] = useState<RecurringPlan[]>([]);
  const [hrFinancialRecords, setHrFinancialRecords] = useState<FinancialRecord[]>([]);
  const [treatedAlerts, setTreatedAlerts] = useState<Record<string, { treatedAt: string; treatedBy: string }>>({});
  const [monthlySalesTargets, setMonthlySalesTargets] = useState<MonthlyTarget[]>([]);
  const [cashVerifications, setCashVerifications] = useState<CashVerification[]>([]);
  const [revenueEntries, setRevenueEntries] = useState<RevenueEntry[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Fetches every domain slice from the API in parallel. Called once on mount, and again after
  // every mutation — the backend owns all cascade/derivation logic (rename cascades, stock
  // ledger application, purchase order receiving, HR cascading deletes...), so re-fetching is the
  // simplest way to guarantee the client never has to reimplement that logic a second time.
  const loadAllData = useCallback(async () => {
    // Every endpoint below is gated server-side by a permission (see server/middleware/auth.ts),
    // and a role like Compte Saisie legitimately lacks most of them. Requesting a resource the
    // user isn't allowed to see would 403 and, inside a plain Promise.all, fail the ENTIRE initial
    // load over a single expected/permission-driven rejection — so each fetch is skipped up front
    // (never even sent) when the permission is missing, falling back to an empty default instead.
    // A real failure on a request the user IS allowed to make still rejects normally and surfaces
    // via loadError below, same as before.
    const fetchIfAllowed = <T,>(permission: string, fetcher: () => Promise<T>, fallback: T): Promise<T> =>
      hasPermission(permission) ? fetcher() : Promise.resolve(fallback);

    // Same idea as fetchIfAllowed, but for read-only reference/lookup data that more than one
    // module's own :view permission legitimately needs to populate its pickers (product catalog,
    // stock units, employee & shift names...) — mirrors the OR-of-permissions the matching GET
    // route accepts server-side (requireAnyPermission, see server/routes/*.ts). Without this, a
    // role scoped to a single operational permission (e.g. "Compte Saisie" with only sales:create)
    // would see every dependent dropdown (products, shifts, employee names) empty.
    const fetchIfAnyAllowed = <T,>(permissions: string[], fetcher: () => Promise<T>, fallback: T): Promise<T> =>
      permissions.some((p) => hasPermission(p)) ? fetcher() : Promise.resolve(fallback);

    const PRODUCTS_READ_PERMS = ['products:view', 'products:manage', 'sales:create', 'sales:view', 'stock:inventory', 'stock:manage', 'purchases:create', 'purchases:edit'];
    const STOCK_REF_READ_PERMS = ['stock:view', 'stock:manage', 'stock:inventory', 'products:manage', 'sales:create'];
    const STOCK_LOTS_READ_PERMS = ['stock:view', 'stock:manage', 'stock:inventory'];
    const HR_REF_READ_PERMS = ['hr:view', 'hr:manage', 'hr:financial', 'sales:create', 'sales:view'];

    const [
      categories, subCategories, extras, articles, subRecipesRes,
      units, products, lots, ledger,
      transactions,
      expenseCats, expensesRes,
      suppliersRes, orders, receptions, invoices, productAliasesRes,
      employees, shifts, dayRecords, recurringPlans, financialRecords,
      treated, log, monthlyTargets, cashVerificationsRes, revenueEntriesRes, settingsRes,
    ] = await Promise.all([
      fetchIfAnyAllowed(PRODUCTS_READ_PERMS, () => productCatalogApi.getProductCategories(), []),
      fetchIfAnyAllowed(PRODUCTS_READ_PERMS, () => productCatalogApi.getProductSubCategories(), []),
      fetchIfAnyAllowed(PRODUCTS_READ_PERMS, () => productCatalogApi.getCatalogExtras(), []),
      fetchIfAnyAllowed(PRODUCTS_READ_PERMS, () => productCatalogApi.getCatalogArticles(), []),
      fetchIfAnyAllowed(PRODUCTS_READ_PERMS, () => productCatalogApi.getSubRecipes(), []),
      fetchIfAnyAllowed(STOCK_REF_READ_PERMS, () => stockApi.getStockUnits(), []),
      fetchIfAnyAllowed(STOCK_REF_READ_PERMS, () => stockApi.getStockProducts(), []),
      fetchIfAnyAllowed(STOCK_LOTS_READ_PERMS, () => stockApi.getStockLots(), []),
      fetchIfAnyAllowed(STOCK_LOTS_READ_PERMS, () => stockApi.getStockLedger(), []),
      fetchIfAllowed('sales:view', () => salesApi.getSalesTransactions(), []),
      fetchIfAllowed('expenses:view', () => expensesApi.getExpenseCategories(), []),
      fetchIfAllowed('expenses:view', () => expensesApi.getExpenses(), []),
      fetchIfAllowed('purchases:view', () => purchasesApi.getSuppliers(), []),
      fetchIfAllowed('purchases:view', () => purchasesApi.getPurchaseOrders(), []),
      fetchIfAllowed('purchases:view', () => purchasesApi.getPurchaseReceptions(), []),
      fetchIfAllowed('purchases:view', () => purchasesApi.getSupplierInvoices(), []),
      fetchIfAllowed('purchases:view', () => purchasesApi.getProductAliases(), []),
      fetchIfAnyAllowed(HR_REF_READ_PERMS, () => hrApi.getEmployees(), []),
      fetchIfAnyAllowed(HR_REF_READ_PERMS, () => hrApi.getShifts(), []),
      fetchIfAllowed('hr:view', () => hrApi.getDayRecords(), []),
      fetchIfAllowed('hr:view', () => hrApi.getRecurringPlans(), []),
      fetchIfAllowed('hr:financial', () => hrApi.getFinancialRecords(), []),
      fetchIfAllowed('notifications:view', () => notificationsApi.getTreatedAlerts(), {}),
      fetchIfAllowed('activity_log:view', () => activityLogApi.getActivityLog(), []),
      fetchIfAllowed('dashboard:view', () => dashboardApi.getMonthlyTargets(), []),
      fetchIfAllowed('sales:cash_check', () => cashVerificationsApi.getCashVerifications(), []),
      fetchIfAllowed('sales:cash_check', () => revenueEntriesApi.getRevenueEntries(), []),
      settingsApi.getSettings(), // no permission gate — every authenticated user needs it for runtime config
    ]);
    setCatalogExtras(extras);
    setProductCategories(categories);
    setProductSubCategories(subCategories);
    setCatalogArticles(articles);
    setSubRecipes(subRecipesRes);
    setStockUnits(units);
    setStockProducts(products);
    setStockLots(lots);
    setStockLedger(ledger);
    setSalesTransactions(transactions);
    setExpenseCategories(expenseCats);
    setExpenses(expensesRes);
    setSuppliers(suppliersRes);
    setPurchaseOrders(orders);
    setPurchaseReceptions(receptions);
    setSupplierInvoices(invoices);
    setProductAliases(productAliasesRes);
    setHrEmployees(employees);
    setHrShifts(shifts);
    setHrDayRecords(dayRecords);
    setHrRecurringPlans(recurringPlans);
    setHrFinancialRecords(financialRecords);
    setTreatedAlerts(treated);
    setActivityLog(log);
    setMonthlySalesTargets(monthlyTargets);
    setCashVerifications(cashVerificationsRes);
    setRevenueEntries(revenueEntriesRes);
    setAppSettings(settingsRes);
    applySettingsToRuntime(settingsRes);
  }, [hasPermission]);

  const handleSaveSettings = async (next: AppSettings) => {
    const saved = await settingsApi.updateSettings(next);
    setAppSettings(saved);
    applySettingsToRuntime(saved);
  };

  useEffect(() => {
    loadAllData()
      .then(() => setIsDataLoaded(true))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Impossible de charger les données.'));
  }, [loadAllData]);

  // Every mutation handler below runs its API call through this wrapper: on success the whole
  // data set is refreshed from the server (so cascades never need reimplementing client-side), on
  // failure the error is surfaced to the user instead of silently discarded.
  const runMutation = async (fn: () => Promise<unknown>): Promise<void> => {
    try {
      await fn();
      await loadAllData();
    } catch (err) {
      console.error(err);
      window.alert(err instanceof ApiError ? err.message : 'Une erreur est survenue. Réessayez.');
    }
  };

  const handleRefresh = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    loadAllData()
      .catch((err) => console.error(err))
      .finally(() => {
        setIsRefreshing(false);
        setShowRefreshToast(true);
        setTimeout(() => setShowRefreshToast(false), 3000);
      });
  };

  // Every manual stock operation (movement, transfer, loss, adjustment, inventory) funnels
  // through this single function; the child page already computes the full StockLedgerEntry
  // objects, only the input fields are sent — the server recomputes quantityBefore/After/
  // valueImpact itself from live stock state and applies them transactionally.
  const handlePostStockEntries = (entries: StockLedgerEntry[]) => {
    runMutation(() =>
      stockApi.postStockLedgerEntries(
        entries.map((e) => ({
          type: e.type, productId: e.productId, zone: e.zone, relatedZone: e.relatedZone, quantityDelta: e.quantityDelta,
          reason: e.reason, comment: e.comment, lotNumber: e.lotNumber, expiryDate: e.expiryDate, performedBy: e.performedBy,
          groupId: e.groupId, theoreticalQty: e.theoreticalQty, realQty: e.realQty, discrepancyQty: e.discrepancyQty,
          discrepancyValue: e.discrepancyValue, inventoryChoice: e.inventoryChoice, inventoryScope: e.inventoryScope,
        }))
      )
    );
  };

  // Cancelling never deletes history: the entry is kept and flagged "Annulé", and its effect on
  // the product quantity is reversed.
  const handleCancelStockEntry = (entryId: string, cancelledBy: string) => {
    runMutation(() => stockApi.cancelStockLedgerEntry(entryId, cancelledBy));
  };

  const handleCreateStockUnit = (unit: StockUnit) => {
    runMutation(() => stockApi.createStockUnit(unit.name));
  };

  // Renaming a unit cascades to every product referencing its old name — handled server-side.
  const handleRenameStockUnit = (unitId: string, newName: string) => {
    runMutation(() => stockApi.renameStockUnit(unitId, newName));
  };

  // Stock → Import Excel/CSV posts the same kind of ledger entries as a manual movement, plus
  // optional direct threshold/target updates.
  const handlePostImportedStock = (
    entries: StockLedgerEntry[],
    _lotUpserts: StockLot[],
    productUpdates: Array<{ id: string; minThreshold?: number; targetStock?: number }>
  ) => {
    void _lotUpserts; // lots are derived server-side from each entry's lotNumber/expiryDate
    runMutation(() =>
      stockApi.postImportedStock(
        entries.map((e) => ({
          type: e.type, productId: e.productId, zone: e.zone, relatedZone: e.relatedZone, quantityDelta: e.quantityDelta,
          reason: e.reason, comment: e.comment, lotNumber: e.lotNumber, expiryDate: e.expiryDate, performedBy: e.performedBy,
        })),
        productUpdates
      )
    );
  };

  // Stock → Import Excel/CSV → "Nouveaux ingrédients" creates brand-new StockProduct rows —
  // independent creates, so a simple Promise.all is enough (no shared before/after quantities to
  // keep atomic, unlike the ledger-based movements import above).
  const handleImportIngredients = (newProducts: (Omit<StockProduct, 'id'> & { lotNumber?: string; expiryDate?: string })[]) => {
    runMutation(() => Promise.all(newProducts.map((p) => stockApi.createStockProduct(p))));
  };

  const toArticleInput = (article: CatalogArticle) => ({
    name: article.name, category: article.category, subCategory: article.subCategory, price: article.price,
    description: article.description, imageUrl: article.imageUrl, isAvailable: article.isAvailable,
    extraIds: article.extraIds, variants: article.variants, recipe: article.recipe, targetMarginRate: article.targetMarginRate,
  });

  const handleCreateProduct = (article: CatalogArticle) => {
    runMutation(() => productCatalogApi.createCatalogArticle(toArticleInput(article)));
  };

  const handleUpdateProduct = (article: CatalogArticle) => {
    runMutation(() => productCatalogApi.updateCatalogArticle(article.id, toArticleInput(article)));
  };

  const handleDeleteProduct = (articleId: string) => {
    runMutation(() => productCatalogApi.deleteCatalogArticle(articleId));
  };

  const handleToggleProductAvailability = (articleId: string, isAvailable: boolean) => {
    runMutation(() => productCatalogApi.setArticleAvailability(articleId, isAvailable));
  };

  const handleImportProducts = (newArticles: CatalogArticle[]) => {
    runMutation(() => Promise.all(newArticles.map((a) => productCatalogApi.createCatalogArticle(toArticleInput(a)))));
  };

  const handleCreateSubRecipe = (subRecipe: SubRecipe) => {
    runMutation(() => productCatalogApi.createSubRecipe({ name: subRecipe.name, description: subRecipe.description, yieldQuantity: subRecipe.yieldQuantity, yieldUnit: subRecipe.yieldUnit, ingredients: subRecipe.ingredients }));
  };

  const handleUpdateSubRecipe = (subRecipe: SubRecipe) => {
    runMutation(() => productCatalogApi.updateSubRecipe(subRecipe.id, { name: subRecipe.name, description: subRecipe.description, yieldQuantity: subRecipe.yieldQuantity, yieldUnit: subRecipe.yieldUnit, ingredients: subRecipe.ingredients }));
  };

  const handleDeleteSubRecipe = (subRecipeId: string) => {
    runMutation(() => productCatalogApi.deleteSubRecipe(subRecipeId));
  };

  // Sous-recettes → Import Excel/CSV: POST /sub-recipes only ever accepts one sub-recipe per
  // call, so a bulk import is a Promise.all of independent creates (same pattern as ingredients).
  const handleImportSubRecipes = (newSubRecipes: Omit<SubRecipe, 'id' | 'createdAt'>[]) => {
    runMutation(() => Promise.all(newSubRecipes.map((sr) => productCatalogApi.createSubRecipe(sr))));
  };

  const handleCreateProductCategory = (category: ProductCategory) => {
    runMutation(() => productCatalogApi.createProductCategory(category.name));
  };

  const handleRenameProductCategory = (categoryId: string, newName: string) => {
    runMutation(() => productCatalogApi.renameProductCategory(categoryId, newName));
  };

  const handleDeleteProductCategory = (categoryId: string) => {
    runMutation(() => productCatalogApi.deleteProductCategory(categoryId));
  };

  const handleCreateProductSubCategory = (subCategory: ProductSubCategory) => {
    runMutation(() => productCatalogApi.createProductSubCategory(subCategory.categoryId, subCategory.name));
  };

  const handleRenameProductSubCategory = (subCategoryId: string, newName: string, newCategoryId: string) => {
    runMutation(() => productCatalogApi.renameProductSubCategory(subCategoryId, newCategoryId, newName));
  };

  const handleDeleteProductSubCategory = (subCategoryId: string) => {
    runMutation(() => productCatalogApi.deleteProductSubCategory(subCategoryId));
  };

  const handleCreateExtra = (extra: Omit<CatalogExtra, 'id'>) => {
    return runMutation(() => productCatalogApi.createCatalogExtra(extra));
  };

  const handleUpdateExtra = (id: string, extra: Omit<CatalogExtra, 'id'>) => {
    return runMutation(() => productCatalogApi.updateCatalogExtra(id, extra));
  };

  const handleDeleteExtra = (id: string) => {
    runMutation(() => productCatalogApi.deleteCatalogExtra(id));
  };

  const toExpenseInput = (expense: Expense) => ({
    title: expense.title, amount: expense.amount, date: expense.date, categoryId: expense.categoryId,
    nature: expense.nature, recurrence: expense.recurrence, paymentMethod: expense.paymentMethod,
    comment: expense.comment, attachment: expense.attachment,
  });

  const handleCreateExpense = (expense: Expense) => {
    runMutation(() => expensesApi.createExpense(toExpenseInput(expense)));
  };

  const handleUpdateExpense = (expense: Expense) => {
    runMutation(() => expensesApi.updateExpense(expense.id, toExpenseInput(expense)));
  };

  const handleDeleteExpense = (expenseId: string) => {
    runMutation(() => expensesApi.deleteExpense(expenseId));
  };

  const handleUpdateExpenseStatus = (expenseId: string, status: ExpenseStatus) => {
    runMutation(() => expensesApi.updateExpenseStatus(expenseId, status));
  };

  const handleCreateExpenseCategory = (category: ExpenseCategory) => {
    runMutation(() => expensesApi.createExpenseCategory(category.name));
  };

  const handleRenameExpenseCategory = (categoryId: string, newName: string) => {
    runMutation(() => expensesApi.renameExpenseCategory(categoryId, newName));
  };

  const handleDeleteExpenseCategory = (categoryId: string) => {
    runMutation(() => expensesApi.deleteExpenseCategory(categoryId));
  };

  const toOrderInput = (order: PurchaseOrder) => ({
    supplierId: order.supplierId, orderDate: order.orderDate, expectedDate: order.expectedDate, notes: order.notes,
    createdBy: order.createdBy, lines: order.lines.map((l) => ({ id: l.id, productId: l.productId, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice })),
  });

  const handleCreatePurchaseOrder = (order: PurchaseOrder) => {
    runMutation(() => purchasesApi.createPurchaseOrder(toOrderInput(order)));
  };

  // Achats → Import Excel/CSV creates every parsed order the same way a single manual order
  // would (same endpoint, same input shape), just in parallel for the whole batch.
  const handleImportPurchaseOrders = (orders: PurchaseOrder[]) => {
    runMutation(() => Promise.all(orders.map((o) => purchasesApi.createPurchaseOrder(toOrderInput(o)))));
  };

  const handleUpdatePurchaseOrder = (order: PurchaseOrder) => {
    runMutation(() => purchasesApi.updatePurchaseOrder(order.id, toOrderInput(order)));
  };

  const handleDeletePurchaseOrder = (orderId: string) => {
    runMutation(() => purchasesApi.deletePurchaseOrder(orderId));
  };

  const handleUpdatePurchaseOrderStatus = (orderId: string, status: PurchaseOrderStatus) => {
    runMutation(() => purchasesApi.updatePurchaseOrderStatus(orderId, status));
  };

  const handleCreateSupplier = (supplier: Supplier) => {
    runMutation(() => purchasesApi.createSupplier({ name: supplier.name, taxId: supplier.taxId, phone: supplier.phone, whatsapp: supplier.whatsapp, email: supplier.email, address: supplier.address, mainContact: supplier.mainContact, notes: supplier.notes }));
  };

  const handleUpdateSupplier = (supplier: Supplier) => {
    runMutation(() => purchasesApi.updateSupplier(supplier.id, { name: supplier.name, taxId: supplier.taxId, phone: supplier.phone, whatsapp: supplier.whatsapp, email: supplier.email, address: supplier.address, mainContact: supplier.mainContact, notes: supplier.notes }));
  };

  // Achats → Import Excel/CSV (Fournisseurs) creates every parsed supplier the same way a single
  // manual supplier would, just in parallel for the whole batch.
  const handleImportSuppliers = (newSuppliers: Supplier[]) => {
    runMutation(() =>
      Promise.all(
        newSuppliers.map((s) =>
          purchasesApi.createSupplier({ name: s.name, taxId: s.taxId, phone: s.phone, whatsapp: s.whatsapp, email: s.email, address: s.address, mainContact: s.mainContact, notes: s.notes })
        )
      )
    );
  };

  const handleDeleteSupplier = (supplierId: string) => {
    runMutation(() => purchasesApi.deleteSupplier(supplierId));
  };

  // A validated reception posts stock entries through the SAME ledger pipeline as every manual
  // stock movement, and updates the order's status — all transactionally, server-side.
  const handleReceivePurchaseOrder = (order: PurchaseOrder, reception: PurchaseReception) => {
    runMutation(() =>
      purchasesApi.receivePurchaseOrder(order.id, {
        receptionDate: reception.receptionDate, zone: reception.zone, performedBy: reception.performedBy, lines: reception.lines,
      })
    );
  };

  const handleCreateInvoice = (invoice: SupplierInvoice) => {
    runMutation(() =>
      purchasesApi.createSupplierInvoice({
        invoiceNumber: invoice.invoiceNumber, supplierId: invoice.supplierId, purchaseOrderId: invoice.purchaseOrderId,
        invoiceDate: invoice.invoiceDate, dueDate: invoice.dueDate, amountHT: invoice.amountHT, vatAmount: invoice.vatAmount,
        amountTTC: invoice.amountTTC, amountPaid: invoice.amountPaid, paymentMethod: invoice.paymentMethod,
      })
    );
  };

  // Achats → Import Excel/CSV (Factures) creates every parsed invoice the same way a single
  // manual invoice would, just in parallel for the whole batch.
  const handleImportInvoices = (newInvoices: SupplierInvoice[]) => {
    runMutation(() =>
      Promise.all(
        newInvoices.map((invoice) =>
          purchasesApi.createSupplierInvoice({
            invoiceNumber: invoice.invoiceNumber, supplierId: invoice.supplierId, purchaseOrderId: invoice.purchaseOrderId,
            invoiceDate: invoice.invoiceDate, dueDate: invoice.dueDate, amountHT: invoice.amountHT, vatAmount: invoice.vatAmount,
            amountTTC: invoice.amountTTC, amountPaid: invoice.amountPaid, paymentMethod: invoice.paymentMethod,
          })
        )
      )
    );
  };

  const handleUpdateInvoice = (invoice: SupplierInvoice) => {
    runMutation(() =>
      purchasesApi.updateSupplierInvoice(invoice.id, {
        invoiceNumber: invoice.invoiceNumber, supplierId: invoice.supplierId, purchaseOrderId: invoice.purchaseOrderId,
        invoiceDate: invoice.invoiceDate, dueDate: invoice.dueDate, amountHT: invoice.amountHT, vatAmount: invoice.vatAmount,
        amountTTC: invoice.amountTTC, amountPaid: invoice.amountPaid, paymentMethod: invoice.paymentMethod,
      })
    );
  };

  const handleDeleteInvoice = (invoiceId: string) => {
    runMutation(() => purchasesApi.deleteSupplierInvoice(invoiceId));
  };

  const handleRecordInvoicePayment = (invoiceId: string, amountAdded: number) => {
    runMutation(() => purchasesApi.recordInvoicePayment(invoiceId, amountAdded));
  };

  // Reusable OCR-label -> stock-product correspondence: saved immediately (so the current review
  // screen can use it right away) and also merged into local state without waiting for a full reload.
  const handleCreateProductAlias = async (rawLabel: string, productId: string): Promise<ProductAlias> => {
    const alias = await purchasesApi.createProductAlias({ rawLabel, productId });
    setProductAliases((prev) => [...prev.filter((a) => a.normalizedLabel !== alias.normalizedLabel), alias]);
    return alias;
  };

  // The OCR review screen's single "Valider et intégrer" action: creates the supplier if new, then
  // chains the SAME order -> reception -> invoice calls the manual Achats pages already use, so an
  // OCR-imported invoice updates stock and financials through the exact same backend logic — never
  // a second, parallel way to record a purchase. Throws on failure so the page shows its own error
  // state, instead of the generic runMutation alert.
  const handleIntegrateOcrInvoice = async (payload: {
    supplierId: string;
    newSupplierName: string;
    orderDate: string;
    createdBy: string;
    lines: { productId: string; quantity: number; unit: string; unitPrice: number }[];
    receptionDate: string;
    zone: 'Réserve principale' | 'Dépôt';
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    amountHT: number;
    vatAmount: number;
    amountTTC: number;
    paymentMethod: PurchasePaymentMethod;
  }): Promise<void> => {
    let supplierId = payload.supplierId;
    if (!supplierId) {
      const supplier = await purchasesApi.createSupplier({ name: payload.newSupplierName });
      supplierId = supplier.id;
    }
    const order = await purchasesApi.createPurchaseOrder({
      supplierId, orderDate: payload.orderDate, createdBy: payload.createdBy,
      lines: payload.lines.map((l) => ({ id: `ocr-${Math.random().toString(36).slice(2)}`, ...l })),
    });
    // Every order created via createPurchaseOrder starts life as Brouillon — advance it through
    // Commandée before receiving, exactly like the manual Achats flow, so an OCR-integrated order
    // isn't silently received while still Brouillon and can't be told apart from a never-sent one.
    await purchasesApi.updatePurchaseOrderStatus(order.id, 'Commandée');
    await purchasesApi.receivePurchaseOrder(order.id, {
      receptionDate: payload.receptionDate, zone: payload.zone, performedBy: payload.createdBy,
      lines: order.lines.map((l) => ({ lineId: l.id, quantityReceived: l.quantity })),
    });
    await purchasesApi.createSupplierInvoice({
      invoiceNumber: payload.invoiceNumber, supplierId, purchaseOrderId: order.id,
      invoiceDate: payload.invoiceDate, dueDate: payload.dueDate, amountHT: payload.amountHT,
      vatAmount: payload.vatAmount, amountTTC: payload.amountTTC, amountPaid: 0, paymentMethod: payload.paymentMethod,
    });
    await loadAllData();
  };

  const toEmployeeInput = (employee: Employee) => ({
    firstName: employee.firstName, lastName: employee.lastName, phone: employee.phone, photoUrl: employee.photoUrl,
    poste: employee.poste, entryDate: employee.entryDate, status: employee.status, salary: employee.salary,
    cinNumber: employee.cinNumber, cinIssueDate: employee.cinIssueDate, cinDocument: employee.cinDocument,
  });

  // --- Gestion du personnel: Employés ---
  const handleCreateEmployee = (employee: Employee, account?: { email?: string; roleId: string; password: string }) => {
    runMutation(() => hrApi.createEmployee(toEmployeeInput(employee), account));
  };

  const handleUpdateEmployee = (employee: Employee) => {
    runMutation(() => hrApi.updateEmployee(employee.id, toEmployeeInput(employee)));
  };

  // Archiving replaces deletion — planning, attendance and financial history are never touched,
  // only the employee's own status (and, if a login account is linked, its access) change.
  const handleArchiveEmployee = (employeeId: string) => {
    runMutation(() => hrApi.archiveEmployee(employeeId));
  };

  const handleReactivateEmployee = (employeeId: string) => {
    runMutation(() => hrApi.reactivateEmployee(employeeId));
  };

  // --- Gestion du personnel: Shifts (capped at Paramètres → Nombre maximum de shifts) ---
  const handleCreateShift = (shift: Shift) => {
    runMutation(() => hrApi.createShift({ name: shift.name, startTime: shift.startTime, endTime: shift.endTime, description: shift.description }));
  };

  const handleUpdateShift = (shift: Shift) => {
    runMutation(() => hrApi.updateShift(shift.id, { name: shift.name, startTime: shift.startTime, endTime: shift.endTime, description: shift.description }));
  };

  const handleDeleteShift = (shiftId: string) => {
    runMutation(() => hrApi.deleteShift(shiftId));
  };

  // --- Gestion du personnel: Planning & Présence ---
  const handleSavePlanning = (params: { employeeId: string; startDate: string; endDate: string; weeklyPattern: WeeklyPattern; isRecurring: boolean }) => {
    runMutation(() => hrApi.saveRecurringPlanning({ ...params, performedBy }));
  };

  const handleSetAttendance = (params: { employeeId: string; date: string; status: AttendanceStatus; shiftIds: string[] }) => {
    runMutation(() => hrApi.setDayRecord({ ...params, performedBy }));
  };

  const handleDeleteDayRecord = (record: DayRecord, scope: 'day' | 'recurrence') => {
    runMutation(() => hrApi.deleteDayRecord(record.id, scope));
  };

  // --- Gestion du personnel: Suivi financier ---
  const toFinancialInput = (record: FinancialRecord) => ({
    employeeId: record.employeeId, periodMonthIndex: record.periodMonthIndex, periodYear: record.periodYear,
    baseSalary: record.baseSalary, advances: record.advances, bonuses: record.bonuses, deductions: record.deductions,
    amountPaid: record.amountPaid, paymentDate: record.paymentDate,
  });

  const handleCreateFinancialRecord = (record: FinancialRecord) => {
    runMutation(() => hrApi.createFinancialRecord(toFinancialInput(record)));
  };

  const handleUpdateFinancialRecord = (record: FinancialRecord) => {
    runMutation(() => hrApi.updateFinancialRecord(record.id, toFinancialInput(record)));
  };

  const handleDeleteFinancialRecord = (recordId: string) => {
    runMutation(() => hrApi.deleteFinancialRecord(recordId));
  };

  // --- Notifications & Alertes ---
  // Alerts are always recomputed live from real state (see alertsModel.ts); only the "Traité"
  // flag needs its own persisted store, keyed by each alert's deterministic id.
  const handleMarkAlertTreated = (alert: OperationalAlert) => {
    runMutation(() => notificationsApi.markAlertTreated(alert.id, performedBy));
  };

  const handleMarkAlertUnread = (alertId: string) => {
    runMutation(() => notificationsApi.markAlertUnread(alertId));
  };

  const handleNavigateFromAlert = (tab: string, subItem?: string) => {
    setActiveTab(tab);
    setActiveSubItem(subItem ?? '');
  };

  const toTicketInput = (t: SaleTransaction) => ({
    saleNumber: t.saleNumber, serviceType: t.serviceType, tableOrArea: t.tableOrArea, items: t.items,
    itemsCount: t.itemsCount, itemsSummary: t.itemsSummary, paymentMethod: t.paymentMethod, barista: t.barista,
    totalAmount: t.totalAmount, date: t.date, time: t.time, month: t.month, year: t.year, status: t.status,
  });

  const handleSaveManualSalesTickets = (newTransactions: SaleTransaction[]) => {
    runMutation(() => salesApi.createSalesTransactions(newTransactions.map(toTicketInput)));
  };

  const handleSaveImportedSalesTickets = (newTransactions: SaleTransaction[]) => {
    runMutation(() => salesApi.createSalesTransactions(newTransactions.map(toTicketInput)));
  };

  const handleSaveInternalConsumption = (payload: ReturnType<typeof buildInternalConsumptionPayload>) =>
    runMutation(() => internalConsumptionApi.createInternalConsumption(payload));

  const handleRefundSale = (id: number) => {
    runMutation(() => salesApi.refundSaleTransaction(id));
  };

  // Deliberately bypasses runMutation: a failed cash-check confirmation must surface inline on the
  // page (this is a financial reconciliation record — silently pretending it saved would defeat
  // the whole point of the traceability this feature exists for), and a single new row never needs
  // a full app-wide refetch.
  const handleConfirmCashVerification = async (input: CashVerificationInput): Promise<void> => {
    const created = await cashVerificationsApi.createCashVerification(input);
    setCashVerifications((prev) => [created, ...prev]);
  };

  // Same deliberate bypass of runMutation as above: these are financial figures typed on the
  // Calcul du quotidien page, so a failure must show inline next to the form (the panel catches
  // it) instead of a generic alert, and one row never justifies a full app-wide refetch.
  const handleCreateRevenueEntry = async (input: RevenueEntryInput): Promise<void> => {
    const created = await revenueEntriesApi.createRevenueEntry(input);
    setRevenueEntries((prev) => [created, ...prev]);
  };

  const handleUpdateRevenueEntry = async (id: string, input: RevenueEntryInput): Promise<void> => {
    const updated = await revenueEntriesApi.updateRevenueEntry(id, input);
    setRevenueEntries((prev) => prev.map((r) => (r.id === id ? updated : r)));
  };

  const handleDeleteRevenueEntry = async (id: string): Promise<void> => {
    await revenueEntriesApi.deleteRevenueEntry(id);
    setRevenueEntries((prev) => prev.filter((r) => r.id !== id));
  };


  const dashboardRange = useMemo(() => resolveDashboardRange(activePeriod, customRange), [activePeriod, customRange]);

  // Same computeCashKpis used by the "Calcul du quotidien" page — the dashboard's "Total caisse
  // actuelle" card must always agree with that page's own KPIs, so it's the exact same call
  // rather than a second, possibly-divergent calculation.
  const cashKpis = useMemo(
    () => computeCashKpis(salesTransactions, expenses, supplierInvoices, cashVerifications, revenueEntries),
    [salesTransactions, expenses, supplierInvoices, cashVerifications, revenueEntries]
  );

  const dashboardPeriodData = useMemo(
    () =>
      computeDashboardPeriodData(dashboardRange, {
        transactions: salesTransactions,
        orders: purchaseOrders,
        expenses,
        stockProducts,
        financialRecords: hrFinancialRecords,
        articles: catalogArticles,
        subRecipes,
      }),
    [dashboardRange, salesTransactions, purchaseOrders, expenses, stockProducts, hrFinancialRecords, catalogArticles, subRecipes]
  );

  const productRankings = useMemo(
    () => buildProductRankings(salesTransactions, catalogArticles, stockProducts, subRecipes),
    [salesTransactions, catalogArticles, stockProducts, subRecipes]
  );

  const lowStockDashboardList = useMemo(() => buildLowStockList(stockProducts), [stockProducts]);

  const dashboardAlerts = useMemo(
    () =>
      buildDashboardAlerts({
        stockProducts,
        stockLots,
        stockLedger,
        articles: catalogArticles,
        subRecipes,
        suppliers,
        invoices: supplierInvoices,
      }),
    [stockProducts, stockLots, stockLedger, catalogArticles, subRecipes, suppliers, supplierInvoices]
  );

  const employeeFullNames = useMemo(() => hrEmployees.map(getEmployeeFullName), [hrEmployees]);
  const shiftNames = useMemo(() => hrShifts.map((s) => s.name), [hrShifts]);

  // Hero banner always shows "today", independent of the dashboard's selected analysis period.
  const heroTodayData = useMemo(
    () =>
      computeDashboardPeriodData(resolveDashboardRange('today'), {
        transactions: salesTransactions,
        orders: purchaseOrders,
        expenses,
        stockProducts,
        financialRecords: hrFinancialRecords,
        articles: catalogArticles,
        subRecipes,
      }),
    [salesTransactions, purchaseOrders, expenses, stockProducts, hrFinancialRecords, catalogArticles, subRecipes]
  );

  const dailySalesCalendarData = useMemo(() => buildDailySalesCalendar(salesTransactions, 8), [salesTransactions]);
  const salesByPeriodData = useMemo(() => buildSalesByPeriod(salesTransactions), [salesTransactions]);
  const currentMonthKey = todayIso().slice(0, 7);
  const customMonthlyTarget = monthlySalesTargets.find((t) => t.month === currentMonthKey)?.targetAmount;
  const categoryShareData = useMemo(
    () => buildCategoryShares(salesTransactions, dashboardRange, customMonthlyTarget),
    [salesTransactions, dashboardRange, customMonthlyTarget]
  );

  const handleSetMonthlyTarget = async (amount: number): Promise<void> => {
    await dashboardApi.setMonthlyTarget(currentMonthKey, amount);
    await loadAllData();
  };

  if (loadError) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <p className="text-sm font-semibold text-rose-600 mb-1">Impossible de charger l'application</p>
          <p className="text-xs text-gray-500">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!isDataLoaded) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
        <Loader2 size={22} className="text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className={`h-screen overflow-hidden ${isDarkMode ? 'dark bg-[#151D2A] text-gray-100' : 'bg-white text-gray-800'}`}>
      <div className="flex h-full">
        {/* Sidebar — flush to the viewport edges, forms one side of the app shell */}
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          activeSubItem={activeSubItem}
          setActiveSubItem={setActiveSubItem}
          onUpgradeClick={() => setModalType('upgrade')}
          isDarkMode={isDarkMode}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />

        {/* Workspace gutter — reclaims the sidebar's width automatically (flex-1) when it
            collapses; padded on desktop only (flush against the sidebar, inset on the other
            3 sides), flush on mobile/tablet so small screens stay full-bleed. */}
        <div className="flex-1 flex flex-col min-w-0 h-full lg:py-3 lg:pr-3">
          {/* Framed main workspace panel: sidebar + this panel together read as one shell */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#fcfcfc] dark:bg-[#151D2A] lg:rounded-2xl lg:shadow-md lg:border lg:border-gray-100 lg:dark:border-gray-800 overflow-hidden">
            {/* Top Header */}
            <Header
              onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
              isCollapsed={isSidebarCollapsed}
              onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              activeTab={activeTab}
              onNavigate={(tab) => {
                setActiveTab(tab);
                if (tab !== 'sales') setActiveSubItem('');
              }}
            />

            {/* Page Content Body — the only scrolling region, so the frame stays pinned.
                overscroll-contain stops a scroll that hits the top/bottom edge here from
                "chaining" to whatever's behind it (the locked document, see index.css) instead
                of just stopping — the classic mobile bug where flinging past the end of a list
                drags the whole page with it. custom-scrollbar gives it the same thin, themed
                scrollbar the sidebar's nav already has (visible where the platform honors
                ::-webkit-scrollbar styling, e.g. Android Chrome; iOS Safari always uses its own
                system overlay indicator regardless of CSS — no way to override that). */}
            <main id="app-main-scroll-area" className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar p-4 sm:p-6 lg:p-7 space-y-5 max-w-[1550px] w-full mx-auto">
            {activeTab === 'notifications' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <NotificationsPage
                  isDarkMode={isDarkMode}
                  stockProducts={stockProducts}
                  stockLots={stockLots}
                  stockLedger={stockLedger}
                  articles={catalogArticles}
                  subRecipes={subRecipes}
                  suppliers={suppliers}
                  invoices={supplierInvoices}
                  treatedAlerts={treatedAlerts}
                  onNavigate={handleNavigateFromAlert}
                  onMarkAlertTreated={handleMarkAlertTreated}
                  onMarkAlertUnread={handleMarkAlertUnread}
                />
              </Suspense>
            ) : activeTab === 'sales' ? (
              <SalesPage
                onNavigateToDashboard={() => {
                  setActiveTab('dashboard');
                  setActiveSubItem('');
                }}
                isDarkMode={isDarkMode}
                transactions={salesTransactions}
                onRefundSale={handleRefundSale}
              />
            ) : activeTab === 'sales_mgmt' && activeSubItem === 'sales_manual_add' ? (
              <ManualSalesEntryPage
                isDarkMode={isDarkMode}
                articles={catalogArticles}
                extras={catalogExtras}
                employees={employeeFullNames}
                shifts={shiftNames}
                onNavigateToDashboard={() => {
                  setActiveTab('dashboard');
                  setActiveSubItem('');
                }}
                onNavigateToSalesList={() => {
                  setActiveTab('sales');
                  setActiveSubItem('sales');
                }}
                onSaveTickets={handleSaveManualSalesTickets}
                onSaveInternalConsumption={handleSaveInternalConsumption}
              />
            ) : activeTab === 'sales_mgmt' && activeSubItem === 'sales_import' ? (
              <Suspense
                fallback={
                  <div className="flex items-center justify-center gap-2 py-24 text-sm text-gray-500 dark:text-gray-400">
                    <Loader2 size={18} className="animate-spin" />
                    <span>Chargement de l'import Excel/CSV…</span>
                  </div>
                }
              >
                <ImportSalesPage
                  isDarkMode={isDarkMode}
                  articles={catalogArticles}
                  extras={catalogExtras}
                  employees={employeeFullNames}
                  shifts={shiftNames}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToSalesList={() => {
                    setActiveTab('sales');
                    setActiveSubItem('sales');
                  }}
                  onSaveTickets={handleSaveImportedSalesTickets}
                />
              </Suspense>
            ) : activeTab === 'sales_mgmt' && activeSubItem === 'sales_cash_check' ? (
              <Suspense
                fallback={
                  <div className="flex items-center justify-center gap-2 py-24 text-sm text-gray-500 dark:text-gray-400">
                    <Loader2 size={18} className="animate-spin" />
                    <span>Chargement du calcul du quotidien…</span>
                  </div>
                }
              >
                <CashCheckPage
                  salesTransactions={salesTransactions}
                  expenses={expenses}
                  supplierInvoices={supplierInvoices}
                  verifications={cashVerifications}
                  revenueEntries={revenueEntries}
                  onConfirmVerification={handleConfirmCashVerification}
                  onCreateRevenueEntry={handleCreateRevenueEntry}
                  onUpdateRevenueEntry={handleUpdateRevenueEntry}
                  onDeleteRevenueEntry={handleDeleteRevenueEntry}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                />
              </Suspense>
            ) : activeTab === 'stock' && activeSubItem === 'stock_overview' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <StockPage
                  isDarkMode={isDarkMode}
                  products={stockProducts}
                  lots={stockLots}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToMovements={() => setActiveSubItem('stock_movements')}
                  onNavigateToInventory={() => setActiveSubItem('stock_inventory')}
                  onNavigateToLosses={() => setActiveSubItem('stock_losses')}
                  onNavigateToLots={() => setActiveSubItem('stock_lots')}
                />
              </Suspense>
            ) : activeTab === 'stock' && activeSubItem === 'stock_movements' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <StockMovementsPage
                  isDarkMode={isDarkMode}
                  products={stockProducts}
                  lots={stockLots}
                  employees={employeeFullNames}
                  ledger={stockLedger}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToStock={() => setActiveSubItem('stock_overview')}
                  onPostEntries={handlePostStockEntries}
                  onCancelEntry={handleCancelStockEntry}
                />
              </Suspense>
            ) : activeTab === 'stock' && activeSubItem === 'stock_inventory' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <StockInventoryPage
                  isDarkMode={isDarkMode}
                  products={stockProducts}
                  units={stockUnits}
                  ledger={stockLedger}
                  employees={employeeFullNames}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToStock={() => setActiveSubItem('stock_overview')}
                  onPostEntries={handlePostStockEntries}
                  onImportIngredients={handleImportIngredients}
                />
              </Suspense>
            ) : activeTab === 'stock' && activeSubItem === 'stock_losses' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <StockLossesPage
                  isDarkMode={isDarkMode}
                  products={stockProducts}
                  lots={stockLots}
                  employees={employeeFullNames}
                  ledger={stockLedger}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToStock={() => setActiveSubItem('stock_overview')}
                  onPostEntries={handlePostStockEntries}
                />
              </Suspense>
            ) : activeTab === 'stock' && activeSubItem === 'stock_lots' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <StockLotsPage
                  isDarkMode={isDarkMode}
                  products={stockProducts}
                  lots={stockLots}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToStock={() => setActiveSubItem('stock_overview')}
                  onNavigateToMovements={() => setActiveSubItem('stock_movements')}
                />
              </Suspense>
            ) : activeTab === 'stock' && activeSubItem === 'stock_units' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <StockUnitsPage
                  isDarkMode={isDarkMode}
                  units={stockUnits}
                  products={stockProducts}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToStock={() => setActiveSubItem('stock_overview')}
                  onCreateUnit={handleCreateStockUnit}
                  onRenameUnit={handleRenameStockUnit}
                />
              </Suspense>
            ) : activeTab === 'stock' && activeSubItem === 'stock_import' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <StockImportPage
                  isDarkMode={isDarkMode}
                  products={stockProducts}
                  units={stockUnits}
                  employees={employeeFullNames}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToStock={() => setActiveSubItem('stock_overview')}
                  onPostImportedStock={handlePostImportedStock}
                  onImportIngredients={handleImportIngredients}
                  onPostEntries={handlePostStockEntries}
                />
              </Suspense>
            ) : activeTab === 'products_recipes_mgmt' && activeSubItem === 'prm_products' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <ProductsPage
                  isDarkMode={isDarkMode}
                  articles={catalogArticles}
                  extras={catalogExtras}
                  categories={productCategories}
                  subCategories={productSubCategories}
                  ingredients={stockProducts}
                  subRecipes={subRecipes}
                  transactions={salesTransactions}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToAddProduct={() => {
                    setEditingProductId(null);
                    setActiveSubItem('prm_add_product');
                  }}
                  onNavigateToEditProduct={(articleId) => {
                    setEditingProductId(articleId);
                    setActiveSubItem('prm_add_product');
                  }}
                  onNavigateToCatalog={() => setActiveSubItem('prm_catalog')}
                  onNavigateToImport={() => setActiveSubItem('prm_import')}
                  onDeleteProduct={handleDeleteProduct}
                  onToggleAvailability={handleToggleProductAvailability}
                />
              </Suspense>
            ) : activeTab === 'products_recipes_mgmt' && activeSubItem === 'prm_add_product' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <ProductFormPage
                  isDarkMode={isDarkMode}
                  articles={catalogArticles}
                  extras={catalogExtras}
                  categories={productCategories}
                  subCategories={productSubCategories}
                  ingredients={stockProducts}
                  units={stockUnits}
                  subRecipes={subRecipes}
                  editingArticleId={editingProductId}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToProducts={() => {
                    setEditingProductId(null);
                    setActiveSubItem('prm_products');
                  }}
                  onCreateProduct={handleCreateProduct}
                  onUpdateProduct={handleUpdateProduct}
                  onCreateExtra={handleCreateExtra}
                />
              </Suspense>
            ) : activeTab === 'products_recipes_mgmt' && activeSubItem === 'prm_subrecipes' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <SubRecipesPage
                  isDarkMode={isDarkMode}
                  subRecipes={subRecipes}
                  ingredients={stockProducts}
                  units={stockUnits}
                  articles={catalogArticles}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToProducts={() => setActiveSubItem('prm_products')}
                  onCreateSubRecipe={handleCreateSubRecipe}
                  onUpdateSubRecipe={handleUpdateSubRecipe}
                  onDeleteSubRecipe={handleDeleteSubRecipe}
                  onImportSubRecipes={handleImportSubRecipes}
                />
              </Suspense>
            ) : activeTab === 'products_recipes_mgmt' && activeSubItem === 'prm_catalog' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <ProductCatalogPage
                  isDarkMode={isDarkMode}
                  categories={productCategories}
                  subCategories={productSubCategories}
                  articles={catalogArticles}
                  extras={catalogExtras}
                  ingredients={stockProducts}
                  units={stockUnits}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToProducts={() => setActiveSubItem('prm_products')}
                  onCreateCategory={handleCreateProductCategory}
                  onRenameCategory={handleRenameProductCategory}
                  onDeleteCategory={handleDeleteProductCategory}
                  onCreateSubCategory={handleCreateProductSubCategory}
                  onRenameSubCategory={handleRenameProductSubCategory}
                  onDeleteSubCategory={handleDeleteProductSubCategory}
                  onCreateExtra={handleCreateExtra}
                  onUpdateExtra={handleUpdateExtra}
                  onDeleteExtra={handleDeleteExtra}
                />
              </Suspense>
            ) : activeTab === 'products_recipes_mgmt' && activeSubItem === 'prm_import' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <ProductsImportPage
                  isDarkMode={isDarkMode}
                  categories={productCategories}
                  subCategories={productSubCategories}
                  extras={catalogExtras}
                  ingredients={stockProducts}
                  units={stockUnits}
                  subRecipes={subRecipes}
                  articles={catalogArticles}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToProducts={() => setActiveSubItem('prm_products')}
                  onImportProducts={handleImportProducts}
                  onImportSubRecipes={handleImportSubRecipes}
                />
              </Suspense>
            ) : activeTab === 'expenses_mgmt' && activeSubItem === 'expenses' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <ExpensesPage
                  isDarkMode={isDarkMode}
                  expenses={expenses}
                  categories={expenseCategories}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToCategories={() => setActiveSubItem('expenses_categories')}
                  onCreateExpense={handleCreateExpense}
                  onUpdateExpense={handleUpdateExpense}
                  onDeleteExpense={handleDeleteExpense}
                  onUpdateExpenseStatus={handleUpdateExpenseStatus}
                />
              </Suspense>
            ) : activeTab === 'expenses_mgmt' && activeSubItem === 'expenses_categories' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <ExpenseCategoriesPage
                  isDarkMode={isDarkMode}
                  categories={expenseCategories}
                  expenses={expenses}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToExpenses={() => setActiveSubItem('expenses')}
                  onCreateCategory={handleCreateExpenseCategory}
                  onRenameCategory={handleRenameExpenseCategory}
                  onDeleteCategory={handleDeleteExpenseCategory}
                />
              </Suspense>
            ) : activeTab === 'purchases_mgmt' && activeSubItem === 'purchases_acquisitions' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <PurchasesPage
                  isDarkMode={isDarkMode}
                  orders={purchaseOrders}
                  suppliers={suppliers}
                  employees={employeeFullNames}
                  receptions={purchaseReceptions}
                  invoices={supplierInvoices}
                  products={stockProducts}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onCreateOrder={handleCreatePurchaseOrder}
                  onUpdateOrder={handleUpdatePurchaseOrder}
                  onDeleteOrder={handleDeletePurchaseOrder}
                  onUpdateOrderStatus={handleUpdatePurchaseOrderStatus}
                  onCreateSupplier={handleCreateSupplier}
                  onReceivePurchaseOrder={handleReceivePurchaseOrder}
                  onCreateInvoice={handleCreateInvoice}
                  onRecordInvoicePayment={handleRecordInvoicePayment}
                />
              </Suspense>
            ) : activeTab === 'purchases_mgmt' && activeSubItem === 'purchases_suppliers' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <SuppliersPage
                  isDarkMode={isDarkMode}
                  suppliers={suppliers}
                  orders={purchaseOrders}
                  invoices={supplierInvoices}
                  products={stockProducts}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToPurchases={() => setActiveSubItem('purchases_acquisitions')}
                  onNavigateToInvoices={() => setActiveSubItem('purchases_invoices')}
                  onCreateSupplier={handleCreateSupplier}
                  onUpdateSupplier={handleUpdateSupplier}
                  onDeleteSupplier={handleDeleteSupplier}
                />
              </Suspense>
            ) : activeTab === 'purchases_mgmt' && activeSubItem === 'purchases_invoices' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <InvoicesPage
                  isDarkMode={isDarkMode}
                  invoices={supplierInvoices}
                  suppliers={suppliers}
                  orders={purchaseOrders}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToPurchases={() => setActiveSubItem('purchases_acquisitions')}
                  onNavigateToSuppliers={() => setActiveSubItem('purchases_suppliers')}
                  onCreateInvoice={handleCreateInvoice}
                  onUpdateInvoice={handleUpdateInvoice}
                  onDeleteInvoice={handleDeleteInvoice}
                  onRecordInvoicePayment={handleRecordInvoicePayment}
                />
              </Suspense>
            ) : activeTab === 'purchases_mgmt' && activeSubItem === 'purchases_ocr' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <InvoiceOcrPage
                  suppliers={suppliers}
                  products={stockProducts}
                  aliases={productAliases}
                  employees={employeeFullNames}
                  defaultPerformedBy={performedBy}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToPurchases={() => setActiveSubItem('purchases_acquisitions')}
                  onCreateProductAlias={handleCreateProductAlias}
                  onIntegrateInvoice={handleIntegrateOcrInvoice}
                />
              </Suspense>
            ) : activeTab === 'purchases_mgmt' && activeSubItem === 'purchases_import' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <PurchasesImportPage
                  isDarkMode={isDarkMode}
                  suppliers={suppliers}
                  products={stockProducts}
                  orders={purchaseOrders}
                  employees={employeeFullNames}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToPurchases={() => setActiveSubItem('purchases_acquisitions')}
                  onNavigateToSuppliers={() => setActiveSubItem('purchases_suppliers')}
                  onNavigateToInvoices={() => setActiveSubItem('purchases_invoices')}
                  onSaveOrders={handleImportPurchaseOrders}
                  onSaveSuppliers={handleImportSuppliers}
                  onSaveInvoices={handleImportInvoices}
                />
              </Suspense>
            ) : activeTab === 'staff_mgmt' && activeSubItem === 'staff_employees' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <EmployeesPage
                  isDarkMode={isDarkMode}
                  employees={hrEmployees}
                  dayRecords={hrDayRecords}
                  financialRecords={hrFinancialRecords}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToPlanning={() => setActiveSubItem('staff_schedule')}
                  onNavigateToFinancials={() => setActiveSubItem('staff_finance')}
                  onCreateEmployee={handleCreateEmployee}
                  onUpdateEmployee={handleUpdateEmployee}
                  onArchiveEmployee={handleArchiveEmployee}
                  onReactivateEmployee={handleReactivateEmployee}
                />
              </Suspense>
            ) : activeTab === 'staff_mgmt' && activeSubItem === 'staff_schedule' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <PlanningPage
                  isDarkMode={isDarkMode}
                  employees={hrEmployees}
                  shifts={hrShifts}
                  dayRecords={hrDayRecords}
                  recurringPlans={hrRecurringPlans}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToEmployees={() => setActiveSubItem('staff_employees')}
                  onNavigateToFinancials={() => setActiveSubItem('staff_finance')}
                  onCreateShift={handleCreateShift}
                  onUpdateShift={handleUpdateShift}
                  onDeleteShift={handleDeleteShift}
                  onSavePlanning={handleSavePlanning}
                  onSetAttendance={handleSetAttendance}
                  onDeleteDayRecord={handleDeleteDayRecord}
                />
              </Suspense>
            ) : activeTab === 'staff_mgmt' && activeSubItem === 'staff_finance' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <FinancialsPage
                  isDarkMode={isDarkMode}
                  employees={hrEmployees}
                  financialRecords={hrFinancialRecords}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToEmployees={() => setActiveSubItem('staff_employees')}
                  onNavigateToPlanning={() => setActiveSubItem('staff_schedule')}
                  onCreateFinancialRecord={handleCreateFinancialRecord}
                  onUpdateFinancialRecord={handleUpdateFinancialRecord}
                  onDeleteFinancialRecord={handleDeleteFinancialRecord}
                />
              </Suspense>
            ) : activeTab === 'reports_mgmt' && activeSubItem === 'report_monthly' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <MonthlyReportPage
                  isDarkMode={isDarkMode}
                  transactions={salesTransactions}
                  articles={catalogArticles}
                  stockProducts={stockProducts}
                  subRecipes={subRecipes}
                  stockLedger={stockLedger}
                  expenses={expenses}
                  expenseCategories={expenseCategories}
                  orders={purchaseOrders}
                  suppliers={suppliers}
                  receptions={purchaseReceptions}
                  invoices={supplierInvoices}
                  employees={hrEmployees}
                  financialRecords={hrFinancialRecords}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                />
              </Suspense>
            ) : activeTab === 'reports_mgmt' && activeSubItem === 'report_sales' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <SalesReportPage
                  isDarkMode={isDarkMode}
                  transactions={salesTransactions}
                  articles={catalogArticles}
                  stockProducts={stockProducts}
                  subRecipes={subRecipes}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToMonthly={() => setActiveSubItem('report_monthly')}
                />
              </Suspense>
            ) : activeTab === 'reports_mgmt' && activeSubItem === 'report_purchases' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <PurchasesReportPage
                  isDarkMode={isDarkMode}
                  orders={purchaseOrders}
                  suppliers={suppliers}
                  receptions={purchaseReceptions}
                  invoices={supplierInvoices}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToMonthly={() => setActiveSubItem('report_monthly')}
                />
              </Suspense>
            ) : activeTab === 'reports_mgmt' && activeSubItem === 'report_expenses' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <ExpensesReportPage
                  isDarkMode={isDarkMode}
                  expenses={expenses}
                  categories={expenseCategories}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToMonthly={() => setActiveSubItem('report_monthly')}
                />
              </Suspense>
            ) : activeTab === 'reports_mgmt' && activeSubItem === 'report_stocks' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <StockReportPage
                  isDarkMode={isDarkMode}
                  stockProducts={stockProducts}
                  stockLedger={stockLedger}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToMonthly={() => setActiveSubItem('report_monthly')}
                />
              </Suspense>
            ) : activeTab === 'reports_mgmt' && activeSubItem === 'report_finance' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <FinancialReportPage
                  isDarkMode={isDarkMode}
                  transactions={salesTransactions}
                  articles={catalogArticles}
                  stockProducts={stockProducts}
                  subRecipes={subRecipes}
                  orders={purchaseOrders}
                  expenses={expenses}
                  financialRecords={hrFinancialRecords}
                  employees={hrEmployees}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToMonthly={() => setActiveSubItem('report_monthly')}
                />
              </Suspense>
            ) : activeTab === 'reports_mgmt' && activeSubItem === 'report_tax' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <TaxReportPage
                  isDarkMode={isDarkMode}
                  transactions={salesTransactions}
                  invoices={supplierInvoices}
                  suppliers={suppliers}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onNavigateToMonthly={() => setActiveSubItem('report_monthly')}
                />
              </Suspense>
            ) : activeTab === 'reports_mgmt' && activeSubItem === 'report_export' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <ExportDataPage
                  isDarkMode={isDarkMode}
                  transactions={salesTransactions}
                  articles={catalogArticles}
                  subRecipes={subRecipes}
                  stockProducts={stockProducts}
                  stockLedger={stockLedger}
                  stockLots={stockLots}
                  expenses={expenses}
                  expenseCategories={expenseCategories}
                  purchaseOrders={purchaseOrders}
                  suppliers={suppliers}
                  supplierInvoices={supplierInvoices}
                  employees={hrEmployees}
                  shifts={hrShifts}
                  dayRecords={hrDayRecords}
                  financialRecords={hrFinancialRecords}
                  activityLog={activityLog}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                />
              </Suspense>
            ) : activeTab === 'reports_mgmt' && activeSubItem === 'report_archive' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <ArchivePage
                  isDarkMode={isDarkMode}
                  employees={hrEmployees}
                  onReactivateEmployee={handleReactivateEmployee}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                />
              </Suspense>
            ) : activeTab === 'activity_log' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <ActivityLogPage
                  isDarkMode={isDarkMode}
                  entries={activityLog}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                />
              </Suspense>
            ) : activeTab === 'settings' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <SettingsPage
                  isDarkMode={isDarkMode}
                  settings={appSettings}
                  onSaveSettings={handleSaveSettings}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                />
              </Suspense>
            ) : activeTab === 'account_sessions' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <SessionsPage
                  fullName={user?.fullName ?? 'Utilisateur'}
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                  onCurrentSessionRevoked={() => {
                    logout();
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                />
              </Suspense>
            ) : activeTab === 'roles_permissions' ? (
              <Suspense fallback={<StockPageLoadingFallback />}>
                <RolesPermissionsPage
                  onNavigateToDashboard={() => {
                    setActiveTab('dashboard');
                    setActiveSubItem('');
                  }}
                />
              </Suspense>
            ) : (
              <>
                {/* Page Header Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                      Tableau de bord
                    </h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Bienvenue dans l'espace de gestion et point de vente Café Noir.
                    </p>
                  </div>

                  {/* Action: Récupérer */}
                  <button
                    id="dashboard-refresh-button"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="self-start sm:self-auto inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-70"
                  >
                    <RotateCw
                      size={14}
                      className={`text-gray-500 dark:text-gray-400 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`}
                    />
                    <span>Récupérer</span>
                  </button>
                </div>

                {/* Hero Dark Greeting Banner */}
                <HeroBanner
                  todaySalesLabel={heroTodayData.turnover}
                  growthLabel={heroTodayData.turnoverChange}
                  growthIsPositive={!heroTodayData.turnoverChange.startsWith('-')}
                  onNavigate={(tab, sub) => {
                    setActiveTab(tab);
                    setActiveSubItem(sub ?? '');
                  }}
                />

                {/* Section Analyse de gestion (Placed BEFORE the KPI cards as requested) */}
                <AnalysisFilterBar
                  activePeriod={activePeriod}
                  onPeriodChange={setActivePeriod}
                  compareWithPrevious={compareWithPrevious}
                  onToggleCompare={() => setCompareWithPrevious(!compareWithPrevious)}
                  customStartDate={customRange.start}
                  customEndDate={customRange.end}
                  onCustomDateChange={(start, end) => setCustomRange({ start, end })}
                />

                {/* KPI Cards Section: 5 Classic Cards + "Voir plus d'indicateurs" button for Coût du personnel, Valeur du stock, Nombre de tickets, Marge estimée */}
                <MetricCards
                  data={dashboardPeriodData}
                  caisseActuelle={formatDashboardAmount(cashKpis.especes + cashKpis.carte + cashKpis.restoNet)}
                  compareWithPrevious={compareWithPrevious}
                  onNavigate={(tab, sub) => {
                    setActiveTab(tab);
                    setActiveSubItem(sub ?? '');
                  }}
                />

                {/* Hourly sales heatmap (Ventes par heure et par jour) & Plan Overview (Objectifs & Répartition) Row */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <div className="lg:col-span-8">
                    <ActivityHeatmap data={dailySalesCalendarData} />
                  </div>
                  <div className="lg:col-span-4">
                    <PlanOverview
                      categories={categoryShareData.categories}
                      monthlyTarget={categoryShareData.monthlyTarget}
                      achievedToDate={categoryShareData.achievedToDate}
                      isCustomTarget={categoryShareData.isCustomTarget}
                      onSetMonthlyTarget={handleSetMonthlyTarget}
                    />
                  </div>
                </div>

                {/* Sales Chart: Ventes par jours with Jours/Mois/Année filters & period comparison */}
                <SalesChart data={salesByPeriodData} compareWithPrevious={compareWithPrevious} />

                {/* Purchases Chart: Vue d'ensemble des achats — bar chart with Jours/Mois/Année filters */}
                <PurchasesChart orders={purchaseOrders} />

                {/* Top/Least Products, Top CA/Margin Products, Low Stock (Top 5) & Primary Alerts */}
                <ProductsAndStock
                  topProducts={productRankings.top}
                  leastProducts={productRankings.least}
                  topRevenueProducts={productRankings.topRevenue}
                  topMarginProducts={productRankings.topMargin}
                  lowStockProducts={lowStockDashboardList}
                  alerts={dashboardAlerts}
                  onViewAllProducts={() => setModalType('products')}
                  onRestockClick={() => setModalType('restock')}
                />
              </>
            )}
            </main>
          </div>
        </div>
      </div>

      {/* Action Modals */}
      <ActionModals type={modalType} onClose={() => setModalType(null)} />

      {/* Offline indicator — the app shell still loads/works, but data actions need connectivity */}
      {!isOnline && (
        <div
          id="offline-banner"
          className="fixed bottom-6 left-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white shadow-xl border border-slate-700 text-xs animate-in slide-in-from-bottom-2"
        >
          <WifiOff size={16} className="text-amber-400" />
          <span>Vous êtes hors ligne — les données ne peuvent pas être synchronisées.</span>
        </div>
      )}

      {/* Toast Notification on Refresh */}
      {showRefreshToast && (
        <div
          id="refresh-toast"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white shadow-xl border border-slate-700 text-xs animate-in slide-in-from-bottom-2"
        >
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span>Données actualisées avec succès !</span>
        </div>
      )}
    </div>
  );
}
