import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startTestServer, type TestContext } from './helpers.ts';
import { formatDt, parseDtInput, roundUpToCashStep, toMillimes } from '../../src/data/money.ts';

let ctx: TestContext;

before(async () => {
  ctx = await startTestServer();
});
after(async () => {
  await ctx.close();
});

test('money helpers work in integer millimes', () => {
  assert.equal(toMillimes(22.5), 22500);
  assert.equal(toMillimes(0.1 + 0.2), 300);
  assert.equal(formatDt(22500), '22,500 DT');
  assert.equal(formatDt(-8000, false), '-8,000');
  assert.equal(parseDtInput('30'), 30000);
  assert.equal(parseDtInput('22,5'), 22500);
  assert.equal(parseDtInput('abc'), null);
  assert.equal(roundUpToCashStep(22_430), 22_450);
});

test('staff profiles are created at boot with their starter grants', () => {
  const names = (ctx.db.prepare('SELECT name FROM roles').all() as { name: string }[]).map((r) => r.name);
  for (const profile of ['Direction', 'Gérant', 'Caisse', 'Serveur', 'Cuisine', 'Bar']) assert.ok(names.includes(profile), profile);
  const cuisine = ctx.db
    .prepare("SELECT permission_key FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE r.name = 'Cuisine'")
    .all() as { permission_key: string }[];
  assert.deepEqual(cuisine.map((p) => p.permission_key).sort(), ['prep:kitchen', 'prep:update', 'timeclock:self']);
});

test('the activity journal is append-only', () => {
  assert.throws(() => ctx.db.prepare("UPDATE activity_log SET description = 'x'").run(), /ne peut pas être modifié/);
  assert.throws(() => ctx.db.prepare('DELETE FROM activity_log').run(), /ne peut pas être supprimé/);
});

test('the live event stream requires a session', async () => {
  const res = await fetch(`${ctx.baseUrl}/api/events`);
  assert.equal(res.status, 401);
});

test('security headers are set and the session policy is readable by any signed-in user', async () => {
  const res = await fetch(`${ctx.baseUrl}/api/client/menu`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
  const cook = await ctx.createUser('Chef', ['prep:kitchen']);
  const policy = await cook.get('/api/pos/session-policy');
  assert.equal(policy.status, 200);
  assert.equal(policy.body.idleLogoutMinutes, 0);
  assert.equal((await fetch(`${ctx.baseUrl}/api/pos/session-policy`)).status, 401);
});
