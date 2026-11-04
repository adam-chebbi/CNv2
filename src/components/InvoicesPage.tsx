import { DecimalInput } from './ui/DecimalInput';
import React, { useMemo, useState } from 'react';
import {
  Receipt,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FilterX,
  Wallet,
  Clock,
  CheckCircle,
  AlertTriangle,
  Plus,
  Truck,
  Eye,
  Pencil,
  Trash2,
  X,
  AlertCircle,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  CreditCard,
  FileText,
} from 'lucide-react';
import { useQueryParam } from '../hooks/useQueryParam';
import {
  Supplier,
  PurchaseOrder,
  SupplierInvoice,
  InvoicePaymentStatus,
  INVOICE_PAYMENT_STATUSES,
  PURCHASE_PAYMENT_METHODS,
  PurchasePaymentMethod,
  DraftSupplierInvoice,
  createEmptyDraftInvoice,
  createDraftFromInvoice,
  validateDraftInvoice,
  buildInvoiceFromDraft,
  computeInvoiceStatus,
  isInvoiceDueSoon,
  isInvoiceOverdue,
  computeOrderTotal,
} from '../data/purchasesModel';

interface InvoicesPageProps {
  invoices: SupplierInvoice[];
  suppliers: Supplier[];
  orders: PurchaseOrder[];
  onNavigateToDashboard: () => void;
  onNavigateToPurchases: () => void;
  onNavigateToSuppliers: () => void;
  onCreateInvoice: (invoice: SupplierInvoice) => void;
  onUpdateInvoice: (invoice: SupplierInvoice) => void;
  onDeleteInvoice: (invoiceId: string) => void;
  onRecordInvoicePayment: (invoiceId: string, amountAdded: number) => void;
  isDarkMode?: boolean;
}

type FormMode = 'create' | 'edit';
type Step = 'form' | 'preview' | 'success';

const inputBaseClass =
  'w-full px-3.5 py-2 text-xs rounded-xl border bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 transition';
const inputValidClass = 'border-gray-200 dark:border-gray-700 focus:border-emerald-500 focus:ring-emerald-500';
const inputErrorClass = 'border-red-400 dark:border-red-500/70 focus:border-red-500 focus:ring-red-500';
const labelClass = 'text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 block';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer';

const STATUS_STYLES: Record<InvoicePaymentStatus, string> = {
  'Non payée': 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/70',
  'Partiellement payée': 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/70',
  Payée: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70',
};

