// Builds the checkbox list shown on "Rapports et analyses" → Export, and the CSV rows behind
// each item. Every dataset reads directly from the app's real live state (the same arrays every
// other module already uses) — there is no separate export-only data source, so an export can
// never disagree with what's shown on screen.

import { SaleTransaction } from './salesTransactions';
import { CatalogArticle } from './manualSalesCatalog';
import { SubRecipe } from './productsModel';
import { StockProduct, StockLedgerEntry, StockLot, getTotalQty } from './stockModel';
import { Expense, ExpenseCategory } from './expensesModel';
import { Supplier, PurchaseOrder, SupplierInvoice, computeOrderTotal, computeInvoiceStatus } from './purchasesModel';
import { Employee, Shift, DayRecord, FinancialRecord, getEmployeeFullName } from './hrModel';
import { ActivityLogEntry } from './activityLog';
import { MONTHS_LIST } from './salesTransactions';

export interface ExportDataset {
  id: string;
  section: string;
  label: string;
  description: string;
  count: number;
  filename: string;
  rows: string[][]; // header row first, then data rows — ready for buildCsvDocument
}

export interface ExportDataBag {
  transactions: SaleTransaction[];
  articles: CatalogArticle[];
  subRecipes: SubRecipe[];
  stockProducts: StockProduct[];
  stockLedger: StockLedgerEntry[];
  stockLots: StockLot[];
  expenses: Expense[];
  expenseCategories: ExpenseCategory[];
  purchaseOrders: PurchaseOrder[];
  suppliers: Supplier[];
  supplierInvoices: SupplierInvoice[];
  employees: Employee[];
  shifts: Shift[];
  dayRecords: DayRecord[];
  financialRecords: FinancialRecord[];
  activityLog: ActivityLogEntry[];
}

const monthName = (monthIndex: number): string => MONTHS_LIST.find((m) => m.monthIndex === monthIndex)?.fullName ?? String(monthIndex + 1);

