import { DecimalInput } from './ui/DecimalInput';
import React, { useMemo, useState } from 'react';
import {
  Beaker,
  Search,
  Plus,
  Pencil,
  Trash2,
  X,
  AlertCircle,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  History,
  ArrowLeft,
  ChevronDown,
  UploadCloud,
} from 'lucide-react';
import { CatalogArticle } from '../data/manualSalesCatalog';
import { StockProduct, StockUnit, areUnitsCompatible } from '../data/stockModel';
import {
  SubRecipe,
  DraftSubRecipe,
  DraftRecipeLine,
  createEmptyDraftSubRecipe,
  createDraftFromSubRecipe,
  createEmptyRecipeLine,
  validateDraftSubRecipe,
  buildSubRecipeFromDraft,
  computeRecipeCost,
  getSubRecipeUsageCount,
} from '../data/productsModel';
import { SubRecipesImportForm } from './SubRecipesImportForm';

interface SubRecipesPageProps {
  subRecipes: SubRecipe[];
  ingredients: StockProduct[];
  units: StockUnit[];
  articles: CatalogArticle[];
  onNavigateToDashboard: () => void;
  onNavigateToProducts: () => void;
  onCreateSubRecipe: (subRecipe: SubRecipe) => void;
  onUpdateSubRecipe: (subRecipe: SubRecipe) => void;
  onDeleteSubRecipe: (subRecipeId: string) => void;
  onImportSubRecipes: (subRecipes: Omit<SubRecipe, 'id' | 'createdAt'>[]) => void;
  isDarkMode?: boolean;
}

type Mode = 'list' | 'create' | 'edit' | 'import';
type Step = 'form' | 'preview' | 'success';

const inputBaseClass =
  'w-full px-3.5 py-2 text-xs rounded-xl border bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 transition';
const inputValidClass = 'border-gray-200 dark:border-gray-700 focus:border-emerald-500 focus:ring-emerald-500';
const inputErrorClass = 'border-red-400 dark:border-red-500/70 focus:border-red-500 focus:ring-red-500';
const labelClass = 'text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 block';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer';
const cardClass = 'p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-4';

