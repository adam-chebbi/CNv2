import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ApiClient, startTestServer, type TestContext } from './helpers.ts';
import { tunisClock } from '../../src/data/pricing.ts';
import { setRateLimitEnabled } from '../lib/rateLimit.ts';

let ctx: TestContext;
let manager: ApiClient;
let viewer: ApiClient;
let guest: ApiClient;
let tableId = '';
let bigTableId = '';

const inDays = (n: number) => tunisClock(new Date(Date.now() + n * 86_400_000)).date;
const TOMORROW = inDays(1);

before(async () => {
  ctx = await startTestServer();
  manager = await ctx.createUser('Gérant', ['reservations:view', 'reservations:manage', 'visits:manage', 'floor:view', 'floor:manage', 'tables:all', 'actions:view']);
  viewer = await ctx.createUser('Caisse', ['reservations:view']);
  guest = new ApiClient(ctx.baseUrl);
  const area = await manager.post('/api/pos/floor/areas', { name: 'Salle' });
  tableId = (await manager.post('/api/pos/floor/tables', { areaId: area.body.id, name: 'T1', shape: 'square', capacity: 2, x: 0, y: 0, width: 80, height: 80 })).body.id;
  bigTableId = (await manager.post('/api/pos/floor/tables', { areaId: area.body.id, name: 'T9', shape: 'rect', capacity: 6, x: 100, y: 0, width: 160, height: 80 })).body.id;
});
after(async () => {
  await ctx.close();
});

const request = (overrides: Record<string, unknown> = {}) =>
  guest.post('/api/client/reservations', { name: 'Leila Mansour', phone: '98 765 432', date: TOMORROW, time: '20:00', people: 4, comment: 'Anniversaire', ...overrides });

test('an online request stays pending until the team confirms it', async () => {
  const res = await request();
  assert.equal(res.status, 201);
  assert.equal(res.body.status, 'pending');
  assert.match(res.body.message, /en attente de confirmation/);
  assert.equal(res.body.phone, undefined, 'contact details are not echoed publicly');
  const actions = await manager.get('/api/pos/actions');
  assert.ok(actions.body.some((a: { kind: string; refId: string }) => a.kind === 'reservation' && a.refId === res.body.id));
});

test('bad requests are refused: past date, closed hours, large groups, robots, bad phone', async () => {
  assert.equal((await request({ date: inDays(-1) })).status, 400);
  assert.equal((await request({ time: '03:00' })).status, 400);
  assert.equal((await request({ people: 40 })).status, 400);
  assert.equal((await request({ website: 'http://spam' })).status, 400);
  assert.equal((await request({ phone: '123' })).status, 400);
});

test('the team checks conflicts and capacity, confirms with a table, refuses with a reason', async () => {
  const list = await manager.get(`/api/pos/reservations?from=${TOMORROW}&to=${TOMORROW}`);
  const pending = list.body[0];
  assert.equal(pending.phone, '98765432');

  const phoneBooking = await manager.post('/api/pos/reservations', { name: 'Karim', phone: '20111222', date: TOMORROW, time: '19:30', people: 2, tableId: bigTableId });
  assert.equal(phoneBooking.body.status, 'confirmed');

  const availability = await manager.get(`/api/pos/reservations/availability?date=${TOMORROW}&time=20:00&people=4`);
  const t1 = availability.body.find((t: { id: string }) => t.id === tableId);
  const t9 = availability.body.find((t: { id: string }) => t.id === bigTableId);
  assert.equal(t1.fits, false);
  assert.equal(t9.conflict.name, 'Karim');

  const conflict = await manager.post(`/api/pos/reservations/${pending.id}/status`, { status: 'confirmed', tableId: bigTableId });
  assert.equal(conflict.status, 409);
  assert.match(conflict.body.error.message, /Karim/);
  assert.equal((await viewer.post(`/api/pos/reservations/${pending.id}/status`, { status: 'confirmed', tableId })).status, 403);

  const moved = await manager.put(`/api/pos/reservations/${phoneBooking.body.id}`, { name: 'Karim', phone: '20111222', date: TOMORROW, time: '18:00', people: 2, tableId: tableId });
  assert.equal(moved.status, 200);
  const confirmed = await manager.post(`/api/pos/reservations/${pending.id}/status`, { status: 'confirmed', tableId: bigTableId });
  assert.equal(confirmed.body.status, 'confirmed');
  assert.equal(confirmed.body.tableName, 'T9');

  const other = await request({ name: 'Sonia', people: 2, time: '21:00' });
  assert.equal((await manager.post(`/api/pos/reservations/${other.body.id}/status`, { status: 'rejected' })).status, 400);
  assert.equal((await manager.post(`/api/pos/reservations/${other.body.id}/status`, { status: 'rejected', note: 'Complet' })).body.status, 'rejected');
  assert.equal((await manager.post(`/api/pos/reservations/${other.body.id}/status`, { status: 'confirmed' })).status, 409);
  const history = await manager.get(`/api/pos/reservations/${pending.id}/history`);
  assert.deepEqual(history.body.map((h: { to: string }) => h.to), ['pending', 'confirmed']);
});

