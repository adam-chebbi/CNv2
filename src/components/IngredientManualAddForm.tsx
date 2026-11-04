import { DecimalInput } from './ui/DecimalInput';
import React, { useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  AlertCircle,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  Package,
  ChevronDown,
} from 'lucide-react';
import { StockProduct, StockUnit, STOCK_CATEGORIES } from '../data/stockModel';
import {
  ImportedIngredientRowDraft,
  createEmptyIngredientRow,
  recomputeIngredientRowIssues,
  buildStockProductsFromImportRows,
} from '../data/importIngredientsParser';

interface IngredientManualAddFormProps {
  products: StockProduct[];
  units: StockUnit[];
  onImportIngredients: (products: (Omit<StockProduct, 'id'> & { lotNumber?: string; expiryDate?: string })[]) => void;
  onClose: () => void;
}

type Step = 'form' | 'success';

const inputBaseClass =
  'w-full px-3.5 py-2 text-xs rounded-xl border bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 transition';
const inputValidClass = 'border-gray-200 dark:border-gray-700 focus:border-emerald-500 focus:ring-emerald-500';
const inputErrorClass = 'border-red-400 dark:border-red-500/70 focus:border-red-500 focus:ring-red-500';
const labelClass = 'text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 block';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer';

// Manual "Ajouter un ingrédient" flow for the Inventaires page — same ticket mechanism as Ajout
// manuel des ventes (mode « Par tickets ») : one card per new ingredient, "Ajouter un ingrédient"
// appends another blank card, each card can be removed independently, and everything is created
// together on confirmation. Reuses the exact same row shape/validation/build helpers as the
// "Nouveaux ingrédients" Excel/CSV import (importIngredientsParser.ts) so the two never drift.
export const IngredientManualAddForm: React.FC<IngredientManualAddFormProps> = ({ products, units, onImportIngredients, onClose }) => {
  const [rows, setRows] = useState<ImportedIngredientRowDraft[]>([createEmptyIngredientRow()]);
  const [step, setStep] = useState<Step>('form');
  const [hasAttemptedVerify, setHasAttemptedVerify] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  const recomputedRows = useMemo(
    () => rows.map((row) => ({ ...row, issues: recomputeIngredientRowIssues(row, products, rows) })),
    [rows, products]
  );
  const totalErrors = useMemo(() => recomputedRows.reduce((sum, r) => sum + r.issues.length, 0), [recomputedRows]);
  const issuesByRowField = (row: ImportedIngredientRowDraft) => new Map(row.issues.map((i) => [i.field, i.message]));

  const addRow = () => setRows((prev) => [...prev, createEmptyIngredientRow()]);
  const removeRow = (id: string) => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  const updateRow = (id: string, patch: Partial<ImportedIngredientRowDraft>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const handleConfirm = async () => {
    setHasAttemptedVerify(true);
    if (totalErrors > 0 || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const newProducts = buildStockProductsFromImportRows(recomputedRows).map((product, index) => {
        const row = recomputedRows[index];
        return row.lotTracked && row.lotNumber.trim()
          ? { ...product, lotNumber: row.lotNumber.trim(), expiryDate: row.expiryDate }
          : product;
      });
      await Promise.resolve(onImportIngredients(newProducts));
      setSavedCount(newProducts.length);
      setStep('success');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddMore = () => {
    setRows([createEmptyIngredientRow()]);
    setHasAttemptedVerify(false);
    setSaveError(null);
    setStep('form');
  };

  if (step === 'success') {
    return (
      <div className="p-8 sm:p-12 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col items-center text-center gap-3">
        <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-500">
          <CheckCircle2 size={30} />
        </div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
          {savedCount} ingrédient{savedCount > 1 ? 's ajoutés' : ' ajouté'}
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md">
          Le stock est disponible immédiatement pour les mouvements, les recettes et les inventaires.
        </p>
        <div className="flex items-center gap-2 pt-2">
          <button onClick={handleAddMore} className={secondaryButtonClass}>
            <Plus size={14} />
            <span>Ajouter d'autres ingrédients</span>
          </button>
          <button onClick={onClose} className={primaryButtonClass}>
            <ArrowLeft size={14} />
            <span>Retour aux inventaires</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-start gap-3">
        <Package size={20} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">Ajouter un ou plusieurs nouveaux ingrédients</p>
          <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
            Renseignez chaque ingrédient ci-dessous, puis cliquez sur « Ajouter un ingrédient » pour saisir le suivant —
            comme pour l'ajout manuel des ventes. Tous les ingrédients sont créés ensemble à la confirmation.
          </p>
        </div>
      </div>

      {hasAttemptedVerify && totalErrors > 0 && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60">
          <p className="text-sm font-bold text-red-700 dark:text-red-300">
            {totalErrors} erreur{totalErrors > 1 ? 's' : ''} à corriger avant l'enregistrement.
          </p>
        </div>
      )}

      {saveError && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
          <AlertCircle size={14} /> {saveError}
        </div>
      )}

      <div className="space-y-3">
        {recomputedRows.map((row, index) => {
          const issuesByField = issuesByRowField(row);
          const showErrors = hasAttemptedVerify;
          return (
            <div key={row.id} className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-gray-900 dark:text-white">Ingrédient {index + 1}</h3>
                {rows.length > 1 && (
                  <button onClick={() => removeRow(row.id)} title="Retirer cet ingrédient" className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className={labelClass}>Nom de l'ingrédient *</label>
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => updateRow(row.id, { name: e.target.value })}
                    placeholder="Ex: Lait entier"
                    className={`${inputBaseClass} ${showErrors && issuesByField.has('nom') ? inputErrorClass : inputValidClass}`}
                  />
                  {showErrors && issuesByField.get('nom') && (
                    <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('nom')}</p>
                  )}
                </div>

                <div>
                  <label className={labelClass}>Catégorie *</label>
                  <div className="relative">
                    <select
                      value={row.category}
                      onChange={(e) => updateRow(row.id, { category: e.target.value as ImportedIngredientRowDraft['category'] })}
                      className={`${inputBaseClass} appearance-none pr-8 cursor-pointer ${showErrors && issuesByField.has('categorie') ? inputErrorClass : inputValidClass}`}
                    >
                      <option value="">Sélectionner</option>
                      {STOCK_CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                  {showErrors && issuesByField.get('categorie') && (
                    <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('categorie')}</p>
                  )}
                </div>

                <div>
                  <label className={labelClass}>Unité de stock *</label>
                  <div className="relative">
                    <select
                      value={row.unit}
                      onChange={(e) => updateRow(row.id, { unit: e.target.value })}
                      className={`${inputBaseClass} appearance-none pr-8 cursor-pointer ${showErrors && issuesByField.has('unite') ? inputErrorClass : inputValidClass}`}
                    >
                      <option value="">Sélectionner</option>
                      {units.map((u) => (<option key={u.id} value={u.name}>{u.name}</option>))}
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                  {showErrors && issuesByField.get('unite') && (
                    <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('unite')}</p>
                  )}
                </div>

                <div>
                  <label className={labelClass}>Coût moyen d'achat (DT) *</label>
                  <DecimalInput
                    min={0}
                    step="any"
                    value={row.averageCost}
                    onChange={(e) => updateRow(row.id, { averageCost: e.target.value })}
                    placeholder="0,00"
                    className={`${inputBaseClass} ${showErrors && issuesByField.has('cout_moyen') ? inputErrorClass : inputValidClass}`}
                  />
                  {showErrors && issuesByField.get('cout_moyen') && (
                    <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('cout_moyen')}</p>
                  )}
                </div>

                <div>
                  <label className={labelClass}>Référence (SKU)</label>
                  <input
                    type="text"
                    value={row.sku}
                    onChange={(e) => updateRow(row.id, { sku: e.target.value })}
                    placeholder="Optionnel — généré automatiquement"
                    className={`${inputBaseClass} ${inputValidClass}`}
                  />
                </div>

                <div>
                  <label className={labelClass}>Stock initial — Réserve principale</label>
                  <DecimalInput min={0} value={row.reserveQty} onChange={(e) => updateRow(row.id, { reserveQty: e.target.value })} placeholder="0" className={`${inputBaseClass} ${inputValidClass}`} />
                </div>
                <div>
                  <label className={labelClass}>Stock initial — Dépôt</label>
                  <DecimalInput min={0} value={row.depotQty} onChange={(e) => updateRow(row.id, { depotQty: e.target.value })} placeholder="0" className={`${inputBaseClass} ${inputValidClass}`} />
                </div>

                <div>
                  <label className={labelClass}>Seuil minimum (alerte rupture)</label>
                  <DecimalInput min={0} value={row.minThreshold} onChange={(e) => updateRow(row.id, { minThreshold: e.target.value })} placeholder="0" className={`${inputBaseClass} ${inputValidClass}`} />
                </div>
                <div>
                  <label className={labelClass}>Stock cible</label>
                  <DecimalInput min={0} value={row.targetStock} onChange={(e) => updateRow(row.id, { targetStock: e.target.value })} placeholder="0" className={`${inputBaseClass} ${inputValidClass}`} />
                </div>

                <div className="sm:col-span-2 flex items-center gap-2 pt-1">
                  <input
                    id={`lot-tracked-${row.id}`}
                    type="checkbox"
                    checked={row.lotTracked}
                    onChange={(e) => updateRow(row.id, { lotTracked: e.target.checked })}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <label htmlFor={`lot-tracked-${row.id}`} className="text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
                    Gestion par lot (numéro de lot et date de péremption suivis à chaque entrée — le numéro de lot reste optionnel)
                  </label>
                </div>

                {row.lotTracked && (
                  <>
                    <div>
                      <label className={labelClass}>Numéro de lot (optionnel)</label>
                      <input
                        type="text"
                        value={row.lotNumber}
                        onChange={(e) => updateRow(row.id, { lotNumber: e.target.value })}
                        placeholder="Ex: LOT-2026-014"
                        className={`${inputBaseClass} ${inputValidClass}`}
                      />
                      <p className="text-[11px] text-gray-400 mt-1">
                        Laissez vide pour ne pas rattacher le stock initial à un lot précis — vous pourrez en créer un plus tard depuis Mouvements.
                      </p>
                    </div>
                    <div>
                      <label className={labelClass}>Date de péremption{row.lotNumber.trim() ? ' *' : ''}</label>
                      <input
                        type="date"
                        value={row.expiryDate}
                        onChange={(e) => updateRow(row.id, { expiryDate: e.target.value })}
                        className={`${inputBaseClass} ${showErrors && issuesByField.has('expiryDate') ? inputErrorClass : inputValidClass}`}
                      />
                      {showErrors && issuesByField.get('expiryDate') && (
                        <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('expiryDate')}</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={addRow} className={`${secondaryButtonClass} w-full sm:w-auto`}>
        <Plus size={14} />
        <span>Ajouter un ingrédient</span>
      </button>

      <div className="p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-end gap-2">
        <button onClick={onClose} disabled={isSaving} className={secondaryButtonClass}>
          <ArrowLeft size={14} />
          <span>Annuler</span>
        </button>
        <button onClick={handleConfirm} disabled={isSaving} className={primaryButtonClass}>
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
          <span>{isSaving ? 'Enregistrement…' : `Enregistrer ${rows.length > 1 ? `les ${rows.length} ingrédients` : "l'ingrédient"}`}</span>
        </button>
      </div>
    </div>
  );
};
