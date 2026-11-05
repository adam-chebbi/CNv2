import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler, notFound } from '../middleware/errors.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';
import { RECETTE_SCENARIOS } from '../../src/data/recette.js';

// Feuille de recette (cahier des charges §20.2 – §20.4): results of the acceptance scenarios,
// recorded while Café Noir tests the delivery, with who checked what and when.

export const recetteRouter = Router();
recetteRouter.use(requireAuth);

db.exec(`CREATE TABLE IF NOT EXISTS recette_checks (
  scenario_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('todo', 'ok', 'ko')),
  note TEXT,
  checked_by TEXT NOT NULL,
  checked_at TEXT NOT NULL
)`);

interface CheckRow {
  scenario_id: string;
  status: 'todo' | 'ok' | 'ko';
  note: string | null;
  checked_by: string;
  checked_at: string;
}

recetteRouter.get('/recette', requirePermission('pos:settings'), asyncHandler((_req, res) => {
  const checks = new Map((db.prepare('SELECT * FROM recette_checks').all() as CheckRow[]).map((c) => [c.scenario_id, c]));
  res.json(
    RECETTE_SCENARIOS.map((s) => {
      const c = checks.get(s.id);
      return { ...s, status: c?.status ?? 'todo', note: c?.note ?? '', checkedBy: c?.checked_by ?? null, checkedAt: c?.checked_at ?? null };
    })
  );
}));

recetteRouter.put('/recette/:id', requirePermission('pos:settings'), asyncHandler((req, res) => {
  const scenario = RECETTE_SCENARIOS.find((s) => s.id === req.params.id);
  if (!scenario) throw notFound('Scénario');
  const body = z.object({ status: z.enum(['todo', 'ok', 'ko']), note: z.string().trim().max(1000).default('') }).parse(req.body);
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO recette_checks (scenario_id, status, note, checked_by, checked_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(scenario_id) DO UPDATE SET status = excluded.status, note = excluded.note, checked_by = excluded.checked_by, checked_at = excluded.checked_at`
    ).run(scenario.id, body.status, body.note || null, req.user!.fullName, now);
    recordActivity('Recette', body.status === 'ok' ? 'Validé' : body.status === 'ko' ? 'Anomalie' : 'À refaire', `${scenario.fonction}${body.note ? ` — ${body.note}` : ''}`, req.user!.fullName, { userId: req.user!.id });
  })();
  res.json({ ok: true });
}));
