import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from './client';
import type { Supplier, PurchaseOrder, PurchaseOrderStatus, PurchaseReception, SupplierInvoice } from '../data/purchasesModel';
import type { StockProduct } from '../data/stockModel';
import type { ProductAlias } from '../data/productAliases';

export const getSuppliers = () => apiGet<Supplier[]>('/purchases/suppliers');
export const createSupplier = (supplier: Omit<Supplier, 'id' | 'createdAt'>) => apiPost<Supplier>('/purchases/suppliers', supplier);
export const updateSupplier = (id: string, supplier: Omit<Supplier, 'id' | 'createdAt'>) => apiPut<Supplier>(`/purchases/suppliers/${id}`, supplier);
export const deleteSupplier = (id: string) => apiDelete<void>(`/purchases/suppliers/${id}`);

export const getPurchaseOrders = () => apiGet<PurchaseOrder[]>('/purchases/orders');
export const createPurchaseOrder = (order: { supplierId: string; orderDate: string; expectedDate?: string; notes?: string; createdBy: string; lines: { id: string; productId: string; quantity: number; unit: string; unitPrice: number }[] }) =>
  apiPost<PurchaseOrder>('/purchases/orders', order);
export const updatePurchaseOrder = (id: string, order: { supplierId: string; orderDate: string; expectedDate?: string; notes?: string; createdBy: string; lines: { id: string; productId: string; quantity: number; unit: string; unitPrice: number }[] }) =>
  apiPut<PurchaseOrder>(`/purchases/orders/${id}`, order);
export const updatePurchaseOrderStatus = (id: string, status: PurchaseOrderStatus) => apiPatch<PurchaseOrder>(`/purchases/orders/${id}/status`, { status });
export const deletePurchaseOrder = (id: string) => apiDelete<void>(`/purchases/orders/${id}`);

export interface ReceiveOrderResult {
  reception: PurchaseReception;
  order: PurchaseOrder;
  products: StockProduct[];
}

export const receivePurchaseOrder = (orderId: string, reception: { receptionDate: string; zone: 'Réserve principale' | 'Dépôt'; performedBy: string; lines: { lineId: string; quantityReceived: number }[] }) =>
  apiPost<ReceiveOrderResult>(`/purchases/orders/${orderId}/receive`, reception);

export const getPurchaseReceptions = () => apiGet<PurchaseReception[]>('/purchases/receptions');

export const getSupplierInvoices = () => apiGet<SupplierInvoice[]>('/purchases/invoices');
export const createSupplierInvoice = (invoice: Omit<SupplierInvoice, 'id' | 'createdAt'>) => apiPost<SupplierInvoice>('/purchases/invoices', invoice);
export const updateSupplierInvoice = (id: string, invoice: Omit<SupplierInvoice, 'id' | 'createdAt'>) => apiPut<SupplierInvoice>(`/purchases/invoices/${id}`, invoice);
export const recordInvoicePayment = (id: string, amount: number) => apiPost<SupplierInvoice>(`/purchases/invoices/${id}/payment`, { amount });
export const deleteSupplierInvoice = (id: string) => apiDelete<void>(`/purchases/invoices/${id}`);

export const getProductAliases = () => apiGet<ProductAlias[]>('/purchases/product-aliases');
export const createProductAlias = (alias: { rawLabel: string; productId: string }) => apiPost<ProductAlias>('/purchases/product-aliases', alias);
