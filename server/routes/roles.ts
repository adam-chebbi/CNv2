import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler, ApiError, notFound } from '../middleware/errors.js';
import { requireAuth, requirePermission, requireAnyPermission } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';
import { hashPassword } from '../lib/password.js';
import { groupPermissionsByModule, isKnownPermissionKey, MANAGE_ROLES_PERMISSION } from '../../src/data/rbacModel.js';
import { assertCanModifySuperAdminTarget } from '../lib/userGuards.js';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^(\+216)?\d{8}$/;

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  is_system: number;
  created_at: string;
}

interface PermissionRow {
  permission_key: string;
}

interface UserCountRow {
  role_id: string;
  count: number;
}

const permissionsArraySchema = z
  .array(z.string())
  .refine((keys) => keys.every(isKnownPermissionKey), { message: 'Clé de permission inconnue.' });

const serializeRole = (row: RoleRow, permissions: string[], userCount: number) => ({
  id: row.id,
  name: row.name,
  description: row.description ?? '',
  isSystem: row.is_system === 1,
  permissions,
  userCount,
  createdAt: row.created_at,
});

const listRolesWithDetails = () => {
  const roles = db.prepare('SELECT id, name, description, is_system, created_at FROM roles ORDER BY is_system DESC, created_at ASC').all() as RoleRow[];
  const permissionRows = db.prepare('SELECT role_id, permission_key FROM role_permissions').all() as { role_id: string; permission_key: string }[];
  const userCounts = db.prepare('SELECT role_id, COUNT(*) as count FROM users WHERE role_id IS NOT NULL GROUP BY role_id').all() as UserCountRow[];

  const permissionsByRole = new Map<string, string[]>();
  permissionRows.forEach((r) => {
    const list = permissionsByRole.get(r.role_id) ?? [];
    list.push(r.permission_key);
    permissionsByRole.set(r.role_id, list);
  });
  const countByRole = new Map(userCounts.map((r) => [r.role_id, r.count]));

  return roles.map((r) => serializeRole(r, permissionsByRole.get(r.id) ?? [], countByRole.get(r.id) ?? 0));
};

export const rolesRouter = Router();
rolesRouter.use(requireAuth);

// The permission catalog is fixed, code-defined data (src/data/rbacModel.ts) — this endpoint just
// exposes it to the client so the Roles & Permissions matrix doesn't need to duplicate it, while
// still gating it behind roles:manage since it's only ever useful on that screen.
rolesRouter.get(
  '/permissions',
  requirePermission(MANAGE_ROLES_PERMISSION),
  asyncHandler((_req, res) => {
    res.json({ groups: groupPermissionsByModule() });
  })
);

// Also reachable with just hr:manage (not only roles:manage) — the employee form's optional
// "Compte de connexion" section needs the role list to populate its picker, without needing full
// Roles & Permissions access itself.
rolesRouter.get(
  '/roles',
  requireAnyPermission(MANAGE_ROLES_PERMISSION, 'hr:manage'),
  asyncHandler((_req, res) => {
    res.json(listRolesWithDetails());
  })
);

const roleSchema = z.object({
  name: z.string().min(1, 'Le nom du rôle est obligatoire.').max(100),
  description: z.string().max(500).optional().default(''),
  permissions: permissionsArraySchema.optional().default([]),
});

rolesRouter.post(
  '/roles',
  requirePermission(MANAGE_ROLES_PERMISSION),
  asyncHandler((req, res) => {
    const body = roleSchema.parse(req.body);
    const trimmedName = body.name.trim();
    const duplicate = db.prepare('SELECT id FROM roles WHERE LOWER(name) = LOWER(?)').get(trimmedName);
    if (duplicate) throw new ApiError(409, 'Ce nom de rôle est déjà utilisé.');

    const id = randomUUID();
    const tx = db.transaction(() => {
      db.prepare('INSERT INTO roles (id, name, description, is_system, created_at) VALUES (?, ?, ?, 0, ?)').run(
        id,
        trimmedName,
        body.description,
        new Date().toISOString()
      );
      const insertPermission = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)');
      body.permissions.forEach((key) => insertPermission.run(id, key));
    });
    tx();

    recordActivity('Rôles & permissions', 'Création', `Rôle "${trimmedName}" créé.`, req.user!.fullName);
    const [role] = listRolesWithDetails().filter((r) => r.id === id);
    res.status(201).json(role);
  })
);

