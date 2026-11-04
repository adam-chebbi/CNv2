import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { UAParser } from 'ua-parser-js';
import { db } from '../db/connection.js';
import { asyncHandler, ApiError, notFound } from '../middleware/errors.js';
import { requireAuth, requireAuthAllowPendingPasswordChange, SESSION_COOKIE } from '../middleware/auth.js';
import { hashPassword, verifyPassword } from '../lib/password.js';

interface UserRow {
  id: string;
  full_name: string;
  cin: string;
  role_id: string | null;
  role_name: string | null;
  is_system: number | null;
  must_change_password: number;
  is_active: number;
  employee_id: string | null;
  employee_name: string | null;
}

interface PermissionRow {
  permission_key: string;
}

// Login's response shape mirrors requireAuth's req.user exactly, so the client's AuthContext can
// use the same AuthUser type for both the initial /auth/me fetch and the result of login().
const buildAuthResponseUser = (row: UserRow) => {
  const permissions = row.role_id
    ? (db.prepare('SELECT permission_key FROM role_permissions WHERE role_id = ?').all(row.role_id) as PermissionRow[]).map((r) => r.permission_key)
    : [];
  return {
    id: row.id,
    fullName: row.full_name,
    cin: row.cin,
    roleId: row.role_id ?? '',
    roleName: row.role_name ?? '',
    isSuperAdmin: row.is_system === 1,
    permissions,
    mustChangePassword: row.must_change_password === 1,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
  };
};

// Login accepts email, phone or CIN in the same field — resolved server-side in that order, never
// telling the client which of the three (if any) matched, so a failed attempt never leaks which
// identifiers exist in the system.
const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Identifiant requis.'),
  password: z.string().min(1, 'Mot de passe requis.'),
});

const CIN_PATTERN = /^\d{8}$/;

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mot de passe actuel requis.'),
  newPassword: z.string().min(8, 'Le nouveau mot de passe doit comporter au moins 8 caractères.'),
});

const isProd = process.env.NODE_ENV === 'production';
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// Set only in production, and only when the app is meant to share its session across
// subdomains (e.g. ".cafenoir.tn", so docs.cafenoir.tn's nginx auth_request gate can read the
// same cookie — see PLAN_SITE_DOCUMENTATION_PRIVE.md). Left unset, the cookie defaults to the
// exact host that set it, which is correct for local dev and for any deploy that isn't doing
// cross-subdomain SSO. The set and clear call sites below MUST use the exact same domain (and
// path) — a browser only clears a cookie whose Domain/Path match exactly what it was set with,
// so a mismatch here would silently leave the "old" cookie alive after logout.
const SESSION_COOKIE_DOMAIN = isProd ? process.env.SESSION_COOKIE_DOMAIN || undefined : undefined;
const sessionCookieOptions = (maxAge?: number) => ({
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  path: '/',
  ...(SESSION_COOKIE_DOMAIN ? { domain: SESSION_COOKIE_DOMAIN } : {}),
  ...(maxAge !== undefined ? { maxAge } : {}),
});

// A simple, account-level lockout — independent of any future IP-based rate-limiting — so a
// password can't be brute-forced by unlimited attempts against one account.
const LOGIN_LOCKOUT_THRESHOLD = 5;
const LOGIN_LOCKOUT_DURATION_MS = 15 * 60 * 1000;

// No external geolocation service is called — the app never sends a user's IP to a third party.
// "Localisation" is therefore an honest, coarse signal (local network vs. public internet) rather
// than a fabricated city/country; wiring in a real GeoIP database (e.g. a local MaxMind file) here
// is the place to do it if that precision is ever wanted.
const isPrivateOrLoopbackIp = (ip: string): boolean => {
  const v = ip.replace(/^::ffff:/, '');
  if (v === '::1' || v === 'localhost' || v.startsWith('127.')) return true;
  if (/^10\./.test(v)) return true;
  if (/^192\.168\./.test(v)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(v)) return true;
  return false;
};

const describeLocation = (ip: string): string => (isPrivateOrLoopbackIp(ip) ? 'Réseau local' : `IP publique (${ip})`);

const describeDevice = (uaString: string): string => {
  const parser = new UAParser(uaString);
  const browser = parser.getBrowser().name;
  const os = parser.getOS().name;
  if (browser && os) return `${browser} sur ${os}`;
  return browser || os || 'Appareil inconnu';
};

