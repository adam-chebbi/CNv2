import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { ApiClient, key, startTestServer, type TestContext } from './helpers.ts';

let ctx: TestContext;
let boss: ApiClient;
let waiter: ApiClient;
let phone1: ApiClient;
let phone2: ApiClient;
let qrToken = '';
let tableId = '';
let visitId = '';
let joinCode = '';
let croqueId = '';

before(async () => {
  ctx = await startTestServer();
  boss = await ctx.createUser('Patron', 'super-admin');
  waiter = await ctx.createUser('Amine', ['floor:view', 'orders:take', 'orders:validate', 'visits:manage', 'actions:view', 'tables:all']);
  phone1 = new ApiClient(ctx.baseUrl);
  phone2 = new ApiClient(ctx.baseUrl);
  croqueId = randomUUID();
  ctx.db.prepare("INSERT INTO catalog_articles (id, name, category, price, created_at) VALUES (?, 'Croque', 'Snack', 9.5, '2026-01-01')").run(croqueId);
  const area = await boss.post('/api/pos/floor/areas', { name: 'Terrasse' });
  const table = await boss.post('/api/pos/floor/tables', { areaId: area.body.id, name: 'T7', shape: 'round', capacity: 4, x: 0, y: 0, width: 80, height: 80 });
  qrToken = table.body.qrToken;
  tableId = table.body.id;
});
after(async () => {
  await ctx.close();
});

const order = (client: ApiClient, k = key(), qty = 1) => client.post(`/api/client/tables/${qrToken}/orders`, { lines: [{ articleId: croqueId, quantity: qty }] }, k);

test('the menu is public; acting on the table needs the visit code', async () => {
  const menu = await phone1.get('/api/client/menu');
  assert.equal(menu.status, 200);
  assert.ok(menu.body.articles.some((a: { id: string }) => a.id === croqueId));
  const page = await phone1.get(`/api/client/tables/${qrToken}`);
  assert.deepEqual(page.body.table, { name: 'T7' });
  assert.equal(page.body.visitOpen, false);
  assert.equal((await phone1.post(`/api/client/tables/${qrToken}/join`, { code: '0000' })).status, 409); // table not opened
  assert.equal((await phone1.get('/api/client/tables/unknown-token')).status, 404);

  const visit = await waiter.post('/api/pos/visits', { tableId, covers: 2 });
  visitId = visit.body.id;
  joinCode = visit.body.joinCode;
  assert.equal((await order(phone1)).status, 401);
  const wrong = joinCode === '9999' ? '0000' : '9999';
  assert.equal((await phone1.post(`/api/client/tables/${qrToken}/join`, { code: wrong })).status, 400);
  assert.equal((await phone1.post(`/api/client/tables/${qrToken}/join`, { code: joinCode })).status, 200);
  assert.equal((await phone2.post(`/api/client/tables/${qrToken}/join`, { code: joinCode })).status, 200);
  assert.equal((await phone1.get(`/api/client/tables/${qrToken}`)).body.joined, true);
});

test('a QR order waits for the team: nothing prepared, nothing consumed', async () => {
  const sent = await order(phone1);
  assert.equal(sent.status, 201);
  assert.equal(sent.body.status, 'pending_validation');
  const prepLines = ctx.db.prepare("SELECT COUNT(*) AS n FROM pos_order_lines WHERE order_id = ? AND prep_status != 'none'").get(sent.body.id) as { n: number };
  assert.equal(prepLines.n, 0);
  const movements = ctx.db.prepare("SELECT COUNT(*) AS n FROM stock_ledger WHERE source_type = 'pos_line'").get() as { n: number };
  assert.equal(movements.n, 0);
  const actions = await waiter.get('/api/pos/actions');
  assert.ok(actions.body.some((a: { kind: string; refId: string }) => a.kind === 'qr_order' && a.refId === sent.body.id));
  const floor = await waiter.get('/api/pos/floor');
  assert.equal(floor.body.tables.find((t: { id: string }) => t.id === tableId).pendingOrders, 1);

  const accepted = await waiter.post(`/api/pos/orders/${sent.body.id}/accept`);
  assert.equal(accepted.body.status, 'validated');
  const mine = await phone1.get(`/api/client/tables/${qrToken}/visit`);
  assert.equal(mine.body.myOrders[0].status, 'validated');
  assert.equal(mine.body.myOrders[0].lines[0].prepStatus, 'to_prepare');
  assert.equal(mine.body.bill.totalMil, 9_500);
});

