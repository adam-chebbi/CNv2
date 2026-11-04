import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { key, startTestServer, type ApiClient, type TestContext } from './helpers.ts';
import { tunisClock } from '../../src/data/pricing.ts';

let ctx: TestContext;
let boss: ApiClient;
let cook: ApiClient;

before(async () => {
  ctx = await startTestServer();
  boss = await ctx.createUser('Direction', 'super-admin');
  cook = await ctx.createUser('Chef', ['prep:kitchen']);
});
after(async () => {
  await ctx.close();
});

test('dashboard separates open bills from finalised sales, and reports averages, discounts and sessions', async () => {
  const croque = randomUUID();
  ctx.db.prepare("INSERT INTO catalog_articles (id, name, category, price, created_at) VALUES (?, 'Croque', 'Snack', 10.0, '2026-01-01')").run(croque);
  const reg = await boss.get('/api/pos/registers');
  const sessionId = (await boss.post('/api/pos/cash-sessions', { registerId: reg.body[0].id, openingFloatMil: 50_000 }, key())).body.id;

  const paid = await boss.post('/api/pos/sales/counter', { sessionId, serviceType: 'takeaway', lines: [{ articleId: croque, quantity: 2 }] }, key());
  await boss.post(`/api/pos/sales/${paid.body.id}/manual-discount`, { discount: { kind: 'fixed', value: 2_000, reason: 'Habitué' } });
  await boss.post(`/api/pos/sales/${paid.body.id}/payments`, { sessionId, method: 'cash', amountMil: 18_000 }, key());
  await boss.post('/api/pos/sales/counter', { sessionId, serviceType: 'takeaway', lines: [{ articleId: croque, quantity: 1 }] }, key()); // left open

  const d = await boss.get('/api/pos/dashboard');
  assert.equal(d.status, 200);
  assert.equal(d.body.revenue.registerMil, 18_000, 'open bill not counted as revenue');
  assert.equal(d.body.live.openBills, 1);
  assert.equal(d.body.live.openBillsDueMil, 10_000);
  assert.equal(d.body.tickets, 1);
  assert.equal(d.body.averageTicketMil, 18_000);
  assert.equal(d.body.discounts.manual, 2_000);
  assert.equal(d.body.paymentsByMethod.cash, 18_000);
  assert.equal(d.body.sessions.count, 1);
  assert.equal((await cook.get('/api/pos/dashboard')).status, 403);

  const today = tunisClock(new Date()).date;
  const report = await boss.get(`/api/pos/reports/sales?from=${today}&to=${today}&status=completed`);
  assert.equal(report.body.rows.length, 1);
  assert.equal(report.body.rows[0].quantity, 2);
  assert.equal(report.body.rows[0].product, 'Croque');
});
