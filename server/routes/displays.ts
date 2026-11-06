import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler, ApiError, notFound } from '../middleware/errors.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';
import { sha256 } from '../lib/clientIdentity.js';
import { emitPosEvent } from '../lib/events.js';
import { getPosSetting, loadActiveDiscountRules, setPosSetting } from '../lib/posCatalog.js';
import { readPosSettings } from './posCatalog.js';
import { tunisClock } from '../../src/data/pricing.js';

// Écrans tournés vers les clients (amélioration 07):
//   - "commandes prêtes": public board of pickup numbers (no name, no amount, no table);
//   - customer display next to the register: mirrors the register's cart and payment, paired to
//     one register with a token. Display state lives in memory: it is only ever a mirror.

const READY_VISIBLE_MS = 10 * 60_000;

export const readyBoard = (): { preparing: number[]; ready: number[] } => {
  const dayStart = new Date(`${tunisClock(new Date()).date}T00:00:00+01:00`).toISOString();
  const rows = db
    .prepare(
      `SELECT o.pickup_number AS n, l.prep_status AS status, l.ready_at AS ready_at, l.fire_status AS fire
       FROM pos_orders o JOIN pos_order_lines l ON l.order_id = o.id
       WHERE o.pickup_number IS NOT NULL AND o.status = 'validated' AND o.created_at >= ? AND l.status = 'active' AND l.prep_destination != 'none'`
    )
    .all(dayStart) as { n: number; status: string; ready_at: string | null; fire: string }[];
  const byOrder = new Map<number, typeof rows>();
  rows.forEach((r) => byOrder.set(r.n, [...(byOrder.get(r.n) ?? []), r]));
  const preparing: number[] = [];
  const ready: number[] = [];
  const now = Date.now();
  byOrder.forEach((lines, n) => {
    if (lines.every((l) => l.status === 'served')) return;
    if (lines.some((l) => l.status === 'to_prepare' || l.status === 'in_progress')) preparing.push(n);
    else {
      const lastReady = Math.max(...lines.map((l) => (l.ready_at ? Date.parse(l.ready_at) : 0)));
      if (now - lastReady < READY_VISIBLE_MS) ready.push(n);
    }
  });
  return { preparing: preparing.sort((a, b) => a - b), ready: ready.sort((a, b) => a - b) };
};

// --- Public ---------------------------------------------------------------------------------------

export const displaysPublicRouter = Router();

displaysPublicRouter.get('/ready-board', asyncHandler((_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json(readyBoard());
}));

export interface DisplayState {
  mode: 'idle' | 'cart' | 'payment' | 'thanks';
  lines: { name: string; quantity: number; totalMil: number }[];
  discountMil: number;
  totalMil: number;
  paidMil: number;
  dueMil: number;
  changeMil: number;
  pickupNumber: number | null;
  customerName: string | null;
  points: number | null;
}

const IDLE: DisplayState = { mode: 'idle', lines: [], discountMil: 0, totalMil: 0, paidMil: 0, dueMil: 0, changeMil: 0, pickupNumber: null, customerName: null, points: null };
const displays = new Map<string, { state: DisplayState; updatedAt: number }>();

const assertDisplayToken = (registerId: string, token: string | undefined): void => {
  const stored = getPosSetting(`display_token:${registerId}`, '');
  if (!stored || !token || sha256(token) !== stored) throw new ApiError(401, 'Écran non appairé à cette caisse.');
};

displaysPublicRouter.get('/display/:registerId', asyncHandler((req, res) => {
  assertDisplayToken(req.params.registerId, typeof req.query.k === 'string' ? req.query.k : undefined);
  const entry = displays.get(req.params.registerId);
  // A cart left on screen for more than 10 minutes goes back to the idle screen.
  const state = entry && Date.now() - entry.updatedAt < 10 * 60_000 ? entry.state : IDLE;
  const offers = loadActiveDiscountRules()
    .filter((d) => !d.customerIds && !d.identifiedCustomersOnly)
    .map((d) => ({ name: d.name, kind: d.kind, value: d.value }));
  res.set('Cache-Control', 'no-store');
  res.json({ state, idle: { offers, googleReviewUrl: readPosSettings().googleReviewUrl || null } });
}));

// --- Staff ----------------------------------------------------------------------------------------

export const displaysRouter = Router();
displaysRouter.use(requireAuth);

const stateSchema = z.object({
  mode: z.enum(['idle', 'cart', 'payment', 'thanks']),
  lines: z.array(z.object({ name: z.string().max(120), quantity: z.number().int().min(0).max(999), totalMil: z.number().int() })).max(100).default([]),
  discountMil: z.number().int().default(0),
  totalMil: z.number().int().default(0),
  paidMil: z.number().int().default(0),
  dueMil: z.number().int().default(0),
  changeMil: z.number().int().default(0),
  pickupNumber: z.number().int().nullable().default(null),
  customerName: z.string().max(80).nullable().default(null),
  points: z.number().int().nullable().default(null),
});

displaysRouter.post('/registers/:id/display', requirePermission('pos:sell'), asyncHandler((req, res) => {
  if (!db.prepare('SELECT 1 FROM cash_registers WHERE id = ?').get(req.params.id)) throw notFound('Caisse');
  displays.set(req.params.id, { state: stateSchema.parse(req.body), updatedAt: Date.now() });
  emitPosEvent({ type: 'display.changed' });
  res.json({ ok: true });
}));

// Pairs a screen with a register: the link carries a secret; generating a new one unpairs the old.
displaysRouter.post('/registers/:id/display-token', requirePermission('pos:settings'), asyncHandler((req, res) => {
  const register = db.prepare('SELECT id, name FROM cash_registers WHERE id = ?').get(req.params.id) as { id: string; name: string } | undefined;
  if (!register) throw notFound('Caisse');
  const token = randomBytes(18).toString('base64url');
  db.transaction(() => {
    setPosSetting(`display_token:${register.id}`, sha256(token), req.user!.fullName);
    recordActivity('Caisse', 'Écran client appairé', register.name, req.user!.fullName, { userId: req.user!.id });
  })();
  res.json({ path: `/ecran-client/${register.id}?k=${token}` });
}));
