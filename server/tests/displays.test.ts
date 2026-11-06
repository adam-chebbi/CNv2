import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { ApiClient, key, startTestServer, type TestContext } from './helpers.ts';

let ctx: TestContext;
let boss: ApiClient;
let cook: ApiClient;
let sessionId = '';
let croque = '';

before(async () => {
  ctx = await startTestServer();
  boss = await ctx.createUser('Direction', 'super-admin');
  cook = await ctx.createUser('Chef', ['prep:kitchen', 'prep:update']);
  croque = randomUUID();
  ctx.db.prepare("INSERT INTO catalog_articles (id, name, category, price, created_at) VALUES (?, 'Croque', 'Snack', 9.0, '2026-01-01')").run(croque);
  const reg = await boss.get('/api/pos/registers');
  sessionId = (await boss.post('/api/pos/cash-sessions', { registerId: reg.body[0].id, openingFloatMil: 0 }, key())).body.id;
});
after(async () => {
  await ctx.close();
});

test('ready board: pickup numbers move from "en préparation" to "prêtes", nothing personal exposed', async () => {
  const sale = await boss.post('/api/pos/sales/counter', { sessionId, serviceType: 'takeaway', lines: [{ articleId: croque, quantity: 1 }] }, key());
  const n = sale.body.pickupNumber;
  assert.ok(n >= 1);
  const anonymous = new ApiClient(ctx.baseUrl);
  let board = await anonymous.get('/api/client/ready-board');
  assert.deepEqual(board.body, { preparing: [n], ready: [] });
  const ticket = (await cook.get('/api/pos/prep/kitchen')).body.tickets[0];
  await cook.post(`/api/pos/prep/tickets/${ticket.id}/status`, { status: 'ready' });
  board = await anonymous.get('/api/client/ready-board');
  assert.deepEqual(board.body, { preparing: [], ready: [n] });
  await cook.post(`/api/pos/prep/tickets/${ticket.id}/status`, { status: 'served' });
  assert.deepEqual((await anonymous.get('/api/client/ready-board')).body, { preparing: [], ready: [] });
});

test('customer display: paired by token, mirrors what the register publishes', async () => {
  const screen = new ApiClient(ctx.baseUrl);
  assert.equal((await screen.get('/api/client/display/register-main?k=nope')).status, 401);
  const pair = await boss.post('/api/pos/registers/register-main/display-token');
  const k = new URL(`http://x${pair.body.path}`).searchParams.get('k');
  assert.equal((await screen.get(`/api/client/display/register-main?k=${k}`)).body.state.mode, 'idle');
  await boss.post('/api/pos/registers/register-main/display', { mode: 'cart', lines: [{ name: 'Croque', quantity: 2, totalMil: 18_000 }], totalMil: 18_000 });
  const shown = await screen.get(`/api/client/display/register-main?k=${k}`);
  assert.equal(shown.body.state.totalMil, 18_000);
  // a new pairing disables the previous link
  await boss.post('/api/pos/registers/register-main/display-token');
  assert.equal((await screen.get(`/api/client/display/register-main?k=${k}`)).status, 401);
});
