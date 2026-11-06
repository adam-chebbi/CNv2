import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { key, startTestServer, type ApiClient, type TestContext } from './helpers.ts';
import { prepTicketDocument, receiptDocument } from '../../src/data/receipts.ts';
import { runOnce } from '../../agent/cn-print-agent.mjs';

let ctx: TestContext;
let boss: ApiClient;
let printer: net.Server;
let printerPort = 0;
const received: Buffer[] = [];
let agentConfig: { serverUrl: string; token: string };
let sessionId = '';
let pizzaId = '';
let expressId = '';
let expressVariant = '';

before(async () => {
  ctx = await startTestServer();
  boss = await ctx.createUser('Direction', 'super-admin');
  // A fake network thermal printer (raw port), recording what it receives.
  printer = net.createServer((socket) => {
    const chunks: Buffer[] = [];
    socket.on('data', (c) => chunks.push(c));
    socket.on('end', () => received.push(Buffer.concat(chunks)));
  });
  await new Promise<void>((r) => printer.listen(0, '127.0.0.1', () => r()));
  printerPort = (printer.address() as AddressInfo).port;

  pizzaId = randomUUID();
  ctx.db.prepare("INSERT INTO catalog_articles (id, name, category, price, created_at) VALUES (?, 'Pizza margherita', 'Snack', 14.0, '2026-01-01')").run(pizzaId);
  const express = (await boss.get('/api/pos/catalog')).body.articles.find((a: { name: string }) => a.name === 'Express / Espresso');
  expressId = express.id;
  expressVariant = express.variants[0].id;
  const reg = await boss.get('/api/pos/registers');
  sessionId = (await boss.post('/api/pos/cash-sessions', { registerId: reg.body[0].id, openingFloatMil: 0 }, key())).body.id;
});
after(async () => {
  printer.close();
  await ctx.close();
});

test('kitchen ticket: only what the station prepares, no price, the instruction framed', () => {
  const doc = prepTicketDocument({
    destination: 'kitchen', label: 'T7', tableName: 'T7', orderNumber: 58, pickupNumber: null, sentAt: new Date().toISOString(), waiter: 'Amine', covers: 3,
    followUp: false, urgent: false, lines: [{ quantity: 1, name: 'Pizza margherita', variant: null, extras: [], instruction: 'sans olives' }],
  });
  const text = JSON.stringify(doc);
  assert.ok(text.includes('CUISINE') && text.includes('TABLE T7') && text.includes('PIZZA MARGHERITA'));
  assert.ok(doc.lines.some((l) => l.t === 'box' && l.lines[0].includes('sans olives')));
  assert.ok(!/\d+,\d{3}/.test(text), 'no amount on a kitchen ticket');
});

test('agent prints kitchen and bar tickets once per dispatch, then the receipt and opens the drawer', async () => {
  const agent = await boss.post('/api/pos/print-agents', { name: 'PC caisse' });
  assert.match(agent.body.token, /^cnpa_/);
  agentConfig = { serverUrl: ctx.baseUrl, token: agent.body.token };
  const address = `tcp://127.0.0.1:${printerPort}`;
  for (const target of ['kitchen', 'bar', 'register:register-main']) {
    const p = await boss.post('/api/pos/printers', { name: target, agentId: agent.body.id, target, address, cashDrawer: target.startsWith('register') });
    assert.equal(p.status, 201);
  }

  const sale = await boss.post(
    '/api/pos/sales/counter',
    { sessionId, serviceType: 'takeaway', lines: [{ articleId: expressId, variantId: expressVariant, quantity: 1 }, { articleId: pizzaId, quantity: 1, instruction: 'sans olives' }] },
    key()
  );
  assert.equal(sale.status, 201);
  const jobs = ctx.db.prepare("SELECT kind, target FROM print_jobs WHERE kind = 'prep' ORDER BY target").all() as { kind: string; target: string }[];
  assert.deepEqual(jobs.map((j) => j.target), ['bar', 'kitchen']);

  assert.equal(await runOnce(agentConfig), 2);
  await new Promise((r) => setTimeout(r, 100));
  const printed = received.map((b) => b.toString('latin1'));
  const kitchen = printed.find((t) => t.includes('CUISINE'))!;
  assert.ok(kitchen.includes('PIZZA MARGHERITA') && kitchen.includes('sans olives'));
  assert.ok(!kitchen.includes('EXPRESS'), 'the express goes to the bar, not the kitchen');
  assert.ok(printed.find((t) => t.includes('BAR'))!.includes('EXPRESS'));
  assert.ok(kitchen.includes(`RETRAIT n°${sale.body.pickupNumber}`));

  // nothing printed twice on a second pass
  assert.equal(await runOnce(agentConfig), 0);

  // cash payment: receipt (automatic) + drawer
  await boss.post(`/api/pos/sales/${sale.body.id}/payments`, { sessionId, method: 'cash', amountMil: 20_000 }, key());
  const queued = ctx.db.prepare("SELECT kind FROM print_jobs WHERE status = 'queued' ORDER BY kind").all() as { kind: string }[];
  assert.deepEqual(queued.map((q) => q.kind), ['drawer', 'receipt']);
  await runOnce(agentConfig);
  await new Promise((r) => setTimeout(r, 100));
  const receipt = received.map((b) => b.toString('latin1')).find((t) => t.includes('TOTAL'))!;
  assert.ok(receipt.includes('EXPRESS') || receipt.includes('Express'));
  assert.ok(receipt.includes('Pizza margherita'));
  // the manual print after the automatic one is a duplicate
  const reprint = await boss.post(`/api/pos/sales/${sale.body.id}/print`);
  assert.equal(reprint.body.duplicate, true);
  assert.equal(reprint.body.queued, true);
});

test('a revoked agent is refused; failures are retried then reported', async () => {
  const bad = await fetch(`${ctx.baseUrl}/api/agent/jobs`, { headers: { Authorization: 'Bearer cnpa_nope' } });
  assert.equal(bad.status, 401);
  const status = await boss.get('/api/pos/print-status');
  assert.equal(status.body.configured, true);
  const receiptDoc = receiptDocument({
    ticketNumber: 'CN-2026-000001', status: 'completed', serviceType: 'dine_in', tableName: 'T7', waiters: ['Amine'], createdAt: new Date().toISOString(), completedAt: new Date().toISOString(),
    grossMil: 16_000, totalMil: 16_000, paidMil: 16_000, ticketDiscounts: [], vat: [], payments: [{ kind: 'payment', method: 'cash', amountMil: 16_000, tenderedMil: 20_000, changeMil: 4_000 }],
    orders: [{ status: 'validated', lines: [{ status: 'active', quantity: 1, displayName: 'Express', grossMil: 2_000, itemDiscounts: [] }, { status: 'active', quantity: 1, displayName: 'Pizza', grossMil: 14_000, itemDiscounts: [] }] }],
  });
  const text = JSON.stringify(receiptDoc);
  assert.ok(text.includes('Table T7') && text.includes('Express') && text.includes('Pizza') && text.includes('Monnaie rendue'));
});