export const buildExportDatasets = (bag: ExportDataBag): ExportDataset[] => {
  const productName = (id: string) => bag.stockProducts.find((p) => p.id === id)?.name ?? id;
  const categoryName = (id: string) => bag.expenseCategories.find((c) => c.id === id)?.name ?? id;
  const supplierName = (id: string) => bag.suppliers.find((s) => s.id === id)?.name ?? id;
  const employeeName = (id: string) => { const e = bag.employees.find((x) => x.id === id); return e ? getEmployeeFullName(e) : id; };
  const shiftLabel = (ids: string[]) => ids.map((id) => bag.shifts.find((s) => s.id === id)?.name ?? id).join(' + ');

  const datasets: ExportDataset[] = [
    // --- Ventes et recettes ---
    {
      id: 'sales',
      section: 'Ventes et recettes',
      label: 'Ventes (tickets)',
      description: 'Historique complet des tickets de caisse.',
      count: bag.transactions.length,
      filename: 'ventes.csv',
      rows: [
        ['N° Ticket', 'Date', 'Heure', 'Service', 'Emplacement', 'Articles', 'Mode de paiement', 'Barista', 'Total (DT)', 'Statut', 'Note'],
        ...bag.transactions.map((t) => [t.saleNumber, t.date, t.time, t.serviceType, t.tableOrArea, t.itemsSummary, t.paymentMethod, t.barista, t.totalAmount.toFixed(2), t.status, t.note ?? '']),
      ],
    },
    {
      id: 'products',
      section: 'Ventes et recettes',
      label: 'Produits (catalogue)',
      description: 'Fiches produits vendus : prix, catégorie, disponibilité.',
      count: bag.articles.length,
      filename: 'produits.csv',
      rows: [
        ['Nom', 'Catégorie', 'Sous-catégorie', 'Prix (DT)', 'Disponible', "Date d'entrée"],
        ...bag.articles.map((a) => [a.name, a.category, a.subCategory ?? '', a.price.toFixed(2), a.isAvailable !== false ? 'Oui' : 'Non', a.createdAt ?? '']),
      ],
    },
    {
      id: 'subrecipes',
      section: 'Ventes et recettes',
      label: 'Sous-recettes',
      description: 'Recettes intermédiaires réutilisées dans plusieurs produits.',
      count: bag.subRecipes.length,
      filename: 'sous-recettes.csv',
      rows: [
        ['Nom', 'Rendement', 'Unité', 'Nombre de composants', 'Créée le'],
        ...bag.subRecipes.map((sr) => [sr.name, String(sr.yieldQuantity), sr.yieldUnit, String(sr.ingredients.length), sr.createdAt]),
      ],
    },
    {
      id: 'stock',
      section: 'Ventes et recettes',
      label: 'Stock (inventaire actuel)',
      description: 'Quantités et valorisation actuelles de chaque produit stocké.',
      count: bag.stockProducts.length,
      filename: 'stock.csv',
      rows: [
        ['Nom', 'SKU', 'Catégorie', 'Unité', 'Stock réserve', 'Stock dépôt', 'Stock total', 'Seuil min', 'Coût moyen (DT)'],
        ...bag.stockProducts.map((p) => [p.name, p.sku, p.category, p.unit, String(p.reserveQty), String(p.depotQty), String(getTotalQty(p)), String(p.minThreshold), p.averageCost.toFixed(2)]),
      ],
    },
    {
      id: 'stock_movements',
      section: 'Ventes et recettes',
      label: 'Mouvements de stock',
      description: "Historique complet des entrées, sorties, transferts, pertes et inventaires.",
      count: bag.stockLedger.length,
      filename: 'mouvements-stock.csv',
      rows: [
        ['Date', 'Type', 'Produit', 'Zone', 'Quantité', 'Motif', 'Effectué par', 'Statut'],
        ...bag.stockLedger.map((e) => [e.timestamp.slice(0, 16).replace('T', ' '), e.type, productName(e.productId), e.zone, String(e.quantityDelta), e.reason, e.performedBy, e.status]),
      ],
    },
    {
      id: 'stock_lots',
      section: 'Ventes et recettes',
      label: 'Lots & péremptions',
      description: 'Lots suivis, quantités et dates de péremption.',
      count: bag.stockLots.length,
      filename: 'lots-peremption.csv',
      rows: [
        ['Produit', 'N° de lot', 'Zone', 'Quantité', 'Date de péremption', 'Reçu le'],
        ...bag.stockLots.map((l) => [productName(l.productId), l.lotNumber, l.zone, String(l.quantity), l.expiryDate, l.receivedAt]),
      ],
    },

    // --- Achat et dépenses ---
    {
      id: 'expenses',
      section: 'Achat et dépenses',
      label: 'Dépenses',
      description: 'Toutes les dépenses enregistrées, fixes et variables.',
      count: bag.expenses.length,
      filename: 'depenses.csv',
      rows: [
        ['Date', 'Titre', 'Catégorie', 'Nature', 'Montant (DT)', 'Mode de paiement', 'Statut'],
        ...bag.expenses.map((e) => [e.date, e.title, categoryName(e.categoryId), e.nature, e.amount.toFixed(2), e.paymentMethod, e.status]),
      ],
    },
    {
      id: 'purchases',
      section: 'Achat et dépenses',
      label: 'Achats (commandes fournisseurs)',
      description: 'Commandes passées auprès des fournisseurs.',
      count: bag.purchaseOrders.length,
      filename: 'achats.csv',
      rows: [
        ["N° achat", 'Fournisseur', "Date d'achat", 'Montant (DT)', 'État', 'Passé par'],
        ...bag.purchaseOrders.map((o) => [o.orderNumber, supplierName(o.supplierId), o.orderDate, computeOrderTotal(o).toFixed(2), o.status, o.createdBy]),
      ],
    },
    {
      id: 'suppliers',
      section: 'Achat et dépenses',
      label: 'Fournisseurs',
      description: 'Coordonnées complètes des fournisseurs.',
      count: bag.suppliers.length,
      filename: 'fournisseurs.csv',
      rows: [
        ['Nom', 'Matricule fiscal', 'Téléphone', 'Email', 'Contact principal', 'Adresse'],
        ...bag.suppliers.map((s) => [s.name, s.taxId ?? '', s.phone ?? '', s.email ?? '', s.mainContact ?? '', s.address ?? '']),
      ],
    },
    {
      id: 'invoices',
      section: 'Achat et dépenses',
      label: 'Factures fournisseurs',
      description: 'Factures liées ou non à une commande, avec suivi des paiements.',
      count: bag.supplierInvoices.length,
      filename: 'factures-fournisseurs.csv',
      rows: [
        ['N° facture', 'Fournisseur', 'Date', 'Échéance', 'Montant HT', 'TVA', 'Montant TTC', 'Payé', 'Statut'],
        ...bag.supplierInvoices.map((i) => [i.invoiceNumber, supplierName(i.supplierId), i.invoiceDate, i.dueDate, i.amountHT.toFixed(2), i.vatAmount.toFixed(2), i.amountTTC.toFixed(2), i.amountPaid.toFixed(2), computeInvoiceStatus(i)]),
      ],
    },

    // --- Gestion du personnel ---
    {
      id: 'employees',
      section: 'Gestion du personnel',
      label: 'Employés',
      description: 'Fiches employés : poste, statut, salaire, CIN.',
      count: bag.employees.length,
      filename: 'employes.csv',
      rows: [
        ['Prénom', 'Nom', 'Téléphone', 'Poste', "Date d'entrée", 'Statut', 'Salaire (DT)', 'CIN'],
        ...bag.employees.map((e) => [e.firstName, e.lastName, e.phone, e.poste, e.entryDate, e.status, e.salary.toFixed(2), e.cinNumber]),
      ],
    },
    {
      id: 'planning',
      section: 'Gestion du personnel',
      label: 'Planning & présence',
      description: 'Jours planifiés et présence enregistrée par employé.',
      count: bag.dayRecords.length,
      filename: 'planning-presence.csv',
      rows: [
        ['Employé', 'Date', 'Statut', 'Shift(s)'],
        ...bag.dayRecords.map((r) => [employeeName(r.employeeId), r.date, r.status, shiftLabel(r.shiftIds)]),
      ],
    },
    {
      id: 'financial',
      section: 'Gestion du personnel',
      label: 'Suivi financier',
      description: 'Salaires de base, avances, primes, retenues et paiements par employé.',
      count: bag.financialRecords.length,
      filename: 'suivi-financier.csv',
      rows: [
        ['Employé', 'Période', 'Salaire de base', 'Avances', 'Primes', 'Retenues', 'Montant payé', 'Date de paiement'],
        ...bag.financialRecords.map((r) => [
          employeeName(r.employeeId),
          `${monthName(r.periodMonthIndex)} ${r.periodYear}`,
          r.baseSalary.toFixed(2),
          r.advances.toFixed(2),
          r.bonuses.toFixed(2),
          r.deductions.toFixed(2),
          r.amountPaid.toFixed(2),
          r.paymentDate ?? '',
        ]),
      ],
    },

    // --- Autres ---
    {
      id: 'activity_log',
      section: 'Autres',
      label: "Journal d'activité",
      description: 'Historique de toutes les actions effectuées dans l\'application.',
      count: bag.activityLog.length,
      filename: 'journal-activite.csv',
      rows: [
        ['Date/Heure', 'Utilisateur', 'Module', 'Action', 'Description'],
        ...bag.activityLog.map((e) => [e.timestamp.slice(0, 16).replace('T', ' '), e.user, e.module, e.action, e.description]),
      ],
    },
  ];

  return datasets;
};

export const EXPORT_SECTIONS_ORDER = ['Ventes et recettes', 'Achat et dépenses', 'Gestion du personnel', 'Autres'];
