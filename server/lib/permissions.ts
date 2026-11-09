import { db } from '../db/connection.js';

// Effective rights of an account: those of its profile (role) plus the ones granted to that person.
export const effectivePermissions = (userId: string, roleId: string | null): string[] => {
  const rows = db
    .prepare(
      `SELECT permission_key FROM role_permissions WHERE role_id = ?
       UNION SELECT permission_key FROM user_permissions WHERE user_id = ?`
    )
    .all(roleId ?? '', userId) as { permission_key: string }[];
  return rows.map((r) => r.permission_key);
};

export const userGrants = (userId: string): string[] =>
  (db.prepare('SELECT permission_key FROM user_permissions WHERE user_id = ? ORDER BY permission_key').all(userId) as { permission_key: string }[]).map((r) => r.permission_key);
