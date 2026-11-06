import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { key, startTestServer, type ApiClient, type TestContext } from './helpers.ts';

let ctx: TestContext;
let boss: ApiClient;
let cook: ApiClient;
let visitId = '';
let pizza = '';
let tiramisu = '';

before(async () => {
  ctx = await startTestServer();
  boss = await ctx.createUser('Direction', 'super-admin');
  cook = await ctx.createUser('Chef', ['prep:kitchen', 'prep:update']);
  pizza = randomUUID();
  tiramisu = randomUUID();
  ctx.db.prepare("INSERT INTO catalog_articles (id, name, category, price, created_at) VALUES (?, 'Pizza', 'Snack', 14.0, '2026-01-01')").run(pizza);
  ctx.db.prepare("INSERT INTO catalog_articles (id, name, category, price, created_at) VALUES (?, 'Tiramisu', 'Pâtisserie', 9.0, '2026-01-01')").run(tiramisu);
  ctx.db.prepare("INSERT INTO product_allergens (article_id, allergen, state) VALUES (?, 'Lait', 'contains')").run(tiramisu);
  const area = await boss.post('/api/pos/floor/areas', { name: 'Salle' });
  const table = await boss.post('/api/pos/floor/tables', { areaId: area.body.id, name: 'T4', shape: 'square', capacity: 4, x: 0, y: 0, width: 80, height: 80 });
  visitId = (await boss.post('/api/pos/visits', { tableId: table.body.id, covers: 2 })).body.id;
});
after(async () => {
  await ctx.close();
});

const kitchenNames = async () => (await cook.get('/api/pos/prep/kitchen')).body.tickets.flatMap((t: { lines: { name: string }[] }) => t.lines.map((l) => l.name));

test('held items ("suite") reach the kitchen only when sent, as a new dispatch', async () => {
  const placed = await boss.post(`/api/pos/visits/${visitId}/orders`, { lines: [{ articleId: pizza, quantity: 2 }, { articleId: tiramisu, quantity: 2, hold: true }] }, key());
  assert.equal(placed.status, 201);
  assert.deepEqual(await kitchenNames(), ['Pizza']);
  const order = placed.body.sales[0].orders[0];
  assert.equal(order.lines[1].fireStatus, 'hold');
  // price frozen at validation even while held
  assert.equal(placed.body.sales[0].totalMil, 46_000);

  const fired = await boss.post(`/api/pos/orders/${order.id}/fire`);
  assert.equal(fired.body.prepTickets.length, 1);
  const board = await cook.get('/api/pos/prep/kitchen');
  assert.equal(board.body.tickets.length, 2);
  const dessert = board.body.tickets.find((t: { lines: { name: string }[] }) => t.lines[0].name === 'Tiramisu');
  assert.deepEqual(dessert.lines[0].allergens, ['Lait']);
  assert.equal((await boss.post(`/api/pos/orders/${order.id}/fire`)).status, 409, 'nothing left to send');
});

test('urgent orders come first; recall and preparation times are available', async () => {
  const urgent = await boss.post(`/api/pos/visits/${visitId}/orders`, { lines: [{ articleId: pizza, quantity: 1, instruction: 'allergie aux noix' }], urgent: true }, key());
  const board = await cook.get('/api/pos/prep/kitchen');
  assert.equal(board.body.tickets[0].urgent, true);
  assert.equal(board.body.tickets[0].lines[0].allergyNote, true);

  // finish everything, then the dispatches are recallable and measured
  for (const t of board.body.tickets) await cook.post(`/api/pos/prep/tickets/${t.id}/status`, { status: 'ready' });
  const recent = await cook.get('/api/pos/prep/kitchen/recent');
  assert.ok(recent.body.length >= 3);
  const metrics = await cook.get('/api/pos/prep-metrics');
  assert.ok(metrics.body.some((m: { name: string; count: number }) => m.name === 'Pizza' && m.count >= 2));
  void urgent;
});
