import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, PERM_SUPERVISE, currentBusinessDate, userCan, type HistoriqueSettings, type SessionUser } from '../../shared/model';
import { api, ApiError, NetworkError, onAuthError } from '../api/client';
import { flushOutbox } from '../api/outbox';

type AuthState =
  | { kind: 'loading' }
  | { kind: 'anonymous'; message?: string }
  | { kind: 'no_access'; message: string }
  | { kind: 'offline' }
  | { kind: 'ready'; user: SessionUser };

interface AuthContextValue {
  state: AuthState;
  user: SessionUser | null;
  settings: HistoriqueSettings;
  businessDate: string;
  dateDebut: string;
  canSupervise: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  reload: () => Promise<void>;
  setSettings: (s: HistoriqueSettings) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Display details of the last session on this device (name, permissions, settings — never a
// secret: the session itself stays in the httpOnly cookie). Lets the app start offline so a Gérant
// can keep entering dépenses while the Wi-Fi is down; the server re-checks everything on replay.
const SESSION_CACHE = 'historique:session';
const readCachedSession = (): { user: SessionUser; settings: HistoriqueSettings; dateDebut?: string } | null => {
  try {
    return JSON.parse(localStorage.getItem(SESSION_CACHE) || 'null');
  } catch {
    return null;
  }
};

interface MeResponse {
  user: SessionUser;
  businessDate: string;
  dateDebut: string;
  settings: HistoriqueSettings;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({ kind: 'loading' });
  const [settings, setSettings] = useState<HistoriqueSettings>(DEFAULT_SETTINGS);
  const [businessDate, setBusinessDate] = useState('');
  const [dateDebut, setDateDebut] = useState('');

  const reload = useCallback(async () => {
    try {
      const me = await api.get<MeResponse>('/auth/me');
      setSettings(me.settings);
      setBusinessDate(me.businessDate);
      setDateDebut(me.dateDebut);
      setState({ kind: 'ready', user: me.user });
      try {
        localStorage.setItem(SESSION_CACHE, JSON.stringify({ user: me.user, settings: me.settings, dateDebut: me.dateDebut }));
      } catch {
        // ignore
      }
      void flushOutbox();
    } catch (e) {
      const cached = e instanceof NetworkError ? readCachedSession() : null;
      if (!(e instanceof NetworkError)) localStorage.removeItem(SESSION_CACHE);
      if (cached && !cached.user.mustChangePassword) {
        setSettings(cached.settings);
        setBusinessDate(currentBusinessDate(new Date(), cached.settings.heureBascule));
        setDateDebut(cached.dateDebut ?? '');
        setState({ kind: 'ready', user: cached.user });
      } else if (e instanceof NetworkError) setState({ kind: 'offline' });
      else if (e instanceof ApiError && e.code === 'NO_ACCESS') setState({ kind: 'no_access', message: e.message });
      else setState({ kind: 'anonymous' });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Session expired or revoked (account deactivated, password changed on another device…)
  // while the app is open → back to the login screen.
  useEffect(
    () =>
      onAuthError((err) => {
        if (err.status === 401) {
          localStorage.removeItem(SESSION_CACHE);
          setState({ kind: 'anonymous', message: 'Votre session a expiré. Reconnectez-vous.' });
        }
        else if (err.code === 'NO_ACCESS') setState({ kind: 'no_access', message: err.message });
        else if (err.code === 'PASSWORD_CHANGE_REQUIRED') void reload();
      }),
    [reload]
  );

  // The business date rolls over at the cutoff hour — refresh it when the app comes back to the
  // foreground (a PWA can stay open on the counter all night).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && state.kind === 'ready') {
        api
          .get<MeResponse>('/auth/me')
          .then((me) => {
            setBusinessDate(me.businessDate);
            setSettings(me.settings);
          })
          .catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [state.kind]);

  const login = useCallback(
    async (email: string, password: string) => {
      await api.post('/auth/login', { email, password });
      await reload();
    },
    [reload]
  );

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    localStorage.removeItem(SESSION_CACHE);
    setState({ kind: 'anonymous' });
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      await reload();
    },
    [reload]
  );

  const user = state.kind === 'ready' ? state.user : null;

  return (
    <AuthContext.Provider
      value={{
        state,
        user,
        settings,
        businessDate,
        dateDebut,
        canSupervise: userCan(user, PERM_SUPERVISE),
        login,
        logout,
        changePassword,
        reload,
        setSettings,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
