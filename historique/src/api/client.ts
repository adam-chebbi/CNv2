// Same transport conventions as the main app (src/api/client.ts there): the session lives only in
// an httpOnly cookie, every mutation echoes the CSRF cookie in a header.

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Thrown when the request never reached the server (no network, server down) — distinct from an
// ApiError so callers can decide to queue the request instead of showing an error.
export class NetworkError extends Error {
  constructor() {
    super('Pas de connexion au serveur.');
  }
}

const getCsrfToken = (): string | null => {
  const match = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
};

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

const listeners = new Set<(err: ApiError) => void>();
// Lets the auth layer react globally to a session that expired / was revoked from the main app.
export const onAuthError = (cb: (err: ApiError) => void): (() => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

// The CSRF cookie is created by the server on the very first response — make sure one exists
// before the first mutation (e.g. a login submitted on a page served from the PWA cache).
const ensureCsrf = async () => {
  if (getCsrfToken()) return;
  try {
    await fetch('/api/health', { credentials: 'include' });
  } catch {
    // offline — the mutation itself will fail and be handled
  }
};

export const request = async <T,>(method: Method, path: string, body?: unknown): Promise<T> => {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    await ensureCsrf();
    const token = getCsrfToken();
    if (token) headers['X-CSRF-Token'] = token;
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, credentials: 'include', body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new NetworkError();
  }
  if (res.status === 204) return undefined as T;
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    const err = new ApiError(data?.error?.message ?? `Erreur ${res.status}`, res.status, data?.error?.code);
    if (!path.startsWith('/auth/') && (res.status === 401 || err.code === 'NO_ACCESS' || err.code === 'PASSWORD_CHANGE_REQUIRED')) listeners.forEach((cb) => cb(err));
    // 502/503/504 (nginx while the API restarts, or the main app's auth being unreachable) behave
    // like a network failure: creations get queued and replayed instead of being lost.
    if (res.status >= 502 && res.status <= 504) throw new NetworkError();
    throw err;
  }
  return data as T;
};

export const api = {
  get: <T,>(path: string) => request<T>('GET', path),
  post: <T,>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T,>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
};

export const errorText = (e: unknown): string =>
  e instanceof ApiError || e instanceof NetworkError ? e.message : 'Une erreur est survenue. Réessayez.';