test('two phones order at the same time without overwriting; a double tap creates one order', async () => {
  const k = key();
  const [a, b, c] = await Promise.all([order(phone1, k), order(phone1, k), order(phone2)]);
  assert.equal(a.body.id, b.body.id);
  assert.notEqual(a.body.id, c.body.id);
  const pending = ctx.db.prepare("SELECT COUNT(*) AS n FROM pos_orders WHERE visit_id = ? AND status = 'pending_validation'").get(visitId) as { n: number };
  assert.equal(pending.n, 2);
  // each phone only lists its own orders
  const p2 = await phone2.get(`/api/client/tables/${qrToken}/visit`);
  assert.equal(p2.body.myOrders.length, 1);
  assert.equal(p2.body.bill.pendingLines.length, 2);

  assert.equal((await waiter.post(`/api/pos/orders/${a.body.id}/reject`, {})).status, 400); // a reason is required
  const rejected = await waiter.post(`/api/pos/orders/${a.body.id}/reject`, { reason: 'Cuisine fermée' });
  assert.equal(rejected.body.status, 'rejected');

  // the team changes the content: the customer must confirm before validation
  const changed = await waiter.post(`/api/pos/orders/${c.body.id}/request-change`, { message: 'Plus que 1 croque', lines: [{ articleId: croqueId, quantity: 1 }] });
  assert.equal(changed.body.status, 'awaiting_customer');
  assert.equal((await waiter.post(`/api/pos/orders/${c.body.id}/accept`)).status, 409);
  assert.equal((await phone1.post(`/api/client/tables/${qrToken}/orders/${c.body.id}/confirm`, { accept: true })).status, 404); // not phone1's order
  const confirmed = await phone2.post(`/api/client/tables/${qrToken}/orders/${c.body.id}/confirm`, { accept: true });
  assert.equal(confirmed.body.status, 'pending_validation');
  assert.equal((await waiter.post(`/api/pos/orders/${c.body.id}/accept`)).body.status, 'validated');
});

test('a price change after sending goes back to the customer for confirmation', async () => {
  const sent = await order(phone1);
  ctx.db.prepare('UPDATE catalog_articles SET price = 10.5 WHERE id = ?').run(croqueId);
  const res = await waiter.post(`/api/pos/orders/${sent.body.id}/accept`);
  assert.equal(res.body.status, 'awaiting_customer');
  assert.match(res.body.changeRequest, /10,500 DT/);
  ctx.db.prepare('UPDATE catalog_articles SET price = 9.5 WHERE id = ?').run(croqueId);
  await phone1.post(`/api/client/tables/${qrToken}/orders/${sent.body.id}/confirm`, { accept: false });
});

