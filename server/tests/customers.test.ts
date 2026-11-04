import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { ApiClient, key, startTestServer, type TestContext } from './helpers.ts';
import { setMailer, type MailMessage } from '../lib/mailer.ts';
import { tunisClock } from '../../src/data/pricing.ts';

let ctx: TestContext;
let boss: ApiClient;
let cashier: ApiClient;
let waiter: ApiClient;
let alice: ApiClient;
let bob: ApiClient;
let aliceId = '';
let sessionId = '';
let qrToken = '';
let tableId = '';
let croqueId = '';
let teaId = '';
const mails: MailMessage[] = [];

before(async () => {
  ctx = await startTestServer();
  setMailer({ enabled: true, send: async (m) => void mails.push(m) });
  boss = await ctx.createUser('Direction', 'super-admin');
  cashier = await ctx.createUser('Caisse', ['pos:sell', 'pos:collect', 'customers:view']);
  waiter = await ctx.createUser('Serveur', ['floor:view', 'orders:validate', 'orders:take', 'visits:manage', 'tables:all']);
  alice = new ApiClient(ctx.baseUrl);
  bob = new ApiClient(ctx.baseUrl);
  croqueId = randomUUID();
  teaId = randomUUID();
  ctx.db.prepare("INSERT INTO catalog_articles (id, name, category, price, created_at) VALUES (?, 'Croque', 'Snack', 10.0, '2026-01-01')").run(croqueId);
  ctx.db.prepare("INSERT INTO catalog_articles (id, name, category, price, created_at) VALUES (?, 'Thé', 'Infusions', 3.0, '2026-01-01')").run(teaId);
  const reg = await boss.get('/api/pos/registers');
  sessionId = (await boss.post('/api/pos/cash-sessions', { registerId: reg.body[0].id, openingFloatMil: 0 }, key())).body.id;
  const area = await boss.post('/api/pos/floor/areas', { name: 'Salle' });
  const table = await boss.post('/api/pos/floor/tables', { areaId: area.body.id, name: 'T5', shape: 'square', capacity: 4, x: 0, y: 0, width: 80, height: 80 });
  qrToken = table.body.qrToken;
  tableId = table.body.id;
});
after(async () => {
  await ctx.close();
});

const thisMonthBirthday = () => `1990-${tunisClock(new Date()).date.slice(5, 7)}-15`;

test('sign-up, duplicate email, lockout after repeated errors', async () => {
  const created = await alice.post('/api/client/account/register', { firstName: 'Alice', lastName: 'Ben Salah', email: 'Alice@Mail.tn', password: 'motdepasse1', phone: '22 123 456', birthday: thisMonthBirthday() });
  assert.equal(created.status, 201);
  aliceId = created.body.id;
  assert.equal(created.body.email, 'alice@mail.tn');
  assert.equal(created.body.phone, '22123456');
  assert.equal((await bob.post('/api/client/account/register', { firstName: 'X', lastName: 'Y', email: 'alice@mail.tn', password: 'motdepasse2' })).status, 409);
  assert.equal((await bob.post('/api/client/account/register', { firstName: 'Bob', lastName: 'Trabelsi', email: 'bob@mail.tn', password: 'court' })).status, 400);
  assert.equal((await bob.post('/api/client/account/register', { firstName: 'Bob', lastName: 'Trabelsi', email: 'bob@mail.tn', password: 'motdepasse2' })).status, 201);

  const intruder = new ApiClient(ctx.baseUrl);
  for (let i = 0; i < 5; i++) assert.equal((await intruder.post('/api/client/account/login', { email: 'bob@mail.tn', password: 'mauvais' })).status, 401);
  assert.equal((await intruder.post('/api/client/account/login', { email: 'bob@mail.tn', password: 'motdepasse2' })).status, 429);
  ctx.db.prepare("UPDATE customers SET locked_until = NULL WHERE email = 'bob@mail.tn'").run();
});

test('a customer session never opens an internal route', async () => {
  assert.equal((await alice.get('/api/pos/catalog')).status, 401);
  assert.equal((await alice.get('/api/sales/transactions')).status, 401);
  const me = await alice.get('/api/client/account/me');
  assert.equal(me.body.firstName, 'Alice');
});

test('password recovery by a one-time emailed link', async () => {
  const anon = new ApiClient(ctx.baseUrl);
  assert.equal((await anon.post('/api/client/account/forgot', { email: 'personne@mail.tn' })).body.sent, true);
  assert.equal(mails.length, 0, 'no mail, and no hint, for an unknown address');
  await anon.post('/api/client/account/forgot', { email: 'bob@mail.tn' });
  assert.equal(mails.length, 1);
  const token = /reinitialiser=([A-Za-z0-9_-]+)/.exec(mails[0].text)![1];
  assert.equal((await anon.post('/api/client/account/reset', { token, password: 'nouveau-mdp-1' })).status, 200);
  assert.equal((await anon.post('/api/client/account/reset', { token, password: 'encore-un-2' })).status, 400);
  assert.equal((await bob.get('/api/client/account/orders')).status, 401, 'other devices signed out');
  assert.equal((await bob.post('/api/client/account/login', { email: 'bob@mail.tn', password: 'nouveau-mdp-1' })).status, 200);
});

