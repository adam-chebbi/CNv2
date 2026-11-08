import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { key, startTestServer, type ApiClient, type TestContext } from './helpers.ts';

let ctx: TestContext;
let boss: ApiClient;
let sessionId = '';
let croque = '';

before(async () => {
  ctx = await startTestServer();
  boss = await ctx.createUser('Direction', 'super-admin');
  croque = randomUUID();
  ctx.db.prepare("INSERT INTO catalog_articles (id, name, category, price, created_at) VALUES (?, 'Croque', 'Snack', 9.0, '2026-01-01')").run(croque);
  const reg = await boss.get('/api/pos/registers');
  sessionId = (await boss.post('/api/pos/cash-sessions', { registerId: reg.body[0].id, openingFloatMil: 0 }, key())).body.id;
});
after(async () => {
  await ctx.close();
});

const offlineSale = (overrides: Record<string, unknown> = {}) => ({
  sessionId, offlineRef: `HL-main-${randomUUID().slice(0, 6)}`, occurredAt: new Date(Date.now() - 10 * 60_000).toISOString(), serviceType: 'takeaway',
  lines: [{ articleId: croque, quantity: 2 }], payments: [{ method: 'cash', amountMil: 20_000 }], clientTotalMil: 18_000, ...overrides,
});

test('an offline sale is applied once, completed, with stock and ticket number', async () => {
  const k = key();
  const body = offlineSale();
  const [a, b] = await Promise.all([boss.post('/api/pos/offline-sales', body, k), boss.post('/api/pos/offline-sales', body, k)]);
  assert.equal(a.status, 201);
  assert.equal(a.body.id, b.body.id);
  assert.equal(a.body.status, 'completed');
  assert.match(a.body.ticketNumber, /^CN-/);
  assert.equal(a.body.offlineRef, body.offlineRef);
  assert.equal((ctx.db.prepare('SELECT COUNT(*) AS n FROM pos_sales WHERE offline_ref = ?').get(body.offlineRef) as { n: number }).n, 1);
});

test('a product made unavailable since is still accepted; a price change is flagged, never hidden', async () => {
  ctx.db.prepare("UPDATE catalog_articles SET availability = 'unavailable', is_available = 0, price = 10.0 WHERE id = ?").run(croque);
  const res = await boss.post('/api/pos/offline-sales', offlineSale(), key());
  assert.equal(res.status, 201);
  assert.equal(res.body.totalMil, 20_000);
  const actions = await boss.get('/api/pos/actions');
  assert.ok(actions.body.some((x: { kind: string; refId: string }) => x.kind === 'offline_sale' && x.refId === res.body.id));
});

test('a session closed in the meantime is a conflict to regularise', async () => {
  await boss.post(`/api/pos/cash-sessions/${sessionId}/close`, { countedCashMil: 0, comment: 'test' }, key());
  const res = await boss.post('/api/pos/offline-sales', offlineSale(), key());
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'SESSION_CLOSED');
});
