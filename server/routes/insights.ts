import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler, notFound } from '../middleware/errors.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';
import { getAllArticlesRaw, getAllSubRecipesRaw } from './productCatalog.js';
import { getAllProducts } from './stock.js';
import { accumulateRecipeConsumption, computeRecipeCost } from '../../src/data/productsModel.js';
import { tunisClock } from '../../src/data/pricing.js';
import { addDays, forecastDay, mape, menuEngineering, MENU_CLASS_LABELS, reorderQuantity, staffFor } from '../../src/data/insights.js';

// Pilotage (amélioration 09): forecasts, restock suggestions, menu engineering and alerts, computed
// on demand from the register's own data (completed sales). Read-only except supplier pack sizes.

export const insightsRouter = Router();
insightsRouter.use(requireAuth);

const HISTORY_DAYS = 70;

interface SoldRow {
  article_id: string;
  name: string;
  quantity: number;
  net_mil: number;
  vat_rate: number;
  completed_at: string;
  order_at: string;
}

const soldLines = (sinceIso: string): SoldRow[] =>
  db
    .prepare(
      `SELECT l.article_id, l.name, l.quantity, (l.gross_mil - l.item_discount_mil) AS net_mil, COALESCE(l.vat_rate, 0) AS vat_rate, s.completed_at, o.created_at AS order_at
       FROM pos_order_lines l JOIN pos_orders o ON o.id = l.order_id JOIN pos_sales s ON s.id = o.sale_id
       WHERE s.status = 'completed' AND l.status = 'active' AND s.completed_at >= ?`
    )
    .all(sinceIso) as SoldRow[];

const tunisDate = (iso: string) => tunisClock(new Date(iso)).date;

/** Daily quantities per article and in total, over the history window. */
const history = () => {
  const today = tunisClock(new Date()).date;
  const rows = soldLines(new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString());
  const perArticle = new Map<string, { name: string; daily: Map<string, number> }>();
  const total = new Map<string, number>();
  const revenue = new Map<string, number>();
  const ordersByHour = new Map<string, Set<string>>(); // "date|hour" → order timestamps
  let first: string | null = null;
  for (const r of rows) {
    const date = tunisDate(r.completed_at);
    if (date >= today) continue; // today is not complete yet
    if (!first || date < first) first = date;
    const a = perArticle.get(r.article_id) ?? { name: r.name, daily: new Map() };
    a.daily.set(date, (a.daily.get(date) ?? 0) + r.quantity);
    perArticle.set(r.article_id, a);
    total.set(date, (total.get(date) ?? 0) + r.quantity);
    revenue.set(date, (revenue.get(date) ?? 0) + r.net_mil);
    const c = tunisClock(new Date(r.order_at));
    const key = `${c.date}|${c.time.slice(0, 2)}`;
    const set = ordersByHour.get(key) ?? new Set();
    set.add(r.order_at);
    ordersByHour.set(key, set);
  }
  return { today, first, perArticle, total, revenue, ordersByHour };
};

type History = ReturnType<typeof history>;

const forecastArticles = (h: History, from: string, days: number): Map<string, number> => {
  const out = new Map<string, number>();
  h.perArticle.forEach((a, id) => {
    let qty = 0;
    for (let d = 0; d < days; d += 1) qty += forecastDay(a.daily, addDays(from, d), h.first);
    if (qty > 0) out.set(id, qty);
  });
  return out;
};

const ingredientNeeds = (perArticle: Map<string, number>): Map<string, number> => {
  const articles = getAllArticlesRaw();
  const subRecipes = getAllSubRecipesRaw();
  const products = getAllProducts();
  const need = new Map<string, number>();
  perArticle.forEach((qty, id) => {
    const recipe = articles.find((a) => a.id === id)?.recipe;
    if (recipe?.length) accumulateRecipeConsumption(recipe, qty, products, subRecipes, articles, need, new Set());
  });
  return need;
};

