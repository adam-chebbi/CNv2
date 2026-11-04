import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import type express from 'express';
import { createApp } from '../app.ts';
import { openDatabase } from '../db/connection.ts';
import { createUser } from '../lib/localAuth.ts';
import { addDays } from '../../shared/model.ts';

// End-to-end: the real Historique app (with its own accounts) on a throwaway database.

process.env.TZ = 'Africa/Tunis';

interface TestUser {
  email: string;
  fullName: string;
  password: string;
  role: 'admin' | 'gerant';
  mustChangePassword: boolean;
}

const USERS: Record<string, TestUser> = {
  gerant: { email: 'sami@cafe.tn', fullName: 'Sami Gérant', password: 'secret-sami-1', role: 'gerant', mustChangePassword: false },
  gerant2: { email: 'ines@cafe.tn', fullName: 'Ines Gérante', password: 'secret-ines-2', role: 'gerant', mustChangePassword: false },
  patron: { email: 'patron@cafe.tn', fullName: 'Le Patron', password: 'secret-patron-3', role: 'admin', mustChangePassword: false },
  nouveau: { email: 'Contact@Cafe.tn', fullName: 'Nouvel Admin', password: 'temporaire', role: 'admin', mustChangePassword: true },
};

const sentMails: { to: string; subject: string; html: string; text: string }[] = [];
const fakeMailer = { enabled: true, send: async (m: { to: string; subject: string; html: string; text: string }) => void sentMails.push(m) };
const tick = () => new Promise((r) => setTimeout(r, 30));

let appServer: ReturnType<express.Express['listen']>;
let baseUrl = '';
let tmpDir = '';
let testDb: ReturnType<typeof openDatabase>;

