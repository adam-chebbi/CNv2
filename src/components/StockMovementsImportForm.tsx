import { DecimalInput } from './ui/DecimalInput';
import { EmployeePicker } from './ui/EmployeePicker';
import React, { useMemo, useRef, useState } from 'react';
import { useUnsavedWorkGuard } from '../hooks/useUnsavedWorkGuard';
import {
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
  History,
} from 'lucide-react';
import { StockProduct, StockUnit, StockLot, StockLedgerEntry, STOCK_CATEGORIES, STOCK_ZONES } from '../data/stockModel';
import {
  STOCK_IMPORT_COLUMNS,
  MAX_IMPORT_FILE_SIZE_BYTES,
  ImportedStockRowDraft,
  ImportFileError,
  parseStockImportFile,
  recomputeStockRowIssues,
  buildStockOperationsFromRows,
  downloadStockImportTemplateCsv,
} from '../data/importStockParser';
import { collapseValidRows, toggleInSet } from '../data/importReviewUtils';

interface StockMovementsImportFormProps {
  products: StockProduct[];
  units: StockUnit[];
  employees: string[];
  onNavigateToStock: () => void;
  onPostImportedStock: (entries: StockLedgerEntry[], lotUpserts: StockLot[], productUpdates: Array<{ id: string; minThreshold?: number; targetStock?: number }>) => void;
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

export const StockMovementsImportForm: React.FC<StockMovementsImportFormProps> = ({
  products,
  units,
  employees,
  onNavigateToStock,
  onPostImportedStock,
}) => {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [unknownColumns, setUnknownColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<ImportedStockRowDraft[]>([]);
  useUnsavedWorkGuard(Boolean(file) || rows.length > 0);
  const [performedBy, setPerformedBy] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [collapsedRows, setCollapsedRows] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const invalidRows = useMemo(() => rows.filter((r) => r.issues.length > 0), [rows]);
  const validRows = useMemo(() => rows.filter((r) => r.issues.length === 0), [rows]);
  const totalErrors = useMemo(() => rows.reduce((sum, r) => sum + r.issues.length, 0), [rows]);
  const canConfirm = rows.length > 0 && totalErrors === 0 && Boolean(performedBy);
  const allRowsCollapsed = rows.length > 0 && rows.every((r) => collapsedRows.has(r.id));
  const toggleRowCollapsed = (id: string) => setCollapsedRows((prev) => toggleInSet(prev, id));
  const toggleCollapseAll = () => setCollapsedRows(allRowsCollapsed ? new Set() : new Set(rows.map((r) => r.id)));

  const buildRowSummaryLine = (row: ImportedStockRowDraft): string => {
    const product = products.find((p) => p.id === row.productId);
    const parts: string[] = [];
    if (row.quantity.trim()) parts.push(`+${row.quantity}${product ? ` ${product.unit}` : ''}`);
    if (row.zone) parts.push(row.zone);
    if (row.minThreshold.trim()) parts.push(`seuil ${row.minThreshold}`);
    if (row.targetStock.trim()) parts.push(`cible ${row.targetStock}`);
    return `${product?.name || row.productNameRaw || 'Produit non choisi'}${parts.length ? ` — ${parts.join(' • ')}` : ''}`;
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
      const result = await parseStockImportFile(candidate, products, units);
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

  const updateRow = (rowId: string, patch: Partial<ImportedStockRowDraft>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const next = { ...r, ...patch };
        return { ...next, issues: recomputeStockRowIssues(next, products) };
      })
    );
  };

  const handleConfirmSave = async () => {
    if (isSaving || !canConfirm) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const ops = buildStockOperationsFromRows(rows, products, performedBy);
      await new Promise((resolve) => setTimeout(resolve, 700));
      onPostImportedStock(ops.ledgerEntries, ops.lotUpserts, ops.productUpdates);
      setSavedCount(rows.length);
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
    setPerformedBy('');
    setStep('upload');
  };

