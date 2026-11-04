import { DecimalInput } from './ui/DecimalInput';
import { EmployeePicker } from './ui/EmployeePicker';
import React, { useMemo, useRef, useState } from 'react';
import { useUnsavedWorkGuard } from '../hooks/useUnsavedWorkGuard';
import {
  UploadCloud,
  FileText,
  Image as ImageIcon,
  X,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Sparkles,
  Plus,
  Trash2,
  BookmarkPlus,
  BadgeCheck,
  Eye,
  EyeOff,
  ScanLine,
  Camera,
} from 'lucide-react';
import { Supplier, PurchasePaymentMethod, PURCHASE_PAYMENT_METHODS } from '../data/purchasesModel';
import { StockProduct, STOCK_CATEGORIES, STOCK_ZONES, StockZone } from '../data/stockModel';
import { normalizeKey } from '../data/textUtils';
import {
  ProductAlias,
  OcrLineItemDraft,
  OCR_ACCEPTED_EXTENSIONS,
  MAX_OCR_FILE_SIZE_BYTES,
  detectFileKind,
  extractTextFromFile,
  parseInvoiceText,
  findProductMatch,
  createEmptyOcrLine,
  OcrExtractionError,
} from '../data/invoiceOcr';

interface IntegratePayload {
  supplierId: string;
  newSupplierName: string;
  orderDate: string;
  createdBy: string;
  lines: { productId: string; quantity: number; unit: string; unitPrice: number }[];
  receptionDate: string;
  zone: StockZone;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amountHT: number;
  vatAmount: number;
  amountTTC: number;
  paymentMethod: PurchasePaymentMethod;
}

interface InvoiceOcrPageProps {
  suppliers: Supplier[];
  products: StockProduct[];
  aliases: ProductAlias[];
  employees: string[];
  defaultPerformedBy: string;
  onNavigateToDashboard: () => void;
  onNavigateToPurchases: () => void;
  onCreateProductAlias: (rawLabel: string, productId: string) => Promise<ProductAlias>;
  onIntegrateInvoice: (payload: IntegratePayload) => Promise<void>;
}

type Step = 'upload' | 'confirm' | 'extracting' | 'review' | 'success';
type CaptureSource = 'camera' | 'file';

// Coarse-pointer/touch-UA heuristic — good enough to decide whether showing a dedicated "Prendre
// une photo" button (backed by <input capture="environment">) is worth the extra tap versus just
// letting desktop users pick a file the usual way. The capture attribute itself is silently
// ignored by desktop browsers, so this is a UX nicety, never a hard gate.
const isLikelyMobileDevice = (): boolean =>
  typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const inputBaseClass =
  'w-full px-3.5 py-2 text-xs rounded-xl border bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 transition';
const inputValidClass = 'border-gray-200 dark:border-gray-700 focus:border-emerald-500 focus:ring-emerald-500';
const inputErrorClass = 'border-red-400 dark:border-red-500/70 focus:border-red-500 focus:ring-red-500';
const labelClass = 'text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 block';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer';

type SupplierMode = 'existing' | 'new';

