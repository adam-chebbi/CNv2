// Shared manual stock-management model: catalog, zones, lots and the append-only audit ledger.
// Every page (Stock, Mouvements, Inventaires, Pertes & ajustements, Lots & péremptions, Unités,
// Import Excel/CSV) reads and mutates this SAME model so quantities, valuation and history never
// diverge between pages.
//
// V1 rule: exactly two known zones. No CRUD to create/rename/delete zones is ever exposed.

import { normalizeKey } from './textUtils';

export type StockZone = 'Réserve principale' | 'Dépôt';
export const STOCK_ZONES: StockZone[] = ['Réserve principale', 'Dépôt'];

export type StockCategory =
  | 'Café & Boissons'
  | 'Produits laitiers'
  | 'Pâtisserie & Boulangerie'
  | 'Emballages & Consommables'
  | 'Sirops & Additifs'
  | 'Épicerie';

export const STOCK_CATEGORIES: StockCategory[] = [
  'Café & Boissons',
  'Produits laitiers',
  'Pâtisserie & Boulangerie',
  'Emballages & Consommables',
  'Sirops & Additifs',
  'Épicerie',
];

export type StockStatus = 'Normal' | 'Sous seuil' | 'Stock négatif' | 'Expiré' | 'Expiration proche';
export const STOCK_STATUSES: StockStatus[] = ['Normal', 'Sous seuil', 'Stock négatif', 'Expiré', 'Expiration proche'];

export interface StockProduct {
  id: string;
  name: string;
  sku: string;
  category: StockCategory;
  unit: string;
  minThreshold: number;
  targetStock: number;
  lotTracked: boolean;
  averageCost: number; // Coût Moyen Pondéré (CMP), DT / unité — used for every valuation
  reserveQty: number;
  depotQty: number;
}

export interface StockLot {
  id: string;
  productId: string;
  lotNumber: string;
  zone: StockZone;
  quantity: number;
  expiryDate: string; // ISO date
  receivedAt: string; // ISO date
}

// The unit catalog referenced by StockProduct.unit (matched by name, case/space-insensitively).
// Renaming a unit here cascades to every product currently using its old name so the two never
// drift apart — see renameStockUnit below.
export interface StockUnit {
  id: string;
  name: string;
  createdAt: string; // ISO date
}

export type StockOperationType = 'Entrée' | 'Sortie' | 'Transfert' | 'Inventaire' | 'Perte' | 'Ajustement';

export type LossReason =
  | 'Perte'
  | 'Casse'
  | 'Péremption'
  | 'Consommation interne'
  | 'Produit offert'
  | 'Erreur de préparation'
  | "Ajustement d'inventaire"
  | 'Autre';

export const LOSS_REASONS: LossReason[] = [
  'Perte',
  'Casse',
  'Péremption',
  'Consommation interne',
  'Produit offert',
  'Erreur de préparation',
  "Ajustement d'inventaire",
  'Autre',
];

export type InventoryScopeType = 'Complet' | 'Catégorie' | 'Zone';

// Every quantity change in the whole Stock module — of any kind — is recorded here, and only here.
// A transfer is stored as two linked rows (same groupId) so every row keeps the simple, uniform
// "one zone, one signed delta" shape used to update StockProduct quantities.
export interface StockLedgerEntry {
  id: string;
  groupId?: string;
  timestamp: string; // ISO datetime
  type: StockOperationType;
  productId: string;
  zone: StockZone;
  relatedZone?: StockZone; // Transfert only — the other side of the same transfer
  quantityBefore: number;
  quantityDelta: number; // signed
  quantityAfter: number;
  reason: string;
  comment?: string;
  lotId?: string;
  lotNumber?: string;
  expiryDate?: string;
  performedBy: string;
  status: 'Confirmé' | 'Annulé';
  cancelledAt?: string;
  cancelledBy?: string;
  cancelReason?: string;
  valueImpact: number; // quantityDelta * averageCost at the time of posting
  // Inventaire-only fields — always kept, whichever choice the user made, per spec §21
  theoreticalQty?: number;
  realQty?: number;
  discrepancyQty?: number;
  discrepancyValue?: number;
  inventoryChoice?: 'Ajusté' | 'Conservé';
  inventoryScope?: string;
}

