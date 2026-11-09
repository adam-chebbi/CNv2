import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { equalShares } from '../../src/data/splitBill.ts';
import { key, startTestServer, type ApiClient, type TestContext } from './helpers.ts';

let ctx: TestContext;
let boss: ApiClient;
let cashier: ApiClient;
let sessionId = '';
let tableId = '';
let pizza = '';
let coffee = '';
let sami = '';

before(async () => {
  ctx = await startTestServer();
  boss = await ctx.createUser('Direction', 'super-admin');
  cashier = await ctx.createUser('Caisse', ['pos:sell', 'pos:collect', 'floor:view']);
  pizza = randomUUID();
  coffee = randomUUID();
  ctx.db.prepare("INSERT INTO catalog_articles (id, name, category, price, created_at) VALUES (?, 'Pizza', 'Snack', 14.0, '2026-01-01')").run(pizza);
  ctx.db.prepare("INSERT INTO catalog_articles (id, name, category, price, created_at) VALUES (?, 'Express', 'Café', 2.0, '2026-01-01')").run(coffee);
  sami = randomUUID();
  ctx.db.prepare("INSERT INTO customers (id, first_name, last_name, email, status, created_at, updated_at) VALUES (?, 'Sami', 'B.', 'sami@example.com', 'active', '2026-01-01', '2026-01-01')").run(sami);
  await boss.put('/api/pos/loyalty/settings', { enabled: true, pointsPerDt: 1, excludedCategories: [], excludedArticleIds: [], validityDays: 0 });
  const reg = await boss.get('/api/pos/registers');
  sessionId = (await boss.post('/api/pos/cash-sessions', { registerId: reg.body[0].id, openingFloatMil: 0 }, key())).body.id;
  const area = await boss.post('/api/pos/floor/areas', { name: 'Salle' });
  tableId = (await boss.post('/api/pos/floor/tables', { areaId: area.body.id, name: 'T5', shape: 'square', capacity: 4, x: 0, y: 0, width: 80, height: 80 })).body.id;
});
after(async () => {
  await ctx.close();
});

const tableBill = async (lines: { articleId: string; quantity: number }[]) => {
  const visit = (await boss.post('/api/pos/visits', { tableId, covers: 4 })).body.id;
  const placed = await boss.post(`/api/pos/visits/${visit}/orders`, { lines }, key());
  const sale = placed.body.sales.find((s: { status: string }) => s.status === 'open');
  return { visit, sale };
};

test('equal shares are exact to the millime', () => {
  assert.deepEqual(equalShares(10_000, 3), [3_334, 3_333, 3_333]);
  assert.equal(equalShares(123_457, 7).reduce((a, b) => a + b, 0), 123_457);
});

test('split by item: each payer settles their part, gets their receipt and their points', async () => {
  const { visit, sale } = await tableBill([{ articleId: pizza, quantity: 1 }, { articleId: coffee, quantity: 2 }]);
  const lines = sale.orders[0].lines as { id: string; name: string }[];
  const pizzaLine = lines.find((l) => l.name === 'Pizza')!.id;
  const coffeeLine = lines.find((l) => l.name === 'Express')!.id;

  assert.equal((await cashier.post(`/api/pos/sales/${sale.id}/split`, { mode: 'items', parts: [{ lineIds: [pizzaLine] }, { lineIds: [pizzaLine] }] })).status, 400, 'one line, one part');
  const split = await cashier.post(`/api/pos/sales/${sale.id}/split`, { mode: 'items', parts: [{ lineIds: [coffeeLine], customerId: sami, label: 'Sami' }] });
  assert.equal(split.status, 201);
  assert.deepEqual(split.body.map((p: { amountMil: number }) => p.amountMil), [4_000, 14_000], 'unassigned items become the last part');
  assert.equal(split.body[1].label, 'Reste');

  assert.equal((await cashier.post(`/api/pos/sales/${sale.id}/payments`, { sessionId, method: 'card', amountMil: 18_000 }, key())).status, 409, 'whole-bill payment refused once split');
  assert.equal((await cashier.post(`/api/pos/sales/${sale.id}/splits/${split.body[0].id}/payments`, { sessionId, method: 'card', amountMil: 5_000 }, key())).status, 400);

  const first = await cashier.post(`/api/pos/sales/${sale.id}/splits/${split.body[0].id}/payments`, { sessionId, method: 'cash', amountMil: 5_000 }, key());
  assert.equal(first.status, 201);
  assert.equal(first.body.payment.changeMil, 1_000);
  assert.equal(first.body.splits[0].dueMil, 0);
  assert.equal(first.body.sale.status, 'open');
  const points = ctx.db.prepare("SELECT points, split_id FROM loyalty_ledger WHERE customer_id = ? AND type = 'earn'").all(sami) as { points: number; split_id: string }[];
  assert.deepEqual(points.map((p) => p.points), [4], 'Sami earns on his 4 DT only');

  const receipt = await cashier.get(`/api/pos/sales/${sale.id}/splits/${split.body[0].id}/receipt-document`);
  const text = JSON.stringify(receipt.body.lines);
  assert.match(text, /part 1\/2/);
  assert.match(text, /Express/);
  assert.doesNotMatch(text, /Pizza/);

  assert.equal((await cashier.delete(`/api/pos/sales/${sale.id}/split`)).status, 409, 'a paid part locks the split');
  const last = await cashier.post(`/api/pos/sales/${sale.id}/splits/${split.body[1].id}/payments`, { sessionId, method: 'card', amountMil: 14_000 }, key());
  assert.equal(last.body.sale.status, 'completed');
  assert.equal((ctx.db.prepare("SELECT COUNT(*) AS n FROM loyalty_ledger WHERE type = 'earn' AND sale_id = ?").get(sale.id) as { n: number }).n, 1, 'no sale-level credit on a split bill');
  await boss.post(`/api/pos/visits/${visit}/close`);
});

test('equal split; the split is refused once the bill changes', async () => {
  const { visit, sale } = await tableBill([{ articleId: pizza, quantity: 1 }]);
  const split = await cashier.post(`/api/pos/sales/${sale.id}/split`, { mode: 'equal', count: 3 });
  assert.deepEqual(split.body.map((p: { amountMil: number }) => p.amountMil), [4_667, 4_667, 4_666]);
  assert.equal((await cashier.post(`/api/pos/sales/${sale.id}/split`, { mode: 'amount', parts: [{ amountMil: 10_000 }, { amountMil: 1_000 }] })).status, 400, 'amounts must add up');

  await boss.post(`/api/pos/visits/${visit}/orders`, { lines: [{ articleId: coffee, quantity: 1 }] }, key());
  assert.equal((await cashier.post(`/api/pos/sales/${sale.id}/splits/${split.body[0].id}/payments`, { sessionId, method: 'card', amountMil: 4_667 }, key())).status, 409);
  const redo = await cashier.post(`/api/pos/sales/${sale.id}/split`, { mode: 'amount', parts: [{ amountMil: 10_000 }, { amountMil: 6_000 }] });
  assert.equal(redo.status, 201);
});