  const handleCancel = () => {
    if ((file || rows.length > 0) && !window.confirm("Voulez-vous quitter l'import ? Les données non enregistrées seront perdues.")) {
      return;
    }
    resetImportState();
    onNavigateToStock();
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

  if (step === 'success') {
    return (
      <div className="p-8 sm:p-12 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col items-center text-center gap-3">
        <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-500">
          <CheckCircle2 size={30} />
        </div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Import réussi</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md">
          {savedCount} ligne{savedCount > 1 ? 's ont' : ' a'} été appliquée{savedCount > 1 ? 's' : ''} au stock (mouvements, seuils et
          stocks cibles).
        </p>
        <div className="flex items-center gap-2 pt-2">
          <button onClick={handleStartNewImport} className={secondaryButtonClass}>
            <UploadCloud size={14} />
            <span>Importer un autre fichier</span>
          </button>
          <button onClick={onNavigateToStock} className={primaryButtonClass}>
            <History size={14} />
            <span>Voir le stock</span>
          </button>
        </div>
      </div>
    );
  }

  if (step === 'preview') {
    return (
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
              {totalErrors > 0
                ? `${totalErrors} erreur${totalErrors > 1 ? 's' : ''} doivent être corrigées avant l'enregistrement`
                : 'Vérifiez les informations avant confirmation'}
            </p>
            <p className={`text-xs ${canConfirm ? 'text-emerald-700/80 dark:text-emerald-400/80' : 'text-amber-700/80 dark:text-amber-400/80'}`}>
              Aucune donnée n'est encore modifiée. Corrigez les lignes signalées en rouge, renseignez qui effectue l'import, puis confirmez.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <StatChip label="Lignes détectées" value={rows.length} />
            <StatChip label="Valides" value={validRows.length} tone="emerald" />
            <StatChip label="Invalides" value={invalidRows.length} tone={invalidRows.length ? 'red' : 'gray'} />
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

        <div className="p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs max-w-sm">
          <label className={labelClass}>Effectué par *</label>
          <EmployeePicker
            value={performedBy}
            onChange={(v) => setPerformedBy(v)}
            employees={employees}
            className={`${inputBaseClass} appearance-none cursor-pointer ${!performedBy ? inputValidClass : inputValidClass}`}
          />
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
            const product = products.find((p) => p.id === row.productId);
            const isCollapsed = collapsedRows.has(row.id);

            return (
              <div
                key={row.id}
                className={`p-4 sm:p-5 rounded-2xl border shadow-2xs space-y-3 ${
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
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate" title={buildRowSummaryLine(row)}>
                          {buildRowSummaryLine(row)}
                        </p>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={() => toggleRowCollapsed(row.id)}
                    title={isCollapsed ? 'Développer cette ligne' : 'Réduire cette ligne'}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer shrink-0"
                  >
                    {isCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                  </button>
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Produit *</label>
                    <select
                      value={row.productId}
                      onChange={(e) => updateRow(row.id, { productId: e.target.value })}
                      className={`${inputBaseClass} appearance-none cursor-pointer ${fieldsWithError.has('produit') || !row.productId ? inputErrorClass : inputValidClass}`}
                    >
                      <option value="">Choisir un produit</option>
                      {STOCK_CATEGORIES.map((cat) => (
                        <optgroup key={cat} label={cat}>
                          {products.filter((p) => p.category === cat).map((p) => (
                            <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    {!row.productId && row.productNameRaw && (
                      <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                        <AlertCircle size={11} /> Valeur importée : « {row.productNameRaw} »
                      </p>
                    )}
                  </div>

                  <div>
                    <label className={labelClass}>Zone {row.quantity.trim() !== '' ? '*' : ''}</label>
                    <select
                      value={row.zone}
                      onChange={(e) => updateRow(row.id, { zone: e.target.value as ImportedStockRowDraft['zone'] })}
                      className={`${inputBaseClass} appearance-none cursor-pointer ${fieldsWithError.has('zone') ? inputErrorClass : inputValidClass}`}
                    >
                      <option value="">Aucune</option>
                      {STOCK_ZONES.map((z) => (
                        <option key={z} value={z}>{z}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={labelClass}>Quantité à ajouter</label>
                    <DecimalInput
                      min={0}
                      value={row.quantity}
                      onChange={(e) => updateRow(row.id, { quantity: e.target.value })}
                      placeholder={product ? `en ${product.unit}` : 'Optionnel'}
                      className={`${inputBaseClass} ${fieldsWithError.has('quantite') ? inputErrorClass : inputValidClass}`}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Seuil minimum</label>
                      <DecimalInput
                        min={0}
                        value={row.minThreshold}
                        onChange={(e) => updateRow(row.id, { minThreshold: e.target.value })}
                        placeholder="Optionnel"
                        className={`${inputBaseClass} ${fieldsWithError.has('seuil_minimum') ? inputErrorClass : inputValidClass}`}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Stock cible</label>
                      <DecimalInput
                        min={0}
                        value={row.targetStock}
                        onChange={(e) => updateRow(row.id, { targetStock: e.target.value })}
                        placeholder="Optionnel"
                        className={`${inputBaseClass} ${fieldsWithError.has('stock_cible') ? inputErrorClass : inputValidClass}`}
                      />
                    </div>
                  </div>

                  {product?.lotTracked && row.quantity.trim() !== '' && (
                    <>
                      <div>
                        <label className={labelClass}>Numéro de lot (optionnel)</label>
                        <input
                          type="text"
                          value={row.lotNumber}
                          onChange={(e) => updateRow(row.id, { lotNumber: e.target.value })}
                          placeholder="Laissez vide pour générer automatiquement"
                          className={`${inputBaseClass} ${inputValidClass}`}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Date de péremption *</label>
                        <input
                          type="date"
                          value={row.expiryDate}
                          onChange={(e) => updateRow(row.id, { expiryDate: e.target.value })}
                          className={`${inputBaseClass} ${fieldsWithError.has('date_peremption') ? inputErrorClass : inputValidClass}`}
                        />
                      </div>
                    </>
                  )}
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
            ) : totalErrors > 0 ? (
              <span className="font-semibold text-red-600 dark:text-red-400">
                {totalErrors} erreur{totalErrors > 1 ? 's' : ''} {totalErrors > 1 ? 'doivent' : 'doit'} être corrigée{totalErrors > 1 ? 's' : ''} avant l'enregistrement.
              </span>
            ) : (
              <span className="font-semibold text-amber-600 dark:text-amber-400">Sélectionnez qui effectue l'import.</span>
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
    );
  }

  // step === 'upload'
  return (
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
            Téléchargez le template pour structurer votre fichier. Chaque ligne concerne un produit déjà existant dans le stock — aucun
            produit, aucune unité et aucune zone ne sont créés par l'import.
          </p>
          <button onClick={() => downloadStockImportTemplateCsv(products)} className={primaryButtonClass}>
            <Download size={14} />
            <span>Télécharger le template CSV</span>
          </button>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-2">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Comment structurer votre fichier</h3>
          <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1.5">
            {STOCK_IMPORT_COLUMNS.map((col) => (
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
  );
};
