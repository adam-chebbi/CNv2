import { todayIso } from '../data/dateUtils';
import React, { useMemo, useState } from 'react';
import {
  Ruler,
  Search,
  Plus,
  Pencil,
  X,
  AlertCircle,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  History,
  ArrowLeft,
} from 'lucide-react';
import {
  StockUnit,
  StockProduct,
  generateStockId,
  resolveStockUnitByName,
  getUnitUsageCount,
} from '../data/stockModel';

interface StockUnitsPageProps {
  units: StockUnit[];
  products: StockProduct[];
  onNavigateToDashboard: () => void;
  onNavigateToStock: () => void;
  onCreateUnit: (unit: StockUnit) => void;
  onRenameUnit: (unitId: string, newName: string) => void;
  isDarkMode?: boolean;
}

type Mode = 'list' | 'create' | 'edit';
type Step = 'form' | 'preview' | 'success';

const inputBaseClass =
  'w-full px-3.5 py-2 text-xs rounded-xl border bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 transition';
const inputValidClass = 'border-gray-200 dark:border-gray-700 focus:border-emerald-500 focus:ring-emerald-500';
const inputErrorClass = 'border-red-400 dark:border-red-500/70 focus:border-red-500 focus:ring-red-500';
const labelClass = 'text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 block';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer';

