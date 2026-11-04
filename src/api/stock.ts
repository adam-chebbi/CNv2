import { apiGet, apiPost, apiPut, apiDelete } from './client';
import type { StockProduct, StockUnit, StockLot, StockLedgerEntry, StockZone, StockOperationType } from '../data/stockModel';

export const getStockUnits = () => apiGet<StockUnit[]>('/stock/units');
export const createStockUnit = (name: string) => apiPost<StockUnit>('/stock/units', { name });
export const renameStockUnit = (id: string, name: string) => apiPut<StockUnit>(`/stock/units/${id}`, { name });
export const deleteStockUnit = (id: string) => apiDelete<void>(`/stock/units/${id}`);

export const getStockProducts = () => apiGet<StockProduct[]>('/stock/products');
// lotNumber/expiryDate are optional and only meaningful when creating a new lot-tracked ingredient
// with an initial quantity — see IngredientManualAddForm. Never part of StockProduct itself.
export const createStockProduct = (product: Omit<StockProduct, 'id'> & { lotNumber?: string; expiryDate?: string }) =>
  apiPost<StockProduct>('/stock/products', product);
export const updateStockProduct = (id: string, product: Omit<StockProduct, 'id'>) => apiPut<StockProduct>(`/stock/products/${id}`, product);

export const getStockLots = () => apiGet<StockLot[]>('/stock/lots');
export const getStockLedger = () => apiGet<StockLedgerEntry[]>('/stock/ledger');

export interface LedgerEntryInput {
  type: StockOperationType;
  productId: string;
  zone: StockZone;
  relatedZone?: StockZone;
  quantityDelta: number;
  reason: string;
  comment?: string;
  lotNumber?: string;
  expiryDate?: string;
  performedBy: string;
  groupId?: string;
  theoreticalQty?: number;
  realQty?: number;
  discrepancyQty?: number;
  discrepancyValue?: number;
  inventoryChoice?: 'Ajusté' | 'Conservé';
  inventoryScope?: string;
}

export interface PostLedgerResult {
  products: StockProduct[];
  lots: StockLot[];
  ledger: StockLedgerEntry[];
}

export const postStockLedgerEntries = (entries: LedgerEntryInput[]) => apiPost<PostLedgerResult>('/stock/ledger/post', { entries });

export const cancelStockLedgerEntry = (id: string, cancelledBy: string, cancelReason?: string) =>
  apiPost<{ product: StockProduct; ledgerId: string }>(`/stock/ledger/${id}/cancel`, { cancelledBy, cancelReason });

export const postImportedStock = (entries: LedgerEntryInput[], productUpdates?: { id: string; minThreshold?: number; targetStock?: number }[]) =>
  apiPost<PostLedgerResult>('/stock/import', { entries, productUpdates });
