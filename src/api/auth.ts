import { apiGet, apiDelete } from './client';

export interface ActiveSessionInfo {
  id: string;
  device: string;
  location: string;
  ipAddress: string;
  loginTime: string;
  lastSeenAt: string;
  isCurrent: boolean;
}

export interface SessionHistoryEvent {
  activity: 'Connexion' | 'Déconnexion';
  date: string;
  device: string;
  location: string;
}

export interface SessionsOverview {
  active: ActiveSessionInfo[];
  history: SessionHistoryEvent[];
}

export const getSessions = () => apiGet<SessionsOverview>('/auth/sessions');
export const revokeSession = (id: string) => apiDelete<{ revokedCurrentSession: boolean }>(`/auth/sessions/${id}`);
