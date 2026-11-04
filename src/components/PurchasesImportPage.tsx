import React, { useState } from 'react';
import { ShoppingCart, Users, Receipt, ChevronRight, UploadCloud } from 'lucide-react';
import { Supplier, PurchaseOrder, SupplierInvoice } from '../data/purchasesModel';
import { StockProduct } from '../data/stockModel';
import { PurchaseOrdersImportPage } from './PurchaseOrdersImportPage';
import { SuppliersImportPage } from './SuppliersImportPage';
import { InvoicesImportPage } from './InvoicesImportPage';

type ImportType = 'orders' | 'suppliers' | 'invoices';

interface PurchasesImportPageProps {
  suppliers: Supplier[];
  products: StockProduct[];
  orders: PurchaseOrder[];
  employees: string[];
  onNavigateToDashboard: () => void;
  onNavigateToPurchases: () => void;
  onNavigateToSuppliers: () => void;
  onNavigateToInvoices: () => void;
  onSaveOrders: (orders: PurchaseOrder[]) => void;
  onSaveSuppliers: (suppliers: Supplier[]) => void;
  onSaveInvoices: (invoices: SupplierInvoice[]) => void;
  isDarkMode?: boolean;
}

const CARDS: { id: ImportType; icon: React.ComponentType<{ size?: number; className?: string }>; title: string; description: string; accent: string }[] = [
  {
    id: 'orders',
    icon: ShoppingCart,
    title: 'Achats et acquisitions',
    description: "Importez plusieurs commandes d'achat : fournisseur, produits, quantités et prix unitaires.",
    accent: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/40',
  },
  {
    id: 'suppliers',
    icon: Users,
    title: 'Listes des fournisseurs',
    description: 'Importez plusieurs fournisseurs : coordonnées, matricule fiscal, contact principal.',
    accent: 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/40',
  },
  {
    id: 'invoices',
    icon: Receipt,
    title: 'Factures',
    description: 'Importez plusieurs factures fournisseur : montants HT/TVA/TTC, échéance et mode de paiement.',
    accent: 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/40',
  },
];

export const PurchasesImportPage: React.FC<PurchasesImportPageProps> = ({
  suppliers,
  products,
  orders,
  employees,
  onNavigateToDashboard,
  onNavigateToPurchases,
  onNavigateToSuppliers,
  onNavigateToInvoices,
  onSaveOrders,
  onSaveSuppliers,
  onSaveInvoices,
}) => {
  const [type, setType] = useState<ImportType | null>(null);

  if (type === 'orders') {
    return (
      <PurchaseOrdersImportPage
        suppliers={suppliers}
        products={products}
        employees={employees}
        onNavigateToDashboard={onNavigateToDashboard}
        onNavigateToPurchases={onNavigateToPurchases}
        onSaveOrders={onSaveOrders}
        onBack={() => setType(null)}
      />
    );
  }
  if (type === 'suppliers') {
    return (
      <SuppliersImportPage
        suppliers={suppliers}
        onNavigateToDashboard={onNavigateToDashboard}
        onNavigateToSuppliers={onNavigateToSuppliers}
        onSaveSuppliers={onSaveSuppliers}
        onBack={() => setType(null)}
      />
    );
  }
  if (type === 'invoices') {
    return (
      <InvoicesImportPage
        suppliers={suppliers}
        orders={orders}
        onNavigateToDashboard={onNavigateToDashboard}
        onNavigateToInvoices={onNavigateToInvoices}
        onSaveInvoices={onSaveInvoices}
        onBack={() => setType(null)}
      />
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>Import Excel/CSV</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Achats
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
