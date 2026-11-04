import { randomUUID } from 'node:crypto';
import { db } from '../db/connection.js';

export const recordActivity = (module: string, action: string, description: string, user: string): void => {
  db.prepare(
    'INSERT INTO activity_log (id, timestamp, user, module, action, description) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(randomUUID(), new Date().toISOString(), user, module, action, description);
};
