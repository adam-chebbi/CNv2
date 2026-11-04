import { randomUUID } from 'node:crypto';
import { db } from '../db/connection.js';

export interface ActivityDetails {
  userId?: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}

// Keys whose values must never reach the journal, whatever object is being logged.
const SECRET_KEY_PATTERN = /(password|passwd|pin|token|secret|join_?code|hash)/i;

const redact = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEY_PATTERN.test(k) ? '***' : redact(v)])
    );
  }
  return value;
};

const serialize = (value: unknown): string | null => (value === undefined ? null : JSON.stringify(redact(value)));

// Appends one line to the journal. Call it inside the same db.transaction() as the action it
// describes, so an action and its trace are written together or not at all. The table is
// append-only (triggers in posSchema.ts refuse any UPDATE/DELETE).
export const recordActivity = (module: string, action: string, description: string, user: string, details: ActivityDetails = {}): void => {
  db.prepare(
    `INSERT INTO activity_log (id, timestamp, user, module, action, description, user_id, entity_type, entity_id, before_json, after_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    new Date().toISOString(),
    user,
    module,
    action,
    description,
    details.userId ?? null,
    details.entityType ?? null,
    details.entityId ?? null,
    serialize(details.before),
    serialize(details.after)
  );
};