const roleUpdateSchema = z.object({
  name: z.string().min(1, 'Le nom du rôle est obligatoire.').max(100).optional(),
  description: z.string().max(500).optional(),
  permissions: permissionsArraySchema.optional(),
});

rolesRouter.put(
  '/roles/:id',
  requirePermission(MANAGE_ROLES_PERMISSION),
  asyncHandler((req, res) => {
    const row = db.prepare('SELECT id, name, description, is_system, created_at FROM roles WHERE id = ?').get(req.params.id) as RoleRow | undefined;
    if (!row) throw notFound('Rôle');
    if (row.is_system === 1) throw new ApiError(403, 'Le rôle Super Admin ne peut pas être modifié.');

    const body = roleUpdateSchema.parse(req.body);
    const trimmedName = body.name?.trim();
    if (trimmedName) {
      const duplicate = db.prepare('SELECT id FROM roles WHERE LOWER(name) = LOWER(?) AND id != ?').get(trimmedName, row.id);
      if (duplicate) throw new ApiError(409, 'Ce nom de rôle est déjà utilisé.');
    }

    const tx = db.transaction(() => {
      if (trimmedName !== undefined || body.description !== undefined) {
        db.prepare('UPDATE roles SET name = ?, description = ? WHERE id = ?').run(
          trimmedName ?? row.name,
          body.description ?? row.description ?? '',
          row.id
        );
      }
      if (body.permissions !== undefined) {
        db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(row.id);
        const insertPermission = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)');
        body.permissions.forEach((key) => insertPermission.run(row.id, key));
      }
    });
    tx();

    recordActivity('Rôles & permissions', 'Modification', `Rôle "${trimmedName ?? row.name}" mis à jour.`, req.user!.fullName);
    const [role] = listRolesWithDetails().filter((r) => r.id === row.id);
    res.json(role);
  })
);

rolesRouter.delete(
  '/roles/:id',
  requirePermission(MANAGE_ROLES_PERMISSION),
  asyncHandler((req, res) => {
    const row = db.prepare('SELECT id, name, is_system FROM roles WHERE id = ?').get(req.params.id) as
      | { id: string; name: string; is_system: number }
      | undefined;
    if (!row) throw notFound('Rôle');
    if (row.is_system === 1) throw new ApiError(403, 'Le rôle Super Admin ne peut pas être supprimé.');

    const { count } = db.prepare('SELECT COUNT(*) as count FROM users WHERE role_id = ?').get(row.id) as { count: number };
    if (count > 0) throw new ApiError(409, 'Ce rôle est assigné à un ou plusieurs utilisateurs. Réassignez-les avant de le supprimer.');

    db.prepare('DELETE FROM roles WHERE id = ?').run(row.id);
    recordActivity('Rôles & permissions', 'Suppression', `Rôle "${row.name}" supprimé.`, req.user!.fullName);
    res.status(204).end();
  })
);

// --- Utilisateurs (comptes de connexion) ----------------------------------------------------
// A minimal user directory lives here rather than as its own sidebar module, per the same
// header-dropdown-only placement as the rest of Roles & Permissions — creating/assigning users to
// roles is part of the same screen and the same roles:manage permission.

interface UserRow {
  id: string;
  full_name: string;
  cin: string;
  email: string | null;
  phone: string | null;
  role_id: string | null;
  role_name: string | null;
  role_is_system: number | null;
  must_change_password: number;
  employee_id: string | null;
  employee_name: string | null;
  is_active: number;
  created_at: string;
}