const formatAmount = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DT`;
const formatDate = (iso: string) => {
  const [y, m, d] = (iso || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso || '—';
};

export const InvoicesPage: React.FC<InvoicesPageProps> = ({
  invoices,
  suppliers,
  orders,
  onNavigateToDashboard,
  onNavigateToPurchases,
  onNavigateToSuppliers,
  onCreateInvoice,
  onUpdateInvoice,
  onDeleteInvoice,
  onRecordInvoicePayment,
}) => {
  const [formOpen, setFormOpen] = useState<FormMode | null>(null);
  const [step, setStep] = useState<Step>('form');
  const [draft, setDraft] = useState<DraftSupplierInvoice>(createEmptyDraftInvoice());
  const [hasAttemptedVerify, setHasAttemptedVerify] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // "Consulter" opens ?invoice=<id> — a shareable deep link straight into that invoice's detail.
  const [invoiceParam, setInvoiceParam] = useQueryParam('invoice');
  const viewingInvoiceId = invoiceParam || null;
  const setViewingInvoiceId = (id: string | null) => setInvoiceParam(id ?? '');
  const [deleteTarget, setDeleteTarget] = useState<SupplierInvoice | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'all' | InvoicePaymentStatus>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 8;

  const supplierName = (supplierId: string) => suppliers.find((s) => s.id === supplierId)?.name ?? '—';
  const orderNumber = (orderId?: string) => (orderId ? orders.find((o) => o.id === orderId)?.orderNumber ?? '—' : null);

  const viewingInvoice = useMemo(() => invoices.find((i) => i.id === viewingInvoiceId) ?? null, [invoices, viewingInvoiceId]);

  const updateDraft = (patch: Partial<DraftSupplierInvoice>) => setDraft((prev) => ({ ...prev, ...patch }));

  // Orders available to link: unattached orders belonging to the selected supplier, plus the
  // order already linked when editing (so it doesn't disappear from its own dropdown).
  const linkableOrders = useMemo(() => {
    if (!draft.supplierId) return [];
    const alreadyInvoiced = new Set(invoices.filter((i) => i.id !== draft.id && i.purchaseOrderId).map((i) => i.purchaseOrderId));
    return orders.filter((o) => o.supplierId === draft.supplierId && (!alreadyInvoiced.has(o.id) || o.id === draft.purchaseOrderId));
  }, [orders, invoices, draft.supplierId, draft.id, draft.purchaseOrderId]);

  const issues = useMemo(() => validateDraftInvoice(draft, suppliers), [draft, suppliers]);
  const issuesByField = new Map(issues.map((i) => [i.field, i.message]));
  const showErrors = hasAttemptedVerify;

  // --- Create / edit workflow ---
  const handleOpenCreate = () => {
    setFormOpen('create');
    setDraft(createEmptyDraftInvoice());
    setStep('form');
    setHasAttemptedVerify(false);
    setSaveError(null);
  };

  const handleOpenEdit = (invoice: SupplierInvoice) => {
    setFormOpen('edit');
    setDraft(createDraftFromInvoice(invoice));
    setStep('form');
    setHasAttemptedVerify(false);
    setSaveError(null);
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
      const invoice = buildInvoiceFromDraft(draft);
      if (formOpen === 'create') onCreateInvoice(invoice);
      else onUpdateInvoice(invoice);
      setStep('success');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Une erreur est survenue lors de l'enregistrement. Veuillez réessayer.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartNew = () => {
    setDraft(createEmptyDraftInvoice());
    setHasAttemptedVerify(false);
    setSaveError(null);
    setStep('form');
    setFormOpen('create');
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    onDeleteInvoice(deleteTarget.id);
    setDeleteTarget(null);
  };

  // --- Filters / list ---
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (filterSupplier !== 'all' && inv.supplierId !== filterSupplier) return false;
      if (filterStatus !== 'all' && computeInvoiceStatus(inv) !== filterStatus) return false;
      if (dateFrom && inv.dueDate < dateFrom) return false;
      if (dateTo && inv.dueDate > dateTo) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        if (!inv.invoiceNumber.toLowerCase().includes(q) && !supplierName(inv.supplierId).toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [invoices, suppliers, filterSupplier, filterStatus, dateFrom, dateTo, searchQuery]);

  const sortedInvoices = useMemo(() => [...filteredInvoices].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)), [filteredInvoices]);
  const totalPages = Math.max(1, Math.ceil(sortedInvoices.length / rowsPerPage));
  const paginatedInvoices = useMemo(() => sortedInvoices.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage), [sortedInvoices, currentPage]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setFilterSupplier('all');
    setFilterStatus('all');
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
  };

  // --- KPIs ---
  const totalAmount = useMemo(() => invoices.reduce((sum, i) => sum + i.amountTTC, 0), [invoices]);
  const unpaid = useMemo(() => invoices.filter((i) => computeInvoiceStatus(i) === 'Non payée'), [invoices]);
  const partial = useMemo(() => invoices.filter((i) => computeInvoiceStatus(i) === 'Partiellement payée'), [invoices]);
  const paid = useMemo(() => invoices.filter((i) => computeInvoiceStatus(i) === 'Payée'), [invoices]);

  // --- Due-soon / overdue banner ---
  const alertInvoices = useMemo(() => invoices.filter((inv) => isInvoiceDueSoon(inv)), [invoices]);

  // --- Payment sub-modal ---
  const [paymentTarget, setPaymentTarget] = useState<SupplierInvoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const remainingDue = paymentTarget ? paymentTarget.amountTTC - paymentTarget.amountPaid : 0;

  const handleOpenPayment = (invoice: SupplierInvoice) => {
    setPaymentTarget(invoice);
    setPaymentAmount('');
  };

  const handleConfirmPayment = () => {
    const amount = Number(paymentAmount);
    if (!paymentTarget || Number.isNaN(amount) || amount <= 0 || amount > remainingDue) return;
    onRecordInvoicePayment(paymentTarget.id, amount);
    setPaymentTarget(null);
    setPaymentAmount('');
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>Factures fournisseurs</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Achat et dépenses
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Factures liées ou non à une commande, suivi des paiements et échéances.</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button onClick={onNavigateToSuppliers} className={secondaryButtonClass}>
            <Truck size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Fournisseurs</span>
          </button>
          <button onClick={onNavigateToPurchases} className={secondaryButtonClass}>
            <FileText size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Achats</span>
          </button>
          <button onClick={handleOpenCreate} className={primaryButtonClass}>
            <Plus size={14} />
            <span>Ajouter une facture</span>
          </button>
          <button
            onClick={onNavigateToDashboard}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700/80 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition active:scale-98 cursor-pointer"
          >
            <span>Tableau de bord</span>
          </button>
        </div>
      </div>

      {/* Due-soon / overdue banner */}
      {alertInvoices.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
              {alertInvoices.length} facture{alertInvoices.length > 1 ? 's' : ''} à échéance proche ou dépassée
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {alertInvoices.map((inv) => {
                const overdue = isInvoiceOverdue(inv);
                return (
                  <button
                    key={inv.id}
                    onClick={() => setViewingInvoiceId(inv.id)}
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

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Total des factures</span>
            <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">{formatAmount(totalAmount)}</span>
            <p className="text-[11px] text-gray-400">{invoices.length} facture{invoices.length > 1 ? 's' : ''}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 flex items-center justify-center text-blue-500 shrink-0">
            <Wallet size={22} />
          </div>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Non payées</span>
            <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">{unpaid.length}</span>
            <p className="text-[11px] text-gray-400">{formatAmount(unpaid.reduce((s, i) => s + i.amountTTC, 0))}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-red-50/80 dark:bg-red-950/40 flex items-center justify-center text-red-500 shrink-0">
            <Clock size={22} />
          </div>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Partiellement payées</span>
            <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">{partial.length}</span>
            <p className="text-[11px] text-gray-400">{formatAmount(partial.reduce((s, i) => s + (i.amountTTC - i.amountPaid), 0))} restant</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 flex items-center justify-center text-amber-500 shrink-0">
            <CreditCard size={22} />
          </div>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Payées</span>
            <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">{paid.length}</span>
            <p className="text-[11px] text-gray-400">{formatAmount(paid.reduce((s, i) => s + i.amountTTC, 0))}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-500 shrink-0">
            <CheckCircle size={22} />
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
                placeholder="N° facture, fournisseur..."
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <select value={filterSupplier} onChange={(e) => { setFilterSupplier(e.target.value); setCurrentPage(1); }} className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer">
              <option value="all">Tous les fournisseurs</option>
              {suppliers.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
            <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value as 'all' | InvoicePaymentStatus); setCurrentPage(1); }} className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer">
              <option value="all">Tous les statuts</option>
              {INVOICE_PAYMENT_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }} title="Échéance du" className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }} title="Échéance au" className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
          </div>
          <button onClick={handleResetFilters} className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 shadow-2xs transition active:scale-98 shrink-0 cursor-pointer">
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
                <th className="py-3.5 px-4">Numéro</th>
                <th className="py-3.5 px-4">Fournisseur</th>
                <th className="py-3.5 px-4">Commande liée</th>
                <th className="py-3.5 px-4">Date</th>
                <th className="py-3.5 px-4">Échéance</th>
                <th className="py-3.5 px-4 text-right">Montant TTC</th>
                <th className="py-3.5 px-4 text-right">Payé</th>
                <th className="py-3.5 px-4 text-center">Statut</th>
                <th className="py-3.5 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 text-xs">
              {paginatedInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-400">
                    <div className="max-w-sm mx-auto space-y-2">
                      <Receipt className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600" />
                      <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">Aucune facture ne correspond à ces filtres</p>
                      <button onClick={handleResetFilters} className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer">
                        Réinitialiser les filtres
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedInvoices.map((inv) => {
                  const status = computeInvoiceStatus(inv);
                  const overdue = isInvoiceOverdue(inv);
                  const dueSoon = isInvoiceDueSoon(inv);
                  const linkedOrderNumber = orderNumber(inv.purchaseOrderId);
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold">
                        <button
                          onClick={() => setViewingInvoiceId(inv.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 hover:bg-emerald-100/80 transition cursor-pointer"
                          title="Voir le détail de la facture"
                        >
                          <FileText size={12} className="text-emerald-500" />
                          <span>{inv.invoiceNumber}</span>
                        </button>
                      </td>
                      <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white">{supplierName(inv.supplierId)}</td>
                      <td className="py-3 px-4 text-gray-600 dark:text-gray-300">{linkedOrderNumber ?? <span className="text-gray-400">—</span>}</td>
                      <td className="py-3 px-4 text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatDate(inv.invoiceDate)}</td>
                      <td className={`py-3 px-4 whitespace-nowrap font-semibold ${overdue ? 'text-red-600 dark:text-red-400' : dueSoon ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-300'}`}>
                        {formatDate(inv.dueDate)}{overdue ? ' ⚠' : ''}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">{formatAmount(inv.amountTTC)}</td>
                      <td className="py-3 px-4 text-right text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatAmount(inv.amountPaid)}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border whitespace-nowrap ${STATUS_STYLES[status]}`}>{status}</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setViewingInvoiceId(inv.id)} title="Consulter" className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer"><Eye size={14} /></button>
                          {status !== 'Payée' && (
                            <button onClick={() => handleOpenPayment(inv)} title="Enregistrer un paiement" className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer"><CreditCard size={14} /></button>
                          )}
                          <button onClick={() => handleOpenEdit(inv)} title="Modifier" className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer"><Pencil size={14} /></button>
                          <button
                            onClick={() => inv.amountPaid <= 0 && setDeleteTarget(inv)}
                            disabled={inv.amountPaid > 0}
                            title={inv.amountPaid > 0 ? 'Suppression impossible — des paiements sont enregistrés' : 'Supprimer'}
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
          <span>sur un total de {sortedInvoices.length} facture{sortedInvoices.length > 1 ? 's' : ''}</span>
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
            className="w-full max-w-xl max-h-[92vh] overflow-y-auto custom-scrollbar rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-200 dark:border-gray-700 shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {step === 'success' ? (
              <div className="p-8 sm:p-12 flex flex-col items-center text-center gap-3">
                <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-500">
                  <CheckCircle2 size={30} />
                </div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{formOpen === 'create' ? 'Facture enregistrée' : 'Facture modifiée'}</h2>
                <div className="flex items-center gap-2 pt-2 flex-wrap justify-center">
                  <button onClick={handleStartNew} className={secondaryButtonClass}>
                    <Plus size={14} />
                    <span>Ajouter une autre facture</span>
                  </button>
                  <button onClick={handleCloseForm} className={primaryButtonClass}>
                    <Receipt size={14} />
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
                  <div className="flex justify-between"><span className="text-gray-500">Commande liée :</span><span className="font-bold text-gray-900 dark:text-white">{orderNumber(draft.purchaseOrderId) ?? 'Aucune'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Numéro :</span><span className="font-bold text-gray-900 dark:text-white">{draft.invoiceNumber.trim()}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Date :</span><span className="font-bold text-gray-900 dark:text-white">{formatDate(draft.invoiceDate)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Échéance :</span><span className="font-bold text-gray-900 dark:text-white">{formatDate(draft.dueDate)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Montant HT :</span><span className="font-bold text-gray-900 dark:text-white">{formatAmount(Number(draft.amountHT || 0))}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">TVA :</span><span className="font-bold text-gray-900 dark:text-white">{formatAmount(Number(draft.vatAmount || 0))}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Montant TTC :</span><span className="font-bold text-gray-900 dark:text-white">{formatAmount(Number(draft.amountTTC || 0))}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Montant payé :</span><span className="font-bold text-gray-900 dark:text-white">{formatAmount(Number(draft.amountPaid || 0))}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Mode de paiement :</span><span className="font-bold text-gray-900 dark:text-white">{draft.paymentMethod}</span></div>
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
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">{formOpen === 'create' ? 'Nouvelle facture' : 'Modifier la facture'}</h2>
                  <button onClick={handleCloseForm} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className={labelClass}>Fournisseur *</label>
                    <div className="relative">
                      <select
                        value={draft.supplierId}
                        onChange={(e) => updateDraft({ supplierId: e.target.value, purchaseOrderId: '' })}
                        className={`${inputBaseClass} appearance-none pr-8 cursor-pointer ${showErrors && issuesByField.has('supplierId') ? inputErrorClass : inputValidClass}`}
                      >
                        <option value="">Sélectionner un fournisseur</option>
                        {suppliers.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                      </select>
                      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                    {showErrors && issuesByField.get('supplierId') && (<p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('supplierId')}</p>)}
                  </div>
                  <div>
                    <label className={labelClass}>Commande liée (facultatif)</label>
                    <div className="relative">
                      <select
                        value={draft.purchaseOrderId}
                        onChange={(e) => {
                          const orderId = e.target.value;
                          const linkedOrder = orders.find((o) => o.id === orderId);
                          updateDraft({
                            purchaseOrderId: orderId,
                            ...(linkedOrder && !draft.amountTTC ? { amountTTC: computeOrderTotal(linkedOrder).toFixed(2), amountHT: (computeOrderTotal(linkedOrder) / 1.19).toFixed(2), vatAmount: (computeOrderTotal(linkedOrder) - computeOrderTotal(linkedOrder) / 1.19).toFixed(2) } : {}),
                          });
                        }}
                        disabled={!draft.supplierId}
                        className={`${inputBaseClass} appearance-none pr-8 cursor-pointer ${inputValidClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        <option value="">Aucune (facture indépendante)</option>
                        {linkableOrders.map((o) => (<option key={o.id} value={o.id}>{o.orderNumber} — {formatAmount(computeOrderTotal(o))}</option>))}
                      </select>
                      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Numéro de facture *</label>
                    <input type="text" value={draft.invoiceNumber} onChange={(e) => updateDraft({ invoiceNumber: e.target.value })} className={`${inputBaseClass} ${showErrors && issuesByField.has('invoiceNumber') ? inputErrorClass : inputValidClass}`} />
                    {showErrors && issuesByField.get('invoiceNumber') && (<p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('invoiceNumber')}</p>)}
                  </div>
                  <div>
                    <label className={labelClass}>Mode de paiement *</label>
                    <div className="relative">
                      <select value={draft.paymentMethod} onChange={(e) => updateDraft({ paymentMethod: e.target.value as PurchasePaymentMethod })} className={`${inputBaseClass} appearance-none pr-8 cursor-pointer ${showErrors && issuesByField.has('paymentMethod') ? inputErrorClass : inputValidClass}`}>
                        <option value="">Sélectionner un mode de paiement</option>
                        {PURCHASE_PAYMENT_METHODS.map((m) => (<option key={m} value={m}>{m}</option>))}
                      </select>
                      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                    {showErrors && issuesByField.get('paymentMethod') && (<p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('paymentMethod')}</p>)}
                  </div>

                  <div>
                    <label className={labelClass}>Date de facture *</label>
                    <input type="date" value={draft.invoiceDate} onChange={(e) => updateDraft({ invoiceDate: e.target.value })} className={`${inputBaseClass} ${showErrors && issuesByField.has('invoiceDate') ? inputErrorClass : inputValidClass}`} />
                    {showErrors && issuesByField.get('invoiceDate') && (<p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('invoiceDate')}</p>)}
                  </div>
                  <div>
                    <label className={labelClass}>Échéance *</label>
                    <input type="date" value={draft.dueDate} onChange={(e) => updateDraft({ dueDate: e.target.value })} className={`${inputBaseClass} ${showErrors && issuesByField.has('dueDate') ? inputErrorClass : inputValidClass}`} />
                    {showErrors && issuesByField.get('dueDate') && (<p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('dueDate')}</p>)}
                  </div>

                  <div>
                    <label className={labelClass}>Montant HT *</label>
                    <DecimalInput min={0} step="any" value={draft.amountHT} onChange={(e) => updateDraft({ amountHT: e.target.value })} className={`${inputBaseClass} ${showErrors && issuesByField.has('amountHT') ? inputErrorClass : inputValidClass}`} />
                    {showErrors && issuesByField.get('amountHT') && (<p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('amountHT')}</p>)}
                  </div>
                  <div>
                    <label className={labelClass}>TVA *</label>
                    <DecimalInput min={0} step="any" value={draft.vatAmount} onChange={(e) => updateDraft({ vatAmount: e.target.value })} className={`${inputBaseClass} ${showErrors && issuesByField.has('vatAmount') ? inputErrorClass : inputValidClass}`} />
                    {showErrors && issuesByField.get('vatAmount') && (<p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('vatAmount')}</p>)}
                  </div>
                  <div>
                    <label className={labelClass}>Montant TTC *</label>
                    <DecimalInput min={0} step="any" value={draft.amountTTC} onChange={(e) => updateDraft({ amountTTC: e.target.value })} className={`${inputBaseClass} ${showErrors && issuesByField.has('amountTTC') ? inputErrorClass : inputValidClass}`} />
                    {showErrors && issuesByField.get('amountTTC') && (<p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('amountTTC')}</p>)}
                  </div>
                  <div>
                    <label className={labelClass}>Montant déjà payé</label>
                    <DecimalInput min={0} step="any" value={draft.amountPaid} onChange={(e) => updateDraft({ amountPaid: e.target.value })} className={`${inputBaseClass} ${showErrors && issuesByField.has('amountPaid') ? inputErrorClass : inputValidClass}`} />
                    {showErrors && issuesByField.get('amountPaid') && (<p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('amountPaid')}</p>)}
                  </div>
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

      {/* View invoice modal */}
      {viewingInvoice && (
        <InvoiceDetailModal
          invoice={viewingInvoice}
          supplierName={supplierName(viewingInvoice.supplierId)}
          linkedOrderNumber={orderNumber(viewingInvoice.purchaseOrderId)}
          onClose={() => setViewingInvoiceId(null)}
          onOpenPayment={() => handleOpenPayment(viewingInvoice)}
        />
      )}

      {/* Payment sub-modal */}
      {paymentTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200" onClick={() => setPaymentTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2"><CreditCard size={16} className="text-emerald-500" /> Enregistrer un paiement</h3>
              <button onClick={() => setPaymentTarget(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
            </div>
            <div className="p-5 text-xs space-y-3">
              <p className="text-gray-500">Facture <strong className="text-gray-900 dark:text-white">{paymentTarget.invoiceNumber}</strong> — restant dû <strong className="text-gray-900 dark:text-white">{formatAmount(remainingDue)}</strong></p>
              <DecimalInput min={0} max={remainingDue} step="any" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder={`Max ${formatAmount(remainingDue)}`} className={`${inputBaseClass} ${inputValidClass}`} />
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-2">
              <button onClick={() => setPaymentTarget(null)} className={secondaryButtonClass}><span>Annuler</span></button>
              <button onClick={handleConfirmPayment} className={primaryButtonClass}><ShieldCheck size={14} /><span>Valider le paiement</span></button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2"><AlertCircle size={16} className="text-red-500" /> Supprimer cette facture</h3>
              <button onClick={() => setDeleteTarget(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
            </div>
            <div className="p-5 text-xs text-gray-600 dark:text-gray-300 space-y-2">
              <p>Voulez-vous vraiment supprimer la facture <strong className="text-gray-900 dark:text-white">{deleteTarget.invoiceNumber}</strong> ? Cette action est irréversible.</p>
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

const InvoiceDetailModal: React.FC<{
  invoice: SupplierInvoice;
  supplierName: string;
  linkedOrderNumber: string | null;
  onClose: () => void;
  onOpenPayment: () => void;
}> = ({ invoice, supplierName, linkedOrderNumber, onClose, onOpenPayment }) => {
  const status = computeInvoiceStatus(invoice);
  const overdue = isInvoiceOverdue(invoice);
  const dueSoon = isInvoiceDueSoon(invoice);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto custom-scrollbar rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-200 dark:border-gray-700 shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between sticky top-0 bg-white dark:bg-[#151D2A] z-10">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm text-gray-900 dark:text-white">{invoice.invoiceNumber}</h3>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${STATUS_STYLES[status]}`}>{status}</span>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4 text-xs">
          {(overdue || dueSoon) && (
            <div className={`p-3 rounded-xl border flex items-center gap-2 ${overdue ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/60 text-red-600 dark:text-red-400' : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-300'}`}>
              <AlertTriangle size={14} />
              <span>{overdue ? 'Échéance dépassée.' : 'Échéance proche.'}</span>
            </div>
          )}
          <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 grid grid-cols-2 gap-3">
            <div><span className="text-gray-400 block">Fournisseur</span><span className="font-bold text-gray-900 dark:text-white">{supplierName}</span></div>
            <div><span className="text-gray-400 block">Commande liée</span><span className="font-bold text-gray-900 dark:text-white">{linkedOrderNumber ?? '—'}</span></div>
            <div><span className="text-gray-400 block">Date</span><span className="font-bold text-gray-900 dark:text-white">{formatDate(invoice.invoiceDate)}</span></div>
            <div><span className="text-gray-400 block">Échéance</span><span className="font-bold text-gray-900 dark:text-white">{formatDate(invoice.dueDate)}</span></div>
            <div><span className="text-gray-400 block">Mode de paiement</span><span className="font-bold text-gray-900 dark:text-white">{invoice.paymentMethod}</span></div>
            <div><span className="text-gray-400 block">Montant HT</span><span className="font-bold text-gray-900 dark:text-white">{formatAmount(invoice.amountHT)}</span></div>
            <div><span className="text-gray-400 block">TVA</span><span className="font-bold text-gray-900 dark:text-white">{formatAmount(invoice.vatAmount)}</span></div>
            <div><span className="text-gray-400 block">Montant TTC</span><span className="font-black text-gray-900 dark:text-white">{formatAmount(invoice.amountTTC)}</span></div>
            <div><span className="text-gray-400 block">Payé</span><span className="font-bold text-gray-900 dark:text-white">{formatAmount(invoice.amountPaid)}</span></div>
            <div><span className="text-gray-400 block">Restant dû</span><span className="font-bold text-gray-900 dark:text-white">{formatAmount(invoice.amountTTC - invoice.amountPaid)}</span></div>
          </div>
          {status !== 'Payée' && (
            <button onClick={onOpenPayment} className={primaryButtonClass}>
              <CreditCard size={14} /><span>Enregistrer un paiement</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
