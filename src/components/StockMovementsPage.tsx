import { DecimalInput } from './ui/DecimalInput';
import { EmployeePicker } from './ui/EmployeePicker';
import React, { useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  Plus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  FilterX,
  AlertCircle,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  X,
  Ban,
  History,
} from 'lucide-react';
import {
  StockProduct,
  StockLot,
  StockZone,
  StockOperationType,
  StockLedgerEntry,
  STOCK_ZONES,
  generateStockId,
  generateAutoLotNumber,
  getZoneQty,
} from '../data/stockModel';

interface StockMovementsPageProps {
  products: StockProduct[];
  lots: StockLot[];
  ledger: StockLedgerEntry[];
  employees: string[];
  onNavigateToDashboard: () => void;
  onNavigateToStock: () => void;
  onPostEntries: (entries: StockLedgerEntry[], lotChanges?: { upsert?: StockLot[] }) => void;
  onCancelEntry: (entryId: string, cancelledBy: string) => void;
  isDarkMode?: boolean;
}

type OperationKind = 'Entrée' | 'Sortie' | 'Transfert';
type Step = 'form' | 'preview' | 'success';

interface MovementFormState {
  operationKind: OperationKind;
  productId: string;
  zone: StockZone;
  fromZone: StockZone;
  toZone: StockZone;
  quantity: string;
  reason: string;
  comment: string;
  performedBy: string;
  lotNumber: string;
  expiryDate: string;
  lotId: string;
}

const createEmptyMovementForm = (): MovementFormState => ({
  operationKind: 'Entrée',
  productId: '',
  zone: 'Réserve principale',
  fromZone: 'Réserve principale',
  toZone: 'Dépôt',
  quantity: '',
  reason: '',
  comment: '',
  performedBy: '',
  lotNumber: '',
  expiryDate: '',
  lotId: '',
});

interface MovementIssue {
  field: string;
  message: string;
}

const inputBaseClass =
  'w-full px-3.5 py-2 text-xs rounded-xl border bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 transition';
const inputValidClass = 'border-gray-200 dark:border-gray-700 focus:border-emerald-500 focus:ring-emerald-500';
const inputErrorClass = 'border-red-400 dark:border-red-500/70 focus:border-red-500 focus:ring-red-500';
const labelClass = 'text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 block';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer';

