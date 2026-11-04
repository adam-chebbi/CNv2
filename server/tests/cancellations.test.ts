import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { key, startTestServer, type ApiClient, type TestContext } from './helpers.ts';

let ctx: TestContext;
let manager: ApiClient;
let waiter: ApiClient;
let cashier: ApiClient;
let cook: ApiClient;
let visitId = '';
let sessionId = '';
let capId = '';
let capVariant = '';
let croqueId = '';

before(async () => {
  ctx = await startTestServer();
  manager = await ctx.createUser('Gérante', ['cancel:approve', 'cancel:request', 'floor:view', 'tables:all', 'tables:assign', 'floor:manage', 'pos:correct', 'pos:history', 'cash:open', 'pos:collect', 'pos:sell', 'visits:manage', 'orders:take']);
  waiter = await ctx.createUser('Amine', ['cancel:request', 'floor:view', 'orders:take', 'visits:manage', 'tables:all']);
  cashier = await ctx.createUser('Caisse', ['pos:sell', 'pos:collect']);
  cook = await ctx.createUser('Chef', ['prep:kitchen', 'prep:bar', 'prep:update']);
  croqueId = randomUUID();
  ctx.db.prepare("INSERT INTO catalog_articles (id, name, category, price, created_at) VALUES (?, 'Croque', 'Snack', 10.0, '2026-01-01')").run(croqueId);
  const catalog = await waiter.get('/api/pos/catalog');
  const cap = catalog.body.articles.find((a: { name: string }) => a.name === 'Cappuccino');
  capId = cap.id;
  capVariant = cap.variants[0].id;
  const area = await manager.post('/api/pos/floor/areas', { name: 'Salle' });
  const table = await manager.post('/api/pos/floor/tables', { areaId: area.body.id, name: 'T3', shape: 'square', capacity: 4, x: 0, y: 0, width: 80, height: 80 });
  const visit = await waiter.post('/api/pos/visits', { tableId: table.body.id, covers: 2 });
  visitId = visit.body.id;
  const reg = await manager.get('/api/pos/registers');
  sessionId = (await manager.post('/api/pos/cash-sessions', { registerId: reg.body[0].id, openingFloatMil: 50_000 }, key())).body.id;
});
after(async () => {
  await ctx.close();
});

const milk = () => (ctx.db.prepare("SELECT reserve_qty FROM stock_products WHERE name = 'Lait'").get() as { reserve_qty: number }).reserve_qty;
const billOf = async () => (await manager.get(`/api/pos/visits/${visitId}`)).body.sales.find((s: { status: string }) => s.status === 'open');

test("a waiter's request changes nothing until a manager decides; nobody approves their own request", async () => {
  const placed = await waiter.post(`/api/pos/visits/${visitId}/orders`, { lines: [{ articleId: capId, variantId: capVariant, quantity: 1 }, { articleId: croqueId, quantity: 1 }] }, key());
  const capLine = placed.body.sales[0].orders[0].lines[0];
  const milkAfterOrder = milk();
  const totalBefore = (await billOf()).totalMil;

  assert.equal((await waiter.post('/api/pos/cancellations', { targetType: 'line', targetId: capLine.id, reason: '' }, key())).status, 400);
  const request = await waiter.post('/api/pos/cancellations', { targetType: 'line', targetId: capLine.id, reason: 'Client a changé d’avis' }, key());
  assert.equal(request.status, 201);
  assert.equal((await waiter.post('/api/pos/cancellations', { targetType: 'line', targetId: capLine.id, reason: 'Encore' }, key())).status, 409);
  assert.equal((await billOf()).totalMil, totalBefore, 'pending request leaves the bill untouched');
  // flagged on the bar board, not removed
  const bar = await cook.get('/api/pos/prep/bar');
  assert.equal(bar.body.tickets[0].lines[0].cancellationRequested, true);
  // the waiter cannot decide
  assert.equal((await waiter.post(`/api/pos/cancellations/${request.body.id}/approve`, {})).status, 403);
  // table cannot be released while a request is pending
  const blocked = await waiter.post(`/api/pos/visits/${visitId}/close`);
  assert.match(blocked.body.error.message, /annulation/);

  const approved = await manager.post(`/api/pos/cancellations/${request.body.id}/approve`, { note: 'OK' });
  assert.equal(approved.body.status, 'approved');
  assert.equal(approved.body.stockTreatment, 'restored');
  assert.ok(milk() > milkAfterOrder, 'cancelled before preparation: milk back in stock');
  assert.equal((await billOf()).totalMil, 10_000);

  // a manager's own request must be decided by someone else
  const croqueLine = placed.body.sales[0].orders[0].lines[1];
  const own = await manager.post('/api/pos/cancellations', { targetType: 'line', targetId: croqueLine.id, reason: 'Erreur de saisie' }, key());
  const self = await manager.post(`/api/pos/cancellations/${own.body.id}/approve`, {});
  assert.equal(self.status, 403);
  assert.equal((await waiter.post(`/api/pos/cancellations/${own.body.id}/reject`, { note: 'non' })).status, 403);
  const boss = await ctx.createUser('Directeur', ['cancel:approve', 'tables:all']);
  assert.equal((await boss.post(`/api/pos/cancellations/${own.body.id}/reject`, { note: 'Le client le veut' })).body.status, 'rejected');
});

