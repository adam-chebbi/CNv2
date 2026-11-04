import { apiGet, apiPost } from './client';
import type { SaleTransaction } from '../data/salesTransactions';

export const getSalesTransactions = () => apiGet<SaleTransaction[]>('/sales/transactions');

export const createSalesTransactions = (tickets: Omit<SaleTransaction, 'id'>[]) =>
  apiPost<SaleTransaction[]>('/sales/transactions', { tickets });

export const refundSaleTransaction = (id: number) =>
  apiPost<SaleTransaction>(`/sales/transactions/${id}/refund`, {});
