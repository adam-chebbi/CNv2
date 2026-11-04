import { DecimalInput } from './ui/DecimalInput';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useUnsavedWorkGuard } from '../hooks/useUnsavedWorkGuard';
import {
  Package,
  ImagePlus,
  X,
  AlertCircle,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  Plus,
  Trash2,
  ChevronDown,
  History,
  Beaker,
  Layers,
  Sparkles,
} from 'lucide-react';
import { CatalogArticle, CatalogExtra, VariantOption, DEFAULT_VAT_RATE, COMMON_VAT_RATES } from '../data/manualSalesCatalog';
import { StockProduct, StockUnit } from '../data/stockModel';
import {
  ProductCategory,
  ProductSubCategory,
  SubRecipe,
  DraftProduct,
  DraftRecipeLine,
  createEmptyDraftProduct,
  createEmptyRecipeLine,
  createDraftFromArticle,
  validateDraftProduct,
  buildCatalogArticleFromDraft,
  areUnitsCompatible,
  computeRecipeCost,
  computeMargin,
  compareToTargetMargin,
  DEFAULT_TARGET_MARGIN_RATE,
  generateProductId,
} from '../data/productsModel';

interface ProductFormPageProps {
  articles: CatalogArticle[];
  extras: CatalogExtra[];
  categories: ProductCategory[];
  subCategories: ProductSubCategory[];
  ingredients: StockProduct[];
  units: StockUnit[];
  subRecipes: SubRecipe[];
  editingArticleId: string | null;
  onNavigateToDashboard: () => void;
  onNavigateToProducts: () => void;
  onCreateProduct: (article: CatalogArticle) => void;
  onUpdateProduct: (article: CatalogArticle) => void;
  // Optional: lets this page create a brand-new catalog extra inline (name + prix), instead of
  // only picking among extras already created from Gestion des produits → Catalogue. The extras
  // list itself always loads dynamically from the shared catalog (the `extras` prop above).
  onCreateExtra?: (extra: Omit<CatalogExtra, 'id'>) => void | Promise<void>;
  isDarkMode?: boolean;
}

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

