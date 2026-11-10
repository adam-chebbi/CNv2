import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { receiptDocument, setReceiptIdentityProvider, DEFAULT_IDENTITY } from '../../src/data/receipts.ts';
import { key, startTestServer, type ApiClient, type TestContext } from './helpers.ts';

let ctx: TestContext;
let boss: ApiClient;
const tables: string[] = [];
let coffee = '';
let croissant = '';

before(async () => {
  ctx = await startTestServer();
  boss = await ctx.createUser('Direction', 'super-admin');
  coffee = randomUUID();
  croissant = randomUUID();
  // A photo stored by the product form (data URL): screens get a short cached URL instead.
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  ctx.db.prepare("INSERT INTO catalog_articles (id, name, category, price, image_url, created_at) VALUES (?, 'Café direct', 'Cafés', 2.5, ?, '2026-01-01')").run(coffee, png);
  ctx.db.prepare("INSERT INTO catalog_articles (id, name, category, price, created_at) VALUES (?, 'Croissant', 'Viennoiseries', 2, '2026-01-01')").run(croissant);
  const area = await boss.post('/api/pos/floor/areas', { name: 'Rez-de-chaussée' });
  for (const name of ['T1', 'T2', 'T3']) {
    tables.push((await boss.post('/api/pos/floor/tables', { areaId: area.body.id, name, shape: 'round', capacity: 4, x: 0, y: 0, width: 80, height: 80 })).body.id);
  }
});
after(async () => {
  await ctx.close();
});

test('product photos are served as cached files, not inlined in the catalogue', async () => {
  const catalog = await boss.get('/api/pos/catalog');
  const a = catalog.body.articles.find((x: { id: string }) => x.id === coffee);
  assert.match(a.imageUrl, /^\/api\/client\/images\//);
  const img = await fetch(`${ctx.baseUrl}${a.imageUrl}`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.match(img.headers.get('cache-control') ?? '', /immutable/);
});

test('separating items sends them to a free table with their own bill; favourites follow sales', async () => {
  const v = (await boss.post('/api/pos/visits', { tableId: tables[0], covers: 4 })).body.id;
  const detail = await boss.post(`/api/pos/visits/${v}/orders`, { lines: [{ articleId: coffee, quantity: 2 }, { articleId: croissant, quantity: 1 }] }, key());
  const lines = detail.body.sales.find((s: { status: string }) => s.status === 'open').orders.flatMap((o: { lines: { id: string; displayName: string }[] }) => o.lines);
  const croissantLine = lines.find((l: { displayName: string }) => l.displayName === 'Croissant').id;

  assert.equal((await boss.post(`/api/pos/visits/${v}/fork`, { toTableId: tables[1], lineIds: lines.map((l: { id: string }) => l.id) })).status, 400, 'everything = transfer');
  const forked = await boss.post(`/api/pos/visits/${v}/fork`, { toTableId: tables[1], lineIds: [croissantLine], covers: 1 });
  assert.equal(forked.status, 201);
  assert.equal(forked.body.table.name, 'T2');
  assert.equal(forked.body.sales.find((s: { status: string }) => s.status === 'open').totalMil, 2_000);
  const source = await boss.get(`/api/pos/visits/${v}`);
  assert.equal(source.body.sales.find((s: { status: string }) => s.status === 'open').totalMil, 5_000);
  assert.equal((await boss.post(`/api/pos/visits/${v}/fork`, { toTableId: tables[1], lineIds: [lines[0].id] })).status, 409, 'target occupied');

  const favs = await boss.get('/api/pos/favorites');
  assert.equal(favs.body[0], coffee, 'best seller first');
});

test('receipt: café credentials from the settings, aligned rows, never a Wi-Fi line', async () => {
  const settings = (await boss.get('/api/pos/settings')).body;
  const saved = await boss.put('/api/pos/settings', { ...settings, legalName: 'Café Noir', address: 'Rue du Lac, 1053 Tunis', phone: '+216 71 000 000', website: 'cafenoir.tn', taxId: '1234567/A/M/000', tradeRegister: 'B0123' });
  assert.equal(saved.status, 200);

  const sale = {
    ticketNumber: 'CN-2026-000042', status: 'completed', serviceType: 'dine_in' as const, tableName: 'T1', waiters: ['Sami'], createdAt: new Date().toISOString(), completedAt: new Date().toISOString(),
    grossMil: 5_000, totalMil: 5_000, paidMil: 5_000, ticketDiscounts: [], vat: [{ rate: 0.19, baseMil: 4_202, vatMil: 798 }],
    payments: [{ kind: 'payment', method: 'cash', amountMil: 5_000, tenderedMil: 10_000, changeMil: 5_000 }],
    orders: [{ status: 'validated', lines: [{ status: 'active', quantity: 2, displayName: 'Café direct', grossMil: 5_000, itemDiscounts: [] }] }],
  };
  setReceiptIdentityProvider(() => ({ ...DEFAULT_IDENTITY, name: 'Café Noir', address: 'Rue du Lac, 1053 Tunis', phone: '+216 71 000 000', website: 'cafenoir.tn', taxId: '1234567/A/M/000', tradeRegister: 'B0123' }));
  const text = JSON.stringify(receiptDocument(sale));
  for (const part of ['CAFÉ NOIR', 'Rue du Lac, 1053 Tunis', 'Tél. +216 71 000 000 · cafenoir.tn', 'MF 1234567/A/M/000 · RC B0123', 'Ticket CN-2026-000042', 'Table T1', 'Serveur Sami', 'TOTAL', 'Monnaie rendue']) {
    assert.ok(text.includes(part), part);
  }
  assert.ok(!/wi-?fi|mot de passe/i.test(text), 'no Wi-Fi password on the ticket');
  setReceiptIdentityProvider(() => DEFAULT_IDENTITY);
});
