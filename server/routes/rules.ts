import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler, ApiError, notFound } from '../middleware/errors.js';
import { requireAnyPermission, requireAuth } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';
import { emitPosEvent } from '../lib/events.js';
import { hasPermission } from '../lib/posAccess.js';
import { readRules } from '../lib/rules.js';
import { BUSINESS_RULES, parseRuleValue, RULE_DEFAULTS, serializeRuleValue, validateRuleValue } from '../../src/data/businessRules.js';

// Operating rules (configuration engine): read by every screen that applies them, changed by the
// Direction (pos:settings) or, for the service rules, by holders of rules:service. Every change
// keeps old value, new value, person, time and reason; it applies from the moment it is saved.

export const rulesRouter = Router();
rulesRouter.use(requireAuth);

// Current values only, for the screens that apply them (preparation boards, register…).
rulesRouter.get('/rules/values', asyncHandler((_req, res) => {
  res.json(readRules());
}));

rulesRouter.get('/rules', requireAnyPermission('pos:settings', 'rules:service'), asyncHandler((req, res) => {
  const values = readRules();
  const history = db
    .prepare('SELECT rule_key, old_value, new_value, changed_by, changed_at, reason FROM rule_changes ORDER BY changed_at DESC LIMIT 200')
    .all() as { rule_key: string; old_value: string | null; new_value: string; changed_by: string; changed_at: string; reason: string }[];
  const full = hasPermission(req.user!, 'pos:settings');
  res.json(
    BUSINESS_RULES.map((def) => ({
      ...def,
      value: values[def.key],
      isDefault: values[def.key] === RULE_DEFAULTS[def.key],
      canEdit: full || Boolean(def.service),
      history: history
        .filter((h) => h.rule_key === def.key)
        .slice(0, 10)
        .map((h) => ({ oldValue: h.old_value === null ? def.default : parseRuleValue(def, h.old_value), newValue: parseRuleValue(def, h.new_value), by: h.changed_by, at: h.changed_at, reason: h.reason })),
    }))
  );
}));

rulesRouter.put('/rules/:key', requireAnyPermission('pos:settings', 'rules:service'), asyncHandler((req, res) => {
  const def = BUSINESS_RULES.find((r) => r.key === req.params.key);
  if (!def) throw notFound('Règle');
  const user = req.user!;
  if (!def.service && !hasPermission(user, 'pos:settings')) throw new ApiError(403, 'Seule la direction peut modifier cette règle.');
  const body = z.object({ value: z.union([z.boolean(), z.number()]), reason: z.string().trim().min(3, 'Indiquez la raison du changement.').max(300) }).parse(req.body);
  const invalid = validateRuleValue(def, body.value);
  if (invalid) throw new ApiError(400, invalid);

  const before = readRules()[def.key];
  if (before === body.value) return res.json({ key: def.key, value: before });
  const now = new Date().toISOString();
  const oldRaw = (db.prepare('SELECT value FROM pos_settings WHERE key = ?').get(`rule.${def.key}`) as { value: string } | undefined)?.value ?? null;
  db.transaction(() => {
    db.prepare(
      `INSERT INTO pos_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    ).run(`rule.${def.key}`, serializeRuleValue(def, body.value), now, user.fullName);
    db.prepare('INSERT INTO rule_changes (rule_key, old_value, new_value, changed_by, changed_by_id, changed_at, reason) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      def.key, oldRaw, serializeRuleValue(def, body.value), user.fullName, user.id, now, body.reason
    );
    recordActivity('Paramètres', 'Règle modifiée', `${def.label} : ${fmt(before)} → ${fmt(body.value)} (${body.reason})`, user.fullName, {
      userId: user.id, entityType: 'rule', entityId: def.key, before, after: body.value,
    });
  })();
  emitPosEvent({ type: 'catalog.changed' });
  res.json({ key: def.key, value: body.value });
}));

const fmt = (v: number | boolean) => (typeof v === 'boolean' ? (v ? 'oui' : 'non') : String(v));