/** Quantities still expected from suppliers (ordered, minus what was already received). */
const onOrder = (): Map<string, number> => {
  const out = new Map<string, number>();
  const orders = db.prepare("SELECT id, lines FROM purchase_orders WHERE status IN ('Commandée', 'Partiellement reçue')").all() as { id: string; lines: string }[];
  for (const o of orders) {
    const received = new Map<string, number>();
    (db.prepare('SELECT lines FROM purchase_receptions WHERE purchase_order_id = ?').all(o.id) as { lines: string }[]).forEach((r) =>
      (JSON.parse(r.lines) as { lineId: string; quantityReceived: number }[]).forEach((l) => received.set(l.lineId, (received.get(l.lineId) ?? 0) + l.quantityReceived))
    );
    (JSON.parse(o.lines) as { id: string; productId: string; quantity: number }[]).forEach((l) => {
      const left = l.quantity - (received.get(l.id) ?? 0);
      if (left > 0) out.set(l.productId, (out.get(l.productId) ?? 0) + left);
    });
  }
  return out;
};

const packSizes = () => new Map((db.prepare('SELECT product_id, pack_size, lead_days FROM stock_reorder_settings').all() as { product_id: string; pack_size: number | null; lead_days: number | null }[]).map((r) => [r.product_id, r]));

// --- Forecast ---------------------------------------------------------------------------------------

insightsRouter.get('/insights/forecast', requirePermission('insights:view'), asyncHandler((_req, res) => {
  const h = history();
  const tomorrow = addDays(h.today, 1);
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(h.today, i);
    return { date, items: Math.round(forecastDay(h.total, date, h.first)), revenueMil: Math.round(forecastDay(h.revenue, date, h.first)) };
  });
  // Backtest: how far the same model was from reality over the last 14 complete days.
  const backtest = Array.from({ length: 14 }, (_, i) => addDays(h.today, -14 + i))
    .filter((d) => h.first && d >= h.first)
    .map((d) => ({ date: d, actual: h.total.get(d) ?? 0, predicted: forecastDay(h.total, d, h.first) }));
  const week = forecastArticles(h, h.today, 7);
  const tomorrowItems = forecastArticles(h, tomorrow, 1);
  const top = [...week.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([id, qty]) => ({ articleId: id, name: h.perArticle.get(id)!.name, tomorrow: Math.round((tomorrowItems.get(id) ?? 0) * 10) / 10, week: Math.round(qty) }));
  // Staffing for tomorrow: average orders for that weekday and hour, over the history.
  const weekday = tunisClock(new Date(`${tomorrow}T12:00:00Z`)).weekday;
  const perHour = new Map<string, number[]>();
  h.ordersByHour.forEach((set, key) => {
    const [date, hour] = key.split('|');
    if (tunisClock(new Date(`${date}T12:00:00Z`)).weekday !== weekday) return;
    perHour.set(hour, [...(perHour.get(hour) ?? []), set.size]);
  });
  const sameWeekdays = new Set([...h.ordersByHour.keys()].map((k) => k.split('|')[0]).filter((d) => tunisClock(new Date(`${d}T12:00:00Z`)).weekday === weekday)).size || 1;
  const staffing = [...perHour.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, counts]) => {
      const orders = counts.reduce((s, c) => s + c, 0) / sameWeekdays;
      return { hour: `${hour}h`, orders: Math.round(orders * 10) / 10, staff: staffFor(orders) };
    });
  res.json({ historyFrom: h.first, days, mape: mape(backtest), backtest, top, staffing, tomorrow });
}));

// --- Restock suggestions ----------------------------------------------------------------------------

