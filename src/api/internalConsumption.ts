import { apiGet, apiPost } from './client';
import type { InternalConsumption } from '../data/internalConsumptionModel';

export const getInternalConsumptions = () => apiGet<InternalConsumption[]>('/internal-consumption');

export const createInternalConsumption = (payload: { employee: string; items: { productId: string; name: string; qty: number }[]; comment?: string }) =>
  apiPost<InternalConsumption>('/internal-consumption', payload);
