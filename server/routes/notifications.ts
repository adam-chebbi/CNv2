import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler } from '../middleware/errors.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

interface TreatedRow { alert_id: string; treated_at: string; treated_by: string }

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get('/treated-alerts', requirePermission('notifications:view'), asyncHandler((_req, res) => {
  const rows = db.prepare('SELECT * FROM treated_alerts').all() as TreatedRow[];
  const map: Record<string, { treatedAt: string; treatedBy: string }> = {};
  rows.forEach((r) => { map[r.alert_id] = { treatedAt: r.treated_at, treatedBy: r.treated_by }; });
  res.json(map);
}));

notificationsRouter.put('/treated-alerts/:alertId', requirePermission('notifications:manage'), asyncHandler((req, res) => {
  const body = z.object({ treatedBy: z.string().min(1) }).parse(req.body);
  const treatedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO treated_alerts (alert_id, treated_at, treated_by) VALUES (?, ?, ?)
     ON CONFLICT(alert_id) DO UPDATE SET treated_at = excluded.treated_at, treated_by = excluded.treated_by`
  ).run(req.params.alertId, treatedAt, body.treatedBy);
  res.json({ alertId: req.params.alertId, treatedAt, treatedBy: body.treatedBy });
}));

notificationsRouter.delete('/treated-alerts/:alertId', requirePermission('notifications:manage'), asyncHandler((req, res) => {
  db.prepare('DELETE FROM treated_alerts WHERE alert_id = ?').run(req.params.alertId);
  res.status(204).end();
}));
