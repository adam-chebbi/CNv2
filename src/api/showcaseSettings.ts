import { apiDelete, apiGet, apiPut } from './client';
import type { ShowcaseSiteInfo } from '../data/showcaseSettingsModel';

export interface ShowcaseSettingsResponse {
  info: ShowcaseSiteInfo;
  updatedAt: string | null; // null = never saved: the site shows the built-in defaults
  updatedBy: string | null;
}

export const getShowcaseSettings = () => apiGet<ShowcaseSettingsResponse>('/showcase-settings');
export const saveShowcaseSettings = (info: ShowcaseSiteInfo) => apiPut<ShowcaseSettingsResponse>('/showcase-settings', info);
export const resetShowcaseSettings = () => apiDelete<ShowcaseSettingsResponse>('/showcase-settings');
