import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startTestServer, type ApiClient, type TestContext } from './helpers.ts';

let ctx: TestContext;
let manager: ApiClient;
let cashier: ApiClient;
let cook: ApiClient;

before(async () => {
  ctx = await startTestServer();
  manager = await ctx.createUser('Direction Test', ['products:manage', 'products:view', 'offers:manage', 'pos:sell', 'pos:settings']);
  cashier = await ctx.createUser('Caisse Test', ['pos:sell']);
  cook = await ctx.createUser('Cuisine Test', ['prep:kitchen']);
});
after(async () => {
  await ctx.close();
});

const firstArticle = async (client: ApiClient, name: string) => {
  const res = await client.get('/api/pos/catalog');
  assert.equal(res.status, 200);
  return res.body.articles.find((a: { name: string }) => a.name === name);
};

test('the catalogue exposes prices in millimes, a prep destination and no costs', async () => {
  const cap = await firstArticle(cashier, 'Cappuccino');
  assert.equal(cap.unitPriceMil, 3500);
  assert.equal(cap.prepDestination, 'bar');
  assert.equal(cap.variantLabel, 'Taille');
  assert.ok(!('recipe' in cap));
  assert.ok(!('targetMarginRate' in cap));
});

test('availability is synchronised with the public menu and the V1 flag', async () => {
  const cap = await firstArticle(cashier, 'Cappuccino');
  const res = await cashier.patch(`/api/pos/catalog/articles/${cap.id}`, { availability: 'unavailable' });
  assert.equal(res.status, 200);
  assert.equal(res.body.availability, 'unavailable');
  const publicMenu = (await fetch(`${ctx.baseUrl}/api/products`).then((r) => r.json())) as { products: { id: string }[] };
  assert.ok(!publicMenu.products.some((p) => p.id === cap.id));
  const flag = ctx.db.prepare('SELECT is_available FROM catalog_articles WHERE id = ?').get(cap.id) as { is_available: number };
  assert.equal(flag.is_available, 0);

  // a cashier cannot hide a product nor change where it is prepared
  assert.equal((await cashier.patch(`/api/pos/catalog/articles/${cap.id}`, { availability: 'hidden' })).status, 403);
  assert.equal((await cashier.patch(`/api/pos/catalog/articles/${cap.id}`, { prepDestination: 'kitchen' })).status, 403);

  // V1 screens toggling the boolean keep the tri-state right
  ctx.db.prepare('UPDATE catalog_articles SET is_available = 1 WHERE id = ?').run(cap.id);
  assert.equal((await firstArticle(cashier, 'Cappuccino')).availability, 'available');

  assert.equal((await manager.patch(`/api/pos/catalog/articles/${cap.id}`, { availability: 'hidden' })).status, 200);
  assert.equal(await firstArticle(cashier, 'Cappuccino'), undefined);
  await manager.patch(`/api/pos/catalog/articles/${cap.id}`, { availability: 'available' });
});

test('a quote prices a cart server-side and applies active offers', async () => {
  const express = await firstArticle(cashier, 'Express / Espresso');
  const created = await manager.post('/api/pos/discounts', { name: 'Happy hour', kind: 'percent', value: 2000, scope: 'items', articleIds: [express.id] });
  assert.equal(created.status, 201);
  const quote = await cashier.post('/api/pos/quote', { lines: [{ articleId: express.id, quantity: 2, variantId: express.variants[0].id }] });
  assert.equal(quote.status, 200);
  assert.equal(quote.body.grossMil, 4000);
  assert.equal(quote.body.totalMil, 3200);
  assert.equal(quote.body.lines[0].discounts[0].label, 'Happy hour');
});

test('offers are validated and only managers can edit them', async () => {
  assert.equal((await manager.post('/api/pos/discounts', { name: 'X', kind: 'percent', value: 20_000, scope: 'items' })).status, 400);
  assert.equal((await cashier.post('/api/pos/discounts', { name: 'X', kind: 'fixed', value: 500, scope: 'ticket' })).status, 403);
  assert.equal((await cook.get('/api/pos/discounts')).status, 403);
});

test('pos settings are protected and validated', async () => {
  const res = await manager.put('/api/pos/settings', {
    manualDiscountMaxPercent: 15,
    consumptionZone: 'Dépôt',
    googleReviewUrl: 'https://g.page/r/cafenoir/review',
    reservationDurationMinutes: 90,
    reservationMaxPeople: 10,
    openingTime: '07:00',
    closingTime: '23:30',
    publicAppUrl: 'https://system.cafenoir.tn/',
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.publicAppUrl, 'https://system.cafenoir.tn');
  assert.equal((await cashier.put('/api/pos/settings', res.body)).status, 403);
});
