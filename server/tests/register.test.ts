import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { key, startTestServer, type ApiClient, type TestContext } from './helpers.ts';
import { summarizeSession } from '../../src/data/cashSession.ts';

let ctx: TestContext;
let boss: ApiClient;
let cashier: ApiClient;
let waiterA: ApiClient;
let waiterB: ApiClient;
let cook: ApiClient;
let barista: ApiClient;
let sessionId = '';
let sandwichId = '';
let capId = '';
let capVariant = '';

const WAITER = ['floor:view', 'orders:take', 'orders:validate', 'visits:manage', 'cancel:request', 'prep:update'];

before(async () => {
  ctx = await startTestServer();
  boss = await ctx.createUser('Patron', 'super-admin');
  cashier = await ctx.createUser('Caissière', ['pos:sell', 'pos:collect', 'pos:history', 'cash:view', 'cash:open', 'cash:movement', 'cash:close', 'floor:view', 'tables:all', 'visits:manage', 'orders:take']);
  waiterA = await ctx.createUser('Amine', WAITER);
  waiterB = await ctx.createUser('Sami', WAITER);
  cook = await ctx.createUser('Chef', ['prep:kitchen', 'prep:update']);
  barista = await ctx.createUser('Barista', ['prep:bar', 'prep:update']);

  // A 22 DT kitchen item without variants, to replay the cahier des charges examples.
  sandwichId = randomUUID();
  ctx.db
    .prepare("INSERT INTO catalog_articles (id, name, category, price, created_at) VALUES (?, 'Plateau brunch', 'Snack', 22.0, '2026-01-01')")
    .run(sandwichId);
  const catalog = await cashier.get('/api/pos/catalog');
  const cap = catalog.body.articles.find((a: { name: string }) => a.name === 'Cappuccino');
  capId = cap.id;
  capVariant = cap.variants[0].id;
});
after(async () => {
  await ctx.close();
});

const stockOf = (name: string): number =>
  (ctx.db.prepare('SELECT reserve_qty FROM stock_products WHERE name = ?').get(name) as { reserve_qty: number }).reserve_qty;

test('opening a cash session records the float and the user; one session per register', async () => {
  const registers = await cashier.get('/api/pos/registers');
  assert.equal(registers.status, 200);
  const registerId = registers.body[0].id;
  assert.equal((await waiterA.post('/api/pos/cash-sessions', { registerId, openingFloatMil: 100_000 }, key())).status, 403);
  const opened = await cashier.post('/api/pos/cash-sessions', { registerId, openingFloatMil: 100_000, comment: 'Matin' }, key());
  assert.equal(opened.status, 201);
  assert.equal(opened.body.openingFloatMil, 100_000);
  assert.equal(opened.body.openedBy, 'Caissière');
  assert.equal(opened.body.summary.revenueMil, 0); // the float is not revenue
  sessionId = opened.body.id;
  assert.equal((await cashier.post('/api/pos/cash-sessions', { registerId, openingFloatMil: 0 }, key())).status, 409);
});

test('counter sale: 22 DT paid with 30 DT gives 8 DT back, ticket numbered and searchable', async () => {
  const sale = await cashier.post('/api/pos/sales/counter', { sessionId, serviceType: 'takeaway', lines: [{ articleId: sandwichId, quantity: 1 }] }, key());
  assert.equal(sale.status, 201);
  assert.equal(sale.body.totalMil, 22_000);
  assert.equal(sale.body.status, 'open');

  const payKey = key();
  const paid = await cashier.post(`/api/pos/sales/${sale.body.id}/payments`, { sessionId, method: 'cash', amountMil: 30_000 }, payKey);
  assert.equal(paid.status, 201);
  assert.equal(paid.body.payment.changeMil, 8_000);
  assert.equal(paid.body.sale.status, 'completed');
  assert.match(paid.body.sale.ticketNumber, /^CN-\d{4}-000001$/);

  // a double tap replays the same answer and records nothing more
  const replay = await cashier.post(`/api/pos/sales/${sale.body.id}/payments`, { sessionId, method: 'cash', amountMil: 30_000 }, payKey);
  assert.equal(replay.status, 201);
  assert.equal(replay.headers.get('idempotent-replay'), 'true');
  const count = ctx.db.prepare('SELECT COUNT(*) AS n FROM pos_payments WHERE sale_id = ?').get(sale.body.id) as { n: number };
  assert.equal(count.n, 1);

  const found = await cashier.get(`/api/pos/sales?number=${paid.body.sale.ticketNumber}`);
  assert.equal(found.body.length, 1);
});

