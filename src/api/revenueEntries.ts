import { apiGet, apiPost, apiPut, apiDelete } from './client';
import type { RevenueEntry, RevenueEntryInput } from '../data/revenueEntriesModel';

export const getRevenueEntries = () => apiGet<RevenueEntry[]>('/revenue-entries');
export const createRevenueEntry = (input: RevenueEntryInput) => apiPost<RevenueEntry>('/revenue-entries', input);
export const updateRevenueEntry = (id: string, input: RevenueEntryInput) => apiPut<RevenueEntry>(`/revenue-entries/${id}`, input);
export const deleteRevenueEntry = (id: string) => apiDelete<void>(`/revenue-entries/${id}`);
