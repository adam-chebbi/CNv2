import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { ApiClient, key, startTestServer, type TestContext } from './helpers.ts';

let ctx: TestContext;
let boss: ApiClient;
let manager: ApiClient;
let phone: ApiClient;
let qrToken = '';
let articleId = '';

before(async () => {
  ctx = await startTestServer();
  boss = await ctx.createUser('Direction', 'super-admin');
  manager = await ctx.createUser('Gérant', ['rules:service', 'floor:view']);
  phone = new ApiClient(ctx.baseUrl);
  articleId = randomUUID();
  ctx.db.prepare("INSERT INTO catalog_articles (id, name, category, price, created_at) VALUES (?, 'Citronnade', 'Boissons', 4, '2026-01-01')").run(articleId);
  const area = await boss.post('/api/pos/floor/areas', { name: 'Terrasse' });
  const table = await boss.post('/api/pos/floor/tables', { areaId: area.body.id, name: 'T1', shape: 'round', capacity: 4, x: 0, y: 0, width: 80, height: 80 });
  qrToken = table.body.qrToken;
  const visit = await boss.post('/api/pos/visits', { tableId: table.body.id, covers: 2 });
  await phone.post(`/api/client/tables/${qrToken}/join`, { code: visit.body.joinCode });
});
after(async () => {
  await ctx.close();
});

const order = () => phone.post(`/api/client/tables/${qrToken}/orders`, { lines: [{ articleId, quantity: 1 }] }, key());

test('rules: who may change what, reason required, history kept', async () => {
  const list = await manager.get('/api/pos/rules');
  assert.equal(list.status, 200);
  const late = list.body.find((r: { key: string }) => r.key === 'prep_late_bar');
  assert.equal(late.value, 10);
  assert.equal(late.canEdit, false, 'Direction only');
  assert.equal((await manager.put('/api/pos/rules/prep_late_bar', { value: 12, reason: 'test' })).status, 403);
  assert.equal((await boss.put('/api/pos/rules/prep_late_bar', { value: 12, reason: '' })).status, 400, 'reason required');
  assert.equal((await boss.put('/api/pos/rules/prep_late_bar', { value: 999, reason: 'trop' })).status, 400, 'out of range');
  assert.equal((await boss.put('/api/pos/rules/prep_late_bar', { value: 12, reason: 'été' })).status, 200);
  const after = (await boss.get('/api/pos/rules')).body.find((r: { key: string }) => r.key === 'prep_late_bar');
  assert.equal(after.value, 12);
  assert.equal(after.isDefault, false);
  assert.deepEqual([after.history[0].oldValue, after.history[0].newValue, after.history[0].reason], [10, 12, 'été']);
  assert.equal((await phone.get('/api/pos/rules/values')).status, 401);
});

test('QR rules: pending limit, ordering switch, bill switch; calling a waiter always works', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await order()).status, 201);
  assert.equal((await order()).status, 429, 'max 3 pending by default');

  assert.equal((await manager.put('/api/pos/rules/qr_ordering', { value: false, reason: 'rush terrasse' })).status, 200);
  assert.equal((await phone.get(`/api/client/tables/${qrToken}`)).body.features.ordering, false);
  assert.equal((await order()).status, 403);

  await manager.put('/api/pos/rules/qr_bill', { value: false, reason: 'service à table' });
  assert.equal((await phone.post(`/api/client/tables/${qrToken}/requests`, { type: 'bill' })).status, 403);
  assert.equal((await phone.post(`/api/client/tables/${qrToken}/requests`, { type: 'call_waiter' })).status, 201);
});
