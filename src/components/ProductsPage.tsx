import React, { useMemo, useState } from 'react';
import {
  Package,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FilterX,
  Layers,
  CheckCircle2,
  TrendingUp,
  Plus,
  BookOpen,
  Upload,
  Eye,
  Pencil,
  Trash2,
  X,
  Power,
  AlertCircle,
  ImageOff,
} from 'lucide-react';
import { useQueryParam } from '../hooks/useQueryParam';
import { CatalogArticle, CatalogExtra } from '../data/manualSalesCatalog';
import { StockProduct } from '../data/stockModel';
import { SaleTransaction } from '../data/salesTransactions';
import { ProductCategory, ProductSubCategory, SubRecipe, computeRecipeCost, compareToTargetMargin, DEFAULT_TARGET_MARGIN_RATE, computeTheoreticalConsumption, getExtrasForArticle, computeArticleMargin } from '../data/productsModel';

interface ProductsPageProps {
  articles: CatalogArticle[];
  extras: CatalogExtra[];
  categories: ProductCategory[];
  subCategories: ProductSubCategory[];
  ingredients: StockProduct[];
  subRecipes: SubRecipe[];
  transactions: SaleTransaction[];
  onNavigateToDashboard: () => void;
  onNavigateToAddProduct: () => void;
  onNavigateToEditProduct: (articleId: string) => void;
  onNavigateToCatalog: () => void;
  onNavigateToImport: () => void;
  onDeleteProduct: (articleId: string) => void;
  onToggleAvailability: (articleId: string, isAvailable: boolean) => void;
  isDarkMode?: boolean;
}

const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer';

