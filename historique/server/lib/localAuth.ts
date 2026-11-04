import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions, NextFunction, Request, Response } from 'express';
import { PERM_ACCESS, type SessionUser } from '../../shared/model.js';
import type { Db } from '../db/connection.js';
import { ApiError } from './http.js';
import { hashPassword, verifyPassword } from './password.js';

// Authentication owned by this app (independent from the main Café Noir app since 2026-10-17):
// accounts in the `users` table, one `sessions` row per signed-in device, the token only in an
// httpOnly cookie. The cookie has its own name and no Domain attribute, so it is bound to
// historique.cafenoir.tn and never mixes with the main app's ".cafenoir.tn" session cookie.

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
      sessionToken?: string;
    }
  }
}

export const SESSION_COOKIE = 'hist_session';
const SESSION_IDLE_MS = 30 * 24 * 60 * 60 * 1000; // a terminal stays signed in while used at least monthly
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 8;
export const RESET_TTL_MS = 30 * 60 * 1000;
const RESET_MAX_PER_HOUR = 3;

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export type UserRole = 'admin' | 'gerant';
export const ROLE_LABELS: Record<UserRole, string> = { admin: 'Administrateur', gerant: 'Gérant' };

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  password_hash: string;
  must_change_password: number;
  is_active: number;
  failed_login_attempts: number;
  locked_until: string | null;
}

const toSessionUser = (u: UserRow): SessionUser => ({
  id: u.id,
  fullName: u.full_name,
  roleName: ROLE_LABELS[u.role] ?? u.role,
  // Administrators supervise (correct any past day, delete anyone's avance within 24 h).
  isSuperAdmin: u.role === 'admin',
  permissions: [PERM_ACCESS],
  mustChangePassword: u.must_change_password === 1,
});

const cookieOptions = (maxAge?: number): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  ...(maxAge !== undefined ? { maxAge } : {}),
});

const invalidCredentials = () => new ApiError(401, 'Email ou mot de passe incorrect.');

