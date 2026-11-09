import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { addDays, forecastDay, mape, menuEngineering, reorderQuantity, staffFor } from '../../src/data/insights.ts';
import { key, startTestServer, type ApiClient, type TestContext } from './helpers.ts';

let ctx: TestContext;
let boss: ApiClient;
let cashier: ApiClient;
let croissant = '';
let flour = '';
let sessionId = '';

before(async () => {
  ctx = await startTestServer();
  boss = await ctx.createUser('Direction', 'super-admin');
  cashier = await ctx.createUser('Caisse', ['pos:sell', 'pos:collect']);
  flour = randomUUID();
  ctx.db
    .prepare("INSERT INTO stock_products (id, name, sku, category, unit, min_threshold, target_stock, lot_tracked, average_cost, reserve_qty, depot_qty) VALUES (?, 'Farine', 'FAR', 'Épicerie', 'kg', 1, 10, 0, 2.5, 2, 0)")
    .run(flour);
  croissant = randomUUID();
  const recipe = JSON.stringify([{ id: 'r1', kind: 'ingredient', ingredientId: flour, quantity: 100, unit: 'g' }]);
  ctx.db.prepare("INSERT INTO catalog_articles (id, name, category, price, recipe, created_at) VALUES (?, 'Croissant', 'Viennoiserie', 2.0, ?, '2026-01-01')").run(croissant, recipe);
  const reg = await boss.get('/api/pos/registers');
  sessionId = (await boss.post('/api/pos/cash-sessions', { registerId: reg.body[0].id, openingFloatMil: 0 }, key())).body.id;
});
after(async () => {
  await ctx.close();
});

test('models: weekday forecast, error, reorder rounding, menu classes, staffing', () => {
  const daily = new Map([
    ['2026-10-31', 10],
    ['2026-11-07', 20],
  ]);
  // Saturday 14 Nov: last Saturday weighs 8, the one before 7; earlier weeks are before the first sale.
  assert.equal(Math.round(forecastDay(daily, '2026-11-14', '2026-10-31') * 100) / 100, Math.round(((20 * 8 + 10 * 7) / 15) * 100) / 100);
  assert.equal(forecastDay(daily, '2026-11-14', null), 0);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(Math.round(mape([{ actual: 100, predicted: 90 }, { actual: 50, predicted: 60 }, { actual: 0, predicted: 5 }])! * 1000) / 1000, 0.15);
  assert.equal(reorderQuantity({ need: 120, stock: 20, onOrder: 0, minThreshold: 0, packSize: 50 }), 100);
  assert.equal(reorderQuantity({ need: 10, stock: 20, onOrder: 0, minThreshold: 5, packSize: 50 }), 0);
  const classes = menuEngineering([
    { id: 'a', quantity: 100, unitMarginMil: 5_000 },
    { id: 'b', quantity: 100, unitMarginMil: 1_000 },
    { id: 'c', quantity: 5, unitMarginMil: 9_000 },
    { id: 'd', quantity: 5, unitMarginMil: 500 },
  ]).map((i) => i.class);
  assert.deepEqual(classes, ['star', 'plowhorse', 'puzzle', 'dog']);
  assert.equal(staffFor(30), 3);
});

test('forecast, restock suggestion and menu from register sales; Direction only', async () => {
  assert.equal((await cashier.get('/api/pos/insights/forecast')).status, 403);
  // 30 croissants sold 6 days ago (same weekday as tomorrow)
  const sale = await cashier.post('/api/pos/sales/counter', { sessionId, serviceType: 'takeaway', lines: [{ articleId: croissant, quantity: 30 }] }, key());
  await cashier.post(`/api/pos/sales/${sale.body.id}/payments`, { sessionId, method: 'card', amountMil: 60_000 }, key());
  const past = new Date(Date.now() - 6 * 86_400_000).toISOString();
  ctx.db.prepare('UPDATE pos_sales SET completed_at = ? WHERE id = ?').run(past, sale.body.id);
  ctx.db.prepare('UPDATE pos_orders SET created_at = ? WHERE sale_id = ?').run(past, sale.body.id);

  const f = await boss.get('/api/pos/insights/forecast');
  assert.equal(f.status, 200);
  const top = f.body.top.find((t: { name: string }) => t.name === 'Croissant');
  assert.equal(top.tomorrow, 30);
  assert.equal(top.week, 30);

  // 30 croissants × 100 g = 3 kg needed over 7 days; 2 kg in stock, threshold 1 kg → 2 kg; pack of 5 kg → 5
  await boss.put(`/api/pos/insights/reorder/${flour}`, { packSize: 5, leadDays: null });
  const r = await boss.get('/api/pos/insights/reorder?horizon=7');
  const row = r.body.rows.find((x: { productId: string }) => x.productId === flour);
  assert.equal(row.need, 3);
  assert.equal(row.suggested, 5);

  const menu = await boss.get('/api/pos/insights/menu?days=30');
  const item = menu.body.items.find((i: { name: string }) => i.name === 'Croissant');
  assert.equal(item.quantity, 30);
  assert.equal(item.unitCostMil, 250);
  assert.equal(item.class, 'star');

  const alerts = await boss.get('/api/pos/insights/alerts');
  assert.equal(alerts.status, 200);
});