let idCounter = 0;
export const generateStockId = (prefix: string): string => {
  idCounter += 1;
  return `${prefix}-${idCounter}-${Date.now().toString(36)}`;
};

// Le numéro de lot est un champ optionnel dans tous les formulaires (l'utilisateur n'a pas
// toujours cette information sous la main) — mais la table stock_lots l'exige en base (traçabilité
// des lots), donc quand il est laissé vide on en génère un automatiquement à partir de la date du
// jour, plutôt que de bloquer la saisie.
export const generateAutoLotNumber = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `AUTO-${y}${m}${d}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
};

// --- Read helpers -----------------------------------------------------------------

export const getZoneQty = (product: StockProduct, zone: StockZone): number =>
  zone === 'Réserve principale' ? product.reserveQty : product.depotQty;

export const getTotalQty = (product: StockProduct): number => product.reserveQty + product.depotQty;

export const getProductQtyForZoneFilter = (product: StockProduct, zoneFilter: StockZone | 'Tous'): number =>
  zoneFilter === 'Tous' ? getTotalQty(product) : getZoneQty(product, zoneFilter);

export const getProductValue = (product: StockProduct, zoneFilter: StockZone | 'Tous' = 'Tous'): number =>
  getProductQtyForZoneFilter(product, zoneFilter) * product.averageCost;

export const daysUntil = (isoDate: string): number => {
  const target = new Date(`${isoDate}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
};

// --- Case/accent/whitespace tolerant resolution against existing canonical entities ----------
// Used by both the Unités page (duplicate detection) and Stock → Import Excel/CSV (row
// validation). A match always returns the real stored entity — never creates a new one.

export const resolveStockUnitByName = (raw: string, units: StockUnit[]): StockUnit | undefined => {
  const key = normalizeKey(raw);
  if (!key) return undefined;
  return units.find((u) => normalizeKey(u.name) === key);
};

export const resolveStockZoneByName = (raw: string): StockZone | undefined => {
  const key = normalizeKey(raw);
  if (!key) return undefined;
  return STOCK_ZONES.find((z) => normalizeKey(z) === key);
};

export const resolveStockCategoryByName = (raw: string): StockCategory | undefined => {
  const key = normalizeKey(raw);
  if (!key) return undefined;
  return STOCK_CATEGORIES.find((c) => normalizeKey(c) === key);
};

export const resolveStockProductByName = (raw: string, products: StockProduct[]): StockProduct | undefined => {
  const key = normalizeKey(raw);
  if (!key) return undefined;
  return products.find((p) => normalizeKey(p.name) === key);
};

export const getUnitUsageCount = (unit: StockUnit, products: StockProduct[]): number =>
  products.filter((p) => normalizeKey(p.unit) === normalizeKey(unit.name)).length;

// Renaming a unit cascades to every product currently referencing its old name (by value, since
// StockProduct.unit stores the unit's name rather than its id) so the catalog and products can
// never fall out of sync after an edit.
export const renameStockUnitAcrossProducts = (
  products: StockProduct[],
  oldName: string,
  newName: string
): StockProduct[] => {
  const key = normalizeKey(oldName);
  return products.map((p) => (normalizeKey(p.unit) === key ? { ...p, unit: newName } : p));
};

export type LotStatus = 'Expiré' | 'Expiration proche' | 'Valide';

export const getLotStatus = (lot: StockLot, alertDays: number): LotStatus => {
  const days = daysUntil(lot.expiryDate);
  if (days < 0) return 'Expiré';
  if (days <= alertDays) return 'Expiration proche';
  return 'Valide';
};

export interface ProductStockFlags {
  belowThreshold: boolean;
  negative: boolean;
  hasExpired: boolean;
  hasExpiringSoon: boolean;
}

export const computeProductFlags = (
  product: StockProduct,
  lots: StockLot[],
  alertDays: number,
  zoneFilter: StockZone | 'Tous' = 'Tous'
): ProductStockFlags => {
  const qty = getProductQtyForZoneFilter(product, zoneFilter);
  const relevantLots = lots.filter((l) => l.productId === product.id && (zoneFilter === 'Tous' || l.zone === zoneFilter));
  return {
    belowThreshold: qty < product.minThreshold,
    negative: qty < 0,
    hasExpired: relevantLots.some((l) => getLotStatus(l, alertDays) === 'Expiré'),
    hasExpiringSoon: relevantLots.some((l) => getLotStatus(l, alertDays) === 'Expiration proche'),
  };
};