test('several payments: the balance decreases and the ticket is settled only once covered', async () => {
  const sale = await cashier.post('/api/pos/sales/counter', { sessionId, serviceType: 'dine_in', lines: [{ articleId: sandwichId, quantity: 1 }] }, key());
  const id = sale.body.id;
  let r = await cashier.post(`/api/pos/sales/${id}/payments`, { sessionId, method: 'card', amountMil: 10_000 }, key());
  assert.equal(r.body.sale.dueMil, 12_000);
  assert.equal(r.body.sale.status, 'open');
  assert.equal((await cashier.post(`/api/pos/sales/${id}/payments`, { sessionId, method: 'card', amountMil: 50_000 }, key())).status, 400);
  r = await cashier.post(`/api/pos/sales/${id}/payments`, { sessionId, method: 'voucher', amountMil: 5_000 }, key());
  assert.equal(r.body.sale.dueMil, 7_000);
  r = await cashier.post(`/api/pos/sales/${id}/payments`, { sessionId, method: 'cash', amountMil: 7_000 }, key());
  assert.equal(r.body.sale.status, 'completed');
  assert.equal(r.body.sale.paidMil, 22_000);
  assert.equal((await cashier.post(`/api/pos/sales/${id}/payments`, { sessionId, method: 'cash', amountMil: 1_000 }, key())).status, 409);
});

test('create actions require an idempotency key; a replayed counter sale is created once', async () => {
  const body = { sessionId, serviceType: 'takeaway', lines: [{ articleId: sandwichId, quantity: 1 }] };
  assert.equal((await cashier.post('/api/pos/sales/counter', body)).status, 400);
  const k = key();
  const before = (ctx.db.prepare('SELECT COUNT(*) AS n FROM pos_sales').get() as { n: number }).n;
  await Promise.all([cashier.post('/api/pos/sales/counter', body, k), cashier.post('/api/pos/sales/counter', body, k)]);
  const afterCount = (ctx.db.prepare('SELECT COUNT(*) AS n FROM pos_sales').get() as { n: number }).n;
  assert.equal(afterCount - before, 1);
});

test('ingredients leave the stock once, at validation — never again at payment', async () => {
  const milk0 = stockOf('Lait');
  const sale = await cashier.post('/api/pos/sales/counter', { sessionId, serviceType: 'takeaway', lines: [{ articleId: capId, variantId: capVariant, quantity: 2 }] }, key());
  const milk1 = stockOf('Lait');
  assert.ok(milk1 < milk0, 'milk consumed at validation');
  await cashier.post(`/api/pos/sales/${sale.body.id}/payments`, { sessionId, method: 'card', amountMil: sale.body.totalMil }, key());
  assert.equal(stockOf('Lait'), milk1, 'payment does not consume stock again');
  const lineId = sale.body.orders[0].lines[0].id;
  const movements = ctx.db.prepare("SELECT COUNT(*) AS n FROM stock_ledger WHERE source_type = 'pos_line' AND source_id = ?").get(lineId) as { n: number };
  assert.ok(movements.n >= 1);
});