insightsRouter.get('/insights/reorder', requirePermission('insights:view'), asyncHandler((req, res) => {
  const { horizon } = z.object({ horizon: z.coerce.number().int().min(1).max(30).default(7) }).parse(req.query);
  const h = history();
  const settings = packSizes();
  const ordered = onOrder();
  const products = getAllProducts();
  const needCache = new Map<number, Map<string, number>>();
  const needFor = (days: number) => {
    if (!needCache.has(days)) needCache.set(days, ingredientNeeds(forecastArticles(h, h.today, days)));
    return needCache.get(days)!;
  };
  const rows = products
    .map((p) => {
      const s = settings.get(p.id);
      const days = s?.lead_days ?? horizon;
      const need = needFor(days).get(p.id) ?? 0;
      const stock = p.reserveQty + p.depotQty;
      const suggested = reorderQuantity({ need, stock, onOrder: ordered.get(p.id) ?? 0, minThreshold: p.minThreshold, packSize: s?.pack_size });
      const perDay = (needFor(horizon).get(p.id) ?? 0) / horizon;
      return {
        productId: p.id,
        name: p.name,
        unit: p.unit,
        stock: Math.round(stock * 1000) / 1000,
        minThreshold: p.minThreshold,
        need: Math.round(need * 1000) / 1000,
        onOrder: ordered.get(p.id) ?? 0,
        packSize: s?.pack_size ?? null,
        leadDays: days,
        suggested,
        daysLeft: perDay > 0 ? Math.floor(stock / perDay) : null,
        costDt: Math.round(suggested * p.averageCost * 1000) / 1000,
      };
    })
    .filter((r) => r.need > 0 || r.stock < r.minThreshold || r.suggested > 0)
    .sort((a, b) => b.suggested - a.suggested || (a.daysLeft ?? 999) - (b.daysLeft ?? 999));
  res.json({ horizon, rows });
}));

