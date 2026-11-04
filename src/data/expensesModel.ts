// Shared domain model for "Achat et dépenses" → Dépenses / Catégories de dépenses.
// Follows the same conventions as productsModel.ts / stockModel.ts: canonical entity resolution
// via normalizeKey, draft/validation helpers for the Saisie → Validation → Confirmation workflow,
// and usage-count guards so a category in use can never be silently deleted.

import { todayIso } from './dateUtils';
import { normalizeKey } from './textUtils';

let idCounter = 0;
export const generateExpenseId = (prefix: string): string => {
  idCounter += 1;
  return `${prefix}-${idCounter}-${Date.now().toString(36)}`;
};

// --- Categories -------------------------------------------------------------------------------

export interface ExpenseCategory {
  id: string;
  name: string;
  createdAt: string;
}

// The 12 categories a fresh/seeded install starts with (server/seed/misc.ts). Shared here so the
// "Recréer les catégories par défaut" action (for after a full data wipe emptied this table) and
// the seed script can never drift apart by listing the names twice.
export const DEFAULT_EXPENSE_CATEGORY_NAMES = [
  'Loyer', 'STEG', 'SONEDE', 'Téléphone / Internet', 'Personnel', 'Entretien',
  'Réparation', 'Marketing', 'Fournitures', 'Transport', 'Taxes et frais', 'Divers',
];

export const resolveExpenseCategoryByName = (raw: string, categories: ExpenseCategory[]): ExpenseCategory | undefined => {
  const key = normalizeKey(raw);
  if (!key) return undefined;
  return categories.find((c) => normalizeKey(c.name) === key);
};

export const getExpenseCategoryUsageCount = (category: ExpenseCategory, expenses: Expense[]): number =>
  expenses.filter((e) => e.categoryId === category.id).length;

// --- Expenses -----------------------------------------------------------------------------------

export type ExpenseNature = 'Fixe' | 'Variable';
export const EXPENSE_NATURES: ExpenseNature[] = ['Fixe', 'Variable'];

export type ExpenseRecurrence = 'Ponctuelle' | 'Hebdomadaire' | 'Mensuelle' | 'Trimestrielle' | 'Annuelle';
export const EXPENSE_RECURRENCES: ExpenseRecurrence[] = ['Ponctuelle', 'Hebdomadaire', 'Mensuelle', 'Trimestrielle', 'Annuelle'];

export type ExpensePaymentMethod = 'Espèces' | 'Carte bancaire' | 'Chèque' | 'Virement bancaire';
export const EXPENSE_PAYMENT_METHODS: ExpensePaymentMethod[] = ['Espèces', 'Carte bancaire', 'Chèque', 'Virement bancaire'];

export type ExpenseStatus = 'En attente' | 'Approuvé' | 'Rejeté';
export const EXPENSE_STATUSES: ExpenseStatus[] = ['En attente', 'Approuvé', 'Rejeté'];

export interface ExpenseAttachment {
  name: string;
  mimeType: string;
  dataUrl: string;
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  date: string; // ISO yyyy-mm-dd
  categoryId: string;
  nature: ExpenseNature;
  recurrence: ExpenseRecurrence;
  paymentMethod: ExpensePaymentMethod;
  status: ExpenseStatus;
  comment?: string;
  attachment?: ExpenseAttachment;
  createdAt: string;
  // Only set on expenses the system generated itself, each one the cash side of a figure that is
  // already counted elsewhere: 'sale_vat' (TVA collected on a sale), 'invoice_payment' (a supplier
  // invoice payment) and 'salary_payment' (a salary payment). Manual expenses leave it undefined.
  sourceType?: string;
}

export type AutoExpenseSource = 'sale_vat' | 'invoice_payment' | 'salary_payment';

