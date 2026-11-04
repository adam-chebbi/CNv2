import type { AuthedUser } from '../middleware/auth.js';
import { db } from '../db/connection.js';
import { ApiError } from '../middleware/errors.js';

// Who may act on which table (cahier des charges §3.2 / §6.4): with tables:all, every table;
// otherwise only the tables of the sections currently assigned to the user. Enforced on reads,
// searches and actions alike — the screens only mirror it.

export const hasPermission = (user: AuthedUser, key: string): boolean => user.isSuperAdmin || user.permissions.includes(key);

export const canSeeAllTables = (user: AuthedUser): boolean => hasPermission(user, 'tables:all');

export const assignedTableIds = (userId: string): Set<string> => {
  const rows = db
    .prepare(
      `SELECT st.table_id FROM section_assignments sa JOIN section_tables st ON st.section_id = sa.section_id
       WHERE sa.waiter_id = ? AND sa.ends_at IS NULL`
    )
    .all(userId) as { table_id: string }[];
  return new Set(rows.map((r) => r.table_id));
};

export const canAccessTable = (user: AuthedUser, tableId: string): boolean => canSeeAllTables(user) || assignedTableIds(user.id).has(tableId);

export const assertTableAccess = (user: AuthedUser, tableId: string): void => {
  if (!canAccessTable(user, tableId)) throw new ApiError(403, "Cette table n'est pas dans vos carrés.");
};

// The waiter in charge of a table right now (current section assignment), if any.
export const currentWaiterOfTable = (tableId: string): { id: string; name: string } | null => {
  const row = db
    .prepare(
      `SELECT sa.waiter_id AS id, sa.waiter_name AS name FROM section_tables st
       JOIN section_assignments sa ON sa.section_id = st.section_id AND sa.ends_at IS NULL
       WHERE st.table_id = ?`
    )
    .get(tableId) as { id: string; name: string } | undefined;
  return row ?? null;
};