test('a customer follows their reservations and can cancel or ask for a change', async () => {
  const client = new ApiClient(ctx.baseUrl);
  await client.post('/api/client/account/register', { firstName: 'Nour', lastName: 'Zid', email: 'nour@mail.tn', password: 'motdepasse1' });
  const booked = await client.post('/api/client/reservations', { name: 'Nour Zid', phone: '55123456', date: inDays(2), time: '12:30', people: 2 });
  const mine = await client.get('/api/client/account/reservations');
  assert.equal(mine.body.length, 1);
  assert.equal((await guest.get('/api/client/account/reservations')).status, 401);
  const change = await client.post(`/api/client/account/reservations/${booked.body.id}/request`, { type: 'change', message: 'Plutôt 13h' });
  assert.equal(change.body.changeRequest, 'Plutôt 13h');
  const cancelled = await client.post(`/api/client/account/reservations/${booked.body.id}/request`, { type: 'cancel' });
  assert.equal(cancelled.body.status, 'cancelled');
});

test('arrival seats the guests: a visit opens with the covers, and closing it completes the booking', async () => {
  const today = tunisClock(new Date());
  const later = tunisClock(new Date(Date.now() + 30 * 60_000));
  if (later.date !== today.date || later.time >= '23:00' || later.time < '07:00') return; // outside opening hours: nothing to check today
  const booking = await manager.post('/api/pos/reservations', { name: 'Hedi', phone: '22333444', date: today.date, time: later.time, people: 3, tableId: bigTableId });
  const floor = await manager.get('/api/pos/floor');
  assert.equal(floor.body.tables.find((t: { id: string }) => t.id === bigTableId).upcomingReservation.name, 'Hedi');
  assert.equal(floor.body.tables.find((t: { id: string }) => t.id === tableId).upcomingReservation, null);

  const arrived = await manager.post(`/api/pos/reservations/${booking.body.id}/status`, { status: 'arrived' });
  assert.equal(arrived.body.status, 'arrived');
  const visit = await manager.get(`/api/pos/visits/${arrived.body.visitId}`);
  assert.equal(visit.body.covers, 3);
  assert.equal((await manager.post(`/api/pos/visits/${arrived.body.visitId}/close`)).status, 200);
  const done = await manager.get(`/api/pos/reservations?from=${today.date}&to=${today.date}`);
  assert.equal(done.body.find((r: { id: string }) => r.id === booking.body.id).status, 'completed');
});

test('online requests are rate-limited per address', async () => {
  setRateLimitEnabled(true);
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) statuses.push((await request({ name: `Spam ${i}`, time: '10:00' })).status);
  setRateLimitEnabled(false);
  assert.deepEqual(statuses.slice(0, 5), [201, 201, 201, 201, 201]);
  assert.equal(statuses[5], 429);
});