test('table service: sections restrict waiters, orders reach kitchen and bar, release needs covers and payment', async () => {
  const area = await boss.post('/api/pos/floor/areas', { name: 'Salle' });
  const t1 = await boss.post('/api/pos/floor/tables', { areaId: area.body.id, name: 'T1', shape: 'square', capacity: 4, x: 10, y: 10, width: 80, height: 80 });
  const t2 = await boss.post('/api/pos/floor/tables', { areaId: area.body.id, name: 'T2', shape: 'round', capacity: 2, x: 120, y: 10, width: 80, height: 80 });
  assert.equal((await boss.post('/api/pos/floor/tables', { areaId: area.body.id, name: 't1', shape: 'square', capacity: 4, x: 0, y: 0, width: 80, height: 80 })).status, 409);
  const sectionA = await boss.post('/api/pos/floor/sections', { name: 'Carré A', tableIds: [t1.body.id] });
  const sectionB = await boss.post('/api/pos/floor/sections', { name: 'Carré B', tableIds: [t2.body.id] });
  const waiters = await boss.get('/api/pos/floor/waiters');
  const amine = waiters.body.find((w: { name: string }) => w.name === 'Amine');
  const sami = waiters.body.find((w: { name: string }) => w.name === 'Sami');
  await boss.post(`/api/pos/floor/sections/${sectionA.body.id}/assign`, { waiterId: amine.id });
  await boss.post(`/api/pos/floor/sections/${sectionB.body.id}/assign`, { waiterId: sami.id });

  // a waiter cannot act on a table outside his sections
  assert.equal((await waiterA.post('/api/pos/visits', { tableId: t2.body.id })).status, 403);
  const floor = await waiterA.get('/api/pos/floor');
  assert.equal(floor.body.tables.find((t: { id: string }) => t.id === t2.body.id).accessible, false);

  const visit = await waiterA.post('/api/pos/visits', { tableId: t1.body.id });
  assert.equal(visit.status, 201);
  assert.match(visit.body.joinCode, /^\d{4}$/);
  assert.equal((await waiterB.get(`/api/pos/visits/${visit.body.id}`)).status, 403);

  const order = await waiterA.post(
    `/api/pos/visits/${visit.body.id}/orders`,
    { lines: [{ articleId: capId, variantId: capVariant, quantity: 1 }, { articleId: sandwichId, quantity: 1, instruction: 'sans oignon' }] },
    key()
  );
  assert.equal(order.status, 201);
  const sale = order.body.sales[0];
  assert.equal(sale.totalMil, 25_500);
  assert.equal(sale.orders[0].lines[0].responsibleWaiter, 'Amine');

  // kitchen sees the brunch, bar the cappuccino — no prices on either board
  const onT1 = (board: { tickets: { label: string }[] }) => board.tickets.filter((t) => t.label.startsWith('T1'));
  const kitchen = await cook.get('/api/pos/prep/kitchen');
  const bar = await barista.get('/api/pos/prep/bar');
  kitchen.body.tickets = onT1(kitchen.body);
  assert.equal(kitchen.body.tickets.length, 1);
  assert.equal(kitchen.body.tickets[0].lines[0].instruction, 'sans oignon');
  assert.equal(onT1(bar.body)[0].lines[0].name, 'Cappuccino (Petit)');
  assert.ok(!JSON.stringify(kitchen.body).includes('Mil'));
  assert.equal((await cook.get('/api/pos/prep/bar')).status, 403);

  const ticketId = kitchen.body.tickets[0].id;
  assert.equal((await cook.post(`/api/pos/prep/tickets/${ticketId}/status`, { status: 'in_progress' })).status, 200);
  assert.equal((await cook.post(`/api/pos/prep/tickets/${ticketId}/status`, { status: 'ready' })).status, 200);
  const lineId = kitchen.body.tickets[0].lines[0].id;
  assert.equal((await cook.post(`/api/pos/prep/lines/${lineId}/status`, { status: 'to_prepare' })).status, 409); // two steps back

  // a second order is a new dispatch; earlier lines are not re-sent
  await waiterA.post(`/api/pos/visits/${visit.body.id}/orders`, { lines: [{ articleId: sandwichId, quantity: 1 }] }, key());
  const kitchen2 = onT1((await cook.get('/api/pos/prep/kitchen')).body);
  assert.equal(kitchen2.length, 2);
  assert.equal(kitchen2.filter((t) => (t as unknown as { lines: { status: string }[] }).lines[0].status === 'to_prepare').length, 1);

  // release: covers first, then payment
  assert.equal((await waiterA.post(`/api/pos/visits/${visit.body.id}/close`)).status, 409);
  await waiterA.patch(`/api/pos/visits/${visit.body.id}`, { covers: 2 });
  const blocked = await waiterA.post(`/api/pos/visits/${visit.body.id}/close`);
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.error.message, /réglée/);
  const detail = await cashier.get(`/api/pos/visits/${visit.body.id}`);
  const bill = detail.body.sales[0];
  assert.equal(bill.totalMil, 47_500);
  const paid = await cashier.post(`/api/pos/sales/${bill.id}/payments`, { sessionId, method: 'card', amountMil: bill.totalMil }, key());
  assert.equal(paid.body.sale.status, 'completed');
  const closed = await waiterA.post(`/api/pos/visits/${visit.body.id}/close`);
  assert.equal(closed.status, 200);
  assert.equal(closed.body.primaryWaiter, 'Amine');

  // reassigning a section keeps the history
  await boss.post(`/api/pos/floor/sections/${sectionA.body.id}/assign`, { waiterId: sami.id });
  const history = await boss.get(`/api/pos/floor/sections/${sectionA.body.id}/history`);
  assert.equal(history.body[0].waiter, 'Sami');
  assert.equal(history.body[0].previousWaiter, 'Amine');
});