export const ProductsPage: React.FC<ProductsPageProps> = ({
  articles,
  extras,
  categories,
  subCategories,
  ingredients,
  subRecipes,
  transactions,
  onNavigateToDashboard,
  onNavigateToAddProduct,
  onNavigateToEditProduct,
  onNavigateToCatalog,
  onNavigateToImport,
  onDeleteProduct,
  onToggleAvailability,
}) => {
  const [searchQuery, setSearchQuery] = useQueryParam('q');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('all');
  const [selectedAvailability, setSelectedAvailability] = useState<'all' | 'available' | 'unavailable'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  // "Consulter" opens ?product=<id> — a shareable deep link straight into that product's detail.
  const [productParam, setProductParam] = useQueryParam('product');
  const viewingArticle = useMemo(() => articles.find((a) => a.id === productParam) ?? null, [articles, productParam]);
  const setViewingArticle = (article: CatalogArticle | null) => setProductParam(article ? article.id : '');
  const [deleteTarget, setDeleteTarget] = useState<CatalogArticle | null>(null);

  const availableSubCategoriesForFilter = useMemo(
    () => (selectedCategory === 'all' ? subCategories : subCategories.filter((s) => s.categoryId === selectedCategory)),
    [subCategories, selectedCategory]
  );

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedSubCategory('all');
    setSelectedAvailability('all');
    setCurrentPage(1);
  };

  const enriched = useMemo(
    () =>
      articles.map((article) => {
        const recipeResult = article.recipe && article.recipe.length > 0 ? computeRecipeCost(article.recipe, ingredients, subRecipes, articles) : null;
        const cost = recipeResult?.cost ?? 0;
        const margin = computeArticleMargin(article, cost);
        return { article, cost, hasRecipe: Boolean(recipeResult), ...margin };
      }),
    [articles, ingredients, subRecipes]
  );

  const filteredRows = useMemo(() => {
    return enriched.filter(({ article }) => {
      const categoryObj = categories.find((c) => c.name === article.category);
      if (selectedCategory !== 'all' && categoryObj?.id !== selectedCategory) return false;
      if (selectedSubCategory !== 'all') {
        const subCatObj = subCategories.find((s) => s.name === article.subCategory);
        if (subCatObj?.id !== selectedSubCategory) return false;
      }
      const isAvailable = article.isAvailable !== false;
      if (selectedAvailability === 'available' && !isAvailable) return false;
      if (selectedAvailability === 'unavailable' && isAvailable) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        if (!article.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [enriched, categories, subCategories, selectedCategory, selectedSubCategory, selectedAvailability, searchQuery]);

  const totalResults = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / rowsPerPage));
  const paginatedRows = useMemo(
    () => filteredRows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage),
    [filteredRows, currentPage, rowsPerPage]
  );

  // KPIs — computed from the full product catalog (not just the current filter), matching how
  // KPI cards behave elsewhere in the app (a stable, top-of-page summary).
  const totalProducts = articles.length;
  const availableProducts = useMemo(() => articles.filter((a) => a.isAvailable !== false).length, [articles]);
  const averageMarginRate = useMemo(() => {
    const withRecipe = enriched.filter((r) => r.hasRecipe && r.article.price > 0);
    if (withRecipe.length === 0) return 0;
    return withRecipe.reduce((sum, r) => sum + r.marginRate, 0) / withRecipe.length;
  }, [enriched]);

  const theoreticalConsumption = useMemo(
    () => computeTheoreticalConsumption(transactions, articles, ingredients, subRecipes, extras),
    [transactions, articles, ingredients, subRecipes, extras]
  );
  const topConsumedIngredients = useMemo(
    () =>
      Array.from(theoreticalConsumption.entries())
        .map(([ingredientId, qty]) => ({ ingredient: ingredients.find((i) => i.id === ingredientId), qty }))
        .filter((r) => r.ingredient)
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5),
    [theoreticalConsumption, ingredients]
  );

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    onDeleteProduct(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>Produits, recettes & marges</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Café & Caisse
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Catalogue des produits vendus, fiches techniques, coûts matière et marges.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button onClick={onNavigateToCatalog} className={secondaryButtonClass}>
            <BookOpen size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Catalogue</span>
          </button>
          <button onClick={onNavigateToImport} className={secondaryButtonClass}>
            <Upload size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Import Excel/CSV</span>
          </button>
          <button onClick={onNavigateToAddProduct} className={primaryButtonClass}>
            <Plus size={14} />
            <span>Ajout produits</span>
          </button>
          <button
            onClick={onNavigateToDashboard}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700/80 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition active:scale-98 cursor-pointer"
          >
            <span>Tableau de bord</span>
          </button>
        </div>
      </div>

      {/* 3 KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Produits</span>
            <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">{totalProducts}</span>
            <p className="text-[11px] text-gray-400">Total du catalogue</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 flex items-center justify-center text-blue-500 shrink-0">
            <Layers size={22} />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Produits disponibles</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">{availableProducts}</span>
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md">
                / {totalProducts}
              </span>
            </div>
            <p className="text-[11px] text-gray-400">Actuellement en vente</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-500 shrink-0">
            <CheckCircle2 size={22} />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Marge moyenne estimée</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                {(averageMarginRate * 100).toFixed(1)}
              </span>
              <span className="text-xs font-bold text-gray-600 dark:text-gray-400">%</span>
            </div>
            <p className="text-[11px] text-gray-400">Sur les produits avec fiche technique</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 flex items-center justify-center text-amber-500 shrink-0">
            <TrendingUp size={22} />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 flex-1">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                placeholder="Nom du produit..."
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="relative">
              <select
                value={selectedCategory}
                onChange={(e) => { setSelectedCategory(e.target.value); setSelectedSubCategory('all'); setCurrentPage(1); }}
                className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="all">Toutes les catégories</option>
                {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={selectedSubCategory}
                onChange={(e) => { setSelectedSubCategory(e.target.value); setCurrentPage(1); }}
                className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="all">Toutes les sous-catégories</option>
                {availableSubCategoriesForFilter.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={selectedAvailability}
                onChange={(e) => { setSelectedAvailability(e.target.value as typeof selectedAvailability); setCurrentPage(1); }}
                className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="all">Toutes les disponibilités</option>
                <option value="available">Disponible</option>
                <option value="unavailable">Indisponible</option>
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
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

      {/* Table */}
      <div className="rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 text-[11px] font-bold text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-gray-800/30">
                <th className="py-3.5 px-4">Photo</th>
                <th className="py-3.5 px-4">Nom</th>
                <th className="py-3.5 px-4">Catégorie</th>
                <th className="py-3.5 px-4">Sous-catégorie</th>
                <th className="py-3.5 px-4 text-right">Prix</th>
                <th className="py-3.5 px-4 text-right">Coût matière</th>
                <th className="py-3.5 px-4 text-right" title="Prix de vente hors taxes moins le coût matière">Marge brute (HT)</th>
                <th className="py-3.5 px-4 text-right">Taux marge</th>
                <th className="py-3.5 px-4 text-center">Disponibilité</th>
                <th className="py-3.5 px-4 text-center">Variantes</th>
                <th className="py-3.5 px-4 text-center">Extras</th>
                <th className="py-3.5 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 text-xs">
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-12 text-gray-400">
                    <div className="max-w-sm mx-auto space-y-2">
                      <Package className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600" />
                      <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">Aucun produit ne correspond à ces filtres</p>
                      <button
                        onClick={handleResetFilters}
                        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer"
                      >
                        Réinitialiser les filtres
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedRows.map(({ article, cost, grossMargin, marginRate }) => {
                  const isAvailable = article.isAvailable !== false;
                  const targetRate = article.targetMarginRate ?? DEFAULT_TARGET_MARGIN_RATE;
                  const comparison = compareToTargetMargin(marginRate, targetRate);
                  return (
                    <tr key={article.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="py-3 px-4">
                        {article.imageUrl ? (
                          <img src={article.imageUrl} alt={article.name} className="w-9 h-9 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-300 dark:text-gray-600">
                            <ImageOff size={14} />
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white max-w-[220px]">{article.name}</td>
                      <td className="py-3 px-4 text-gray-600 dark:text-gray-300">{article.category}</td>
                      <td className="py-3 px-4 text-gray-500 dark:text-gray-400">{article.subCategory ?? '—'}</td>
                      <td className="py-3 px-4 text-right font-semibold text-gray-900 dark:text-white">{article.price.toFixed(2)} DT</td>
                      <td className="py-3 px-4 text-right text-gray-600 dark:text-gray-300">{cost.toFixed(2)} DT</td>
                      <td className="py-3 px-4 text-right font-semibold text-gray-900 dark:text-white">{grossMargin.toFixed(2)} DT</td>
                      <td className="py-3 px-4 text-right">
                        <span
                          className={`font-semibold ${
                            comparison === 'inferieur' ? 'text-red-600 dark:text-red-400' : comparison === 'depasse' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {(marginRate * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => onToggleAvailability(article.id, !isAvailable)}
                          title={isAvailable ? 'Rendre indisponible' : 'Rendre disponible'}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border cursor-pointer transition ${
                            isAvailable
                              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70 hover:bg-emerald-100'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          <Power size={10} />
                          {isAvailable ? 'Disponible' : 'Indisponible'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-center text-gray-600 dark:text-gray-300">{article.variants?.length ?? 0}</td>
                      <td className="py-3 px-4 text-center text-gray-600 dark:text-gray-300">{article.extraIds?.length ?? 0}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setViewingArticle(article)} title="Consulter" className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition cursor-pointer">
                            <Eye size={14} />
                          </button>
                          <button onClick={() => onNavigateToEditProduct(article.id)} title="Modifier" className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => setDeleteTarget(article)} title="Supprimer" className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <span>Afficher</span>
            <select
              value={rowsPerPage}
              onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="py-1 px-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-medium cursor-pointer"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
            <span>sur un total de {totalResults} produits</span>
          </div>
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

      {/* Theoretical consumption (calculation only — never modifies stock) */}
      {topConsumedIngredients.length > 0 && (
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Consommation théorique des ingrédients</h3>
          <p className="text-[11px] text-gray-400 mb-3">
            Estimation calculée à partir des ventes enregistrées et des fiches techniques — n'affecte pas le stock réel.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {topConsumedIngredients.map(({ ingredient, qty }) => (
              <div key={ingredient!.id} className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
                <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 line-clamp-1">{ingredient!.name}</p>
                <p className="text-sm font-black text-gray-900 dark:text-white">
                  {qty.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} <span className="text-[11px] font-medium text-gray-400">{ingredient!.unit}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View product modal */}
      {viewingArticle && (
        <ProductDetailModal
          article={viewingArticle}
          articles={articles}
          ingredients={ingredients}
          subRecipes={subRecipes}
          extras={extras}
          onClose={() => setViewingArticle(null)}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                <AlertCircle size={16} className="text-red-500" /> Supprimer ce produit
              </h3>
              <button onClick={() => setDeleteTarget(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 text-xs text-gray-600 dark:text-gray-300 space-y-2">
              <p>
                Voulez-vous vraiment supprimer <strong className="text-gray-900 dark:text-white">{deleteTarget.name}</strong> ? Cette
                action est irréversible.
              </p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className={secondaryButtonClass}>
                <span>Annuler</span>
              </button>
              <button
                onClick={handleConfirmDelete}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer"
              >
                <Trash2 size={14} />
                <span>Confirmer la suppression</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ProductDetailModal: React.FC<{
  article: CatalogArticle;
  articles: CatalogArticle[];
  ingredients: StockProduct[];
  subRecipes: SubRecipe[];
  extras: CatalogExtra[];
  onClose: () => void;
}> = ({ article, articles, ingredients, subRecipes, extras: catalogExtras, onClose }) => {
  const recipeResult = article.recipe && article.recipe.length > 0 ? computeRecipeCost(article.recipe, ingredients, subRecipes, articles) : null;
  const cost = recipeResult?.cost ?? 0;
  const { grossMargin, marginRate, priceHT } = computeArticleMargin(article, cost);
  const targetRate = article.targetMarginRate ?? DEFAULT_TARGET_MARGIN_RATE;
  const comparison = compareToTargetMargin(marginRate, targetRate);
  const extras = getExtrasForArticle(article, catalogExtras);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto custom-scrollbar rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-200 dark:border-gray-700 shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between sticky top-0 bg-white dark:bg-[#151D2A] z-10">
          <h3 className="font-bold text-sm text-gray-900 dark:text-white">{article.name}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4 text-xs">
          {article.imageUrl && <img src={article.imageUrl} alt={article.name} className="w-full h-40 object-cover rounded-xl border border-gray-100 dark:border-gray-800" />}
          {article.description && <p className="text-gray-600 dark:text-gray-300">{article.description}</p>}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div><span className="text-gray-400 font-semibold block mb-0.5">Catégorie</span><span className="font-bold text-gray-900 dark:text-white">{article.category}</span></div>
            <div><span className="text-gray-400 font-semibold block mb-0.5">Sous-catégorie</span><span className="font-bold text-gray-900 dark:text-white">{article.subCategory ?? '—'}</span></div>
            <div><span className="text-gray-400 font-semibold block mb-0.5">Disponibilité</span><span className="font-bold text-gray-900 dark:text-white">{article.isAvailable !== false ? 'Disponible' : 'Indisponible'}</span></div>
          </div>

          <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div><span className="text-gray-400 font-semibold block mb-0.5">Prix</span><span className="font-bold text-gray-900 dark:text-white">{article.price.toFixed(2)} DT</span><span className="block text-[10px] font-normal text-gray-400">HT : {priceHT.toFixed(2)} DT</span></div>
            <div><span className="text-gray-400 font-semibold block mb-0.5">Coût matière</span><span className="font-bold text-gray-900 dark:text-white">{cost.toFixed(2)} DT</span></div>
            <div><span className="text-gray-400 font-semibold block mb-0.5">Marge brute</span><span className="font-bold text-gray-900 dark:text-white">{grossMargin.toFixed(2)} DT</span></div>
            <div>
              <span className="text-gray-400 font-semibold block mb-0.5">Taux de marge</span>
              <span className={`font-bold ${comparison === 'inferieur' ? 'text-red-600 dark:text-red-400' : comparison === 'depasse' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}`}>
                {(marginRate * 100).toFixed(1)}% <span className="text-[10px] font-normal text-gray-400">(cible {(targetRate * 100).toFixed(0)}%)</span>
              </span>
            </div>
          </div>

          <div>
            <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fiche technique</p>
            {article.recipe && article.recipe.length > 0 ? (
              <div className="space-y-1">
                {article.recipe.map((line) => {
                  if (line.kind === 'ingredient') {
                    const ing = ingredients.find((i) => i.id === line.ingredientId);
                    return (
                      <div key={line.id} className="flex justify-between px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                        <span>{ing?.name ?? 'Ingrédient introuvable'}</span>
                        <span className="font-semibold">{line.quantity} {line.unit}</span>
                      </div>
                    );
                  }
                  const sub = subRecipes.find((sr) => sr.id === line.subRecipeId);
                  return (
                    <div key={line.id} className="flex justify-between px-2.5 py-1.5 rounded-lg bg-blue-50/60 dark:bg-blue-950/20">
                      <span>Sous-recette : {sub?.name ?? 'introuvable'}</span>
                      <span className="font-semibold">{line.quantity} {line.unit}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-400">Aucune fiche technique définie.</p>
            )}
          </div>

          <div>
            <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Variantes</p>
            {article.variants && article.variants.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {article.variants.map((v) => (
                  <span key={v.id} className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-[11px] font-medium">
                    {v.label}{v.priceDelta ? ` (+${v.priceDelta.toFixed(2)} DT)` : ''}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-gray-400">Aucune variante.</p>
            )}
          </div>

          <div>
            <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Extras / suppléments</p>
            {extras.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {extras.map((e) => (
                  <span key={e.id} className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[11px] font-medium">
                    {e.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-gray-400">Aucun extra associé.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
