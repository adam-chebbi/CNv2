import { Router } from 'express';
import { db } from '../db/connection.js';
import { asyncHandler } from '../middleware/errors.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import type { ActivityLogEntry } from '../../src/data/activityLog.js';

interface LogRow { id: string; timestamp: string; user: string; module: string; action: string; description: string }
const rowToEntry = (r: LogRow): ActivityLogEntry => ({ id: r.id, timestamp: r.timestamp, user: r.user, module: r.module, action: r.action, description: r.description });

export const activityLogRouter = Router();
activityLogRouter.use(requireAuth);

activityLogRouter.get('/', requirePermission('activity_log:view'), asyncHandler((_req, res) => {
  const rows = db.prepare('SELECT * FROM activity_log ORDER BY timestamp DESC').all() as LogRow[];
  res.json(rows.map(rowToEntry));
}));