export const InvoiceOcrPage: React.FC<InvoiceOcrPageProps> = ({
  suppliers,
  products,
  aliases,
  employees,
  defaultPerformedBy,
  onNavigateToDashboard,
  onNavigateToPurchases,
  onCreateProductAlias,
  onIntegrateInvoice,
}) => {
  const [step, setStep] = useState<Step>('upload');
  useUnsavedWorkGuard(step === 'review' || step === 'extracting' || step === 'confirm');
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [rawText, setRawText] = useState('');
  const [showRawText, setShowRawText] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useMemo(isLikelyMobileDevice, []);

  // A photo (from the camera or the gallery) is held here, unprocessed, until the user confirms
  // it — nothing is sent to OCR until they've actually looked at what was captured/picked.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [pendingSource, setPendingSource] = useState<CaptureSource | null>(null);

  // Review draft fields
  const [supplierMode, setSupplierMode] = useState<SupplierMode>('new');
  const [supplierId, setSupplierId] = useState('');
  const [newSupplierName, setNewSupplierName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [zone, setZone] = useState<StockZone>('Réserve principale');
  const [performedBy, setPerformedBy] = useState(defaultPerformedBy);
  const [paymentMethod, setPaymentMethod] = useState<PurchasePaymentMethod | ''>('');
  const [amountHT, setAmountHT] = useState('');
  const [vatAmount, setVatAmount] = useState('');
  const [amountTTC, setAmountTTC] = useState('');
  const [lines, setLines] = useState<OcrLineItemDraft[]>([]);
  const [savedAliasLineIds, setSavedAliasLineIds] = useState<Set<string>>(new Set());
  const [savingAliasLineId, setSavingAliasLineId] = useState<string | null>(null);

  const [isIntegrating, setIsIntegrating] = useState(false);
  const [integrateError, setIntegrateError] = useState<string | null>(null);

  const resetAll = () => {
    setFile(null);
    setFilePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPendingFile(null);
    setPendingPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPendingSource(null);
    setExtractError(null);
    setRawText('');
    setShowRawText(false);
    setSupplierMode('new');
    setSupplierId('');
    setNewSupplierName('');
    setInvoiceNumber('');
    setInvoiceDate('');
    setDueDate('');
    setZone('Réserve principale');
    setPerformedBy(defaultPerformedBy);
    setPaymentMethod('');
    setAmountHT('');
    setVatAmount('');
    setAmountTTC('');
    setLines([]);
    setSavedAliasLineIds(new Set());
    setIntegrateError(null);
  };

  const processFile = async (candidate: File) => {
    const kind = detectFileKind(candidate);
    if (!kind) {
      setExtractError('Format non supporté. Utilisez une photo (JPG/PNG/WEBP), un PDF ou un DOCX.');
      return;
    }
    if (candidate.size > MAX_OCR_FILE_SIZE_BYTES) {
      setExtractError(`Fichier trop volumineux (max ${(MAX_OCR_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)} Mo).`);
      return;
    }

    setFile(candidate);
    setFilePreviewUrl(kind === 'image' ? URL.createObjectURL(candidate) : null);
    setExtractError(null);
    setStep('extracting');

    try {
      const text = await extractTextFromFile(candidate);
      setRawText(text);
      const parsed = parseInvoiceText(text, suppliers, products, aliases);

      setSupplierMode(parsed.supplierId ? 'existing' : 'new');
      setSupplierId(parsed.supplierId);
      setNewSupplierName(parsed.supplierId ? '' : parsed.supplierNameRaw);
      setInvoiceNumber(parsed.invoiceNumber);
      setInvoiceDate(parsed.invoiceDate);
      setDueDate(parsed.invoiceDate);
      setPerformedBy(defaultPerformedBy);
      setAmountHT(parsed.amountHT);
      setVatAmount(parsed.vatAmount);
      setAmountTTC(parsed.amountTTC);
      setLines(parsed.lines.length > 0 ? parsed.lines : [createEmptyOcrLine()]);
      setStep('review');
    } catch (err) {
      setExtractError(err instanceof OcrExtractionError || err instanceof Error ? err.message : "Impossible d'analyser ce document.");
      setStep('upload');
    }
  };

  const clearPending = () => {
    setPendingFile(null);
    setPendingPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPendingSource(null);
  };

  // Images (whether from the camera or the gallery/file picker) always stop at the confirm
  // screen first — a photo can be blurry, cropped wrong, or simply the wrong document, and OCR
  // can take several seconds, so it's worth one extra look before committing to it. PDFs/DOCX
  // have no meaningful visual preview to confirm, so they go straight to extraction as before.
  const stageFile = (candidate: File, source: CaptureSource) => {
    const kind = detectFileKind(candidate);
    if (!kind) {
      setExtractError('Format non supporté. Utilisez une photo (JPG/PNG/WEBP), un PDF ou un DOCX.');
      return;
    }
    if (candidate.size > MAX_OCR_FILE_SIZE_BYTES) {
      setExtractError(`Fichier trop volumineux (max ${(MAX_OCR_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)} Mo).`);
      return;
    }
    setExtractError(null);

    if (kind === 'image') {
      setPendingFile(candidate);
      setPendingPreviewUrl(URL.createObjectURL(candidate));
      setPendingSource(source);
      setStep('confirm');
    } else {
      processFile(candidate);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0];
    if (chosen) stageFile(chosen, 'file');
    e.target.value = '';
  };

  const handleCameraInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0];
    if (chosen) stageFile(chosen, 'camera');
    e.target.value = '';
  };

  const handleConfirmPending = () => {
    if (!pendingFile) return;
    const toProcess = pendingFile;
    clearPending();
    processFile(toProcess);
  };

  const handleRetakePending = () => {
    const source = pendingSource;
    clearPending();
    setStep('upload');
    // Re-open the same source (camera or file picker) the pending photo came from, so retaking
    // is a single tap rather than having to choose the source again.
    if (source === 'camera') cameraInputRef.current?.click();
    else fileInputRef.current?.click();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) stageFile(dropped, 'file');
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleCancelReview = () => {
    if (!window.confirm("Voulez-vous quitter la vérification ? Les données non enregistrées seront perdues.")) return;
    resetAll();
    setStep('upload');
  };

  const updateLine = (id: string, patch: Partial<OcrLineItemDraft>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
    setSavedAliasLineIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const addLine = () => setLines((prev) => [...prev, createEmptyOcrLine()]);

  const handleSaveAlias = async (line: OcrLineItemDraft) => {
    if (!line.productId || !line.rawLabel.trim()) return;
    setSavingAliasLineId(line.id);
    try {
      await onCreateProductAlias(line.rawLabel.trim(), line.productId);
      setSavedAliasLineIds((prev) => new Set(prev).add(line.id));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Impossible d'enregistrer cette correspondance.");
    } finally {
      setSavingAliasLineId(null);
    }
  };

  const lineTotals = useMemo(
    () => lines.map((l) => (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0)),
    [lines]
  );
  const sumOfLines = useMemo(() => lineTotals.reduce((s, v) => s + v, 0), [lineTotals]);
  const ttcNumber = Number(amountTTC);
  const ttcMismatch = amountTTC.trim() !== '' && lines.length > 0 && Math.abs(sumOfLines - ttcNumber) > 0.5;

  const supplierResolved = supplierMode === 'existing' ? Boolean(supplierId) : newSupplierName.trim().length > 0;
  const linesValid = lines.length > 0 && lines.every((l) => l.productId && Number(l.quantity) > 0 && Number(l.unitPrice) >= 0);
  const canIntegrate =
    supplierResolved &&
    invoiceNumber.trim().length > 0 &&
    Boolean(invoiceDate) &&
    Boolean(dueDate) &&
    Boolean(performedBy) &&
    Boolean(paymentMethod) &&
    !Number.isNaN(ttcNumber) &&
    ttcNumber > 0 &&
    linesValid;

  const handleIntegrate = async () => {
    if (!canIntegrate || isIntegrating) return;
    setIsIntegrating(true);
    setIntegrateError(null);
    try {
      const effectiveDate = invoiceDate;
      await onIntegrateInvoice({
        supplierId: supplierMode === 'existing' ? supplierId : '',
        newSupplierName: supplierMode === 'new' ? newSupplierName.trim() : '',
        orderDate: effectiveDate,
        createdBy: performedBy,
        lines: lines.map((l) => {
          const product = products.find((p) => p.id === l.productId);
          return { productId: l.productId, quantity: Number(l.quantity), unit: product?.unit ?? '', unitPrice: Number(l.unitPrice) };
        }),
        receptionDate: effectiveDate,
        zone,
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate: effectiveDate,
        dueDate,
        amountHT: Number(amountHT) || 0,
        vatAmount: Number(vatAmount) || 0,
        amountTTC: ttcNumber,
        paymentMethod: paymentMethod as PurchasePaymentMethod,
      });
      setStep('success');
    } catch (err) {
      setIntegrateError(err instanceof Error ? err.message : "Une erreur est survenue lors de l'intégration. Réessayez.");
    } finally {
      setIsIntegrating(false);
    }
  };

  const handleStartNewImport = () => {
    resetAll();
    setStep('upload');
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>OCR des factures</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Café & Caisse
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Importez une facture fournisseur (photo, PDF ou DOCX) — le système en extrait les informations, à vérifier avant intégration.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button onClick={onNavigateToPurchases} className={secondaryButtonClass}>
            <span>Achats et acquisitions</span>
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
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Facture intégrée</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md">
            La commande, la réception de stock et la facture fournisseur ont été enregistrées à partir des informations vérifiées.
          </p>
          <div className="flex items-center gap-2 pt-2">
            <button onClick={handleStartNewImport} className={secondaryButtonClass}>
              <ScanLine size={14} />
              <span>Importer une autre facture</span>
            </button>
            <button onClick={onNavigateToPurchases} className={primaryButtonClass}>
              <span>Voir les achats</span>
            </button>
          </div>
        </div>
      ) : step === 'confirm' ? (
        <div className="p-6 sm:p-8 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col items-center text-center gap-4">
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Cette photo convient-elle ?</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Vérifiez qu'elle est nette et lisible avant de lancer l'analyse — une facture floue ou coupée réduit la qualité de l'extraction.
            </p>
          </div>
          {pendingPreviewUrl && (
            <img
              src={pendingPreviewUrl}
              alt="Photo de la facture en attente de confirmation"
              className="w-full max-w-sm rounded-xl border border-gray-100 dark:border-gray-800 object-contain max-h-96"
            />
          )}
          <div className="flex items-center gap-3 pt-1">
            <button onClick={handleRetakePending} className={secondaryButtonClass}>
              <X size={14} />
              <span>Reprendre la photo</span>
            </button>
            <button onClick={handleConfirmPending} className={primaryButtonClass}>
              <CheckCircle2 size={14} />
              <span>Valider cette photo</span>
            </button>
          </div>
        </div>
      ) : step === 'extracting' ? (
        <div className="p-10 sm:p-16 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-500">
            <Loader2 size={26} className="animate-spin" />
          </div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Analyse du document en cours…</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">
            Lecture du texte de la facture (OCR). Cela peut prendre quelques secondes selon la taille et la qualité du fichier.
          </p>
        </div>
      ) : step === 'review' ? (
        <>
          <div
            className={`p-4 rounded-2xl border flex items-start gap-3 ${
              canIntegrate
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60'
                : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/60'
            }`}
          >
            {canIntegrate ? (
              <ShieldCheck size={20} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className={`text-sm font-bold ${canIntegrate ? 'text-emerald-800 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'}`}>
                Vérifiez et corrigez les informations détectées
              </p>
              <p className={`text-xs ${canIntegrate ? 'text-emerald-700/80 dark:text-emerald-400/80' : 'text-amber-700/80 dark:text-amber-400/80'}`}>
                Rien n'est encore intégré. L'extraction automatique peut contenir des erreurs — corrigez chaque champ avant de valider.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Original document preview */}
            <div className="lg:col-span-1 p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-3 h-fit">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                {filePreviewUrl ? <ImageIcon size={15} className="text-gray-400" /> : <FileText size={15} className="text-gray-400" />}
                Document original
              </h3>
              {filePreviewUrl ? (
                <img src={filePreviewUrl} alt={file?.name ?? 'Facture'} className="w-full rounded-xl border border-gray-100 dark:border-gray-800 object-contain max-h-80" />
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300">
                  <FileText size={16} className="text-gray-400 shrink-0" />
                  <span className="truncate">{file?.name}</span>
                </div>
              )}
              <button onClick={() => setShowRawText((v) => !v)} className={`${secondaryButtonClass} w-full`}>
                {showRawText ? <EyeOff size={13} /> : <Eye size={13} />}
                <span>{showRawText ? 'Masquer le texte détecté' : 'Voir le texte détecté'}</span>
              </button>
              {showRawText && (
                <pre className="text-[10px] leading-relaxed text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800 rounded-lg p-2.5 max-h-64 overflow-auto whitespace-pre-wrap">
                  {rawText}
                </pre>
              )}
            </div>

            {/* Editable fields */}
            <div className="lg:col-span-2 space-y-4">
              <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-4">
                <div>
                  <label className={labelClass}>Fournisseur *</label>
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setSupplierMode('existing')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                        supplierMode === 'existing' ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-gray-200 dark:border-gray-700 text-gray-500'
                      }`}
                    >
                      Fournisseur existant
                    </button>
                    <button
                      type="button"
                      onClick={() => setSupplierMode('new')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                        supplierMode === 'new' ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-gray-200 dark:border-gray-700 text-gray-500'
                      }`}
                    >
                      Nouveau fournisseur
                    </button>
                  </div>
                  {supplierMode === 'existing' ? (
                    <select
                      value={supplierId}
                      onChange={(e) => setSupplierId(e.target.value)}
                      className={`${inputBaseClass} appearance-none cursor-pointer ${!supplierId ? inputErrorClass : inputValidClass}`}
                    >
                      <option value="">Choisir un fournisseur</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={newSupplierName}
                      onChange={(e) => setNewSupplierName(e.target.value)}
                      placeholder="Nom / raison sociale"
                      className={`${inputBaseClass} ${!newSupplierName.trim() ? inputErrorClass : inputValidClass}`}
                    />
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Numéro de facture *</label>
                    <input
                      type="text"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      className={`${inputBaseClass} ${!invoiceNumber.trim() ? inputErrorClass : inputValidClass}`}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Date de facture *</label>
                    <input
                      type="date"
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      className={`${inputBaseClass} ${!invoiceDate ? inputErrorClass : inputValidClass}`}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Échéance *</label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className={`${inputBaseClass} ${!dueDate ? inputErrorClass : inputValidClass}`}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Mode de paiement *</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as PurchasePaymentMethod)}
                      className={`${inputBaseClass} appearance-none cursor-pointer ${!paymentMethod ? inputErrorClass : inputValidClass}`}
                    >
                      <option value="">Sélectionner</option>
                      {PURCHASE_PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Zone de réception *</label>
                    <select
                      value={zone}
                      onChange={(e) => setZone(e.target.value as StockZone)}
                      className={`${inputBaseClass} appearance-none cursor-pointer ${inputValidClass}`}
                    >
                      {STOCK_ZONES.map((z) => (
                        <option key={z} value={z}>{z}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Effectué par *</label>
                    <EmployeePicker
                      value={performedBy}
                      onChange={(v) => setPerformedBy(v)}
                      employees={employees}
                      className={`${inputBaseClass} appearance-none cursor-pointer ${!performedBy ? inputErrorClass : inputValidClass}`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={labelClass}>Montant HT</label>
                    <DecimalInput min={0} step="0.001"
                      value={amountHT}
                      onChange={(e) => setAmountHT(e.target.value)}
                      className={`${inputBaseClass} ${inputValidClass}`}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>TVA</label>
                    <DecimalInput min={0} step="0.001"
                      value={vatAmount}
                      onChange={(e) => setVatAmount(e.target.value)}
                      className={`${inputBaseClass} ${inputValidClass}`}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Montant TTC *</label>
                    <DecimalInput min={0} step="0.001"
                      value={amountTTC}
                      onChange={(e) => setAmountTTC(e.target.value)}
                      className={`${inputBaseClass} ${!amountTTC || Number.isNaN(ttcNumber) || ttcNumber <= 0 ? inputErrorClass : inputValidClass}`}
                    />
                  </div>
                </div>
                {ttcMismatch && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle size={12} className="shrink-0" />
                    Le total des lignes ({sumOfLines.toFixed(3)} DT) diffère du montant TTC saisi ({ttcNumber.toFixed(3)} DT).
                  </p>
                )}
              </div>

              {/* Line items */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Produits détectés</h3>
                  <button onClick={addLine} className={secondaryButtonClass}>
                    <Plus size={13} />
                    <span>Ajouter une ligne</span>
                  </button>
                </div>

                {lines.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">Aucune ligne détectée — ajoutez-en manuellement.</p>
                )}

                <div className="space-y-3">
                  {lines.map((line, idx) => {
                    const product = products.find((p) => p.id === line.productId);
                    const isTrivialMatch = product && normalizeKey(product.name) === normalizeKey(line.rawLabel);
                    const canSaveAlias = Boolean(line.productId) && line.rawLabel.trim().length > 0 && !isTrivialMatch;
                    const alreadySaved = savedAliasLineIds.has(line.id);
                    return (
                      <div key={line.id} className="p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 mb-1">Ligne {idx + 1} — texte détecté</p>
                            <input
                              type="text"
                              value={line.rawLabel}
                              onChange={(e) => updateLine(line.id, { rawLabel: e.target.value })}
                              placeholder="Libellé tel que lu sur la facture"
                              className={`${inputBaseClass} ${inputValidClass}`}
                            />
                          </div>
                          <button onClick={() => removeLine(line.id)} title="Supprimer la ligne" className="mt-5 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer shrink-0">
                            <Trash2 size={14} />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div className="sm:col-span-1">
                            <label className={labelClass}>Produit *</label>
                            <select
                              value={line.productId}
                              onChange={(e) => updateLine(line.id, { productId: e.target.value })}
                              className={`${inputBaseClass} appearance-none cursor-pointer ${!line.productId ? inputErrorClass : inputValidClass}`}
                            >
                              <option value="">Choisir un produit</option>
                              {STOCK_CATEGORIES.map((cat) => (
                                <optgroup key={cat} label={cat}>
                                  {products.filter((p) => p.category === cat).map((p) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className={labelClass}>Quantité *</label>
                            <DecimalInput min={0} step="0.001"
                              value={line.quantity}
                              onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                              className={`${inputBaseClass} ${!line.quantity || Number(line.quantity) <= 0 ? inputErrorClass : inputValidClass}`}
                            />
                          </div>
                          <div>
                            <label className={labelClass}>Prix unitaire (DT) *</label>
                            <DecimalInput min={0} step="0.001"
                              value={line.unitPrice}
                              onChange={(e) => updateLine(line.id, { unitPrice: e.target.value })}
                              className={`${inputBaseClass} ${line.unitPrice === '' || Number(line.unitPrice) < 0 ? inputErrorClass : inputValidClass}`}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <p className="text-[11px] text-gray-400">
                            Total ligne : <span className="font-semibold text-gray-600 dark:text-gray-300">{lineTotals[idx].toFixed(3)} DT</span>
                          </p>
                          {canSaveAlias && (
                            <button
                              onClick={() => handleSaveAlias(line)}
                              disabled={alreadySaved || savingAliasLineId === line.id}
                              title="Mémoriser cette correspondance pour les prochaines factures"
                              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer disabled:cursor-default ${
                                alreadySaved
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                              }`}
                            >
                              {savingAliasLineId === line.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : alreadySaved ? (
                                <BadgeCheck size={12} />
                              ) : (
                                <BookmarkPlus size={12} />
                              )}
                              <span>{alreadySaved ? 'Correspondance mémorisée' : 'Mémoriser cette correspondance'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {integrateError && (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 flex items-start gap-3">
              <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold text-red-700 dark:text-red-300">Échec de l'intégration</p>
                <p className="text-xs text-red-600/90 dark:text-red-400/90">{integrateError}</p>
              </div>
            </div>
          )}

          <div className="p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3 sticky bottom-4">
            <div className="text-xs">
              {canIntegrate ? (
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Informations complètes — prêt pour l'intégration.</span>
              ) : (
                <span className="font-semibold text-amber-600 dark:text-amber-400">Complétez les champs obligatoires (*) avant de valider.</span>
              )}
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button onClick={handleCancelReview} className={`${secondaryButtonClass} flex-1 sm:flex-none`}>
                <span>Annuler</span>
              </button>
              <button onClick={handleIntegrate} disabled={!canIntegrate || isIntegrating} className={`${primaryButtonClass} flex-1 sm:flex-none`}>
                {isIntegrating ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                <span>{isIntegrating ? 'Intégration…' : 'Valider et intégrer'}</span>
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
              <Sparkles size={26} />
            </div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">Glissez-déposez une facture ici</p>
            <p className="text-xs text-gray-400 my-2">ou</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
              <button onClick={() => fileInputRef.current?.click()} className={`${primaryButtonClass} mx-auto`}>
                <UploadCloud size={14} />
                <span>Importer depuis l'appareil</span>
              </button>
              {isMobile && (
                <button onClick={() => cameraInputRef.current?.click()} className={`${secondaryButtonClass} mx-auto`}>
                  <Camera size={14} />
                  <span>Prendre une photo</span>
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept={OCR_ACCEPTED_EXTENSIONS.join(',')} className="hidden" onChange={handleFileInputChange} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCameraInputChange} />
            <p className="text-[11px] text-gray-400 mt-4">
              Formats acceptés : photo (JPG, PNG, WEBP), PDF, DOCX — Taille max {(MAX_OCR_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)} Mo
            </p>
          </div>

          {extractError && (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 flex items-start gap-3">
              <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-700 dark:text-red-300">Le document n'a pas pu être analysé</p>
                <p className="text-xs text-red-600/90 dark:text-red-400/90">{extractError}</p>
              </div>
            </div>
          )}

          <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-2">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Comment ça marche</h3>
            <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1.5 list-disc list-inside">
              <li>Le système lit le document et tente d'extraire le fournisseur, le numéro, la date, les produits, quantités, prix, ainsi que les montants HT, TVA et TTC.</li>
              <li>Un écran de vérification vous permet de corriger toute information avant intégration — rien n'est enregistré automatiquement.</li>
              <li>
                Quand le libellé d'un produit sur la facture ne correspond pas exactement à un produit existant, choisissez le bon produit puis
                mémorisez la correspondance : elle sera reconnue automatiquement sur les prochaines factures.
              </li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
};