test('calling a waiter: right table, grouped taps, taken then done', async () => {
  const first = await phone1.post(`/api/client/tables/${qrToken}/requests`, { type: 'call_waiter' });
  const again = await phone2.post(`/api/client/tables/${qrToken}/requests`, { type: 'call_waiter' });
  assert.equal(first.body.id, again.body.id);
  assert.equal(again.body.pressCount, 2);
  const floor = await waiter.get('/api/pos/floor');
  assert.equal(floor.body.tables.find((t: { id: string }) => t.id === tableId).waiterCalled, true);
  const actions = await waiter.get('/api/pos/actions');
  const call = actions.body.find((a: { kind: string }) => a.kind === 'call_waiter');
  assert.equal(call.tableName, 'T7');
  assert.equal((await waiter.post(`/api/pos/service-requests/${first.body.id}/take`)).body.status, 'in_progress');
  assert.equal((await waiter.post(`/api/pos/service-requests/${first.body.id}/done`)).body.status, 'done');
  // a new call after the first one is done is a new request
  const fresh = await phone1.post(`/api/client/tables/${qrToken}/requests`, { type: 'call_waiter' });
  assert.notEqual(fresh.body.id, first.body.id);
  // asking for the bill is not a payment
  await phone1.post(`/api/client/tables/${qrToken}/requests`, { type: 'bill' });
  const payments = ctx.db.prepare('SELECT COUNT(*) AS n FROM pos_payments').get() as { n: number };
  assert.equal(payments.n, 0);
});

test('reviews: internal review whatever the rating, Google link always offered', async () => {
  await boss.put('/api/pos/settings', {
    manualDiscountMaxPercent: 20, consumptionZone: 'Réserve principale', googleReviewUrl: 'https://g.page/r/cafenoir/review',
    reservationDurationMinutes: 90, reservationMaxPeople: 12, openingTime: '07:00', closingTime: '23:00', publicAppUrl: '',
  });
  const low = await phone1.post('/api/client/feedback', { qrToken, rating: 1, comment: 'Trop long' });
  assert.equal(low.status, 201);
  assert.equal(low.body.googleReviewUrl, 'https://g.page/r/cafenoir/review');
  const list = await boss.get('/api/pos/feedback?status=to_handle');
  assert.equal(list.body[0].comment, 'Trop long');
  const handled = await boss.patch(`/api/pos/feedback/${list.body[0].id}`, { status: 'resolved', internalNotes: 'Client rappelé' });
  assert.equal(handled.body.status, 'resolved');
  assert.equal((await waiter.get('/api/pos/feedback')).status, 403);
});

test('allergens: undocumented is never shown as free', async () => {
  await boss.put(`/api/pos/catalog/articles/${croqueId}/allergens`, { allergens: [{ name: 'Gluten', state: 'contains' }] });
  const menu = await phone1.get('/api/client/menu');
  const croque = menu.body.articles.find((a: { id: string }) => a.id === croqueId);
  assert.deepEqual(croque.allergens, [{ name: 'Gluten', state: 'contains' }]);
  assert.ok(!croque.allergens.some((a: { name: string }) => a.name === 'Lait'));
});

test('closing the visit invalidates every phone that joined it', async () => {
  // settle the bill first
  const reg = await boss.get('/api/pos/registers');
  const session = await boss.post('/api/pos/cash-sessions', { registerId: reg.body[0].id, openingFloatMil: 0 }, key());
  // drop pending orders, then pay
  const pending = ctx.db.prepare("SELECT id FROM pos_orders WHERE visit_id = ? AND status IN ('pending_validation','awaiting_customer')").all(visitId) as { id: string }[];
  for (const p of pending) await waiter.post(`/api/pos/orders/${p.id}/reject`, { reason: 'Clôture' });
  const visit = await boss.get(`/api/pos/visits/${visitId}`);
  const bill = visit.body.sales.find((s: { status: string }) => s.status === 'open');
  await boss.post(`/api/pos/sales/${bill.id}/payments`, { sessionId: session.body.id, method: 'card', amountMil: bill.totalMil }, key());
  assert.equal((await waiter.post(`/api/pos/visits/${visitId}/close`)).status, 200);
  assert.equal((await order(phone1)).status, 401);
  assert.equal((await phone2.get(`/api/client/tables/${qrToken}/visit`)).status, 401);
  // the next occupation has a new visit and a new code; old phones are not members
  const next = await waiter.post('/api/pos/visits', { tableId });
  assert.notEqual(next.body.id, visitId);
  assert.equal((await phone1.get(`/api/client/tables/${qrToken}`)).body.joined, false);
});
