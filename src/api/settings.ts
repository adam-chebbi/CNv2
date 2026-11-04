import { apiGet, apiPut } from './client';
import type { AppSettings } from '../data/settingsModel';

export const getSettings = () => apiGet<AppSettings>('/settings');
export const updateSettings = (settings: AppSettings) => apiPut<AppSettings>('/settings', settings);