test('QR orders attach to the signed-in customer; history shows only their own orders', async () => {
  const visit = await waiter.post('/api/pos/visits', { tableId, covers: 2 });
  await alice.post(`/api/client/tables/${qrToken}/join`, { code: visit.body.joinCode });
  await bob.post(`/api/client/tables/${qrToken}/join`, { code: visit.body.joinCode });
  const aliceOrder = await alice.post(`/api/client/tables/${qrToken}/orders`, { lines: [{ articleId: croqueId, quantity: 1 }] }, key());
  const bobOrder = await bob.post(`/api/client/tables/${qrToken}/orders`, { lines: [{ articleId: teaId, quantity: 2 }] }, key());
  await waiter.post(`/api/pos/orders/${aliceOrder.body.id}/accept`);
  await waiter.post(`/api/pos/orders/${bobOrder.body.id}/accept`);
  const aliceHistory = await alice.get('/api/client/account/orders');
  assert.equal(aliceHistory.body.length, 1);
  assert.equal(aliceHistory.body[0].lines[0].displayName, 'Croque');
  assert.ok(!JSON.stringify(aliceHistory.body).includes('Thé'));
});

test('favourites and reorder use current prices and availability', async () => {
  await alice.post('/api/client/account/favorites', { articleId: croqueId });
  ctx.db.prepare('UPDATE catalog_articles SET price = 11.0 WHERE id = ?').run(croqueId);
  const favs = await alice.get('/api/client/account/favorites');
  assert.equal(favs.body[0].unitPriceMil, 11_000);
  const history = await alice.get('/api/client/account/orders');
  ctx.db.prepare("UPDATE catalog_articles SET availability = 'unavailable', is_available = 0 WHERE id = ?").run(teaId);
  const reorder = await alice.post(`/api/client/account/reorder/${history.body[0].id}`);
  assert.equal(reorder.body.lines[0].unitPriceMil, 11_000);
  ctx.db.prepare("UPDATE catalog_articles SET availability = 'available', is_available = 1, price = 10.0 WHERE id = ?").run(croqueId);
  ctx.db.prepare("UPDATE catalog_articles SET availability = 'available', is_available = 1 WHERE id = ?").run(teaId);
  assert.equal((await bob.post(`/api/client/account/reorder/${history.body[0].id}`)).status, 404);
});

test('points are earned once, after the bill is fully paid, on what was paid', async () => {
  const sale = await cashier.post('/api/pos/sales/counter', { sessionId, serviceType: 'takeaway', lines: [{ articleId: croqueId, quantity: 2 }, { articleId: teaId, quantity: 1 }] }, key());
  assert.equal((await cashier.post(`/api/pos/sales/${sale.body.id}/customer`, { customerId: aliceId, confirmedByCustomer: false })).status, 400);
  await cashier.post(`/api/pos/sales/${sale.body.id}/customer`, { customerId: aliceId, confirmedByCustomer: true });
  await cashier.post(`/api/pos/sales/${sale.body.id}/payments`, { sessionId, method: 'card', amountMil: 10_000 }, key());
  assert.equal((await alice.get('/api/client/account/loyalty')).body.balance, 0, 'no points on a partial payment');
  await cashier.post(`/api/pos/sales/${sale.body.id}/payments`, { sessionId, method: 'cash', amountMil: 13_000 }, key());
  const loyalty = await alice.get('/api/client/account/loyalty');
  assert.equal(loyalty.body.balance, 23);
  assert.equal(loyalty.body.history[0].type, 'earn');
  // replaying the completion hook cannot credit twice
  assert.throws(() => ctx.db.prepare("INSERT INTO loyalty_ledger (id, customer_id, type, points, sale_id, created_by, created_at) VALUES ('x', ?, 'earn', 5, ?, 't', 't')").run(aliceId, sale.body.id), /UNIQUE/);

  // excluded categories earn nothing
  await boss.put('/api/pos/loyalty/settings', { enabled: true, pointsPerDt: 1, excludedCategories: ['Infusions'], excludedArticleIds: [], validityDays: 0 });
  const tea = await cashier.post('/api/pos/sales/counter', { sessionId, serviceType: 'takeaway', lines: [{ articleId: teaId, quantity: 3 }] }, key());
  await cashier.post(`/api/pos/sales/${tea.body.id}/customer`, { customerId: aliceId, confirmedByCustomer: true });
  await cashier.post(`/api/pos/sales/${tea.body.id}/payments`, { sessionId, method: 'cash', amountMil: 9_000 }, key());
  assert.equal((await alice.get('/api/client/account/loyalty')).body.balance, 23);
});

