import { DecimalInput } from './ui/DecimalInput';
import { EmployeePicker } from './ui/EmployeePicker';
import React, { useMemo, useState } from 'react';
import {
  PackageMinus,
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
  Plus,
  History,
  TrendingDown,
  Wallet,
} from 'lucide-react';
import {
  StockProduct,
  StockLot,
  StockZone,
  StockCategory,
  LossReason,
  LOSS_REASONS,
  STOCK_ZONES,
  STOCK_CATEGORIES,
  StockLedgerEntry,
  generateStockId,
  getZoneQty,
} from '../data/stockModel';

interface StockLossesPageProps {
  products: StockProduct[];
  lots: StockLot[];
  ledger: StockLedgerEntry[];
  employees: string[];
  onNavigateToDashboard: () => void;
  onNavigateToStock: () => void;
  onPostEntries: (entries: StockLedgerEntry[]) => void;
  isDarkMode?: boolean;
}

type Direction = 'Perte' | 'Ajustement';
type Step = 'form' | 'preview' | 'success';

interface LossFormState {
  direction: Direction;
  productId: string;
  zone: StockZone;
  quantity: string;
  reason: LossReason;
  dateTime: string;
  comment: string;
  performedBy: string;
  lotId: string;
}

const nowLocalDateTime = (): string => {
  const d = new Date();
  d.setSeconds(0, 0);
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
};

