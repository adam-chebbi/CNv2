import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { key, startTestServer, type ApiClient, type TestContext } from './helpers.ts';

let ctx: TestContext;
let boss: ApiClient;
let waiter: ApiClient;
let waiterId = '';
let lineId = '';

before(async () => {
  ctx = await startTestServer();
  boss = await ctx.createUser('Direction', 'super-admin');
  waiter = await ctx.createUser('Serveur', ['floor:view', 'orders:take', 'visits:manage', 'actions:view', 'cancel:request']);
  waiterId = (await waiter.get('/api/auth/me')).body.user.id;
  const coffee = randomUUID();
  ctx.db.prepare("INSERT INTO catalog_articles (id, name, category, price, created_at) VALUES (?, 'Express', 'Café', 2.5, '2026-01-01')").run(coffee);
  const area = await boss.post('/api/pos/floor/areas', { name: 'Salle' });
  const table = (await boss.post('/api/pos/floor/tables', { areaId: area.body.id, name: 'T9', shape: 'round', capacity: 2, x: 0, y: 0, width: 80, height: 80 })).body.id;
  const visit = (await boss.post('/api/pos/visits', { tableId: table, covers: 2 })).body.id;
  await boss.post(`/api/pos/visits/${visit}/orders`, { lines: [{ articleId: coffee, quantity: 1 }] }, key());
  lineId = (ctx.db.prepare("SELECT l.id FROM pos_order_lines l JOIN pos_orders o ON o.id = l.order_id WHERE o.visit_id = ?").get(visit) as { id: string }).id;
  ctx.db.prepare("UPDATE pos_order_lines SET prep_status = 'ready', ready_at = ? WHERE id = ?").run(new Date().toISOString(), lineId);
});
after(async () => {
  await ctx.close();
});

test('a right granted to one person applies on top of the role, and is logged', async () => {
  const before = await waiter.get('/api/pos/my-notifications');
  assert.equal(before.status, 200);
  assert.equal(before.body.items.length, 0, 'table outside the waiter carré');
  assert.equal(typeof before.body.actionsCount, 'number');

  assert.equal((await waiter.put(`/api/users/${waiterId}/permissions`, { permissions: ['tables:all'] })).status, 403);
  assert.equal((await boss.put(`/api/users/${waiterId}/permissions`, { permissions: ['nope'] })).status, 400);
  const granted = await boss.put(`/api/users/${waiterId}/permissions`, { permissions: ['tables:all'] });
  assert.equal(granted.status, 200);
  assert.deepEqual(granted.body.extraPermissions, ['tables:all']);

  const me = await waiter.get('/api/auth/me');
  assert.ok(me.body.user.permissions.includes('tables:all'), 'effective on the next request');
  const after = await waiter.get('/api/pos/my-notifications');
  assert.equal(after.body.items[0].kind, 'ready');
  assert.equal(after.body.items[0].tableName, 'T9');

  const log = ctx.db.prepare("SELECT before_json, after_json FROM activity_log WHERE entity_id = ? ORDER BY timestamp DESC").get(waiterId) as { before_json: string; after_json: string };
  assert.deepEqual(JSON.parse(log.before_json), []);
  assert.deepEqual(JSON.parse(log.after_json), ['tables:all']);

  await boss.put(`/api/users/${waiterId}/permissions`, { permissions: [] });
  assert.equal((await waiter.get('/api/pos/my-notifications')).body.items.length, 0, 'revoked');
});
