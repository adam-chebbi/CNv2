// The session credential lives only in an httpOnly cookie set by the server — never in
// localStorage or any other JS-readable storage, so it can't be read or exfiltrated by an XSS
// payload. `credentials: 'include'` makes sure that cookie (and the CSRF cookie below) are sent
// with every request.

export class ApiError extends Error {}

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'X-CSRF-Token';

// The CSRF cookie is intentionally NOT httpOnly (see server/middleware/csrf.ts) — the client
// must read it here and echo it back in a header for every state-changing request.
const getCsrfToken = (): string | null => {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

const request = async <T,>(path: string, options: RequestOptions = {}): Promise<T> => {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    const csrfToken = getCsrfToken();
    if (csrfToken) headers[CSRF_HEADER] = csrfToken;
  }

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : undefined;

  if (!res.ok) {
    const message = data?.error?.message ?? `Erreur ${res.status}`;
    throw new ApiError(message);
  }

  return data as T;
};

export const apiGet = <T,>(path: string): Promise<T> => request<T>(path);
export const apiPost = <T,>(path: string, body?: unknown): Promise<T> => request<T>(path, { method: 'POST', body });
export const apiPut = <T,>(path: string, body?: unknown): Promise<T> => request<T>(path, { method: 'PUT', body });
export const apiPatch = <T,>(path: string, body?: unknown): Promise<T> => request<T>(path, { method: 'PATCH', body });
export const apiDelete = <T,>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' });
