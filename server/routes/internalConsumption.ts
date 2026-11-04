import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { fromJson, toJson } from '../db/json.js';
import { asyncHandler } from '../middleware/errors.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';
import { accumulateRecipeConsumption } from '../../src/data/productsModel.js';
import { getAllArticlesRaw, getAllSubRecipesRaw } from './productCatalog.js';
import { getAllProducts, postEntries, type LedgerEntryInput } from './stock.js';
import { resolveEffectiveEmployeeName } from '../lib/employeeSelection.js';

export interface InternalConsumptionItem {
  name: string;
  qty: number;
}

export interface InternalConsumption {
  id: string;
  employee: string;
  items: InternalConsumptionItem[];
  itemsSummary: string;
  date: string;
  time: string;
  comment?: string;
  performedBy: string;
  createdAt: string;
}

interface ConsumptionRow {
  id: string;
  employee: string;
  items: string;
  items_summary: string;
  date: string;
  time: string;
  comment: string | null;
  performed_by: string;
  created_at: string;
}

const rowToConsumption = (r: ConsumptionRow): InternalConsumption => ({
  id: r.id,
  employee: r.employee,
  items: fromJson<InternalConsumptionItem[]>(r.items, []),
  itemsSummary: r.items_summary,
  date: r.date,
  time: r.time,
  comment: r.comment ?? undefined,
  performedBy: r.performed_by,
  createdAt: r.created_at,
});

const itemSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  qty: z.number().positive(),
});

const bodySchema = z.object({
  employee: z.string().min(1),
  items: z.array(itemSchema).min(1),
  comment: z.string().trim().max(500).optional(),
});

export const internalConsumptionRouter = Router();
internalConsumptionRouter.use(requireAuth);

internalConsumptionRouter.get('/', requirePermission('sales:create'), asyncHandler((_req, res) => {
  const rows = db.prepare('SELECT * FROM internal_consumptions ORDER BY created_at DESC').all() as ConsumptionRow[];
  res.json(rows.map(rowToConsumption));
}));

internalConsumptionRouter.post('/', requirePermission('sales:create'), asyncHandler((req, res) => {
  const body = bodySchema.parse(req.body);
  resolveEffectiveEmployeeName(req.user!, body.employee);
  const now = new Date();

  const tx = db.transaction(() => {
    const id = randomUUID();
    const items: InternalConsumptionItem[] = body.items.map((i) => ({ name: i.name, qty: i.qty }));
    const itemsSummary = items.map((i) => `${i.qty}x ${i.name}`).join(', ');
    const row: ConsumptionRow = {
      id,
      employee: body.employee,
      items: toJson(items),
      items_summary: itemsSummary,
      date: now.toISOString().slice(0, 10),
      time: now.toTimeString().slice(0, 5),
      comment: body.comment ?? null,
      performed_by: req.user!.fullName,
      created_at: now.toISOString(),
    };
    db.prepare(
      `INSERT INTO internal_consumptions (id, employee, items, items_summary, date, time, comment, performed_by, created_at)
       VALUES (@id, @employee, @items, @items_summary, @date, @time, @comment, @performed_by, @created_at)`
    ).run(row);

    // Same recipe expansion a real sale uses (see sales.ts deductStockForSale) — ingredients only,
    // finished products themselves are never stock-tracked. An item whose product has no recipe
    // (or references ingredients that no longer exist) is silently skipped, same defensive rule as
    // a sale: this record must never fail to save because of a stock/recipe data gap.
    const articles = getAllArticlesRaw();
    const subRecipes = getAllSubRecipesRaw();
    const products = getAllProducts();
    const consumption = new Map<string, number>();
    body.items.forEach((item) => {
      const article = articles.find((a) => a.id === item.productId);
      if (!article?.recipe || article.recipe.length === 0) return;
      accumulateRecipeConsumption(article.recipe, item.qty, products, subRecipes, articles, consumption, new Set());
    });

    if (consumption.size > 0) {
      const inputs: LedgerEntryInput[] = [];
      consumption.forEach((qty, productId) => {
        if (qty <= 0) return;
        if (!products.some((p) => p.id === productId)) return;
        inputs.push({
          type: 'Sortie',
          productId,
          zone: 'Réserve principale',
          quantityDelta: -qty,
          reason: 'Consommation interne',
          comment: `Consommation interne — ${body.employee} (${itemsSummary})`,
          performedBy: req.user!.fullName,
          sourceType: 'internal_consumption',
          sourceId: id,
        });
      });
      if (inputs.length > 0) postEntries(inputs);
    }

    return rowToConsumption(row);
  });

  const created = tx();
  recordActivity(
    'Ventes',
    'Création',
    `Consommation interne enregistrée — ${body.employee} (${created.itemsSummary})`,
    req.user!.fullName
  );
  res.status(201).json(created);
}));
