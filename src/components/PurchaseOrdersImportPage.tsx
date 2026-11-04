import { DecimalInput } from './ui/DecimalInput';
import { EmployeePicker } from './ui/EmployeePicker';
import React, { useMemo, useRef, useState } from 'react';
import { useUnsavedWorkGuard } from '../hooks/useUnsavedWorkGuard';
import {
  ShoppingCart,
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
  Plus,
  Info,
  RotateCcw,
  ArrowLeft,
} from 'lucide-react';
import { Supplier, PurchaseOrder, DraftPurchaseLine, createEmptyDraftPurchaseLine } from '../data/purchasesModel';
import { StockProduct, STOCK_CATEGORIES } from '../data/stockModel';
import {
  IMPORT_COLUMNS,
  MAX_IMPORT_FILE_SIZE_BYTES,
  ImportedOrderDraft,
  ImportFileError,
  parseImportFile,
  recomputeRowIssues,
  buildPurchaseOrdersFromImportRows,
  downloadImportTemplateCsv,
} from '../data/importPurchasesParser';
import { collapseValidRows, toggleInSet } from '../data/importReviewUtils';

interface PurchaseOrdersImportPageProps {
  suppliers: Supplier[];
  products: StockProduct[];
  employees: string[];
  onNavigateToDashboard: () => void;
  onNavigateToPurchases: () => void;
  onSaveOrders: (orders: PurchaseOrder[]) => void;
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

export const PurchaseOrdersImportPage: React.FC<PurchaseOrdersImportPageProps> = ({
  suppliers,
  products,
  employees,
  onNavigateToDashboard,
  onNavigateToPurchases,
  onSaveOrders,
  onBack,
}) => {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [unknownColumns, setUnknownColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<ImportedOrderDraft[]>([]);
  useUnsavedWorkGuard(Boolean(file) || rows.length > 0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [collapsedRows, setCollapsedRows] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const invalidRows = useMemo(() => rows.filter((r) => r.issues.length > 0), [rows]);
  const validRows = useMemo(() => rows.filter((r) => r.issues.length === 0), [rows]);
  const totalErrors = useMemo(() => rows.reduce((sum, r) => sum + r.issues.length, 0), [rows]);
  const totalLines = useMemo(() => rows.reduce((sum, r) => sum + r.order.lines.filter((l) => l.productId).length, 0), [rows]);
  const grandTotal = useMemo(
    () =>
      rows.reduce((sum, r) => {
        const qtyTotal = r.order.lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
        return sum + qtyTotal;
      }, 0),
    [rows]
  );
  const canConfirm = rows.length > 0 && totalErrors === 0;
  const allRowsCollapsed = rows.length > 0 && rows.every((r) => collapsedRows.has(r.id));
  const toggleRowCollapsed = (id: string) => setCollapsedRows((prev) => toggleInSet(prev, id));
  const toggleCollapseAll = () => setCollapsedRows(allRowsCollapsed ? new Set() : new Set(rows.map((r) => r.id)));

  const buildRowSummaryLine = (row: ImportedOrderDraft): string => {
    const supplier = suppliers.find((s) => s.id === row.order.supplierId);
    const linesLabel = row.order.lines
      .filter((l) => l.productId)
      .map((l) => {
        const product = products.find((p) => p.id === l.productId);
        return product ? `${l.quantity || '?'}x ${product.name}` : null;
      })
      .filter(Boolean)
      .join(', ');
    return `${supplier?.name ?? 'Fournisseur non choisi'} — ${linesLabel || 'Aucun produit'}`;
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
      const result = await parseImportFile(candidate, suppliers, products, employees);
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

  const updateRow = (rowId: string, updater: (row: ImportedOrderDraft) => ImportedOrderDraft) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const next = updater(r);
        return { ...next, issues: recomputeRowIssues(next, suppliers, products) };
      })
    );
  };

  const updateRowOrder = (rowId: string, patch: Partial<ImportedOrderDraft['order']>) =>
    updateRow(rowId, (r) => ({ ...r, order: { ...r.order, ...patch } }));

