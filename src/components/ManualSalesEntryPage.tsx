import { DecimalInput } from './ui/DecimalInput';
import { EmployeePicker } from './ui/EmployeePicker';
import React, { useMemo, useState } from 'react';
import { useUnsavedWorkGuard } from '../hooks/useUnsavedWorkGuard';
import {
  Receipt,
  Coffee,
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  X,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  ShieldCheck,
  Banknote,
  CreditCard,
  Ticket,
  Utensils,
  ShoppingBag,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Users,
  ClipboardList,
  RotateCcw,
  Package,
  MessageSquare,
} from 'lucide-react';
import { SaleTransaction, ServiceType, PaymentMethod, PAYMENT_NOTE_SUGGESTIONS } from '../data/salesTransactions';
import {
  CatalogArticle,
  CatalogExtra,
  getArticleCategoriesInUse,
  getArticleById,
  getExtraById,
  getVariantGroupForCategory,
  getVariantOption,
  getArticleTtcPrice,
} from '../data/manualSalesCatalog';
import {
  DraftTicket,
  DraftTicketItem,
  ManualSalesFormState,
  SalesCatalogContext,
  createEmptyItem,
  createEmptyTicket,
  createEmptyForm,
  computeItemLineTotal,
  computeTicketTotal,
  computeGrandTotal,
  validateManualSalesForm,
  buildSaleTransactionsFromForm,
} from '../data/salesEntryModel';
import {
  DraftQuantityRow,
  QuantitySalesFormState,
  setQuantityForArticle,
  createEmptyQuantityForm,
  computeQuantitySalesTotals,
  validateQuantitySalesForm,
  buildSaleTransactionsFromQuantityForm,
} from '../data/quantitySalesEntryModel';
import { QuantitySalesFormStep, QuantitySalesPreviewStep } from './QuantitySalesEntryForm';
import { InternalConsumptionModal } from './InternalConsumptionModal';
import { buildInternalConsumptionPayload } from '../data/internalConsumptionModel';

interface ManualSalesEntryPageProps {
  articles: CatalogArticle[];
  extras: CatalogExtra[];
  employees: string[];
  shifts: string[];
  onNavigateToDashboard: () => void;
  onNavigateToSalesList: () => void;
  onSaveTickets: (transactions: SaleTransaction[]) => void;
  onSaveInternalConsumption: (payload: ReturnType<typeof buildInternalConsumptionPayload>) => Promise<void>;
  isDarkMode?: boolean;
}

type Step = 'form' | 'preview' | 'success';
type EntryMode = 'tickets' | 'quantities';

// Same card-grid convention as the Import Excel/CSV hubs (Stock/Produits/Achats) — pick a mode,
// then work within it (with a "Changer de mode" way back), instead of a tab switcher above the form.
const ENTRY_MODE_CARDS: { id: EntryMode; icon: React.ComponentType<{ size?: number; className?: string }>; title: string; description: string; accent: string }[] = [
  {
    id: 'tickets',
    icon: Receipt,
    title: 'Par tickets',
    description: 'Saisissez chaque ticket séparément : articles, service (sur place / à emporter) et règlement propres à chaque vente.',
    accent: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/40',
  },
  {
    id: 'quantities',
    icon: Package,
    title: 'Par quantités vendues',
    description: "Pratique pour une journée entière : indiquez combien de chaque produit a été vendu, puis vérifiez le total encaissé par mode de règlement.",
    accent: 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/40',
  },
];

// Whole-entry payment reconciliation for "Par tickets" — kept as local page state (not part of the
// shared ManualSalesFormState in salesEntryModel.ts, which "Import Excel/CSV" also reuses) since
// it's purely a Ajout-manuel concern: each ticket already carries its own règlement, so this is
// only a cross-check against what was actually collected, exactly like "Par quantités vendues".
interface TicketPaymentVerification {
  verifiedCash: number;
  verifiedCard: number;
  verifiedRestoTicket: number;
  note: string;
}
const createEmptyTicketPaymentVerification = (): TicketPaymentVerification => ({
  verifiedCash: 0,
  verifiedCard: 0,
  verifiedRestoTicket: 0,
  note: '',
});

const inputBaseClass =
  'w-full px-3.5 py-2 text-xs rounded-xl border bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 transition';
const inputValidClass = 'border-gray-200 dark:border-gray-700 focus:border-emerald-500 focus:ring-emerald-500';
const inputErrorClass = 'border-red-400 dark:border-red-500/70 focus:border-red-500 focus:ring-red-500';
const labelClass = 'text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 block';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer';

