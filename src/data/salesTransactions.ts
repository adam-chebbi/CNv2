export interface SaleItem {
  name: string;
  qty: number;
  price: number; // TTC, per unit — this is the amount actually charged/collected
  // Widened from a fixed union to a plain string so it can reference the dynamic product
  // category catalog managed in "Produits, recettes & marges" (see productsModel.ts) — the
  // original 6 seeded category names are unchanged, new ones can now be added without a type edit.
  category: string;
  // Tax snapshot, frozen at the moment of sale (see manualSalesCatalog.getArticleVatRate) — a
  // later change to the article's rate must never rewrite a receipt that already happened.
  // netAmount/taxAmount are the LINE totals (qty already applied), stored explicitly rather than
  // only derivable, so historical accuracy never depends on any future formula staying the same.
  // Absent on sales recorded before these fields existed; treat as DEFAULT_VAT_RATE / derive from
  // price and qty in that case (see reportsModel.computeVatBreakdown).
  vatRate?: number;
  netAmount?: number;
  taxAmount?: number;
  // Which CatalogExtra.id's were selected on this line (applies to all `qty` units of it) — used
  // at sale time to also deduct each extra's own ingredient recipe, on top of the base product's.
  // Absent on sales recorded before this field existed, and on lines with no extras selected.
  extraIds?: string[];
}

export type ServiceType = 'Sur place' | 'À emporter';
export type PaymentMethod = 'Espèces' | 'Carte bancaire' | 'Ticket resto';

export interface SaleTransaction {
  id: number;
  saleNumber: string;
  serviceType: ServiceType;
  tableOrArea: string;
  items: SaleItem[];
  itemsCount: number;
  itemsSummary: string;
  paymentMethod: PaymentMethod;
  barista: string;
  // The amount actually paid/collected — for Espèces this is rounded up to the nearest payable
  // Tunisian cash denomination (see currencyRounding.roundToPayableCash); for Carte bancaire and
  // Ticket resto it's the exact sum (no coin-rounding problem to solve). Sales stats, dashboards
  // and cash-register totals all read this field, so they automatically reflect real cash flow.
  totalAmount: number;
  // The precise pre-rounding sum of the items — kept for accounting/audit purposes even when
  // totalAmount was rounded up for cash. Equal to totalAmount whenever no rounding applied.
  preciseAmount?: number;
  date: string;
  time: string;
  month: string; // 'Jan' | 'Fév' | 'Mar' | 'Avr' | 'Mai' | 'Juin' | 'Juil' | 'Août' | 'Sep' | 'Oct' | 'Nov' | 'Déc'
  year: number;
  status: 'Payé' | 'Remboursé';
  // Free-text justification, currently only ever set from "Par quantités vendues" when the
  // whole-entry payment breakdown doesn't exactly match the computed sales total (see
  // quantitySalesEntryModel.validateQuantitySalesForm) — persisted so the reason for a mismatch
  // survives past the entry session and shows up wherever this sale is later reviewed or exported.
  note?: string;
}

// Small, ready-to-click starting points for a payment-mismatch justification note (see
// quantitySalesEntryModel.ts and salesEntryModel.ts's "Vérification des encaissements") — the
// user can still edit or replace the text after picking one. Kept here (rather than in either
// entry-mode model) since both "Par tickets" and "Par quantités vendues" need it and quantities
// already imports from salesEntryModel, which would make the reverse import circular.
export const PAYMENT_NOTE_SUGGESTIONS: string[] = [
  'Pourboire laissé en caisse',
  'Erreur de comptage à vérifier',
  'Rendu de monnaie non enregistré',
  'Remise verbale non saisie ligne par ligne',
  'Écart de caisse à régulariser',
];

export const MONTHS_LIST = [
  { id: 'Jan', label: 'Jan', fullName: 'Janvier', monthIndex: 0 },
  { id: 'Fév', label: 'Fév', fullName: 'Février', monthIndex: 1 },
  { id: 'Mar', label: 'Mar', fullName: 'Mars', monthIndex: 2 },
  { id: 'Avr', label: 'Avr', fullName: 'Avril', monthIndex: 3 },
  { id: 'Mai', label: 'Mai', fullName: 'Mai', monthIndex: 4 },
  { id: 'Juin', label: 'Juin', fullName: 'Juin', monthIndex: 5 },
  { id: 'Juil', label: 'Juil', fullName: 'Juillet', monthIndex: 6 },
  { id: 'Août', label: 'Août', fullName: 'Août', monthIndex: 7 },
  { id: 'Sep', label: 'Sep', fullName: 'Septembre', monthIndex: 8 },
  { id: 'Oct', label: 'Oct', fullName: 'Octobre', monthIndex: 9 },
  { id: 'Nov', label: 'Nov', fullName: 'Novembre', monthIndex: 10 },
  { id: 'Déc', label: 'Déc', fullName: 'Décembre', monthIndex: 11 },
];