// Users are now created exclusively from the employee form's optional "Compte de connexion"
// section (see POST /hr/employees) — this list is management-only: who's linked to which employee,
// reset a password, activate/deactivate. There is no POST /users here any more.
const listUsersWithRole = () =>
  (db
    .prepare(
      `SELECT u.id, u.full_name, u.cin, u.email, u.phone, u.role_id, r.name AS role_name, r.is_system AS role_is_system, u.must_change_password,
              u.employee_id, (e.first_name || ' ' || e.last_name) AS employee_name, u.is_active, u.created_at
       FROM users u LEFT JOIN roles r ON r.id = u.role_id LEFT JOIN employees e ON e.id = u.employee_id
       ORDER BY u.created_at ASC`
    )
    .all() as UserRow[])
    .map((u) => ({
      id: u.id,
      fullName: u.full_name,
      cin: u.cin,
      email: u.email ?? '',
      phone: u.phone ?? '',
      roleId: u.role_id,
      roleName: u.role_name,
      isSuperAdmin: u.role_is_system === 1,
      mustChangePassword: u.must_change_password === 1,
      employeeId: u.employee_id,
      employeeName: u.employee_name,
      isActive: u.is_active === 1,
      createdAt: u.created_at,
    }));

rolesRouter.get(
  '/users',
  requirePermission(MANAGE_ROLES_PERMISSION),
  asyncHandler((_req, res) => {
    res.json(listUsersWithRole());
  })
);

export const assertRoleExists = (roleId: string): void => {
  const role = db.prepare('SELECT id FROM roles WHERE id = ?').get(roleId);
  if (!role) throw new ApiError(400, 'Rôle introuvable.');
};

// Case-insensitive — "Sami@CafeNoir.tn" and "sami@cafenoir.tn" must be treated as the same login
// identifier, matching how POST /auth/login resolves it (LOWER(u.email) = ?).
const assertEmailPhoneAvailable = (email: string, phone: string, excludeUserId?: string): void => {
  if (email) {
    const dup = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ?').get(email, excludeUserId ?? '');
    if (dup) throw new ApiError(409, 'Cette adresse email est déjà utilisée par un autre compte.');
  }
  if (phone) {
    const dup = db.prepare('SELECT id FROM users WHERE phone = ? AND id != ?').get(phone, excludeUserId ?? '');
    if (dup) throw new ApiError(409, 'Ce numéro de téléphone est déjà utilisé par un autre compte.');
  }
};

// Resets an existing account's password back to its own CIN (forgotten password, account handed to
// someone new, etc.) — same rule as account creation, and forces the change-password screen again
// on next login (must_change_password), so every reset always ends with the user picking a real
// password of their own before they can do anything else.
rolesRouter.post(
  '/users/:id/reset-password',
  requirePermission(MANAGE_ROLES_PERMISSION),
  asyncHandler((req, res) => {
    const existing = db.prepare('SELECT id, full_name, cin FROM users WHERE id = ?').get(req.params.id) as
      | { id: string; full_name: string; cin: string }
      | undefined;
    if (!existing) throw notFound('Utilisateur');
    assertCanModifySuperAdminTarget(req.user!, existing.id);

    db.prepare(
      'UPDATE users SET password_hash = ?, must_change_password = 1, failed_login_attempts = 0, locked_until = NULL, password_updated_at = ? WHERE id = ?'
    ).run(hashPassword(existing.cin), new Date().toISOString(), existing.id);

    recordActivity('Rôles & permissions', 'Modification', `Mot de passe réinitialisé — ${existing.full_name}.`, req.user!.fullName);
    res.status(204).end();
  })
);

const userUpdateSchema = z.object({
  fullName: z.string().min(1).max(150).optional(),
  email: z.string().trim().regex(EMAIL_PATTERN, 'Adresse email invalide.').optional().or(z.literal('')),
  phone: z.string().trim().regex(PHONE_PATTERN, 'Numéro de téléphone invalide.').optional().or(z.literal('')),
  roleId: z.string().min(1).optional(),
});

