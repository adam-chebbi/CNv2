import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { bounds, calibrateScale, chairPositions, fitArea, gapBetween, layoutWarnings, snap } from '../../src/data/floorScene.ts';
import { startTestServer, type ApiClient, type TestContext } from './helpers.ts';

let ctx: TestContext;
let boss: ApiClient;
let designer: ApiClient;
let librarian: ApiClient;
let waiter: ApiClient;
let areaId = '';
const tables: string[] = [];

const PNG = `data:image/png;base64,${Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c00000000049454e44ae426082', 'hex').toString('base64')}`;

const geometry = { widthCm: 1000, depthCm: 600, floorMaterial: 'tiles', wallColor: '#eeeeee', wallHeightCm: 280, backgroundAssetId: null, backgroundOpacity: 0.5, backgroundScale: 1, backgroundX: 0, backgroundY: 0 };
const place = (id: string, x: number, y: number) => ({ id, x, y, width: 80, height: 80, rotation: 0, shape: 'square', chairs: null, material: null });
const wall = (id = randomUUID()) => ({ id, kind: 'wall', label: null, x: 0, y: 0, width: 1000, height: 15, rotation: 0, elevationCm: 280, color: '#dddddd', material: 'brick', assetId: null });

before(async () => {
  ctx = await startTestServer();
  boss = await ctx.createUser('Direction', 'super-admin');
  designer = await ctx.createUser('Gérant plan', ['floor:view', 'floor:manage']);
  librarian = await ctx.createUser('Déco', ['floor:view', 'floor:assets']);
  waiter = await ctx.createUser('Serveur', ['floor:view']);
  areaId = (await boss.post('/api/pos/floor/areas', { name: 'Salle' })).body.id;
  for (const name of ['A1', 'A2']) tables.push((await boss.post('/api/pos/floor/tables', { areaId, name, shape: 'square', capacity: 4, x: 0, y: 0, width: 80, height: 80 })).body.id);
});
after(async () => {
  await ctx.close();
});

test('scene model: bounds, gaps, chairs, calibration', () => {
  const b = bounds({ x: 0, y: 0, width: 100, height: 20, rotation: 90 });
  assert.deepEqual([Math.round(b.minX), Math.round(b.minY), Math.round(b.maxX), Math.round(b.maxY)], [40, -40, 60, 60]);
  assert.equal(gapBetween({ x: 0, y: 0, width: 80, height: 80 }, { x: 130, y: 0, width: 80, height: 80 }), 50);
  assert.ok(gapBetween({ x: 0, y: 0, width: 80, height: 80 }, { x: 40, y: 40, width: 80, height: 80 }) < 0);
  const w = layoutWarnings([{ name: 'A', x: 0, y: 0, width: 80, height: 80 }, { name: 'B', x: 130, y: 0, width: 80, height: 80 }]);
  assert.deepEqual(w, [{ kind: 'narrow', a: 'A', b: 'B', gapCm: 50 }]);
  assert.equal(chairPositions({ shape: 'round', capacity: 4, width: 80, height: 80 }).length, 4);
  assert.equal(chairPositions({ shape: 'rect', capacity: 6, chairs: 8, width: 200, height: 80 }).length, 8);
  assert.equal(calibrateScale({ x: 0, y: 0 }, { x: 500, y: 0 }, 1000), 2);
  assert.equal(snap(127), 130);
  assert.deepEqual(fitArea([{ x: 1100, y: 10, width: 80, height: 80 }], { widthCm: 1000, depthCm: 600 }), { widthCm: 1220, depthCm: 600 });
});

