import { db } from '../db/connection.js';
import { ApiError } from '../middleware/errors.js';
import type { AuthedUser } from '../middleware/auth.js';

// A Super Admin account can only be touched (edited, deactivated/reactivated, password reset) by
// another Super Admin — otherwise a lower-privileged admin could lock out or demote the very
// account that's supposed to be able to fix any mistake. Checked against the role actually on the
// target row right now (not a cached value), since a role can be reassigned between requests.
export const assertCanModifySuperAdminTarget = (actingUser: AuthedUser, targetUserId: string): void => {
  const target = db
    .prepare('SELECT r.is_system FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?')
    .get(targetUserId) as { is_system: number | null } | undefined;
  if (target?.is_system === 1 && !actingUser.isSuperAdmin) {
    throw new ApiError(403, 'Seul un autre Super Admin peut modifier ce compte.');
  }
};
