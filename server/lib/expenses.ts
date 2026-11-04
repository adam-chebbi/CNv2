import { todayIso } from '../../src/data/dateUtils.js';
import { randomUUID } from 'node:crypto';
import { db } from '../db/connection.js';
import { normalizeKey } from '../../src/data/textUtils.js';
import { recordActivity } from './activity.js';

// Shared by every automatic expense-creating flow (sale VAT, supplier invoice payments, HR salary
// payments) so "Gestion des dépenses" ends up as the single place every real outflow of money
// shows up — one mechanism, reused, rather than three parallel financial ledgers that never
// reconcile with each other.

// Finds an expense category by name (case/accent-insensitive), creating it if missing. Used
// instead of a fixed id so this still works after a full data wipe that emptied
// expense_categories, or on an install that never seeded the default categories.
export const ensureExpenseCategoryId = (categoryName: string): string => {
  const categories = db.prepare('SELECT id, name FROM expense_categories').all() as { id: string; name: string }[];
  const existing = categories.find((c) => normalizeKey(c.name) === normalizeKey(categoryName));
  if (existing) return existing.id;
  const id = randomUUID();
  db.prepare('INSERT INTO expense_categories (id, name, created_at) VALUES (?, ?, ?)').run(
    id, categoryName, todayIso()
  );
  return id;
};

export interface AutoExpenseInput {
  title: string;
  amount: number;
  date: string; // yyyy-mm-dd
  categoryName: string;
  paymentMethod: 'Espèces' | 'Carte bancaire' | 'Chèque' | 'Virement bancaire';
  comment: string;
  sourceType: string;
  sourceId: string;
  performedBy: string;
}

// Inserts one auto-generated, pre-approved expense row (status 'Approuvé' — there is no human
// proposing this amount to review, it's derived directly from a payment that already happened)
// tagged with source_type/source_id so it can be found and reversed later if the originating
// record is ever cancelled. Amounts <= 0 are silently skipped, same defensive rule as the sale-VAT
// expense this pattern was first built for — a payment record must never fail to save because this
// side effect had nothing to log.
export const recordAutoExpense = (input: AutoExpenseInput): void => {
  if (input.amount <= 0) return;
  const categoryId = ensureExpenseCategoryId(input.categoryName);
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO expenses (id, title, amount, date, category_id, nature, recurrence, payment_method, status, comment, attachment, created_at, source_type, source_id)
     VALUES (@id, @title, @amount, @date, @categoryId, 'Variable', 'Ponctuelle', @paymentMethod, 'Approuvé', @comment, NULL, @createdAt, @sourceType, @sourceId)`
  ).run({
    id, title: input.title, amount: Math.round(input.amount * 1000) / 1000, date: input.date, categoryId,
    paymentMethod: input.paymentMethod, comment: input.comment, createdAt, sourceType: input.sourceType, sourceId: input.sourceId,
  });
  recordActivity('Dépenses', 'Création', `Dépense créée automatiquement — ${input.title} (${input.amount.toFixed(3)} DT)`, input.performedBy);
};
