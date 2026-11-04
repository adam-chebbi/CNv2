import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { fromJson, toJson } from '../db/json.js';
import { asyncHandler, ApiError, notFound } from '../middleware/errors.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';
import { getExpenseCategoryUsageCount, type Expense, type ExpenseAttachment, type ExpenseCategory } from '../../src/data/expensesModel.js';

const nowIso = () => new Date().toISOString();

interface CategoryRow { id: string; name: string; created_at: string }
const rowToCategory = (r: CategoryRow): ExpenseCategory => ({ id: r.id, name: r.name, createdAt: r.created_at });

interface ExpenseRow {
  id: string; title: string; amount: number; date: string; category_id: string; nature: string;
  recurrence: string; payment_method: string; status: string; comment: string | null; attachment: string | null; created_at: string;
  source_type?: string | null; // set on auto-generated expenses only (sale_vat / invoice_payment / salary_payment)
}
const rowToExpense = (r: ExpenseRow): Expense => ({
  id: r.id, title: r.title, amount: r.amount, date: r.date, categoryId: r.category_id,
  nature: r.nature as Expense['nature'], recurrence: r.recurrence as Expense['recurrence'],
  paymentMethod: r.payment_method as Expense['paymentMethod'], status: r.status as Expense['status'],
  comment: r.comment ?? undefined, attachment: r.attachment ? fromJson<ExpenseAttachment>(r.attachment, undefined as never) : undefined,
  createdAt: r.created_at,
  sourceType: r.source_type ?? undefined,
});

const getAllExpenses = (): Expense[] => (db.prepare('SELECT * FROM expenses').all() as ExpenseRow[]).map(rowToExpense);

export const expensesRouter = Router();
expensesRouter.use(requireAuth);

// --- Categories --------------------------------------------------------------------------------

const categorySchema = z.object({ name: z.string().trim().min(1) });

expensesRouter.get('/expense-categories', requirePermission('expenses:view'), asyncHandler((_req, res) => {
  res.json((db.prepare('SELECT * FROM expense_categories ORDER BY created_at ASC').all() as CategoryRow[]).map(rowToCategory));
}));

expensesRouter.post('/expense-categories', requirePermission('expenses:categories'), asyncHandler((req, res) => {
  const body = categorySchema.parse(req.body);
  const row: CategoryRow = { id: randomUUID(), name: body.name, created_at: nowIso().slice(0, 10) };
  db.prepare('INSERT INTO expense_categories (id, name, created_at) VALUES (?, ?, ?)').run(row.id, row.name, row.created_at);
  recordActivity('Dépenses', 'Création', `Catégorie de dépense créée — ${row.name}`, req.user!.fullName);
  res.status(201).json(rowToCategory(row));
}));

expensesRouter.put('/expense-categories/:id', requirePermission('expenses:categories'), asyncHandler((req, res) => {
  const body = categorySchema.parse(req.body);
  const existing = db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(req.params.id) as CategoryRow | undefined;
  if (!existing) throw notFound('Catégorie de dépense');
  db.prepare('UPDATE expense_categories SET name = ? WHERE id = ?').run(body.name, req.params.id);
  recordActivity('Dépenses', 'Modification', `Catégorie de dépense renommée — ${existing.name} → ${body.name}`, req.user!.fullName);
  res.json(rowToCategory({ ...existing, name: body.name }));
}));

expensesRouter.delete('/expense-categories/:id', requirePermission('expenses:categories'), asyncHandler((req, res) => {
  const existing = db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(req.params.id) as CategoryRow | undefined;
  if (!existing) throw notFound('Catégorie de dépense');
  if (getExpenseCategoryUsageCount(rowToCategory(existing), getAllExpenses()) > 0) {
    throw new ApiError(409, 'Cette catégorie est utilisée par des dépenses et ne peut pas être supprimée.');
  }
  db.prepare('DELETE FROM expense_categories WHERE id = ?').run(req.params.id);
  recordActivity('Dépenses', 'Suppression', `Catégorie de dépense supprimée — ${existing.name}`, req.user!.fullName);
  res.status(204).end();
}));

// --- Expenses ----------------------------------------------------------------------------------

const attachmentSchema = z.object({ name: z.string(), mimeType: z.string(), dataUrl: z.string() });

