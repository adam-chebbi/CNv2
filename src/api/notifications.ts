import { apiGet, apiPut, apiDelete } from './client';

export type TreatedAlertsMap = Record<string, { treatedAt: string; treatedBy: string }>;

export const getTreatedAlerts = () => apiGet<TreatedAlertsMap>('/notifications/treated-alerts');
export const markAlertTreated = (alertId: string, treatedBy: string) =>
  apiPut<{ alertId: string; treatedAt: string; treatedBy: string }>(`/notifications/treated-alerts/${alertId}`, { treatedBy });
export const markAlertUnread = (alertId: string) => apiDelete<void>(`/notifications/treated-alerts/${alertId}`);
