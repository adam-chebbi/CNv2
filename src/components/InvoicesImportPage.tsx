import { DecimalInput } from './ui/DecimalInput';
import React, { useMemo, useRef, useState } from 'react';
import { useUnsavedWorkGuard } from '../hooks/useUnsavedWorkGuard';
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
  ChevronDown,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  Info,
  RotateCcw,
  ArrowLeft,
} from 'lucide-react';
import { Supplier, PurchaseOrder, SupplierInvoice, PURCHASE_PAYMENT_METHODS, PurchasePaymentMethod } from '../data/purchasesModel';
import {
  IMPORT_COLUMNS,
  MAX_IMPORT_FILE_SIZE_BYTES,
  ImportedInvoiceDraft,
  ImportFileError,
  parseImportFile,
  recomputeRowIssues,
  buildInvoicesFromImportRows,
  downloadImportTemplateCsv,
} from '../data/importInvoicesParser';
import { collapseValidRows, toggleInSet } from '../data/importReviewUtils';

interface InvoicesImportPageProps {
  suppliers: Supplier[];
  orders: PurchaseOrder[];
  onNavigateToDashboard: () => void;
  onNavigateToInvoices: () => void;
  onSaveInvoices: (invoices: SupplierInvoice[]) => void;
  onBack: () => void;
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

export const InvoicesImportPage: React.FC<InvoicesImportPageProps> = ({
  suppliers,
  orders,
  onNavigateToDashboard,
  onNavigateToInvoices,
  onSaveInvoices,
  onBack,
}) => {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [unknownColumns, setUnknownColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<ImportedInvoiceDraft[]>([]);
  useUnsavedWorkGuard(Boolean(file) || rows.length > 0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [collapsedRows, setCollapsedRows] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const invalidRows = useMemo(() => rows.filter((r) => r.issues.length > 0), [rows]);
  const validRows = useMemo(() => rows.filter((r) => r.issues.length === 0), [rows]);
  const totalErrors = useMemo(() => rows.reduce((sum, r) => sum + r.issues.length, 0), [rows]);
  const grandTotal = useMemo(() => rows.reduce((sum, r) => sum + (Number(r.draft.amountTTC) || 0), 0), [rows]);
  const canConfirm = rows.length > 0 && totalErrors === 0;
  const allRowsCollapsed = rows.length > 0 && rows.every((r) => collapsedRows.has(r.id));
  const toggleRowCollapsed = (id: string) => setCollapsedRows((prev) => toggleInSet(prev, id));
  const toggleCollapseAll = () => setCollapsedRows(allRowsCollapsed ? new Set() : new Set(rows.map((r) => r.id)));

  const buildRowSummaryLine = (row: ImportedInvoiceDraft): string => {
    const supplier = suppliers.find((s) => s.id === row.draft.supplierId);
    const parts: string[] = [];
    if (row.draft.invoiceNumber.trim()) parts.push(row.draft.invoiceNumber);
    if (row.draft.amountTTC.trim()) parts.push(`${row.draft.amountTTC} DT`);
    if (row.draft.paymentMethod) parts.push(row.draft.paymentMethod);
    return `${supplier?.name ?? 'Fournisseur non choisi'}${parts.length ? ` — ${parts.join(' • ')}` : ''}`;
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
      const result = await parseImportFile(candidate, suppliers, orders);
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

  const updateRow = (rowId: string, patch: Partial<ImportedInvoiceDraft['draft']>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const nextDraft = { ...r.draft, ...patch };
        const supplierHint = patch.supplierId !== undefined ? undefined : r.supplierHint;
        return { ...r, draft: nextDraft, supplierHint, issues: recomputeRowIssues({ ...r, draft: nextDraft }, suppliers) };
      })
    );
  };

  const handleConfirmSave = async () => {
    if (isSaving || !canConfirm) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const newInvoices = buildInvoicesFromImportRows(rows);
      await onSaveInvoices(newInvoices);
      setSavedCount(newInvoices.length);
      setStep('success');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Une erreur est survenue lors de l'enregistrement. Veuillez réessayer.");
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
    if ((file || rows.length > 0) && !window.confirm("Voulez-vous quitter l'import ? Les données non enregistrées seront perdues.")) return;
    resetImportState();
    onNavigateToInvoices();
  };

  const StatChip: React.FC<{ label: string; value: React.ReactNode; tone?: 'emerald' | 'red' | 'gray' }> = ({ label, value, tone = 'gray' }) => {
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>Import Excel/CSV</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Factures
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Importez plusieurs factures fournisseur en une seule fois depuis un fichier Excel ou CSV.</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer"
          >
            <ArrowLeft size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Changer de type</span>
          </button>
          <button
            onClick={onNavigateToInvoices}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer"
          >
            <Receipt size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Voir les factures</span>
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
            {savedCount} {savedCount > 1 ? 'factures ont été importées' : 'facture a été importée'} et ajoutées à la gestion des achats.
          </p>
          <div className="flex items-center gap-2 pt-2">
            <button onClick={handleStartNewImport} className={secondaryButtonClass}>
              <UploadCloud size={14} />
              <span>Importer un autre fichier</span>
            </button>
            <button onClick={onNavigateToInvoices} className={primaryButtonClass}>
              <Receipt size={14} />
              <span>Voir les factures</span>
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
                {canConfirm ? 'Vérifiez les informations avant confirmation' : `${totalErrors} erreur${totalErrors > 1 ? 's' : ''} doivent être corrigées avant l'enregistrement`}
              </p>
              <p className={`text-xs ${canConfirm ? 'text-emerald-700/80 dark:text-emerald-400/80' : 'text-amber-700/80 dark:text-amber-400/80'}`}>
                Aucune facture n'est encore enregistrée. Corrigez les lignes signalées en rouge, puis confirmez.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <StatChip label="Factures détectées" value={rows.length} />
              <StatChip label="Valides" value={validRows.length} tone="emerald" />
              <StatChip label="Invalides" value={invalidRows.length} tone={invalidRows.length ? 'red' : 'gray'} />
              <StatChip label="Total TTC" value={`${grandTotal.toFixed(2)} DT`} />
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
                  className={`p-4 sm:p-5 rounded-2xl border shadow-2xs space-y-3 ${
                    rowHasError ? 'bg-red-50/40 dark:bg-red-950/10 border-red-200 dark:border-red-800/50' : 'bg-white dark:bg-[#151D2A] border-gray-100 dark:border-gray-800'
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
                          <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate" title={buildRowSummaryLine(row)}>
                            {buildRowSummaryLine(row)}
                          </p>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold text-gray-900 dark:text-white">
                        {(Number(row.draft.amountTTC) || 0).toFixed(2)} <span className="text-[11px] text-gray-500">DT</span>
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div>
                      <label className={labelClass}>Fournisseur *</label>
                      <select
                        value={row.draft.supplierId}
                        onChange={(e) => updateRow(row.id, { supplierId: e.target.value })}
                        className={`${inputBaseClass} appearance-none cursor-pointer ${fieldsWithError.has('supplierId') ? inputErrorClass : inputValidClass}`}
                      >
                        <option value="">Sélectionner un fournisseur</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      {row.supplierHint && (
                        <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                          <AlertCircle size={11} /> Valeur importée : « {row.supplierHint} »
                        </p>
                      )}
                    </div>
                    <div>
                      <label className={labelClass}>N° Facture *</label>
                      <input
                        type="text"
                        value={row.draft.invoiceNumber}
                        onChange={(e) => updateRow(row.id, { invoiceNumber: e.target.value })}
                        className={`${inputBaseClass} ${fieldsWithError.has('invoiceNumber') ? inputErrorClass : inputValidClass}`}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Commande liée (optionnel)</label>
                      <select
                        value={row.draft.purchaseOrderId}
                        onChange={(e) => updateRow(row.id, { purchaseOrderId: e.target.value })}
                        className={`${inputBaseClass} appearance-none cursor-pointer ${inputValidClass}`}
                      >
                        <option value="">Aucune</option>
                        {orders.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.orderNumber}
                          </option>
                        ))}
                      </select>
                      {row.orderHint && (
                        <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                          <AlertCircle size={11} /> Valeur importée : « {row.orderHint} »
                        </p>
                      )}
                    </div>
                    <div>
                      <label className={labelClass}>Date facture *</label>
                      <input
                        type="date"
                        value={row.draft.invoiceDate}
                        onChange={(e) => updateRow(row.id, { invoiceDate: e.target.value })}
                        className={`${inputBaseClass} ${fieldsWithError.has('invoiceDate') ? inputErrorClass : inputValidClass}`}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Échéance *</label>
                      <input
                        type="date"
                        value={row.draft.dueDate}
                        onChange={(e) => updateRow(row.id, { dueDate: e.target.value })}
                        className={`${inputBaseClass} ${fieldsWithError.has('dueDate') ? inputErrorClass : inputValidClass}`}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Mode de paiement *</label>
                      <select
                        value={row.draft.paymentMethod}
                        onChange={(e) => updateRow(row.id, { paymentMethod: e.target.value as PurchasePaymentMethod })}
                        className={`${inputBaseClass} appearance-none cursor-pointer ${fieldsWithError.has('paymentMethod') ? inputErrorClass : inputValidClass}`}
                      >
                        <option value="">Sélectionner</option>
                        {PURCHASE_PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Montant HT *</label>
                      <DecimalInput
                        min={0}
                        step="0.001"
                        value={row.draft.amountHT}
                        onChange={(e) => updateRow(row.id, { amountHT: e.target.value })}
                        className={`${inputBaseClass} ${fieldsWithError.has('amountHT') ? inputErrorClass : inputValidClass}`}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>TVA *</label>
                      <DecimalInput
                        min={0}
                        step="0.001"
                        value={row.draft.vatAmount}
                        onChange={(e) => updateRow(row.id, { vatAmount: e.target.value })}
                        className={`${inputBaseClass} ${fieldsWithError.has('vatAmount') ? inputErrorClass : inputValidClass}`}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Montant TTC *</label>
                      <DecimalInput
                        min={0}
                        step="0.001"
                        value={row.draft.amountTTC}
                        onChange={(e) => updateRow(row.id, { amountTTC: e.target.value })}
                        className={`${inputBaseClass} ${fieldsWithError.has('amountTTC') ? inputErrorClass : inputValidClass}`}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Montant payé</label>
                      <DecimalInput
                        min={0}
                        step="0.001"
                        value={row.draft.amountPaid}
                        onChange={(e) => updateRow(row.id, { amountPaid: e.target.value })}
                        className={`${inputBaseClass} ${fieldsWithError.has('amountPaid') ? inputErrorClass : inputValidClass}`}
                      />
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
              </div>
            </div>
          )}

          <div className="p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3 sticky bottom-4">
            <div className="text-xs">
              {canConfirm ? (
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Toutes les lignes sont valides — prêt pour l'enregistrement.</span>
              ) : (
                <span className="font-semibold text-red-600 dark:text-red-400">
                  {totalErrors} erreur{totalErrors > 1 ? 's' : ''} {totalErrors > 1 ? 'doivent' : 'doit'} être corrigée{totalErrors > 1 ? 's' : ''} avant l'enregistrement.
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button onClick={handleCancel} className={`${secondaryButtonClass} flex-1 sm:flex-none`}>
                <span>Annuler</span>
              </button>
              <button onClick={handleConfirmSave} disabled={!canConfirm || isSaving} className={`${primaryButtonClass} flex-1 sm:flex-none`}>
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                <span>{isSaving ? 'Enregistrement…' : 'Confirmer et enregistrer'}</span>
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`rounded-2xl border-2 border-dashed p-10 sm:p-14 text-center transition ${
              isDragOver ? 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-[#151D2A]'
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
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileInputChange} />
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-3">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Template d'import</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Téléchargez le template pour structurer votre fichier correctement. Chaque ligne représente une facture fournisseur complète.
              </p>
              <button onClick={() => downloadImportTemplateCsv(suppliers)} className={primaryButtonClass}>
                <Download size={14} />
                <span>Télécharger le template CSV</span>
              </button>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-2">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Comment structurer votre fichier</h3>
              <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1.5">
                {IMPORT_COLUMNS.map((col) => (
                  <li key={col.key} className="flex gap-1.5">
                    <code className="shrink-0 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-[11px] font-mono text-gray-700 dark:text-gray-300">{col.key}</code>
                    <span>
                      <span className={col.required ? 'text-red-500 font-semibold' : 'text-gray-400 font-semibold'}>{col.required ? '(obligatoire)' : '(optionnel)'}</span>{' '}
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