test('printing: original once, then duplicates without creating a sale', async () => {
  const sale = await cashier.post('/api/pos/sales/counter', { sessionId, serviceType: 'takeaway', lines: [{ articleId: sandwichId, quantity: 1 }] }, key());
  await cashier.post(`/api/pos/sales/${sale.body.id}/payments`, { sessionId, method: 'cash', amountMil: 22_000 }, key());
  const salesBefore = (ctx.db.prepare('SELECT COUNT(*) AS n FROM pos_sales').get() as { n: number }).n;
  const first = await cashier.post(`/api/pos/sales/${sale.body.id}/print`);
  assert.equal(first.body.duplicate, false);
  assert.equal((await cashier.post(`/api/pos/sales/${sale.body.id}/print`)).status, 403); // no pos:reprint
  const dup = await boss.post(`/api/pos/sales/${sale.body.id}/print`);
  assert.equal(dup.body.duplicate, true);
  assert.equal((ctx.db.prepare('SELECT COUNT(*) AS n FROM pos_sales').get() as { n: number }).n, salesBefore);
});

test('cash movements and closing: expected cash, difference and mandatory comment', async () => {
  const out = await cashier.post(`/api/pos/cash-sessions/${sessionId}/movements`, { type: 'out', amountMil: 5_000, reason: 'Pain' }, key());
  assert.equal(out.status, 201);
  assert.equal((await cashier.post(`/api/pos/cash-sessions/${sessionId}/movements`, { type: 'out', amountMil: 5_000, reason: '' }, key())).status, 400);
  const detail = await cashier.get(`/api/pos/cash-sessions/${sessionId}`);
  const expected = detail.body.summary.expectedCashMil;
  // float 100 + cash 22 + 7 + 22 − 5 out
  assert.equal(expected, 100_000 + 22_000 + 7_000 + 22_000 - 5_000);
  assert.equal((await cashier.post(`/api/pos/cash-sessions/${sessionId}/close`, { countedCashMil: expected - 2_000 }, key())).status, 400);
  const closed = await cashier.post(`/api/pos/cash-sessions/${sessionId}/close`, { countedCashMil: expected - 2_000, comment: 'Erreur de rendu' }, key());
  assert.equal(closed.status, 200);
  assert.equal(closed.body.differenceMil, -2_000);
  assert.equal((await cashier.post(`/api/pos/cash-sessions/${sessionId}/movements`, { type: 'in', amountMil: 1_000, reason: 'x' }, key())).status, 409);
  // corrections need their own permission and keep the original count
  assert.equal((await cashier.post(`/api/pos/cash-sessions/${sessionId}/corrections`, { countedCashMil: expected, reason: 'Recompté' })).status, 403);
  const corrected = await boss.post(`/api/pos/cash-sessions/${sessionId}/corrections`, { countedCashMil: expected, reason: 'Billet retrouvé' });
  assert.equal(corrected.body.differenceMil, 0);
  assert.equal(corrected.body.corrections[0].countedBeforeMil, expected - 2_000);
});

test('expected cash formula from the cahier des charges: 100 + 200 − 50 − 10 = 240 DT', () => {
  const s = summarizeSession({
    openingFloatMil: 100_000,
    paymentsByMethod: { cash: 190_000, card: 0, voucher: 0 }, // 200 collected − 10 refunded
    cashRefundsMil: 10_000,
    cashInMil: 0,
    cashOutMil: 50_000,
  });
  assert.equal(s.expectedCashMil, 240_000);
  assert.equal(s.cashSalesMil, 200_000);
});
