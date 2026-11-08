import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { key, startTestServer, type ApiClient, type TestContext } from './helpers.ts';

let ctx: TestContext;
let boss: ApiClient;
let waiter: ApiClient;
const tables: string[] = [];
let coffee = '';

before(async () => {
  ctx = await startTestServer();
  boss = await ctx.createUser('Direction', 'super-admin');
  waiter = await ctx.createUser('Serveur', ['floor:view', 'orders:take', 'visits:manage']);
  coffee = randomUUID();
  ctx.db.prepare("INSERT INTO catalog_articles (id, name, category, price, created_at) VALUES (?, 'Express', 'Café', 2.5, '2026-01-01')").run(coffee);
  const area = await boss.post('/api/pos/floor/areas', { name: 'Terrasse' });
  for (const name of ['T1', 'T2', 'T3']) {
    tables.push((await boss.post('/api/pos/floor/tables', { areaId: area.body.id, name, shape: 'round', capacity: 4, x: 0, y: 0, width: 80, height: 80 })).body.id);
  }
});
after(async () => {
  await ctx.close();
});

const order = (visitId: string, quantity: number) => boss.post(`/api/pos/visits/${visitId}/orders`, { lines: [{ articleId: coffee, quantity }] }, key());

test('a party moves to a free table with its bill; occupied targets are refused', async () => {
  const v = (await boss.post('/api/pos/visits', { tableId: tables[0], covers: 2 })).body.id;
  await order(v, 2);
  assert.equal((await waiter.post(`/api/pos/visits/${v}/transfer`, { toTableId: tables[1] })).status, 403, 'needs tables:transfer');

  const moved = await boss.post(`/api/pos/visits/${v}/transfer`, { toTableId: tables[1] });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.table.name, 'T2');
  assert.equal(moved.body.sales[0].totalMil, 5_000);

  const other = (await boss.post('/api/pos/visits', { tableId: tables[0], covers: 1 })).body.id;
  assert.equal((await boss.post(`/api/pos/visits/${other}/transfer`, { toTableId: tables[1] })).status, 409);
  const log = ctx.db.prepare("SELECT description FROM activity_log WHERE action = 'Transfert de table'").all() as { description: string }[];
  assert.deepEqual(log.map((l) => l.description), ['T1 → T2']);
});

test('merging puts both orders on one bill and frees the source table', async () => {
  const floor = (await boss.get('/api/pos/floor')).body;
  const byName = (n: string) => floor.tables.find((t: { name: string }) => t.name === n).visit.id;
  const source = byName('T1');
  const target = byName('T2');
  await order(source, 1);

  const merged = await boss.post(`/api/pos/visits/${source}/merge`, { intoVisitId: target });
  assert.equal(merged.status, 200);
  const open = merged.body.sales.filter((s: { status: string }) => s.status === 'open');
  assert.equal(open.length, 1);
  assert.equal(open[0].totalMil, 7_500);
  assert.equal(merged.body.covers, 3);
  assert.equal((await boss.get(`/api/pos/visits/${source}`)).body.status, 'closed');
  const after = (await boss.get('/api/pos/floor')).body;
  assert.equal(after.tables.find((t: { name: string }) => t.name === 'T1').visit, null);
});

test('a bill with a payment cannot be merged', async () => {
  const a = (await boss.post('/api/pos/visits', { tableId: tables[0], covers: 1 })).body.id;
  const b = (await boss.post('/api/pos/visits', { tableId: tables[2], covers: 1 })).body.id;
  await order(a, 1);
  ctx.db.prepare("UPDATE pos_sales SET paid_mil = 1000 WHERE visit_id = ? AND status = 'open'").run(a);
  assert.equal((await boss.post(`/api/pos/visits/${a}/merge`, { intoVisitId: b })).status, 409);
});
