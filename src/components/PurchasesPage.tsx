import { DecimalInput } from './ui/DecimalInput';
import { EmployeePicker } from './ui/EmployeePicker';
import { todayIso } from '../data/dateUtils';
import React, { useMemo, useState } from 'react';
import {
  Truck,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FilterX,
  Download,
  Plus,
  Eye,
  Pencil,
  Trash2,
  X,
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  Package,
  ClipboardList,
  PackageCheck,
  CalendarClock,
  Building2,
  Phone,
  Mail,
  MapPin,
  User,
  FileText,
  Wallet,
  CreditCard,
  PackagePlus,
  Info,
} from 'lucide-react';
import { StockProduct, StockZone, STOCK_ZONES } from '../data/stockModel';
import {
  Supplier,
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseReception,
  SupplierInvoice,
  PURCHASE_PAYMENT_METHODS,
  PurchasePaymentMethod,
  DraftPurchaseOrder,
  DraftPurchaseLine,
  createEmptyDraftPurchaseOrder,
  createEmptyDraftPurchaseLine,
  createDraftFromPurchaseOrder,
  validateDraftPurchaseOrder,
  buildPurchaseOrderFromDraft,
  generatePurchaseOrderNumber,
  generatePurchaseId,
  computeOrderTotal,
  isPurchaseOrderActive,
  getAllowedManualTransitions,
  getLastPriceForSupplierProduct,
  DraftSupplierInvoice,
  createEmptyDraftInvoice,
  validateDraftInvoice,
  buildInvoiceFromDraft,
  computeInvoiceStatus,
  isInvoiceDueSoon,
  isInvoiceOverdue,
} from '../data/purchasesModel';

interface PurchasesPageProps {
  orders: PurchaseOrder[];
  suppliers: Supplier[];
  receptions: PurchaseReception[];
  invoices: SupplierInvoice[];
  products: StockProduct[];
  employees: string[];
  onNavigateToDashboard: () => void;
  onCreateOrder: (order: PurchaseOrder) => void;
  onUpdateOrder: (order: PurchaseOrder) => void;
  onDeleteOrder: (orderId: string) => void;
  onUpdateOrderStatus: (orderId: string, status: PurchaseOrderStatus) => void;
  onCreateSupplier: (supplier: Supplier) => void;
  onReceivePurchaseOrder: (order: PurchaseOrder, reception: PurchaseReception) => void;
  onCreateInvoice: (invoice: SupplierInvoice) => void;
  onRecordInvoicePayment: (invoiceId: string, amountAdded: number) => void;
  isDarkMode?: boolean;
}

type FormMode = 'create' | 'edit';
type Step = 'form' | 'preview' | 'success';
type StatusTab = 'all' | 'active' | 'inactive';

const inputBaseClass =
  'w-full px-3.5 py-2 text-xs rounded-xl border bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 transition';
const inputValidClass = 'border-gray-200 dark:border-gray-700 focus:border-emerald-500 focus:ring-emerald-500';
const inputErrorClass = 'border-red-400 dark:border-red-500/70 focus:border-red-500 focus:ring-red-500';
const labelClass = 'text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 block';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer';

const STATUS_STYLES: Record<PurchaseOrderStatus, string> = {
  Brouillon: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700',
  Commandée: 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/70',
  'Partiellement reçue': 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/70',
  Reçue: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70',
  Annulée: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/70',
};

const INVOICE_STATUS_STYLES: Record<string, string> = {
  'Non payée': 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/70',
  'Partiellement payée': 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/70',
  Payée: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70',
};

