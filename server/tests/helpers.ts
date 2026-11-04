import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';

// Shared harness for the API tests: the real application on a throwaway SQLite file, listening on
// an ephemeral port. DB_PATH must be set before the app (and its connection module) is imported,
// hence the dynamic imports.

process.env.TZ = 'Africa/Tunis';

export interface TestContext {
  baseUrl: string;
  db: import('better-sqlite3').Database;
  close: () => Promise<void>;
  // Creates an active account holding exactly `permissions` (through a dedicated role).
  createUser: (fullName: string, permissions: string[] | 'super-admin') => Promise<ApiClient>;
}

export const startTestServer = async (): Promise<TestContext> => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cafenoir-test-'));
  process.env.DB_PATH = path.join(tmpDir, 'test.sqlite3');

  const { createApp, prepareDatabase } = await import('../app.ts');
  const { db } = await import('../db/connection.ts');
  const { hashPassword } = await import('../lib/password.ts');
  prepareDatabase();

  const server: Server = await new Promise((resolve) => {
    const s = createApp().listen(0, () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const superAdminRoleId = (db.prepare('SELECT id FROM roles WHERE is_system = 1').get() as { id: string }).id;

  const createUser = async (fullName: string, permissions: string[] | 'super-admin'): Promise<ApiClient> => {
    let roleId = superAdminRoleId;
    if (permissions !== 'super-admin') {
      roleId = randomUUID();
      db.prepare('INSERT INTO roles (id, name, description, is_system, created_at) VALUES (?, ?, ?, 0, ?)').run(
        roleId,
        `Test ${fullName} ${roleId.slice(0, 6)}`,
        'test',
        new Date().toISOString()
      );
      const grant = db.prepare('INSERT INTO role_permissions (role_id, permission_key) VALUES (?, ?)');
      permissions.forEach((key) => grant.run(roleId, key));
    }
    const cin = String(10_000_000 + Math.floor(Math.random() * 89_999_999));
    const password = `pw-${randomUUID()}`;
    db.prepare(
      `INSERT INTO users (id, full_name, cin, password_hash, must_change_password, role_id, is_active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`
    ).run(randomUUID(), fullName, cin, hashPassword(password), roleId, new Date().toISOString());
    const client = new ApiClient(baseUrl);
    const res = await client.post('/api/auth/login', { identifier: cin, password });
    if (res.status !== 200) throw new Error(`login failed for ${fullName}: ${res.status} ${JSON.stringify(res.body)}`);
    return client;
  };

  return {
    baseUrl,
    db,
    createUser,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
};

export interface ApiResponse<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

// Minimal browser stand-in: keeps cookies (session, CSRF, client visit tokens) between calls and
// echoes the CSRF token like src/api/client.ts does.
export class ApiClient {
  private cookies = new Map<string, string>();
  constructor(private baseUrl: string) {}

  private async send<T>(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<ApiResponse<T>> {
    if (method !== 'GET' && !this.cookies.has('csrf_token')) await this.send('GET', '/api/auth/me');
    const allHeaders: Record<string, string> = { ...headers };
    if (body !== undefined) allHeaders['Content-Type'] = 'application/json';
    const csrf = this.cookies.get('csrf_token');
    if (method !== 'GET' && csrf) allHeaders['X-CSRF-Token'] = csrf;
    if (this.cookies.size > 0) allHeaders.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');

    const res = await fetch(`${this.baseUrl}${url}`, { method, headers: allHeaders, body: body === undefined ? undefined : JSON.stringify(body) });
    res.headers.getSetCookie().forEach((cookie) => {
      const [pair] = cookie.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === '' || /expires=Thu, 01 Jan 1970/i.test(cookie)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      // keep raw text
    }
    return { status: res.status, body: parsed as T, headers: res.headers };
  }

  get<T = any>(url: string) {
    return this.send<T>('GET', url);
  }
  post<T = any>(url: string, body?: unknown, idempotencyKey?: string) {
    return this.send<T>('POST', url, body ?? {}, idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {});
  }
  put<T = any>(url: string, body?: unknown) {
    return this.send<T>('PUT', url, body ?? {});
  }
  patch<T = any>(url: string, body?: unknown) {
    return this.send<T>('PATCH', url, body ?? {});
  }
  delete<T = any>(url: string) {
    return this.send<T>('DELETE', url);
  }
}

export const key = (): string => randomUUID();