export const ProductFormPage: React.FC<ProductFormPageProps> = ({
  articles,
  extras,
  categories,
  subCategories,
  ingredients,
  units,
  subRecipes,
  editingArticleId,
  onNavigateToDashboard,
  onNavigateToProducts,
  onCreateProduct,
  onUpdateProduct,
  onCreateExtra,
}) => {
  const editingArticle = useMemo(() => articles.find((a) => a.id === editingArticleId) ?? null, [articles, editingArticleId]);
  const isEditMode = Boolean(editingArticle);

  const [draft, setDraft] = useState<DraftProduct>(() =>
    editingArticle ? createDraftFromArticle(editingArticle, categories, subCategories) : createEmptyDraftProduct()
  );
  const [step, setStep] = useState<Step>('form');
  const [hasAttemptedVerify, setHasAttemptedVerify] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const availableSubCategories = useMemo(
    () => subCategories.filter((s) => s.categoryId === draft.categoryId),
    [subCategories, draft.categoryId]
  );

  const issues = useMemo(
    () => validateDraftProduct(draft, categories, subCategories, ingredients, subRecipes, extras, articles),
    [draft, categories, subCategories, ingredients, subRecipes, extras, articles]
  );
  const issuesByField = useMemo(() => {
    const map = new Map<string, string>();
    issues.forEach((i) => { if (!map.has(i.field)) map.set(i.field, i.message); });
    return map;
  }, [issues]);
  const showErrors = hasAttemptedVerify;

  const recipeCostResult = useMemo(
    () => computeRecipeCost(draft.recipe, ingredients, subRecipes, articles),
    [draft.recipe, ingredients, subRecipes, articles]
  );
  const priceNum = Number(draft.price) || 0;
  // Margins are computed on the price WITHOUT VAT: the VAT inside a TTC price belongs to the state.
  const vatRateNum = draft.vatRate.trim() !== '' && Number.isFinite(Number(draft.vatRate)) ? Number(draft.vatRate) : DEFAULT_VAT_RATE;
  const priceHT = draft.priceIncludesTax ? priceNum / (1 + vatRateNum) : priceNum;
  const margin = computeMargin(priceHT, recipeCostResult.cost);
  const targetRate = draft.targetMarginRate.trim() !== '' ? Number(draft.targetMarginRate) : DEFAULT_TARGET_MARGIN_RATE;
  const comparison = compareToTargetMargin(margin.marginRate, targetRate);

  const hasAnyData =
    Boolean(draft.name) || Boolean(draft.description) || Boolean(draft.price) || draft.recipe.length > 0 || draft.variants.length > 0;
  useUnsavedWorkGuard(hasAnyData);

  const updateDraft = (patch: Partial<DraftProduct>) => setDraft((prev) => ({ ...prev, ...patch }));

  // --- Image upload ---
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateDraft({ imageUrl: String(reader.result) });
    reader.readAsDataURL(file);
    e.target.value = '';
  };
  const handleRemoveImage = () => updateDraft({ imageUrl: '' });

  // --- Recipe lines ---
  const addRecipeLine = () => updateDraft({ recipe: [...draft.recipe, createEmptyRecipeLine()] });
  const removeRecipeLine = (id: string) => updateDraft({ recipe: draft.recipe.filter((l) => l.id !== id) });
  const updateRecipeLine = (id: string, patch: Partial<DraftRecipeLine>) =>
    updateDraft({
      recipe: draft.recipe.map((l) => {
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
  const moveRecipeLine = (id: string, direction: -1 | 1) => {
    const idx = draft.recipe.findIndex((l) => l.id === id);
    const targetIdx = idx + direction;
    if (idx < 0 || targetIdx < 0 || targetIdx >= draft.recipe.length) return;
    const next = [...draft.recipe];
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    updateDraft({ recipe: next });
  };

  // --- Variants ---
  const addVariant = () => updateDraft({ variants: [...draft.variants, { id: generateProductId('var'), label: '', priceDelta: 0 }] });
  const removeVariant = (id: string) => updateDraft({ variants: draft.variants.filter((v) => v.id !== id) });
  const updateVariant = (id: string, patch: Partial<VariantOption>) =>
    updateDraft({ variants: draft.variants.map((v) => (v.id === id ? { ...v, ...patch } : v)) });

  // --- Extras ---
  const toggleExtra = (extraId: string) =>
    updateDraft({ extraIds: draft.extraIds.includes(extraId) ? draft.extraIds.filter((id) => id !== extraId) : [...draft.extraIds, extraId] });

  // Inline "nouvel extra" mini-form — creates a brand-new catalog extra (shared with every other
  // product, same as one created from Gestion des produits → Catalogue) without leaving this page.
  const [newExtraName, setNewExtraName] = useState('');
  const [newExtraPrice, setNewExtraPrice] = useState('0');
  const [isCreatingExtra, setIsCreatingExtra] = useState(false);
  // Names awaiting their real id: the `extras` prop only grows once the parent refetches after
  // onCreateExtra resolves, so this bridges that round-trip and auto-selects the extra for this
  // product as soon as it actually appears in the (dynamically loaded) catalog.
  const [pendingExtraNames, setPendingExtraNames] = useState<Set<string>>(new Set());
  const prevExtraIdsRef = useRef<Set<string>>(new Set(extras.map((e) => e.id)));

  useEffect(() => {
    if (pendingExtraNames.size === 0) {
      prevExtraIdsRef.current = new Set(extras.map((e) => e.id));
      return;
    }
    const newlyAdded = extras.filter((e) => !prevExtraIdsRef.current.has(e.id) && pendingExtraNames.has(e.name.trim().toLowerCase()));
    if (newlyAdded.length > 0) {
      updateDraft({ extraIds: [...draft.extraIds, ...newlyAdded.map((e) => e.id)] });
      setPendingExtraNames((prev) => {
        const next = new Set(prev);
        newlyAdded.forEach((e) => next.delete(e.name.trim().toLowerCase()));
        return next;
      });
    }
    prevExtraIdsRef.current = new Set(extras.map((e) => e.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extras]);

  const handleCreateExtraInline = async () => {
    const name = newExtraName.trim();
    if (!name || !onCreateExtra) return;
    const price = Number(newExtraPrice) || 0;
    setIsCreatingExtra(true);
    try {
      await onCreateExtra({ name, price });
      setPendingExtraNames((prev) => new Set(prev).add(name.toLowerCase()));
      setNewExtraName('');
      setNewExtraPrice('0');
    } finally {
      setIsCreatingExtra(false);
    }
  };

  const handleVerify = () => {
    setHasAttemptedVerify(true);
    if (issues.length === 0) {
      setStep('preview');
      document.getElementById('app-main-scroll-area')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleConfirmSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const article = buildCatalogArticleFromDraft(draft, categories, subCategories);
      await new Promise((resolve) => setTimeout(resolve, 600));
      if (isEditMode) onUpdateProduct(article);
      else onCreateProduct(article);
      setStep('success');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Une erreur est survenue lors de l'enregistrement. Veuillez réessayer.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (hasAnyData && !window.confirm('Voulez-vous quitter la saisie ? Les données non enregistrées seront perdues.')) return;
    onNavigateToProducts();
  };

  // Only offer units convertible to the ingredient's (or sub-recipe's yield) own unit — e.g. an
  // ingredient stocked in "kg" can be dosed in "g" or "kg" — so the picker can't lead the user
  // into an incompatible combination in the first place.
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

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>{isEditMode ? 'Modifier le produit' : 'Ajout produits'}</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Produits, recettes & marges
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Informations générales, fiche technique, variantes, extras et marges.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button onClick={onNavigateToProducts} className={secondaryButtonClass}>
            <History size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Voir les produits</span>
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
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{isEditMode ? 'Produit mis à jour' : 'Produit créé'}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md">
            « {draft.name} » {isEditMode ? 'a été mis à jour dans' : 'est maintenant disponible dans'} le catalogue.
          </p>
          <button onClick={onNavigateToProducts} className={primaryButtonClass}>
            <Package size={14} />
            <span>Voir les produits</span>
          </button>
        </div>
      ) : step === 'preview' ? (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-start gap-3">
            <ShieldCheck size={20} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">Vérifiez le produit avant confirmation</p>
              <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">Aucune donnée n'est encore enregistrée.</p>
            </div>
          </div>

          <div className={cardClass}>
            <div className="flex items-start gap-4">
              {draft.imageUrl ? (
                <img src={draft.imageUrl} alt={draft.name} className="w-24 h-24 rounded-xl object-cover border border-gray-100 dark:border-gray-800" />
              ) : (
                <div className="w-24 h-24 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-300 dark:text-gray-600">
                  <ImagePlus size={22} />
                </div>
              )}
              <div className="flex-1 space-y-1">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">{draft.name}</h3>
                {draft.description && <p className="text-xs text-gray-500 dark:text-gray-400">{draft.description}</p>}
                <div className="flex flex-wrap gap-2 pt-1 text-[11px]">
                  <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                    {categories.find((c) => c.id === draft.categoryId)?.name}
                    {draft.subCategoryId ? ` › ${subCategories.find((s) => s.id === draft.subCategoryId)?.name}` : ''}
                  </span>
                  <span className={`px-2 py-0.5 rounded-md font-semibold ${draft.isAvailable ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
                    {draft.isAvailable ? 'Disponible' : 'Indisponible'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className={cardClass}>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Fiche technique</h3>
            {draft.recipe.length > 0 ? (
              <div className="space-y-1.5 text-xs">
                {draft.recipe.map((line) => {
                  if (line.kind === 'ingredient') {
                    const ing = ingredients.find((i) => i.id === line.ingredientId);
                    return (
                      <div key={line.id} className="flex justify-between px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                        <span>{ing?.name}</span>
                        <span className="font-semibold">{line.quantity} {line.unit}</span>
                      </div>
                    );
                  }
                  if (line.kind === 'product') {
                    const prod = articles.find((a) => a.id === line.productId);
                    return (
                      <div key={line.id} className="flex justify-between px-2.5 py-1.5 rounded-lg bg-purple-50/60 dark:bg-purple-950/20">
                        <span>Produit : {prod?.name}</span>
                        <span className="font-semibold">×{line.quantity}</span>
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
            ) : (
              <p className="text-xs text-gray-400">Aucune fiche technique.</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className={cardClass}>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Variantes</h3>
              {draft.variants.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {draft.variants.map((v) => (
                    <span key={v.id} className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-[11px] font-medium">
                      {v.label}{v.priceDelta ? ` (+${v.priceDelta.toFixed(2)} DT)` : ''}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">Aucune variante.</p>
              )}
            </div>
            <div className={cardClass}>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Extras / suppléments</h3>
              {draft.extraIds.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {draft.extraIds.map((id) => {
                    const extra = extras.find((e) => e.id === id);
                    return extra ? (
                      <span key={id} className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[11px] font-medium">
                        {extra.name}
                      </span>
                    ) : null;
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-400">Aucun extra.</p>
              )}
            </div>
          </div>

          <div className={cardClass}>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Marges</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div><span className="text-gray-400 font-semibold block mb-0.5">Prix de vente HT</span><span className="font-bold text-gray-900 dark:text-white">{priceHT.toFixed(2)} DT</span></div>
              <div><span className="text-gray-400 font-semibold block mb-0.5">Coût matière</span><span className="font-bold text-gray-900 dark:text-white">{recipeCostResult.cost.toFixed(2)} DT</span></div>
              <div><span className="text-gray-400 font-semibold block mb-0.5">Marge brute</span><span className="font-bold text-gray-900 dark:text-white">{margin.grossMargin.toFixed(2)} DT</span></div>
              <div>
                <span className="text-gray-400 font-semibold block mb-0.5">Taux de marge</span>
                <span className={`font-bold ${comparison === 'inferieur' ? 'text-red-600 dark:text-red-400' : comparison === 'depasse' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}`}>
                  {(margin.marginRate * 100).toFixed(1)}%
                </span>
              </div>
            </div>
            <p className="text-[11px] text-gray-400">
              Marge calculée sur le prix hors taxes (TVA {(vatRateNum * 100).toFixed(0)}%). Marge cible : {(targetRate * 100).toFixed(0)}% —{' '}
              {comparison === 'atteint' ? 'objectif atteint' : comparison === 'inferieur' ? 'en dessous de la cible' : 'au-dessus de la cible'}.
            </p>
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
            <button onClick={handleConfirmSave} disabled={isSaving} className={primaryButtonClass}>
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              <span>{isSaving ? 'Enregistrement…' : isEditMode ? 'Confirmer et enregistrer' : 'Confirmer et créer le produit'}</span>
            </button>
          </div>
        </div>
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

          {/* Informations générales */}
          <div className={cardClass}>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Package size={16} className="text-emerald-500" /> Informations générales
            </h2>

            <div className="flex items-start gap-4">
              {draft.imageUrl ? (
                <div className="relative">
                  <img src={draft.imageUrl} alt="Aperçu" className="w-24 h-24 rounded-xl object-cover border border-gray-200 dark:border-gray-700" />
                  <button onClick={handleRemoveImage} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow cursor-pointer">
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button onClick={() => fileInputRef.current?.click()} className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-emerald-400 hover:text-emerald-500 transition cursor-pointer">
                  <ImagePlus size={20} />
                  <span className="text-[10px] font-semibold">Photo</span>
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
              {draft.imageUrl && (
                <button onClick={() => fileInputRef.current?.click()} className={secondaryButtonClass}>
                  <span>Remplacer l'image</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className={labelClass}>Nom *</label>
                <input type="text" value={draft.name} onChange={(e) => updateDraft({ name: e.target.value })} className={`${inputBaseClass} ${showErrors && issuesByField.has('name') ? inputErrorClass : inputValidClass}`} />
              </div>
              <div>
                <label className={labelClass}>Prix de vente (DT) *</label>
                <DecimalInput min={0} step="any" value={draft.price} onChange={(e) => updateDraft({ price: e.target.value })} className={`${inputBaseClass} ${showErrors && issuesByField.has('price') ? inputErrorClass : inputValidClass}`} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Description</label>
                <textarea value={draft.description} onChange={(e) => updateDraft({ description: e.target.value })} rows={2} className={`${inputBaseClass} ${inputValidClass} resize-none`} />
              </div>
              <div>
                <label className={labelClass}>Catégorie *</label>
                <div className="relative">
                  <select
                    value={draft.categoryId}
                    onChange={(e) => updateDraft({ categoryId: e.target.value, subCategoryId: '' })}
                    className={`${inputBaseClass} appearance-none pr-8 cursor-pointer ${showErrors && issuesByField.has('category') ? inputErrorClass : inputValidClass}`}
                  >
                    <option value="">Sélectionner une catégorie</option>
                    {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className={labelClass}>Sous-catégorie</label>
                <div className="relative">
                  <select
                    value={draft.subCategoryId}
                    onChange={(e) => updateDraft({ subCategoryId: e.target.value })}
                    disabled={!draft.categoryId || availableSubCategories.length === 0}
                    className={`${inputBaseClass} appearance-none pr-8 cursor-pointer ${inputValidClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <option value="">
                      {!draft.categoryId ? 'Choisissez une catégorie' : availableSubCategories.length === 0 ? 'Aucune sous-catégorie' : 'Aucune (optionnel)'}
                    </option>
                    {availableSubCategories.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className={labelClass}>Marge cible (optionnel)</label>
                <DecimalInput min={0} max={1} step="0.01" value={draft.targetMarginRate} onChange={(e) => updateDraft({ targetMarginRate: e.target.value })} placeholder={`Défaut ${(DEFAULT_TARGET_MARGIN_RATE * 100).toFixed(0)}%`} className={`${inputBaseClass} ${showErrors && issuesByField.has('targetMarginRate') ? inputErrorClass : inputValidClass}`} />
              </div>
              <div>
                <label className={labelClass}>Taux de TVA (optionnel)</label>
                <div className="flex items-center gap-1.5">
                  <DecimalInput
                    min={0}
                    max={1}
                    step="0.01"
                    value={draft.vatRate}
                    onChange={(e) => updateDraft({ vatRate: e.target.value })}
                    placeholder={`Défaut ${(DEFAULT_VAT_RATE * 100).toFixed(0)}%`}
                    className={`${inputBaseClass} ${showErrors && issuesByField.has('vatRate') ? inputErrorClass : inputValidClass}`}
                  />
                  <div className="relative shrink-0">
                    <select
                      value=""
                      onChange={(e) => e.target.value && updateDraft({ vatRate: e.target.value })}
                      className="appearance-none px-2 py-2 pr-6 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-pointer"
                      title="Taux courants tunisiens"
                    >
                      <option value="">Taux…</option>
                      {COMMON_VAT_RATES.map((r) => (
                        <option key={r.rate} value={r.rate}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                {showErrors && issuesByField.get('vatRate') && (
                  <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle size={11} /> {issuesByField.get('vatRate')}
                  </p>
                )}
              </div>
              <div>
                <label className={labelClass}>Le prix ci-dessus inclut la TVA</label>
                <button
                  type="button"
                  onClick={() => updateDraft({ priceIncludesTax: !draft.priceIncludesTax })}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer w-full ${
                    draft.priceIncludesTax
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700'
                  }`}
                >
                  {draft.priceIncludesTax ? 'Oui — prix TTC' : 'Non — prix HT'}
                </button>
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => updateDraft({ isAvailable: !draft.isAvailable })}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer w-full ${
                    draft.isAvailable
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700'
                  }`}
                >
                  {draft.isAvailable ? 'Disponible à la vente' : 'Indisponible'}
                </button>
              </div>
            </div>
          </div>

          {/* Fiche technique */}
          <div className={cardClass}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Beaker size={16} className="text-emerald-500" /> Fiche technique
              </h2>
              <span className="text-xs font-semibold text-gray-500">Coût matière estimé : {recipeCostResult.cost.toFixed(2)} DT</span>
            </div>

            {draft.recipe.length === 0 && <p className="text-xs text-gray-400">Aucun ingrédient. Un produit peut être vendu sans fiche technique.</p>}

            <div className="space-y-2.5">
              {draft.recipe.map((line, idx) => {
                const lineError = issuesByField.get(`recipe-${line.id}`);
                return (
                  <div key={line.id} className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg p-0.5 bg-white dark:bg-gray-900">
                        <button onClick={() => updateRecipeLine(line.id, { kind: 'ingredient' })} className={`px-2.5 py-1 text-[11px] font-semibold rounded-md cursor-pointer ${line.kind === 'ingredient' ? 'bg-[#00A86B] text-white' : 'text-gray-500'}`}>Ingrédient</button>
                        <button onClick={() => updateRecipeLine(line.id, { kind: 'subrecipe' })} className={`px-2.5 py-1 text-[11px] font-semibold rounded-md cursor-pointer ${line.kind === 'subrecipe' ? 'bg-[#00A86B] text-white' : 'text-gray-500'}`}>Sous-recette</button>
                        <button onClick={() => updateRecipeLine(line.id, { kind: 'product', unit: 'unité' })} className={`px-2.5 py-1 text-[11px] font-semibold rounded-md cursor-pointer ${line.kind === 'product' ? 'bg-[#00A86B] text-white' : 'text-gray-500'}`}>Produit</button>
                      </div>
                      <div className="flex-1" />
                      <button onClick={() => moveRecipeLine(line.id, -1)} disabled={idx === 0} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 cursor-pointer">▲</button>
                      <button onClick={() => moveRecipeLine(line.id, 1)} disabled={idx === draft.recipe.length - 1} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 cursor-pointer">▼</button>
                      <button onClick={() => removeRecipeLine(line.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"><Trash2 size={14} /></button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {line.kind === 'ingredient' ? (
                        <div className="sm:col-span-1">
                          <select value={line.ingredientId ?? ''} onChange={(e) => updateRecipeLine(line.id, { ingredientId: e.target.value })} className={`${inputBaseClass} appearance-none cursor-pointer ${inputValidClass}`}>
                            <option value="">Choisir un ingrédient</option>
                            {ingredients.map((ing) => (<option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>))}
                          </select>
                        </div>
                      ) : line.kind === 'product' ? (
                        <div className="sm:col-span-2">
                          <select value={line.productId ?? ''} onChange={(e) => updateRecipeLine(line.id, { productId: e.target.value })} className={`${inputBaseClass} appearance-none cursor-pointer ${inputValidClass}`}>
                            <option value="">Choisir un produit</option>
                            {articles.filter((a) => a.id !== draft.id).map((a) => (<option key={a.id} value={a.id}>{a.name} ({a.price.toFixed(2)} DT)</option>))}
                          </select>
                        </div>
                      ) : (
                        <div className="sm:col-span-1">
                          <select value={line.subRecipeId ?? ''} onChange={(e) => updateRecipeLine(line.id, { subRecipeId: e.target.value })} className={`${inputBaseClass} appearance-none cursor-pointer ${inputValidClass}`}>
                            <option value="">Choisir une sous-recette</option>
                            {subRecipes.map((sr) => (<option key={sr.id} value={sr.id}>{sr.name} ({sr.yieldQuantity} {sr.yieldUnit})</option>))}
                          </select>
                        </div>
                      )}

                      <DecimalInput
                        min={0}
                        step={line.kind === 'product' ? 1 : 'any'}
                        value={line.quantity || ''}
                        onChange={(e) => updateRecipeLine(line.id, { quantity: Number(e.target.value) || 0 })}
                        placeholder={line.kind === 'product' ? 'Quantité (×)' : 'Quantité'}
                        className={`${inputBaseClass} ${inputValidClass}`}
                      />

                      {line.kind !== 'product' && (
                        <select value={line.unit} onChange={(e) => updateRecipeLine(line.id, { unit: e.target.value })} className={`${inputBaseClass} appearance-none cursor-pointer ${inputValidClass}`}>
                          <option value="">Unité</option>
                          {getUnitOptionsForLine(line).map((u) => (<option key={u.id} value={u.name}>{u.name}</option>))}
                        </select>
                      )}
                    </div>
                    {line.kind === 'subrecipe' && line.subRecipeId && (
                      <p className="text-[11px] text-gray-400">
                        Coût proportionnel au lot de {subRecipes.find((sr) => sr.id === line.subRecipeId)?.yieldQuantity}{' '}
                        {subRecipes.find((sr) => sr.id === line.subRecipeId)?.yieldUnit} produit par cette sous-recette.
                      </p>
                    )}
                    {lineError && <p className="text-[11px] text-red-500 flex items-center gap-1"><AlertCircle size={11} /> {lineError}</p>}
                  </div>
                );
              })}
            </div>

            <button onClick={addRecipeLine} className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 inline-flex items-center gap-1 cursor-pointer">
              <Plus size={13} /> Ajouter un ingrédient
            </button>
            {issuesByField.get('recipe') && (
              <p className="text-[11px] text-red-500 flex items-center gap-1"><AlertCircle size={11} /> {issuesByField.get('recipe')}</p>
            )}
          </div>

          {/* Variantes */}
          <div className={cardClass}>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Layers size={16} className="text-emerald-500" /> Variantes
            </h2>
            <p className="text-[11px] text-gray-400 -mt-2">Une variante représente une variation du produit (ex: taille, format). Optionnel — le produit reste vendable sans aucune variante.</p>
            <div className="space-y-3">
              {draft.variants.map((v) => (
                <div key={v.id} className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 block">Nom de la variante</label>
                    <input type="text" value={v.label} onChange={(e) => updateVariant(v.id, { label: e.target.value })} placeholder="Ex: Grande, 33cl, Sans sucre…" className={`${inputBaseClass} ${inputValidClass}`} />
                  </div>
                  <div className="w-32 shrink-0">
                    <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 block">Supplément de prix (DT)</label>
                    <DecimalInput step="any" value={v.priceDelta ?? 0} onChange={(e) => updateVariant(v.id, { priceDelta: Number(e.target.value) || 0 })} placeholder="0,00" className={`${inputBaseClass} ${inputValidClass}`} />
                  </div>
                  <button onClick={() => removeVariant(v.id)} title="Supprimer cette variante" className="p-2 mb-0.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"><Trash2 size={14} /></button>
                </div>
              ))}
              {draft.variants.length === 0 && <p className="text-xs text-gray-400">Aucune variante ajoutée pour l'instant.</p>}
            </div>
            <button onClick={addVariant} className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 inline-flex items-center gap-1 cursor-pointer">
              <Plus size={13} /> Ajouter une variante
            </button>
          </div>

          {/* Extras */}
          <div className={cardClass}>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Sparkles size={16} className="text-emerald-500" /> Extras / suppléments
            </h2>
            <p className="text-[11px] text-gray-400 -mt-2">
              Un extra représente un ajout optionnel au produit (ex: chantilly, shot supplémentaire). Optionnel — cliquez pour
              (dé)sélectionner ceux déjà créés dans le catalogue, ou créez-en un nouveau ci-dessous.
            </p>
            {extras.length > 0 ? (
              <div>
                <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5 block">Extras existants (catalogue)</label>
                <div className="flex flex-wrap gap-1.5">
                  {extras.map((extra) => {
                    const selected = draft.extraIds.includes(extra.id);
                    return (
                      <button
                        key={extra.id}
                        onClick={() => toggleExtra(extra.id)}
                        title={`${extra.name} — ${extra.price.toFixed(2)} DT`}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition cursor-pointer ${
                          selected ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-emerald-300'
                        }`}
                      >
                        {extra.name} <span className={selected ? 'text-white/80' : 'text-gray-400'}>· {extra.price.toFixed(2)} DT</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400">Aucun extra dans le catalogue pour l'instant — créez-en un ci-dessous.</p>
            )}

            {onCreateExtra && (
              <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
                <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5 block">Créer un nouvel extra</label>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={newExtraName}
                      onChange={(e) => setNewExtraName(e.target.value)}
                      placeholder="Nom de l'extra (ex: Chantilly)"
                      className={`${inputBaseClass} ${inputValidClass}`}
                    />
                  </div>
                  <div className="w-28 shrink-0">
                    <DecimalInput
                      min={0}
                      step="any"
                      value={newExtraPrice}
                      onChange={(e) => setNewExtraPrice(e.target.value)}
                      placeholder="Prix (DT)"
                      className={`${inputBaseClass} ${inputValidClass}`}
                    />
                  </div>
                  <button
                    onClick={handleCreateExtraInline}
                    disabled={!newExtraName.trim() || isCreatingExtra}
                    className={`${secondaryButtonClass} shrink-0`}
                  >
                    {isCreatingExtra ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                    <span>Ajouter</span>
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Le nouvel extra est ajouté au catalogue partagé et sélectionné automatiquement pour ce produit.</p>
              </div>
            )}
          </div>

          {/* Live margin preview */}
          <div className={cardClass}>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Aperçu des marges</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div><span className="text-gray-400 font-semibold block mb-0.5">Prix HT</span><span className="font-bold text-gray-900 dark:text-white">{priceHT.toFixed(2)} DT</span></div>
              <div><span className="text-gray-400 font-semibold block mb-0.5">Coût matière</span><span className="font-bold text-gray-900 dark:text-white">{recipeCostResult.cost.toFixed(2)} DT</span></div>
              <div><span className="text-gray-400 font-semibold block mb-0.5">Marge brute</span><span className="font-bold text-gray-900 dark:text-white">{margin.grossMargin.toFixed(2)} DT</span></div>
              <div>
                <span className="text-gray-400 font-semibold block mb-0.5">Taux de marge</span>
                <span className={`font-bold ${comparison === 'inferieur' ? 'text-red-600 dark:text-red-400' : comparison === 'depasse' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}`}>{(margin.marginRate * 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-end gap-2">
            <button onClick={handleCancel} className={secondaryButtonClass}>
              <span>Annuler</span>
            </button>
            <button onClick={handleVerify} className={primaryButtonClass}>
              <ShieldCheck size={14} />
              <span>Vérifier le produit</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