export const StockMovementsPage: React.FC<StockMovementsPageProps> = ({
  products,
  lots,
  ledger,
  employees,
  onNavigateToDashboard,
  onNavigateToStock,
  onPostEntries,
  onCancelEntry,
}) => {
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [form, setForm] = useState<MovementFormState>(createEmptyMovementForm());
  const [hasAttemptedVerify, setHasAttemptedVerify] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [cancelTarget, setCancelTarget] = useState<StockLedgerEntry | null>(null);
  const [cancelBy, setCancelBy] = useState('');

  // History filters
  const [filterProduct, setFilterProduct] = useState('all');
  const [filterZone, setFilterZone] = useState<'all' | StockZone>('all');
  const [filterType, setFilterType] = useState<'all' | StockOperationType>('all');
  const [filterDate, setFilterDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  const product = useMemo(() => products.find((p) => p.id === form.productId), [products, form.productId]);

  const productLotsInZone = (zone: StockZone) =>
    lots.filter((l) => l.productId === form.productId && l.zone === zone);

  const updateForm = (patch: Partial<MovementFormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const handleOperationKindChange = (kind: OperationKind) => {
    setForm((prev) => ({ ...createEmptyMovementForm(), operationKind: kind, performedBy: prev.performedBy }));
  };

  const handleProductChange = (productId: string) => {
    setForm((prev) => ({ ...prev, productId, lotId: '', lotNumber: '', expiryDate: '' }));
  };

  const issues: MovementIssue[] = useMemo(() => {
    const list: MovementIssue[] = [];
    if (!form.productId) list.push({ field: 'product', message: 'Le produit est obligatoire.' });
    const qtyNum = Number(form.quantity);
    if (!form.quantity.trim()) list.push({ field: 'quantity', message: 'La quantité est obligatoire.' });
    else if (Number.isNaN(qtyNum) || qtyNum <= 0) list.push({ field: 'quantity', message: 'La quantité doit être un nombre supérieur à 0.' });

    if (!form.reason.trim()) list.push({ field: 'reason', message: 'Le motif est obligatoire.' });
    if (!form.performedBy) list.push({ field: 'performedBy', message: "L'employé ayant effectué l'opération est obligatoire." });

    if (form.operationKind === 'Transfert' && form.fromZone === form.toZone) {
      list.push({ field: 'zones', message: "La zone d'origine et la zone de destination doivent être différentes." });
    }

    if (product?.lotTracked) {
      if (form.operationKind === 'Entrée') {
        // Le numéro de lot reste optionnel (voir generateAutoLotNumber) : s'il est laissé vide, un
        // numéro est généré automatiquement à l'enregistrement plutôt que de bloquer la saisie.
        if (!form.expiryDate) list.push({ field: 'expiryDate', message: 'La date de péremption est obligatoire pour ce produit.' });
      } else if (!form.lotId) {
        list.push({ field: 'lotId', message: 'Veuillez sélectionner le lot concerné pour ce produit.' });
      }
    }

    return list;
  }, [form, product]);

  const issuesByField = new Map(issues.map((i) => [i.field, i.message]));
  const showErrors = hasAttemptedVerify;

  const handleVerify = () => {
    setHasAttemptedVerify(true);
    if (issues.length === 0) setStep('preview');
  };

  const handleBackToForm = () => setStep('form');

  const handleConfirmSave = async () => {
    if (isSaving || !product) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const qty = Number(form.quantity);
      const now = new Date().toISOString();
      const lotChanges: StockLot[] = [];
      let entries: StockLedgerEntry[] = [];

      if (form.operationKind === 'Entrée') {
        const before = getZoneQty(product, form.zone);
        let lotId: string | undefined;
        let lotNumberUsedForEntry: string | undefined;
        if (product.lotTracked) {
          const lotNumber = form.lotNumber.trim() || generateAutoLotNumber();
          const newLot: StockLot = {
            id: generateStockId('lot'),
            productId: product.id,
            lotNumber,
            zone: form.zone,
            quantity: qty,
            expiryDate: form.expiryDate,
            receivedAt: now.slice(0, 10),
          };
          lotChanges.push(newLot);
          lotId = newLot.id;
          lotNumberUsedForEntry = lotNumber;
        }
        entries = [
          {
            id: generateStockId('led'),
            timestamp: now,
            type: 'Entrée',
            productId: product.id,
            zone: form.zone,
            quantityBefore: before,
            quantityDelta: qty,
            quantityAfter: before + qty,
            reason: form.reason.trim(),
            comment: form.comment.trim() || undefined,
            lotId,
            lotNumber: lotNumberUsedForEntry,
            expiryDate: product.lotTracked ? form.expiryDate : undefined,
            performedBy: form.performedBy,
            status: 'Confirmé',
            valueImpact: qty * product.averageCost,
          },
        ];
      } else if (form.operationKind === 'Sortie') {
        const before = getZoneQty(product, form.zone);
        if (product.lotTracked && form.lotId) {
          const lot = lots.find((l) => l.id === form.lotId);
          if (lot) lotChanges.push({ ...lot, quantity: lot.quantity - qty });
        }
        entries = [
          {
            id: generateStockId('led'),
            timestamp: now,
            type: 'Sortie',
            productId: product.id,
            zone: form.zone,
            quantityBefore: before,
            quantityDelta: -qty,
            quantityAfter: before - qty,
            reason: form.reason.trim(),
            comment: form.comment.trim() || undefined,
            lotId: form.lotId || undefined,
            lotNumber: product.lotTracked ? lots.find((l) => l.id === form.lotId)?.lotNumber : undefined,
            performedBy: form.performedBy,
            status: 'Confirmé',
            valueImpact: -qty * product.averageCost,
          },
        ];
      } else {
        // Transfert
        const beforeFrom = getZoneQty(product, form.fromZone);
        const beforeTo = getZoneQty(product, form.toZone);
        const groupId = generateStockId('trf');
        let lotNumberUsed: string | undefined;

        if (product.lotTracked && form.lotId) {
          const lot = lots.find((l) => l.id === form.lotId);
          if (lot) {
            lotChanges.push({ ...lot, zone: form.toZone });
            lotNumberUsed = lot.lotNumber;
          }
        }

        entries = [
          {
            id: generateStockId('led'),
            groupId,
            timestamp: now,
            type: 'Transfert',
            productId: product.id,
            zone: form.fromZone,
            relatedZone: form.toZone,
            quantityBefore: beforeFrom,
            quantityDelta: -qty,
            quantityAfter: beforeFrom - qty,
            reason: form.reason.trim(),
            comment: form.comment.trim() || undefined,
            lotId: form.lotId || undefined,
            lotNumber: lotNumberUsed,
            performedBy: form.performedBy,
            status: 'Confirmé',
            valueImpact: -qty * product.averageCost,
          },
          {
            id: generateStockId('led'),
            groupId,
            timestamp: now,
            type: 'Transfert',
            productId: product.id,
            zone: form.toZone,
            relatedZone: form.fromZone,
            quantityBefore: beforeTo,
            quantityDelta: qty,
            quantityAfter: beforeTo + qty,
            reason: form.reason.trim(),
            comment: form.comment.trim() || undefined,
            lotId: form.lotId || undefined,
            lotNumber: lotNumberUsed,
            performedBy: form.performedBy,
            status: 'Confirmé',
            valueImpact: qty * product.averageCost,
          },
        ];
      }

      await new Promise((resolve) => setTimeout(resolve, 600));
      onPostEntries(entries, lotChanges.length > 0 ? { upsert: lotChanges } : undefined);
      setStep('success');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Une erreur est survenue lors de l'enregistrement. Veuillez réessayer.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartNew = () => {
    setForm(createEmptyMovementForm());
    setHasAttemptedVerify(false);
    setSaveError(null);
    setStep('form');
    setShowCreatePanel(false);
  };

  const handleOpenCreatePanel = () => {
    setForm(createEmptyMovementForm());
    setHasAttemptedVerify(false);
    setSaveError(null);
    setStep('form');
    setShowCreatePanel(true);
  };

  // --- History ---

  const filteredLedger = useMemo(() => {
    return ledger.filter((entry) => {
      if (filterProduct !== 'all' && entry.productId !== filterProduct) return false;
      if (filterZone !== 'all' && entry.zone !== filterZone && entry.relatedZone !== filterZone) return false;
      if (filterType !== 'all' && entry.type !== filterType) return false;
      if (filterDate && !entry.timestamp.startsWith(filterDate)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const p = products.find((pr) => pr.id === entry.productId);
        const matches =
          p?.name.toLowerCase().includes(q) || entry.reason.toLowerCase().includes(q) || (entry.comment ?? '').toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [ledger, filterProduct, filterZone, filterType, filterDate, searchQuery, products]);

  const totalPages = Math.max(1, Math.ceil(filteredLedger.length / rowsPerPage));
  const paginatedLedger = useMemo(
    () => filteredLedger.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage),
    [filteredLedger, currentPage]
  );

  const handleResetFilters = () => {
    setFilterProduct('all');
    setFilterZone('all');
    setFilterType('all');
    setFilterDate('');
    setSearchQuery('');
    setCurrentPage(1);
  };

  const handleRequestCancel = (entry: StockLedgerEntry) => {
    setCancelTarget(entry);
    setCancelBy('');
  };

  const handleConfirmCancel = () => {
    if (!cancelTarget || !cancelBy) return;
    onCancelEntry(cancelTarget.id, cancelBy);
    setCancelTarget(null);
    setCancelBy('');
  };

  const getTypeBadgeClass = (type: StockOperationType) => {
    switch (type) {
      case 'Entrée':
        return 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70';
      case 'Sortie':
        return 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/70';
      case 'Transfert':
        return 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/70';
      default:
        return 'bg-gray-50 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700';
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>Mouvements de stock</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Café & Caisse
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Entrées, sorties et transferts manuels entre la Réserve principale et le Dépôt.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button onClick={onNavigateToStock} className={secondaryButtonClass}>
            <History size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Voir le stock</span>
          </button>
          {!showCreatePanel && (
            <button onClick={handleOpenCreatePanel} className={primaryButtonClass}>
              <Plus size={14} />
              <span>Créer un mouvement</span>
            </button>
          )}
          <button
            onClick={onNavigateToDashboard}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700/80 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition active:scale-98 cursor-pointer"
          >
            <span>Tableau de bord</span>
          </button>
        </div>
      </div>

      {/* Create movement workflow */}
      {showCreatePanel && (
        <div className="space-y-4">
          {step === 'success' ? (
            <div className="p-8 sm:p-12 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-500">
                <CheckCircle2 size={30} />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Mouvement enregistré</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md">
                Le stock a été mis à jour et l'opération est disponible dans l'historique ci-dessous.
              </p>
              <div className="flex items-center gap-2 pt-2">
                <button onClick={handleStartNew} className={secondaryButtonClass}>
                  <Plus size={14} />
                  <span>Créer un autre mouvement</span>
                </button>
                <button onClick={() => setShowCreatePanel(false)} className={primaryButtonClass}>
                  <History size={14} />
                  <span>Voir l'historique</span>
                </button>
              </div>
            </div>
          ) : step === 'preview' ? (
            <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60">
                <ShieldCheck size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">Vérifiez le mouvement avant confirmation</p>
                  <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">Le stock ne sera modifié qu'après confirmation.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-gray-400 font-semibold block mb-0.5">Type</span>
                  <span className="font-bold text-gray-900 dark:text-white">{form.operationKind}</span>
                </div>
                <div>
                  <span className="text-gray-400 font-semibold block mb-0.5">Produit</span>
                  <span className="font-bold text-gray-900 dark:text-white">{product?.name}</span>
                </div>
                <div>
                  <span className="text-gray-400 font-semibold block mb-0.5">Quantité</span>
                  <span className="font-bold text-gray-900 dark:text-white">
                    {form.quantity} {product?.unit}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 font-semibold block mb-0.5">
                    {form.operationKind === 'Transfert' ? 'Origine → Destination' : 'Zone'}
                  </span>
                  <span className="font-bold text-gray-900 dark:text-white">
                    {form.operationKind === 'Transfert' ? `${form.fromZone} → ${form.toZone}` : form.zone}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 font-semibold block mb-0.5">Motif</span>
                  <span className="font-bold text-gray-900 dark:text-white">{form.reason}</span>
                </div>
                <div>
                  <span className="text-gray-400 font-semibold block mb-0.5">Effectué par</span>
                  <span className="font-bold text-gray-900 dark:text-white">{form.performedBy}</span>
                </div>
                {form.comment && (
                  <div className="sm:col-span-2">
                    <span className="text-gray-400 font-semibold block mb-0.5">Commentaire</span>
                    <span className="text-gray-700 dark:text-gray-300">{form.comment}</span>
                  </div>
                )}
                {product?.lotTracked && (form.lotNumber || form.lotId) && (
                  <div className="sm:col-span-2">
                    <span className="text-gray-400 font-semibold block mb-0.5">Lot</span>
                    <span className="text-gray-700 dark:text-gray-300">
                      {form.operationKind === 'Entrée'
                        ? `Nouveau lot ${form.lotNumber} — péremption ${form.expiryDate}`
                        : lots.find((l) => l.id === form.lotId)?.lotNumber}
                    </span>
                  </div>
                )}
              </div>

              {product && (
                <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 space-y-1.5 text-xs">
                  <p className="font-semibold text-gray-700 dark:text-gray-300">Conséquences sur le stock</p>
                  {form.operationKind === 'Transfert' ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-500">{form.fromZone} :</span>
                        <span>
                          {getZoneQty(product, form.fromZone)} → {getZoneQty(product, form.fromZone) - Number(form.quantity || 0)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">{form.toZone} :</span>
                        <span>
                          {getZoneQty(product, form.toZone)} → {getZoneQty(product, form.toZone) + Number(form.quantity || 0)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between">
                      <span className="text-gray-500">{form.zone} :</span>
                      <span>
                        {getZoneQty(product, form.zone)} →{' '}
                        {getZoneQty(product, form.zone) + (form.operationKind === 'Entrée' ? 1 : -1) * Number(form.quantity || 0)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {saveError && (
                <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                  <AlertCircle size={14} /> {saveError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button onClick={handleBackToForm} disabled={isSaving} className={secondaryButtonClass}>
                  <span>Modifier</span>
                </button>
                <button onClick={handleConfirmSave} disabled={isSaving} className={primaryButtonClass}>
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                  <span>{isSaving ? 'Enregistrement…' : 'Confirmer et enregistrer'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-900 dark:text-white">Nouveau mouvement</h2>
                <button onClick={() => setShowCreatePanel(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
                  <X size={16} />
                </button>
              </div>

              {/* Operation kind */}
              <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg p-0.5 bg-gray-50/50 dark:bg-gray-800/50 w-fit">
                {(['Entrée', 'Sortie', 'Transfert'] as OperationKind[]).map((kind) => (
                  <button
                    key={kind}
                    onClick={() => handleOperationKindChange(kind)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer inline-flex items-center gap-1.5 ${
                      form.operationKind === kind
                        ? 'bg-[#00A86B] text-white shadow-xs'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'
                    }`}
                  >
                    {kind === 'Entrée' ? <ArrowDownToLine size={12} /> : kind === 'Sortie' ? <ArrowUpFromLine size={12} /> : <ArrowRightLeft size={12} />}
                    {kind}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className={labelClass}>Produit *</label>
                  <div className="relative">
                    <select
                      value={form.productId}
                      onChange={(e) => handleProductChange(e.target.value)}
                      className={`${inputBaseClass} appearance-none pr-8 cursor-pointer ${showErrors && issuesByField.has('product') ? inputErrorClass : inputValidClass}`}
                    >
                      <option value="">Sélectionner un produit</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku})
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                  {showErrors && issuesByField.get('product') && (
                    <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('product')}</p>
                  )}
                </div>

                <div>
                  <label className={labelClass}>Quantité *</label>
                  <DecimalInput
                    min={0}
                    step="any"
                    value={form.quantity}
                    onChange={(e) => updateForm({ quantity: e.target.value })}
                    placeholder={product ? `en ${product.unit}` : 'Quantité'}
                    className={`${inputBaseClass} ${showErrors && issuesByField.has('quantity') ? inputErrorClass : inputValidClass}`}
                  />
                  {showErrors && issuesByField.get('quantity') && (
                    <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('quantity')}</p>
                  )}
                </div>

                {form.operationKind === 'Transfert' ? (
                  <>
                    <div>
                      <label className={labelClass}>Zone d'origine *</label>
                      <select
                        value={form.fromZone}
                        onChange={(e) => updateForm({ fromZone: e.target.value as StockZone, lotId: '' })}
                        className={`${inputBaseClass} appearance-none cursor-pointer ${inputValidClass}`}
                      >
                        {STOCK_ZONES.map((z) => (
                          <option key={z} value={z}>{z}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Zone de destination *</label>
                      <select
                        value={form.toZone}
                        onChange={(e) => updateForm({ toZone: e.target.value as StockZone })}
                        className={`${inputBaseClass} appearance-none cursor-pointer ${showErrors && issuesByField.has('zones') ? inputErrorClass : inputValidClass}`}
                      >
                        {STOCK_ZONES.map((z) => (
                          <option key={z} value={z}>{z}</option>
                        ))}
                      </select>
                      {showErrors && issuesByField.get('zones') && (
                        <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('zones')}</p>
                      )}
                    </div>
                  </>
                ) : (
                  <div>
                    <label className={labelClass}>Zone *</label>
                    <select
                      value={form.zone}
                      onChange={(e) => updateForm({ zone: e.target.value as StockZone, lotId: '' })}
                      className={`${inputBaseClass} appearance-none cursor-pointer ${inputValidClass}`}
                    >
                      {STOCK_ZONES.map((z) => (
                        <option key={z} value={z}>{z}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className={labelClass}>Motif *</label>
                  <input
                    type="text"
                    value={form.reason}
                    onChange={(e) => updateForm({ reason: e.target.value })}
                    placeholder="Ex: Réception fournisseur, Réassort comptoir…"
                    className={`${inputBaseClass} ${showErrors && issuesByField.has('reason') ? inputErrorClass : inputValidClass}`}
                  />
                  {showErrors && issuesByField.get('reason') && (
                    <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('reason')}</p>
                  )}
                </div>

                <div>
                  <label className={labelClass}>Effectué par *</label>
                  <EmployeePicker
                    value={form.performedBy}
                    onChange={(v) => updateForm({ performedBy: v })}
                    employees={employees}
                    className={`${inputBaseClass} appearance-none cursor-pointer ${showErrors && issuesByField.has('performedBy') ? inputErrorClass : inputValidClass}`}
                  />
                  {showErrors && issuesByField.get('performedBy') && (
                    <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('performedBy')}</p>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label className={labelClass}>Commentaire</label>
                  <textarea
                    value={form.comment}
                    onChange={(e) => updateForm({ comment: e.target.value })}
                    rows={2}
                    placeholder="Optionnel"
                    className={`${inputBaseClass} ${inputValidClass} resize-none`}
                  />
                </div>

                {/* Lot fields */}
                {product?.lotTracked && form.operationKind === 'Entrée' && (
                  <>
                    <div>
                      <label className={labelClass}>Numéro de lot (optionnel)</label>
                      <input
                        type="text"
                        value={form.lotNumber}
                        onChange={(e) => updateForm({ lotNumber: e.target.value })}
                        placeholder="Ex: ETH-2026-016 — laissez vide pour générer automatiquement"
                        className={`${inputBaseClass} ${inputValidClass}`}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Date de péremption *</label>
                      <input
                        type="date"
                        value={form.expiryDate}
                        onChange={(e) => updateForm({ expiryDate: e.target.value })}
                        className={`${inputBaseClass} ${showErrors && issuesByField.has('expiryDate') ? inputErrorClass : inputValidClass}`}
                      />
                      {showErrors && issuesByField.get('expiryDate') && (
                        <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('expiryDate')}</p>
                      )}
                    </div>
                  </>
                )}

                {product?.lotTracked && form.operationKind !== 'Entrée' && (
                  <div className="sm:col-span-2">
                    <label className={labelClass}>
                      Lot concerné * (zone : {form.operationKind === 'Transfert' ? form.fromZone : form.zone})
                    </label>
                    <select
                      value={form.lotId}
                      onChange={(e) => {
                        const lot = lots.find((l) => l.id === e.target.value);
                        updateForm({
                          lotId: e.target.value,
                          quantity: form.operationKind === 'Transfert' && lot ? String(lot.quantity) : form.quantity,
                        });
                      }}
                      className={`${inputBaseClass} appearance-none cursor-pointer ${showErrors && issuesByField.has('lotId') ? inputErrorClass : inputValidClass}`}
                    >
                      <option value="">Sélectionner un lot</option>
                      {productLotsInZone(form.operationKind === 'Transfert' ? form.fromZone : form.zone).map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.lotNumber} — {l.quantity} {product.unit} — péremption {l.expiryDate}
                        </option>
                      ))}
                    </select>
                    {form.operationKind === 'Transfert' && form.lotId && (
                      <p className="text-[11px] text-gray-400 mt-1">Un transfert déplace le lot entier vers la zone de destination.</p>
                    )}
                    {showErrors && issuesByField.get('lotId') && (
                      <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('lotId')}</p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                <button onClick={() => setShowCreatePanel(false)} className={secondaryButtonClass}>
                  <span>Annuler la saisie</span>
                </button>
                <button onClick={handleVerify} className={primaryButtonClass}>
                  <ShieldCheck size={14} />
                  <span>Vérifier le mouvement</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* History filters */}
      <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2.5 flex-1">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                placeholder="Produit, motif, commentaire..."
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <select
              value={filterProduct}
              onChange={(e) => { setFilterProduct(e.target.value); setCurrentPage(1); }}
              className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
            >
              <option value="all">Tous les produits</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select
              value={filterZone}
              onChange={(e) => { setFilterZone(e.target.value as 'all' | StockZone); setCurrentPage(1); }}
              className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
            >
              <option value="all">Toutes les zones</option>
              {STOCK_ZONES.map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
            <select
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value as 'all' | StockOperationType); setCurrentPage(1); }}
              className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
            >
              <option value="all">Tous les types</option>
              {(['Entrée', 'Sortie', 'Transfert', 'Inventaire', 'Perte', 'Ajustement'] as StockOperationType[]).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => { setFilterDate(e.target.value); setCurrentPage(1); }}
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <button
            onClick={handleResetFilters}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 shadow-2xs transition active:scale-98 shrink-0 cursor-pointer"
          >
            <FilterX size={14} className="text-gray-500" />
            <span>Réinitialiser</span>
          </button>
        </div>
      </div>

      {/* History table */}
      <div className="rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 text-[11px] font-bold text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-gray-800/30">
                <th className="py-3.5 px-4">Date & heure</th>
                <th className="py-3.5 px-4">Type</th>
                <th className="py-3.5 px-4">Produit</th>
                <th className="py-3.5 px-4">Zone</th>
                <th className="py-3.5 px-4 text-center">Quantité</th>
                <th className="py-3.5 px-4">Motif</th>
                <th className="py-3.5 px-4">Effectué par</th>
                <th className="py-3.5 px-4">Statut</th>
                <th className="py-3.5 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 text-xs">
              {paginatedLedger.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-400">
                    Aucun mouvement pour ces filtres.
                  </td>
                </tr>
              ) : (
                paginatedLedger.map((entry) => {
                  const p = products.find((pr) => pr.id === entry.productId);
                  return (
                    <tr key={entry.id} className={`hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors ${entry.status === 'Annulé' ? 'opacity-50' : ''}`}>
                      <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        {entry.timestamp.replace('T', ' ').slice(0, 16)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${getTypeBadgeClass(entry.type)}`}>
                          {entry.type}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-gray-900 dark:text-white">{p?.name ?? '—'}</td>
                      <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300">
                        {entry.zone}
                        {entry.relatedZone ? ` → ${entry.relatedZone}` : ''}
                      </td>
                      <td className={`py-3.5 px-4 text-center font-bold ${entry.quantityDelta < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {entry.quantityDelta > 0 ? '+' : ''}
                        {entry.quantityDelta}
                      </td>
                      <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300">
                        <p>{entry.reason}</p>
                        {entry.comment && <p className="text-[11px] text-gray-400">{entry.comment}</p>}
                      </td>
                      <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300">{entry.performedBy}</td>
                      <td className="py-3.5 px-4">
                        {entry.status === 'Annulé' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700">
                            Annulé
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70">
                            Confirmé
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {entry.status === 'Confirmé' && !entry.lotId && (
                          <button
                            onClick={() => handleRequestCancel(entry)}
                            title="Annuler ce mouvement"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"
                          >
                            <Ban size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span>sur un total de {filteredLedger.length} mouvements</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 py-1 font-semibold text-gray-700 dark:text-gray-300">
              Page {currentPage} sur {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Cancel confirmation modal */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200" onClick={() => setCancelTarget(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                <Ban size={16} className="text-red-500" /> Annuler ce mouvement
              </h3>
              <button onClick={() => setCancelTarget(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <p className="text-gray-600 dark:text-gray-300">
                Cette action va inverser l'effet sur le stock. L'opération restera visible dans l'historique avec le statut « Annulé ».
              </p>
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Produit :</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{products.find((p) => p.id === cancelTarget.productId)?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Zone :</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{cancelTarget.zone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Nouveau stock après annulation :</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{cancelTarget.quantityAfter - cancelTarget.quantityDelta}</span>
                </div>
              </div>
              <div>
                <label className={labelClass}>Annulé par *</label>
                <EmployeePicker
                  value={cancelBy}
                  onChange={(v) => setCancelBy(v)}
                  employees={employees}
                  className={`${inputBaseClass} appearance-none cursor-pointer ${inputValidClass}`}
                />
              </div>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-2">
              <button onClick={() => setCancelTarget(null)} className={secondaryButtonClass}>
                <span>Retour</span>
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={!cancelBy}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Ban size={14} />
                <span>Confirmer l'annulation</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