export const SubRecipesPage: React.FC<SubRecipesPageProps> = ({
  subRecipes,
  ingredients,
  units,
  articles,
  onNavigateToDashboard,
  onNavigateToProducts,
  onCreateSubRecipe,
  onUpdateSubRecipe,
  onDeleteSubRecipe,
  onImportSubRecipes,
}) => {
  const [mode, setMode] = useState<Mode>('list');
  const [step, setStep] = useState<Step>('form');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftSubRecipe>(() => createEmptyDraftSubRecipe());
  const [hasAttemptedVerify, setHasAttemptedVerify] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SubRecipe | null>(null);

  const editingSubRecipe = useMemo(() => subRecipes.find((sr) => sr.id === editingId) ?? null, [subRecipes, editingId]);

  // A sub-recipe may nest any OTHER sub-recipe, never itself — detectCircularReference (inside
  // validateDraftSubRecipe) catches deeper indirect cycles beyond this direct self-exclusion.
  const nestableSubRecipes = useMemo(() => subRecipes.filter((sr) => sr.id !== draft.id), [subRecipes, draft.id]);

  const issues = useMemo(
    () => validateDraftSubRecipe(draft, ingredients, subRecipes),
    [draft, ingredients, subRecipes]
  );
  const issuesByField = useMemo(() => {
    const map = new Map<string, string>();
    issues.forEach((i) => { if (!map.has(i.field)) map.set(i.field, i.message); });
    return map;
  }, [issues]);
  const showErrors = hasAttemptedVerify;

  const costResult = useMemo(() => computeRecipeCost(draft.ingredients, ingredients, subRecipes), [draft.ingredients, ingredients, subRecipes]);
  const yieldQtyNum = Number(draft.yieldQuantity) || 0;
  const costPerYieldUnit = yieldQtyNum > 0 ? costResult.cost / yieldQtyNum : 0;

  const filteredSubRecipes = useMemo(
    () => subRecipes.filter((sr) => !searchQuery.trim() || sr.name.toLowerCase().includes(searchQuery.trim().toLowerCase())),
    [subRecipes, searchQuery]
  );

  const updateDraft = (patch: Partial<DraftSubRecipe>) => setDraft((prev) => ({ ...prev, ...patch }));

  const addLine = () => updateDraft({ ingredients: [...draft.ingredients, createEmptyRecipeLine()] });
  const removeLine = (id: string) => updateDraft({ ingredients: draft.ingredients.filter((l) => l.id !== id) });
  const updateLine = (id: string, patch: Partial<DraftRecipeLine>) =>
    updateDraft({
      ingredients: draft.ingredients.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, ...patch };
        if (patch.kind !== undefined && patch.kind !== l.kind) {
          next.ingredientId = '';
          next.subRecipeId = '';
          next.unit = '';
        }
        if (patch.ingredientId !== undefined) {
          const ing = ingredients.find((i) => i.id === patch.ingredientId);
          if (ing) next.unit = ing.unit;
        }
        if (patch.subRecipeId !== undefined) {
          const sr = subRecipes.find((s) => s.id === patch.subRecipeId);
          if (sr) next.unit = sr.yieldUnit;
        }
        return next;
      }),
    });

  const getUnitOptionsForLine = (line: DraftRecipeLine): StockUnit[] => {
    if (line.kind === 'ingredient') {
      if (!line.ingredientId) return units;
      const ing = ingredients.find((i) => i.id === line.ingredientId);
      if (!ing) return units;
      return units.filter((u) => areUnitsCompatible(u.name, ing.unit));
    }
    if (!line.subRecipeId) return units;
    const sr = subRecipes.find((s) => s.id === line.subRecipeId);
    if (!sr) return units;
    return units.filter((u) => areUnitsCompatible(u.name, sr.yieldUnit));
  };

  const handleOpenCreate = () => {
    setMode('create');
    setEditingId(null);
    setDraft(createEmptyDraftSubRecipe());
    setStep('form');
    setHasAttemptedVerify(false);
    setSaveError(null);
  };

  const handleOpenEdit = (subRecipe: SubRecipe) => {
    setMode('edit');
    setEditingId(subRecipe.id);
    setDraft(createDraftFromSubRecipe(subRecipe));
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
      const subRecipe = buildSubRecipeFromDraft(draft);
      if (mode === 'create') onCreateSubRecipe(subRecipe);
      else onUpdateSubRecipe(subRecipe);
      setStep('success');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Une erreur est survenue lors de l'enregistrement. Veuillez réessayer.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRequestDelete = (subRecipe: SubRecipe) => setDeleteTarget(subRecipe);
  const deleteUsageCount = useMemo(
    () => (deleteTarget ? getSubRecipeUsageCount(deleteTarget, articles, subRecipes) : 0),
    [deleteTarget, articles, subRecipes]
  );
  const handleConfirmDelete = () => {
    if (!deleteTarget || deleteUsageCount > 0) return;
    onDeleteSubRecipe(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>Sous-recettes</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Gestion des produits
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Composants de recette réutilisables (ex: Pâte à Crêpe) partagés par plusieurs produits.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button onClick={onNavigateToProducts} className={secondaryButtonClass}>
            <History size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Voir les produits</span>
          </button>
          {mode === 'list' && (
            <>
              <button onClick={() => setMode('import')} className={secondaryButtonClass}>
                <UploadCloud size={14} className="text-gray-500 dark:text-gray-400" />
                <span>Import Excel/CSV</span>
              </button>
              <button onClick={handleOpenCreate} className={primaryButtonClass}>
                <Plus size={14} />
                <span>Ajouter une sous-recette</span>
              </button>
            </>
          )}
          <button
            onClick={onNavigateToDashboard}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700/80 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition active:scale-98 cursor-pointer"
          >
            <span>Tableau de bord</span>
          </button>
        </div>
      </div>

      {mode === 'import' ? (
        <SubRecipesImportForm
          subRecipes={subRecipes}
          ingredients={ingredients}
          units={units}
          onImportSubRecipes={onImportSubRecipes}
          onClose={() => setMode('list')}
        />
      ) : mode !== 'list' ? (
        <div className="space-y-4">
          {step === 'success' ? (
            <div className="p-8 sm:p-12 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-500">
                <CheckCircle2 size={30} />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {mode === 'create' ? 'Sous-recette créée' : 'Sous-recette modifiée'}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md">« {draft.name} » est disponible pour vos fiches techniques.</p>
              <button onClick={handleClose} className={primaryButtonClass}>
                <History size={14} />
                <span>Retour aux sous-recettes</span>
              </button>
            </div>
          ) : step === 'preview' ? (
            <>
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-start gap-3">
                <ShieldCheck size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">Vérifiez avant confirmation — rien n'est encore enregistré.</p>
              </div>

              <div className={cardClass}>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">{draft.name}</h3>
                {draft.description && <p className="text-xs text-gray-500 dark:text-gray-400">{draft.description}</p>}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div><span className="text-gray-400 font-semibold block mb-0.5">Rendement</span><span className="font-bold text-gray-900 dark:text-white">{draft.yieldQuantity} {draft.yieldUnit}</span></div>
                  <div><span className="text-gray-400 font-semibold block mb-0.5">Coût du lot</span><span className="font-bold text-gray-900 dark:text-white">{costResult.cost.toFixed(2)} DT</span></div>
                  <div><span className="text-gray-400 font-semibold block mb-0.5">Coût par {draft.yieldUnit}</span><span className="font-bold text-gray-900 dark:text-white">{costPerYieldUnit.toFixed(4)} DT</span></div>
                  <div><span className="text-gray-400 font-semibold block mb-0.5">Composants</span><span className="font-bold text-gray-900 dark:text-white">{draft.ingredients.length}</span></div>
                </div>
              </div>

              <div className={cardClass}>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Composition</h3>
                <div className="space-y-1.5 text-xs">
                  {draft.ingredients.map((line) => {
                    if (line.kind === 'ingredient') {
                      const ing = ingredients.find((i) => i.id === line.ingredientId);
                      return (
                        <div key={line.id} className="flex justify-between px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                          <span>{ing?.name}</span>
                          <span className="font-semibold">{line.quantity} {line.unit}</span>
                        </div>
                      );
                    }
                    const sub = subRecipes.find((sr) => sr.id === line.subRecipeId);
                    return (
                      <div key={line.id} className="flex justify-between px-2.5 py-1.5 rounded-lg bg-blue-50/60 dark:bg-blue-950/20">
                        <span>Sous-recette : {sub?.name}</span>
                        <span className="font-semibold">{line.quantity} {line.unit}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {saveError && (
                <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                  <AlertCircle size={14} /> {saveError}
                </div>
              )}

              <div className={`${cardClass} flex-row flex items-center justify-end gap-2`}>
                <button onClick={() => setStep('form')} disabled={isSaving} className={secondaryButtonClass}>
                  <ArrowLeft size={14} />
                  <span>Modifier</span>
                </button>
                <button onClick={handleConfirm} disabled={isSaving} className={primaryButtonClass}>
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                  <span>{isSaving ? 'Enregistrement…' : 'Confirmer et enregistrer'}</span>
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              {showErrors && issues.length > 0 && (
                <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60">
                  <p className="text-sm font-bold text-red-700 dark:text-red-300 mb-1.5">{issues.length} erreur{issues.length > 1 ? 's' : ''} à corriger</p>
                  <ul className="text-xs text-red-600 dark:text-red-400 space-y-1 list-disc list-inside">
                    {issues.map((i, idx) => (<li key={idx}>{i.message}</li>))}
                  </ul>
                </div>
              )}

              <div className={cardClass}>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Beaker size={16} className="text-emerald-500" /> {mode === 'create' ? 'Nouvelle sous-recette' : `Modifier « ${editingSubRecipe?.name} »`}
                  </h2>
                  <button onClick={handleClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
                    <X size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className={labelClass}>Nom *</label>
                    <input type="text" value={draft.name} onChange={(e) => updateDraft({ name: e.target.value })} placeholder="Ex: Pâte à Crêpe Maison" className={`${inputBaseClass} ${showErrors && issuesByField.has('name') ? inputErrorClass : inputValidClass}`} />
                    {showErrors && issuesByField.get('name') && (
                      <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('name')}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelClass}>Quantité produite *</label>
                      <DecimalInput min={0} step="any" value={draft.yieldQuantity} onChange={(e) => updateDraft({ yieldQuantity: e.target.value })} placeholder="1000" className={`${inputBaseClass} ${showErrors && issuesByField.has('yieldQuantity') ? inputErrorClass : inputValidClass}`} />
                    </div>
                    <div>
                      <label className={labelClass}>Unité *</label>
                      <div className="relative">
                        <select value={draft.yieldUnit} onChange={(e) => updateDraft({ yieldUnit: e.target.value })} className={`${inputBaseClass} appearance-none pr-8 cursor-pointer ${showErrors && issuesByField.has('yieldUnit') ? inputErrorClass : inputValidClass}`}>
                          <option value="">Unité</option>
                          {units.map((u) => (<option key={u.id} value={u.name}>{u.name}</option>))}
                        </select>
                        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Description</label>
                    <textarea value={draft.description} onChange={(e) => updateDraft({ description: e.target.value })} rows={2} className={`${inputBaseClass} ${inputValidClass} resize-none`} />
                  </div>
                </div>
              </div>

              <div className={cardClass}>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">Composition</h2>
                  <span className="text-xs font-semibold text-gray-500">Coût du lot estimé : {costResult.cost.toFixed(2)} DT</span>
                </div>

                {issuesByField.get('ingredients') && (
                  <p className="text-[11px] text-red-500 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('ingredients')}</p>
                )}

                <div className="space-y-2.5">
                  {draft.ingredients.map((line) => {
                    const lineError = issuesByField.get(`line-${line.id}`);
                    return (
                      <div key={line.id} className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40 p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg p-0.5 bg-white dark:bg-gray-900">
                            <button onClick={() => updateLine(line.id, { kind: 'ingredient' })} className={`px-2.5 py-1 text-[11px] font-semibold rounded-md cursor-pointer ${line.kind === 'ingredient' ? 'bg-[#00A86B] text-white' : 'text-gray-500'}`}>Ingrédient</button>
                            <button onClick={() => updateLine(line.id, { kind: 'subrecipe' })} className={`px-2.5 py-1 text-[11px] font-semibold rounded-md cursor-pointer ${line.kind === 'subrecipe' ? 'bg-[#00A86B] text-white' : 'text-gray-500'}`}>Sous-recette</button>
                          </div>
                          <div className="flex-1" />
                          <button onClick={() => removeLine(line.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"><Trash2 size={14} /></button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {line.kind === 'ingredient' ? (
                            <select value={line.ingredientId ?? ''} onChange={(e) => updateLine(line.id, { ingredientId: e.target.value })} className={`${inputBaseClass} appearance-none cursor-pointer ${inputValidClass}`}>
                              <option value="">Choisir un ingrédient</option>
                              {ingredients.map((ing) => (<option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>))}
                            </select>
                          ) : (
                            <select value={line.subRecipeId ?? ''} onChange={(e) => updateLine(line.id, { subRecipeId: e.target.value })} className={`${inputBaseClass} appearance-none cursor-pointer ${inputValidClass}`}>
                              <option value="">Choisir une sous-recette</option>
                              {nestableSubRecipes.map((sr) => (<option key={sr.id} value={sr.id}>{sr.name} ({sr.yieldQuantity} {sr.yieldUnit})</option>))}
                            </select>
                          )}
                          <DecimalInput min={0} step="any" value={line.quantity || ''} onChange={(e) => updateLine(line.id, { quantity: Number(e.target.value) || 0 })} placeholder="Quantité" className={`${inputBaseClass} ${inputValidClass}`} />
                          <select value={line.unit} onChange={(e) => updateLine(line.id, { unit: e.target.value })} className={`${inputBaseClass} appearance-none cursor-pointer ${inputValidClass}`}>
                            <option value="">Unité</option>
                            {getUnitOptionsForLine(line).map((u) => (<option key={u.id} value={u.name}>{u.name}</option>))}
                          </select>
                        </div>
                        {lineError && <p className="text-[11px] text-red-500 flex items-center gap-1"><AlertCircle size={11} /> {lineError}</p>}
                      </div>
                    );
                  })}
                </div>

                <button onClick={addLine} className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 inline-flex items-center gap-1 cursor-pointer">
                  <Plus size={13} /> Ajouter un composant
                </button>
              </div>

              <div className="p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-end gap-2">
                <button onClick={handleClose} className={secondaryButtonClass}>
                  <span>Annuler</span>
                </button>
                <button onClick={handleVerify} className={primaryButtonClass}>
                  <ShieldCheck size={14} />
                  <span>Vérifier la sous-recette</span>
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
                placeholder="Rechercher une sous-recette..."
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
                    <th className="py-3.5 px-4 text-center">Rendement</th>
                    <th className="py-3.5 px-4 text-center">Composants</th>
                    <th className="py-3.5 px-4 text-right">Coût du lot</th>
                    <th className="py-3.5 px-4 text-center">Utilisée par</th>
                    <th className="py-3.5 px-4">Créée le</th>
                    <th className="py-3.5 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 text-xs">
                  {filteredSubRecipes.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-gray-400">
                        <div className="max-w-sm mx-auto space-y-2">
                          <Beaker className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600" />
                          <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">Aucune sous-recette pour cette recherche</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredSubRecipes.map((sr) => {
                      const cost = computeRecipeCost(sr.ingredients, ingredients, subRecipes).cost;
                      const usage = getSubRecipeUsageCount(sr, articles, subRecipes);
                      return (
                        <tr key={sr.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors">
                          <td className="py-3.5 px-4 font-semibold text-gray-900 dark:text-white">{sr.name}</td>
                          <td className="py-3.5 px-4 text-center text-gray-600 dark:text-gray-300">{sr.yieldQuantity} {sr.yieldUnit}</td>
                          <td className="py-3.5 px-4 text-center text-gray-600 dark:text-gray-300">{sr.ingredients.length}</td>
                          <td className="py-3.5 px-4 text-right text-gray-600 dark:text-gray-300">{cost.toFixed(2)} DT</td>
                          <td className="py-3.5 px-4 text-center text-gray-600 dark:text-gray-300">{usage}</td>
                          <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300">{sr.createdAt}</td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => handleOpenEdit(sr)} title="Modifier" className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer"><Pencil size={14} /></button>
                              <button onClick={() => handleRequestDelete(sr)} title="Supprimer" className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"><Trash2 size={14} /></button>
                            </div>
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

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2"><AlertCircle size={16} className="text-red-500" /> Supprimer</h3>
              <button onClick={() => setDeleteTarget(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
            </div>
            <div className="p-5 text-xs text-gray-600 dark:text-gray-300 space-y-2">
              {deleteUsageCount > 0 ? (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-red-600 dark:text-red-400">
                  Suppression impossible : {deleteUsageCount} produit(s) ou sous-recette(s) utilisent encore « {deleteTarget.name} ».
                </div>
              ) : (
                <p>Voulez-vous vraiment supprimer <strong className="text-gray-900 dark:text-white">{deleteTarget.name}</strong> ? Cette action est irréversible.</p>
              )}
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className={secondaryButtonClass}><span>{deleteUsageCount > 0 ? 'Fermer' : 'Annuler'}</span></button>
              {deleteUsageCount === 0 && (
                <button onClick={handleConfirmDelete} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer">
                  <Trash2 size={14} /><span>Confirmer la suppression</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