test('rewards are redeemed at settlement; credit notes take points back; adjustments need a reason', async () => {
  const reward = await boss.post('/api/pos/loyalty/rewards', { name: '2 DT offerts', pointsCost: 20, kind: 'fixed', value: 2_000 });
  assert.equal(reward.status, 201);
  const sale = await cashier.post('/api/pos/sales/counter', { sessionId, serviceType: 'takeaway', lines: [{ articleId: croqueId, quantity: 1 }] }, key());
  assert.equal((await cashier.post(`/api/pos/sales/${sale.body.id}/rewards`, { rewardId: reward.body.id })).status, 409); // no customer yet
  await cashier.post(`/api/pos/sales/${sale.body.id}/customer`, { customerId: aliceId, confirmedByCustomer: true });
  const withReward = await cashier.post(`/api/pos/sales/${sale.body.id}/rewards`, { rewardId: reward.body.id });
  assert.equal(withReward.body.totalMil, 8_000);
  assert.equal(withReward.body.ticketDiscounts[0].source, 'loyalty');
  assert.equal((await alice.get('/api/client/account/loyalty')).body.available, 3, '20 points reserved');
  const paid = await cashier.post(`/api/pos/sales/${sale.body.id}/payments`, { sessionId, method: 'cash', amountMil: 8_000 }, key());
  const loyalty = await alice.get('/api/client/account/loyalty');
  assert.equal(loyalty.body.balance, 23 - 20 + 8);

  const corrected = await boss.post(`/api/pos/sales/${paid.body.sale.id}/corrections`, { lineIds: [paid.body.sale.orders[0].lines[0].id], reason: 'Retour', stockTreatment: 'none', refund: null }, key());
  assert.equal(corrected.status, 201);
  assert.equal((await alice.get('/api/client/account/loyalty')).body.balance, 3, 'the 8 earned points are taken back');

  assert.equal((await cashier.post(`/api/pos/customers/${aliceId}/points`, { points: 10, reason: 'Geste' })).status, 403);
  assert.equal((await boss.post(`/api/pos/customers/${aliceId}/points`, { points: 10, reason: '' })).status, 400);
  assert.equal((await boss.post(`/api/pos/customers/${aliceId}/points`, { points: -50, reason: 'Erreur' })).status, 409);
  assert.equal((await boss.post(`/api/pos/customers/${aliceId}/points`, { points: 10, reason: 'Geste commercial' })).body.balance, 13);
});

test('customer file: visits counted once per visit, spending net of credit notes', async () => {
  const file = await boss.get(`/api/pos/customers/${aliceId}`);
  assert.equal(file.status, 200);
  assert.ok(file.body.visitsCount >= 3);
  assert.deepEqual(file.body.topProducts.map((p: { name: string }) => p.name), ['Thé', 'Croque']);
  assert.equal((await cashier.get(`/api/pos/customers/${aliceId}`)).status, 200);
  const found = await cashier.get('/api/pos/customers?q=22123');
  assert.equal(found.body[0].id, aliceId);
});

test('targeted offer: computed audience, shown in the account, usable only by them', async () => {
  const preview = await boss.post('/api/pos/loyalty/offers/preview', { segment: { birthdayThisMonth: true } });
  assert.equal(preview.body.customerCount, 1);
  const offer = await boss.post('/api/pos/loyalty/offers', { name: 'Joyeux anniversaire', kind: 'percent', value: 5_000, scope: 'ticket', validDays: 30, segment: { birthdayThisMonth: true } });
  assert.equal(offer.body.customerCount, 1);
  assert.equal((await alice.get('/api/client/account/offers')).body[0].name, 'Joyeux anniversaire');
  assert.equal((await bob.get('/api/client/account/offers')).body.length, 0);
  const anonymous = await cashier.post('/api/pos/quote', { lines: [{ articleId: croqueId, quantity: 1 }] });
  assert.equal(anonymous.body.totalMil, 10_000);
  const forAlice = await cashier.post('/api/pos/quote', { lines: [{ articleId: croqueId, quantity: 1 }], customerId: aliceId });
  assert.equal(forAlice.body.totalMil, 5_000);
});

test('closing an account removes personal data but keeps the books', async () => {
  const sales = (ctx.db.prepare('SELECT COUNT(*) AS n FROM pos_sales WHERE customer_id = ?').get(aliceId) as { n: number }).n;
  assert.equal((await alice.post('/api/client/account/close', { password: 'faux' })).status, 400);
  assert.equal((await alice.post('/api/client/account/close', { password: 'motdepasse1' })).status, 200);
  const row = ctx.db.prepare('SELECT first_name, email, phone, birthday, status FROM customers WHERE id = ?').get(aliceId) as Record<string, string | null>;
  assert.equal(row.status, 'closed');
  assert.equal(row.phone, null);
  assert.ok(!row.email!.includes('alice'));
  assert.equal((ctx.db.prepare('SELECT COUNT(*) AS n FROM pos_sales WHERE customer_id = ?').get(aliceId) as { n: number }).n, sales);
  assert.equal((await alice.get('/api/client/account/me')).body, null);
  assert.equal((await new ApiClient(ctx.baseUrl).post('/api/client/account/login', { email: 'alice@mail.tn', password: 'motdepasse1' })).status, 401);
});
