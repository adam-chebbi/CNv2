import React, { useState } from 'react';
import { ChefHat, BookOpen, ChevronRight, UploadCloud, ArrowLeft, History } from 'lucide-react';
import { CatalogArticle, CatalogExtra } from '../data/manualSalesCatalog';
import { StockProduct, StockUnit } from '../data/stockModel';
import { ProductCategory, ProductSubCategory, SubRecipe } from '../data/productsModel';
import { ProductsCsvImportForm } from './ProductsCsvImportForm';
import { SubRecipesImportForm } from './SubRecipesImportForm';

type ImportType = 'products' | 'subrecipes';

interface ProductsImportPageProps {
  categories: ProductCategory[];
  subCategories: ProductSubCategory[];
  ingredients: StockProduct[];
  units: StockUnit[];
  subRecipes: SubRecipe[];
  extras: CatalogExtra[];
  articles: CatalogArticle[];
  onNavigateToDashboard: () => void;
  onNavigateToProducts: () => void;
  onImportProducts: (articles: CatalogArticle[]) => void;
  onImportSubRecipes: (subRecipes: Omit<SubRecipe, 'id' | 'createdAt'>[]) => void;
  isDarkMode?: boolean;
}

const CARDS: { id: ImportType; icon: React.ComponentType<{ size?: number; className?: string }>; title: string; description: string; accent: string }[] = [
  {
    id: 'products',
    icon: ChefHat,
    title: 'Produits',
    description: 'Importez plusieurs produits en une fois, avec leurs variantes, extras et fiches techniques.',
    accent: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/40',
  },
  {
    id: 'subrecipes',
    icon: BookOpen,
    title: 'Sous-recettes',
    description: 'Importez plusieurs sous-recettes réutilisables (pâtes, sauces...) avec leurs ingrédients.',
    accent: 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/40',
  },
];

export const ProductsImportPage: React.FC<ProductsImportPageProps> = ({
  categories,
  subCategories,
  ingredients,
  units,
  subRecipes,
  extras,
  articles,
  onNavigateToDashboard,
  onNavigateToProducts,
  onImportProducts,
  onImportSubRecipes,
}) => {
  const [type, setType] = useState<ImportType | null>(null);

  if (type) {
    const activeCard = CARDS.find((c) => c.id === type)!;
    return (
      <div className="space-y-5 animate-in fade-in duration-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
              <span>Import Excel/CSV</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                {activeCard.title}
              </span>
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">{activeCard.description}</p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => setType(null)}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer"
            >
              <ArrowLeft size={14} className="text-gray-500 dark:text-gray-400" />
              <span>Changer de type</span>
            </button>
            <button onClick={onNavigateToProducts} className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer">
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

        {type === 'subrecipes' ? (
          <SubRecipesImportForm
            subRecipes={subRecipes}
            ingredients={ingredients}
            units={units}
            onImportSubRecipes={onImportSubRecipes}
            onClose={() => setType(null)}
          />
        ) : (
          <ProductsCsvImportForm
            categories={categories}
            subCategories={subCategories}
            ingredients={ingredients}
            units={units}
            subRecipes={subRecipes}
            extras={extras}
            articles={articles}
            onNavigateToProducts={onNavigateToProducts}
            onImportProducts={onImportProducts}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>Import Excel/CSV</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Produits, recettes & marges
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Que souhaitez-vous importer ?</p>
        </div>
        <button
          onClick={onNavigateToDashboard}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700/80 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition active:scale-98 cursor-pointer"
        >
          <span>Tableau de bord</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.id}
              onClick={() => setType(card.id)}
              className="group text-left p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col gap-3"
            >
              <div className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${card.accent}`}>
                <Icon size={20} />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                  {card.title}
                  <ChevronRight size={14} className="text-gray-300 dark:text-gray-600 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all" />
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{card.description}</p>
              </div>
              <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                <UploadCloud size={12} />
                Importer un fichier
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
