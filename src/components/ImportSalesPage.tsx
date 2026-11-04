import React, { useMemo, useRef, useState } from 'react';
import { useUnsavedWorkGuard } from '../hooks/useUnsavedWorkGuard';
import { EmployeePicker } from './ui/EmployeePicker';
import {
  Receipt,
  UploadCloud,
  FileSpreadsheet,
  Download,
  X,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Banknote,
  CreditCard,
  Ticket,
  Utensils,
  ShoppingBag,
  ChevronDown,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  Plus,
  Info,
  RotateCcw,
} from 'lucide-react';
import { SaleTransaction, ServiceType, PaymentMethod } from '../data/salesTransactions';
import {
  CatalogArticle,
  CatalogExtra,
  getArticleCategoriesInUse,
  getArticleById,
  getExtraById,
  getVariantGroupForCategory,
} from '../data/manualSalesCatalog';
import { DraftTicket, DraftTicketItem, SalesCatalogContext, createEmptyItem, computeTicketTotal } from '../data/salesEntryModel';
import {
  IMPORT_COLUMNS,
  MAX_IMPORT_FILE_SIZE_BYTES,
  ImportedTicketDraft,
  ImportFileError,
  parseImportFile,
  recomputeRowIssues,
  buildSaleTransactionsFromImportRows,
  downloadImportTemplateCsv,
} from '../data/importSalesParser';
import { collapseValidRows, toggleInSet } from '../data/importReviewUtils';

interface ImportSalesPageProps {
  articles: CatalogArticle[];
  extras: CatalogExtra[];
  employees: string[];
  shifts: string[];
  onNavigateToDashboard: () => void;
  onNavigateToSalesList: () => void;
  onSaveTickets: (transactions: SaleTransaction[]) => void;
  isDarkMode?: boolean;
}

type Step = 'upload' | 'preview' | 'success';

const inputBaseClass =
  'w-full px-3.5 py-2 text-xs rounded-xl border bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 transition';
const inputValidClass = 'border-gray-200 dark:border-gray-700 focus:border-emerald-500 focus:ring-emerald-500';
const inputErrorClass = 'border-red-400 dark:border-red-500/70 focus:border-red-500 focus:ring-red-500';
const labelClass = 'text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 block';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer';

