import { apiGet, apiPut } from './client';

export interface MonthlyTarget {
  month: string; // 'YYYY-MM'
  targetAmount: number;
  updatedAt: string;
  updatedBy: string;
}

export const getMonthlyTargets = () => apiGet<MonthlyTarget[]>('/dashboard/monthly-targets');
export const setMonthlyTarget = (month: string, targetAmount: number) =>
  apiPut<MonthlyTarget>(`/dashboard/monthly-targets/${month}`, { targetAmount });