// Profit figures must not subtract the same money twice. The sale's VAT is already taken out of
// net sales, a supplier payment is the purchase already counted in "Achats" (or in the cost of
// goods sold), and a salary payment is the staff cost already counted in "Coût du personnel". Pass
// the sources a given calculation already covers elsewhere and get back the remaining expenses.
export const excludeOverlappingExpenses = (expenses: Expense[], ...alreadyCounted: AutoExpenseSource[]): Expense[] =>
  expenses.filter((e) => !(e.sourceType && (alreadyCounted as string[]).includes(e.sourceType)));


// --- Draft / workflow helpers (Saisie → Validation → Prévisualisation → Confirmation) ----------

export interface DraftExpense {
  id: string;
  title: string;
  amount: string;
  date: string;
  categoryId: string;
  nature: ExpenseNature;
  recurrence: ExpenseRecurrence;
  paymentMethod: ExpensePaymentMethod | '';
  comment: string;
  attachment: ExpenseAttachment | null;
  // Carried through unchanged from the existing record when editing — status is only ever
  // changed via the dedicated status control on the row/detail, never through this form.
  status: ExpenseStatus;
  createdAt: string | null;
}

export const createEmptyDraftExpense = (): DraftExpense => ({
  id: generateExpenseId('exp'),
  title: '',
  amount: '',
  date: todayIso(),
  categoryId: '',
  // "Nouvelle dépense" no longer offers a Fixe/Variable choice (see ExpensesPage) — every manually
  // entered expense is now recorded as Fixe. 'Variable' stays a valid value on ExpenseNature only
  // for historical rows entered before this change, still shown/filterable in the list.
  nature: 'Fixe',
  recurrence: 'Ponctuelle',
  paymentMethod: '',
  comment: '',
  attachment: null,
  status: 'En attente',
  createdAt: null,
});

export const createDraftFromExpense = (expense: Expense): DraftExpense => ({
  id: expense.id,
  title: expense.title,
  amount: String(expense.amount),
  date: expense.date,
  categoryId: expense.categoryId,
  nature: expense.nature,
  recurrence: expense.recurrence,
  paymentMethod: expense.paymentMethod,
  comment: expense.comment ?? '',
  attachment: expense.attachment ?? null,
  status: expense.status,
  createdAt: expense.createdAt,
});

export interface ExpenseValidationIssue {
  field: string;
  message: string;
}

export const validateDraftExpense = (draft: DraftExpense, categories: ExpenseCategory[]): ExpenseValidationIssue[] => {
  const issues: ExpenseValidationIssue[] = [];

  if (!draft.title.trim()) issues.push({ field: 'title', message: 'Le titre / objet de la dépense est obligatoire.' });

  const amountNum = Number(draft.amount);
  if (!draft.amount.trim()) issues.push({ field: 'amount', message: 'Le montant est obligatoire.' });
  else if (Number.isNaN(amountNum) || amountNum <= 0) issues.push({ field: 'amount', message: 'Le montant doit être un nombre supérieur à 0.' });

  if (!draft.date) issues.push({ field: 'date', message: 'La date est obligatoire.' });

  if (!draft.categoryId) issues.push({ field: 'categoryId', message: 'La catégorie est obligatoire.' });
  else if (!categories.some((c) => c.id === draft.categoryId)) issues.push({ field: 'categoryId', message: 'Catégorie invalide.' });

  if (!draft.paymentMethod) issues.push({ field: 'paymentMethod', message: 'Le mode de paiement est obligatoire.' });

  return issues;
};

export const buildExpenseFromDraft = (draft: DraftExpense): Expense => ({
  id: draft.id,
  title: draft.title.trim(),
  amount: Number(draft.amount),
  date: draft.date,
  categoryId: draft.categoryId,
  nature: draft.nature,
  recurrence: draft.recurrence,
  paymentMethod: draft.paymentMethod as ExpensePaymentMethod,
  status: draft.status,
  comment: draft.comment.trim() || undefined,
  attachment: draft.attachment ?? undefined,
  createdAt: draft.createdAt ?? new Date().toISOString(),
});