export const ManualSalesEntryPage: React.FC<ManualSalesEntryPageProps> = ({
  articles,
  extras,
  employees,
  shifts,
  onNavigateToDashboard,
  onNavigateToSalesList,
  onSaveTickets,
  onSaveInternalConsumption,
}) => {
  const [internalConsumptionOpen, setInternalConsumptionOpen] = useState(false);
  const catalog: SalesCatalogContext = { articles, extras, employees, shifts };
  const articleCategories = useMemo(() => getArticleCategoriesInUse(articles), [articles]);
  const [mode, setMode] = useState<EntryMode | null>(null);
  const [form, setForm] = useState<ManualSalesFormState>(() => createEmptyForm());
  const [quantityForm, setQuantityForm] = useState<QuantitySalesFormState>(() => createEmptyQuantityForm());
  const [step, setStep] = useState<Step>('form');
  const [savedMode, setSavedMode] = useState<EntryMode>('tickets');
  const [hasAttemptedVerify, setHasAttemptedVerify] = useState(false);
  const [qHasAttemptedVerify, setQHasAttemptedVerify] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [qSavedStats, setQSavedStats] = useState<{ products: number; total: number } | null>(null);
  const [expandedExtras, setExpandedExtras] = useState<Set<string>>(new Set());
  // Tickets are expanded by default (a freshly added ticket needs filling in); collapsing is
  // purely a user choice to shorten a long list, never automatic.
  const [collapsedTickets, setCollapsedTickets] = useState<Set<string>>(new Set());
  const [ticketPayment, setTicketPayment] = useState<TicketPaymentVerification>(() => createEmptyTicketPaymentVerification());

  const issues = useMemo(() => validateManualSalesForm(form), [form]);
  const issuesByKey = useMemo(() => {
    const map = new Map<string, string>();
    issues.forEach((issue) => {
      if (!map.has(issue.fieldKey)) map.set(issue.fieldKey, issue.message);
    });
    return map;
  }, [issues]);

  // Maps every issue back to the ticket it belongs to (item-level issues via the owning ticket),
  // so a collapsed ticket carrying an error can still be flagged and auto-expanded on verify.
  const errorTicketIds = useMemo(() => {
    const ids = new Set<string>();
    issues.forEach((issue) => {
      const [scope, rowId] = issue.fieldKey.split(':');
      if (scope === 'ticket') {
        ids.add(rowId);
      } else if (scope === 'item') {
        const owner = form.tickets.find((t) => t.items.some((it) => it.rowId === rowId));
        if (owner) ids.add(owner.rowId);
      }
    });
    return ids;
  }, [issues, form.tickets]);

  const showErrors = hasAttemptedVerify;
  const grandTotal = useMemo(() => computeGrandTotal(form, catalog), [form, catalog]);
  const ticketPaymentTotal = ticketPayment.verifiedCash + ticketPayment.verifiedCard + ticketPayment.verifiedRestoTicket;
  const ticketPaymentMismatch = Math.abs(grandTotal - ticketPaymentTotal) > 0.01;
  const ticketPaymentIssue =
    ticketPaymentMismatch && !ticketPayment.note.trim()
      ? `Écart entre le total encaissé (${ticketPaymentTotal.toFixed(2)} DT) et le total des ventes (${grandTotal.toFixed(2)} DT) : veuillez saisir une justification ci-dessous.`
      : null;
  const totalArticlesCount = useMemo(
    () => form.tickets.reduce((sum, t) => sum + t.items.reduce((s, it) => s + (it.articleId ? it.qty : 0), 0), 0),
    [form]
  );

  const hasAnyData =
    Boolean(form.shift) ||
    Boolean(form.employee) ||
    form.tickets.some(
      (t) => t.items.some((it) => it.articleId) || t.tableNumber.trim() || t.counterLabel !== 'Comptoir Express'
    ) ||
    ticketPayment.verifiedCash > 0 ||
    ticketPayment.verifiedCard > 0 ||
    ticketPayment.verifiedRestoTicket > 0;

  const qIssues = useMemo(() => validateQuantitySalesForm(quantityForm, articles), [quantityForm, articles]);
  const qTotals = useMemo(() => computeQuantitySalesTotals(quantityForm, catalog), [quantityForm, catalog]);
  const qHasAnyData =
    Boolean(quantityForm.shift) ||
    Boolean(quantityForm.employee) ||
    quantityForm.rows.some((r) => r.articleId) ||
    quantityForm.paidCash > 0 ||
    quantityForm.paidCard > 0 ||
    quantityForm.paidRestoTicket > 0;
  const activeHasAnyData = mode === 'quantities' ? qHasAnyData : hasAnyData;
  // A pending app update is never auto-applied while this is true (see src/pwa/updateManager.ts) —
  // an in-progress sale entry is exactly the kind of unsaved work a deploy must never discard.
  useUnsavedWorkGuard(activeHasAnyData);

  // --- Mutators (all immutable updates against the single `form` state) ---

  const updateGeneral = (patch: Partial<Pick<ManualSalesFormState, 'date' | 'shift' | 'employee'>>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const addTicket = () => {
    setForm((prev) => ({ ...prev, tickets: [...prev.tickets, createEmptyTicket()] }));
  };

  const removeTicket = (ticketId: string) => {
    setForm((prev) => ({ ...prev, tickets: prev.tickets.filter((t) => t.rowId !== ticketId) }));
    setCollapsedTickets((prev) => {
      if (!prev.has(ticketId)) return prev;
      const next = new Set(prev);
      next.delete(ticketId);
      return next;
    });
  };

  const toggleTicketCollapsed = (ticketId: string) => {
    setCollapsedTickets((prev) => {
      const next = new Set(prev);
      if (next.has(ticketId)) next.delete(ticketId);
      else next.add(ticketId);
      return next;
    });
  };

  const allTicketsCollapsed = form.tickets.length > 0 && form.tickets.every((t) => collapsedTickets.has(t.rowId));
  const toggleCollapseAll = () => {
    setCollapsedTickets(allTicketsCollapsed ? new Set() : new Set(form.tickets.map((t) => t.rowId)));
  };

  const updateTicket = (ticketId: string, patch: Partial<DraftTicket>) => {
    setForm((prev) => ({
      ...prev,
      tickets: prev.tickets.map((t) => (t.rowId === ticketId ? { ...t, ...patch } : t)),
    }));
  };

  const addItem = (ticketId: string) => {
    setForm((prev) => ({
      ...prev,
      tickets: prev.tickets.map((t) => (t.rowId === ticketId ? { ...t, items: [...t.items, createEmptyItem()] } : t)),
    }));
  };

  const removeItem = (ticketId: string, itemId: string) => {
    setForm((prev) => ({
      ...prev,
      tickets: prev.tickets.map((t) =>
        t.rowId === ticketId ? { ...t, items: t.items.filter((it) => it.rowId !== itemId) } : t
      ),
    }));
  };

  const updateItem = (ticketId: string, itemId: string, patch: Partial<DraftTicketItem>) => {
    setForm((prev) => ({
      ...prev,
      tickets: prev.tickets.map((t) => {
        if (t.rowId !== ticketId) return t;
        return {
          ...t,
          items: t.items.map((it) => {
            if (it.rowId !== itemId) return it;
            const next = { ...it, ...patch };
            if (patch.articleId !== undefined && patch.articleId !== it.articleId) {
              next.variantOptionId = '';
            }
            return next;
          }),
        };
      }),
    }));
  };

  const toggleItemExtra = (ticketId: string, itemId: string, extraId: string) => {
    setForm((prev) => ({
      ...prev,
      tickets: prev.tickets.map((t) => {
        if (t.rowId !== ticketId) return t;
        return {
          ...t,
          items: t.items.map((it) => {
            if (it.rowId !== itemId) return it;
            const has = it.extraIds.includes(extraId);
            return { ...it, extraIds: has ? it.extraIds.filter((id) => id !== extraId) : [...it.extraIds, extraId] };
          }),
        };
      }),
    }));
  };

  const toggleExtrasPanel = (itemId: string) => {
    setExpandedExtras((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  // --- Quantities-mode mutators ---

  const updateQuantityGeneral = (patch: Partial<Pick<QuantitySalesFormState, 'date' | 'shift' | 'employee'>>) => {
    setQuantityForm((prev) => ({ ...prev, ...patch }));
  };

  const setQuantityForProduct = (articleId: string, qty: number) => {
    setQuantityForm((prev) => ({ ...prev, rows: setQuantityForArticle(prev.rows, articleId, qty) }));
  };

  const updateQuantityRow = (rowId: string, patch: Partial<DraftQuantityRow>) => {
    setQuantityForm((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)),
    }));
  };

  const updateQuantityPayment = (patch: Partial<Pick<QuantitySalesFormState, 'paidCash' | 'paidCard' | 'paidRestoTicket' | 'paymentNote'>>) => {
    setQuantityForm((prev) => ({ ...prev, ...patch }));
  };

  const updateTicketPayment = (patch: Partial<TicketPaymentVerification>) => {
    setTicketPayment((prev) => ({ ...prev, ...patch }));
  };

  const handleVerify = () => {
    if (mode === 'quantities') {
      setQHasAttemptedVerify(true);
      if (qIssues.length === 0) {
        setStep('preview');
        document.getElementById('app-main-scroll-area')?.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }
    setHasAttemptedVerify(true);
    if (issues.length === 0 && !ticketPaymentIssue) {
      setStep('preview');
      document.getElementById('app-main-scroll-area')?.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (errorTicketIds.size > 0) {
      // Surface the problem instead of hiding it behind a collapsed summary.
      setCollapsedTickets((prev) => {
        const next = new Set(prev);
        errorTicketIds.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  const handleBackToForm = () => {
    setStep('form');
  };

  const handleConfirmSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      if (mode === 'quantities') {
        const newTransactions = buildSaleTransactionsFromQuantityForm(quantityForm, catalog);
        await onSaveTickets(newTransactions);
        setQSavedStats({ products: qTotals.activeProductsCount, total: qTotals.totalNet });
        setSavedMode('quantities');
      } else {
        const builtTransactions = buildSaleTransactionsFromForm(form, catalog);
        const note = ticketPayment.note.trim() || undefined;
        const newTransactions = note ? builtTransactions.map((t) => ({ ...t, note })) : builtTransactions;
        await onSaveTickets(newTransactions);
        setSavedCount(newTransactions.length);
        setSavedMode('tickets');
      }
      setStep('success');
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Une erreur est survenue lors de l'enregistrement. Veuillez réessayer."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (mode === 'quantities') {
      if (qHasAnyData && !window.confirm('Voulez-vous réinitialiser la saisie ? Toutes les données non enregistrées seront perdues.')) {
        return;
      }
      setQuantityForm(createEmptyQuantityForm());
      setQHasAttemptedVerify(false);
      return;
    }
    if (hasAnyData && !window.confirm('Voulez-vous réinitialiser la saisie ? Toutes les données non enregistrées seront perdues.')) {
      return;
    }
    setForm(createEmptyForm());
    setTicketPayment(createEmptyTicketPaymentVerification());
    setHasAttemptedVerify(false);
  };

  const handleCancel = () => {
    if (activeHasAnyData && !window.confirm('Voulez-vous quitter la saisie manuelle ? Les données non enregistrées seront perdues.')) {
      return;
    }
    onNavigateToSalesList();
  };

  const handleAddMore = () => {
    setForm(createEmptyForm());
    setQuantityForm(createEmptyQuantityForm());
    setTicketPayment(createEmptyTicketPaymentVerification());
    setHasAttemptedVerify(false);
    setQHasAttemptedVerify(false);
    setSaveError(null);
    setStep('form');
  };

  const getServiceBadgeClass = (type: ServiceType) =>
    type === 'Sur place'
      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70'
      : 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/70';

  const buildTicketSummaryLine = (ticket: DraftTicket): string => {
    const itemsLabel = ticket.items
      .filter((it) => it.articleId)
      .map((it) => {
        const article = getArticleById(it.articleId, articles);
        return article ? `${it.qty}x ${article.name}` : null;
      })
      .filter(Boolean)
      .join(', ');
    const placeLabel =
      ticket.serviceType === 'Sur place'
        ? ticket.tableNumber
          ? `Table ${ticket.tableNumber}`
          : 'Sur place'
        : ticket.counterLabel || 'À emporter';
    return `${itemsLabel || 'Aucun article'} — ${placeLabel} • ${ticket.paymentMethod}`;
  };

  const getPaymentIcon = (method: PaymentMethod) => {
    switch (method) {
      case 'Espèces':
        return <Banknote size={12} className="text-emerald-500" />;
      case 'Carte bancaire':
        return <CreditCard size={12} className="text-blue-500" />;
      case 'Ticket resto':
        return <Ticket size={12} className="text-amber-500" />;
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Page Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>Ajout manuel des ventes</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Café & Caisse
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Ajoutez les ventes qui n'ont pas été enregistrées automatiquement, ticket par ticket ou par quantités
            vendues.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setInternalConsumptionOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer"
          >
            <Users size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Ventes internes</span>
          </button>
          <button
            onClick={onNavigateToSalesList}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer"
          >
            <Receipt size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Voir les ventes</span>
          </button>
          <button
            onClick={onNavigateToDashboard}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700/80 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition active:scale-98 cursor-pointer"
          >
            <span>Tableau de bord</span>
          </button>
        </div>
      </div>

      {step === 'success' ? (
        <div className="p-8 sm:p-12 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-500">
            <CheckCircle2 size={30} />
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Ventes enregistrées avec succès</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md">
            {savedMode === 'quantities' && qSavedStats
              ? `${qSavedStats.products} produit${qSavedStats.products > 1 ? 's' : ''} pour un total de ${qSavedStats.total.toFixed(2)} DT ont été ajoutés à l'historique des ventes Café Noir.`
              : `${savedCount} ${savedCount > 1 ? 'tickets ont été ajoutés' : 'ticket a été ajouté'} à l'historique des ventes Café Noir.`}
          </p>
          <div className="flex items-center gap-2 pt-2">
            <button onClick={handleAddMore} className={secondaryButtonClass}>
              <Plus size={14} />
              <span>Ajouter d'autres ventes</span>
            </button>
            <button onClick={onNavigateToSalesList} className={primaryButtonClass}>
              <Receipt size={14} />
              <span>Voir les ventes</span>
            </button>
          </div>
        </div>
      ) : step === 'preview' && mode === 'quantities' ? (
        <QuantitySalesPreviewStep
          articles={articles}
          form={quantityForm}
          totals={qTotals}
          isSaving={isSaving}
          saveError={saveError}
          onBackToForm={handleBackToForm}
          onConfirmSave={handleConfirmSave}
        />
      ) : step === 'preview' ? (
        <>
          {/* Preview banner */}
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-start gap-3">
            <ShieldCheck size={20} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                Vérifiez les informations avant confirmation
              </p>
              <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                Aucune vente n'est encore enregistrée. Contrôlez les données ci-dessous, puis confirmez pour les
                enregistrer définitivement.
              </p>
            </div>
          </div>

          {/* General info recap */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-gray-400 font-semibold block mb-0.5">Date</span>
                <span className="font-bold text-gray-900 dark:text-white">{form.date}</span>
              </div>
              <div>
                <span className="text-gray-400 font-semibold block mb-0.5">Shift</span>
                <span className="font-bold text-gray-900 dark:text-white">{form.shift}</span>
              </div>
              <div>
                <span className="text-gray-400 font-semibold block mb-0.5">Employé</span>
                <span className="font-bold text-gray-900 dark:text-white">{form.employee}</span>
              </div>
            </div>
          </div>

          {/* Tickets recap */}
          <div className="space-y-3">
            {form.tickets.map((ticket, idx) => (
              <div
                key={ticket.rowId}
                className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Receipt size={14} className="text-emerald-500" />
                    Ticket {idx + 1}
                  </h3>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">
                    {computeTicketTotal(ticket, catalog).toFixed(2)} <span className="text-[11px] text-gray-500">DT</span>
                  </span>
                </div>

                <div className="space-y-1.5">
                  {ticket.items.filter((it) => it.articleId).map((it) => {
                    const article = getArticleById(it.articleId, articles);
                    if (!article) return null;
                    const variant = it.variantOptionId ? getVariantOption(article.category, it.variantOptionId) : undefined;
                    const itemExtraNames = it.extraIds.map((id) => getExtraById(id, extras)?.name).filter(Boolean);
                    return (
                      <div key={it.rowId} className="flex justify-between items-start text-xs border-b border-dashed border-gray-100 dark:border-gray-800 pb-1.5 last:border-0 last:pb-0">
                        <div>
                          <p className="font-semibold text-gray-800 dark:text-gray-200">
                            {it.qty}x {article.name}
                          </p>
                          {(variant || itemExtraNames.length > 0) && (
                            <p className="text-[11px] text-gray-400">
                              {[variant?.label, ...itemExtraNames].filter(Boolean).join(' • ')}
                            </p>
                          )}
                        </div>
                        <span className="font-semibold text-gray-700 dark:text-gray-300">
                          {computeItemLineTotal(it, catalog).toFixed(2)} DT
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${getServiceBadgeClass(ticket.serviceType)}`}>
                    {ticket.serviceType === 'Sur place' ? <Utensils size={10} /> : <ShoppingBag size={10} />}
                    <span>{ticket.serviceType}</span>
                  </span>
                  <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                    {ticket.serviceType === 'Sur place' ? `Table ${ticket.tableNumber}` : ticket.counterLabel}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700/80 text-[11px] font-medium text-gray-700 dark:text-gray-300">
                    {getPaymentIcon(ticket.paymentMethod)}
                    <span>{ticket.paymentMethod}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>

          {ticketPayment.note.trim() && (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 flex items-start gap-3">
              <MessageSquare size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Justification de l'écart de règlement</p>
                <p className="text-xs text-amber-700/90 dark:text-amber-400/90">{ticketPayment.note}</p>
              </div>
            </div>
          )}

          {saveError && (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 flex items-start gap-3">
              <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold text-red-700 dark:text-red-300">Échec de l'enregistrement</p>
                <p className="text-xs text-red-600/90 dark:text-red-400/90">{saveError}</p>
                <p className="text-[11px] text-red-500/80 dark:text-red-400/70 mt-1">
                  Vos données sont conservées, vous pouvez réessayer sans tout ressaisir.
                </p>
              </div>
            </div>
          )}

          {/* Preview actions */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              <span className="font-bold text-gray-900 dark:text-white">{form.tickets.length}</span> tickets •{' '}
              <span className="font-bold text-gray-900 dark:text-white">{grandTotal.toFixed(2)} DT</span> au total
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button onClick={handleBackToForm} disabled={isSaving} className={`${secondaryButtonClass} flex-1 sm:flex-none`}>
                <ArrowLeft size={14} />
                <span>Modifier les ventes</span>
              </button>
              <button onClick={handleConfirmSave} disabled={isSaving} className={`${primaryButtonClass} flex-1 sm:flex-none`}>
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                <span>{isSaving ? 'Enregistrement…' : 'Confirmer et enregistrer'}</span>
              </button>
            </div>
          </div>
        </>
      ) : mode === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ENTRY_MODE_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                onClick={() => setMode(card.id)}
                className="group text-left p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col gap-3"
              >
                <div className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${card.accent}`}>
                  <Icon size={20} />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                    {card.title}
                    <ChevronRight size={14} className="text-gray-300 dark:text-gray-600 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all" />
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{card.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <>
          {/* Current mode + switch back to the card selection */}
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#00A86B] text-white text-xs font-semibold shadow-xs">
              {mode === 'tickets' ? <Receipt size={14} /> : <Package size={14} />}
              <span>{mode === 'tickets' ? 'Par tickets' : 'Par quantités vendues'}</span>
            </span>
            <button onClick={() => setMode(null)} className={secondaryButtonClass}>
              <ArrowLeft size={14} className="text-gray-500 dark:text-gray-400" />
              <span>Changer de mode</span>
            </button>
          </div>
          {mode === 'quantities' && (
            <p className="text-[11px] text-gray-400 -mt-2">
              Pratique quand la journée ne se prête pas à une saisie détaillée : indiquez simplement combien de
              chaque produit a été vendu (la réduction et la part « à emporter » apparaissent dès qu'une quantité est
              saisie), puis vérifiez le total encaissé par mode de règlement.
            </p>
          )}

          {mode === 'quantities' ? (
            <QuantitySalesFormStep
              articles={articles}
              employees={employees}
              shifts={shifts}
              form={quantityForm}
              totals={qTotals}
              issues={qIssues}
              showErrors={qHasAttemptedVerify}
              onChangeGeneral={updateQuantityGeneral}
              onSetQty={setQuantityForProduct}
              onChangeRow={updateQuantityRow}
              onChangePayment={updateQuantityPayment}
              onReset={handleReset}
              onCancel={handleCancel}
              onVerify={handleVerify}
            />
          ) : (
            <>
          {/* Validation error summary */}
          {showErrors && issues.length > 0 && (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-red-500" />
                <p className="text-sm font-bold text-red-700 dark:text-red-300">
                  {issues.length} {issues.length > 1 ? 'erreurs à corriger' : 'erreur à corriger'}
                </p>
              </div>
              <ul className="text-xs text-red-600 dark:text-red-400 space-y-1 list-disc list-inside">
                {issues.map((issue) => (
                  <li key={issue.fieldKey}>{issue.message}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Section 1: General info */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-3.5">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <ClipboardList size={16} className="text-emerald-500" />
              Informations générales de la vente
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className={labelClass}>Date *</label>
                <div className="relative">
                  <CalendarIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => updateGeneral({ date: e.target.value })}
                    className={`${inputBaseClass} pl-8 ${showErrors && issuesByKey.has('general:date') ? inputErrorClass : inputValidClass}`}
                  />
                </div>
                {showErrors && issuesByKey.get('general:date') && (
                  <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle size={11} /> {issuesByKey.get('general:date')}
                  </p>
                )}
              </div>

              <div>
                <label className={labelClass}>Shift *</label>
                <div className="relative">
                  <select
                    value={form.shift}
                    onChange={(e) => updateGeneral({ shift: e.target.value })}
                    className={`${inputBaseClass} appearance-none pr-8 cursor-pointer ${showErrors && issuesByKey.has('general:shift') ? inputErrorClass : inputValidClass}`}
                  >
                    <option value="">Sélectionner un shift</option>
                    {shifts.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
                {showErrors && issuesByKey.get('general:shift') && (
                  <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle size={11} /> {issuesByKey.get('general:shift')}
                  </p>
                )}
              </div>

              <div>
                <label className={labelClass}>Employé *</label>
                <div className="relative">
                  <Users size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <EmployeePicker
                    value={form.employee}
                    onChange={(v) => updateGeneral({ employee: v })}
                    employees={employees}
                    className={`${inputBaseClass} appearance-none pl-8 pr-8 cursor-pointer ${showErrors && issuesByKey.has('general:employee') ? inputErrorClass : inputValidClass}`}
                  />
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
                {showErrors && issuesByKey.get('general:employee') && (
                  <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle size={11} /> {issuesByKey.get('general:employee')}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Tickets */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Receipt size={16} className="text-emerald-500" />
                Tickets
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                  {form.tickets.length}
                </span>
              </h2>
              <div className="flex items-center gap-2">
                {form.tickets.length > 1 && (
                  <button onClick={toggleCollapseAll} className={secondaryButtonClass}>
                    {allTicketsCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
                    <span>{allTicketsCollapsed ? 'Tout développer' : 'Tout réduire'}</span>
                  </button>
                )}
                <button onClick={handleReset} className={secondaryButtonClass}>
                  <RotateCcw size={14} />
                  <span>Réinitialiser</span>
                </button>
                <button onClick={addTicket} className={primaryButtonClass}>
                  <Plus size={14} />
                  <span>Ajouter un ticket</span>
                </button>
              </div>
            </div>

            {showErrors && issuesByKey.get('general:tickets') && (
              <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                <AlertCircle size={14} />
                {issuesByKey.get('general:tickets')}
              </div>
            )}

            {form.tickets.length === 0 ? (
              <div className="p-10 rounded-2xl bg-white dark:bg-[#151D2A] border border-dashed border-gray-200 dark:border-gray-700 text-center space-y-2">
                <Coffee className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600" />
                <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">Aucun ticket pour le moment</p>
                <button onClick={addTicket} className={`${primaryButtonClass} mx-auto`}>
                  <Plus size={14} />
                  <span>Ajouter un ticket</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4 max-h-[900px] overflow-y-auto custom-scrollbar pr-0.5">
                {form.tickets.map((ticket, ticketIdx) => {
                  const ticketTotal = computeTicketTotal(ticket, catalog);
                  const isCollapsed = collapsedTickets.has(ticket.rowId);
                  const hasError = showErrors && errorTicketIds.has(ticket.rowId);
                  return (
                    <div
                      key={ticket.rowId}
                      className={`p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border shadow-2xs space-y-4 ${
                        hasError ? 'border-red-300 dark:border-red-800/70' : 'border-gray-100 dark:border-gray-800'
                      }`}
                    >
                      {/* Ticket header — always visible; doubles as the collapse/expand toggle */}
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => toggleTicketCollapsed(ticket.rowId)}
                          className="flex items-center gap-2 text-left flex-1 min-w-0 cursor-pointer"
                        >
                          <span className="w-6 h-6 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-300 flex items-center justify-center text-xs font-black shrink-0">
                            {ticketIdx + 1}
                          </span>
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                              <span>Ticket {ticketIdx + 1}</span>
                              {hasError && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" title="Cette carte contient une erreur" />}
                            </h3>
                            {isCollapsed && (
                              <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate" title={buildTicketSummaryLine(ticket)}>
                                {buildTicketSummaryLine(ticket)}
                              </p>
                            )}
                          </div>
                        </button>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-bold text-gray-900 dark:text-white">
                            {ticketTotal.toFixed(2)} <span className="text-[11px] text-gray-500">DT</span>
                          </span>
                          <button
                            onClick={() => removeTicket(ticket.rowId)}
                            title="Supprimer ce ticket"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"
                          >
                            <Trash2 size={15} />
                          </button>
                          <button
                            onClick={() => toggleTicketCollapsed(ticket.rowId)}
                            title={isCollapsed ? 'Développer ce ticket' : 'Réduire ce ticket'}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition cursor-pointer"
                          >
                            {isCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                          </button>
                        </div>
                      </div>

                      {isCollapsed ? null : (
                        <>
                      {/* Articles */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                            Consommations & Articles
                          </span>
                        </div>

                        {showErrors && issuesByKey.get(`ticket:${ticket.rowId}:items`) && (
                          <p className="text-[11px] text-red-500 flex items-center gap-1">
                            <AlertCircle size={11} /> {issuesByKey.get(`ticket:${ticket.rowId}:items`)}
                          </p>
                        )}

                        <div className="space-y-2.5">
                          {ticket.items.map((item) => {
                            const article = getArticleById(item.articleId, articles);
                            const variantGroup = article ? getVariantGroupForCategory(article.category) : undefined;
                            const extrasOpen = expandedExtras.has(item.rowId);
                            const articleErrorKey = `item:${item.rowId}:article`;

                            return (
                              <div
                                key={item.rowId}
                                className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40 p-3 space-y-2"
                              >
                                <div className="flex flex-col sm:flex-row gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="relative">
                                      <select
                                        value={item.articleId}
                                        onChange={(e) => updateItem(ticket.rowId, item.rowId, { articleId: e.target.value })}
                                        className={`${inputBaseClass} appearance-none pr-8 cursor-pointer ${
                                          showErrors && issuesByKey.has(articleErrorKey) ? inputErrorClass : inputValidClass
                                        }`}
                                      >
                                        <option value="">Choisir une consommation / un article</option>
                                        {articleCategories.map((cat) => (
                                          <optgroup key={cat} label={cat}>
                                            {articles.filter((a) => a.category === cat).map((a) => (
                                              <option key={a.id} value={a.id}>
                                                {a.name} — {getArticleTtcPrice(a).toFixed(2)} DT
                                              </option>
                                            ))}
                                          </optgroup>
                                        ))}
                                      </select>
                                      <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                    </div>
                                    {showErrors && issuesByKey.get(articleErrorKey) && (
                                      <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                                        <AlertCircle size={11} /> {issuesByKey.get(articleErrorKey)}
                                      </p>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      onClick={() => updateItem(ticket.rowId, item.rowId, { qty: Math.max(1, item.qty - 1) })}
                                      className="w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer"
                                    >
                                      −
                                    </button>
                                    <input
                                      type="number"
                                      min={1}
                                      value={item.qty}
                                      onChange={(e) =>
                                        updateItem(ticket.rowId, item.rowId, { qty: Math.max(1, Number(e.target.value) || 1) })
                                      }
                                      className="w-11 text-center text-xs py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                    />
                                    <button
                                      onClick={() => updateItem(ticket.rowId, item.rowId, { qty: item.qty + 1 })}
                                      className="w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer"
                                    >
                                      +
                                    </button>

                                    <button
                                      onClick={() => removeItem(ticket.rowId, item.rowId)}
                                      title="Supprimer cet article"
                                      className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"
                                    >
                                      <X size={14} />
                                    </button>
                                  </div>
                                </div>

                                {/* Variant (only when relevant to the selected article's category) */}
                                {article && variantGroup && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 shrink-0">
                                      {variantGroup.label} :
                                    </span>
                                    <div className="relative flex-1 max-w-[220px]">
                                      <select
                                        value={item.variantOptionId}
                                        onChange={(e) => updateItem(ticket.rowId, item.rowId, { variantOptionId: e.target.value })}
                                        className={`${inputBaseClass} ${inputValidClass} appearance-none pr-8 py-1.5 cursor-pointer`}
                                      >
                                        <option value="">Standard (optionnel)</option>
                                        {variantGroup.options.map((opt) => (
                                          <option key={opt.id} value={opt.id}>
                                            {opt.label}
                                            {opt.priceDelta ? ` (+${opt.priceDelta.toFixed(2)} DT)` : ''}
                                          </option>
                                        ))}
                                      </select>
                                      <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                    </div>
                                  </div>
                                )}

                                {/* Extras */}
                                {article && (
                                  <div className="space-y-1.5">
                                    <div className="flex items-center flex-wrap gap-1.5">
                                      <button
                                        onClick={() => toggleExtrasPanel(item.rowId)}
                                        className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 inline-flex items-center gap-1 cursor-pointer"
                                      >
                                        <Plus size={11} />
                                        Extras {item.extraIds.length > 0 ? `(${item.extraIds.length})` : '(optionnel)'}
                                      </button>
                                      {item.extraIds.map((exId) => {
                                        const extra = getExtraById(exId, extras);
                                        if (!extra) return null;
                                        return (
                                          <span
                                            key={exId}
                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60"
                                          >
                                            {extra.name}
                                            <button
                                              onClick={() => toggleItemExtra(ticket.rowId, item.rowId, exId)}
                                              className="hover:text-red-600 cursor-pointer"
                                            >
                                              <X size={10} />
                                            </button>
                                          </span>
                                        );
                                      })}
                                    </div>

                                    {extrasOpen && (
                                      <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-white dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800">
                                        {extras.map((extra) => {
                                          const selected = item.extraIds.includes(extra.id);
                                          return (
                                            <button
                                              key={extra.id}
                                              onClick={() => toggleItemExtra(ticket.rowId, item.rowId, extra.id)}
                                              className={`px-2 py-1 rounded-md text-[10px] font-medium border transition cursor-pointer ${
                                                selected
                                                  ? 'bg-emerald-500 border-emerald-500 text-white'
                                                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-emerald-300'
                                              }`}
                                            >
                                              {extra.name}
                                              {extra.price > 0 ? ` +${extra.price.toFixed(2)} DT` : ''}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <button
                          onClick={() => addItem(ticket.rowId)}
                          className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Plus size={13} />
                          Ajouter un article
                        </button>
                      </div>

                      {/* Service */}
                      <div className="space-y-2 pt-1 border-t border-gray-100 dark:border-gray-800">
                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 block pt-2">Service</span>
                        <div className="flex flex-col sm:flex-row gap-2.5">
                          <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg p-0.5 bg-gray-50/50 dark:bg-gray-800/50 w-fit">
                            {(['Sur place', 'À emporter'] as ServiceType[]).map((type) => (
                              <button
                                key={type}
                                onClick={() => updateTicket(ticket.rowId, { serviceType: type })}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer inline-flex items-center gap-1.5 ${
                                  ticket.serviceType === type
                                    ? 'bg-[#00A86B] text-white shadow-xs'
                                    : 'text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'
                                }`}
                              >
                                {type === 'Sur place' ? <Utensils size={12} /> : <ShoppingBag size={12} />}
                                {type}
                              </button>
                            ))}
                          </div>

                          <div className="flex-1 max-w-xs">
                            {ticket.serviceType === 'Sur place' ? (
                              <>
                                <input
                                  type="text"
                                  value={ticket.tableNumber}
                                  onChange={(e) => updateTicket(ticket.rowId, { tableNumber: e.target.value })}
                                  placeholder="Numéro de table (ex: 04)"
                                  className={`${inputBaseClass} ${
                                    showErrors && issuesByKey.has(`ticket:${ticket.rowId}:table`) ? inputErrorClass : inputValidClass
                                  }`}
                                />
                                {showErrors && issuesByKey.get(`ticket:${ticket.rowId}:table`) && (
                                  <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                                    <AlertCircle size={11} /> {issuesByKey.get(`ticket:${ticket.rowId}:table`)}
                                  </p>
                                )}
                              </>
                            ) : (
                              <>
                                <input
                                  type="text"
                                  value={ticket.counterLabel}
                                  onChange={(e) => updateTicket(ticket.rowId, { counterLabel: e.target.value })}
                                  placeholder="Comptoir (ex: Comptoir Express)"
                                  className={`${inputBaseClass} ${
                                    showErrors && issuesByKey.has(`ticket:${ticket.rowId}:counter`) ? inputErrorClass : inputValidClass
                                  }`}
                                />
                                {showErrors && issuesByKey.get(`ticket:${ticket.rowId}:counter`) && (
                                  <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                                    <AlertCircle size={11} /> {issuesByKey.get(`ticket:${ticket.rowId}:counter`)}
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        {showErrors && issuesByKey.get(`ticket:${ticket.rowId}:service`) && (
                          <p className="text-[11px] text-red-500 flex items-center gap-1">
                            <AlertCircle size={11} /> {issuesByKey.get(`ticket:${ticket.rowId}:service`)}
                          </p>
                        )}
                      </div>

                      {/* Règlement */}
                      <div className="space-y-2 pt-1 border-t border-gray-100 dark:border-gray-800">
                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 block pt-2">Règlement</span>
                        <div className="flex flex-wrap items-center border border-gray-200 dark:border-gray-700 rounded-lg p-0.5 bg-gray-50/50 dark:bg-gray-800/50 w-fit gap-0.5">
                          {(['Espèces', 'Carte bancaire', 'Ticket resto'] as PaymentMethod[]).map((method) => (
                            <button
                              key={method}
                              onClick={() => updateTicket(ticket.rowId, { paymentMethod: method })}
                              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer inline-flex items-center gap-1.5 ${
                                ticket.paymentMethod === method
                                  ? 'bg-[#00A86B] text-white shadow-xs'
                                  : 'text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'
                              }`}
                            >
                              {getPaymentIcon(method)}
                              {method}
                            </button>
                          ))}
                        </div>
                        {showErrors && issuesByKey.get(`ticket:${ticket.rowId}:payment`) && (
                          <p className="text-[11px] text-red-500 flex items-center gap-1">
                            <AlertCircle size={11} /> {issuesByKey.get(`ticket:${ticket.rowId}:payment`)}
                          </p>
                        )}
                      </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Vérification des encaissements — same mechanism as "Par quantités vendues": a
              whole-entry cross-check against what each ticket's own règlement already sums to. */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-3">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white inline-flex items-center gap-2">
              <ShieldCheck size={15} className="text-emerald-500" />
              Vérification des encaissements
            </h2>
            <p className="text-[11px] text-gray-400">
              Indiquez le montant total réellement encaissé, par mode de règlement. Le total doit correspondre au
              montant des ventes ci-dessus.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 max-w-xl">
              <div>
                <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1.5">
                  <Banknote size={12} className="text-emerald-500" /> Espèces
                </label>
                <DecimalInput
                  min={0}
                  step={0.1}
                  value={ticketPayment.verifiedCash}
                  onChange={(e) => updateTicketPayment({ verifiedCash: Math.max(0, Number(e.target.value) || 0) })}
                  className={`${inputBaseClass} ${inputValidClass}`}
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1.5">
                  <CreditCard size={12} className="text-blue-500" /> Carte bancaire
                </label>
                <DecimalInput
                  min={0}
                  step={0.1}
                  value={ticketPayment.verifiedCard}
                  onChange={(e) => updateTicketPayment({ verifiedCard: Math.max(0, Number(e.target.value) || 0) })}
                  className={`${inputBaseClass} ${inputValidClass}`}
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1.5">
                  <Ticket size={12} className="text-amber-500" /> Tickets restaurant
                </label>
                <DecimalInput
                  min={0}
                  step={0.1}
                  value={ticketPayment.verifiedRestoTicket}
                  onChange={(e) => updateTicketPayment({ verifiedRestoTicket: Math.max(0, Number(e.target.value) || 0) })}
                  className={`${inputBaseClass} ${inputValidClass}`}
                />
              </div>
            </div>
            <div
              className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
                showErrors && ticketPaymentMismatch
                  ? 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400'
                  : ticketPaymentMismatch
                  ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
                  : 'bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400'
              }`}
            >
              {ticketPaymentMismatch ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
              <span>
                Total encaissé : <strong>{ticketPaymentTotal.toFixed(2)} DT</strong> — Total des ventes :{' '}
                <strong>{grandTotal.toFixed(2)} DT</strong>
              </span>
            </div>

            {ticketPaymentMismatch && (
              <div className="space-y-2 pt-1">
                <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 inline-flex items-center gap-1.5">
                  <MessageSquare size={12} className="text-amber-500" />
                  Justification de l'écart *
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {PAYMENT_NOTE_SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => updateTicketPayment({ note: suggestion })}
                      className={`px-2 py-1 rounded-md text-[10px] font-medium border transition cursor-pointer ${
                        ticketPayment.note === suggestion
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-emerald-300'
                      }`}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
                <textarea
                  value={ticketPayment.note}
                  onChange={(e) => updateTicketPayment({ note: e.target.value })}
                  placeholder="Expliquez l'écart entre le total encaissé et le total des ventes…"
                  rows={2}
                  className={`w-full px-3 py-2 text-xs rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 transition ${
                    showErrors && ticketPaymentIssue
                      ? 'border-red-400 dark:border-red-500/70 focus:border-red-500 focus:ring-red-500'
                      : 'border-gray-200 dark:border-gray-700 focus:border-emerald-500 focus:ring-emerald-500'
                  }`}
                />
              </div>
            )}

            {showErrors && ticketPaymentIssue && (
              <p className="text-[11px] text-red-500 flex items-center gap-1">
                <AlertCircle size={11} /> {ticketPaymentIssue}
              </p>
            )}
          </div>

          {/* Contextual stats + Verify action */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3 sticky bottom-4">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 px-3.5 py-2 rounded-xl border border-gray-100 dark:border-gray-800 w-full sm:w-auto">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
              <span>
                <strong className="text-gray-800 dark:text-gray-200 font-semibold">{form.tickets.length}</strong> tickets •{' '}
                <strong className="text-gray-800 dark:text-gray-200 font-semibold">{totalArticlesCount}</strong> articles • Total estimé{' '}
                <strong className="text-gray-800 dark:text-gray-200 font-semibold">{grandTotal.toFixed(2)} DT</strong>
              </span>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button onClick={handleCancel} className={`${secondaryButtonClass} flex-1 sm:flex-none`}>
                <span>Annuler</span>
              </button>
              <button onClick={handleVerify} className={`${primaryButtonClass} flex-1 sm:flex-none`}>
                <ShieldCheck size={14} />
                <span>Vérifier les ventes</span>
              </button>
            </div>
          </div>
            </>
          )}
        </>
      )}

      {internalConsumptionOpen && (
        <InternalConsumptionModal
          articles={articles}
          employees={employees}
          onSave={onSaveInternalConsumption}
          onClose={() => setInternalConsumptionOpen(false)}
        />
      )}
    </div>
  );
};