insightsRouter.put('/insights/reorder/:productId', requirePermission('insights:view'), asyncHandler((req, res) => {
  const body = z.object({ packSize: z.number().positive().max(100_000).nullable(), leadDays: z.number().int().min(1).max(60).nullable() }).parse(req.body);
  const product = getAllProducts().find((p) => p.id === req.params.productId);
  if (!product) throw notFound('Produit');
  db.prepare(
    `INSERT INTO stock_reorder_settings (product_id, pack_size, lead_days, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(product_id) DO UPDATE SET pack_size = excluded.pack_size, lead_days = excluded.lead_days, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
  ).run(product.id, body.packSize, body.leadDays, req.user!.fullName, new Date().toISOString());
  recordActivity('Stock', 'Conditionnement fournisseur', `${product.name} : ${body.packSize ?? '—'} ${product.unit}, délai ${body.leadDays ?? '—'} j`, req.user!.fullName, { userId: req.user!.id, entityType: 'stock_product', entityId: product.id });
  res.json({ ok: true });
}));

// --- Menu engineering -------------------------------------------------------------------------------

insightsRouter.get('/insights/menu', requirePermission('insights:view'), asyncHandler((req, res) => {
  const { days } = z.object({ days: z.coerce.number().int().min(7).max(180).default(30) }).parse(req.query);
  const rows = soldLines(new Date(Date.now() - days * 86_400_000).toISOString());
  const articles = getAllArticlesRaw();
  const subRecipes = getAllSubRecipesRaw();
  const products = getAllProducts();
  const agg = new Map<string, { name: string; quantity: number; revenueHtMil: number }>();
  rows.forEach((r) => {
    const a = agg.get(r.article_id) ?? { name: r.name, quantity: 0, revenueHtMil: 0 };
    a.quantity += r.quantity;
    a.revenueHtMil += r.net_mil / (1 + r.vat_rate);
    agg.set(r.article_id, a);
  });
  const items = [...agg.entries()].map(([id, a]) => {
    const article = articles.find((x) => x.id === id);
    const cost = article?.recipe?.length ? computeRecipeCost(article.recipe, products, subRecipes, articles) : null;
    const unitCostMil = cost ? Math.round(cost.cost * 1000) : 0;
    const unitPriceHtMil = Math.round(a.revenueHtMil / a.quantity);
    return {
      articleId: id,
      name: a.name,
      category: article?.category ?? '',
      quantity: a.quantity,
      unitPriceHtMil,
      unitCostMil,
      costKnown: Boolean(cost && cost.errors.length === 0),
      unitMarginMil: unitPriceHtMil - unitCostMil,
      foodCostRate: unitPriceHtMil > 0 ? unitCostMil / unitPriceHtMil : null,
    };
  });
  res.json({ days, classes: MENU_CLASS_LABELS, items: menuEngineering(items).sort((a, b) => b.quantity - a.quantity) });
}));

// --- Alerts -------------------------------------------------------------------------------------------

insightsRouter.get('/insights/alerts', requirePermission('insights:view'), asyncHandler((_req, res) => {
  const alerts: { level: 'high' | 'medium'; kind: string; title: string; detail: string }[] = [];
  const h = history();
  const need3 = ingredientNeeds(forecastArticles(h, h.today, 3));
  const ordered = onOrder();
  for (const p of getAllProducts()) {
    const stock = p.reserveQty + p.depotQty;
    const after = stock + (ordered.get(p.id) ?? 0) - (need3.get(p.id) ?? 0);
    if (stock <= 0 && (need3.get(p.id) ?? 0) > 0) alerts.push({ level: 'high', kind: 'stock', title: `Rupture : ${p.name}`, detail: `Stock épuisé, besoin prévu ${round(need3.get(p.id)!)} ${p.unit} sur 3 jours.` });
    else if (after < p.minThreshold && (need3.get(p.id) ?? 0) > 0) alerts.push({ level: 'medium', kind: 'stock', title: `Sous le seuil d’ici 3 jours : ${p.name}`, detail: `Stock ${round(stock)} ${p.unit}, besoin prévu ${round(need3.get(p.id)!)} ${p.unit}, seuil ${p.minThreshold}.` });
  }
  const since = new Date(Date.now() - 86_400_000).toISOString();
  (db.prepare('SELECT requester_name AS name, COUNT(*) AS n FROM cancellation_requests WHERE created_at >= ? GROUP BY requester_id HAVING n >= 3').all(since) as { name: string; n: number }[]).forEach((r) =>
    alerts.push({ level: 'medium', kind: 'cancellations', title: `Annulations répétées : ${r.name}`, detail: `${r.n} demandes d’annulation en 24 h.` })
  );
  const week = new Date(Date.now() - 7 * 86_400_000).toISOString();
  (db.prepare("SELECT closed_by, closed_at, expected_cash_mil, counted_cash_mil FROM cash_sessions WHERE status = 'closed' AND closed_at >= ? AND counted_cash_mil IS NOT NULL").all(week) as { closed_by: string; closed_at: string; expected_cash_mil: number; counted_cash_mil: number }[])
    .filter((s) => Math.abs(s.counted_cash_mil - s.expected_cash_mil) >= 5_000)
    .forEach((s) => alerts.push({ level: 'high', kind: 'cash', title: `Écart de caisse ${((s.counted_cash_mil - s.expected_cash_mil) / 1000).toFixed(3)} DT`, detail: `Clôture du ${tunisDate(s.closed_at)} par ${s.closed_by}.` }));
  (db.prepare("SELECT name, date, time, people FROM reservations WHERE date BETWEEN ? AND ? AND people >= 10 AND status IN ('pending', 'confirmed')").all(h.today, addDays(h.today, 2)) as { name: string; date: string; time: string; people: number }[]).forEach((r) =>
    alerts.push({ level: 'medium', kind: 'group', title: `Groupe de ${r.people} personnes`, detail: `${r.name}, le ${r.date} à ${r.time} : prévoir l’équipe et le stock.` })
  );
  res.json(alerts.sort((a, b) => (a.level === b.level ? 0 : a.level === 'high' ? -1 : 1)));
}));

const round = (v: number) => Math.round(v * 100) / 100;
