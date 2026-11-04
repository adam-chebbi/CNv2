import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiGet, apiPost, ApiError } from '../api/client';

export interface AuthUser {
  id: string;
  fullName: string;
  cin: string;
  roleId: string;
  roleName: string;
  isSuperAdmin: boolean;
  permissions: string[];
  // True right after logging in with a temporary password (Super-Admin-generated, or backfilled
  // for an account that predates passwords) — AuthGate renders the forced change-password screen
  // instead of the app while this is true; the server also refuses every other route in the
  // meantime (see server/middleware/auth.ts's requireAuth), so this is a UX mirror, not the gate.
  mustChangePassword: boolean;
  // Set only for accounts created from an employee's "Compte de connexion" section — null for
  // accounts with no HR record behind them (the original Super Admin, or any admin/IT-only
  // account). Drives EmployeePicker's auto-selection when hr:select_employee is missing.
  employeeId: string | null;
  employeeName: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isReady: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  // Super Admin always passes, regardless of what's actually in permissions — mirrors the same
  // bypass enforced server-side in server/middleware/auth.ts's requirePermission. This is only a
  // UX nicety (hiding/showing buttons and menu items); the real gate is always the server's.
  hasPermission: (key: string) => boolean;
  // Whether this account can manually pick any employee on a sale/purchase/movement, vs. being
  // auto-locked to its own linked employee — see EmployeePicker (src/components/ui/EmployeePicker.tsx).
  canSelectEmployee: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // The session lives in an httpOnly cookie that JS can't read, so the only way to know
    // whether one exists is to ask the server — it 401s cleanly if there isn't one. Reachable even
    // mid-forced-password-change (server/routes/auth.ts uses requireAuthAllowPendingPasswordChange
    // for this route) so AuthGate can find out mustChangePassword in the first place.
    apiGet<{ user: AuthUser }>('/auth/me')
      .then((res) => setUser(res.user))
      .catch(() => undefined)
      .finally(() => setIsReady(true));
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await apiPost<{ user: AuthUser }>('/auth/login', { identifier, password });
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    apiPost('/auth/logout').catch(() => undefined);
    setUser(null);
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await apiPost('/auth/change-password', { currentPassword, newPassword });
    setUser((prev) => (prev ? { ...prev, mustChangePassword: false } : prev));
  }, []);

  const hasPermission = useCallback(
    (key: string) => Boolean(user) && (user!.isSuperAdmin || user!.permissions.includes(key)),
    [user]
  );

  const canSelectEmployee = hasPermission('hr:select_employee');

  return (
    <AuthContext.Provider value={{ user, isReady, login, logout, changePassword, hasPermission, canSelectEmployee }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

export { ApiError };