test('after preparation, ingredients are not put back and the manager records the treatment', async () => {
  const placed = await waiter.post(`/api/pos/visits/${visitId}/orders`, { lines: [{ articleId: capId, variantId: capVariant, quantity: 1 }] }, key());
  const line = placed.body.sales[0].orders.at(-1).lines[0];
  await cook.post(`/api/pos/prep/lines/${line.id}/status`, { status: 'in_progress' });
  const milkPrepared = milk();
  const request = await waiter.post('/api/pos/cancellations', { targetType: 'line', targetId: line.id, reason: 'Trop froid' }, key());
  assert.equal((await manager.post(`/api/pos/cancellations/${request.body.id}/approve`, {})).status, 400);
  const approved = await manager.post(`/api/pos/cancellations/${request.body.id}/approve`, { stockTreatment: 'prep_error', stockNote: 'Lait brûlé' });
  assert.equal(approved.body.stockTreatment, 'prep_error');
  assert.equal(milk(), milkPrepared, 'no automatic restock after preparation');
  const history = await manager.get('/api/pos/cancellations?status=approved');
  assert.equal(history.body.length, 2);
  assert.equal(history.body[0].requester, 'Amine');
  assert.equal(history.body[0].decidedBy, 'Gérante');
  const log = ctx.db.prepare("SELECT COUNT(*) AS n FROM activity_log WHERE module = 'Annulations'").get() as { n: number };
  assert.ok(log.n >= 4);
});

test('a paid sale is corrected by a credit note; the original ticket stays consultable', async () => {
  const sale = await cashier.post('/api/pos/sales/counter', { sessionId, serviceType: 'takeaway', lines: [{ articleId: croqueId, quantity: 2 }] }, key());
  await cashier.post(`/api/pos/sales/${sale.body.id}/payments`, { sessionId, method: 'cash', amountMil: 20_000 }, key());
  const lineId = sale.body.orders[0].lines[0].id;
  // pending-request route refuses paid sales
  assert.equal((await waiter.post('/api/pos/cancellations', { targetType: 'line', targetId: lineId, reason: 'Retour' }, key())).status, 409);
  assert.equal((await cashier.post(`/api/pos/sales/${sale.body.id}/corrections`, { lineIds: [lineId], reason: 'x', stockTreatment: 'none', refund: null }, key())).status, 403);

  const before = await manager.get(`/api/pos/cash-sessions/${sessionId}`);
  const corrected = await manager.post(
    `/api/pos/sales/${sale.body.id}/corrections`,
    { lineIds: [lineId], reason: 'Commande erronée', stockTreatment: 'loss', refund: { sessionId, method: 'cash', amountMil: 20_000 } },
    key()
  );
  assert.equal(corrected.status, 201);
  assert.equal(corrected.body.amountMil, 20_000);
  assert.equal(corrected.body.sale.status, 'completed');
  assert.equal(corrected.body.sale.totalMil, 20_000, 'original amounts unchanged');
  const afterSession = await manager.get(`/api/pos/cash-sessions/${sessionId}`);
  assert.equal(afterSession.body.summary.expectedCashMil, before.body.summary.expectedCashMil - 20_000);
  assert.equal(afterSession.body.summary.cashRefundsMil, 20_000);
  assert.equal((await manager.post(`/api/pos/sales/${sale.body.id}/corrections`, { lineIds: [lineId], reason: 'bis', stockTreatment: 'none', refund: null }, key())).status, 409);
});
