import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startTestServer, type ApiClient, type TestContext } from './helpers.ts';
import { dotationBetween, schedule, situationAt } from '../../src/data/depreciation.ts';

let ctx: TestContext;
let boss: ApiClient;
let viewer: ApiClient;

before(async () => {
  ctx = await startTestServer();
  boss = await ctx.createUser('Direction', 'super-admin');
  viewer = await ctx.createUser('Gérant', ['equipment:view']);
});
after(async () => {
  await ctx.close();
});

const machine = { valueMil: 6_000_000, residualMil: 0, durationMonths: 60, inServiceDate: '2026-01-10' };

test('6 000 DT over 60 months: 100 DT a month, 1 200 DT a year', () => {
  const s = situationAt(machine, '2026-12');
  assert.equal(s.monthlyMil, 100_000);
  assert.equal(s.annualMil, 1_200_000);
  assert.equal(s.cumulativeMil, 1_200_000);
  assert.equal(s.netMil, 4_800_000);
  assert.equal(s.remainingMonths, 48);
  assert.equal(dotationBetween(machine, '2026-01', '2026-12'), 1_200_000);
});

test('rounding goes to the last month and the total is exact; nothing after retirement', () => {
  const odd = { valueMil: 1_000_000, residualMil: 0, durationMonths: 7, inServiceDate: '2026-03-01' };
  const rows = schedule(odd);
  assert.equal(rows.reduce((s, r) => s + r.dotationMil, 0), 1_000_000);
  assert.equal(rows.at(-1)!.netMil, 0);
  const withResidual = schedule({ ...machine, residualMil: 600_000 });
  assert.equal(withResidual[0].dotationMil, 90_000);
  assert.equal(withResidual.at(-1)!.netMil, 600_000);
  const retired = schedule({ ...machine, retiredOn: '2027-12-31' });
  assert.equal(retired.length, 24);
});

test('equipment register: create, schedule, retire; viewers cannot edit', async () => {
  const created = await boss.post('/api/pos/equipment', { name: 'Machine espresso', category: 'Machines', supplier: 'Fournisseur X', inServiceDate: '2026-01-10', valueMil: 6_000_000, durationMonths: 60 });
  assert.equal(created.status, 201);
  assert.equal(created.body.situation.monthlyMil, 100_000);
  assert.equal((await boss.post('/api/pos/equipment', { name: 'X', category: 'Y', inServiceDate: '2026-01-01', valueMil: 1000, residualMil: 1000, durationMonths: 12 })).status, 400);
  assert.equal((await viewer.post('/api/pos/equipment', { name: 'X', category: 'Y', inServiceDate: '2026-01-01', valueMil: 1000, durationMonths: 12 })).status, 403);
  const sched = await viewer.get(`/api/pos/equipment/${created.body.id}/schedule`);
  assert.equal(sched.body.schedule.length, 60);
  const period = await viewer.get('/api/pos/equipment-depreciation?from=2026-01&to=2026-12');
  assert.equal(period.body.totalMil, 1_200_000);
  const retired = await boss.post(`/api/pos/equipment/${created.body.id}/retire`, { date: '2026-06-30', reason: 'Panne définitive' });
  assert.equal(retired.body.status, 'retired');
  assert.equal((await viewer.get('/api/pos/equipment-depreciation?from=2026-07&to=2026-12')).body.totalMil, 0);
});
