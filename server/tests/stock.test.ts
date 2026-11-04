import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { key, startTestServer, type ApiClient, type TestContext } from './helpers.ts';
import { tunisClock } from '../../src/data/pricing.ts';

let ctx: TestContext;
let boss: ApiClient;
let sessionId = '';
let capId = '';
let capVariant = '';

before(async () => {
  ctx = await startTestServer();
  boss = await ctx.createUser('Direction', 'super-admin');
  const reg = await boss.get('/api/pos/registers');
  sessionId = (await boss.post('/api/pos/cash-sessions', { registerId: reg.body[0].id, openingFloatMil: 0 }, key())).body.id;
  const cap = (await boss.get('/api/pos/catalog')).body.articles.find((a: { name: string }) => a.name === 'Cappuccino');
  capId = cap.id;
  capVariant = cap.variants[0].id;
});
after(async () => {
  await ctx.close();
});

test('consumption sheet: theoretical use from the register, separate from other movements', async () => {
  const sale = await boss.post('/api/pos/sales/counter', { sessionId, serviceType: 'takeaway', lines: [{ articleId: capId, variantId: capVariant, quantity: 3 }] }, key());
  await boss.post(`/api/pos/sales/${sale.body.id}/payments`, { sessionId, method: 'card', amountMil: sale.body.totalMil }, key());
  const report = await boss.get('/api/pos/reports/consumption');
  assert.equal(report.status, 200);
  const milk = report.body.ingredients.find((i: { name: string }) => i.name === 'Lait');
  // 3 × 60 ml, expressed in the ingredient's stock unit
  assert.ok(Math.abs(milk.theoretical - (milk.unit === 'ml' ? 180 : 0.18)) < 1e-9, `${milk.theoretical} ${milk.unit}`);
  assert.ok(milk.estimatedCostMil >= 0);
  assert.equal(report.body.products[0].name, 'Cappuccino');
  assert.equal(report.body.products[0].quantity, 3);
});

test('a day already recorded by the register cannot be imported again by mistake', async () => {
  const today = tunisClock(new Date()).date;
  const ticket = {
    saleNumber: `IMP-${randomUUID().slice(0, 6)}`, serviceType: 'Sur place', tableOrArea: 'Comptoir',
    items: [{ name: 'Cappuccino', qty: 1, price: 3.5, category: 'Café chaud' }], itemsCount: 1, itemsSummary: '1 Cappuccino',
    paymentMethod: 'Espèces', barista: 'Direction', totalAmount: 3.5, date: today, time: '10:00', month: today.slice(0, 7), year: Number(today.slice(0, 4)), status: 'Payé',
  };
  const refused = await boss.post('/api/sales/transactions', { tickets: [ticket] });
  assert.equal(refused.status, 409);
  assert.match(refused.body.error.message, /deux fois/);
  const otherDay = { ...ticket, date: '2026-01-15', month: '2026-01', year: 2026 };
  assert.equal((await boss.post('/api/sales/transactions', { tickets: [otherDay] })).status, 201);
});

test('a variant can consume extra ingredients, and a product form save keeps them', async () => {
  const edit = await boss.get(`/api/pos/catalog/articles/${capId}/variant-recipes`);
  const grand = edit.body.variants.find((v: { label: string }) => v.label === 'Grand');
  const milkId = edit.body.ingredients.find((i: { name: string }) => i.name === 'Lait').id;
  const saved = await boss.put(`/api/pos/catalog/articles/${capId}/variant-recipes`, { variants: [{ id: grand.id, recipe: [{ ingredientId: milkId, quantity: 50, unit: 'ml' }] }] });
  assert.equal(saved.status, 200);
  const stock = () => (ctx.db.prepare('SELECT reserve_qty FROM stock_products WHERE id = ?').get(milkId) as { reserve_qty: number }).reserve_qty;
  const before = stock();
  await boss.post('/api/pos/sales/counter', { sessionId, serviceType: 'takeaway', lines: [{ articleId: capId, variantId: grand.id, quantity: 1 }] }, key());
  const used = before - stock();
  // 60 ml (recipe) + 50 ml (Grand), in the stock unit
  const unit = edit.body.ingredients.find((i: { name: string }) => i.name === 'Lait').unit;
  assert.ok(Math.abs(used - (unit === 'ml' ? 110 : 0.11)) < 1e-9, `${used} ${unit}`);
  // the V1 product form sends variants back: the recipe must survive
  const articles = (await boss.get('/api/catalog-articles')).body as { id: string }[];
  const article = articles.find((a) => a.id === capId)!;
  assert.equal((await boss.put(`/api/catalog-articles/${capId}`, article)).status, 200);
  const row = ctx.db.prepare('SELECT variants FROM catalog_articles WHERE id = ?').get(capId) as { variants: string };
  assert.ok(JSON.parse(row.variants).find((v: { id: string; recipe?: unknown[] }) => v.id === grand.id).recipe.length === 1);
});
