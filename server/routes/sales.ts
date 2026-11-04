import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { fromJson, toJson } from '../db/json.js';
import { asyncHandler, ApiError, notFound } from '../middleware/errors.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';
import type { SaleItem, SaleTransaction } from '../../src/data/salesTransactions.js';
import type { CatalogArticle } from '../../src/data/manualSalesCatalog.js';
import { accumulateRecipeConsumption } from '../../src/data/productsModel.js';
import { normalizeKey } from '../../src/data/textUtils.js';
import { getAllArticlesRaw, getAllSubRecipesRaw, getAllExtrasRaw } from './productCatalog.js';
import { getAllProducts, postEntries, cancelLedgerEntryById, getLedgerEntryIdsBySource, type LedgerEntryInput } from './stock.js';
import { resolveEffectiveEmployeeName } from '../lib/employeeSelection.js';

interface SaleRow {
  id: number; sale_number: string; service_type: string; table_or_area: string; items: string;
  items_count: number; items_summary: string; payment_method: string; barista: string; total_amount: number;
  date: string; time: string; month: string; year: number; status: string; note: string | null;
}
const rowToSale = (r: SaleRow): SaleTransaction => {
  const items = fromJson<SaleItem[]>(r.items, []);
  return {
    id: r.id, saleNumber: r.sale_number, serviceType: r.service_type as SaleTransaction['serviceType'],
    tableOrArea: r.table_or_area, items, itemsCount: r.items_count,
    itemsSummary: r.items_summary, paymentMethod: r.payment_method as SaleTransaction['paymentMethod'],
    barista: r.barista, totalAmount: r.total_amount,
    // Derived, not stored: the pre-rounding sum of the items is always fully recoverable from
    // their own (full-precision) price/qty, so there's no separate column to keep in sync.
    preciseAmount: items.reduce((s, it) => s + it.qty * it.price, 0),
    date: r.date, time: r.time, month: r.month, year: r.year,
    status: r.status as SaleTransaction['status'],
    note: r.note ?? undefined,
  };
};

const saleItemSchema = z.object({
  name: z.string(),
  qty: z.number(),
  price: z.number(),
  category: z.string(),
  vatRate: z.number().min(0).max(1).optional(),
  netAmount: z.number().optional(),
  taxAmount: z.number().optional(),
  extraIds: z.array(z.string()).optional(),
});

const saleSchema = z.object({
  saleNumber: z.string().min(1),
  serviceType: z.enum(['Sur place', 'À emporter']),
  tableOrArea: z.string().min(1),
  items: z.array(saleItemSchema).min(1),
  itemsCount: z.number(),
  itemsSummary: z.string(),
  paymentMethod: z.enum(['Espèces', 'Carte bancaire', 'Ticket resto']),
  barista: z.string().min(1),
  totalAmount: z.number(),
  date: z.string(),
  time: z.string(),
  month: z.string(),
  year: z.number(),
  status: z.enum(['Payé', 'Remboursé']).default('Payé'),
  note: z.string().trim().max(1000).optional(),
});

// A SaleItem only carries its display name (possibly suffixed with a variant/extra label, e.g.
// "Cappuccino (Grand, Chantilly)") — not an articleId — so it's matched back to its CatalogArticle
// the same way computeTheoreticalConsumption already does: exact name match first, then a
// startsWith fallback for suffixed names.
const resolveArticleForSaleItem = (item: SaleItem, articles: CatalogArticle[]): CatalogArticle | undefined =>
  articles.find((a) => normalizeKey(a.name) === normalizeKey(item.name)) ??
  articles.find((a) => normalizeKey(item.name).startsWith(normalizeKey(a.name)));

// Recursively expands every sold item's recipe (ingredients, sub-recipes, and composed products —
// see manualSalesCatalog.RecipeLine) — plus the recipe of every extra selected on that item, if it
// has one (e.g. "Chantilly" -> crème fraîche) — into raw ingredient quantities, then posts a single
// 'Sortie' stock movement per ingredient via the exact same postEntries() the manual Stock module
// uses. Deliberately defensive: a product/extra with no recipe, or an ingredient that no longer
// exists, is silently skipped rather than thrown — a sale must never fail because of a stock/recipe
// data gap.
const deductStockForSale = (items: SaleItem[], performedBy: string, saleId: number): void => {
  const articles = getAllArticlesRaw();
  const subRecipes = getAllSubRecipesRaw();
  const extras = getAllExtrasRaw();
  const products = getAllProducts();

  const consumption = new Map<string, number>();
  items.forEach((item) => {
    const article = resolveArticleForSaleItem(item, articles);
    if (article?.recipe && article.recipe.length > 0) {
      accumulateRecipeConsumption(article.recipe, item.qty, products, subRecipes, articles, consumption, new Set());
    }
    item.extraIds?.forEach((extraId) => {
      const extra = extras.find((e) => e.id === extraId);
      if (extra?.recipe && extra.recipe.length > 0) {
        accumulateRecipeConsumption(extra.recipe, item.qty, products, subRecipes, articles, consumption, new Set());
      }
    });
  });
  if (consumption.size === 0) return;

  const inputs: LedgerEntryInput[] = [];
  consumption.forEach((qty, productId) => {
    if (qty <= 0) return;
    if (!products.some((p) => p.id === productId)) return;
    inputs.push({
      type: 'Sortie',
      productId,
      zone: 'Réserve principale',
      quantityDelta: -qty,
      reason: 'Vente',
      performedBy,
      // Tagged so a later refund (see POST /transactions/:id/refund) can find and cancel exactly
      // these entries, instead of string-matching the reason/comment.
      sourceType: 'sale',
      sourceId: String(saleId),
    });
  });
  if (inputs.length > 0) postEntries(inputs);
};

