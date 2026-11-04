import { EmployeePicker } from './ui/EmployeePicker';
import React, { useMemo, useRef, useState } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Info,
  RotateCcw,
  ClipboardList,
  ArrowUpCircle,
  ArrowDownCircle,
} from 'lucide-react';
import { StockProduct, StockLedgerEntry } from '../data/stockModel';
import {
  INVENTORY_IMPORT_COLUMNS,
  MAX_IMPORT_FILE_SIZE_BYTES,
  ImportedInventoryRowDraft,
  ImportFileError,
  parseInventoryImportFile,
  buildInventoryPreviewRows,
  buildLedgerEntriesFromInventoryImport,
  downloadInventoryImportTemplateCsv,
} from '../data/importInventoryParser';

interface InventoryImportFormProps {
  products: StockProduct[];
  employees: string[];
  onPostEntries: (entries: StockLedgerEntry[]) => void;
  onClose: () => void;
}

type Step = 'upload' | 'preview' | 'success';

const inputBaseClass =
  'w-full px-3.5 py-2 text-xs rounded-xl border bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 transition';
const inputValidClass = 'border-gray-200 dark:border-gray-700 focus:border-emerald-500 focus:ring-emerald-500';
const inputErrorClass = 'border-red-400 dark:border-red-500/70 focus:border-red-500 focus:ring-red-500';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer';

const formatQty = (v: number): string => v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });

export const InventoryImportForm: React.FC<InventoryImportFormProps> = ({ products, employees, onPostEntries, onClose }) => {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [unknownColumns, setUnknownColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<ImportedInventoryRowDraft[]>([]);
  const [performedBy, setPerformedBy] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const invalidRows = useMemo(() => rows.filter((r) => r.issues.length > 0), [rows]);
  const totalErrors = useMemo(() => rows.reduce((sum, r) => sum + r.issues.length, 0), [rows]);
  const previews = useMemo(() => buildInventoryPreviewRows(rows, products), [rows, products]);
  const discrepantPreviews = useMemo(() => previews.filter((p) => p.discrepancyQty !== 0), [previews]);
  const canConfirm = rows.length > 0 && totalErrors === 0 && Boolean(performedBy);

  const processFile = async (candidate: File) => {
    setFileError(null);
    if (candidate.size > MAX_IMPORT_FILE_SIZE_BYTES) {
      setFileError(`Le fichier dépasse la taille maximale autorisée (${Math.round(MAX_IMPORT_FILE_SIZE_BYTES / (1024 * 1024))} Mo).`);
      return;
    }
    setFile(candidate);
    setIsParsing(true);
    try {
      const result = await parseInventoryImportFile(candidate, products);
      setRows(result.rows);
      setUnknownColumns(result.unknownColumns);
      setStep('preview');
    } catch (err) {
      setFileError(err instanceof ImportFileError ? err.message : "Une erreur est survenue lors de la lecture du fichier.");
      setFile(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const candidate = e.target.files?.[0];
    if (candidate) void processFile(candidate);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const candidate = e.dataTransfer.files?.[0];
    if (candidate) void processFile(candidate);
  };

  const resetImportState = () => {
    setFile(null);
    setRows([]);
    setUnknownColumns([]);
    setFileError(null);
    setStep('upload');
  };

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const entries = buildLedgerEntriesFromInventoryImport(previews, performedBy);
      await onPostEntries(entries);
      setSavedCount(entries.length);
      setStep('success');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setIsSaving(false);
    }
  };

  if (step === 'success') {
    return (
      <div className="p-8 sm:p-12 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col items-center text-center gap-3">
        <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-500">
          <CheckCircle2 size={30} />
        </div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Inventaire importé avec succès</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md">
          {savedCount} écart{savedCount > 1 ? 's ont' : savedCount === 1 ? ' a' : ''} été enregistré{savedCount > 1 ? 's' : ''} dans l'historique.
        </p>
        <div className="flex items-center gap-2 pt-1">
          <button onClick={resetImportState} className={secondaryButtonClass}>
            <UploadCloud size={14} />
            <span>Importer un autre fichier</span>
          </button>
          <button onClick={onClose} className={primaryButtonClass}>
            <ClipboardList size={14} />
            <span>Retour aux inventaires</span>
          </button>
        </div>
      </div>
    );
  }

  if (step === 'upload') {
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/50 flex items-start gap-3">
          <Info size={16} className="text-purple-500 shrink-0 mt-0.5" />
          <div className="text-xs text-purple-700 dark:text-purple-300">
            <p className="font-semibold mb-1">Importer un comptage d'inventaire</p>
            <p>
              Chaque ligne indique le stock réellement compté pour un produit dans une zone donnée. Le stock
              théorique est toujours recalculé en direct au moment de l'import — jamais lu depuis le fichier — pour
              comparer avec la situation actuelle du système.
            </p>
          </div>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`p-10 rounded-2xl border-2 border-dashed text-center cursor-pointer transition ${
            isDragOver ? 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-[#151D2A] hover:border-emerald-300'
          }`}
        >
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileInputChange} />
          {isParsing ? (
            <div className="flex flex-col items-center gap-2 text-gray-500">
              <Loader2 size={26} className="animate-spin" />
              <span className="text-xs font-semibold">Analyse du fichier…</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <UploadCloud size={28} className="text-gray-300 dark:text-gray-600" />
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Glissez-déposez un fichier CSV ou Excel</p>
              <p className="text-xs text-gray-400">ou cliquez pour parcourir — .csv, .xlsx, .xls</p>
            </div>
          )}
        </div>

        {fileError && (
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" /> {fileError}
          </div>
        )}

        <div className="p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <FileSpreadsheet size={15} className="text-emerald-500" /> Format attendu
            </h3>
            <button onClick={downloadInventoryImportTemplateCsv} className={secondaryButtonClass}>
              <Download size={13} />
              <span>Télécharger le modèle</span>
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 dark:text-gray-500">
                  <th className="py-1 pr-3 font-semibold">Colonne</th>
                  <th className="py-1 pr-3 font-semibold">Obligatoire</th>
                  <th className="py-1 font-semibold">Description</th>
                </tr>
              </thead>
              <tbody>
                {INVENTORY_IMPORT_COLUMNS.map((c) => (
                  <tr key={c.key} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="py-1.5 pr-3 font-mono text-[11px] text-gray-700 dark:text-gray-300">{c.key}</td>
                    <td className="py-1.5 pr-3">{c.required ? <span className="text-red-500 font-semibold">Oui</span> : <span className="text-gray-400">Non</span>}</td>
                    <td className="py-1.5 text-gray-500 dark:text-gray-400">{c.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // step === 'preview'
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 flex items-start gap-3">
        <ShieldCheck size={20} className="text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-purple-800 dark:text-purple-300">Vérification des informations avant confirmation</p>
          <p className="text-xs text-purple-700/80 dark:text-purple-400/80">
            Rien n'est encore enregistré. Seules les lignes avec un écart produiront un mouvement de stock.
          </p>
        </div>
      </div>

      {unknownColumns.length > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>Colonne(s) non reconnue(s), ignorée(s) : {unknownColumns.join(', ')}.</span>
        </div>
      )}

      <div className="p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            <span className="font-bold text-gray-900 dark:text-white">{file?.name}</span> • {rows.length} ligne(s) •{' '}
            {invalidRows.length > 0 ? (
              <span className="text-red-500 font-semibold">{totalErrors} erreur(s) sur {invalidRows.length} ligne(s)</span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Prêt à importer</span>
            )}
          </div>
          <button onClick={resetImportState} className={secondaryButtonClass}>
            <RotateCcw size={13} />
            <span>Remplacer le fichier</span>
          </button>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 block">Employé ayant réalisé l'inventaire *</label>
          <EmployeePicker
            value={performedBy}
            onChange={(v) => setPerformedBy(v)}
            employees={employees}
            className={`${inputBaseClass} appearance-none cursor-pointer max-w-xs ${!performedBy ? inputErrorClass : inputValidClass}`}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#151D2A] shadow-2xs">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-800">
              <th className="py-2 px-3 font-semibold">Ligne</th>
              <th className="py-2 px-3 font-semibold">Produit</th>
              <th className="py-2 px-3 font-semibold">Zone</th>
              <th className="py-2 px-3 font-semibold text-right">Théorique</th>
              <th className="py-2 px-3 font-semibold text-right">Réel</th>
              <th className="py-2 px-3 font-semibold text-right">Écart</th>
              <th className="py-2 px-3 font-semibold">Choix</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const preview = previews.find((p) => p.row.id === row.id);
              if (row.issues.length > 0) {
                return (
                  <tr key={row.id} className="border-b border-gray-50 dark:border-gray-800/60 bg-red-50/40 dark:bg-red-950/10">
                    <td className="py-2 px-3 text-gray-500">{row.rowNumber}</td>
                    <td colSpan={6} className="py-2 px-3 text-red-500">
                      {row.issues.map((i) => i.message).join(' — ')}
                    </td>
                  </tr>
                );
              }
              if (!preview) return null;
              const noChange = preview.discrepancyQty === 0;
              return (
                <tr key={row.id} className="border-b border-gray-50 dark:border-gray-800/60">
                  <td className="py-2 px-3 text-gray-500">{row.rowNumber}</td>
                  <td className="py-2 px-3 font-semibold text-gray-800 dark:text-gray-200">{preview.product.name}</td>
                  <td className="py-2 px-3 text-gray-500 dark:text-gray-400">{row.zone}</td>
                  <td className="py-2 px-3 text-right text-gray-600 dark:text-gray-300">{formatQty(preview.theoreticalQty)}</td>
                  <td className="py-2 px-3 text-right font-semibold text-gray-800 dark:text-gray-200">{formatQty(preview.realQty)}</td>
                  <td className="py-2 px-3 text-right">
                    {noChange ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                        <CheckCircle2 size={11} /> Conforme
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 font-semibold ${preview.discrepancyQty > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                        {preview.discrepancyQty > 0 ? <ArrowUpCircle size={11} /> : <ArrowDownCircle size={11} />}
                        {preview.discrepancyQty > 0 ? '+' : ''}{formatQty(preview.discrepancyQty)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-gray-500 dark:text-gray-400">{noChange ? '—' : row.choice}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <ClipboardList size={14} className="text-purple-500" />
          <span>
            <strong className="text-gray-800 dark:text-gray-200">{discrepantPreviews.length}</strong> écart(s) sur{' '}
            <strong className="text-gray-800 dark:text-gray-200">{previews.length}</strong> ligne(s) valide(s)
          </span>
        </div>
        <button onClick={handleConfirm} disabled={!canConfirm || isSaving} className={`${primaryButtonClass} w-full sm:w-auto`}>
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
          <span>{isSaving ? 'Enregistrement…' : 'Confirmer et enregistrer'}</span>
        </button>
      </div>
    </div>
  );
};
