import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from './client';
import type { Expense, ExpenseCategory, ExpenseStatus } from '../data/expensesModel';

export const getExpenseCategories = () => apiGet<ExpenseCategory[]>('/expense-categories');
export const createExpenseCategory = (name: string) => apiPost<ExpenseCategory>('/expense-categories', { name });
export const renameExpenseCategory = (id: string, name: string) => apiPut<ExpenseCategory>(`/expense-categories/${id}`, { name });
export const deleteExpenseCategory = (id: string) => apiDelete<void>(`/expense-categories/${id}`);

export const getExpenses = () => apiGet<Expense[]>('/expenses');
export const createExpense = (expense: Omit<Expense, 'id' | 'status' | 'createdAt'>) => apiPost<Expense>('/expenses', expense);
export const updateExpense = (id: string, expense: Omit<Expense, 'id' | 'status' | 'createdAt'>) => apiPut<Expense>(`/expenses/${id}`, expense);
export const updateExpenseStatus = (id: string, status: ExpenseStatus) => apiPatch<Expense>(`/expenses/${id}/status`, { status });
export const deleteExpense = (id: string) => apiDelete<void>(`/expenses/${id}`);