// Sales used to auto-log their VAT as a "Taxes et frais" expense on every paid sale — removed: it
// duplicated the same figure already shown, informationally, in Calcul du quotidien (analyse
// comptable HT/TVA) and Rapport fiscal, and cluttered Gestion des dépenses with entries the user
// never entered themselves. reverseSaleSideEffects still rejects any such row left over from
// before this change, on refund, so historical data stays consistent; see also the one-off cleanup
// in server/db/migrations (removes existing sale_vat rows).
const reverseSaleSideEffects = (saleId: number, performedBy: string, saleNumber: string): void => {
  getLedgerEntryIdsBySource('sale', String(saleId)).forEach((ledgerId) => {
    cancelLedgerEntryById(ledgerId, performedBy, `Remboursement de la vente ${saleNumber}`);
  });
  const expenseRows = db.prepare(
    "SELECT id, comment FROM expenses WHERE source_type = 'sale_vat' AND source_id = ? AND status != 'Rejeté'"
  ).all(String(saleId)) as { id: string; comment: string | null }[];
  expenseRows.forEach((row) => {
    db.prepare('UPDATE expenses SET status = ?, comment = ? WHERE id = ?').run(
      'Rejeté',
      `${row.comment ?? ''} — Annulée suite au remboursement de la vente ${saleNumber}.`.trim(),
      row.id
    );
  });
};

export const salesRouter = Router();
salesRouter.use(requireAuth);

salesRouter.get('/transactions', requirePermission('sales:view'), asyncHandler((_req, res) => {
  const rows = db.prepare('SELECT * FROM sales_transactions ORDER BY id DESC').all() as SaleRow[];
  res.json(rows.map(rowToSale));
}));

salesRouter.post('/transactions', requirePermission('sales:create'), asyncHandler((req, res) => {
  const body = z.object({ tickets: z.array(saleSchema).min(1) }).parse(req.body);
  body.tickets.forEach((t) => resolveEffectiveEmployeeName(req.user!, t.barista));
  const tx = db.transaction(() => {
    const maxRow = db.prepare('SELECT MAX(id) as maxId FROM sales_transactions').get() as { maxId: number | null };
    let nextId = (maxRow.maxId ?? 0) + 1;
    const created: SaleTransaction[] = [];
    for (const t of body.tickets) {
      const id = nextId++;
      db.prepare(
        `INSERT INTO sales_transactions (id, sale_number, service_type, table_or_area, items, items_count, items_summary,
         payment_method, barista, total_amount, date, time, month, year, status, note)
         VALUES (@id, @sale_number, @service_type, @table_or_area, @items, @items_count, @items_summary,
         @payment_method, @barista, @total_amount, @date, @time, @month, @year, @status, @note)`
      ).run({
        id, sale_number: t.saleNumber, service_type: t.serviceType, table_or_area: t.tableOrArea, items: toJson(t.items),
        items_count: t.itemsCount, items_summary: t.itemsSummary, payment_method: t.paymentMethod, barista: t.barista,
        total_amount: t.totalAmount, date: t.date, time: t.time, month: t.month, year: t.year, status: t.status,
        note: t.note ?? null,
      });
      if (t.status === 'Payé') {
        deductStockForSale(t.items, req.user!.fullName, id);
        // No auto "TVA collectée" expense is recorded any more — it duplicated the same figure
        // already shown, informationally, in Calcul du quotidien and Rapport fiscal, and cluttered
        // Gestion des dépenses with entries the user never entered themselves.
      }
      created.push({ ...t, id });
    }
    return created;
  });
  const created = tx();
  recordActivity('Ventes', 'Création', `${created.length} vente(s) enregistrée(s)`, req.user!.fullName);
  res.status(201).json(created);
}));

// Reverses a paid sale: cancels the stock it consumed, rejects the VAT expense it generated, and
// flips its status to Remboursé — the three side effects of a sale (revenue, stock, tax expense)
// are undone together, never piecemeal, so a refunded sale can never leave stock/expenses
// overstated even though the sale itself was reversed.
salesRouter.post('/transactions/:id/refund', requirePermission('sales:refund'), asyncHandler((req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) throw notFound('Vente');
  const row = db.prepare('SELECT * FROM sales_transactions WHERE id = ?').get(id) as SaleRow | undefined;
  if (!row) throw notFound('Vente');
  const sale = rowToSale(row);
  if (sale.status === 'Remboursé') throw new ApiError(409, 'Cette vente est déjà remboursée.');

  const tx = db.transaction(() => {
    reverseSaleSideEffects(id, req.user!.fullName, sale.saleNumber);
    db.prepare('UPDATE sales_transactions SET status = ? WHERE id = ?').run('Remboursé', id);
  });
  tx();
  recordActivity('Ventes', 'Remboursement', `Vente remboursée — ${sale.saleNumber}`, req.user!.fullName);
  res.json(rowToSale({ ...row, status: 'Remboursé' }));
}));
