import { DecimalInput } from './ui/DecimalInput';
import { EmployeePicker } from './ui/EmployeePicker';
import React, { useMemo, useState } from 'react';
import {
  ClipboardList,
  ChevronDown,
  AlertCircle,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  History,
  Info,
  Plus,
  UploadCloud,
} from 'lucide-react';
import {
  StockProduct,
  StockUnit,
  StockZone,
  StockCategory,
  StockLedgerEntry,
  InventoryScopeType,
  STOCK_ZONES,
  STOCK_CATEGORIES,
  generateStockId,
  getZoneQty,
  getTotalQty,
} from '../data/stockModel';
import { InventoryImportForm } from './InventoryImportForm';
import { IngredientManualAddForm } from './IngredientManualAddForm';

interface StockInventoryPageProps {
  products: StockProduct[];
  units: StockUnit[];
  ledger: StockLedgerEntry[];
  employees: string[];
  onNavigateToDashboard: () => void;
  onNavigateToStock: () => void;
  onPostEntries: (entries: StockLedgerEntry[]) => void;
  onImportIngredients: (products: Omit<StockProduct, 'id'>[]) => void;
  isDarkMode?: boolean;
}

type Step = 'setup' | 'counting' | 'preview' | 'success';
type Mode = 'manual' | 'import' | 'add-ingredient';

interface InventoryFormState {
  scopeType: InventoryScopeType;
  scopeCategory: StockCategory | '';
  scopeZone: StockZone | '';
  performedBy: string;
  realInputs: Record<string, string>; // productId -> raw text input
}

