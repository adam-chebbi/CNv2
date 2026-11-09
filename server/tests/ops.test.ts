import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startTestServer, type TestContext } from './helpers.ts';

let ctx: TestContext;

before(async () => {
  ctx = await startTestServer();
});
after(async () => {
  await ctx.close();
});

test('health probe is public, cheap and says what is wrong', async () => {
  const res = await fetch(`${ctx.baseUrl}/api/health`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const body = (await res.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.equal(body.database, 'ok');
  assert.ok(['ok', 'degraded'].includes(body.status));
  assert.equal(typeof body.uptimeSeconds, 'number');
  assert.ok('responseMs' in body);
  assert.equal(body.users, undefined, 'no business data');
});

test('content security policy is sent (report-only by default) and reports are accepted', async () => {
  const res = await fetch(`${ctx.baseUrl}/api/health`);
  const policy = res.headers.get('content-security-policy-report-only');
  assert.ok(policy?.includes("object-src 'none'"));
  assert.ok(policy?.includes("frame-ancestors 'self'"));
  assert.equal(res.headers.get('content-security-policy'), null);
  const report = await fetch(`${ctx.baseUrl}/api/csp-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/csp-report' },
    body: JSON.stringify({ 'csp-report': { 'violated-directive': 'img-src', 'blocked-uri': 'http://x.test/a.png', 'document-uri': 'https://testv2/' } }),
  });
  assert.equal(report.status, 204, 'no session nor CSRF token needed');
});
