import type { NextFunction, Request, Response } from 'express';
import { db } from '../db/connection.js';
import { ApiError } from './errors.js';

export interface AuthedUser {
  id: string;
  fullName: string;
  cin: string;
  roleId: string;
  roleName: string;
  // Super Admin (the one is_system role) always passes every requirePermission check regardless
  // of what's actually stored in role_permissions — see requirePermission below. That's what lets
  // the permission catalog grow over time without ever re-syncing Super Admin's stored grants.
  isSuperAdmin: boolean;
  permissions: string[];
  // True right after a temporary password (Super-Admin-generated, or backfilled for an account
  // that predates passwords) was used to log in — requireAuth blocks every route until it's
  // cleared via POST /auth/change-password. requireAuthAllowPendingPasswordChange is the one
  // exception, used only by the handful of routes that must stay reachable while this is true.
  mustChangePassword: boolean;
  // Set only for accounts created from an employee's "Compte de connexion" section (see
  // EmployeesPage.tsx / POST /hr/employees) — null for accounts with no HR record behind them
  // (the original Super Admin, or any admin/IT-only account). Used to auto-resolve "who did this"
  // on sales/stock/purchases when the account lacks hr:select_employee — see
  // resolveEffectiveEmployeeName in server/lib/employeeSelection.ts.
  employeeId: string | null;
  employeeName: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
      sessionToken?: string;
    }
  }
}

interface SessionRow {
  user_id: string;
}

interface UserWithRoleRow {
  id: string;
  full_name: string;
  cin: string;
  role_id: string | null;
  role_name: string | null;
  is_system: number | null;
  must_change_password: number;
  employee_id: string | null;
  employee_name: string | null;
}

interface PermissionRow {
  permission_key: string;
}

export const SESSION_COOKIE = 'session';

// Shared by requireAuth and requireAuthAllowPendingPasswordChange — resolves the session cookie to
// a full AuthedUser (or throws 401), without deciding whether must_change_password should block
// the request. Also exported for the login/session routes that need the same row shape.
export const resolveAuthedUser = (req: Request): { user: AuthedUser; token: string } => {
  const token = req.cookies?.[SESSION_COOKIE] ?? '';
  if (!token) throw new ApiError(401, 'Authentification requise.');

  const session = db.prepare('SELECT user_id FROM sessions WHERE token = ? AND revoked_at IS NULL').get(token) as SessionRow | undefined;
  if (!session) throw new ApiError(401, 'Session invalide ou expirée.');

  const row = db
    .prepare(
      `SELECT u.id, u.full_name, u.cin, u.role_id, r.name AS role_name, r.is_system, u.must_change_password,
              u.employee_id, (e.first_name || ' ' || e.last_name) AS employee_name
       FROM users u LEFT JOIN roles r ON r.id = u.role_id LEFT JOIN employees e ON e.id = u.employee_id
       WHERE u.id = ?`
    )
    .get(session.user_id) as UserWithRoleRow | undefined;
  if (!row) throw new ApiError(401, 'Session invalide ou expirée.');

  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token = ?').run(new Date().toISOString(), token);

  const isSuperAdmin = row.is_system === 1;
  const permissions = row.role_id
    ? (db.prepare('SELECT permission_key FROM role_permissions WHERE role_id = ?').all(row.role_id) as PermissionRow[]).map((r) => r.permission_key)
    : [];

  return {
    token,
    user: {
      id: row.id,
      fullName: row.full_name,
      cin: row.cin,
      roleId: row.role_id ?? '',
      roleName: row.role_name ?? '',
      isSuperAdmin,
      permissions,
      mustChangePassword: row.must_change_password === 1,
      employeeId: row.employee_id,
      employeeName: row.employee_name,
    },
  };
};

export const requireAuth = (req: Request, _res: Response, next: NextFunction): void => {
  const { user, token } = resolveAuthedUser(req);
  if (user.mustChangePassword) {
    throw new ApiError(403, 'Vous devez changer votre mot de passe avant de continuer.', 'PASSWORD_CHANGE_REQUIRED');
  }
  req.user = user;
  req.sessionToken = token;
  next();
};

// Used only by GET /auth/me, POST /auth/change-password and POST /auth/logout — the three routes
// that must stay reachable even while must_change_password is true, since otherwise a user forced
// to change their password would have no way to actually do so (or to sign out and try again).
export const requireAuthAllowPendingPasswordChange = (req: Request, _res: Response, next: NextFunction): void => {
  const { user, token } = resolveAuthedUser(req);
  req.user = user;
  req.sessionToken = token;
  next();
};

// Gates a route to users whose role carries `key` (or who are Super Admin, which always bypasses
// this check — see AuthedUser.isSuperAdmin). Enforced here, server-side, on every matching
// request: the frontend hiding a button or menu item is a UX nicety, not the actual gate — this
// middleware is. Must run after requireAuth (needs req.user populated).
export const requirePermission = (key: string) => (req: Request, _res: Response, next: NextFunction): void => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Authentification requise.');
  if (user.isSuperAdmin || user.permissions.includes(key)) {
    next();
    return;
  }
  throw new ApiError(403, "Vous n'avez pas la permission d'effectuer cette action.");
};

// Same as requirePermission, but passes if the user holds ANY of the given keys. Used on read-only
// reference/lookup endpoints (product catalog, stock units, employee & shift names...) that more
// than one module's own :view permission legitimately needs — e.g. "Compte Saisie" only has
// sales:create, but the manual sales entry form still has to read the product catalog and the
// employee/shift lists to populate its pickers. Without this, a role scoped to exactly one
// operational permission would see every dependent dropdown empty. Mutations stay behind the
// single, narrow requirePermission(key) for their own module — only reads are relaxed this way.
export const requireAnyPermission = (...keys: string[]) => (req: Request, _res: Response, next: NextFunction): void => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Authentification requise.');
  if (user.isSuperAdmin || keys.some((key) => user.permissions.includes(key))) {
    next();
    return;
  }
  throw new ApiError(403, "Vous n'avez pas la permission d'effectuer cette action.");
};