export const createLocalAuth = (db: Db) => {
  const getUserByEmail = (email: string) => db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase()) as UserRow | undefined;
  const getUser = (id: string) => db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;

  const findValidReset = (token: string) => {
    if (!token || token.length > 200) return undefined;
    return db
      .prepare('SELECT id, user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?')
      .get(sha256(token), new Date().toISOString()) as { id: string; user_id: string } | undefined;
  };

  const tokenOf = (req: Request): string => {
    const raw = req.cookies?.[SESSION_COOKIE];
    return typeof raw === 'string' ? raw : '';
  };

  // Counts a wrong password toward the lockout; shared by login and the password re-checks.
  const checkPassword = (user: UserRow, password: string): boolean => {
    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      throw new ApiError(423, 'Compte temporairement verrouillé après plusieurs erreurs. Réessayez dans quelques minutes.');
    }
    if (!verifyPassword(password, user.password_hash)) {
      const attempts = user.failed_login_attempts + 1;
      const lockedUntil = attempts >= LOCKOUT_THRESHOLD ? new Date(Date.now() + LOCKOUT_MS).toISOString() : null;
      db.prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?').run(attempts, lockedUntil, user.id);
      return false;
    }
    db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);
    return true;
  };

  const resolve = (req: Request, allowPendingPassword: boolean): SessionUser => {
    const token = tokenOf(req);
    if (!token) throw new ApiError(401, 'Authentification requise.', 'UNAUTHENTICATED');
    const session = db.prepare('SELECT user_id, last_seen_at FROM sessions WHERE token = ? AND revoked_at IS NULL').get(token) as
      | { user_id: string; last_seen_at: string }
      | undefined;
    if (!session || Date.now() - new Date(session.last_seen_at).getTime() > SESSION_IDLE_MS) {
      throw new ApiError(401, 'Session expirée. Reconnectez-vous.', 'UNAUTHENTICATED');
    }
    const row = getUser(session.user_id);
    if (!row || row.is_active !== 1) throw new ApiError(401, 'Ce compte a été désactivé.', 'UNAUTHENTICATED');
    db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token = ?').run(new Date().toISOString(), token);
    const user = toSessionUser(row);
    if (user.mustChangePassword && !allowPendingPassword) {
      throw new ApiError(403, 'Vous devez changer votre mot de passe avant de continuer.', 'PASSWORD_CHANGE_REQUIRED');
    }
    req.user = user;
    req.sessionToken = token;
    return user;
  };

  const middleware =
    (allowPendingPassword: boolean) =>
    (req: Request, _res: Response, next: NextFunction): void => {
      try {
        resolve(req, allowPendingPassword);
        next();
      } catch (e) {
        next(e);
      }
    };

  return {
    SESSION_COOKIE,
    requireUser: middleware(false),
    requireUserAllowPendingPassword: middleware(true),
    tokenOf,

    login: (req: Request, res: Response, email: string, password: string): SessionUser => {
      const row = getUserByEmail(email);
      if (!row) throw invalidCredentials();
      if (row.is_active !== 1) throw new ApiError(401, 'Ce compte a été désactivé. Contactez un administrateur.');
      if (!checkPassword(row, password)) throw invalidCredentials();
      const token = randomBytes(32).toString('hex');
      const now = new Date().toISOString();
      db.prepare('INSERT INTO sessions (token, user_id, created_at, last_seen_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)').run(
        token,
        row.id,
        now,
        now,
        req.ip ?? null,
        req.get('user-agent') ?? null
      );
      res.cookie(SESSION_COOKIE, token, cookieOptions(SESSION_IDLE_MS));
      req.user = toSessionUser(row);
      req.sessionToken = token;
      return req.user;
    },

    logout: (req: Request, res: Response): void => {
      const token = tokenOf(req);
      if (token) db.prepare('UPDATE sessions SET revoked_at = ? WHERE token = ? AND revoked_at IS NULL').run(new Date().toISOString(), token);
      res.clearCookie(SESSION_COOKIE, cookieOptions());
    },

    // Requires the current password even with an open session, so a borrowed/unlocked phone can't
    // silently take over the account. Signs out every other device.
    changePassword: (req: Request, currentPassword: string, newPassword: string): void => {
      const row = getUser(req.user!.id)!;
      if (!checkPassword(row, currentPassword)) throw new ApiError(400, 'Mot de passe actuel incorrect.', 'WRONG_PASSWORD');
      if (newPassword.length < MIN_PASSWORD_LENGTH) throw new ApiError(400, `Le nouveau mot de passe doit comporter au moins ${MIN_PASSWORD_LENGTH} caractères.`);
      if (verifyPassword(newPassword, row.password_hash)) throw new ApiError(400, "Le nouveau mot de passe doit être différent de l'actuel.");
      const now = new Date().toISOString();
      db.transaction(() => {
        db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, password_updated_at = ? WHERE id = ?').run(hashPassword(newPassword), now, row.id);
        db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND token != ? AND revoked_at IS NULL').run(now, row.id, req.sessionToken ?? '');
      })();
    },

    // "Mot de passe oublié": returns the one-time token to email, or null when nothing must be sent
    // (unknown/inactive account, or too many requests). The caller answers the same way in every
    // case so nobody can tell which emails have an account.
    requestReset: (email: string, ip: string | null): { token: string; fullName: string; email: string } | null => {
      const row = getUserByEmail(email);
      if (!row || row.is_active !== 1) return null;
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const recent = (db.prepare('SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ? AND created_at > ?').get(row.id, since) as { n: number }).n;
      if (recent >= RESET_MAX_PER_HOUR) return null;
      const token = randomBytes(32).toString('base64url');
      const now = Date.now();
      db.prepare('INSERT INTO password_resets (id, user_id, token_hash, created_at, expires_at, ip) VALUES (?, ?, ?, ?, ?, ?)').run(
        randomBytes(16).toString('hex'),
        row.id,
        sha256(token),
        new Date(now).toISOString(),
        new Date(now + RESET_TTL_MS).toISOString(),
        ip
      );
      return { token, fullName: row.full_name, email: row.email };
    },

    // Whether a reset link can still be used (shown before the "new password" form).
    checkResetToken: (token: string): boolean => Boolean(findValidReset(token)),

    // Sets the new password from a valid link: single use, unlocks the account, clears any
    // temporary-password flag, signs out every device and voids the account's other links.
    resetPassword: (token: string, newPassword: string): { fullName: string; email: string } => {
      const reset = findValidReset(token);
      if (!reset) throw new ApiError(400, 'Ce lien n’est plus valide (expiré ou déjà utilisé). Faites une nouvelle demande.', 'RESET_INVALID');
      if (newPassword.length < MIN_PASSWORD_LENGTH) throw new ApiError(400, `Le nouveau mot de passe doit comporter au moins ${MIN_PASSWORD_LENGTH} caractères.`);
      const row = getUser(reset.user_id);
      if (!row || row.is_active !== 1) throw new ApiError(400, 'Ce compte a été désactivé.', 'RESET_INVALID');
      const now = new Date().toISOString();
      db.transaction(() => {
        db.prepare(
          'UPDATE users SET password_hash = ?, must_change_password = 0, failed_login_attempts = 0, locked_until = NULL, password_updated_at = ? WHERE id = ?'
        ).run(hashPassword(newPassword), now, row.id);
        db.prepare('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL').run(now, row.id);
        db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(now, row.id);
      })();
      return { fullName: row.full_name, email: row.email };
    },

    // Re-confirms the signed-in user's password before a sensitive action (deleting an avance).
    // Wrong password → 400 WRONG_PASSWORD (never 401, which the client treats as "signed out").
    verifyPassword: async (req: Request, password: string): Promise<void> => {
      const row = getUser(req.user!.id);
      if (!row) throw new ApiError(401, 'Session invalide.', 'UNAUTHENTICATED');
      if (!checkPassword(row, password)) throw new ApiError(400, 'Mot de passe incorrect.', 'WRONG_PASSWORD');
    },
  };
};

export type LocalAuth = ReturnType<typeof createLocalAuth>;

export interface NewUser {
  email: string;
  fullName: string;
  password: string;
  role: UserRole;
  mustChangePassword: boolean;
}

export const createUser = (db: Db, u: NewUser): string => {
  const id = randomBytes(16).toString('hex');
  db.prepare(
    `INSERT INTO users (id, email, full_name, role, password_hash, must_change_password, is_active, password_updated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(id, u.email.trim().toLowerCase(), u.fullName.trim(), u.role, hashPassword(u.password), u.mustChangePassword ? 1 : 0, new Date().toISOString(), new Date().toISOString());
  return id;
};