const expenseSchema = z.object({
  title: z.string().trim().min(1),
  amount: z.number().gt(0),
  date: z.string().min(1),
  categoryId: z.string().min(1),
  nature: z.enum(['Fixe', 'Variable']),
  recurrence: z.enum(['Ponctuelle', 'Hebdomadaire', 'Mensuelle', 'Trimestrielle', 'Annuelle']),
  paymentMethod: z.enum(['Espèces', 'Carte bancaire', 'Chèque', 'Virement bancaire']),
  comment: z.string().optional(),
  attachment: attachmentSchema.optional(),
});

expensesRouter.get('/expenses', requirePermission('expenses:view'), asyncHandler((_req, res) => {
  res.json(getAllExpenses());
}));

expensesRouter.post('/expenses', requirePermission('expenses:create'), asyncHandler((req, res) => {
  const body = expenseSchema.parse(req.body);
  const category = db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(body.categoryId) as CategoryRow | undefined;
  if (!category) throw new ApiError(400, 'Catégorie invalide.');
  const id = randomUUID();
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO expenses (id, title, amount, date, category_id, nature, recurrence, payment_method, status, comment, attachment, created_at)
     VALUES (@id, @title, @amount, @date, @category_id, @nature, @recurrence, @payment_method, 'En attente', @comment, @attachment, @created_at)`
  ).run({
    id, title: body.title, amount: body.amount, date: body.date, category_id: body.categoryId, nature: body.nature,
    recurrence: body.recurrence, payment_method: body.paymentMethod, comment: body.comment ?? null,
    attachment: toJson(body.attachment), created_at: createdAt,
  });
  recordActivity('Dépenses', 'Création', `Dépense créée — ${body.title} (${body.amount} DT)`, req.user!.fullName);
  res.status(201).json(rowToExpense({
    id, title: body.title, amount: body.amount, date: body.date, category_id: body.categoryId, nature: body.nature,
    recurrence: body.recurrence, payment_method: body.paymentMethod, status: 'En attente', comment: body.comment ?? null,
    attachment: toJson(body.attachment), created_at: createdAt,
  }));
}));

expensesRouter.put('/expenses/:id', requirePermission('expenses:create'), asyncHandler((req, res) => {
  const body = expenseSchema.parse(req.body);
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id) as ExpenseRow | undefined;
  if (!existing) throw notFound('Dépense');
  db.prepare(
    `UPDATE expenses SET title=@title, amount=@amount, date=@date, category_id=@category_id, nature=@nature,
     recurrence=@recurrence, payment_method=@payment_method, comment=@comment, attachment=@attachment WHERE id=@id`
  ).run({
    id: req.params.id, title: body.title, amount: body.amount, date: body.date, category_id: body.categoryId,
    nature: body.nature, recurrence: body.recurrence, payment_method: body.paymentMethod, comment: body.comment ?? null,
    attachment: toJson(body.attachment),
  });
  recordActivity('Dépenses', 'Modification', `Dépense modifiée — ${body.title}`, req.user!.fullName);
  res.json(rowToExpense({ ...existing, title: body.title, amount: body.amount, date: body.date, category_id: body.categoryId,
    nature: body.nature, recurrence: body.recurrence, payment_method: body.paymentMethod, comment: body.comment ?? null,
    attachment: toJson(body.attachment) }));
}));

expensesRouter.patch('/expenses/:id/status', requirePermission('expenses:approve'), asyncHandler((req, res) => {
  const body = z.object({ status: z.enum(['En attente', 'Approuvé', 'Rejeté']) }).parse(req.body);
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id) as ExpenseRow | undefined;
  if (!existing) throw notFound('Dépense');
  db.prepare('UPDATE expenses SET status = ? WHERE id = ?').run(body.status, req.params.id);
  recordActivity('Dépenses', 'Modification', `Statut de dépense modifié — ${existing.title} (${body.status})`, req.user!.fullName);
  res.json(rowToExpense({ ...existing, status: body.status }));
}));

expensesRouter.delete('/expenses/:id', requirePermission('expenses:delete'), asyncHandler((req, res) => {
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id) as ExpenseRow | undefined;
  if (!existing) throw notFound('Dépense');
  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  recordActivity('Dépenses', 'Suppression', `Dépense supprimée — ${existing.title}`, req.user!.fullName);
  res.status(204).end();
}));