export const authRouter = Router();

authRouter.post(
  '/login',
  asyncHandler((req, res) => {
    const { identifier, password } = loginSchema.parse(req.body);
    const normalizedIdentifier = identifier.toLowerCase();

    const row = db
      .prepare(
        `SELECT u.id, u.full_name, u.cin, u.role_id, r.name AS role_name, r.is_system, u.must_change_password,
                u.password_hash, u.failed_login_attempts, u.locked_until, u.is_active,
                u.employee_id, (e.first_name || ' ' || e.last_name) AS employee_name
         FROM users u LEFT JOIN roles r ON r.id = u.role_id LEFT JOIN employees e ON e.id = u.employee_id
         WHERE LOWER(u.email) = ? OR LOWER(u.phone) = ? OR u.cin = ?`
      )
      .get(normalizedIdentifier, normalizedIdentifier, identifier) as
      | (UserRow & { password_hash: string | null; failed_login_attempts: number; locked_until: string | null })
      | undefined;

    // Same generic message whether the identifier doesn't exist or the password is wrong — never
    // reveal which of the two was the actual problem.
    const invalidCredentialsError = new ApiError(401, 'Identifiant ou mot de passe incorrect.');
    if (!row) throw invalidCredentialsError;

    // Checked before the lockout/password checks — a deactivated account should never even learn
    // whether its own password still "works", and must never accumulate failed-attempt lockouts.
    if (row.is_active !== 1) {
      throw new ApiError(401, 'Ce compte a été désactivé. Contactez un administrateur.');
    }

    if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
      throw new ApiError(423, 'Compte temporairement verrouillé après plusieurs échecs. Réessayez dans quelques minutes.');
    }

    if (!verifyPassword(password, row.password_hash)) {
      const attempts = row.failed_login_attempts + 1;
      const lockedUntil = attempts >= LOGIN_LOCKOUT_THRESHOLD ? new Date(Date.now() + LOGIN_LOCKOUT_DURATION_MS).toISOString() : null;
      db.prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?').run(attempts, lockedUntil, row.id);
      throw invalidCredentialsError;
    }

    db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?').run(row.id);

    const token = randomUUID();
    const publicId = randomUUID();
    const createdAt = new Date().toISOString();
    const ip = req.ip ?? '';
    const userAgent = req.get('user-agent') ?? '';

    db.prepare(
      `INSERT INTO sessions (token, public_id, user_id, created_at, ip_address, user_agent, device_label, location, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(token, publicId, row.id, createdAt, ip, userAgent, describeDevice(userAgent), describeLocation(ip), createdAt);

    // The session credential lives only in an httpOnly cookie — never in the JSON body or any
    // JS-readable storage — so it can't be read or exfiltrated by an XSS payload.
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(SESSION_MAX_AGE_MS));
    res.json({ user: buildAuthResponseUser(row) });
  })
);

authRouter.post(
  '/logout',
  requireAuthAllowPendingPasswordChange,
  asyncHandler((req, res) => {
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE token = ?').run(new Date().toISOString(), req.sessionToken);
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    res.status(204).end();
  })
);

authRouter.get(
  '/me',
  requireAuthAllowPendingPasswordChange,
  asyncHandler((req, res) => {
    res.json({ user: req.user });
  })
);

// Session-only check for nginx's `auth_request` directive (docs.cafenoir.tn — see
// PLAN_SITE_DOCUMENTATION_PRIVE.md): nginx calls this once per request to the docs site, forwarding
// the visitor's Cookie header, and gates access purely on the HTTP status — 204 lets the request
// through, anything else (401 here) is denied. No body, no user data: nginx discards the response
// content either way, and this stays as cheap as possible since it runs on every docs page/asset
// load (mitigated further by a short-lived cache at the nginx layer, not here). A user who still
// needs to change a temporary password is deliberately treated the same as "not authenticated" —
// consistent with requireAuth blocking every other route in that state.
authRouter.get(
  '/verify',
  requireAuth,
  asyncHandler((_req, res) => {
    res.status(204).end();
  })
);

// Re-confirms the signed-in user's password before a sensitive action in another app — used by
// Historique (historique.cafenoir.tn) to delete an employee advance within its 24 h window. Opens
// no session; failures count toward the same lockout as login so it can't be used to brute-force.
const verifyPasswordSchema = z.object({ password: z.string().min(1, 'Mot de passe requis.') });

authRouter.post(
  '/verify-password',
  requireAuth,
  asyncHandler((req, res) => {
    const { password } = verifyPasswordSchema.parse(req.body);
    const row = db
      .prepare('SELECT password_hash, failed_login_attempts, locked_until FROM users WHERE id = ?')
      .get(req.user!.id) as { password_hash: string | null; failed_login_attempts: number; locked_until: string | null } | undefined;
    if (!row) throw new ApiError(401, 'Session invalide ou expirée.');
    if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
      throw new ApiError(423, 'Compte temporairement verrouillé après plusieurs échecs. Réessayez dans quelques minutes.');
    }
    if (!verifyPassword(password, row.password_hash)) {
      const attempts = row.failed_login_attempts + 1;
      const lockedUntil = attempts >= LOGIN_LOCKOUT_THRESHOLD ? new Date(Date.now() + LOGIN_LOCKOUT_DURATION_MS).toISOString() : null;
      db.prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?').run(attempts, lockedUntil, req.user!.id);
      throw new ApiError(400, 'Mot de passe incorrect.', 'WRONG_PASSWORD');
    }
    db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?').run(req.user!.id);
    res.status(204).end();
  })
);

// Always requires the current password (which the user necessarily knows — they just used it, or
// the temporary one, to log in) even though a session is already open, so an already-authenticated
// but hijacked session can't silently take over the account by setting a new password blind.
authRouter.post(
  '/change-password',
  requireAuthAllowPendingPasswordChange,
  asyncHandler((req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as { password_hash: string | null } | undefined;
    if (!row || !verifyPassword(currentPassword, row.password_hash)) {
      throw new ApiError(400, 'Mot de passe actuel incorrect.');
    }
    db.prepare(
      'UPDATE users SET password_hash = ?, must_change_password = 0, password_updated_at = ? WHERE id = ?'
    ).run(hashPassword(newPassword), new Date().toISOString(), req.user!.id);
    res.status(204).end();
  })
);

// --- Sessions & appareils --------------------------------------------------------------------

interface SessionMetaRow {
  token: string;
  public_id: string;
  created_at: string;
  ip_address: string | null;
  device_label: string | null;
  location: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
}

authRouter.get(
  '/sessions',
  requireAuth,
  asyncHandler((req, res) => {
    const rows = db
      .prepare(
        `SELECT token, public_id, created_at, ip_address, device_label, location, last_seen_at, revoked_at
         FROM sessions WHERE user_id = ? ORDER BY created_at DESC`
      )
      .all(req.user!.id) as SessionMetaRow[];

    const active = rows
      .filter((r) => !r.revoked_at)
      .map((r) => ({
        id: r.public_id,
        device: r.device_label ?? 'Appareil inconnu',
        location: r.location ?? 'Inconnue',
        ipAddress: r.ip_address ?? 'Inconnue',
        loginTime: r.created_at,
        lastSeenAt: r.last_seen_at ?? r.created_at,
        isCurrent: r.token === req.sessionToken,
      }));

    interface SessionEvent {
      activity: 'Connexion' | 'Déconnexion';
      date: string;
      device: string;
      location: string;
    }

    const history = rows
      .flatMap((r): SessionEvent[] => {
        const device = r.device_label ?? 'Appareil inconnu';
        const location = r.location ?? 'Inconnue';
        const events: SessionEvent[] = [{ activity: 'Connexion', date: r.created_at, device, location }];
        if (r.revoked_at) events.push({ activity: 'Déconnexion', date: r.revoked_at, device, location });
        return events;
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    res.json({ active, history });
  })
);

authRouter.delete(
  '/sessions/:publicId',
  requireAuth,
  asyncHandler((req, res) => {
    const row = db
      .prepare('SELECT token FROM sessions WHERE public_id = ? AND user_id = ? AND revoked_at IS NULL')
      .get(req.params.publicId, req.user!.id) as { token: string } | undefined;
    if (!row) throw notFound('Session');

    db.prepare('UPDATE sessions SET revoked_at = ? WHERE token = ?').run(new Date().toISOString(), row.token);

    const isCurrentSession = row.token === req.sessionToken;
    if (isCurrentSession) res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    res.json({ revokedCurrentSession: isCurrentSession });
  })
);

// Referenced by roles.ts's user-creation/reset-password validation to keep the CIN format check in
// exactly one place.
export { CIN_PATTERN };
