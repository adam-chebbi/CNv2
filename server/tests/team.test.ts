import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { key, startTestServer, type ApiClient, type TestContext } from './helpers.ts';
import { buildShifts } from '../../src/data/timeclock.ts';
import { tunisClock } from '../../src/data/pricing.ts';

let ctx: TestContext;
let boss: ApiClient;
let amine: ApiClient;
let sami: ApiClient;
let amineId = '';

before(async () => {
  ctx = await startTestServer();
  boss = await ctx.createUser('Direction', 'super-admin');
  amine = await ctx.createUser('Amine', ['timeclock:self', 'stats:self', 'floor:view', 'orders:take', 'visits:manage', 'cancel:request']);
  sami = await ctx.createUser('Sami', ['timeclock:self', 'stats:self', 'floor:view', 'orders:take', 'visits:manage']);
  amineId = (ctx.db.prepare("SELECT id FROM users WHERE full_name = 'Amine'").get() as { id: string }).id;
});
after(async () => {
  await ctx.close();
});

const at = (hhmm: string) => `2026-11-02T${hhmm}:00+01:00`;

test('08:00 → 16:30 with a 30-minute break is eight hours worked', () => {
  const [shift] = buildShifts([
    { id: '1', action: 'in', at: at('08:00') },
    { id: '2', action: 'break_start', at: at('12:00') },
    { id: '3', action: 'break_end', at: at('12:30') },
    { id: '4', action: 'out', at: at('16:30') },
  ]);
  assert.equal(shift.workedMinutes, 480);
  assert.deepEqual(shift.anomalies, []);
});

test('a forgotten departure never produces an invented duration; incoherences are flagged', () => {
  const shifts = buildShifts([
    { id: '1', action: 'in', at: at('08:00') },
    { id: '2', action: 'in', at: at('09:00') },
    { id: '3', action: 'break_end', at: at('10:00') },
  ]);
  assert.equal(shifts.length, 2);
  assert.equal(shifts[0].workedMinutes, null);
  assert.ok(shifts[0].anomalies.includes('Départ manquant'));
  assert.ok(shifts[1].anomalies.includes('Retour de pause sans départ en pause'));
});

test('clocking in: the server sets the time, logging in is not an arrival, double taps are ignored', async () => {
  const before = await amine.get('/api/pos/timeclock/me');
  assert.equal(before.body.state, 'off');
  assert.deepEqual(before.body.allowed, ['in']);
  assert.equal((await amine.post('/api/pos/timeclock', { action: 'in' })).body.state, 'working');
  await amine.post('/api/pos/timeclock', { action: 'in' });
  const events = ctx.db.prepare("SELECT COUNT(*) AS n FROM timeclock_events WHERE user_id = ? AND action = 'in'").get(amineId) as { n: number };
  assert.equal(events.n, 1);
  await amine.post('/api/pos/timeclock', { action: 'break_end' }); // out of sequence: recorded and flagged
  const flagged = ctx.db.prepare('SELECT COUNT(*) AS n FROM timeclock_events WHERE user_id = ? AND incoherent = 1').get(amineId) as { n: number };
  assert.equal(flagged.n, 1);
  assert.equal((await sami.get('/api/pos/timeclock/team')).status, 403);
});

test('corrections keep the initial value and the author; adding a forgotten departure needs a reason', async () => {
  const me = await amine.get('/api/pos/timeclock/me');
  const arrival = me.body.events.find((e: { action: string }) => e.action === 'in');
  assert.equal((await amine.post(`/api/pos/timeclock/events/${arrival.id}/correct`, { at: new Date().toISOString(), reason: 'erreur' })).status, 403);
  const earlier = new Date(Date.now() - 2 * 3600_000).toISOString();
  assert.equal((await boss.post(`/api/pos/timeclock/events/${arrival.id}/correct`, { at: earlier })).status, 400);
  assert.equal((await boss.post(`/api/pos/timeclock/events/${arrival.id}/correct`, { at: earlier, reason: 'Badge oublié' })).status, 200);
  const row = ctx.db.prepare('SELECT occurred_at, original_at FROM timeclock_events WHERE id = ?').get(arrival.id) as { occurred_at: string; original_at: string };
  assert.equal(row.original_at, arrival.at);
  const history = await boss.get(`/api/pos/timeclock/events/${arrival.id}/corrections`);
  assert.equal(history.body[0].createdBy, 'Direction');
  assert.equal((await boss.post('/api/pos/timeclock/events', { userId: amineId, action: 'out', at: new Date(Date.now() + 3600_000).toISOString(), reason: 'futur' })).status, 400);
  assert.equal((await boss.post('/api/pos/timeclock/events', { userId: amineId, action: 'out', at: new Date().toISOString(), reason: 'Départ oublié' })).status, 201);
  const team = await boss.get('/api/pos/timeclock/team');
  const person = team.body.people.find((p: { name: string }) => p.name === 'Amine');
  assert.ok(person.workedMinutes >= 119);
});

test('waiter statistics: own figures only; revenue credited to the waiter responsible at validation', async () => {
  const croque = randomUUID();
  ctx.db.prepare("INSERT INTO catalog_articles (id, name, category, price, created_at) VALUES (?, 'Croque', 'Snack', 10.0, '2026-01-01')").run(croque);
  const area = await boss.post('/api/pos/floor/areas', { name: 'Salle' });
  const table = await boss.post('/api/pos/floor/tables', { areaId: area.body.id, name: 'T1', shape: 'square', capacity: 4, x: 0, y: 0, width: 80, height: 80 });
  const section = await boss.post('/api/pos/floor/sections', { name: 'A', tableIds: [table.body.id] });
  await boss.post(`/api/pos/floor/sections/${section.body.id}/assign`, { waiterId: amineId });
  const visit = await amine.post('/api/pos/visits', { tableId: table.body.id, covers: 3 });
  await amine.post(`/api/pos/visits/${visit.body.id}/orders`, { lines: [{ articleId: croque, quantity: 2 }] }, key());
  // the manager collects: the revenue still belongs to Amine
  const reg = await boss.get('/api/pos/registers');
  const session = await boss.post('/api/pos/cash-sessions', { registerId: reg.body[0].id, openingFloatMil: 0 }, key());
  const detail = await boss.get(`/api/pos/visits/${visit.body.id}`);
  await boss.post(`/api/pos/sales/${detail.body.sales[0].id}/payments`, { sessionId: session.body.id, method: 'card', amountMil: 20_000 }, key());
  await amine.post(`/api/pos/visits/${visit.body.id}/close`);

  const mine = await amine.get('/api/pos/stats/waiters/me');
  assert.equal(mine.body.stats.revenueMil, 20_000);
  assert.equal(mine.body.stats.visitsServed, 1);
  assert.equal(mine.body.stats.covers, 3);
  assert.equal((await amine.get('/api/pos/stats/waiters')).status, 403);
  const samiStats = await sami.get('/api/pos/stats/waiters/me');
  assert.equal(samiStats.body.stats.revenueMil, 0);
  const all = await boss.get(`/api/pos/stats/waiters?from=${tunisClock(new Date()).date}`);
  assert.equal(all.body.rows.find((r: { name: string }) => r.name === 'Direction')?.revenueMil ?? 0, 0);
});
