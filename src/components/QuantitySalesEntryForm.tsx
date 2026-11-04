import { DecimalInput } from './ui/DecimalInput';
import { EmployeePicker } from './ui/EmployeePicker';
import React, { useMemo } from 'react';
import {
  Minus,
  Plus,
  Coffee,
  Banknote,
  CreditCard,
  Ticket,
  Percent,
  ShoppingBag,
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
  RotateCcw,
  CheckCircle2,
  ArrowLeft,
  Loader2,
  MessageSquare,
} from 'lucide-react';
import { CatalogArticle, getArticleCategoriesInUse, getArticleById, getArticleTtcPrice } from '../data/manualSalesCatalog';
import { PAYMENT_NOTE_SUGGESTIONS } from '../data/salesTransactions';
import {
  DraftQuantityRow,
  QuantitySalesFormState,
  QuantitySalesTotals,
  QuantityValidationIssue,
  clampInt,
  computeRowDiscountTotal,
  computeRowNetTotal,
} from '../data/quantitySalesEntryModel';

const inputBaseClass =
  'w-full px-3.5 py-2 text-xs rounded-xl border bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 transition';
const inputValidClass = 'border-gray-200 dark:border-gray-700 focus:border-emerald-500 focus:ring-emerald-500';
const inputErrorClass = 'border-red-400 dark:border-red-500/70 focus:border-red-500 focus:ring-red-500';
const labelClass = 'text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 block';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer';

const QtyStepper: React.FC<{ value: number; onChange: (next: number) => void }> = ({ value, onChange }) => (
  <div className="flex items-center gap-1.5 shrink-0">
    <button
      type="button"
      onClick={() => onChange(Math.max(0, value - 1))}
      disabled={value <= 0}
      aria-label="Diminuer la quantité"
      className="w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      <Minus size={12} />
    </button>
    <input
      type="number"
      min={0}
      value={value}
      onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value)) || 0))}
      aria-label="Quantité vendue"
      className="w-14 text-center text-xs py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-semibold"
    />
    <button
      type="button"
      onClick={() => onChange(value + 1)}
      aria-label="Augmenter la quantité"
      className="w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer"
    >
      <Plus size={12} />
    </button>
  </div>
);

const ProductThumb: React.FC<{ article: CatalogArticle }> = ({ article }) =>
  article.imageUrl ? (
    <img src={article.imageUrl} alt={article.name} className="w-10 h-10 rounded-lg object-cover shrink-0 border border-gray-100 dark:border-gray-800" />
  ) : (
    <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-300 dark:text-gray-600 shrink-0">
      <Coffee size={18} />
    </div>
  );

interface QuantitySalesFormStepProps {
  articles: CatalogArticle[];
  employees: string[];
  shifts: string[];
  form: QuantitySalesFormState;
  totals: QuantitySalesTotals;
  issues: QuantityValidationIssue[];
  showErrors: boolean;
  onChangeGeneral: (patch: Partial<Pick<QuantitySalesFormState, 'date' | 'shift' | 'employee'>>) => void;
  onSetQty: (articleId: string, qty: number) => void;
  onChangeRow: (rowId: string, patch: Partial<DraftQuantityRow>) => void;
  onChangePayment: (patch: Partial<Pick<QuantitySalesFormState, 'paidCash' | 'paidCard' | 'paidRestoTicket' | 'paymentNote'>>) => void;
  onReset: () => void;
  onCancel: () => void;
  onVerify: () => void;
}