test('only floor:manage edits the plan; overlaps are refused unless confirmed', async () => {
  const design = { geometry, elements: [wall()], tables: [place(tables[0], 100, 100), place(tables[1], 300, 100)] };
  assert.equal((await waiter.put(`/api/pos/floor/areas/${areaId}/design`, design)).status, 403);
  assert.equal((await librarian.put(`/api/pos/floor/areas/${areaId}/design`, design)).status, 403);

  const clash = { ...design, tables: [place(tables[0], 100, 100), place(tables[1], 140, 120)] };
  const refused = await designer.put(`/api/pos/floor/areas/${areaId}/design`, clash);
  assert.equal(refused.status, 409);
  assert.match(refused.body.error.message, /chevauchent/);
  assert.equal((await designer.put(`/api/pos/floor/areas/${areaId}/design`, { ...clash, allowOverlap: true })).status, 200);

  const saved = await designer.put(`/api/pos/floor/areas/${areaId}/design`, design);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.area.geometry.floorMaterial, 'tiles');
  assert.equal(saved.body.elements.length, 1);

  // what the waiters see
  const floor = (await waiter.get('/api/pos/floor')).body;
  assert.equal(floor.areas[0].geometry.widthCm, 1000);
  assert.equal(floor.elements.length, 1);
  assert.equal(floor.tables.find((t: { id: string }) => t.id === tables[1]).x, 300);

  // an element left out of the next save is archived
  const empty = await designer.put(`/api/pos/floor/areas/${areaId}/design`, { ...design, elements: [] });
  assert.equal(empty.body.elements.length, 0);
});

test('asset library: roles, validation and file serving', async () => {
  assert.equal((await waiter.post('/api/pos/floor/assets', { kind: 'texture', name: 'X', url: 'https://cdn.example.com/x.jpg' })).status, 403);
  assert.equal((await designer.post('/api/pos/floor/assets', { kind: 'texture', name: 'X', url: 'https://cdn.example.com/x.jpg' })).status, 403, 'textures belong to floor:assets');
  assert.equal((await librarian.post('/api/pos/floor/assets', { kind: 'texture', name: 'X', url: 'http://insecure.example.com/x.jpg' })).status, 400);
  assert.equal((await librarian.post('/api/pos/floor/assets', { kind: 'model', name: 'Faux', dataUrl: PNG.replace('image/png', 'model/gltf-binary') })).status, 400);

  const cdn = await librarian.post('/api/pos/floor/assets', { kind: 'texture', name: 'Terrazzo', url: 'https://cdn.example.com/terrazzo.jpg', tileCm: 80 });
  assert.equal(cdn.status, 201);
  assert.equal(cdn.body.source, 'cdn');
  const bg = await designer.post('/api/pos/floor/assets', { kind: 'background', name: 'Plan architecte', dataUrl: PNG });
  assert.equal(bg.status, 201, 'the plan background is part of floor:manage');

  const file = await waiter.get(bg.body.url);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'image/png');

  const design = { geometry: { ...geometry, backgroundAssetId: bg.body.id }, elements: [], tables: [place(tables[0], 100, 100), place(tables[1], 300, 100)] };
  assert.equal((await designer.put(`/api/pos/floor/areas/${areaId}/design`, design)).status, 200);
  assert.equal((await designer.put(`/api/pos/floor/areas/${areaId}/design`, { ...design, geometry: { ...geometry, backgroundAssetId: 'nope' } })).status, 400);
  assert.equal((await librarian.get('/api/pos/floor/assets')).body.length, 2);
});

test('plan versions are saved and re-applied outside service only', async () => {
  const winter = { geometry, elements: [wall()], tables: [place(tables[0], 100, 100), place(tables[1], 300, 100)] };
  await designer.put(`/api/pos/floor/areas/${areaId}/design`, winter);
  const version = await designer.post('/api/pos/floor/versions', { name: 'Hiver' });
  assert.equal(version.status, 201);

  await designer.put(`/api/pos/floor/areas/${areaId}/design`, { geometry: { ...geometry, floorMaterial: 'grass' }, elements: [], tables: [place(tables[0], 500, 300), place(tables[1], 700, 300)] });

  const visit = (await boss.post('/api/pos/visits', { tableId: tables[0], covers: 2 })).body.id;
  assert.equal((await designer.post(`/api/pos/floor/versions/${version.body.id}/apply`)).status, 409);
  await boss.post(`/api/pos/visits/${visit}/close`);

  assert.equal((await designer.post(`/api/pos/floor/versions/${version.body.id}/apply`)).status, 200);
  const floor = (await waiter.get('/api/pos/floor')).body;
  assert.equal(floor.areas[0].geometry.floorMaterial, 'tiles');
  assert.equal(floor.elements.length, 1);
  assert.equal(floor.tables.find((t: { id: string }) => t.id === tables[0]).x, 100);
  const journal = ctx.db.prepare("SELECT COUNT(*) AS n FROM activity_log WHERE action = 'Version du plan appliquée'").get() as { n: number };
  assert.equal(journal.n, 1);
});