export const StockUnitsPage: React.FC<StockUnitsPageProps> = ({
  units,
  products,
  onNavigateToDashboard,
  onNavigateToStock,
  onCreateUnit,
  onRenameUnit,
}) => {
  const [mode, setMode] = useState<Mode>('list');
  const [step, setStep] = useState<Step>('form');
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [hasAttemptedVerify, setHasAttemptedVerify] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const editingUnit = useMemo(() => units.find((u) => u.id === editingUnitId) ?? null, [units, editingUnitId]);

  const issues = useMemo(() => {
    const list: string[] = [];
    const trimmed = name.trim();
    if (!trimmed) {
      list.push("Le nom de l'unité est obligatoire.");
    } else {
      const existing = resolveStockUnitByName(trimmed, units);
      if (existing && existing.id !== editingUnitId) {
        list.push(`Cette unité existe déjà : « ${existing.name} ». Utilisez l'unité existante plutôt que d'en créer une nouvelle.`);
      }
    }
    return list;
  }, [name, units, editingUnitId]);

  const showErrors = hasAttemptedVerify;

  const filteredUnits = useMemo(() => {
    if (!searchQuery.trim()) return units;
    const q = searchQuery.trim().toLowerCase();
    return units.filter((u) => u.name.toLowerCase().includes(q));
  }, [units, searchQuery]);

  const handleOpenCreate = () => {
    setMode('create');
    setEditingUnitId(null);
    setName('');
    setStep('form');
    setHasAttemptedVerify(false);
    setSaveError(null);
  };

  const handleOpenEdit = (unit: StockUnit) => {
    setMode('edit');
    setEditingUnitId(unit.id);
    setName(unit.name);
    setStep('form');
    setHasAttemptedVerify(false);
    setSaveError(null);
  };

  const handleClose = () => {
    setMode('list');
    setStep('form');
  };

  const handleVerify = () => {
    setHasAttemptedVerify(true);
    if (issues.length === 0) setStep('preview');
  };

  const handleConfirm = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const trimmed = name.trim();
      if (mode === 'create') {
        onCreateUnit({ id: generateStockId('unit'), name: trimmed, createdAt: todayIso() });
      } else if (editingUnitId) {
        onRenameUnit(editingUnitId, trimmed);
      }
      setStep('success');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Une erreur est survenue lors de l'enregistrement. Veuillez réessayer.");
    } finally {
      setIsSaving(false);
    }
  };

  const affectedProductsCount = editingUnit ? getUnitUsageCount(editingUnit, products) : 0;

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>Unités</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Café & Caisse
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Unités utilisées pour mesurer les produits/articles stockables.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button onClick={onNavigateToStock} className={secondaryButtonClass}>
            <History size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Voir le stock</span>
          </button>
          {mode === 'list' && (
            <button onClick={handleOpenCreate} className={primaryButtonClass}>
              <Plus size={14} />
              <span>Ajouter une unité</span>
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

      {mode !== 'list' ? (
        <div className="space-y-4">
          {step === 'success' ? (
            <div className="p-8 sm:p-12 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-500">
                <CheckCircle2 size={30} />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {mode === 'create' ? 'Unité créée' : 'Unité modifiée'}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md">
                {mode === 'edit' && affectedProductsCount > 0
                  ? `${affectedProductsCount} produit${affectedProductsCount > 1 ? 's ont' : ' a'} été mis à jour avec le nouveau nom d'unité.`
                  : "L'unité est disponible dans le catalogue."}
              </p>
              <button onClick={handleClose} className={primaryButtonClass}>
                <History size={14} />
                <span>Retour aux unités</span>
              </button>
            </div>
          ) : step === 'preview' ? (
            <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60">
                <ShieldCheck size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">Vérifiez avant confirmation</p>
                  <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                    {mode === 'create'
                      ? "Aucune unité n'est encore créée."
                      : "Aucune modification n'est encore enregistrée."}
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 space-y-1.5 text-xs">
                {mode === 'edit' && editingUnit && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Nom actuel :</span>
                    <span className="font-bold text-gray-900 dark:text-white">{editingUnit.name}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">{mode === 'create' ? 'Nom de la nouvelle unité :' : 'Nouveau nom :'}</span>
                  <span className="font-bold text-gray-900 dark:text-white">{name.trim()}</span>
                </div>
                {mode === 'edit' && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Produits concernés :</span>
                    <span className="font-bold text-gray-900 dark:text-white">{affectedProductsCount}</span>
                  </div>
                )}
              </div>

              {saveError && (
                <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                  <AlertCircle size={14} /> {saveError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button onClick={() => setStep('form')} disabled={isSaving} className={secondaryButtonClass}>
                  <ArrowLeft size={14} />
                  <span>Modifier</span>
                </button>
                <button onClick={handleConfirm} disabled={isSaving} className={primaryButtonClass}>
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                  <span>{isSaving ? 'Enregistrement…' : 'Confirmer et enregistrer'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-4 max-w-lg">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                  {mode === 'create' ? 'Nouvelle unité' : `Modifier l'unité « ${editingUnit?.name} »`}
                </h2>
                <button onClick={handleClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
                  <X size={16} />
                </button>
              </div>

              <div>
                <label className={labelClass}>Nom de l'unité *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: kg, litres, unités…"
                  className={`${inputBaseClass} ${showErrors && issues.length > 0 ? inputErrorClass : inputValidClass}`}
                />
                {showErrors &&
                  issues.map((msg, i) => (
                    <p key={i} className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle size={11} /> {msg}
                    </p>
                  ))}
                {mode === 'edit' && affectedProductsCount > 0 && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    {affectedProductsCount} produit{affectedProductsCount > 1 ? 's utilisent' : ' utilise'} actuellement cette unité et
                    {affectedProductsCount > 1 ? ' seront mis à jour' : ' sera mis à jour'} avec le nouveau nom.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                <button onClick={handleClose} className={secondaryButtonClass}>
                  <span>Annuler</span>
                </button>
                <button onClick={handleVerify} className={primaryButtonClass}>
                  <ShieldCheck size={14} />
                  <span>Vérifier</span>
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs">
            <div className="relative max-w-sm">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher une unité..."
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 text-[11px] font-bold text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-gray-800/30">
                    <th className="py-3.5 px-4">Nom</th>
                    <th className="py-3.5 px-4 text-center">Produits associés</th>
                    <th className="py-3.5 px-4">Créée le</th>
                    <th className="py-3.5 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 text-xs">
                  {filteredUnits.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-12 text-gray-400">
                        <div className="max-w-sm mx-auto space-y-2">
                          <Ruler className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600" />
                          <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">Aucune unité pour cette recherche</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredUnits.map((unit) => {
                      const usage = getUnitUsageCount(unit, products);
                      return (
                        <tr key={unit.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors">
                          <td className="py-3.5 px-4 font-semibold text-gray-900 dark:text-white">{unit.name}</td>
                          <td className="py-3.5 px-4 text-center text-gray-600 dark:text-gray-300">{usage}</td>
                          <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300">{unit.createdAt}</td>
                          <td className="py-3.5 px-4 text-center">
                            <button
                              onClick={() => handleOpenEdit(unit)}
                              title="Modifier cette unité"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer"
                            >
                              <Pencil size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
