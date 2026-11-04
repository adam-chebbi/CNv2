import React, { useState } from 'react';
import { ClipboardList, ArrowLeftRight, PackagePlus, ChevronRight, UploadCloud, ArrowLeft, History } from 'lucide-react';
import { StockProduct, StockUnit, StockLot, StockLedgerEntry } from '../data/stockModel';
import { StockMovementsImportForm } from './StockMovementsImportForm';
import { IngredientsImportForm } from './IngredientsImportForm';
import { InventoryImportForm } from './InventoryImportForm';

type ImportType = 'inventory' | 'movements' | 'ingredients';

interface StockImportPageProps {
  products: StockProduct[];
  units: StockUnit[];
  employees: string[];
  onNavigateToDashboard: () => void;
  onNavigateToStock: () => void;
  onPostImportedStock: (entries: StockLedgerEntry[], lotUpserts: StockLot[], productUpdates: Array<{ id: string; minThreshold?: number; targetStock?: number }>) => void;
  onImportIngredients: (products: Omit<StockProduct, 'id'>[]) => void;
  onPostEntries: (entries: StockLedgerEntry[]) => void;
  isDarkMode?: boolean;
}

const CARDS: { id: ImportType; icon: React.ComponentType<{ size?: number; className?: string }>; title: string; description: string; accent: string }[] = [
  {
    id: 'inventory',
    icon: ClipboardList,
    title: 'Inventaires',
    description: "Importez un comptage physique : le stock théorique est toujours comparé en direct, jamais lu depuis le fichier.",
    accent: 'bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-900/40',
  },
  {
    id: 'movements',
    icon: ArrowLeftRight,
    title: 'Mouvements de stock',
    description: 'Importez en masse des quantités, seuils et stocks cibles pour des produits déjà existants.',
    accent: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/40',
  },
  {
    id: 'ingredients',
    icon: PackagePlus,
    title: 'Nouveaux ingrédients',
    description: 'Créez en masse de nouveaux ingrédients dans le catalogue de stock.',
    accent: 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/40',
  },
];

export const StockImportPage: React.FC<StockImportPageProps> = ({
  products,
  units,
  employees,
  onNavigateToDashboard,
  onNavigateToStock,
  onPostImportedStock,
  onImportIngredients,
  onPostEntries,
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
            <button
              onClick={onNavigateToStock}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer"
            >
              <History size={14} className="text-gray-500 dark:text-gray-400" />
              <span>Voir le stock</span>
            </button>
            <button
              onClick={onNavigateToDashboard}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700/80 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition active:scale-98 cursor-pointer"
            >
              <span>Tableau de bord</span>
            </button>
          </div>
        </div>

        {type === 'inventory' ? (
          <InventoryImportForm products={products} employees={employees} onPostEntries={onPostEntries} onClose={() => setType(null)} />
        ) : type === 'ingredients' ? (
          <IngredientsImportForm products={products} units={units} onImportIngredients={onImportIngredients} />
        ) : (
          <StockMovementsImportForm
            products={products}
            units={units}
            employees={employees}
            onNavigateToStock={onNavigateToStock}
            onPostImportedStock={onPostImportedStock}
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
              Stock
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
