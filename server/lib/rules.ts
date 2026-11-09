import { db } from '../db/connection.js';
import { BUSINESS_RULES, parseRuleValue, type RuleValues } from '../../src/data/businessRules.js';

// Current value of every operating rule (stored as "rule.<key>" in pos_settings).
export const readRules = (): RuleValues => {
  const rows = db.prepare("SELECT key, value FROM pos_settings WHERE key LIKE 'rule.%'").all() as { key: string; value: string }[];
  const stored = new Map(rows.map((r) => [r.key.slice(5), r.value]));
  return Object.fromEntries(BUSINESS_RULES.map((def) => [def.key, parseRuleValue(def, stored.get(def.key))]));
};

export const rule = <T extends number | boolean>(key: string): T => readRules()[key] as T;