export const ImportSalesPage: React.FC<ImportSalesPageProps> = ({
  articles,
  extras,
  employees,
  shifts,
  onNavigateToDashboard,
  onNavigateToSalesList,
  onSaveTickets,
}) => {
  const catalog: SalesCatalogContext = { articles, extras, employees, shifts };
  const articleCategories = useMemo(() => getArticleCategoriesInUse(articles), [articles]);
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [unknownColumns, setUnknownColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<ImportedTicketDraft[]>([]);
  useUnsavedWorkGuard(Boolean(file) || rows.length > 0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [collapsedRows, setCollapsedRows] = useState<Set<string>>(new Set());
  const [expandedExtras, setExpandedExtras] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const invalidRows = useMemo(() => rows.filter((r) => r.issues.length > 0), [rows]);
  const validRows = useMemo(() => rows.filter((r) => r.issues.length === 0), [rows]);
  const totalErrors = useMemo(() => rows.reduce((sum, r) => sum + r.issues.length, 0), [rows]);
  const totalArticles = useMemo(
    () => rows.reduce((sum, r) => sum + r.ticket.items.reduce((s, it) => s + (it.articleId ? it.qty : 0), 0), 0),
    [rows]
  );
  const grandTotal = useMemo(() => rows.reduce((sum, r) => sum + computeTicketTotal(r.ticket, catalog), 0), [rows, catalog]);
  const canConfirm = rows.length > 0 && totalErrors === 0;
  const allRowsCollapsed = rows.length > 0 && rows.every((r) => collapsedRows.has(r.id));
  const toggleRowCollapsed = (id: string) => setCollapsedRows((prev) => toggleInSet(prev, id));
  const toggleCollapseAll = () => setCollapsedRows(allRowsCollapsed ? new Set() : new Set(rows.map((r) => r.id)));

  const buildTicketSummaryLine = (row: ImportedTicketDraft): string => {
    const itemsLabel = row.ticket.items
      .filter((it) => it.articleId)
      .map((it) => {
        const article = getArticleById(it.articleId, articles);
        return article ? `${it.qty}x ${article.name}` : null;
      })
      .filter(Boolean)
      .join(', ');
    const placeLabel =
      row.ticket.serviceType === 'Sur place'
        ? row.ticket.tableNumber
          ? `Table ${row.ticket.tableNumber}`
          : 'Sur place'
        : row.ticket.counterLabel || 'À emporter';
    return `${itemsLabel || 'Aucun article'} — ${placeLabel}${row.ticket.paymentMethod ? ` • ${row.ticket.paymentMethod}` : ''}`;
  };

  const resetImportState = () => {
    setFile(null);
    setFileError(null);
    setUnknownColumns([]);
    setRows([]);
    setCollapsedRows(new Set());
  };

  const processFile = async (candidate: File) => {
    setIsParsing(true);
    setFileError(null);
    try {
      const result = await parseImportFile(candidate, catalog);
      setFile(candidate);
      setRows(result.rows);
      setUnknownColumns(result.unknownColumns);
      setCollapsedRows(collapseValidRows(result.rows, (r) => r.id, (r) => r.issues.length > 0));
      setStep('preview');
    } catch (err) {
      setFile(candidate);
      setRows([]);
      setFileError(err instanceof ImportFileError || err instanceof Error ? err.message : 'Impossible de lire ce fichier.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0];
    if (chosen) processFile(chosen);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) processFile(dropped);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleRemoveFile = () => resetImportState();
  const handleReplaceFile = () => setStep('upload');

  const updateRow = (rowId: string, updater: (row: ImportedTicketDraft) => ImportedTicketDraft) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const next = updater(r);
        return { ...next, issues: recomputeRowIssues(next) };
      })
    );
  };

  const updateRowGeneral = (rowId: string, patch: Partial<Pick<ImportedTicketDraft, 'date' | 'shift' | 'employee'>>) =>
    updateRow(rowId, (r) => ({ ...r, ...patch }));

  const updateRowTicket = (rowId: string, patch: Partial<DraftTicket>) =>
    updateRow(rowId, (r) => ({ ...r, ticket: { ...r.ticket, ...patch } }));

  const updateRowItem = (rowId: string, itemId: string, patch: Partial<DraftTicketItem>) =>
    updateRow(rowId, (r) => {
      const nextHints = { ...r.itemHints };
      if (patch.articleId !== undefined) delete nextHints[itemId];
      return {
        ...r,
        itemHints: nextHints,
        ticket: {
          ...r.ticket,
          items: r.ticket.items.map((it) => {
            if (it.rowId !== itemId) return it;
            const next = { ...it, ...patch };
            if (patch.articleId !== undefined && patch.articleId !== it.articleId) next.variantOptionId = '';
            return next;
          }),
        },
      };
    });

  const addRowItem = (rowId: string) =>
    updateRow(rowId, (r) => ({ ...r, ticket: { ...r.ticket, items: [...r.ticket.items, createEmptyItem()] } }));

  const removeRowItem = (rowId: string, itemId: string) =>
    updateRow(rowId, (r) => {
      const nextHints = { ...r.itemHints };
      delete nextHints[itemId];
      return { ...r, itemHints: nextHints, ticket: { ...r.ticket, items: r.ticket.items.filter((it) => it.rowId !== itemId) } };
    });

  const toggleRowItemExtra = (rowId: string, itemId: string, extraId: string) =>
    updateRow(rowId, (r) => {
      const nextHints = { ...r.itemHints };
      if (nextHints[itemId]) nextHints[itemId] = { ...nextHints[itemId], extras: undefined };
      return {
        ...r,
        itemHints: nextHints,
        ticket: {
          ...r.ticket,
          items: r.ticket.items.map((it) => {
            if (it.rowId !== itemId) return it;
            const has = it.extraIds.includes(extraId);
            return { ...it, extraIds: has ? it.extraIds.filter((id) => id !== extraId) : [...it.extraIds, extraId] };
          }),
        },
      };
    });

  const toggleExtrasPanel = (itemId: string) => {
    setExpandedExtras((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handleConfirmSave = async () => {
    if (isSaving || !canConfirm) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const transactions = buildSaleTransactionsFromImportRows(rows, catalog);
      await onSaveTickets(transactions);
      setSavedCount(transactions.length);
      setStep('success');
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Une erreur est survenue lors de l'enregistrement. Veuillez réessayer."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartNewImport = () => {
    resetImportState();
    setSaveError(null);
    setStep('upload');
  };

  const handleCancel = () => {
    if (
      (file || rows.length > 0) &&
      !window.confirm("Voulez-vous quitter l'import ? Les données non enregistrées seront perdues.")
    ) {
      return;
    }
    resetImportState();
    onNavigateToSalesList();
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

  const StatChip: React.FC<{ label: string; value: React.ReactNode; tone?: 'emerald' | 'red' | 'gray' }> = ({
    label,
    value,
    tone = 'gray',
  }) => {
    const toneClass =
      tone === 'emerald'
        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
        : tone === 'red'
        ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/60'
        : 'bg-gray-50 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700';
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${toneClass}`}>
        <span>{label}</span>
        <span className="font-black">{value}</span>
      </span>
    );
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Page Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>Import Excel/CSV</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Café & Caisse
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Importez plusieurs tickets en une seule fois depuis un fichier Excel ou CSV.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
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
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Import réussi</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md">
            {savedCount} {savedCount > 1 ? 'tickets ont été importés' : 'ticket a été importé'} et ajoutés à l'historique
            des ventes Café Noir.
          </p>
          <div className="flex items-center gap-2 pt-2">
            <button onClick={handleStartNewImport} className={secondaryButtonClass}>
              <UploadCloud size={14} />
              <span>Importer un autre fichier</span>
            </button>
            <button onClick={onNavigateToSalesList} className={primaryButtonClass}>
              <Receipt size={14} />
              <span>Voir les ventes</span>
            </button>
          </div>
        </div>
      ) : step === 'preview' ? (
        <>
          <div
            className={`p-4 rounded-2xl border flex items-start gap-3 ${
              canConfirm
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60'
                : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/60'
            }`}
          >
            {canConfirm ? (
              <ShieldCheck size={20} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className={`text-sm font-bold ${canConfirm ? 'text-emerald-800 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'}`}>
                {canConfirm
                  ? 'Vérifiez les informations avant confirmation'
                  : `${totalErrors} erreur${totalErrors > 1 ? 's' : ''} doivent être corrigées avant l'enregistrement`}
              </p>
              <p className={`text-xs ${canConfirm ? 'text-emerald-700/80 dark:text-emerald-400/80' : 'text-amber-700/80 dark:text-amber-400/80'}`}>
                {canConfirm
                  ? "Aucune vente n'est encore enregistrée. Contrôlez les tickets ci-dessous, puis confirmez pour les enregistrer définitivement."
                  : 'Corrigez les lignes signalées en rouge ci-dessous, ou remplacez le fichier. La confirmation reste bloquée tant qu\'une seule erreur subsiste.'}
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <StatChip label="Tickets détectés" value={rows.length} />
              <StatChip label="Valides" value={validRows.length} tone="emerald" />
              <StatChip label="Invalides" value={invalidRows.length} tone={invalidRows.length ? 'red' : 'gray'} />
              <StatChip label="Articles" value={totalArticles} />
              <StatChip label="Total estimé" value={`${grandTotal.toFixed(2)} DT`} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <FileSpreadsheet size={13} className="text-gray-400" />
                {file?.name}
              </span>
              {rows.length > 1 && (
                <button onClick={toggleCollapseAll} className={secondaryButtonClass}>
                  {allRowsCollapsed ? <ChevronsUpDown size={13} /> : <ChevronsDownUp size={13} />}
                  <span>{allRowsCollapsed ? 'Tout développer' : 'Tout réduire'}</span>
                </button>
              )}
              <button onClick={handleReplaceFile} className={secondaryButtonClass}>
                <RotateCcw size={13} />
                <span>Remplacer le fichier</span>
              </button>
            </div>
          </div>

          {unknownColumns.length > 0 && (
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/50 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
              <Info size={14} className="shrink-0" />
              <span>Colonnes ignorées (non reconnues) : {unknownColumns.join(', ')}</span>
            </div>
          )}

          <div className="space-y-3">
            {rows.map((row) => {
              const rowHasError = row.issues.length > 0;
              const fieldsWithError = new Set(row.issues.map((i) => i.field));
              const isCollapsed = collapsedRows.has(row.id);

              return (
                <div
                  key={row.id}
                  className={`p-4 sm:p-5 rounded-2xl border shadow-2xs space-y-4 ${
                    rowHasError
                      ? 'bg-red-50/40 dark:bg-red-950/10 border-red-200 dark:border-red-800/50'
                      : 'bg-white dark:bg-[#151D2A] border-gray-100 dark:border-gray-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => toggleRowCollapsed(row.id)}
                      className="flex items-center gap-2 text-left flex-1 min-w-0 cursor-pointer"
                    >
                      {rowHasError ? (
                        <AlertCircle size={15} className="text-red-500 shrink-0" />
                      ) : (
                        <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white">Ligne {row.rowNumber}</h3>
                        {isCollapsed && (
                          <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate" title={buildTicketSummaryLine(row)}>
                            {buildTicketSummaryLine(row)}
                          </p>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold text-gray-900 dark:text-white">
                        {computeTicketTotal(row.ticket, catalog).toFixed(2)} <span className="text-[11px] text-gray-500">DT</span>
                      </span>
                      <button
                        onClick={() => toggleRowCollapsed(row.id)}
                        title={isCollapsed ? 'Développer cette ligne' : 'Réduire cette ligne'}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer"
                      >
                        {isCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                      </button>
                    </div>
                  </div>

                  {!isCollapsed && (
                    <>
                  {rowHasError && (
                    <ul className="text-[11px] text-red-600 dark:text-red-400 space-y-1 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/40 rounded-lg p-2.5 list-disc list-inside">
                      {row.issues.map((issue, i) => (
                        <li key={i}>{issue.message}</li>
                      ))}
                    </ul>
                  )}

                  {/* Row-level general info */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className={labelClass}>Date *</label>
                      <input
                        type="date"
                        value={row.date}
                        onChange={(e) => updateRowGeneral(row.id, { date: e.target.value })}
                        className={`${inputBaseClass} ${fieldsWithError.has('date') ? inputErrorClass : inputValidClass}`}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Shift *</label>
                      <select
                        value={row.shift}
                        onChange={(e) => updateRowGeneral(row.id, { shift: e.target.value })}
                        className={`${inputBaseClass} appearance-none cursor-pointer ${fieldsWithError.has('shift') ? inputErrorClass : inputValidClass}`}
                      >
                        <option value="">Sélectionner un shift</option>
                        {shifts.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Employé *</label>
                      <EmployeePicker
                        value={row.employee}
                        onChange={(v) => updateRowGeneral(row.id, { employee: v })}
                        employees={employees}
                        className={`${inputBaseClass} appearance-none cursor-pointer ${fieldsWithError.has('employee') ? inputErrorClass : inputValidClass}`}
                      />
                    </div>
                  </div>

                  {/* Articles */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Consommations & Articles</span>
                    <div className="space-y-2.5">
                      {row.ticket.items.map((item) => {
                        const article = getArticleById(item.articleId, articles);
                        const variantGroup = article ? getVariantGroupForCategory(article.category) : undefined;
                        const hint = row.itemHints[item.rowId];
                        const extrasOpen = expandedExtras.has(item.rowId);

                        return (
                          <div
                            key={item.rowId}
                            className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40 p-3 space-y-2"
                          >
                            <div className="flex flex-col sm:flex-row gap-2">
                              <div className="flex-1 min-w-0">
                                <select
                                  value={item.articleId}
                                  onChange={(e) => updateRowItem(row.id, item.rowId, { articleId: e.target.value })}
                                  className={`${inputBaseClass} appearance-none cursor-pointer ${
                                    !item.articleId ? inputErrorClass : inputValidClass
                                  }`}
                                >
                                  <option value="">Choisir une consommation / un article</option>
                                  {articleCategories.map((cat) => (
                                    <optgroup key={cat} label={cat}>
                                      {articles.filter((a) => a.category === cat).map((a) => (
                                        <option key={a.id} value={a.id}>
                                          {a.name} — {a.price.toFixed(2)} DT
                                        </option>
                                      ))}
                                    </optgroup>
                                  ))}
                                </select>
                                {hint?.article && (
                                  <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                                    <AlertCircle size={11} /> Valeur importée : « {hint.article} »
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  onClick={() => updateRowItem(row.id, item.rowId, { qty: Math.max(1, item.qty - 1) })}
                                  className="w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer"
                                >
                                  −
                                </button>
                                <input
                                  type="number"
                                  min={1}
                                  value={item.qty}
                                  onChange={(e) =>
                                    updateRowItem(row.id, item.rowId, { qty: Math.max(1, Number(e.target.value) || 1) })
                                  }
                                  className="w-11 text-center text-xs py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                />
                                <button
                                  onClick={() => updateRowItem(row.id, item.rowId, { qty: item.qty + 1 })}
                                  className="w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer"
                                >
                                  +
                                </button>
                                <button
                                  onClick={() => removeRowItem(row.id, item.rowId)}
                                  title="Supprimer cet article"
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </div>

                            {article && variantGroup && (
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 shrink-0">
                                  {variantGroup.label} :
                                </span>
                                <div className="relative flex-1 max-w-[220px]">
                                  <select
                                    value={item.variantOptionId}
                                    onChange={(e) => updateRowItem(row.id, item.rowId, { variantOptionId: e.target.value })}
                                    className={`${inputBaseClass} ${inputValidClass} appearance-none py-1.5 cursor-pointer`}
                                  >
                                    <option value="">Standard (optionnel)</option>
                                    {variantGroup.options.map((opt) => (
                                      <option key={opt.id} value={opt.id}>
                                        {opt.label}
                                        {opt.priceDelta ? ` (+${opt.priceDelta.toFixed(2)} DT)` : ''}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                {hint?.variant && (
                                  <span className="text-[11px] text-red-500">Importé : « {hint.variant} »</span>
                                )}
                              </div>
                            )}

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
                                          onClick={() => toggleRowItemExtra(row.id, item.rowId, exId)}
                                          className="hover:text-red-600 cursor-pointer"
                                        >
                                          <X size={10} />
                                        </button>
                                      </span>
                                    );
                                  })}
                                  {hint?.extras && hint.extras.length > 0 && (
                                    <span className="text-[11px] text-red-500">
                                      Introuvable(s) : {hint.extras.join(', ')}
                                    </span>
                                  )}
                                </div>

                                {extrasOpen && (
                                  <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-white dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800">
                                    {extras.map((extra) => {
                                      const selected = item.extraIds.includes(extra.id);
                                      return (
                                        <button
                                          key={extra.id}
                                          onClick={() => toggleRowItemExtra(row.id, item.rowId, extra.id)}
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
                      onClick={() => addRowItem(row.id)}
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
                            onClick={() => updateRowTicket(row.id, { serviceType: type })}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer inline-flex items-center gap-1.5 ${
                              row.ticket.serviceType === type
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
                        {row.ticket.serviceType === 'Sur place' ? (
                          <input
                            type="text"
                            value={row.ticket.tableNumber}
                            onChange={(e) => updateRowTicket(row.id, { tableNumber: e.target.value })}
                            placeholder="Numéro de table (ex: 04)"
                            className={`${inputBaseClass} ${fieldsWithError.has('table') ? inputErrorClass : inputValidClass}`}
                          />
                        ) : (
                          <input
                            type="text"
                            value={row.ticket.counterLabel}
                            onChange={(e) => updateRowTicket(row.id, { counterLabel: e.target.value })}
                            placeholder="Comptoir (ex: Comptoir Express)"
                            className={`${inputBaseClass} ${fieldsWithError.has('comptoir') ? inputErrorClass : inputValidClass}`}
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Règlement */}
                  <div className="space-y-2 pt-1 border-t border-gray-100 dark:border-gray-800">
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 block pt-2">Règlement</span>
                    <div className="flex flex-wrap items-center border border-gray-200 dark:border-gray-700 rounded-lg p-0.5 bg-gray-50/50 dark:bg-gray-800/50 w-fit gap-0.5">
                      {(['Espèces', 'Carte bancaire', 'Ticket resto'] as PaymentMethod[]).map((method) => (
                        <button
                          key={method}
                          onClick={() => updateRowTicket(row.id, { paymentMethod: method })}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer inline-flex items-center gap-1.5 ${
                            row.ticket.paymentMethod === method
                              ? 'bg-[#00A86B] text-white shadow-xs'
                              : 'text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'
                          }`}
                        >
                          {getPaymentIcon(method)}
                          {method}
                        </button>
                      ))}
                    </div>
                  </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {saveError && (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 flex items-start gap-3">
              <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold text-red-700 dark:text-red-300">Échec de l'enregistrement</p>
                <p className="text-xs text-red-600/90 dark:text-red-400/90">{saveError}</p>
                <p className="text-[11px] text-red-500/80 dark:text-red-400/70 mt-1">
                  Vos données restent disponibles, vous pouvez réessayer sans réimporter le fichier.
                </p>
              </div>
            </div>
          )}

          <div className="p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3 sticky bottom-4">
            <div className="text-xs">
              {canConfirm ? (
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  Toutes les lignes sont valides — prêt pour l'enregistrement.
                </span>
              ) : (
                <span className="font-semibold text-red-600 dark:text-red-400">
                  {totalErrors} erreur{totalErrors > 1 ? 's' : ''} {totalErrors > 1 ? 'doivent' : 'doit'} être corrigée
                  {totalErrors > 1 ? 's' : ''} avant l'enregistrement.
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button onClick={handleCancel} className={`${secondaryButtonClass} flex-1 sm:flex-none`}>
                <span>Annuler</span>
              </button>
              <button
                onClick={handleConfirmSave}
                disabled={!canConfirm || isSaving}
                className={`${primaryButtonClass} flex-1 sm:flex-none`}
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                <span>{isSaving ? 'Enregistrement…' : 'Confirmer et enregistrer'}</span>
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Upload zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`rounded-2xl border-2 border-dashed p-10 sm:p-14 text-center transition ${
              isDragOver
                ? 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-[#151D2A]'
            }`}
          >
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-500 mx-auto mb-3">
              <UploadCloud size={26} />
            </div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">Glissez-déposez votre fichier Excel ou CSV ici</p>
            <p className="text-xs text-gray-400 my-2">ou</p>
            <button onClick={() => fileInputRef.current?.click()} className={`${primaryButtonClass} mx-auto`}>
              <FileSpreadsheet size={14} />
              <span>Cliquer pour sélectionner un fichier</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFileInputChange}
            />
            <p className="text-[11px] text-gray-400 mt-4">
              Formats acceptés : .xlsx, .xls, .csv — Taille max {(MAX_IMPORT_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)} Mo
            </p>

            {isParsing && (
              <div className="mt-4 inline-flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <Loader2 size={14} className="animate-spin" /> Lecture du fichier…
              </div>
            )}

            {file && !isParsing && (
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 text-xs">
                <FileSpreadsheet size={13} className="text-gray-400" />
                <span className="font-medium text-gray-700 dark:text-gray-200">{file.name}</span>
                <span className="text-gray-400">({(file.size / 1024).toFixed(0)} Ko)</span>
                <button onClick={handleRemoveFile} className="text-gray-400 hover:text-red-600 cursor-pointer">
                  <X size={13} />
                </button>
              </div>
            )}
          </div>

          {fileError && (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 flex items-start gap-3">
              <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-700 dark:text-red-300">Le fichier n'a pas pu être importé</p>
                <p className="text-xs text-red-600/90 dark:text-red-400/90">{fileError}</p>
              </div>
            </div>
          )}

          {/* Template + documentation */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-3">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Template d'import</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Téléchargez le template pour structurer votre fichier correctement. Chaque ligne du fichier représente
                un ticket complet, exactement comme dans « Ajout manuel des ventes ».
              </p>
              <button onClick={() => downloadImportTemplateCsv(catalog)} className={primaryButtonClass}>
                <Download size={14} />
                <span>Télécharger le template CSV</span>
              </button>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-2">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Comment structurer votre fichier</h3>
              <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1.5">
                {IMPORT_COLUMNS.map((col) => (
                  <li key={col.key} className="flex gap-1.5">
                    <code className="shrink-0 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-[11px] font-mono text-gray-700 dark:text-gray-300">
                      {col.key}
                    </code>
                    <span>
                      <span className={col.required ? 'text-red-500 font-semibold' : 'text-gray-400 font-semibold'}>
                        {col.required ? '(obligatoire)' : '(optionnel)'}
                      </span>{' '}
                      {col.description}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