class Client {
  cookies = new Map<string, string>();
  async req(method: string, url: string, body?: unknown, opts: { csrf?: boolean } = {}) {
    const headers: Record<string, string> = {};
    if (this.cookies.size) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (method !== 'GET' && opts.csrf !== false && this.cookies.get('csrf_token')) headers['x-csrf-token'] = this.cookies.get('csrf_token')!;
    const res = await fetch(`${baseUrl}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    res.headers.getSetCookie().forEach((c) => {
      const [pair, ...attrs] = c.split(';');
      const [k, v] = pair.split('=');
      if (attrs.some((a) => /expires=thu, 01 jan 1970/i.test(a.trim())) || v === '') this.cookies.delete(k);
      else this.cookies.set(k, v);
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, body: json };
  }
  async login(key: string) {
    await this.req('GET', '/api/health');
    return this.req('POST', '/api/auth/login', { email: USERS[key].email, password: USERS[key].password });
  }
}

let today = '';
const gerant = new Client();
const gerant2 = new Client();
const patron = new Client();

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'historique-test-'));
  testDb = openDatabase(path.join(tmpDir, 'test.sqlite3'));
  Object.values(USERS).forEach((u) => createUser(testDb, u));
  const { app } = createApp({ db: testDb, mailer: fakeMailer, publicUrl: 'https://historique.test' });
  await new Promise<void>((resolve) => {
    appServer = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(appServer.address() as AddressInfo).port}`;
  assert.equal((await gerant.login('gerant')).status, 200);
  assert.equal((await gerant2.login('gerant2')).status, 200);
  assert.equal((await patron.login('patron')).status, 200);
  today = (await gerant.req('GET', '/api/auth/me')).body.businessDate;
});

after(() => {
  appServer?.close();
  testDb?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('unauthenticated requests are refused', async () => {
  const anon = new Client();
  assert.equal((await anon.req('GET', `/api/caisse/${today}`)).status, 401);
});

test('own accounts: email is case-insensitive, wrong password refused, own cookie (not the main app one)', async () => {
  const c = new Client();
  await c.req('GET', '/api/health');
  assert.equal((await c.req('POST', '/api/auth/login', { email: 'SAMI@cafe.tn', password: 'nope' })).status, 401);
  const ok = await c.req('POST', '/api/auth/login', { email: 'SAMI@cafe.tn', password: USERS.gerant.password });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.fullName, 'Sami Gérant');
  assert.ok(c.cookies.has('hist_session'));
  assert.equal(c.cookies.has('session'), false);
});

test('first login with a temporary password: everything is blocked until a new password is chosen', async () => {
  const c = new Client();
  const login = await c.login('nouveau');
  assert.equal(login.status, 200);
  assert.equal(login.body.user.mustChangePassword, true);
  assert.equal((await c.req('GET', '/api/auth/me')).body.user.mustChangePassword, true);
  const blocked = await c.req('GET', `/api/caisse/${today}`);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error.code, 'PASSWORD_CHANGE_REQUIRED');
  assert.equal((await c.req('POST', '/api/auth/change-password', { currentPassword: 'faux', newPassword: 'nouveau-mdp-1' })).status, 400);
  assert.equal((await c.req('POST', '/api/auth/change-password', { currentPassword: 'temporaire', newPassword: 'court' })).status, 400);
  assert.equal((await c.req('POST', '/api/auth/change-password', { currentPassword: 'temporaire', newPassword: 'temporaire' })).status, 400);
  assert.equal((await c.req('POST', '/api/auth/change-password', { currentPassword: 'temporaire', newPassword: 'nouveau-mdp-1' })).status, 204);
  assert.equal((await c.req('GET', `/api/caisse/${today}`)).status, 200);
  // The temporary password no longer works; the new one does.
  const again = new Client();
  await again.req('GET', '/api/health');
  assert.equal((await again.req('POST', '/api/auth/login', { email: 'contact@cafe.tn', password: 'temporaire' })).status, 401);
  assert.equal((await again.req('POST', '/api/auth/login', { email: 'contact@cafe.tn', password: 'nouveau-mdp-1' })).body.user.mustChangePassword, false);
});

test('5 wrong passwords lock the account for a while', async () => {
  createUser(testDb, { email: 'lock@cafe.tn', fullName: 'Lock', password: 'correct-horse', role: 'gerant', mustChangePassword: false });
  const c = new Client();
  await c.req('GET', '/api/health');
  for (let i = 0; i < 5; i++) await c.req('POST', '/api/auth/login', { email: 'lock@cafe.tn', password: 'bad' });
  assert.equal((await c.req('POST', '/api/auth/login', { email: 'lock@cafe.tn', password: 'correct-horse' })).status, 423);
});

test('mutations without the CSRF header are refused', async () => {
  const res = await gerant.req('PUT', `/api/caisse/${today}/matin`, { ca: 1000, depenses: [], tpe: 0, ticketsResto: 0 }, { csrf: false });
  assert.equal(res.status, 403);
});

test('the terminal knows its first day and today', async () => {
  const meta = (await gerant.req('GET', '/api/caisse/meta')).body;
  assert.equal(meta.today, today);
  assert.ok(meta.dateDebut <= today);
});

test('a service: CA − dépenses = caisse; TPE and tickets entered, espèces = the rest', async () => {
  const body = {
    ca: 450000,
    depenses: [
      { libelle: 'Lait', montant: 12500 },
      { libelle: 'Pain', montant: 7500 },
    ],
    tpe: 120000,
    ticketsResto: 35000,
  };
  const res = await gerant.req('PUT', `/api/caisse/${today}/matin`, body);
  assert.equal(res.status, 200);
  assert.equal(res.body.item.totalDepenses, 20000);
  assert.equal(res.body.item.attenduCaisse, 430000);
  assert.equal(res.body.item.especes, 430000 - 120000 - 35000);
  assert.equal(res.body.item.creeParNom, 'Sami Gérant');

  // Saving again corrects the same service — never a duplicate — and keeps who corrected it.
  const fix = await gerant2.req('PUT', `/api/caisse/${today}/matin`, { ...body, tpe: 100000 });
  assert.equal(fix.body.item.especes, 430000 - 100000 - 35000);
  assert.equal(fix.body.item.majParNom, 'Ines Gérante');
  const day = (await gerant.req('GET', `/api/caisse/${today}`)).body;
  assert.equal(day.items.length, 1);
  assert.equal(day.canWrite, true);

  // The evening service is separate.
  assert.equal((await gerant.req('PUT', `/api/caisse/${today}/soir`, { ca: 300000, depenses: [], tpe: 0, ticketsResto: 0 })).body.item.especes, 300000);
  assert.equal((await gerant.req('GET', `/api/caisse/${today}`)).body.items.length, 2);
});

test('impossible amounts are refused with a plain message', async () => {
  const bad = async (body: object) => (await gerant.req('PUT', `/api/caisse/${today}/matin`, body)).body.error.message as string;
  assert.match(await bad({ ca: 0, depenses: [], tpe: 0, ticketsResto: 0 }), /chiffre d'affaires/);
  assert.match(await bad({ ca: 10000, depenses: [{ libelle: 'Gaz', montant: 20000 }], tpe: 0, ticketsResto: 0 }), /dépassent le chiffre/);
  assert.match(await bad({ ca: 10000, depenses: [], tpe: 8000, ticketsResto: 5000 }), /TPE et les tickets/);
  assert.match(await bad({ ca: 10000, depenses: [{ libelle: '', montant: 1000 }], tpe: 0, ticketsResto: 0 }), /à quoi correspond/);
  assert.equal((await gerant.req('PUT', `/api/caisse/${today}/nuit`, { ca: 1, depenses: [], tpe: 0, ticketsResto: 0 })).status, 400);
});

test('no entry on a future date nor before the app existed; old days are read-only for a Gérant', async () => {
  const ok = { ca: 1000, depenses: [], tpe: 0, ticketsResto: 0 };
  assert.equal((await gerant.req('PUT', `/api/caisse/${addDays(today, 1)}/matin`, ok)).status, 403);
  const meta = (await gerant.req('GET', '/api/caisse/meta')).body;
  assert.equal((await patron.req('PUT', `/api/caisse/${addDays(meta.dateDebut, -1)}/matin`, ok)).status, 403);
});

test('history lists every saved service with the period totals', async () => {
  const h = (await gerant.req('GET', `/api/caisse?from=${today}&to=${today}`)).body;
  assert.equal(h.items.length, 2);
  assert.equal(h.items[0].shift, 'soir');
  assert.equal(h.totals.ca, 750000);
  assert.equal(h.totals.especes, 295000 + 300000);
  assert.equal(h.totals.tpe, 100000);
});

test('every save is kept in the audit trail with the previous values', async () => {
  const rows = testDb.prepare("SELECT action, details FROM activity_log WHERE module = 'caisse' ORDER BY timestamp").all() as { action: string; details: string }[];
  assert.deepEqual(
    rows.map((r) => r.action),
    ['creation', 'modification', 'creation']
  );
  assert.equal(JSON.parse(rows[1].details).avant.tpe, 120000);
});

test('the first selectable day moves back when older records exist (imported history)', async () => {
  const old = addDays(today, -40);
  testDb
    .prepare(
      `INSERT INTO caisses (id, date, shift, ca, depenses, total_depenses, attendu_caisse, tpe, tickets_resto, especes, cree_par_id, cree_par_nom, cree_le)
       VALUES ('old-1', ?, 'matin', 1000, '[]', 0, 1000, 0, 0, 1000, 'seed-demo', 'Démo', ?)`
    )
    .run(old, new Date().toISOString());
  assert.equal((await gerant.req('GET', '/api/caisse/meta')).body.dateDebut, old);
  assert.equal((await gerant.req('GET', `/api/caisse?from=${old}&to=${old}`)).body.items.length, 1);
  // ...but it stays read-only for a Gérant (outside the 3-day correction window).
  assert.equal((await gerant.req('GET', `/api/caisse/${old}`)).body.canWrite, false);
});

test('avances: saved with date and time, names remembered, independent from the caisse', async () => {
  const caisseBefore = (await gerant.req('GET', `/api/caisse?from=${today}&to=${today}`)).body.totals;
  const a = await gerant.req('POST', '/api/avances', { id: crypto.randomUUID(), employe: '  Ahmed   Ben Ali ', montant: 70000, motif: 'Transport' });
  assert.equal(a.status, 201);
  assert.equal(a.body.item.employe, 'Ahmed Ben Ali');
  assert.match(a.body.item.heure, /^\d{2}:\d{2}$/);
  assert.equal(a.body.item.saisieManuelle, false);
  assert.equal(a.body.item.supprimable, true);

  // Manual date/time: kept as typed; the future is refused.
  const yesterday = addDays(today, -1);
  const m = await gerant.req('POST', '/api/avances', { employe: 'ahmed ben ali', montant: 20000, saisieManuelle: true, date: yesterday, heure: '09:15' });
  assert.equal(m.body.item.date, yesterday);
  assert.equal(m.body.item.heure, '09:15');
  assert.equal((await gerant.req('POST', '/api/avances', { employe: 'X Y', montant: 1000, saisieManuelle: true, date: addDays(today, 2), heure: '10:00' })).status, 400);
  assert.equal((await gerant.req('POST', '/api/avances', { employe: 'X Y', montant: 1000, saisieManuelle: true })).status, 400);
  assert.equal((await gerant.req('POST', '/api/avances', { employe: 'X Y', montant: 0 })).status, 400);

  // Names: one entry per person whatever the spelling/case.
  const names = (await gerant.req('GET', '/api/avances/employes')).body.items;
  assert.equal(names.filter((n: { nom: string }) => n.nom.toLowerCase() === 'ahmed ben ali').length, 1);
  assert.equal(names[0].total, 90000);

  // The caisse is untouched by avances (they can exceed what is in the till).
  const caisseAfter = (await gerant.req('GET', `/api/caisse?from=${today}&to=${today}`)).body.totals;
  assert.deepEqual(caisseAfter, caisseBefore);

  // to = tomorrow: an automatic avance keeps the real calendar date, which after midnight is ahead of the business date.
  const list = (await gerant.req('GET', `/api/avances?from=${yesterday}&to=${addDays(today, 1)}`)).body;
  assert.equal(list.items.length, 2);
  assert.equal(list.total, 90000);
  assert.equal(list.parEmploye[0].nb, 2);
});

test('avances: deletion only within 24 h, by the author, with the right password — and never erased', async () => {
  const a = (await gerant.req('POST', '/api/avances', { employe: 'Meriem K', montant: 15000 })).body.item;
  assert.equal((await gerant2.req('POST', `/api/avances/${a.id}/supprimer`, { password: USERS.gerant2.password })).status, 403);
  const wrong = await gerant.req('POST', `/api/avances/${a.id}/supprimer`, { password: 'pas-le-bon' });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.error.code, 'WRONG_PASSWORD');
  assert.equal((await gerant.req('GET', '/api/auth/me')).status, 200, 'a wrong password does not log the user out');
  assert.equal((await gerant.req('POST', `/api/avances/${a.id}/supprimer`, { password: USERS.gerant.password })).status, 204);
  const listed = (await gerant.req('GET', '/api/avances')).body.items.some((x: { id: string }) => x.id === a.id);
  assert.equal(listed, false);
  const row = testDb.prepare('SELECT supprime_par_nom FROM avances WHERE id = ?').get(a.id) as { supprime_par_nom: string };
  assert.equal(row.supprime_par_nom, 'Sami Gérant', 'kept in the database with who deleted it');

  // After 24 h: impossible, even with the password, even for a supervisor.
  const old = (await gerant.req('POST', '/api/avances', { employe: 'Meriem K', montant: 5000 })).body.item;
  testDb.prepare('UPDATE avances SET cree_le = ? WHERE id = ?').run(new Date(Date.now() - 25 * 3600 * 1000).toISOString(), old.id);
  const late = await patron.req('POST', `/api/avances/${old.id}/supprimer`, { password: USERS.patron.password });
  assert.equal(late.status, 403);
  assert.equal(late.body.error.code, 'DELAI_DEPASSE');
  assert.equal((await gerant.req('GET', '/api/avances')).body.items.find((x: { id: string }) => x.id === old.id).supprimable, false);
});

test('forgot password: same answer for unknown emails, one-time link by email, everything reset', async () => {
  createUser(testDb, { email: 'oubli@cafe.tn', fullName: 'Nour Oubli', password: 'ancien-mdp-1', role: 'gerant', mustChangePassword: true });
  const signedIn = new Client();
  await signedIn.req('GET', '/api/health');
  await signedIn.req('POST', '/api/auth/login', { email: 'oubli@cafe.tn', password: 'ancien-mdp-1' });

  const c = new Client();
  await c.req('GET', '/api/health');
  sentMails.length = 0;
  const unknown = await c.req('POST', '/api/auth/forgot-password', { email: 'personne@cafe.tn' });
  const known = await c.req('POST', '/api/auth/forgot-password', { email: 'OUBLI@cafe.tn' });
  await tick();
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.message, known.body.message, 'no hint whether the account exists');
  assert.equal(sentMails.length, 1);
  assert.equal(sentMails[0].to, 'oubli@cafe.tn');
  const link = /https:\/\/historique\.test\/reinitialiser\?token=([A-Za-z0-9_-]+)/.exec(sentMails[0].html)!;
  assert.ok(link, 'email contains the link');
  const token = decodeURIComponent(link[1]);
  assert.ok(sentMails[0].text.includes(link[0]));

  assert.equal((await c.req('GET', `/api/auth/reset-password/check?token=${token}`)).body.valid, true);
  assert.equal((await c.req('GET', '/api/auth/reset-password/check?token=faux-jeton-123')).body.valid, false);
  assert.equal((await c.req('POST', '/api/auth/reset-password', { token, newPassword: 'court' })).status, 400);
  assert.equal((await c.req('POST', '/api/auth/reset-password', { token, newPassword: 'nouveau-mdp-oubli' })).status, 204);
  await tick();
  assert.match(sentMails[1].subject, /modifié/);

  // Single use, old password dead, other devices signed out, temporary-password flag cleared.
  assert.equal((await c.req('POST', '/api/auth/reset-password', { token, newPassword: 'encore-un-autre' })).body.error.code, 'RESET_INVALID');
  assert.equal((await signedIn.req('GET', '/api/auth/me')).status, 401);
  const after = new Client();
  await after.req('GET', '/api/health');
  assert.equal((await after.req('POST', '/api/auth/login', { email: 'oubli@cafe.tn', password: 'ancien-mdp-1' })).status, 401);
  const ok = await after.req('POST', '/api/auth/login', { email: 'oubli@cafe.tn', password: 'nouveau-mdp-oubli' });
  assert.equal(ok.body.user.mustChangePassword, false);
});