const createEmptyLossForm = (): LossFormState => ({
  direction: 'Perte',
  productId: '',
  zone: 'Réserve principale',
  quantity: '',
  reason: 'Perte',
  dateTime: nowLocalDateTime(),
  comment: '',
  performedBy: '',
  lotId: '',
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

export const StockLossesPage: React.FC<StockLossesPageProps> = ({
  products,
  lots,
  ledger,
  employees,
  onNavigateToDashboard,
  onNavigateToStock,
  onPostEntries,
}) => {
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [form, setForm] = useState<LossFormState>(createEmptyLossForm());
  const [hasAttemptedVerify, setHasAttemptedVerify] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Report filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterProduct, setFilterProduct] = useState('all');
  const [filterCategory, setFilterCategory] = useState<'all' | StockCategory>('all');
  const [filterReason, setFilterReason] = useState<'all' | LossReason>('all');
  const [filterZone, setFilterZone] = useState<'all' | StockZone>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  const product = useMemo(() => products.find((p) => p.id === form.productId), [products, form.productId]);

  const updateForm = (patch: Partial<LossFormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const handleProductChange = (productId: string) => setForm((prev) => ({ ...prev, productId, lotId: '' }));

  const issues = useMemo(() => {
    const list: { field: string; message: string }[] = [];
    if (!form.productId) list.push({ field: 'product', message: 'Le produit est obligatoire.' });
    const qtyNum = Number(form.quantity);
    if (!form.quantity.trim()) list.push({ field: 'quantity', message: 'La quantité est obligatoire.' });
    else if (Number.isNaN(qtyNum) || qtyNum <= 0) list.push({ field: 'quantity', message: 'La quantité doit être un nombre supérieur à 0.' });
    if (!form.dateTime) list.push({ field: 'dateTime', message: 'La date et l\'heure sont obligatoires.' });
    if (!form.performedBy) list.push({ field: 'performedBy', message: "L'employé ayant effectué l'opération est obligatoire." });
    if (product?.lotTracked && !form.lotId) list.push({ field: 'lotId', message: 'Veuillez sélectionner le lot concerné pour ce produit.' });
    return list;
  }, [form, product]);

  const issuesByField = new Map(issues.map((i) => [i.field, i.message]));
  const showErrors = hasAttemptedVerify;

  const handleVerify = () => {
    setHasAttemptedVerify(true);
    if (issues.length === 0) setStep('preview');
  };

  const handleConfirmSave = async () => {
    if (isSaving || !product) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const qty = Number(form.quantity);
      const signedDelta = form.direction === 'Perte' ? -qty : qty;
      const before = getZoneQty(product, form.zone);
      const timestamp = new Date(form.dateTime).toISOString();
      // The lot's own quantity is updated automatically server-side (upsertLotForEntry, keyed off
      // this entry's lotNumber) — there is no separate lot-changes payload to build here.

      const entry: StockLedgerEntry = {
        id: generateStockId('led'),
        timestamp,
        type: form.direction,
        productId: product.id,
        zone: form.zone,
        quantityBefore: before,
        quantityDelta: signedDelta,
        quantityAfter: before + signedDelta,
        reason: form.reason,
        comment: form.comment.trim() || undefined,
        lotId: form.lotId || undefined,
        lotNumber: product.lotTracked ? lots.find((l) => l.id === form.lotId)?.lotNumber : undefined,
        performedBy: form.performedBy,
        status: 'Confirmé',
        valueImpact: signedDelta * product.averageCost,
      };

      await new Promise((resolve) => setTimeout(resolve, 600));
      onPostEntries([entry]);
      setStep('success');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartNew = () => {
    setForm(createEmptyLossForm());
    setHasAttemptedVerify(false);
    setSaveError(null);
    setStep('form');
    setShowCreatePanel(false);
  };

  const handleOpenCreatePanel = () => {
    setForm(createEmptyLossForm());
    setHasAttemptedVerify(false);
    setSaveError(null);
    setStep('form');
    setShowCreatePanel(true);
  };

  // --- Report / history ---
  const lossEntries = useMemo(() => ledger.filter((e) => e.type === 'Perte' || e.type === 'Ajustement'), [ledger]);

  const filteredEntries = useMemo(() => {
    return lossEntries.filter((entry) => {
      const p = products.find((pr) => pr.id === entry.productId);
      if (filterProduct !== 'all' && entry.productId !== filterProduct) return false;
      if (filterCategory !== 'all' && p?.category !== filterCategory) return false;
      if (filterReason !== 'all' && entry.reason !== filterReason) return false;
      if (filterZone !== 'all' && entry.zone !== filterZone) return false;
      if (dateFrom && entry.timestamp.slice(0, 10) < dateFrom) return false;
      if (dateTo && entry.timestamp.slice(0, 10) > dateTo) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        if (!p?.name.toLowerCase().includes(q) && !(entry.comment ?? '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [lossEntries, products, filterProduct, filterCategory, filterReason, filterZone, dateFrom, dateTo, searchQuery]);

  const totalLostQty = useMemo(
    () => filteredEntries.filter((e) => e.type === 'Perte' && e.status === 'Confirmé').reduce((sum, e) => sum + Math.abs(e.quantityDelta), 0),
    [filteredEntries]
  );
  const totalLostValue = useMemo(
    () => filteredEntries.filter((e) => e.type === 'Perte' && e.status === 'Confirmé').reduce((sum, e) => sum + Math.abs(e.valueImpact), 0),
    [filteredEntries]
  );

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / rowsPerPage));
  const paginatedEntries = useMemo(
    () => filteredEntries.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage),
    [filteredEntries, currentPage]
  );

  const handleResetFilters = () => {
    setDateFrom('');
    setDateTo('');
    setFilterProduct('all');
    setFilterCategory('all');
    setFilterReason('all');
    setFilterZone('all');
    setSearchQuery('');
    setCurrentPage(1);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>Pertes & ajustements</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Café & Caisse
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Enregistrement manuel des pertes, casses et ajustements de stock.
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
              <span>Enregistrer une perte</span>
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

      {showCreatePanel && (
        <div className="space-y-4">
          {step === 'success' ? (
            <div className="p-8 sm:p-12 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-500">
                <CheckCircle2 size={30} />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Opération enregistrée</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md">Le stock a été mis à jour et l'opération est disponible dans le rapport ci-dessous.</p>
              <div className="flex items-center gap-2 pt-2">
                <button onClick={handleStartNew} className={secondaryButtonClass}>
                  <Plus size={14} />
                  <span>Enregistrer une autre opération</span>
                </button>
                <button onClick={() => setShowCreatePanel(false)} className={primaryButtonClass}>
                  <History size={14} />
                  <span>Voir le rapport</span>
                </button>
              </div>
            </div>
          ) : step === 'preview' ? (
            <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60">
                <ShieldCheck size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">Vérifiez l'impact avant confirmation</p>
                  <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">Le stock ne sera modifié qu'après confirmation.</p>
                </div>
              </div>

              {product && (
                <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-gray-500">Produit :</span><span className="font-bold text-gray-900 dark:text-white">{product.name}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Zone :</span><span className="font-bold text-gray-900 dark:text-white">{form.zone}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Stock actuel :</span><span className="font-bold text-gray-900 dark:text-white">{getZoneQty(product, form.zone)}</span></div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{form.direction === 'Perte' ? 'Quantité perdue :' : 'Quantité ajoutée :'}</span>
                    <span className="font-bold text-gray-900 dark:text-white">{form.quantity} {product.unit}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-1.5 mt-1.5">
                    <span className="text-gray-500">Nouveau stock prévu :</span>
                    <span className={`font-black ${getZoneQty(product, form.zone) + (form.direction === 'Perte' ? -1 : 1) * Number(form.quantity || 0) < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                      {getZoneQty(product, form.zone) + (form.direction === 'Perte' ? -1 : 1) * Number(form.quantity || 0)}
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div><span className="text-gray-400 font-semibold block mb-0.5">Motif</span><span className="font-bold text-gray-900 dark:text-white">{form.reason}</span></div>
                <div><span className="text-gray-400 font-semibold block mb-0.5">Date & heure</span><span className="font-bold text-gray-900 dark:text-white">{form.dateTime.replace('T', ' ')}</span></div>
                <div><span className="text-gray-400 font-semibold block mb-0.5">Effectué par</span><span className="font-bold text-gray-900 dark:text-white">{form.performedBy}</span></div>
                {product?.lotTracked && form.lotId && (
                  <div><span className="text-gray-400 font-semibold block mb-0.5">Lot</span><span className="font-bold text-gray-900 dark:text-white">{lots.find((l) => l.id === form.lotId)?.lotNumber}</span></div>
                )}
                {form.comment && (
                  <div className="sm:col-span-2"><span className="text-gray-400 font-semibold block mb-0.5">Commentaire</span><span className="text-gray-700 dark:text-gray-300">{form.comment}</span></div>
                )}
              </div>

              {saveError && (
                <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                  <AlertCircle size={14} /> {saveError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button onClick={() => setStep('form')} disabled={isSaving} className={secondaryButtonClass}>
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
                <h2 className="text-sm font-bold text-gray-900 dark:text-white">Nouvelle perte / ajustement</h2>
                <button onClick={() => setShowCreatePanel(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
                  <X size={16} />
                </button>
              </div>

              <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg p-0.5 bg-gray-50/50 dark:bg-gray-800/50 w-fit">
                {(['Perte', 'Ajustement'] as Direction[]).map((dir) => (
                  <button
                    key={dir}
                    onClick={() => updateForm({ direction: dir })}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${
                      form.direction === dir ? 'bg-[#00A86B] text-white shadow-xs' : 'text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'
                    }`}
                  >
                    {dir === 'Perte' ? 'Diminuer le stock (perte)' : 'Augmenter le stock (ajustement)'}
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
                        <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
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

                <div>
                  <label className={labelClass}>Motif *</label>
                  <select
                    value={form.reason}
                    onChange={(e) => updateForm({ reason: e.target.value as LossReason })}
                    className={`${inputBaseClass} appearance-none cursor-pointer ${inputValidClass}`}
                  >
                    {LOSS_REASONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Date & heure *</label>
                  <input
                    type="datetime-local"
                    value={form.dateTime}
                    onChange={(e) => updateForm({ dateTime: e.target.value })}
                    className={`${inputBaseClass} ${showErrors && issuesByField.has('dateTime') ? inputErrorClass : inputValidClass}`}
                  />
                  {showErrors && issuesByField.get('dateTime') && (
                    <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('dateTime')}</p>
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

                {product?.lotTracked && (
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Lot concerné * (zone : {form.zone})</label>
                    <select
                      value={form.lotId}
                      onChange={(e) => updateForm({ lotId: e.target.value })}
                      className={`${inputBaseClass} appearance-none cursor-pointer ${showErrors && issuesByField.has('lotId') ? inputErrorClass : inputValidClass}`}
                    >
                      <option value="">Sélectionner un lot</option>
                      {lots.filter((l) => l.productId === product.id && l.zone === form.zone).map((l) => (
                        <option key={l.id} value={l.id}>{l.lotNumber} — {l.quantity} {product.unit} — péremption {l.expiryDate}</option>
                      ))}
                    </select>
                    {showErrors && issuesByField.get('lotId') && (
                      <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('lotId')}</p>
                    )}
                  </div>
                )}

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
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                <button onClick={() => setShowCreatePanel(false)} className={secondaryButtonClass}>
                  <span>Annuler la saisie</span>
                </button>
                <button onClick={handleVerify} className={primaryButtonClass}>
                  <ShieldCheck size={14} />
                  <span>Vérifier</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Report summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Quantité totale perdue</span>
            <span className="text-2xl font-black text-gray-900 dark:text-white">{totalLostQty.toLocaleString('fr-FR')}</span>
            <p className="text-[11px] text-gray-400">Selon les filtres actifs</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-red-50/80 dark:bg-red-950/40 flex items-center justify-center text-red-500 shrink-0">
            <TrendingDown size={22} />
          </div>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Valeur totale estimée des pertes</span>
            <span className="text-2xl font-black text-gray-900 dark:text-white">{totalLostValue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DT</span>
            <p className="text-[11px] text-gray-400">Valorisée au coût moyen pondéré</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 flex items-center justify-center text-amber-500 shrink-0">
            <Wallet size={22} />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-2.5 flex-1">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                placeholder="Produit, commentaire..."
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }} className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }} className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
            <select value={filterProduct} onChange={(e) => { setFilterProduct(e.target.value); setCurrentPage(1); }} className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer">
              <option value="all">Tous les produits</option>
              {products.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
            <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value as 'all' | StockCategory); setCurrentPage(1); }} className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer">
              <option value="all">Toutes catégories</option>
              {STOCK_CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
            <select value={filterReason} onChange={(e) => { setFilterReason(e.target.value as 'all' | LossReason); setCurrentPage(1); }} className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer">
              <option value="all">Tous les motifs</option>
              {LOSS_REASONS.map((r) => (<option key={r} value={r}>{r}</option>))}
            </select>
          </div>
          <button onClick={handleResetFilters} className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 shadow-2xs transition active:scale-98 shrink-0 cursor-pointer">
            <FilterX size={14} className="text-gray-500" />
            <span>Réinitialiser</span>
          </button>
        </div>
        <div className="mt-2.5">
          <select value={filterZone} onChange={(e) => { setFilterZone(e.target.value as 'all' | StockZone); setCurrentPage(1); }} className="appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer">
            <option value="all">Toutes les zones</option>
            {STOCK_ZONES.map((z) => (<option key={z} value={z}>{z}</option>))}
          </select>
        </div>
      </div>

      {/* Report table */}
      <div className="rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 text-[11px] font-bold text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-gray-800/30">
                <th className="py-3.5 px-4">Date</th>
                <th className="py-3.5 px-4">Produit</th>
                <th className="py-3.5 px-4">Zone</th>
                <th className="py-3.5 px-4 text-center">Quantité</th>
                <th className="py-3.5 px-4">Motif</th>
                <th className="py-3.5 px-4 text-right">Valeur estimée</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 text-xs">
              {paginatedEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400 flex flex-col items-center gap-2">
                    <PackageMinus className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                    Aucune perte ou ajustement pour ces filtres.
                  </td>
                </tr>
              ) : (
                paginatedEntries.map((entry) => {
                  const p = products.find((pr) => pr.id === entry.productId);
                  return (
                    <tr key={entry.id} className={entry.status === 'Annulé' ? 'opacity-50' : ''}>
                      <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300 whitespace-nowrap">{entry.timestamp.replace('T', ' ').slice(0, 16)}</td>
                      <td className="py-3.5 px-4 font-semibold text-gray-900 dark:text-white">{p?.name ?? '—'}</td>
                      <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300">{entry.zone}</td>
                      <td className={`py-3.5 px-4 text-center font-bold ${entry.quantityDelta < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {entry.quantityDelta > 0 ? '+' : ''}{entry.quantityDelta}
                      </td>
                      <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300">{entry.reason}</td>
                      <td className="py-3.5 px-4 text-right text-gray-600 dark:text-gray-300">{Math.abs(entry.valueImpact).toFixed(2)} DT</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span>sur un total de {filteredEntries.length} opérations</span>
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
  );
};