const formatAmount = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DT`;
const formatDate = (iso: string) => {
  const [y, m, d] = (iso || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso || '—';
};
const getInitials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '—';

interface NewSupplierDraft {
  name: string;
  taxId: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  mainContact: string;
  notes: string;
}
const emptyNewSupplierDraft = (): NewSupplierDraft => ({ name: '', taxId: '', phone: '', whatsapp: '', email: '', address: '', mainContact: '', notes: '' });

export const PurchasesPage: React.FC<PurchasesPageProps> = ({
  orders,
  suppliers,
  receptions,
  invoices,
  products,
  employees,
  onNavigateToDashboard,
  onCreateOrder,
  onUpdateOrder,
  onDeleteOrder,
  onUpdateOrderStatus,
  onCreateSupplier,
  onReceivePurchaseOrder,
  onCreateInvoice,
  onRecordInvoicePayment,
}) => {
  // --- Create / edit modal ---
  const [formOpen, setFormOpen] = useState<FormMode | null>(null);
  const [step, setStep] = useState<Step>('form');
  const [draft, setDraft] = useState<DraftPurchaseOrder>(createEmptyDraftPurchaseOrder());
  const [hasAttemptedVerify, setHasAttemptedVerify] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showNewSupplierForm, setShowNewSupplierForm] = useState(false);
  const [newSupplierDraft, setNewSupplierDraft] = useState<NewSupplierDraft>(emptyNewSupplierDraft());

  const [viewingOrderId, setViewingOrderId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PurchaseOrder | null>(null);

  // --- Filters ---
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 8;

  const viewingOrder = useMemo(() => orders.find((o) => o.id === viewingOrderId) ?? null, [orders, viewingOrderId]);

  const supplierName = (supplierId: string) => suppliers.find((s) => s.id === supplierId)?.name ?? '—';
  const productName = (productId: string) => products.find((p) => p.id === productId)?.name ?? 'Produit introuvable';

  const updateDraft = (patch: Partial<DraftPurchaseOrder>) => setDraft((prev) => ({ ...prev, ...patch }));
  const updateLine = (lineId: string, patch: Partial<DraftPurchaseLine>) =>
    setDraft((prev) => ({ ...prev, lines: prev.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) }));

  const handleAddLine = () => setDraft((prev) => ({ ...prev, lines: [...prev.lines, createEmptyDraftPurchaseLine()] }));
  const handleRemoveLine = (lineId: string) => setDraft((prev) => ({ ...prev, lines: prev.lines.length > 1 ? prev.lines.filter((l) => l.id !== lineId) : prev.lines }));

  const handleLineProductChange = (lineId: string, productId: string) => {
    const line = draft.lines.find((l) => l.id === lineId);
    const patch: Partial<DraftPurchaseLine> = { productId };
    if (line && !line.unitPrice.trim() && draft.supplierId) {
      const lastPrice = getLastPriceForSupplierProduct(draft.supplierId, productId, orders);
      const product = products.find((p) => p.id === productId);
      const fallback = lastPrice ?? product?.averageCost ?? null;
      if (fallback !== null) patch.unitPrice = String(fallback);
    }
    updateLine(lineId, patch);
  };

  const issues = useMemo(() => validateDraftPurchaseOrder(draft, suppliers, products), [draft, suppliers, products]);
  const issuesByField = new Map(issues.map((i) => [i.field, i.message]));
  const showErrors = hasAttemptedVerify;

  // --- Create / edit workflow ---
  const handleOpenCreate = () => {
    setFormOpen('create');
    setDraft(createEmptyDraftPurchaseOrder());
    setStep('form');
    setHasAttemptedVerify(false);
    setSaveError(null);
    setShowNewSupplierForm(false);
    setNewSupplierDraft(emptyNewSupplierDraft());
  };

  const handleOpenEdit = (order: PurchaseOrder) => {
    setFormOpen('edit');
    setDraft(createDraftFromPurchaseOrder(order));
    setStep('form');
    setHasAttemptedVerify(false);
    setSaveError(null);
    setShowNewSupplierForm(false);
  };

  const handleCloseForm = () => {
    setFormOpen(null);
    setStep('form');
  };

  const handleVerify = () => {
    setHasAttemptedVerify(true);
    if (issues.length === 0) setStep('preview');
  };

  const handleConfirm = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const orderNumber = draft.orderNumber ?? generatePurchaseOrderNumber(orders);
      const order = buildPurchaseOrderFromDraft(draft, products, orderNumber);
      if (formOpen === 'create') onCreateOrder(order);
      else onUpdateOrder(order);
      setStep('success');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Une erreur est survenue lors de l'enregistrement. Veuillez réessayer.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartNew = () => {
    setDraft(createEmptyDraftPurchaseOrder());
    setHasAttemptedVerify(false);
    setSaveError(null);
    setStep('form');
    setFormOpen('create');
  };

  const handleCreateSupplierInline = () => {
    if (!newSupplierDraft.name.trim()) return;
    const supplier: Supplier = {
      id: generatePurchaseId('sup'),
      name: newSupplierDraft.name.trim(),
      taxId: newSupplierDraft.taxId.trim() || undefined,
      phone: newSupplierDraft.phone.trim() || undefined,
      whatsapp: newSupplierDraft.whatsapp.trim() || undefined,
      email: newSupplierDraft.email.trim() || undefined,
      address: newSupplierDraft.address.trim() || undefined,
      mainContact: newSupplierDraft.mainContact.trim() || undefined,
      notes: newSupplierDraft.notes.trim() || undefined,
      createdAt: todayIso(),
    };
    onCreateSupplier(supplier);
    updateDraft({ supplierId: supplier.id });
    setShowNewSupplierForm(false);
    setNewSupplierDraft(emptyNewSupplierDraft());
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    onDeleteOrder(deleteTarget.id);
    setDeleteTarget(null);
  };

  // --- Filters / list ---
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (statusTab === 'active' && !isPurchaseOrderActive(o.status)) return false;
      if (statusTab === 'inactive' && isPurchaseOrderActive(o.status)) return false;
      if (filterSupplier !== 'all' && o.supplierId !== filterSupplier) return false;
      if (dateFrom && o.orderDate < dateFrom) return false;
      if (dateTo && o.orderDate > dateTo) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const articles = o.lines.map((l) => productName(l.productId)).join(' ').toLowerCase();
        if (!o.orderNumber.toLowerCase().includes(q) && !supplierName(o.supplierId).toLowerCase().includes(q) && !articles.includes(q)) return false;
      }
      return true;
    });
  }, [orders, suppliers, products, statusTab, filterSupplier, dateFrom, dateTo, searchQuery]);

  const sortedOrders = useMemo(() => [...filteredOrders].sort((a, b) => (a.orderDate < b.orderDate ? 1 : -1)), [filteredOrders]);
  const totalPages = Math.max(1, Math.ceil(sortedOrders.length / rowsPerPage));
  const paginatedOrders = useMemo(() => sortedOrders.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage), [sortedOrders, currentPage]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setFilterSupplier('all');
    setDateFrom('');
    setDateTo('');
    setStatusTab('all');
    setCurrentPage(1);
  };

  // --- KPIs (computed from the full dataset, matching the rest of the app) ---
  const totalOrders = orders.length;
  const activeOrders = useMemo(() => orders.filter((o) => isPurchaseOrderActive(o.status)), [orders]);
  const inactiveOrders = useMemo(() => orders.filter((o) => !isPurchaseOrderActive(o.status)), [orders]);
  const totalAmount = useMemo(() => orders.reduce((sum, o) => sum + computeOrderTotal(o), 0), [orders]);
  const thisMonthOrders = useMemo(() => {
    const nowIso = todayIso();
    const [y, m] = nowIso.split('-');
    return orders.filter((o) => o.orderDate.startsWith(`${y}-${m}`));
  }, [orders]);
  const thisMonthAmount = useMemo(() => thisMonthOrders.reduce((sum, o) => sum + computeOrderTotal(o), 0), [thisMonthOrders]);

  // --- Due-soon / overdue invoice banner ---
  const alertInvoices = useMemo(() => invoices.filter((inv) => isInvoiceDueSoon(inv)), [invoices]);

  // --- CSV export ---
  const handleExportCSV = () => {
    const headers = ['N° achat', 'Fournisseur', 'Articles', 'Montant total', 'Date d\'achat', 'État'];
    const rows = sortedOrders.map((o) => [
      o.orderNumber,
      `"${supplierName(o.supplierId)}"`,
      `"${o.lines.length} article(s)"`,
      computeOrderTotal(o).toFixed(2),
      o.orderDate,
      `"${o.status}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `achats_cafe_noir_${todayIso()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>Gestion des achats</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Achat et dépenses
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Commandes fournisseurs, réceptions et factures d'achat.</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button onClick={handleExportCSV} className={secondaryButtonClass}>
            <Download size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Exportation</span>
          </button>
          <button onClick={handleOpenCreate} className={primaryButtonClass}>
            <Plus size={14} />
            <span>Ajouter l'achat</span>
          </button>
          <button
            onClick={onNavigateToDashboard}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700/80 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition active:scale-98 cursor-pointer"
          >
            <span>Tableau de bord</span>
          </button>
        </div>
      </div>

      {/* Due-soon / overdue invoices banner */}
      {alertInvoices.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
              {alertInvoices.length} facture{alertInvoices.length > 1 ? 's' : ''} fournisseur{alertInvoices.length > 1 ? 's' : ''} à échéance proche ou dépassée
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {alertInvoices.map((inv) => {
                const overdue = isInvoiceOverdue(inv);
                return (
                  <button
                    key={inv.id}
                    onClick={() => inv.purchaseOrderId && setViewingOrderId(inv.purchaseOrderId)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer transition ${
                      overdue
                        ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/70 hover:bg-red-100'
                        : 'bg-white dark:bg-gray-800 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/70 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                    }`}
                  >
                    <FileText size={11} />
                    <span>{inv.invoiceNumber} — {supplierName(inv.supplierId)} — échéance {formatDate(inv.dueDate)}{overdue ? ' (dépassée)' : ''}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 5 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 sm:gap-5">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Total des achats</span>
            <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">{totalOrders}</span>
            <p className="text-[11px] text-gray-400">Commandes enregistrées</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 flex items-center justify-center text-blue-500 shrink-0">
            <ClipboardList size={22} />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Achats actifs</span>
            <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">{activeOrders.length}</span>
            <p className="text-[11px] text-gray-400">Brouillon, commandée, partielle</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 flex items-center justify-center text-amber-500 shrink-0">
            <Package size={22} />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Achats inactifs</span>
            <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">{inactiveOrders.length}</span>
            <p className="text-[11px] text-gray-400">Reçue ou annulée</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 shrink-0">
            <PackageCheck size={22} />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Montant total de l'achat</span>
            <span className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">{formatAmount(totalAmount)}</span>
            <p className="text-[11px] text-gray-400">Toutes commandes confondues</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-500 shrink-0">
            <Wallet size={22} />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Ce mois-ci</span>
            <span className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">{formatAmount(thisMonthAmount)}</span>
            <p className="text-[11px] text-gray-400">{thisMonthOrders.length} commande{thisMonthOrders.length > 1 ? 's' : ''} ce mois</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 flex items-center justify-center text-blue-500 shrink-0">
            <CalendarClock size={22} />
          </div>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 flex-1">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                placeholder="N° achat, fournisseur, article..."
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <select value={filterSupplier} onChange={(e) => { setFilterSupplier(e.target.value); setCurrentPage(1); }} className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer">
              <option value="all">Tous les fournisseurs</option>
              {suppliers.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }} title="Date début" className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }} title="Date fin" className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
          </div>
          <button onClick={handleResetFilters} className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 shadow-2xs transition active:scale-98 shrink-0 cursor-pointer">
            <FilterX size={14} className="text-gray-500" />
            <span>Réinitialiser</span>
          </button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg p-0.5 bg-gray-50/50 dark:bg-gray-800/50 w-fit">
        {([
          ['all', 'Tous les achats', totalOrders],
          ['active', 'Activité', activeOrders.length],
          ['inactive', 'Pas actif', inactiveOrders.length],
        ] as [StatusTab, string, number][]).map(([tab, label, count]) => (
          <button
            key={tab}
            onClick={() => { setStatusTab(tab); setCurrentPage(1); }}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${
              statusTab === tab ? 'bg-[#00A86B] text-white shadow-xs' : 'text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'
            }`}
          >
            {label} <span className="opacity-70">({count})</span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 text-[11px] font-bold text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-gray-800/30">
                <th className="py-3.5 px-4">Numéro d'achat</th>
                <th className="py-3.5 px-4">Fournisseur</th>
                <th className="py-3.5 px-4">Articles</th>
                <th className="py-3.5 px-4 text-right">Montant total</th>
                <th className="py-3.5 px-4">Date d'achat</th>
                <th className="py-3.5 px-4 text-center">État</th>
                <th className="py-3.5 px-4 text-center">Les actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 text-xs">
              {paginatedOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    <div className="max-w-sm mx-auto space-y-2">
                      <Truck className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600" />
                      <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">Aucun achat ne correspond à ces filtres</p>
                      <button onClick={handleResetFilters} className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer">
                        Réinitialiser les filtres
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedOrders.map((order) => {
                  const articleNames = order.lines.map((l) => productName(l.productId));
                  const canEditOrDelete = order.status === 'Brouillon';
                  return (
                    <tr key={order.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold">
                        <button
                          onClick={() => setViewingOrderId(order.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 hover:bg-emerald-100/80 transition cursor-pointer"
                          title="Voir le détail de l'achat"
                        >
                          <Truck size={12} className="text-emerald-500" />
                          <span>{order.orderNumber}</span>
                        </button>
                      </td>
                      <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white">{supplierName(order.supplierId)}</td>
                      <td className="py-3 px-4 max-w-[240px]">
                        <p className="text-gray-700 dark:text-gray-300 line-clamp-1">{articleNames.join(', ') || '—'}</p>
                        <p className="text-[11px] text-gray-400">{order.lines.length} article{order.lines.length > 1 ? 's' : ''}</p>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">{formatAmount(computeOrderTotal(order))}</td>
                      <td className="py-3 px-4 text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatDate(order.orderDate)}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border whitespace-nowrap ${STATUS_STYLES[order.status]}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setViewingOrderId(order.id)} title="Consulter" className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer"><Eye size={14} /></button>
                          <button
                            onClick={() => canEditOrDelete && handleOpenEdit(order)}
                            disabled={!canEditOrDelete}
                            title={canEditOrDelete ? 'Modifier' : 'Modifiable uniquement au statut Brouillon'}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => canEditOrDelete && setDeleteTarget(order)}
                            disabled={!canEditOrDelete}
                            title={canEditOrDelete ? 'Supprimer' : 'Suppression impossible — annulez la commande à la place'}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span>sur un total de {sortedOrders.length} achat{sortedOrders.length > 1 ? 's' : ''}</span>
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

      {/* Create / edit — responsive modal dialog */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200" onClick={handleCloseForm}>
          <div
            className="w-full max-w-3xl max-h-[92vh] overflow-y-auto custom-scrollbar rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-200 dark:border-gray-700 shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {step === 'success' ? (
              <div className="p-8 sm:p-12 flex flex-col items-center text-center gap-3">
                <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-500">
                  <CheckCircle2 size={30} />
                </div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{formOpen === 'create' ? 'Achat enregistré' : 'Achat modifié'}</h2>
                <div className="flex items-center gap-2 pt-2 flex-wrap justify-center">
                  <button onClick={handleStartNew} className={secondaryButtonClass}>
                    <Plus size={14} />
                    <span>Ajouter un autre achat</span>
                  </button>
                  <button onClick={handleCloseForm} className={primaryButtonClass}>
                    <Truck size={14} />
                    <span>Voir la liste</span>
                  </button>
                </div>
              </div>
            ) : step === 'preview' ? (
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">Vérification avant enregistrement</h2>
                  <button onClick={handleCloseForm} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60">
                  <ShieldCheck size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">Vérifiez avant confirmation — rien n'est encore enregistré.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-gray-500">Fournisseur :</span><span className="font-bold text-gray-900 dark:text-white">{supplierName(draft.supplierId)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Date d'achat :</span><span className="font-bold text-gray-900 dark:text-white">{formatDate(draft.orderDate)}</span></div>
                  {draft.expectedDate && <div className="flex justify-between"><span className="text-gray-500">Livraison prévue :</span><span className="font-bold text-gray-900 dark:text-white">{formatDate(draft.expectedDate)}</span></div>}
                  <div className="flex justify-between"><span className="text-gray-500">Passé par :</span><span className="font-bold text-gray-900 dark:text-white">{draft.createdBy}</span></div>
                  {draft.notes && <div className="flex justify-between gap-3"><span className="text-gray-500 shrink-0">Notes :</span><span className="text-gray-700 dark:text-gray-300 text-right">{draft.notes}</span></div>}
                </div>
                <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800/50 text-[11px] font-bold text-gray-400">
                        <th className="py-2 px-3">Produit</th>
                        <th className="py-2 px-3 text-right">Qté</th>
                        <th className="py-2 px-3 text-right">P.U.</th>
                        <th className="py-2 px-3 text-right">Montant</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
                      {draft.lines.map((l) => (
                        <tr key={l.id}>
                          <td className="py-2 px-3 font-medium text-gray-800 dark:text-gray-200">{productName(l.productId)}</td>
                          <td className="py-2 px-3 text-right">{l.quantity} {products.find((p) => p.id === l.productId)?.unit ?? ''}</td>
                          <td className="py-2 px-3 text-right">{formatAmount(Number(l.unitPrice || 0))}</td>
                          <td className="py-2 px-3 text-right font-semibold">{formatAmount(Number(l.quantity || 0) * Number(l.unitPrice || 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 dark:border-gray-700">
                        <td colSpan={3} className="py-2 px-3 text-right font-bold text-gray-700 dark:text-gray-300">Total</td>
                        <td className="py-2 px-3 text-right font-black text-gray-900 dark:text-white">
                          {formatAmount(draft.lines.reduce((sum, l) => sum + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {saveError && <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-xs text-red-600 dark:text-red-400 flex items-center gap-2"><AlertCircle size={14} /> {saveError}</div>}
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button onClick={() => setStep('form')} disabled={isSaving} className={secondaryButtonClass}><span>Modifier</span></button>
                  <button onClick={handleConfirm} disabled={isSaving} className={primaryButtonClass}>
                    {isSaving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                    <span>{isSaving ? 'Enregistrement…' : 'Confirmer et enregistrer'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">{formOpen === 'create' ? 'Nouvel achat' : "Modifier l'achat"}</h2>
                  <button onClick={handleCloseForm} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className={labelClass}>Fournisseur *</label>
                    <div className="relative">
                      <select
                        value={draft.supplierId}
                        onChange={(e) => updateDraft({ supplierId: e.target.value })}
                        className={`${inputBaseClass} appearance-none pr-8 cursor-pointer ${showErrors && issuesByField.has('supplierId') ? inputErrorClass : inputValidClass}`}
                      >
                        <option value="">Sélectionner un fournisseur</option>
                        {suppliers.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                      </select>
                      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                    {showErrors && issuesByField.get('supplierId') && (
                      <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('supplierId')}</p>
                    )}
                    <button onClick={() => setShowNewSupplierForm((v) => !v)} className="mt-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer">
                      {showNewSupplierForm ? 'Annuler' : '+ Nouveau fournisseur'}
                    </button>
                  </div>

                  <div>
                    <label className={labelClass}>Passé par *</label>
                    <div className="relative">
                      <EmployeePicker
                        value={draft.createdBy}
                        onChange={(v) => updateDraft({ createdBy: v })}
                        employees={employees}
                        className={`${inputBaseClass} appearance-none pr-8 cursor-pointer ${showErrors && issuesByField.has('createdBy') ? inputErrorClass : inputValidClass}`}
                      />
                      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                    {showErrors && issuesByField.get('createdBy') && (
                      <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('createdBy')}</p>
                    )}
                  </div>
                </div>

                {showNewSupplierForm && (
                  <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3">
                    <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Nouveau fournisseur</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input type="text" value={newSupplierDraft.name} onChange={(e) => setNewSupplierDraft((p) => ({ ...p, name: e.target.value }))} placeholder="Nom / raison sociale *" className={`${inputBaseClass} ${inputValidClass}`} />
                      <input type="text" value={newSupplierDraft.taxId} onChange={(e) => setNewSupplierDraft((p) => ({ ...p, taxId: e.target.value }))} placeholder="Matricule fiscal" className={`${inputBaseClass} ${inputValidClass}`} />
                      <input type="text" value={newSupplierDraft.phone} onChange={(e) => setNewSupplierDraft((p) => ({ ...p, phone: e.target.value }))} placeholder="Téléphone" className={`${inputBaseClass} ${inputValidClass}`} />
                      <input type="text" value={newSupplierDraft.whatsapp} onChange={(e) => setNewSupplierDraft((p) => ({ ...p, whatsapp: e.target.value }))} placeholder="WhatsApp" className={`${inputBaseClass} ${inputValidClass}`} />
                      <input type="email" value={newSupplierDraft.email} onChange={(e) => setNewSupplierDraft((p) => ({ ...p, email: e.target.value }))} placeholder="Email" className={`${inputBaseClass} ${inputValidClass}`} />
                      <input type="text" value={newSupplierDraft.mainContact} onChange={(e) => setNewSupplierDraft((p) => ({ ...p, mainContact: e.target.value }))} placeholder="Contact principal" className={`${inputBaseClass} ${inputValidClass}`} />
                      <input type="text" value={newSupplierDraft.address} onChange={(e) => setNewSupplierDraft((p) => ({ ...p, address: e.target.value }))} placeholder="Adresse" className={`${inputBaseClass} ${inputValidClass} sm:col-span-2`} />
                      <textarea value={newSupplierDraft.notes} onChange={(e) => setNewSupplierDraft((p) => ({ ...p, notes: e.target.value }))} placeholder="Notes" rows={2} className={`${inputBaseClass} ${inputValidClass} sm:col-span-2 resize-none`} />
                    </div>
                    <div className="flex justify-end">
                      <button onClick={handleCreateSupplierInline} disabled={!newSupplierDraft.name.trim()} className={primaryButtonClass}>
                        <Plus size={14} /><span>Créer le fournisseur</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className={labelClass}>Date d'achat *</label>
                    <input
                      type="date"
                      value={draft.orderDate}
                      onChange={(e) => updateDraft({ orderDate: e.target.value })}
                      className={`${inputBaseClass} ${showErrors && issuesByField.has('orderDate') ? inputErrorClass : inputValidClass}`}
                    />
                    {showErrors && issuesByField.get('orderDate') && (
                      <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('orderDate')}</p>
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>Livraison prévue</label>
                    <input type="date" value={draft.expectedDate} onChange={(e) => updateDraft({ expectedDate: e.target.value })} className={`${inputBaseClass} ${inputValidClass}`} />
                  </div>
                </div>

                {/* Line items */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className={labelClass + ' mb-0'}>Articles *</label>
                    <button onClick={handleAddLine} className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer inline-flex items-center gap-1">
                      <Plus size={12} /> Ajouter un article
                    </button>
                  </div>
                  {showErrors && issuesByField.get('lines') && (
                    <p className="text-[11px] text-red-500 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('lines')}</p>
                  )}
                  <div className="space-y-2">
                    {draft.lines.map((line, idx) => {
                      const product = products.find((p) => p.id === line.productId);
                      const lineTotal = Number(line.quantity || 0) * Number(line.unitPrice || 0);
                      return (
                        <div key={line.id} className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40 grid grid-cols-1 sm:grid-cols-[1fr_100px_110px_90px_auto] gap-2 items-start">
                          <div>
                            <select
                              value={line.productId}
                              onChange={(e) => handleLineProductChange(line.id, e.target.value)}
                              className={`${inputBaseClass} appearance-none cursor-pointer ${showErrors && issuesByField.has(`line-${idx}-product`) ? inputErrorClass : inputValidClass}`}
                            >
                              <option value="">Sélectionner un produit</option>
                              {products.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                            </select>
                            {showErrors && issuesByField.get(`line-${idx}-product`) && (
                              <p className="text-[11px] text-red-500 mt-1">{issuesByField.get(`line-${idx}-product`)}</p>
                            )}
                          </div>
                          <div>
                            <DecimalInput
                              min={0}
                              step="any"
                              value={line.quantity}
                              onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                              placeholder={product ? product.unit : 'Qté'}
                              className={`${inputBaseClass} ${showErrors && issuesByField.has(`line-${idx}-quantity`) ? inputErrorClass : inputValidClass}`}
                            />
                            {showErrors && issuesByField.get(`line-${idx}-quantity`) && (
                              <p className="text-[11px] text-red-500 mt-1">{issuesByField.get(`line-${idx}-quantity`)}</p>
                            )}
                          </div>
                          <div>
                            <DecimalInput
                              min={0}
                              step="any"
                              value={line.unitPrice}
                              onChange={(e) => updateLine(line.id, { unitPrice: e.target.value })}
                              placeholder="P.U. (DT)"
                              className={`${inputBaseClass} ${showErrors && issuesByField.has(`line-${idx}-unitPrice`) ? inputErrorClass : inputValidClass}`}
                            />
                            {showErrors && issuesByField.get(`line-${idx}-unitPrice`) && (
                              <p className="text-[11px] text-red-500 mt-1">{issuesByField.get(`line-${idx}-unitPrice`)}</p>
                            )}
                          </div>
                          <div className="text-xs font-bold text-gray-800 dark:text-gray-200 py-2 text-right sm:text-left">{formatAmount(lineTotal)}</div>
                          <button onClick={() => handleRemoveLine(line.id)} disabled={draft.lines.length <= 1} className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed justify-self-end">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-end text-xs font-bold text-gray-900 dark:text-white pt-1">
                    Total : {formatAmount(draft.lines.reduce((sum, l) => sum + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0))}
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Notes</label>
                  <textarea value={draft.notes} onChange={(e) => updateDraft({ notes: e.target.value })} rows={2} placeholder="Optionnel" className={`${inputBaseClass} ${inputValidClass} resize-none`} />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                  <button onClick={handleCloseForm} className={secondaryButtonClass}><span>Annuler la saisie</span></button>
                  <button onClick={handleVerify} className={primaryButtonClass}><ShieldCheck size={14} /><span>Vérifier</span></button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Purchase detail modal */}
      {viewingOrder && (
        <PurchaseDetailModal
          order={viewingOrder}
          suppliers={suppliers}
          products={products}
          receptions={receptions.filter((r) => r.purchaseOrderId === viewingOrder.id)}
          invoice={invoices.find((i) => i.purchaseOrderId === viewingOrder.id) ?? null}
          employees={employees}
          onClose={() => setViewingOrderId(null)}
          onUpdateStatus={(status) => onUpdateOrderStatus(viewingOrder.id, status)}
          onReceive={(reception) => onReceivePurchaseOrder(viewingOrder, reception)}
          onCreateInvoice={onCreateInvoice}
          onRecordInvoicePayment={onRecordInvoicePayment}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2"><AlertCircle size={16} className="text-red-500" /> Supprimer cet achat</h3>
              <button onClick={() => setDeleteTarget(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
            </div>
            <div className="p-5 text-xs text-gray-600 dark:text-gray-300 space-y-2">
              <p>Voulez-vous vraiment supprimer l'achat <strong className="text-gray-900 dark:text-white">{deleteTarget.orderNumber}</strong> ? Cette action est irréversible.</p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className={secondaryButtonClass}><span>Annuler</span></button>
              <button onClick={handleConfirmDelete} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer">
                <Trash2 size={14} /><span>Confirmer la suppression</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Rich purchase detail modal --------------------------------------------------------------

const PurchaseDetailModal: React.FC<{
  order: PurchaseOrder;
  suppliers: Supplier[];
  products: StockProduct[];
  receptions: PurchaseReception[];
  invoice: SupplierInvoice | null;
  employees: string[];
  onClose: () => void;
  onUpdateStatus: (status: PurchaseOrderStatus) => void;
  onReceive: (reception: PurchaseReception) => void;
  onCreateInvoice: (invoice: SupplierInvoice) => void;
  onRecordInvoicePayment: (invoiceId: string, amountAdded: number) => void;
}> = ({ order, suppliers, products, receptions, invoice, employees, onClose, onUpdateStatus, onReceive, onCreateInvoice, onRecordInvoicePayment }) => {
  const supplier = suppliers.find((s) => s.id === order.supplierId) ?? null;
  const total = computeOrderTotal(order);
  const remainingLines = order.lines.filter((l) => l.receivedQuantity < l.quantity);
  const allowedTransitions = getAllowedManualTransitions(order.status);

  // --- Add reception sub-form ---
  const [showReceptionForm, setShowReceptionForm] = useState(false);
  const [receptionDate, setReceptionDate] = useState(todayIso());
  const [receptionZone, setReceptionZone] = useState<StockZone>('Réserve principale');
  const [receptionPerformedBy, setReceptionPerformedBy] = useState('');
  const [receptionQuantities, setReceptionQuantities] = useState<Record<string, string>>({});

  const handleOpenReceptionForm = () => {
    setShowReceptionForm(true);
    setReceptionDate(todayIso());
    setReceptionZone('Réserve principale');
    setReceptionPerformedBy('');
    setReceptionQuantities({});
  };

  const receptionIssues: string[] = [];
  if (!receptionPerformedBy) receptionIssues.push("L'employé ayant réceptionné est obligatoire.");
  const anyQtyEntered = remainingLines.some((l) => Number(receptionQuantities[l.id] || 0) > 0);
  if (!anyQtyEntered) receptionIssues.push('Saisissez au moins une quantité reçue.');
  remainingLines.forEach((l) => {
    const remaining = l.quantity - l.receivedQuantity;
    const entered = Number(receptionQuantities[l.id] || 0);
    if (entered < 0 || entered > remaining) receptionIssues.push(`${products.find((p) => p.id === l.productId)?.name ?? l.productId} — quantité reçue invalide (max ${remaining}).`);
  });

  const handleConfirmReception = () => {
    if (receptionIssues.length > 0) return;
    const reception: PurchaseReception = {
      id: generatePurchaseId('rcv'),
      purchaseOrderId: order.id,
      receptionDate,
      zone: receptionZone,
      performedBy: receptionPerformedBy,
      createdAt: new Date().toISOString(),
      lines: remainingLines
        .map((l) => ({ lineId: l.id, quantityReceived: Number(receptionQuantities[l.id] || 0) }))
        .filter((l) => l.quantityReceived > 0),
    };
    onReceive(reception);
    setShowReceptionForm(false);
  };

  // --- Invoice sub-form (supplier + commande are fixed to this order's context) ---
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invoiceDraft, setInvoiceDraft] = useState<DraftSupplierInvoice>(() =>
    createEmptyDraftInvoice({ supplierId: order.supplierId, purchaseOrderId: order.id, prefillTTC: total })
  );
  const [invoiceErrors, setInvoiceErrors] = useState(false);
  const invoiceIssues = useMemo(() => validateDraftInvoice(invoiceDraft, suppliers), [invoiceDraft, suppliers]);
  const invoiceIssuesByField = new Map(invoiceIssues.map((i) => [i.field, i.message]));

  const handleOpenInvoiceForm = () => {
    setInvoiceDraft(createEmptyDraftInvoice({ supplierId: order.supplierId, purchaseOrderId: order.id, prefillTTC: total }));
    setInvoiceErrors(false);
    setShowInvoiceForm(true);
  };

  const handleConfirmInvoice = () => {
    setInvoiceErrors(true);
    if (invoiceIssues.length > 0) return;
    onCreateInvoice(buildInvoiceFromDraft(invoiceDraft));
    setShowInvoiceForm(false);
  };

  // --- Payment recording ---
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const remainingDue = invoice ? invoice.amountTTC - invoice.amountPaid : 0;

  const handleConfirmPayment = () => {
    const amount = Number(paymentAmount);
    if (!invoice || Number.isNaN(amount) || amount <= 0 || amount > remainingDue) return;
    onRecordInvoicePayment(invoice.id, amount);
    setShowPaymentForm(false);
    setPaymentAmount('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-[92vh] overflow-y-auto custom-scrollbar rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-200 dark:border-gray-700 shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between sticky top-0 bg-white dark:bg-[#151D2A] z-10">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm text-gray-900 dark:text-white">{order.orderNumber}</h3>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${STATUS_STYLES[order.status]}`}>{order.status}</span>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-5 text-xs">
          {/* Status actions */}
          {allowedTransitions.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-gray-500 font-semibold">Changer le statut :</span>
              {allowedTransitions.map((s) => (
                <button
                  key={s}
                  onClick={() => onUpdateStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${STATUS_STYLES[s]} hover:opacity-80`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Two-column layout: ~65% fournisseur + articles / ~35% summary sidebar cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left column */}
            <div className="lg:col-span-2 space-y-4">
              {/* Fournisseur */}
              <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40">
                  <span className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-500 shrink-0"><Building2 size={14} /></span>
                  <p className="font-bold text-gray-800 dark:text-gray-200">Fournisseur</p>
                </div>
                <div className="p-4">
                  {supplier ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                      <div className="sm:col-span-2">
                        <span className="text-gray-400 block text-[11px]">Nom / raison sociale</span>
                        <span className="font-semibold text-gray-900 dark:text-white">{supplier.name}</span>
                      </div>
                      {supplier.taxId && <div><span className="text-gray-400 block text-[11px]">Matricule fiscal</span><span className="text-gray-700 dark:text-gray-300">{supplier.taxId}</span></div>}
                      {supplier.mainContact && <div><span className="text-gray-400 block text-[11px]">Contact principal</span><span className="text-gray-700 dark:text-gray-300 flex items-center gap-1"><User size={11} /> {supplier.mainContact}</span></div>}
                      {supplier.phone && <div><span className="text-gray-400 block text-[11px]">Téléphone</span><span className="text-gray-700 dark:text-gray-300 flex items-center gap-1"><Phone size={11} /> {supplier.phone}</span></div>}
                      {supplier.whatsapp && <div><span className="text-gray-400 block text-[11px]">WhatsApp</span><span className="text-gray-700 dark:text-gray-300">{supplier.whatsapp}</span></div>}
                      {supplier.email && <div><span className="text-gray-400 block text-[11px]">Email</span><span className="text-gray-700 dark:text-gray-300 flex items-center gap-1"><Mail size={11} /> {supplier.email}</span></div>}
                      {supplier.address && <div className="sm:col-span-2"><span className="text-gray-400 block text-[11px]">Adresse</span><span className="text-gray-700 dark:text-gray-300 flex items-center gap-1"><MapPin size={11} /> {supplier.address}</span></div>}
                      {supplier.notes && <div className="sm:col-span-2 pt-1 border-t border-gray-100 dark:border-gray-800 text-gray-400 italic">{supplier.notes}</div>}
                    </div>
                  ) : (
                    <p className="text-gray-400">Fournisseur introuvable.</p>
                  )}
                </div>
              </div>

              {/* Articles */}
              <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-500 shrink-0"><Package size={14} /></span>
                    <p className="font-bold text-gray-800 dark:text-gray-200">Articles</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                    {order.lines.length} article{order.lines.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/60 dark:bg-gray-800/30 text-[11px] font-bold text-gray-400">
                        <th className="py-2 px-4 w-8">#</th>
                        <th className="py-2 px-3">Produit</th>
                        <th className="py-2 px-3 text-right">Commandé</th>
                        <th className="py-2 px-3 text-right">Reçu</th>
                        <th className="py-2 px-3 text-right">P.U.</th>
                        <th className="py-2 px-4 text-right">Montant</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
                      {order.lines.map((l, idx) => (
                        <tr key={l.id}>
                          <td className="py-2.5 px-4 text-gray-400 font-semibold">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-medium text-gray-800 dark:text-gray-200">{products.find((p) => p.id === l.productId)?.name ?? l.productId}</td>
                          <td className="py-2.5 px-3 text-right">{l.quantity} {l.unit}</td>
                          <td className={`py-2.5 px-3 text-right font-semibold ${l.receivedQuantity >= l.quantity ? 'text-emerald-600 dark:text-emerald-400' : l.receivedQuantity > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>
                            {l.receivedQuantity} {l.unit}
                          </td>
                          <td className="py-2.5 px-3 text-right">{formatAmount(l.unitPrice)}</td>
                          <td className="py-2.5 px-4 text-right font-semibold">{formatAmount(l.quantity * l.unitPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                  <div className="w-full sm:w-64 space-y-1.5">
                    <div className="flex justify-between text-gray-500"><span>Sous-total</span><span className="text-gray-700 dark:text-gray-300">{formatAmount(total)}</span></div>
                    {invoice && (
                      <div className="flex justify-between text-gray-500"><span>Taxe sur le revenu</span><span className="text-gray-700 dark:text-gray-300">{formatAmount(invoice.vatAmount)}</span></div>
                    )}
                    <div className="flex justify-between pt-1.5 border-t border-gray-200 dark:border-gray-700 font-bold text-gray-900 dark:text-white">
                      <span>Total de l'achat</span><span>{formatAmount(invoice ? invoice.amountTTC : total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right column: summary sidebar */}
            <div className="space-y-4">
              {/* Résumé de l'achat */}
              <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40">
                  <span className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-500 shrink-0"><Wallet size={14} /></span>
                  <p className="font-bold text-gray-800 dark:text-gray-200">Résumé de l'achat</p>
                </div>
                <div className="p-4 space-y-2">
                  <div className="flex justify-between"><span className="text-gray-500">Sous-total</span><span className="font-semibold text-gray-900 dark:text-white">{formatAmount(total)}</span></div>
                  {invoice ? (
                    <>
                      <div className="flex justify-between"><span className="text-gray-500">Taxe sur le revenu</span><span className="font-semibold text-gray-900 dark:text-white">{formatAmount(invoice.vatAmount)}</span></div>
                      <div className="flex justify-between pt-2 border-t border-gray-100 dark:border-gray-800"><span className="font-bold text-gray-700 dark:text-gray-300">Total des dépenses</span><span className="font-black text-emerald-600 dark:text-emerald-400">{formatAmount(invoice.amountTTC)}</span></div>
                    </>
                  ) : (
                    <div className="flex justify-between pt-2 border-t border-gray-100 dark:border-gray-800"><span className="font-bold text-gray-700 dark:text-gray-300">Total des dépenses</span><span className="font-black text-emerald-600 dark:text-emerald-400">{formatAmount(total)}</span></div>
                  )}
                </div>
              </div>

              {/* Détails du fournisseur */}
              <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40">
                  <span className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-500 shrink-0"><User size={14} /></span>
                  <p className="font-bold text-gray-800 dark:text-gray-200">Détails du fournisseur</p>
                </div>
                <div className="p-4">
                  {supplier ? (
                    <div className="flex items-center gap-2.5">
                      <span className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center font-bold text-xs shrink-0">
                        {getInitials(supplier.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white truncate">{supplier.name}</p>
                        <p className="text-[11px] text-gray-400 truncate">{supplier.email ?? supplier.phone ?? '—'}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-400">Fournisseur introuvable.</p>
                  )}
                </div>
              </div>

              {/* Informations relatives à l'achat */}
              <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40">
                  <span className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-500 shrink-0"><ClipboardList size={14} /></span>
                  <p className="font-bold text-gray-800 dark:text-gray-200">Informations relatives à l'achat</p>
                </div>
                <div className="p-4 space-y-2.5">
                  <div className="flex justify-between"><span className="text-gray-500">Numéro d'achat</span><span className="font-mono font-semibold text-gray-900 dark:text-white">{order.orderNumber}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Date d'achat</span><span className="font-semibold text-gray-900 dark:text-white">{formatDate(order.orderDate)}</span></div>
                  {order.expectedDate && <div className="flex justify-between"><span className="text-gray-500">Livraison prévue</span><span className="font-semibold text-gray-900 dark:text-white">{formatDate(order.expectedDate)}</span></div>}
                  <div className="flex justify-between"><span className="text-gray-500">Montant total</span><span className="font-bold text-gray-900 dark:text-white">{formatAmount(total)}</span></div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Créé par</span>
                    <span className="flex items-center gap-1.5 font-semibold text-gray-900 dark:text-white">
                      <span className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-600 dark:text-gray-300">{getInitials(order.createdBy)}</span>
                      {order.createdBy}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-gray-500">État</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${STATUS_STYLES[order.status]}`}>{order.status}</span>
                  </div>
                  {order.notes && <div className="pt-2 border-t border-gray-100 dark:border-gray-800 text-gray-500 italic">{order.notes}</div>}
                </div>
              </div>
            </div>
          </div>

          {/* Receptions */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5"><PackagePlus size={13} className="text-emerald-500" /> Réceptions</p>
              {remainingLines.length > 0 && order.status !== 'Annulée' && !showReceptionForm && (
                <button onClick={handleOpenReceptionForm} className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer inline-flex items-center gap-1">
                  <Plus size={12} /> Ajouter une réception
                </button>
              )}
            </div>

            {receptions.length === 0 ? (
              <p className="text-gray-400">Aucune réception enregistrée.</p>
            ) : (
              <div className="space-y-1.5">
                {[...receptions].sort((a, b) => (a.receptionDate < b.receptionDate ? 1 : -1)).map((r) => (
                  <div key={r.id} className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-800 dark:text-gray-200">{formatDate(r.receptionDate)} — {r.zone}</span>
                      <span className="text-gray-400">Par {r.performedBy}</span>
                    </div>
                    <div className="mt-1 text-gray-600 dark:text-gray-300">
                      {r.lines.map((rl) => {
                        const line = order.lines.find((l) => l.id === rl.lineId);
                        return <span key={rl.lineId} className="inline-block mr-3">{products.find((p) => p.id === line?.productId)?.name ?? '—'} : +{rl.quantityReceived} {line?.unit}</span>;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showReceptionForm && (
              <div className="mt-2.5 p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className={labelClass}>Date de réception *</label>
                    <input type="date" value={receptionDate} onChange={(e) => setReceptionDate(e.target.value)} className={`${inputBaseClass} ${inputValidClass}`} />
                  </div>
                  <div>
                    <label className={labelClass}>Zone *</label>
                    <select value={receptionZone} onChange={(e) => setReceptionZone(e.target.value as StockZone)} className={`${inputBaseClass} appearance-none cursor-pointer ${inputValidClass}`}>
                      {STOCK_ZONES.map((z) => (<option key={z} value={z}>{z}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Réceptionné par *</label>
                    <EmployeePicker
                      value={receptionPerformedBy}
                      onChange={(v) => setReceptionPerformedBy(v)}
                      employees={employees}
                      className={`${inputBaseClass} appearance-none cursor-pointer ${inputValidClass}`}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  {remainingLines.map((l) => {
                    const remaining = l.quantity - l.receivedQuantity;
                    return (
                      <div key={l.id} className="flex items-center gap-2.5">
                        <span className="flex-1 font-medium text-gray-700 dark:text-gray-300">{products.find((p) => p.id === l.productId)?.name}</span>
                        <DecimalInput
                          min={0}
                          max={remaining}
                          step="any"
                          value={receptionQuantities[l.id] ?? ''}
                          onChange={(e) => setReceptionQuantities((prev) => ({ ...prev, [l.id]: e.target.value }))}
                          placeholder={`Reste ${remaining} ${l.unit}`}
                          className={`${inputBaseClass} ${inputValidClass} w-36`}
                        />
                        <span className="text-gray-400 w-14">{l.unit}</span>
                      </div>
                    );
                  })}
                </div>
                {receptionIssues.length > 0 && (
                  <div className="text-[11px] text-red-500 space-y-0.5">
                    {receptionIssues.map((msg, i) => (<p key={i} className="flex items-center gap-1"><AlertCircle size={11} /> {msg}</p>))}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowReceptionForm(false)} className={secondaryButtonClass}><span>Annuler</span></button>
                  <button onClick={handleConfirmReception} className={primaryButtonClass}><ShieldCheck size={14} /><span>Valider la réception</span></button>
                </div>
              </div>
            )}
          </div>

          {/* Supplier invoice */}
          <div>
            <p className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5 mb-1.5"><FileText size={13} className="text-emerald-500" /> Facture fournisseur</p>
            {invoice ? (
              <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-900 dark:text-white">{invoice.invoiceNumber}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${INVOICE_STATUS_STYLES[computeInvoiceStatus(invoice)]}`}>
                    {computeInvoiceStatus(invoice)}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-gray-600 dark:text-gray-300">
                  <div><span className="text-gray-400 block">Date</span>{formatDate(invoice.invoiceDate)}</div>
                  <div className={isInvoiceDueSoon(invoice) ? 'text-amber-600 dark:text-amber-400 font-semibold' : ''}>
                    <span className="text-gray-400 block">Échéance</span>{formatDate(invoice.dueDate)}{isInvoiceOverdue(invoice) ? ' (dépassée)' : isInvoiceDueSoon(invoice) ? ' (proche)' : ''}
                  </div>
                  <div><span className="text-gray-400 block">Mode</span>{invoice.paymentMethod}</div>
                  <div><span className="text-gray-400 block">Montant HT</span>{formatAmount(invoice.amountHT)}</div>
                  <div><span className="text-gray-400 block">TVA</span>{formatAmount(invoice.vatAmount)}</div>
                  <div><span className="text-gray-400 block">Montant TTC</span><span className="font-bold text-gray-900 dark:text-white">{formatAmount(invoice.amountTTC)}</span></div>
                  <div><span className="text-gray-400 block">Payé</span>{formatAmount(invoice.amountPaid)}</div>
                  <div><span className="text-gray-400 block">Restant dû</span><span className="font-semibold text-gray-900 dark:text-white">{formatAmount(invoice.amountTTC - invoice.amountPaid)}</span></div>
                </div>
                {computeInvoiceStatus(invoice) !== 'Payée' && !showPaymentForm && (
                  <button onClick={() => setShowPaymentForm(true)} className={secondaryButtonClass}>
                    <CreditCard size={13} /><span>Enregistrer un paiement</span>
                  </button>
                )}
                {showPaymentForm && (
                  <div className="flex items-center gap-2 pt-1">
                    <DecimalInput
                      min={0}
                      max={remainingDue}
                      step="any"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder={`Max ${formatAmount(remainingDue)}`}
                      className={`${inputBaseClass} ${inputValidClass} w-40`}
                    />
                    <button onClick={handleConfirmPayment} className={primaryButtonClass}><ShieldCheck size={13} /><span>Valider</span></button>
                    <button onClick={() => { setShowPaymentForm(false); setPaymentAmount(''); }} className={secondaryButtonClass}><span>Annuler</span></button>
                  </div>
                )}
              </div>
            ) : showInvoiceForm ? (
              <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <input type="text" value={invoiceDraft.invoiceNumber} onChange={(e) => setInvoiceDraft((p) => ({ ...p, invoiceNumber: e.target.value }))} placeholder="Numéro de facture *" className={`${inputBaseClass} ${invoiceErrors && invoiceIssuesByField.has('invoiceNumber') ? inputErrorClass : inputValidClass}`} />
                    {invoiceErrors && invoiceIssuesByField.get('invoiceNumber') && <p className="text-[11px] text-red-500 mt-1">{invoiceIssuesByField.get('invoiceNumber')}</p>}
                  </div>
                  <div>
                    <select value={invoiceDraft.paymentMethod} onChange={(e) => setInvoiceDraft((p) => ({ ...p, paymentMethod: e.target.value as PurchasePaymentMethod }))} className={`${inputBaseClass} appearance-none cursor-pointer ${invoiceErrors && invoiceIssuesByField.has('paymentMethod') ? inputErrorClass : inputValidClass}`}>
                      <option value="">Mode de paiement *</option>
                      {PURCHASE_PAYMENT_METHODS.map((m) => (<option key={m} value={m}>{m}</option>))}
                    </select>
                    {invoiceErrors && invoiceIssuesByField.get('paymentMethod') && <p className="text-[11px] text-red-500 mt-1">{invoiceIssuesByField.get('paymentMethod')}</p>}
                  </div>
                  <div>
                    <label className={labelClass}>Date de facture *</label>
                    <input type="date" value={invoiceDraft.invoiceDate} onChange={(e) => setInvoiceDraft((p) => ({ ...p, invoiceDate: e.target.value }))} className={`${inputBaseClass} ${inputValidClass}`} />
                  </div>
                  <div>
                    <label className={labelClass}>Échéance *</label>
                    <input type="date" value={invoiceDraft.dueDate} onChange={(e) => setInvoiceDraft((p) => ({ ...p, dueDate: e.target.value }))} className={`${inputBaseClass} ${inputValidClass}`} />
                  </div>
                  <div>
                    <label className={labelClass}>Montant HT *</label>
                    <DecimalInput min={0} step="any" value={invoiceDraft.amountHT} onChange={(e) => setInvoiceDraft((p) => ({ ...p, amountHT: e.target.value }))} className={`${inputBaseClass} ${invoiceErrors && invoiceIssuesByField.has('amountHT') ? inputErrorClass : inputValidClass}`} />
                  </div>
                  <div>
                    <label className={labelClass}>TVA *</label>
                    <DecimalInput min={0} step="any" value={invoiceDraft.vatAmount} onChange={(e) => setInvoiceDraft((p) => ({ ...p, vatAmount: e.target.value }))} className={`${inputBaseClass} ${invoiceErrors && invoiceIssuesByField.has('vatAmount') ? inputErrorClass : inputValidClass}`} />
                  </div>
                  <div>
                    <label className={labelClass}>Montant TTC *</label>
                    <DecimalInput min={0} step="any" value={invoiceDraft.amountTTC} onChange={(e) => setInvoiceDraft((p) => ({ ...p, amountTTC: e.target.value }))} className={`${inputBaseClass} ${invoiceErrors && invoiceIssuesByField.has('amountTTC') ? inputErrorClass : inputValidClass}`} />
                  </div>
                  <div>
                    <label className={labelClass}>Montant déjà payé</label>
                    <DecimalInput min={0} step="any" value={invoiceDraft.amountPaid} onChange={(e) => setInvoiceDraft((p) => ({ ...p, amountPaid: e.target.value }))} className={`${inputBaseClass} ${invoiceErrors && invoiceIssuesByField.has('amountPaid') ? inputErrorClass : inputValidClass}`} />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowInvoiceForm(false)} className={secondaryButtonClass}><span>Annuler</span></button>
                  <button onClick={handleConfirmInvoice} className={primaryButtonClass}><ShieldCheck size={14} /><span>Enregistrer la facture</span></button>
                </div>
              </div>
            ) : (
              <button onClick={handleOpenInvoiceForm} className={secondaryButtonClass}>
                <Plus size={13} /><span>Associer / créer une facture</span>
              </button>
            )}
          </div>

          {order.status === 'Annulée' && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-red-600 dark:text-red-400 flex items-center gap-2">
              <Info size={14} /> Cet achat est annulé — aucune nouvelle réception n'est possible.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
