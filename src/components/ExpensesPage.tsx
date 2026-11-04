import { DecimalInput } from './ui/DecimalInput';
import React, { useMemo, useRef, useState } from 'react';
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
  XCircle,
  Plus,
  Tag,
  LayoutGrid,
  Eye,
  Pencil,
  Trash2,
  X,
  AlertCircle,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  Paperclip,
  FileText,
  ImagePlus,
} from 'lucide-react';
import {
  Expense,
  ExpenseCategory,
  ExpenseAttachment,
  ExpenseNature,
  ExpenseRecurrence,
  ExpensePaymentMethod,
  ExpenseStatus,
  EXPENSE_NATURES,
  EXPENSE_RECURRENCES,
  EXPENSE_PAYMENT_METHODS,
  EXPENSE_STATUSES,
  DraftExpense,
  createEmptyDraftExpense,
  createDraftFromExpense,
  validateDraftExpense,
  buildExpenseFromDraft,
} from '../data/expensesModel';

interface ExpensesPageProps {
  expenses: Expense[];
  categories: ExpenseCategory[];
  onNavigateToDashboard: () => void;
  onNavigateToCategories: () => void;
  onCreateExpense: (expense: Expense) => void;
  onUpdateExpense: (expense: Expense) => void;
  onDeleteExpense: (expenseId: string) => void;
  onUpdateExpenseStatus: (expenseId: string, status: ExpenseStatus) => void;
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

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB

const STATUS_STYLES: Record<ExpenseStatus, string> = {
  'En attente': 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/70',
  Approuvé: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70',
  Rejeté: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/70',
};

const formatAmount = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DT`;
const formatDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

export const ExpensesPage: React.FC<ExpensesPageProps> = ({
  expenses,
  categories,
  onNavigateToDashboard,
  onNavigateToCategories,
  onCreateExpense,
  onUpdateExpense,
  onDeleteExpense,
  onUpdateExpenseStatus,
}) => {
  // --- Create / edit modal ---
  const [formOpen, setFormOpen] = useState<FormMode | null>(null);
  const [step, setStep] = useState<Step>('form');
  const [draft, setDraft] = useState<DraftExpense>(createEmptyDraftExpense());
  const [hasAttemptedVerify, setHasAttemptedVerify] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [viewingExpense, setViewingExpense] = useState<Expense | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);

  // --- Category panel (left column) ---
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');

  // --- Toolbar filters ---
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | ExpenseStatus>('all');
  const [filterNature, setFilterNature] = useState<'all' | ExpenseNature>('all');
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<'all' | ExpensePaymentMethod>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 8;

  const updateDraft = (patch: Partial<DraftExpense>) => setDraft((prev) => ({ ...prev, ...patch }));

  const issues = useMemo(() => validateDraftExpense(draft, categories), [draft, categories]);
  const issuesByField = new Map(issues.map((i) => [i.field, i.message]));
  const showErrors = hasAttemptedVerify;

  // --- Attachment upload (photo or PDF, stored as data URL like the product image uploads) ---
  const handleAttachmentSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAttachmentError(null);
    const isAllowed = file.type.startsWith('image/') || file.type === 'application/pdf';
    if (!isAllowed) {
      setAttachmentError('Format non pris en charge — seuls les fichiers image ou PDF sont acceptés.');
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAttachmentError('Fichier trop volumineux (5 Mo maximum).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const attachment: ExpenseAttachment = { name: file.name, mimeType: file.type, dataUrl: String(reader.result) };
      updateDraft({ attachment });
    };
    reader.readAsDataURL(file);
  };
  const handleRemoveAttachment = () => updateDraft({ attachment: null });

  // --- Create / edit workflow (opens as a responsive modal dialog) ---
  const handleOpenCreate = () => {
    setFormOpen('create');
    setDraft(createEmptyDraftExpense());
    setStep('form');
    setHasAttemptedVerify(false);
    setSaveError(null);
    setAttachmentError(null);
  };

  const handleOpenEdit = (expense: Expense) => {
    setFormOpen('edit');
    setDraft(createDraftFromExpense(expense));
    setStep('form');
    setHasAttemptedVerify(false);
    setSaveError(null);
    setAttachmentError(null);
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
      const expense = buildExpenseFromDraft(draft);
      if (formOpen === 'create') onCreateExpense(expense);
      else onUpdateExpense(expense);
      setStep('success');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Une erreur est survenue lors de l'enregistrement. Veuillez réessayer.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartNew = () => {
    setDraft(createEmptyDraftExpense());
    setHasAttemptedVerify(false);
    setSaveError(null);
    setStep('form');
    setFormOpen('create');
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    onDeleteExpense(deleteTarget.id);
    setDeleteTarget(null);
  };

  const categoryName = (categoryId: string) => categories.find((c) => c.id === categoryId)?.name ?? '—';

  // --- Category panel counts (independent of the toolbar filters, so the left panel always
  // reflects the full picture — only the selection itself narrows the right-hand table) ---
  const categoryStats = useMemo(
    () =>
      categories.map((cat) => {
        const catExpenses = expenses.filter((e) => e.categoryId === cat.id);
        return { category: cat, count: catExpenses.length, amount: catExpenses.reduce((sum, e) => sum + e.amount, 0) };
      }),
    [categories, expenses]
  );
  const allCount = expenses.length;
  const allAmount = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses]);

  // --- List / filters (category panel selection + toolbar) ---
  const filteredExpenses = useMemo(() => {
    return expenses.filter((exp) => {
      if (selectedCategoryId !== 'all' && exp.categoryId !== selectedCategoryId) return false;
      if (filterStatus !== 'all' && exp.status !== filterStatus) return false;
      if (filterNature !== 'all' && exp.nature !== filterNature) return false;
      if (filterPaymentMethod !== 'all' && exp.paymentMethod !== filterPaymentMethod) return false;
      if (dateFrom && exp.date < dateFrom) return false;
      if (dateTo && exp.date > dateTo) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const cat = categoryName(exp.categoryId).toLowerCase();
        if (!exp.title.toLowerCase().includes(q) && !cat.includes(q) && !(exp.comment ?? '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [expenses, categories, selectedCategoryId, filterStatus, filterNature, filterPaymentMethod, dateFrom, dateTo, searchQuery]);

  const sortedExpenses = useMemo(() => [...filteredExpenses].sort((a, b) => (a.date < b.date ? 1 : -1)), [filteredExpenses]);

  const totalPages = Math.max(1, Math.ceil(sortedExpenses.length / rowsPerPage));
  const paginatedExpenses = useMemo(
    () => sortedExpenses.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage),
    [sortedExpenses, currentPage]
  );

  const handleSelectCategory = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setFilterStatus('all');
    setFilterNature('all');
    setFilterPaymentMethod('all');
    setDateFrom('');
    setDateTo('');
    setSelectedCategoryId('all');
    setCurrentPage(1);
  };

  // KPIs — computed from the full expense list (not the current filter), matching how KPI
  // cards behave elsewhere in the app (a stable, top-of-page summary).
  const totalAmount = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses]);
  const pending = useMemo(() => expenses.filter((e) => e.status === 'En attente'), [expenses]);
  const approved = useMemo(() => expenses.filter((e) => e.status === 'Approuvé'), [expenses]);
  const rejected = useMemo(() => expenses.filter((e) => e.status === 'Rejeté'), [expenses]);
  const pendingAmount = useMemo(() => pending.reduce((sum, e) => sum + e.amount, 0), [pending]);
  const approvedAmount = useMemo(() => approved.reduce((sum, e) => sum + e.amount, 0), [approved]);
  const rejectedAmount = useMemo(() => rejected.reduce((sum, e) => sum + e.amount, 0), [rejected]);

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>Dépenses</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Achat et dépenses
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Enregistrement, suivi et validation des dépenses.</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button onClick={onNavigateToCategories} className={secondaryButtonClass}>
            <Tag size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Catégories</span>
          </button>
          <button onClick={handleOpenCreate} className={primaryButtonClass}>
            <Plus size={14} />
            <span>Enregistrer une dépense</span>
          </button>
          <button
            onClick={onNavigateToDashboard}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700/80 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition active:scale-98 cursor-pointer"
          >
            <span>Tableau de bord</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Total des dépenses</span>
            <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">{formatAmount(totalAmount)}</span>
            <p className="text-[11px] text-gray-400">{expenses.length} dépense{expenses.length > 1 ? 's' : ''} au total</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 flex items-center justify-center text-blue-500 shrink-0">
            <Wallet size={22} />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Dépenses en attente</span>
            <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">{formatAmount(pendingAmount)}</span>
            <p className="text-[11px] text-gray-400">{pending.length} dépense{pending.length > 1 ? 's' : ''} à valider</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 flex items-center justify-center text-amber-500 shrink-0">
            <Clock size={22} />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Dépenses approuvées</span>
            <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">{formatAmount(approvedAmount)}</span>
            <p className="text-[11px] text-gray-400">{approved.length} dépense{approved.length > 1 ? 's' : ''} validée{approved.length > 1 ? 's' : ''}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-500 shrink-0">
            <CheckCircle size={22} />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Dépenses rejetées</span>
            <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">{formatAmount(rejectedAmount)}</span>
            <p className="text-[11px] text-gray-400">{rejected.length} dépense{rejected.length > 1 ? 's' : ''} rejetée{rejected.length > 1 ? 's' : ''}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-red-50/80 dark:bg-red-950/40 flex items-center justify-center text-red-500 shrink-0">
            <XCircle size={22} />
          </div>
        </div>
      </div>

      {/* Toolbar: search, filters, date range, reset */}
      <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2.5 flex-1">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                placeholder="Titre, catégorie, commentaire..."
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value as 'all' | ExpenseStatus); setCurrentPage(1); }} className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer">
              <option value="all">Tous les statuts</option>
              {EXPENSE_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
            <select value={filterNature} onChange={(e) => { setFilterNature(e.target.value as 'all' | ExpenseNature); setCurrentPage(1); }} className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer">
              <option value="all">Fixe & variable</option>
              {EXPENSE_NATURES.map((n) => (<option key={n} value={n}>{n}</option>))}
            </select>
            <select value={filterPaymentMethod} onChange={(e) => { setFilterPaymentMethod(e.target.value as 'all' | ExpensePaymentMethod); setCurrentPage(1); }} className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer">
              <option value="all">Tous les modes de paiement</option>
              {EXPENSE_PAYMENT_METHODS.map((p) => (<option key={p} value={p}>{p}</option>))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }} title="Du" className="w-full px-2.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }} title="Au" className="w-full px-2.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
            </div>
          </div>
          <button onClick={handleResetFilters} className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 shadow-2xs transition active:scale-98 shrink-0 cursor-pointer">
            <FilterX size={14} className="text-gray-500" />
            <span>Réinitialiser</span>
          </button>
        </div>
      </div>

      {/* Two-column layout: ~30% categories / ~70% expenses */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-4 sm:gap-5 items-start">
        {/* Left: Catégories panel */}
        <div className="lg:col-span-3 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs overflow-hidden">
          <div className="p-3.5 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
            <LayoutGrid size={14} className="text-gray-400" />
            <h2 className="text-xs font-bold text-gray-900 dark:text-white">Catégories</h2>
          </div>
          <div className="p-2 space-y-1 max-h-[520px] overflow-y-auto custom-scrollbar">
            <button
              onClick={() => handleSelectCategory('all')}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                selectedCategoryId === 'all'
                  ? 'bg-[#00A86B] text-white shadow-xs'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/70'
              }`}
            >
              <span>Toutes les catégories</span>
              <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${selectedCategoryId === 'all' ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                {allCount}
              </span>
            </button>
            {categoryStats.map(({ category, count, amount }) => (
              <button
                key={category.id}
                onClick={() => handleSelectCategory(category.id)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  selectedCategoryId === category.id
                    ? 'bg-[#00A86B] text-white shadow-xs'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/70'
                }`}
              >
                <span className="truncate text-left">{category.name}</span>
                <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${selectedCategoryId === category.id ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                  {count}
                </span>
              </button>
            ))}
          </div>
          {selectedCategoryId !== 'all' && (
            <div className="p-3.5 border-t border-gray-100 dark:border-gray-800 text-[11px] text-gray-500 dark:text-gray-400">
              <span className="font-semibold text-gray-700 dark:text-gray-300">{formatAmount(categoryStats.find((c) => c.category.id === selectedCategoryId)?.amount ?? 0)}</span> pour cette catégorie
            </div>
          )}
        </div>

        {/* Right: Expenses table */}
        <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 text-[11px] font-bold text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-gray-800/30">
                  <th className="py-3.5 px-4">Titre / Description</th>
                  <th className="py-3.5 px-4">Catégorie</th>
                  <th className="py-3.5 px-4 text-right">Montant</th>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Paiement</th>
                  <th className="py-3.5 px-4 text-center">Statut</th>
                  <th className="py-3.5 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 text-xs">
                {paginatedExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400">
                      <div className="max-w-sm mx-auto space-y-2">
                        <Receipt className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600" />
                        <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">Aucune dépense ne correspond à ces filtres</p>
                        <button onClick={handleResetFilters} className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer">
                          Réinitialiser les filtres
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedExpenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white max-w-[220px]">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{exp.title}</span>
                          {exp.attachment && <Paperclip size={11} className="text-gray-400 shrink-0" />}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-600 dark:text-gray-300">{categoryName(exp.categoryId)}</td>
                      <td className="py-3 px-4 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">{formatAmount(exp.amount)}</td>
                      <td className="py-3 px-4 text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatDate(exp.date)}</td>
                      <td className="py-3 px-4 text-gray-600 dark:text-gray-300 whitespace-nowrap">{exp.paymentMethod}</td>
                      <td className="py-3 px-4 text-center">
                        <div className="relative inline-block">
                          <select
                            value={exp.status}
                            onChange={(e) => onUpdateExpenseStatus(exp.id, e.target.value as ExpenseStatus)}
                            className={`appearance-none pl-2.5 pr-6 py-1 rounded-md text-[11px] font-semibold border cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500 ${STATUS_STYLES[exp.status]}`}
                          >
                            {EXPENSE_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
                          </select>
                          <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setViewingExpense(exp)} title="Consulter" className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer"><Eye size={14} /></button>
                          <button onClick={() => handleOpenEdit(exp)} title="Modifier" className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer"><Pencil size={14} /></button>
                          <button onClick={() => setDeleteTarget(exp)} title="Supprimer" className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span>sur un total de {sortedExpenses.length} dépense{sortedExpenses.length > 1 ? 's' : ''}</span>
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
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{formOpen === 'create' ? 'Dépense enregistrée' : 'Dépense modifiée'}</h2>
                <div className="flex items-center gap-2 pt-2 flex-wrap justify-center">
                  <button onClick={handleStartNew} className={secondaryButtonClass}>
                    <Plus size={14} />
                    <span>Enregistrer une autre dépense</span>
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
                  <div className="flex justify-between gap-3"><span className="text-gray-500 shrink-0">Titre :</span><span className="font-bold text-gray-900 dark:text-white text-right">{draft.title.trim()}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Montant :</span><span className="font-bold text-gray-900 dark:text-white">{formatAmount(Number(draft.amount || 0))}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Date :</span><span className="font-bold text-gray-900 dark:text-white">{formatDate(draft.date)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Catégorie :</span><span className="font-bold text-gray-900 dark:text-white">{categoryName(draft.categoryId)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Nature :</span><span className="font-bold text-gray-900 dark:text-white">{draft.nature}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Récurrence :</span><span className="font-bold text-gray-900 dark:text-white">{draft.recurrence}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Mode de paiement :</span><span className="font-bold text-gray-900 dark:text-white">{draft.paymentMethod}</span></div>
                  {draft.comment && <div className="flex justify-between gap-3"><span className="text-gray-500 shrink-0">Commentaire :</span><span className="text-gray-700 dark:text-gray-300 text-right">{draft.comment}</span></div>}
                  <div className="flex justify-between"><span className="text-gray-500">Justificatif :</span><span className="font-bold text-gray-900 dark:text-white">{draft.attachment ? draft.attachment.name : 'Aucun'}</span></div>
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
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">{formOpen === 'create' ? 'Nouvelle dépense' : 'Modifier la dépense'}</h2>
                  <button onClick={handleCloseForm} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Titre / Objet *</label>
                    <input
                      type="text"
                      value={draft.title}
                      onChange={(e) => updateDraft({ title: e.target.value })}
                      placeholder="Ex. Facture STEG - Août 2026"
                      className={`${inputBaseClass} ${showErrors && issuesByField.has('title') ? inputErrorClass : inputValidClass}`}
                    />
                    {showErrors && issuesByField.get('title') && (
                      <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('title')}</p>
                    )}
                  </div>

                  <div>
                    <label className={labelClass}>Montant (DT) *</label>
                    <DecimalInput
                      min={0}
                      step="any"
                      value={draft.amount}
                      onChange={(e) => updateDraft({ amount: e.target.value })}
                      className={`${inputBaseClass} ${showErrors && issuesByField.has('amount') ? inputErrorClass : inputValidClass}`}
                    />
                    {showErrors && issuesByField.get('amount') && (
                      <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('amount')}</p>
                    )}
                  </div>

                  <div>
                    <label className={labelClass}>Date *</label>
                    <input
                      type="date"
                      value={draft.date}
                      onChange={(e) => updateDraft({ date: e.target.value })}
                      className={`${inputBaseClass} ${showErrors && issuesByField.has('date') ? inputErrorClass : inputValidClass}`}
                    />
                    {showErrors && issuesByField.get('date') && (
                      <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('date')}</p>
                    )}
                  </div>

                  <div>
                    <label className={labelClass}>Catégorie *</label>
                    <div className="relative">
                      <select
                        value={draft.categoryId}
                        onChange={(e) => updateDraft({ categoryId: e.target.value })}
                        className={`${inputBaseClass} appearance-none pr-8 cursor-pointer ${showErrors && issuesByField.has('categoryId') ? inputErrorClass : inputValidClass}`}
                      >
                        <option value="">Sélectionner une catégorie</option>
                        {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                      </select>
                      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                    {showErrors && issuesByField.get('categoryId') && (
                      <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('categoryId')}</p>
                    )}
                  </div>

                  <div>
                    <label className={labelClass}>Récurrence *</label>
                    <div className="relative">
                      <select
                        value={draft.recurrence}
                        onChange={(e) => updateDraft({ recurrence: e.target.value as ExpenseRecurrence })}
                        className={`${inputBaseClass} appearance-none pr-8 cursor-pointer ${inputValidClass}`}
                      >
                        {EXPENSE_RECURRENCES.map((r) => (<option key={r} value={r}>{r}</option>))}
                      </select>
                      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className={labelClass}>Mode de paiement *</label>
                    <div className="relative">
                      <select
                        value={draft.paymentMethod}
                        onChange={(e) => updateDraft({ paymentMethod: e.target.value as ExpensePaymentMethod })}
                        className={`${inputBaseClass} appearance-none pr-8 cursor-pointer ${showErrors && issuesByField.has('paymentMethod') ? inputErrorClass : inputValidClass}`}
                      >
                        <option value="">Sélectionner un mode de paiement</option>
                        {EXPENSE_PAYMENT_METHODS.map((p) => (<option key={p} value={p}>{p}</option>))}
                      </select>
                      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                    {showErrors && issuesByField.get('paymentMethod') && (
                      <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('paymentMethod')}</p>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <label className={labelClass}>Commentaire</label>
                    <textarea
                      value={draft.comment}
                      onChange={(e) => updateDraft({ comment: e.target.value })}
                      rows={2}
                      placeholder="Optionnel"
                      className={`${inputBaseClass} ${inputValidClass} resize-none`}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className={labelClass}>Justificatif (photo ou PDF)</label>
                    {draft.attachment ? (
                      <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                        {draft.attachment.mimeType.startsWith('image/') ? (
                          <img src={draft.attachment.dataUrl} alt="Justificatif" className="w-12 h-12 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-red-50 dark:bg-red-950/40 flex items-center justify-center text-red-500 shrink-0">
                            <FileText size={20} />
                          </div>
                        )}
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate flex-1">{draft.attachment.name}</span>
                        <button onClick={handleRemoveAttachment} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"><X size={14} /></button>
                      </div>
                    ) : (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-gray-400 hover:border-emerald-400 hover:text-emerald-500 transition cursor-pointer text-xs font-semibold"
                      >
                        <Paperclip size={15} />
                        <span>Ajouter un justificatif (image ou PDF)</span>
                      </button>
                    )}
                    <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleAttachmentSelect} />
                    {attachmentError && (
                      <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {attachmentError}</p>
                    )}
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

      {/* View expense modal */}
      {viewingExpense && (
        <ExpenseDetailModal
          expense={viewingExpense}
          categoryName={categoryName(viewingExpense.categoryId)}
          onClose={() => setViewingExpense(null)}
          onUpdateStatus={(status) => {
            onUpdateExpenseStatus(viewingExpense.id, status);
            setViewingExpense({ ...viewingExpense, status });
          }}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2"><AlertCircle size={16} className="text-red-500" /> Supprimer cette dépense</h3>
              <button onClick={() => setDeleteTarget(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
            </div>
            <div className="p-5 text-xs text-gray-600 dark:text-gray-300 space-y-2">
              <p>
                Voulez-vous vraiment supprimer <strong className="text-gray-900 dark:text-white">{deleteTarget.title}</strong> (
                {formatAmount(deleteTarget.amount)}) du <strong className="text-gray-900 dark:text-white">{formatDate(deleteTarget.date)}</strong> ? Cette action est
                irréversible.
              </p>
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

const ExpenseDetailModal: React.FC<{
  expense: Expense;
  categoryName: string;
  onClose: () => void;
  onUpdateStatus: (status: ExpenseStatus) => void;
}> = ({ expense, categoryName, onClose, onUpdateStatus }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto custom-scrollbar rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-200 dark:border-gray-700 shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between sticky top-0 bg-white dark:bg-[#151D2A] z-10">
          <h3 className="font-bold text-sm text-gray-900 dark:text-white">{expense.title}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4 text-xs">
          <div>
            <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Statut</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {EXPENSE_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => onUpdateStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                    expense.status === s ? STATUS_STYLES[s] + ' ring-1 ring-inset ring-current' : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 grid grid-cols-2 gap-3">
            <div><span className="text-gray-400 font-semibold block mb-0.5">Montant</span><span className="font-bold text-gray-900 dark:text-white">{formatAmount(expense.amount)}</span></div>
            <div><span className="text-gray-400 font-semibold block mb-0.5">Date</span><span className="font-bold text-gray-900 dark:text-white">{formatDate(expense.date)}</span></div>
            <div><span className="text-gray-400 font-semibold block mb-0.5">Catégorie</span><span className="font-bold text-gray-900 dark:text-white">{categoryName}</span></div>
            <div><span className="text-gray-400 font-semibold block mb-0.5">Nature</span><span className="font-bold text-gray-900 dark:text-white">{expense.nature}</span></div>
            <div><span className="text-gray-400 font-semibold block mb-0.5">Récurrence</span><span className="font-bold text-gray-900 dark:text-white">{expense.recurrence}</span></div>
            <div><span className="text-gray-400 font-semibold block mb-0.5">Mode de paiement</span><span className="font-bold text-gray-900 dark:text-white">{expense.paymentMethod}</span></div>
          </div>

          {expense.comment && (
            <div>
              <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Commentaire</p>
              <p className="text-gray-600 dark:text-gray-300">{expense.comment}</p>
            </div>
          )}

          <div>
            <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Justificatif</p>
            {expense.attachment ? (
              expense.attachment.mimeType.startsWith('image/') ? (
                <a href={expense.attachment.dataUrl} target="_blank" rel="noreferrer">
                  <img src={expense.attachment.dataUrl} alt="Justificatif" className="w-full max-h-64 object-contain rounded-xl border border-gray-100 dark:border-gray-800" />
                </a>
              ) : (
                <a
                  href={expense.attachment.dataUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 text-emerald-600 dark:text-emerald-400 font-semibold hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                >
                  <FileText size={16} />
                  <span>{expense.attachment.name}</span>
                </a>
              )
            ) : (
              <p className="text-gray-400 flex items-center gap-1.5"><ImagePlus size={14} /> Aucun justificatif joint.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
