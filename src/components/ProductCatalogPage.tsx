import { DecimalInput } from './ui/DecimalInput';
import { todayIso } from '../data/dateUtils';
import React, { useMemo, useState } from 'react';
import {
  BookOpen,
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
  FolderTree,
  Tag,
  Sparkles,
  Beaker,
} from 'lucide-react';
import { CatalogArticle, CatalogExtra, RecipeLine } from '../data/manualSalesCatalog';
import {
  ProductCategory,
  ProductSubCategory,
  generateProductId,
  resolveProductCategoryByName,
  resolveProductSubCategoryByName,
  getCategoryUsageCount,
  getSubCategoryUsageCount,
  createEmptyRecipeLine,
  areUnitsCompatible,
} from '../data/productsModel';
import { StockProduct, StockUnit } from '../data/stockModel';

interface ProductCatalogPageProps {
  categories: ProductCategory[];
  subCategories: ProductSubCategory[];
  articles: CatalogArticle[];
  extras: CatalogExtra[];
  ingredients: StockProduct[];
  units: StockUnit[];
  onNavigateToDashboard: () => void;
  onNavigateToProducts: () => void;
  onCreateCategory: (category: ProductCategory) => void;
  onRenameCategory: (categoryId: string, newName: string) => void;
  onDeleteCategory: (categoryId: string) => void;
  onCreateSubCategory: (subCategory: ProductSubCategory) => void;
  onRenameSubCategory: (subCategoryId: string, newName: string, newCategoryId: string) => void;
  onDeleteSubCategory: (subCategoryId: string) => void;
  onCreateExtra: (extra: Omit<CatalogExtra, 'id'>) => void;
  onUpdateExtra: (id: string, extra: Omit<CatalogExtra, 'id'>) => void;
  onDeleteExtra: (id: string) => void;
  isDarkMode?: boolean;
}

type EntityKind = 'category' | 'subcategory' | 'extra';
type Mode = 'list' | 'create' | 'edit';
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