// Single, prioritized status shown in the table (a product can match several flags at once).
export const getProductStatus = (flags: ProductStockFlags): StockStatus => {
  if (flags.negative) return 'Stock négatif';
  if (flags.hasExpired) return 'Expiré';
  if (flags.belowThreshold) return 'Sous seuil';
  if (flags.hasExpiringSoon) return 'Expiration proche';
  return 'Normal';
};

export const getStatusBadgeClass = (status: StockStatus): string => {
  switch (status) {
    case 'Normal':
      return 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70';
    case 'Sous seuil':
      return 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/70';
    case 'Stock négatif':
      return 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/70';
    case 'Expiré':
      return 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/70';
    case 'Expiration proche':
      return 'bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800/70';
  }
};

// Runtime-configurable via Paramètres (see src/data/settingsModel.ts) — a live `let` so every
// caller that reads this constant directly picks up a changed setting without re-threading a prop.
export let DEFAULT_EXPIRY_ALERT_DAYS = 7;
export const setDefaultExpiryAlertDays = (days: number): void => { DEFAULT_EXPIRY_ALERT_DAYS = days; };

export const getLotStatusBadgeClass = (status: LotStatus): string => {
  switch (status) {
    case 'Valide':
      return 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70';
    case 'Expiration proche':
      return 'bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800/70';
    case 'Expiré':
      return 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/70';
  }
};

// --- Ledger application (the ONLY place StockProduct quantities are ever changed) --------

export const applyLedgerEntry = (products: StockProduct[], entry: StockLedgerEntry): StockProduct[] => {
  if (entry.status === 'Annulé') return products;
  return products.map((p) => {
    if (p.id !== entry.productId) return p;
    return entry.zone === 'Réserve principale'
      ? { ...p, reserveQty: p.reserveQty + entry.quantityDelta }
      : { ...p, depotQty: p.depotQty + entry.quantityDelta };
  });
};

export const applyLedgerEntries = (products: StockProduct[], entries: StockLedgerEntry[]): StockProduct[] =>
  entries.reduce((acc, e) => applyLedgerEntry(acc, e), products);

export const reverseLedgerEntry = (products: StockProduct[], entry: StockLedgerEntry): StockProduct[] =>
  products.map((p) => {
    if (p.id !== entry.productId) return p;
    return entry.zone === 'Réserve principale'
      ? { ...p, reserveQty: p.reserveQty - entry.quantityDelta }
      : { ...p, depotQty: p.depotQty - entry.quantityDelta };
  });

// --- Unit conversion (kg↔g, litres↔ml only — other units must match exactly) ------------------

type UnitDimension = 'mass' | 'volume';

const UNIT_CONVERSION_TABLE: Record<string, { dimension: UnitDimension; toBaseFactor: number }> = {
  g: { dimension: 'mass', toBaseFactor: 1 },
  kg: { dimension: 'mass', toBaseFactor: 1000 },
  ml: { dimension: 'volume', toBaseFactor: 1 },
  litres: { dimension: 'volume', toBaseFactor: 1000 },
};

// Converts a quantity from one unit name to another. Returns null when the two units are not
// compatible (different dimensions, e.g. kg → litres) or aren't part of the conversion table at
// all (e.g. "unités", "briques") — those must match exactly, never silently coerced.
export const convertQuantity = (quantity: number, fromUnit: string, toUnit: string): number | null => {
  const fromKey = normalizeKey(fromUnit);
  const toKey = normalizeKey(toUnit);
  if (fromKey === toKey) return quantity;
  const from = UNIT_CONVERSION_TABLE[fromKey];
  const to = UNIT_CONVERSION_TABLE[toKey];
  if (!from || !to || from.dimension !== to.dimension) return null;
  return (quantity * from.toBaseFactor) / to.toBaseFactor;
};

export const areUnitsCompatible = (unitA: string, unitB: string): boolean => convertQuantity(1, unitA, unitB) !== null;