// Guards against ending up with zero Super Admin accounts, which would permanently lock everyone
// out of Roles & Permissions (no one left with roles:manage to fix it) — checked before any role
// reassignment or deletion actually touches the last remaining one.
const assertNotLastSuperAdmin = (userId: string): void => {
  const target = db
    .prepare(`SELECT r.is_system FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?`)
    .get(userId) as { is_system: number | null } | undefined;
  if (!target || target.is_system !== 1) return;

  const { count } = db
    .prepare(`SELECT COUNT(*) as count FROM users u JOIN roles r ON r.id = u.role_id WHERE r.is_system = 1`)
    .get() as { count: number };
  if (count <= 1) throw new ApiError(409, 'Impossible : il doit toujours rester au moins un compte Super Admin.');
};

rolesRouter.put(
  '/users/:id',
  requirePermission(MANAGE_ROLES_PERMISSION),
  asyncHandler((req, res) => {
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!existing) throw notFound('Utilisateur');
    assertCanModifySuperAdminTarget(req.user!, req.params.id);

    const body = userUpdateSchema.parse(req.body);
    if (body.roleId !== undefined) {
      assertRoleExists(body.roleId);
      assertNotLastSuperAdmin(req.params.id);
    }
    if (body.email !== undefined || body.phone !== undefined) {
      assertEmailPhoneAvailable(body.email ?? '', body.phone ?? '', req.params.id);
    }

    const tx = db.transaction(() => {
      if (body.fullName !== undefined) db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(body.fullName.trim(), req.params.id);
      if (body.roleId !== undefined) db.prepare('UPDATE users SET role_id = ? WHERE id = ?').run(body.roleId, req.params.id);
      if (body.email !== undefined) db.prepare('UPDATE users SET email = ? WHERE id = ?').run(body.email || null, req.params.id);
      if (body.phone !== undefined) db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(body.phone || null, req.params.id);
    });
    tx();

    recordActivity('Rôles & permissions', 'Modification', `Utilisateur mis à jour.`, req.user!.fullName);
    const [updated] = listUsersWithRole().filter((u) => u.id === req.params.id);
    res.json(updated);
  })
);

// Deactivating replaces deletion for login accounts: the account, its history, and everything it's
// linked to (an employee record, activity log entries...) all stay exactly as they are — only
// future logins are blocked. Revokes active sessions immediately, same as the old delete route did.
rolesRouter.post(
  '/users/:id/deactivate',
  requirePermission(MANAGE_ROLES_PERMISSION),
  asyncHandler((req, res) => {
    const existing = db.prepare('SELECT id, full_name FROM users WHERE id = ?').get(req.params.id) as { id: string; full_name: string } | undefined;
    if (!existing) throw notFound('Utilisateur');
    if (existing.id === req.user!.id) throw new ApiError(400, 'Vous ne pouvez pas désactiver votre propre compte.');
    assertCanModifySuperAdminTarget(req.user!, existing.id);
    assertNotLastSuperAdmin(req.params.id);

    const tx = db.transaction(() => {
      db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(new Date().toISOString(), existing.id);
      db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(existing.id);
    });
    tx();

    recordActivity('Rôles & permissions', 'Modification', `Utilisateur désactivé — ${existing.full_name}.`, req.user!.fullName);
    const [updated] = listUsersWithRole().filter((u) => u.id === existing.id);
    res.json(updated);
  })
);

rolesRouter.post(
  '/users/:id/reactivate',
  requirePermission(MANAGE_ROLES_PERMISSION),
  asyncHandler((req, res) => {
    const existing = db.prepare('SELECT id, full_name FROM users WHERE id = ?').get(req.params.id) as { id: string; full_name: string } | undefined;
    if (!existing) throw notFound('Utilisateur');
    assertCanModifySuperAdminTarget(req.user!, existing.id);

    db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').run(existing.id);

    recordActivity('Rôles & permissions', 'Modification', `Utilisateur réactivé — ${existing.full_name}.`, req.user!.fullName);
    const [updated] = listUsersWithRole().filter((u) => u.id === existing.id);
    res.json(updated);
  })
);