test('forgot password: links expire, and at most 3 emails per account per hour', async () => {
  createUser(testDb, { email: 'limite@cafe.tn', fullName: 'Limite', password: 'mdp-limite-1', role: 'gerant', mustChangePassword: false });
  const c = new Client();
  await c.req('GET', '/api/health');
  sentMails.length = 0;
  for (let i = 0; i < 4; i++) await c.req('POST', '/api/auth/forgot-password', { email: 'limite@cafe.tn' });
  await tick();
  assert.equal(sentMails.length, 3);
  const token = decodeURIComponent(/token=([A-Za-z0-9_-]+)/.exec(sentMails[0].text)![1]);
  testDb.prepare("UPDATE password_resets SET expires_at = '2000-01-01T00:00:00.000Z'").run();
  assert.equal((await c.req('GET', `/api/auth/reset-password/check?token=${token}`)).body.valid, false);
  assert.equal((await c.req('POST', '/api/auth/reset-password', { token, newPassword: 'nouveau-mdp-2' })).status, 400);
});

test('logout revokes the session', async () => {
  const c = new Client();
  await c.login('gerant2');
  assert.equal((await c.req('POST', '/api/auth/logout')).status, 204);
  assert.equal((await c.req('GET', `/api/journees/${today}`)).status, 401);
});