export const QuantitySalesFormStep: React.FC<QuantitySalesFormStepProps> = ({
  articles,
  employees,
  shifts,
  form,
  totals,
  issues,
  showErrors,
  onChangeGeneral,
  onSetQty,
  onChangeRow,
  onChangePayment,
  onReset,
  onCancel,
  onVerify,
}) => {
  const issuesByKey = useMemo(() => {
    const map = new Map<string, string>();
    issues.forEach((issue) => {
      if (!map.has(issue.fieldKey)) map.set(issue.fieldKey, issue.message);
    });
    return map;
  }, [issues]);

  // Rows are sparse: a product only has one once its quantity is above 0.
  const rowsByArticleId = useMemo(() => {
    const map = new Map<string, DraftQuantityRow>();
    form.rows.forEach((r) => map.set(r.articleId, r));
    return map;
  }, [form.rows]);

  const articleCategories = useMemo(() => getArticleCategoriesInUse(articles), [articles]);

  const paymentMismatch = Math.abs(totals.remaining) > 0.01;

  return (
    <>
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

      {/* General info */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-3.5">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">Informations générales de la journée</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div>
            <label className={labelClass}>Date *</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => onChangeGeneral({ date: e.target.value })}
              className={`${inputBaseClass} ${showErrors && issuesByKey.has('qgeneral:date') ? inputErrorClass : inputValidClass}`}
            />
          </div>
          <div>
            <label className={labelClass}>Shift *</label>
            <select
              value={form.shift}
              onChange={(e) => onChangeGeneral({ shift: e.target.value })}
              className={`${inputBaseClass} cursor-pointer ${showErrors && issuesByKey.has('qgeneral:shift') ? inputErrorClass : inputValidClass}`}
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
              value={form.employee}
              onChange={(v) => onChangeGeneral({ employee: v })}
              employees={employees}
              className={`${inputBaseClass} cursor-pointer ${showErrors && issuesByKey.has('qgeneral:employee') ? inputErrorClass : inputValidClass}`}
            />
          </div>
        </div>
      </div>

      {/* Products — the whole catalog, grouped by category, like a price list: set a quantity on any
          product and it expands into its Réduction / "Dont à emporter" panels. */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">
            Produits vendus
            {totals.activeProductsCount > 0 && (
              <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                {totals.activeProductsCount} produit{totals.activeProductsCount > 1 ? 's' : ''}
              </span>
            )}
          </h2>
          <button onClick={onReset} className={secondaryButtonClass}>
            <RotateCcw size={14} />
            <span>Réinitialiser</span>
          </button>
        </div>

        {showErrors && issuesByKey.get('qgeneral:rows') && (
          <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertCircle size={14} />
            {issuesByKey.get('qgeneral:rows')}
          </div>
        )}

        <div className="space-y-5 max-h-[900px] overflow-y-auto custom-scrollbar pr-0.5">
          {articleCategories.map((category) => (
            <div key={category} className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 px-1">{category}</h3>
              <div className="space-y-2">
                {articles
                  .filter((a) => a.category === category)
                  .map((article) => {
                    const row = rowsByArticleId.get(article.id);
                    const rowTotal = row ? computeRowNetTotal(row, article) : 0;
                    const discountTotal = row ? computeRowDiscountTotal(row, article) : 0;
                    const takeawayErrorKey = row ? `qrow:${row.rowId}:takeaway` : '';
                    const discountErrorKey = row ? `qrow:${row.rowId}:discount` : '';
                    const hasRowError = showErrors && row && (issuesByKey.has(takeawayErrorKey) || issuesByKey.has(discountErrorKey));

                    // One stable wrapper per product (header first, panels after) so the quantity
                    // input keeps focus while typing when a product goes from idle to expanded.
                    return (
                      <div
                        key={article.id}
                        className={`rounded-xl transition ${
                          !row
                            ? 'p-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/40'
                            : hasRowError
                            ? 'p-3 sm:p-4 border space-y-3 border-red-300 dark:border-red-800/70 bg-red-50/40 dark:bg-red-950/10'
                            : 'p-3 sm:p-4 border space-y-3 border-emerald-200/70 dark:border-emerald-800/40 bg-emerald-50/30 dark:bg-emerald-950/10'
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <ProductThumb article={article} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{article.name}</p>
                            <p className="text-[11px] text-gray-400">{getArticleTtcPrice(article).toFixed(2)} DT / unité</p>
                          </div>
                          <QtyStepper value={row?.qty ?? 0} onChange={(v) => onSetQty(article.id, v)} />
                          {row && (
                            <div className="text-right shrink-0 min-w-[72px]">
                              <p className="text-[10px] text-gray-400 font-semibold">Total</p>
                              <p className="text-sm font-bold text-gray-900 dark:text-white">{rowTotal.toFixed(2)} DT</p>
                            </div>
                          )}
                        </div>

                        {row && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {/* Réduction */}
                            <div className="p-2.5 rounded-lg bg-white dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800 space-y-1.5">
                              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 inline-flex items-center gap-1">
                                <Percent size={11} /> Réduction / unité
                              </span>
                              <div className="flex items-center gap-1 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => onChangeRow(row.rowId, { discountMode: 'amount', discountValue: 0 })}
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-semibold cursor-pointer ${
                                    row.discountMode === 'amount'
                                      ? 'bg-emerald-500 text-white'
                                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                                  }`}
                                >
                                  Montant (DT)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onChangeRow(row.rowId, { discountMode: 'percent', discountValue: 0 })}
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-semibold cursor-pointer ${
                                    row.discountMode === 'percent'
                                      ? 'bg-emerald-500 text-white'
                                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                                  }`}
                                >
                                  Pourcentage (%)
                                </button>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <DecimalInput
                                  min={0}
                                  max={row.discountMode === 'percent' ? 100 : undefined}
                                  step={row.discountMode === 'percent' ? 1 : 0.1}
                                  value={row.discountValue}
                                  onChange={(e) => {
                                    const raw = Math.max(0, Number(e.target.value) || 0);
                                    const clamped = row.discountMode === 'percent' ? Math.min(100, raw) : raw;
                                    onChangeRow(row.rowId, { discountValue: clamped });
                                  }}
                                  className="w-full text-xs py-1.5 px-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                />
                                <span className="text-[10px] text-gray-400 shrink-0">{row.discountMode === 'percent' ? '%' : 'DT'}</span>
                              </div>
                              {row.discountValue > 0 && (
                                <div className="flex items-center gap-1 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => onChangeRow(row.rowId, { discountScope: 'all' })}
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold cursor-pointer ${
                                      row.discountScope === 'all'
                                        ? 'bg-emerald-500 text-white'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                                    }`}
                                  >
                                    Toutes ({row.qty})
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onChangeRow(row.rowId, { discountScope: 'partial', discountQty: Math.min(row.discountQty || 1, row.qty) })
                                    }
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold cursor-pointer ${
                                      row.discountScope === 'partial'
                                        ? 'bg-emerald-500 text-white'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                                    }`}
                                  >
                                    Nombre précis
                                  </button>
                                  {row.discountScope === 'partial' && (
                                    <input
                                      type="number"
                                      min={0}
                                      max={row.qty}
                                      value={row.discountQty}
                                      onChange={(e) => onChangeRow(row.rowId, { discountQty: clampInt(Number(e.target.value), 0, row.qty) })}
                                      className="w-14 text-center text-[11px] py-0.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                    />
                                  )}
                                </div>
                              )}
                              {discountTotal > 0 && (
                                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                                  − {discountTotal.toFixed(2)} DT au total
                                </p>
                              )}
                              {showErrors && issuesByKey.get(discountErrorKey) && (
                                <p className="text-[10px] text-red-500 flex items-center gap-1">
                                  <AlertCircle size={10} /> {issuesByKey.get(discountErrorKey)}
                                </p>
                              )}
                            </div>

                            {/* À emporter */}
                            <div className="p-2.5 rounded-lg bg-white dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800 space-y-1.5">
                              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 inline-flex items-center gap-1">
                                <ShoppingBag size={11} /> Dont à emporter
                              </span>
                              <input
                                type="number"
                                min={0}
                                max={row.qty}
                                value={row.takeawayQty}
                                onChange={(e) => onChangeRow(row.rowId, { takeawayQty: clampInt(Number(e.target.value), 0, row.qty) })}
                                className={`w-full text-xs py-1.5 px-2 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-white ${
                                  showErrors && issuesByKey.has(takeawayErrorKey) ? 'border-red-400 dark:border-red-500/70' : 'border-gray-200 dark:border-gray-700'
                                }`}
                              />
                              <p className="text-[10px] text-gray-400">Sur place : {row.qty - Math.min(row.takeawayQty, row.qty)}</p>
                              {showErrors && issuesByKey.get(takeawayErrorKey) && (
                                <p className="text-[10px] text-red-500 flex items-center gap-1">
                                  <AlertCircle size={10} /> {issuesByKey.get(takeawayErrorKey)}
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Whole-entry payment verification — replaces the old per-product Règlement split and the
          old paper-ticket-denomination reconciliation: just how much came in overall, per method. */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-3">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white inline-flex items-center gap-2">
          <ShieldCheck size={15} className="text-emerald-500" />
          Vérification des encaissements
        </h2>
        <p className="text-[11px] text-gray-400">
          Indiquez le montant total encaissé pour cette saisie, par mode de règlement. Le total doit correspondre au
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
              value={form.paidCash}
              onChange={(e) => onChangePayment({ paidCash: Math.max(0, Number(e.target.value) || 0) })}
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
              value={form.paidCard}
              onChange={(e) => onChangePayment({ paidCard: Math.max(0, Number(e.target.value) || 0) })}
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
              value={form.paidRestoTicket}
              onChange={(e) => onChangePayment({ paidRestoTicket: Math.max(0, Number(e.target.value) || 0) })}
              className={`${inputBaseClass} ${inputValidClass}`}
            />
          </div>
        </div>
        <div
          className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
            showErrors && paymentMismatch
              ? 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400'
              : paymentMismatch
              ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
              : 'bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400'
          }`}
        >
          {paymentMismatch ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
          <span>
            Total encaissé : <strong>{totals.paidTotal.toFixed(2)} DT</strong> — Total des ventes :{' '}
            <strong>{totals.totalNet.toFixed(2)} DT</strong>
          </span>
        </div>

        {paymentMismatch && (
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
                  onClick={() => onChangePayment({ paymentNote: suggestion })}
                  className={`px-2 py-1 rounded-md text-[10px] font-medium border transition cursor-pointer ${
                    form.paymentNote === suggestion
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-emerald-300'
                  }`}
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <textarea
              value={form.paymentNote}
              onChange={(e) => onChangePayment({ paymentNote: e.target.value })}
              placeholder="Expliquez l'écart entre le total encaissé et le total des ventes…"
              rows={2}
              className={`w-full px-3 py-2 text-xs rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 transition ${
                showErrors && issuesByKey.has('qgeneral:payment')
                  ? 'border-red-400 dark:border-red-500/70 focus:border-red-500 focus:ring-red-500'
                  : 'border-gray-200 dark:border-gray-700 focus:border-emerald-500 focus:ring-emerald-500'
              }`}
            />
          </div>
        )}

        {showErrors && issuesByKey.get('qgeneral:payment') && (
          <p className="text-[11px] text-red-500 flex items-center gap-1">
            <AlertCircle size={11} /> {issuesByKey.get('qgeneral:payment')}
          </p>
        )}
      </div>

      {/* Sticky recap + verify */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3 sticky bottom-4">
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 px-3.5 py-2 rounded-xl border border-gray-100 dark:border-gray-800 w-full sm:w-auto flex-wrap">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
          <span>
            <strong className="text-gray-800 dark:text-gray-200 font-semibold">{totals.activeProductsCount}</strong> produits •{' '}
            <strong className="text-gray-800 dark:text-gray-200 font-semibold">{totals.totalQty}</strong> unités • Total{' '}
            <strong className="text-gray-800 dark:text-gray-200 font-semibold">{totals.totalNet.toFixed(2)} DT</strong>
          </span>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button onClick={onCancel} className={`${secondaryButtonClass} flex-1 sm:flex-none`}>
            <span>Annuler</span>
          </button>
          <button onClick={onVerify} className={`${primaryButtonClass} flex-1 sm:flex-none`}>
            <ShieldCheck size={14} />
            <span>Vérifier les ventes</span>
          </button>
        </div>
      </div>
    </>
  );
};

interface QuantitySalesPreviewStepProps {
  articles: CatalogArticle[];
  form: QuantitySalesFormState;
  totals: QuantitySalesTotals;
  isSaving: boolean;
  saveError: string | null;
  onBackToForm: () => void;
  onConfirmSave: () => void;
}

export const QuantitySalesPreviewStep: React.FC<QuantitySalesPreviewStepProps> = ({
  articles,
  form,
  totals,
  isSaving,
  saveError,
  onBackToForm,
  onConfirmSave,
}) => {
  const activeRows = form.rows.filter((r) => r.articleId && r.qty > 0);

  return (
    <>
      <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-start gap-3">
        <ShieldCheck size={20} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">Vérifiez les informations avant confirmation</p>
          <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
            Aucune vente n'est encore enregistrée. Contrôlez les quantités et totaux ci-dessous, puis confirmez.
          </p>
        </div>
      </div>

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

      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-2">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Produits ({activeRows.length})</h3>
        {activeRows.map((row) => {
          const article = getArticleById(row.articleId, articles);
          if (!article) return null;
          const net = computeRowNetTotal(row, article);
          const discount = computeRowDiscountTotal(row, article);
          return (
            <div
              key={row.rowId}
              className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-dashed border-gray-100 dark:border-gray-800 pb-2 last:border-0 last:pb-0"
            >
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-200">
                  {row.qty}x {article.name}
                </p>
                <p className="text-[11px] text-gray-400">
                  {row.takeawayQty > 0 && `${row.takeawayQty} à emporter • `}
                  {discount > 0 && `− ${discount.toFixed(2)} DT remise`}
                </p>
              </div>
              <span className="font-semibold text-gray-700 dark:text-gray-300">{net.toFixed(2)} DT</span>
            </div>
          );
        })}
      </div>

      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
        <div>
          <span className="text-gray-400 font-semibold block mb-0.5">Unités vendues</span>
          <span className="font-bold text-gray-900 dark:text-white">{totals.totalQty}</span>
        </div>
        <div>
          <span className="text-gray-400 font-semibold block mb-0.5">Dont à emporter</span>
          <span className="font-bold text-gray-900 dark:text-white">{totals.totalTakeawayQty}</span>
        </div>
        <div>
          <span className="text-gray-400 font-semibold block mb-0.5">Total remises</span>
          <span className="font-bold text-gray-900 dark:text-white">− {totals.totalDiscount.toFixed(2)} DT</span>
        </div>
        <div>
          <span className="text-gray-400 font-semibold block mb-0.5">Espèces</span>
          <span className="font-bold text-gray-900 dark:text-white">{form.paidCash.toFixed(2)} DT</span>
        </div>
        <div>
          <span className="text-gray-400 font-semibold block mb-0.5">Carte / Ticket resto</span>
          <span className="font-bold text-gray-900 dark:text-white">
            {form.paidCard.toFixed(2)} / {form.paidRestoTicket.toFixed(2)} DT
          </span>
        </div>
        <div>
          <span className="text-gray-400 font-semibold block mb-0.5">Total net</span>
          <span className="font-bold text-emerald-600 dark:text-emerald-400">{totals.totalNet.toFixed(2)} DT</span>
        </div>
      </div>

      {form.paymentNote.trim() && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 flex items-start gap-3">
          <MessageSquare size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Justification de l'écart de règlement</p>
            <p className="text-xs text-amber-700/90 dark:text-amber-400/90">{form.paymentNote}</p>
          </div>
        </div>
      )}

      {saveError && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 flex items-start gap-3">
          <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-700 dark:text-red-300">Échec de l'enregistrement</p>
            <p className="text-xs text-red-600/90 dark:text-red-400/90">{saveError}</p>
          </div>
        </div>
      )}

      <div className="p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          <span className="font-bold text-gray-900 dark:text-white">{activeRows.length}</span> produits •{' '}
          <span className="font-bold text-gray-900 dark:text-white">{totals.totalNet.toFixed(2)} DT</span> au total
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button onClick={onBackToForm} disabled={isSaving} className={`${secondaryButtonClass} flex-1 sm:flex-none`}>
            <ArrowLeft size={14} />
            <span>Modifier les ventes</span>
          </button>
          <button onClick={onConfirmSave} disabled={isSaving} className={`${primaryButtonClass} flex-1 sm:flex-none`}>
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            <span>{isSaving ? 'Enregistrement…' : 'Confirmer et enregistrer'}</span>
          </button>
        </div>
      </div>
    </>
  );
};