  const updateRowLine = (rowId: string, lineId: string, patch: Partial<DraftPurchaseLine>) =>
    updateRow(rowId, (r) => {
      const nextHints = { ...r.lineHints };
      if (patch.productId !== undefined) delete nextHints[lineId];
      return {
        ...r,
        lineHints: nextHints,
        order: { ...r.order, lines: r.order.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) },
      };
    });

  const addRowLine = (rowId: string) =>
    updateRow(rowId, (r) => ({ ...r, order: { ...r.order, lines: [...r.order.lines, createEmptyDraftPurchaseLine()] } }));

  const removeRowLine = (rowId: string, lineId: string) =>
    updateRow(rowId, (r) => {
      const nextHints = { ...r.lineHints };
      delete nextHints[lineId];
      return { ...r, lineHints: nextHints, order: { ...r.order, lines: r.order.lines.filter((l) => l.id !== lineId) } };
    });

  const handleConfirmSave = async () => {
    if (isSaving || !canConfirm) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const orders = buildPurchaseOrdersFromImportRows(rows, products);
      await onSaveOrders(orders);
      setSavedCount(orders.length);
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
    if ((file || rows.length > 0) && !window.confirm("Voulez-vous quitter l'import ? Les données non enregistrées seront perdues.")) {
      return;
    }
    resetImportState();
    onNavigateToPurchases();
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
      {/* Page Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>Import Excel/CSV</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Achats
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Importez plusieurs commandes d'achat en une seule fois depuis un fichier Excel ou CSV.
          </p>
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
            onClick={onNavigateToPurchases}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer"
          >
            <ShoppingCart size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Voir les achats</span>
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
            {savedCount} {savedCount > 1 ? 'commandes ont été importées' : 'commande a été importée'} et ajoutées à la
            gestion des achats Café Noir.
          </p>
          <div className="flex items-center gap-2 pt-2">
            <button onClick={handleStartNewImport} className={secondaryButtonClass}>
              <UploadCloud size={14} />
              <span>Importer un autre fichier</span>
            </button>
            <button onClick={onNavigateToPurchases} className={primaryButtonClass}>
              <ShoppingCart size={14} />
              <span>Voir les achats</span>
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
                  ? "Aucune commande n'est encore enregistrée. Contrôlez les lignes ci-dessous, puis confirmez pour les enregistrer définitivement."
                  : 'Corrigez les lignes signalées en rouge ci-dessous, ou remplacez le fichier. La confirmation reste bloquée tant qu\'une seule erreur subsiste.'}
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <StatChip label="Commandes détectées" value={rows.length} />
              <StatChip label="Valides" value={validRows.length} tone="emerald" />
              <StatChip label="Invalides" value={invalidRows.length} tone={invalidRows.length ? 'red' : 'gray'} />
              <StatChip label="Produits" value={totalLines} />
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
              const orderTotal = row.order.lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
              const isCollapsed = collapsedRows.has(row.id);

              return (
                <div
                  key={row.id}
                  className={`p-4 sm:p-5 rounded-2xl border shadow-2xs space-y-4 ${
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
                        {orderTotal.toFixed(2)} <span className="text-[11px] text-gray-500">DT</span>
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className={labelClass}>Date *</label>
                      <input
                        type="date"
                        value={row.order.orderDate}
                        onChange={(e) => updateRowOrder(row.id, { orderDate: e.target.value })}
                        className={`${inputBaseClass} ${fieldsWithError.has('date') ? inputErrorClass : inputValidClass}`}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Fournisseur *</label>
                      <select
                        value={row.order.supplierId}
                        onChange={(e) => updateRowOrder(row.id, { supplierId: e.target.value })}
                        className={`${inputBaseClass} appearance-none cursor-pointer ${fieldsWithError.has('fournisseur') ? inputErrorClass : inputValidClass}`}
                      >
                        <option value="">Sélectionner un fournisseur</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Employé *</label>
                      <EmployeePicker
                        value={row.order.createdBy}
                        onChange={(v) => updateRowOrder(row.id, { createdBy: v })}
                        employees={employees}
                        className={`${inputBaseClass} appearance-none cursor-pointer ${fieldsWithError.has('employe') ? inputErrorClass : inputValidClass}`}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Date de livraison prévue</label>
                      <input
                        type="date"
                        value={row.order.expectedDate}
                        onChange={(e) => updateRowOrder(row.id, { expectedDate: e.target.value })}
                        className={`${inputBaseClass} ${inputValidClass}`}
                      />
                    </div>
                  </div>

                  {/* Products */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Produits</span>
                    <div className="space-y-2.5">
                      {row.order.lines.map((line) => {
                        const hint = row.lineHints[line.id];
                        const product = products.find((p) => p.id === line.productId);

                        return (
                          <div
                            key={line.id}
                            className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40 p-3 space-y-2"
                          >
                            <div className="flex flex-col sm:flex-row gap-2">
                              <div className="flex-1 min-w-0">
                                <select
                                  value={line.productId}
                                  onChange={(e) => updateRowLine(row.id, line.id, { productId: e.target.value })}
                                  className={`${inputBaseClass} appearance-none cursor-pointer ${!line.productId ? inputErrorClass : inputValidClass}`}
                                >
                                  <option value="">Choisir un produit</option>
                                  {STOCK_CATEGORIES.map((cat) => (
                                    <optgroup key={cat} label={cat}>
                                      {products.filter((p) => p.category === cat).map((p) => (
                                        <option key={p.id} value={p.id}>
                                          {p.name} ({p.sku})
                                        </option>
                                      ))}
                                    </optgroup>
                                  ))}
                                </select>
                                {hint?.product && (
                                  <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                                    <AlertCircle size={11} /> Valeur importée : « {hint.product} »
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <DecimalInput
                                  min={0}
                                  step="0.01"
                                  value={line.quantity}
                                  onChange={(e) => updateRowLine(row.id, line.id, { quantity: e.target.value })}
                                  placeholder={product ? `Qté (${product.unit})` : 'Qté'}
                                  className="w-24 text-center text-xs py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                />
                                <DecimalInput
                                  min={0}
                                  step="0.001"
                                  value={line.unitPrice}
                                  onChange={(e) => updateRowLine(row.id, line.id, { unitPrice: e.target.value })}
                                  placeholder="PU (DT)"
                                  className="w-24 text-center text-xs py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                />
                                <button
                                  onClick={() => removeRowLine(row.id, line.id)}
                                  title="Supprimer ce produit"
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      onClick={() => addRowLine(row.id)}
                      className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Plus size={13} />
                      Ajouter un produit
                    </button>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className={labelClass}>Notes</label>
                    <input
                      type="text"
                      value={row.order.notes}
                      onChange={(e) => updateRowOrder(row.id, { notes: e.target.value })}
                      placeholder="Remarque optionnelle"
                      className={`${inputBaseClass} ${inputValidClass}`}
                    />
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
          {/* Upload zone */}
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

          {/* Template + documentation */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-3">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Template d'import</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Téléchargez le template pour structurer votre fichier correctement. Chaque ligne du fichier représente
                une commande d'achat complète, exactement comme dans « Achats et acquisitions ».
              </p>
              <button onClick={() => downloadImportTemplateCsv(suppliers, products, employees)} className={primaryButtonClass}>
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