export const ProductCatalogPage: React.FC<ProductCatalogPageProps> = ({
  categories,
  subCategories,
  articles,
  extras,
  ingredients,
  units,
  onNavigateToDashboard,
  onNavigateToProducts,
  onCreateCategory,
  onRenameCategory,
  onDeleteCategory,
  onCreateSubCategory,
  onRenameSubCategory,
  onDeleteSubCategory,
  onCreateExtra,
  onUpdateExtra,
  onDeleteExtra,
}) => {
  const [activeTab, setActiveTab] = useState<EntityKind>('category');
  const [mode, setMode] = useState<Mode>('list');
  const [step, setStep] = useState<Step>('form');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState(''); // for subcategory form
  const [hasAttemptedVerify, setHasAttemptedVerify] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ kind: EntityKind; id: string; name: string } | null>(null);

  // --- Suppléments (CatalogExtra) — a self-contained mini-form, kept separate from the
  // category/subcategory wizard above since extras have a different shape (name + price, no
  // parent, no usage-guarded delete beyond "is it referenced by a product"). Labelled
  // "Suppléments" in the UI (not "Extras") to avoid the historical name clash with the
  // "Extras" *product category* — a real menu category of sellable items like "Extra Fromage" —
  // which is a completely different concept from these per-ticket add-ons.
  const [extraFormOpen, setExtraFormOpen] = useState(false);
  const [editingExtraId, setEditingExtraId] = useState<string | null>(null);
  const [extraName, setExtraName] = useState('');
  const [extraPrice, setExtraPrice] = useState('');
  const [extraRecipe, setExtraRecipe] = useState<RecipeLine[]>([]);
  const [extraSaveError, setExtraSaveError] = useState<string | null>(null);
  const [extraIsSaving, setExtraIsSaving] = useState(false);

  // An extra's own fiche technique: ingredient-only lines (no sub-recipe/composed-product nesting,
  // unlike a product's recipe — an extra is a small, self-contained add-on) — deducted from stock
  // on top of the base product's own recipe whenever this extra is selected on a sale (see
  // server/routes/sales.ts's deductStockForSale).
  const addExtraRecipeLine = () => setExtraRecipe((prev) => [...prev, createEmptyRecipeLine()]);
  const removeExtraRecipeLine = (id: string) => setExtraRecipe((prev) => prev.filter((l) => l.id !== id));
  const updateExtraRecipeLine = (id: string, patch: Partial<RecipeLine>) =>
    setExtraRecipe((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, ...patch };
        // Reset the unit when the ingredient changes so an incompatible leftover can't linger.
        if (patch.ingredientId !== undefined && patch.ingredientId !== l.ingredientId) next.unit = '';
        return next;
      })
    );
  const getUnitOptionsForExtraLine = (line: RecipeLine): StockUnit[] => {
    if (!line.ingredientId) return units;
    const ing = ingredients.find((i) => i.id === line.ingredientId);
    if (!ing) return units;
    return units.filter((u) => areUnitsCompatible(u.name, ing.unit));
  };

  const filteredExtras = useMemo(
    () => extras.filter((e) => !searchQuery.trim() || e.name.toLowerCase().includes(searchQuery.trim().toLowerCase())),
    [extras, searchQuery]
  );

  const extraIssues = useMemo(() => {
    const list: string[] = [];
    if (!extraName.trim()) list.push('Le nom du supplément est obligatoire.');
    const priceNum = Number(extraPrice);
    if (extraPrice.trim() === '' || Number.isNaN(priceNum) || priceNum < 0) list.push('Le prix doit être un nombre positif ou nul.');
    extraRecipe.forEach((line, idx) => {
      const label = `Ingrédient ${idx + 1}`;
      if (!line.ingredientId) list.push(`${label} : sélectionnez un ingrédient.`);
      else if (!line.quantity || line.quantity <= 0) list.push(`${label} : la quantité doit être supérieure à 0.`);
      else if (!line.unit) list.push(`${label} : sélectionnez une unité.`);
      else {
        const ing = ingredients.find((i) => i.id === line.ingredientId);
        if (ing && !areUnitsCompatible(line.unit, ing.unit)) {
          list.push(`${label} : l'unité "${line.unit}" est incompatible avec l'unité de stock de cet ingrédient ("${ing.unit}").`);
        }
      }
    });
    return list;
  }, [extraName, extraPrice, extraRecipe, ingredients]);

  const handleOpenCreateExtra = () => {
    setEditingExtraId(null);
    setExtraName('');
    setExtraPrice('');
    setExtraRecipe([]);
    setExtraSaveError(null);
    setExtraFormOpen(true);
  };

  const handleOpenEditExtra = (extra: CatalogExtra) => {
    setEditingExtraId(extra.id);
    setExtraName(extra.name);
    setExtraPrice(String(extra.price));
    setExtraRecipe((extra.recipe ?? []).map((line) => ({ ...line })));
    setExtraSaveError(null);
    setExtraFormOpen(true);
  };

  const handleSaveExtra = async () => {
    if (extraIssues.length > 0) return;
    setExtraIsSaving(true);
    setExtraSaveError(null);
    try {
      const payload = { name: extraName.trim(), price: Number(extraPrice), recipe: extraRecipe.length > 0 ? extraRecipe : undefined };
      if (editingExtraId) await onUpdateExtra(editingExtraId, payload);
      else await onCreateExtra(payload);
      setExtraFormOpen(false);
    } catch (err) {
      setExtraSaveError(err instanceof Error ? err.message : "Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setExtraIsSaving(false);
    }
  };

  const handleRequestDeleteExtra = (extra: CatalogExtra) => setDeleteTarget({ kind: 'extra', id: extra.id, name: extra.name });

  const editingCategory = useMemo(() => categories.find((c) => c.id === editingId) ?? null, [categories, editingId]);
  const editingSubCategory = useMemo(() => subCategories.find((s) => s.id === editingId) ?? null, [subCategories, editingId]);

  const issues = useMemo(() => {
    const list: string[] = [];
    const trimmed = name.trim();
    if (!trimmed) {
      list.push(`Le nom de la ${activeTab === 'category' ? 'catégorie' : 'sous-catégorie'} est obligatoire.`);
    } else if (activeTab === 'category') {
      const existing = resolveProductCategoryByName(trimmed, categories);
      if (existing && existing.id !== editingId) list.push(`Cette catégorie existe déjà : « ${existing.name} ».`);
    } else {
      if (!categoryId) list.push('La catégorie parente est obligatoire.');
      const existing = resolveProductSubCategoryByName(trimmed, subCategories, categoryId);
      if (existing && existing.id !== editingId) list.push(`Cette sous-catégorie existe déjà dans cette catégorie : « ${existing.name} ».`);
    }
    return list;
  }, [name, categoryId, activeTab, categories, subCategories, editingId]);

  const showErrors = hasAttemptedVerify;

  const filteredCategories = useMemo(
    () => categories.filter((c) => !searchQuery.trim() || c.name.toLowerCase().includes(searchQuery.trim().toLowerCase())),
    [categories, searchQuery]
  );
  const filteredSubCategories = useMemo(
    () => subCategories.filter((s) => !searchQuery.trim() || s.name.toLowerCase().includes(searchQuery.trim().toLowerCase())),
    [subCategories, searchQuery]
  );

  const handleOpenCreate = () => {
    setMode('create');
    setEditingId(null);
    setName('');
    setCategoryId(activeTab === 'subcategory' ? categories[0]?.id ?? '' : '');
    setStep('form');
    setHasAttemptedVerify(false);
    setSaveError(null);
  };

  const handleOpenEditCategory = (cat: ProductCategory) => {
    setActiveTab('category');
    setMode('edit');
    setEditingId(cat.id);
    setName(cat.name);
    setStep('form');
    setHasAttemptedVerify(false);
    setSaveError(null);
  };

  const handleOpenEditSubCategory = (sub: ProductSubCategory) => {
    setActiveTab('subcategory');
    setMode('edit');
    setEditingId(sub.id);
    setName(sub.name);
    setCategoryId(sub.categoryId);
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
      if (activeTab === 'category') {
        if (mode === 'create') onCreateCategory({ id: generateProductId('pcat'), name: trimmed, createdAt: todayIso() });
        else if (editingId) onRenameCategory(editingId, trimmed);
      } else {
        if (mode === 'create') onCreateSubCategory({ id: generateProductId('psub'), categoryId, name: trimmed, createdAt: todayIso() });
        else if (editingId) onRenameSubCategory(editingId, trimmed, categoryId);
      }
      setStep('success');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Une erreur est survenue lors de l'enregistrement. Veuillez réessayer.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRequestDeleteCategory = (cat: ProductCategory) => setDeleteTarget({ kind: 'category', id: cat.id, name: cat.name });
  const handleRequestDeleteSubCategory = (sub: ProductSubCategory) => setDeleteTarget({ kind: 'subcategory', id: sub.id, name: sub.name });

  const deleteBlockedReason = useMemo(() => {
    if (!deleteTarget) return null;
    if (deleteTarget.kind === 'category') {
      const cat = categories.find((c) => c.id === deleteTarget.id);
      if (!cat) return null;
      const productCount = getCategoryUsageCount(cat, articles);
      const subCount = subCategories.filter((s) => s.categoryId === cat.id).length;
      if (productCount > 0) return `${productCount} produit${productCount > 1 ? 's utilisent' : ' utilise'} cette catégorie.`;
      if (subCount > 0) return `${subCount} sous-catégorie${subCount > 1 ? 's dépendent' : ' dépend'} de cette catégorie.`;
      return null;
    }
    if (deleteTarget.kind === 'extra') {
      const usedByCount = articles.filter((a) => a.extraIds?.includes(deleteTarget.id)).length;
      return usedByCount > 0 ? `${usedByCount} produit${usedByCount > 1 ? 's proposent' : ' propose'} ce supplément.` : null;
    }
    const sub = subCategories.find((s) => s.id === deleteTarget.id);
    if (!sub) return null;
    const productCount = getSubCategoryUsageCount(sub, articles);
    return productCount > 0 ? `${productCount} produit${productCount > 1 ? 's utilisent' : ' utilise'} cette sous-catégorie.` : null;
  }, [deleteTarget, categories, subCategories, articles]);

  const handleConfirmDelete = () => {
    if (!deleteTarget || deleteBlockedReason) return;
    if (deleteTarget.kind === 'category') onDeleteCategory(deleteTarget.id);
    else if (deleteTarget.kind === 'extra') onDeleteExtra(deleteTarget.id);
    else onDeleteSubCategory(deleteTarget.id);
    setDeleteTarget(null);
  };

  const entityLabel = activeTab === 'category' ? 'catégorie' : activeTab === 'extra' ? 'supplément' : 'sous-catégorie';

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>Catalogue</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Produits, recettes & marges
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Gestion des catégories, sous-catégories et suppléments de produits.</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button onClick={onNavigateToProducts} className={secondaryButtonClass}>
            <History size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Voir les produits</span>
          </button>
          {mode === 'list' && activeTab === 'extra' && (
            <button onClick={handleOpenCreateExtra} className={primaryButtonClass}>
              <Plus size={14} />
              <span>Ajouter un supplément</span>
            </button>
          )}
          {mode === 'list' && activeTab !== 'extra' && (
            <button onClick={handleOpenCreate} className={primaryButtonClass}>
              <Plus size={14} />
              <span>Ajouter {activeTab === 'category' ? 'une catégorie' : 'une sous-catégorie'}</span>
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
                {mode === 'create' ? `${entityLabel === 'catégorie' ? 'Catégorie créée' : 'Sous-catégorie créée'}` : `${entityLabel === 'catégorie' ? 'Catégorie modifiée' : 'Sous-catégorie modifiée'}`}
              </h2>
              <button onClick={handleClose} className={primaryButtonClass}>
                <History size={14} />
                <span>Retour au catalogue</span>
              </button>
            </div>
          ) : step === 'preview' ? (
            <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-4 max-w-lg">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60">
                <ShieldCheck size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">Vérifiez avant confirmation — rien n'est encore enregistré.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">Nom :</span><span className="font-bold text-gray-900 dark:text-white">{name.trim()}</span></div>
                {activeTab === 'subcategory' && (
                  <div className="flex justify-between"><span className="text-gray-500">Catégorie parente :</span><span className="font-bold text-gray-900 dark:text-white">{categories.find((c) => c.id === categoryId)?.name}</span></div>
                )}
              </div>
              {saveError && <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-xs text-red-600 dark:text-red-400 flex items-center gap-2"><AlertCircle size={14} /> {saveError}</div>}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button onClick={() => setStep('form')} disabled={isSaving} className={secondaryButtonClass}><ArrowLeft size={14} /><span>Modifier</span></button>
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
                  {mode === 'create' ? `Nouvelle ${entityLabel}` : `Modifier « ${activeTab === 'category' ? editingCategory?.name : editingSubCategory?.name} »`}
                </h2>
                <button onClick={handleClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
              </div>

              {activeTab === 'subcategory' && (
                <div>
                  <label className={labelClass}>Catégorie parente *</label>
                  <div className="relative">
                    <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={`${inputBaseClass} appearance-none pr-8 cursor-pointer ${inputValidClass}`}>
                      <option value="">Sélectionner une catégorie</option>
                      {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              )}

              <div>
                <label className={labelClass}>Nom {entityLabel === 'catégorie' ? 'de la catégorie' : 'de la sous-catégorie'} *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={`${inputBaseClass} ${showErrors && issues.length > 0 ? inputErrorClass : inputValidClass}`} />
                {showErrors && issues.map((msg, i) => (<p key={i} className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> {msg}</p>))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                <button onClick={handleClose} className={secondaryButtonClass}><span>Annuler</span></button>
                <button onClick={handleVerify} className={primaryButtonClass}><ShieldCheck size={14} /><span>Vérifier</span></button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg p-0.5 bg-gray-50/50 dark:bg-gray-800/50 w-fit">
              <button onClick={() => setActiveTab('category')} className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer inline-flex items-center gap-1.5 ${activeTab === 'category' ? 'bg-[#00A86B] text-white shadow-xs' : 'text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'}`}>
                <FolderTree size={13} /> Catégories
              </button>
              <button onClick={() => setActiveTab('subcategory')} className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer inline-flex items-center gap-1.5 ${activeTab === 'subcategory' ? 'bg-[#00A86B] text-white shadow-xs' : 'text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'}`}>
                <Tag size={13} /> Sous-catégories
              </button>
              <button onClick={() => setActiveTab('extra')} className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer inline-flex items-center gap-1.5 ${activeTab === 'extra' ? 'bg-[#00A86B] text-white shadow-xs' : 'text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'}`}>
                <Sparkles size={13} /> Suppléments
              </button>
            </div>
          </div>

          <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs">
            <div className="relative max-w-sm">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={`Rechercher ${activeTab === 'extra' ? 'un' : 'une'} ${entityLabel}...`} className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              {activeTab === 'category' ? (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800 text-[11px] font-bold text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-gray-800/30">
                      <th className="py-3.5 px-4">Nom</th>
                      <th className="py-3.5 px-4 text-center">Sous-catégories</th>
                      <th className="py-3.5 px-4 text-center">Produits</th>
                      <th className="py-3.5 px-4">Créée le</th>
                      <th className="py-3.5 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 text-xs">
                    {filteredCategories.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-12 text-gray-400"><BookOpen className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />Aucune catégorie pour cette recherche</td></tr>
                    ) : (
                      filteredCategories.map((cat) => (
                        <tr key={cat.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors">
                          <td className="py-3.5 px-4 font-semibold text-gray-900 dark:text-white">{cat.name}</td>
                          <td className="py-3.5 px-4 text-center text-gray-600 dark:text-gray-300">{subCategories.filter((s) => s.categoryId === cat.id).length}</td>
                          <td className="py-3.5 px-4 text-center text-gray-600 dark:text-gray-300">{getCategoryUsageCount(cat, articles)}</td>
                          <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300">{cat.createdAt}</td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => handleOpenEditCategory(cat)} title="Modifier" className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer"><Pencil size={14} /></button>
                              <button onClick={() => handleRequestDeleteCategory(cat)} title="Supprimer" className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"><Trash2 size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : activeTab === 'subcategory' ? (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800 text-[11px] font-bold text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-gray-800/30">
                      <th className="py-3.5 px-4">Nom</th>
                      <th className="py-3.5 px-4">Catégorie</th>
                      <th className="py-3.5 px-4 text-center">Produits</th>
                      <th className="py-3.5 px-4">Créée le</th>
                      <th className="py-3.5 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 text-xs">
                    {filteredSubCategories.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-12 text-gray-400"><Tag className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />Aucune sous-catégorie pour cette recherche</td></tr>
                    ) : (
                      filteredSubCategories.map((sub) => (
                        <tr key={sub.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors">
                          <td className="py-3.5 px-4 font-semibold text-gray-900 dark:text-white">{sub.name}</td>
                          <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300">{categories.find((c) => c.id === sub.categoryId)?.name ?? '—'}</td>
                          <td className="py-3.5 px-4 text-center text-gray-600 dark:text-gray-300">{getSubCategoryUsageCount(sub, articles)}</td>
                          <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300">{sub.createdAt}</td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => handleOpenEditSubCategory(sub)} title="Modifier" className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer"><Pencil size={14} /></button>
                              <button onClick={() => handleRequestDeleteSubCategory(sub)} title="Supprimer" className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"><Trash2 size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800 text-[11px] font-bold text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-gray-800/30">
                      <th className="py-3.5 px-4">Nom</th>
                      <th className="py-3.5 px-4 text-right">Prix</th>
                      <th className="py-3.5 px-4 text-center">Produits</th>
                      <th className="py-3.5 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 text-xs">
                    {filteredExtras.length === 0 ? (
                      <tr><td colSpan={4} className="text-center py-12 text-gray-400"><Sparkles className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />Aucun supplément pour cette recherche</td></tr>
                    ) : (
                      filteredExtras.map((extra) => {
                        const usedByCount = articles.filter((a) => a.extraIds?.includes(extra.id)).length;
                        return (
                          <tr key={extra.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors">
                            <td className="py-3.5 px-4 font-semibold text-gray-900 dark:text-white">{extra.name}</td>
                            <td className="py-3.5 px-4 text-right text-gray-600 dark:text-gray-300">{extra.price.toFixed(2)} DT</td>
                            <td className="py-3.5 px-4 text-center text-gray-600 dark:text-gray-300">{usedByCount}</td>
                            <td className="py-3.5 px-4">
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => handleOpenEditExtra(extra)} title="Modifier" className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer"><Pencil size={14} /></button>
                                <button onClick={() => handleRequestDeleteExtra(extra)} title="Supprimer" className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"><Trash2 size={14} /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {/* Supplément create/edit modal */}
      {extraFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200" onClick={() => setExtraFormOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                <Sparkles size={16} className="text-emerald-500" />
                {editingExtraId ? 'Modifier le supplément' : 'Nouveau supplément'}
              </h3>
              <button onClick={() => setExtraFormOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3.5">
              <div>
                <label className={labelClass}>Nom *</label>
                <input
                  type="text"
                  value={extraName}
                  onChange={(e) => setExtraName(e.target.value)}
                  placeholder="ex : Chantilly, Shot espresso supplémentaire"
                  className={`${inputBaseClass} ${inputValidClass}`}
                />
              </div>
              <div>
                <label className={labelClass}>Prix (DT) *</label>
                <DecimalInput
                  min={0}
                  step="0.1"
                  value={extraPrice}
                  onChange={(e) => setExtraPrice(e.target.value)}
                  className={`${inputBaseClass} ${inputValidClass}`}
                />
              </div>

              <div className="pt-1 border-t border-gray-100 dark:border-gray-800 space-y-2.5">
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                    <Beaker size={14} className="text-emerald-500" /> Fiche technique
                  </span>
                </div>
                <p className="text-[11px] text-gray-400">
                  Optionnel — ce que cet ajout consomme en stock (ex : Chantilly → 30g crème fraîche), en plus de la fiche
                  technique du produit sur lequel il est sélectionné.
                </p>
                {extraRecipe.map((line) => (
                  <div key={line.id} className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40 p-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={line.ingredientId ?? ''}
                        onChange={(e) => updateExtraRecipeLine(line.id, { ingredientId: e.target.value })}
                        className={`${inputBaseClass} appearance-none cursor-pointer flex-1 ${inputValidClass}`}
                      >
                        <option value="">Choisir un ingrédient</option>
                        {ingredients.map((ing) => (
                          <option key={ing.id} value={ing.id}>
                            {ing.name} ({ing.unit})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => removeExtraRecipeLine(line.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <DecimalInput
                        min={0}
                        step="any"
                        value={line.quantity || ''}
                        onChange={(e) => updateExtraRecipeLine(line.id, { quantity: Number(e.target.value) || 0 })}
                        placeholder="Quantité"
                        className={`${inputBaseClass} ${inputValidClass}`}
                      />
                      <select
                        value={line.unit}
                        onChange={(e) => updateExtraRecipeLine(line.id, { unit: e.target.value })}
                        className={`${inputBaseClass} appearance-none cursor-pointer ${inputValidClass}`}
                      >
                        <option value="">Unité</option>
                        {getUnitOptionsForExtraLine(line).map((u) => (
                          <option key={u.id} value={u.name}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
                <button
                  onClick={addExtraRecipeLine}
                  className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={13} /> Ajouter un ingrédient
                </button>
              </div>

              {extraSaveError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                  <AlertCircle size={14} /> {extraSaveError}
                </div>
              )}
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-2">
              <button onClick={() => setExtraFormOpen(false)} className={secondaryButtonClass}><span>Annuler</span></button>
              <button onClick={handleSaveExtra} disabled={extraIsSaving || extraIssues.length > 0} className={primaryButtonClass}>
                {extraIsSaving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                <span>{extraIsSaving ? 'Enregistrement…' : 'Enregistrer'}</span>
              </button>
            </div>
          </div>
        </div>
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
              {deleteBlockedReason ? (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-red-600 dark:text-red-400">
                  Suppression impossible : {deleteBlockedReason}
                </div>
              ) : (
                <p>Voulez-vous vraiment supprimer <strong className="text-gray-900 dark:text-white">{deleteTarget.name}</strong> ? Cette action est irréversible.</p>
              )}
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className={secondaryButtonClass}><span>{deleteBlockedReason ? 'Fermer' : 'Annuler'}</span></button>
              {!deleteBlockedReason && (
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