const createEmptyInventoryForm = (): InventoryFormState => ({
  scopeType: 'Complet',
  scopeCategory: '',
  scopeZone: '',
  performedBy: '',
  realInputs: {},
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

export const StockInventoryPage: React.FC<StockInventoryPageProps> = ({
  products,
  units,
  ledger,
  employees,
  onNavigateToDashboard,
  onNavigateToStock,
  onPostEntries,
  onImportIngredients,
}) => {
  const [mode, setMode] = useState<Mode>('manual');
  const [step, setStep] = useState<Step>('setup');
  const [form, setForm] = useState<InventoryFormState>(createEmptyInventoryForm());
  const [hasAttemptedVerify, setHasAttemptedVerify] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ count: number; choice: 'Ajusté' | 'Conservé' } | null>(null);

  const includedProducts = useMemo(() => {
    if (form.scopeType === 'Catégorie' && form.scopeCategory) {
      return products.filter((p) => p.category === form.scopeCategory);
    }
    return products;
  }, [products, form.scopeType, form.scopeCategory]);

  const getTheoreticalQty = (product: StockProduct): number =>
    form.scopeType === 'Zone' && form.scopeZone ? getZoneQty(product, form.scopeZone as StockZone) : getTotalQty(product);

  const targetZoneForAdjustment: StockZone = form.scopeType === 'Zone' && form.scopeZone ? (form.scopeZone as StockZone) : 'Réserve principale';

  const canLaunch = form.scopeType !== 'Catégorie' || Boolean(form.scopeCategory);
  const canLaunchZone = form.scopeType !== 'Zone' || Boolean(form.scopeZone);

  const handleLaunch = () => {
    setForm((prev) => ({ ...prev, realInputs: {} }));
    setHasAttemptedVerify(false);
    setStep('counting');
  };

  const updateRealInput = (productId: string, value: string) => {
    setForm((prev) => ({ ...prev, realInputs: { ...prev.realInputs, [productId]: value } }));
  };

  const countingIssues = useMemo(() => {
    const issues: string[] = [];
    if (!form.performedBy) issues.push("L'employé ayant réalisé l'inventaire est obligatoire.");
    includedProducts.forEach((p) => {
      const raw = form.realInputs[p.id];
      if (raw === undefined || raw.trim() === '') issues.push(`${p.name} : le stock réel est obligatoire.`);
      else if (Number.isNaN(Number(raw)) || Number(raw) < 0) issues.push(`${p.name} : le stock réel doit être un nombre positif ou nul.`);
    });
    return issues;
  }, [includedProducts, form.realInputs, form.performedBy]);

  const handleVerify = () => {
    setHasAttemptedVerify(true);
    if (countingIssues.length === 0) setStep('preview');
  };

  const rows = useMemo(
    () =>
      includedProducts.map((p) => {
        const theoretical = getTheoreticalQty(p);
        const real = Number(form.realInputs[p.id] ?? 0);
        const discrepancy = real - theoretical;
        return { product: p, theoretical, real, discrepancy, discrepancyValue: discrepancy * p.averageCost };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [includedProducts, form.realInputs, form.scopeType, form.scopeZone]
  );

  const totalDiscrepancyValue = useMemo(() => rows.reduce((sum, r) => sum + r.discrepancyValue, 0), [rows]);
  const discrepantRows = useMemo(() => rows.filter((r) => r.discrepancy !== 0), [rows]);

  const scopeLabel = useMemo(() => {
    if (form.scopeType === 'Complet') return 'Complet';
    if (form.scopeType === 'Catégorie') return `Catégorie : ${form.scopeCategory}`;
    return `Zone : ${form.scopeZone}`;
  }, [form]);

  const handleConfirm = async (choice: 'Ajusté' | 'Conservé') => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const now = new Date().toISOString();
      const entries: StockLedgerEntry[] = discrepantRows.map(({ product, theoretical, real, discrepancy, discrepancyValue }) => {
        const zone = targetZoneForAdjustment;
        const before = getZoneQty(product, zone);
        const delta = choice === 'Ajusté' ? discrepancy : 0;
        return {
          id: generateStockId('led'),
          timestamp: now,
          type: 'Inventaire',
          productId: product.id,
          zone,
          quantityBefore: before,
          quantityDelta: delta,
          quantityAfter: before + delta,
          reason: "Ajustement d'inventaire",
          comment: `Inventaire ${scopeLabel}`,
          performedBy: form.performedBy,
          status: 'Confirmé',
          valueImpact: choice === 'Ajusté' ? discrepancyValue : 0,
          theoreticalQty: theoretical,
          realQty: real,
          discrepancyQty: discrepancy,
          discrepancyValue,
          inventoryChoice: choice,
          inventoryScope: scopeLabel,
        };
      });

      await new Promise((resolve) => setTimeout(resolve, 700));
      // Nothing to post when every counted product matches its theoretical quantity — the server
      // rejects an empty entries array (it expects at least one real movement), and there is
      // nothing to adjust anyway, so skip the call entirely rather than sending a pointless request.
      if (entries.length > 0) onPostEntries(entries);
      setLastResult({ count: discrepantRows.length, choice });
      setStep('success');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartNew = () => {
    setForm(createEmptyInventoryForm());
    setHasAttemptedVerify(false);
    setSaveError(null);
    setLastResult(null);
    setStep('setup');
  };

  const pastInventoryEntries = useMemo(() => ledger.filter((e) => e.type === 'Inventaire'), [ledger]);

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>Inventaires</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Café & Caisse
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Comptage manuel du stock réel et ajustement éventuel du stock théorique.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {mode === 'manual' && (
            <button onClick={() => setMode('import')} className={secondaryButtonClass}>
              <UploadCloud size={14} className="text-gray-500 dark:text-gray-400" />
              <span>Import Excel/CSV</span>
            </button>
          )}
          {mode !== 'add-ingredient' && (
            <button onClick={() => setMode('add-ingredient')} className={secondaryButtonClass}>
              <Plus size={14} className="text-gray-500 dark:text-gray-400" />
              <span>Ajout inventaire ou ingrédient</span>
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

      {mode === 'add-ingredient' ? (
        <IngredientManualAddForm
          products={products}
          units={units}
          onImportIngredients={onImportIngredients}
          onClose={() => setMode('manual')}
        />
      ) : mode === 'import' ? (
        <InventoryImportForm
          products={products}
          employees={employees}
          onPostEntries={onPostEntries}
          onClose={() => setMode('manual')}
        />
      ) : step === 'success' ? (
        <div className="p-8 sm:p-12 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-500">
            <CheckCircle2 size={30} />
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Inventaire enregistré</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md">
            {(lastResult?.count ?? 0) === 0 ? (
              "Aucun écart constaté — le stock réel correspond exactement au stock théorique, rien n'a été modifié."
            ) : (
              <>
                {lastResult?.count} écart{(lastResult?.count ?? 0) > 1 ? 's ont' : ' a'} été enregistré
                {(lastResult?.count ?? 0) > 1 ? 's' : ''} dans l'historique.{' '}
                {lastResult?.choice === 'Ajusté' ? 'Le stock a été ajusté au stock réel.' : 'Le stock théorique a été conservé.'}
              </>
            )}
          </p>
          <div className="flex items-center gap-2 pt-2">
            <button onClick={handleStartNew} className={secondaryButtonClass}>
              <Plus size={14} />
              <span>Nouvel inventaire</span>
            </button>
            <button onClick={onNavigateToStock} className={primaryButtonClass}>
              <History size={14} />
              <span>Voir le stock</span>
            </button>
          </div>
        </div>
      ) : step === 'preview' ? (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-start gap-3">
            <ShieldCheck size={20} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                {discrepantRows.length === 0 ? 'Aucun écart constaté' : 'Vérifiez les écarts avant confirmation'}
              </p>
              <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                {discrepantRows.length === 0
                  ? "Le stock réel correspond exactement au stock théorique sur toute la portée comptée — vous pouvez confirmer pour clore cet inventaire sans rien modifier."
                  : "Choisissez ensuite d'ajuster le stock au stock réel ou de conserver le stock théorique. Dans les deux cas, l'écart sera conservé dans l'historique."}
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-gray-400 font-semibold block mb-0.5">Portée</span>
              <span className="font-bold text-gray-900 dark:text-white">{scopeLabel}</span>
            </div>
            <div>
              <span className="text-gray-400 font-semibold block mb-0.5">Produits comptés</span>
              <span className="font-bold text-gray-900 dark:text-white">{rows.length}</span>
            </div>
            <div>
              <span className="text-gray-400 font-semibold block mb-0.5">Écarts détectés</span>
              <span className="font-bold text-gray-900 dark:text-white">{discrepantRows.length}</span>
            </div>
            <div>
              <span className="text-gray-400 font-semibold block mb-0.5">Valeur totale de l'écart</span>
              <span className={`font-bold ${totalDiscrepancyValue < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {totalDiscrepancyValue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DT
              </span>
            </div>
          </div>

          {form.scopeType !== 'Zone' && discrepantRows.length > 0 && (
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/50 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
              <Info size={14} className="shrink-0" />
              <span>Un ajustement éventuel sera appliqué à la zone « Réserve principale » par convention (portée non spécifique à une zone).</span>
            </div>
          )}

          <div className="rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 text-[11px] font-bold text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-gray-800/30">
                    <th className="py-3 px-4">Produit</th>
                    <th className="py-3 px-4 text-center">Stock théorique</th>
                    <th className="py-3 px-4 text-center">Stock réel</th>
                    <th className="py-3 px-4 text-center">Écart</th>
                    <th className="py-3 px-4 text-right">Valeur de l'écart</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 text-xs">
                  {rows.map((r) => (
                    <tr key={r.product.id} className={r.discrepancy !== 0 ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}>
                      <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white">{r.product.name}</td>
                      <td className="py-3 px-4 text-center text-gray-600 dark:text-gray-300">{r.theoretical}</td>
                      <td className="py-3 px-4 text-center text-gray-600 dark:text-gray-300">{r.real}</td>
                      <td className={`py-3 px-4 text-center font-bold ${r.discrepancy < 0 ? 'text-red-600 dark:text-red-400' : r.discrepancy > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>
                        {r.discrepancy > 0 ? '+' : ''}
                        {r.discrepancy}
                      </td>
                      <td className={`py-3 px-4 text-right font-semibold ${r.discrepancyValue < 0 ? 'text-red-600 dark:text-red-400' : r.discrepancyValue > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>
                        {r.discrepancyValue.toFixed(2)} DT
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {saveError && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle size={14} /> {saveError}
            </div>
          )}

          <div className="p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <button onClick={() => setStep('counting')} disabled={isSaving} className={secondaryButtonClass}>
              <ArrowLeft size={14} />
              <span>Modifier</span>
            </button>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button onClick={() => handleConfirm('Conservé')} disabled={isSaving} className={`${secondaryButtonClass} flex-1 sm:flex-none`}>
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : null}
                <span>Conserver le stock théorique</span>
              </button>
              <button onClick={() => handleConfirm('Ajusté')} disabled={isSaving} className={`${primaryButtonClass} flex-1 sm:flex-none`}>
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                <span>Ajuster le stock au stock réel</span>
              </button>
            </div>
          </div>
        </div>
      ) : step === 'counting' ? (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <span className="text-gray-400 font-semibold block mb-0.5 text-xs">Portée de l'inventaire</span>
              <span className="font-bold text-gray-900 dark:text-white text-sm">{scopeLabel}</span>
            </div>
            <div>
              <label className={labelClass}>Réalisé par *</label>
              <EmployeePicker
                value={form.performedBy}
                onChange={(v) => setForm((prev) => ({ ...prev, performedBy: v }))}
                employees={employees}
                className={`${inputBaseClass} appearance-none cursor-pointer ${hasAttemptedVerify && !form.performedBy ? inputErrorClass : inputValidClass}`}
              />
            </div>
          </div>

          {hasAttemptedVerify && countingIssues.length > 0 && (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60">
              <p className="text-sm font-bold text-red-700 dark:text-red-300 mb-1.5">
                {countingIssues.length} erreur{countingIssues.length > 1 ? 's' : ''} à corriger
              </p>
              <ul className="text-xs text-red-600 dark:text-red-400 space-y-1 list-disc list-inside">
                {countingIssues.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 text-[11px] font-bold text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-gray-800/30">
                    <th className="py-3 px-4">Produit</th>
                    <th className="py-3 px-4 text-center">Stock théorique</th>
                    <th className="py-3 px-4 text-center">Stock réel *</th>
                    <th className="py-3 px-4 text-center">Écart (aperçu)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 text-xs">
                  {includedProducts.map((p) => {
                    const theoretical = getTheoreticalQty(p);
                    const raw = form.realInputs[p.id] ?? '';
                    const real = raw === '' ? null : Number(raw);
                    const rowInvalid = hasAttemptedVerify && (raw.trim() === '' || Number.isNaN(Number(raw)) || Number(raw) < 0);
                    return (
                      <tr key={p.id}>
                        <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white">
                          {p.name}
                          <span className="block text-[11px] text-gray-400 font-normal">{p.unit}</span>
                        </td>
                        <td className="py-3 px-4 text-center text-gray-600 dark:text-gray-300">{theoretical}</td>
                        <td className="py-3 px-4 text-center">
                          <DecimalInput
                            min={0}
                            value={raw}
                            onChange={(e) => updateRealInput(p.id, e.target.value)}
                            className={`w-24 mx-auto text-center px-2 py-1.5 text-xs rounded-lg border ${rowInvalid ? inputErrorClass : inputValidClass} bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1`}
                          />
                        </td>
                        <td className={`py-3 px-4 text-center font-semibold ${real === null ? 'text-gray-300' : real - theoretical < 0 ? 'text-red-600 dark:text-red-400' : real - theoretical > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>
                          {real === null ? '—' : `${real - theoretical > 0 ? '+' : ''}${real - theoretical}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-end gap-2">
            <button onClick={() => setStep('setup')} className={secondaryButtonClass}>
              <ArrowLeft size={14} />
              <span>Retour</span>
            </button>
            <button onClick={handleVerify} className={primaryButtonClass}>
              <ShieldCheck size={14} />
              <span>Vérifier l'inventaire</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-4">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <ClipboardList size={16} className="text-emerald-500" />
              Lancer un nouvel inventaire
            </h2>

            <div>
              <label className={labelClass}>Type d'inventaire</label>
              <div className="flex flex-wrap items-center border border-gray-200 dark:border-gray-700 rounded-lg p-0.5 bg-gray-50/50 dark:bg-gray-800/50 w-fit gap-0.5">
                {(['Complet', 'Catégorie', 'Zone'] as InventoryScopeType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setForm((prev) => ({ ...prev, scopeType: t, scopeCategory: '', scopeZone: '' }))}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${
                      form.scopeType === t ? 'bg-[#00A86B] text-white shadow-xs' : 'text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'
                    }`}
                  >
                    Inventaire {t === 'Complet' ? 'complet' : t === 'Catégorie' ? 'par catégorie' : 'par zone'}
                  </button>
                ))}
              </div>
            </div>

            {form.scopeType === 'Catégorie' && (
              <div className="max-w-xs">
                <label className={labelClass}>Catégorie *</label>
                <div className="relative">
                  <select
                    value={form.scopeCategory}
                    onChange={(e) => setForm((prev) => ({ ...prev, scopeCategory: e.target.value as StockCategory }))}
                    className={`${inputBaseClass} appearance-none pr-8 cursor-pointer ${inputValidClass}`}
                  >
                    <option value="">Sélectionner une catégorie</option>
                    {STOCK_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
            )}

            {form.scopeType === 'Zone' && (
              <div className="max-w-xs">
                <label className={labelClass}>Zone *</label>
                <div className="relative">
                  <select
                    value={form.scopeZone}
                    onChange={(e) => setForm((prev) => ({ ...prev, scopeZone: e.target.value as StockZone }))}
                    className={`${inputBaseClass} appearance-none pr-8 cursor-pointer ${inputValidClass}`}
                  >
                    <option value="">Sélectionner une zone</option>
                    {STOCK_ZONES.map((z) => (
                      <option key={z} value={z}>{z}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
            )}

            <p className="text-xs text-gray-500 dark:text-gray-400">
              {includedProducts.length} produit{includedProducts.length > 1 ? 's seront concernés' : ' sera concerné'} par cet inventaire.
            </p>

            <div className="flex justify-end pt-2 border-t border-gray-100 dark:border-gray-800">
              <button onClick={handleLaunch} disabled={!canLaunch || !canLaunchZone} className={primaryButtonClass}>
                <ClipboardList size={14} />
                <span>Lancer l'inventaire</span>
              </button>
            </div>
          </div>

          {/* Past inventories */}
          {pastInventoryEntries.length > 0 && (
            <div className="rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs overflow-hidden">
              <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Historique des écarts d'inventaire</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[11px] font-bold text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-gray-800/30">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Produit</th>
                      <th className="py-3 px-4">Portée</th>
                      <th className="py-3 px-4 text-center">Théorique</th>
                      <th className="py-3 px-4 text-center">Réel</th>
                      <th className="py-3 px-4 text-center">Écart</th>
                      <th className="py-3 px-4 text-right">Valeur écart</th>
                      <th className="py-3 px-4">Choix</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 text-xs">
                    {pastInventoryEntries.map((e) => {
                      const p = products.find((pr) => pr.id === e.productId);
                      return (
                        <tr key={e.id}>
                          <td className="py-3 px-4 text-gray-600 dark:text-gray-300 whitespace-nowrap">{e.timestamp.replace('T', ' ').slice(0, 16)}</td>
                          <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white">{p?.name ?? '—'}</td>
                          <td className="py-3 px-4 text-gray-600 dark:text-gray-300">{e.inventoryScope}</td>
                          <td className="py-3 px-4 text-center text-gray-600 dark:text-gray-300">{e.theoreticalQty}</td>
                          <td className="py-3 px-4 text-center text-gray-600 dark:text-gray-300">{e.realQty}</td>
                          <td className={`py-3 px-4 text-center font-semibold ${(e.discrepancyQty ?? 0) < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {(e.discrepancyQty ?? 0) > 0 ? '+' : ''}
                            {e.discrepancyQty}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-600 dark:text-gray-300">{(e.discrepancyValue ?? 0).toFixed(2)} DT</td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                                e.inventoryChoice === 'Ajusté'
                                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70'
                                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                              }`}
                            >
                              {e.inventoryChoice}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
