import { useSyncExternalStore } from 'react';
import { ApiError, NetworkError, request } from './client';

// Offline queue ("saisies en attente"). In a café the Wi-Fi drops, the 4G is weak in the back
// room… A Gérant must never lose a dépense they just typed. Creations are sent with a
// client-generated id, so if the network fails the request is kept here (localStorage) and
// replayed later — the server treats a replay of the same id as "already saved", never as a
// duplicate. Only creations are queued; edits/cancellations/closing need the live server.

export interface OutboxItem {
  id: string; // the entity's own client-generated id
  method: 'POST' | 'PUT';
  path: string;
  body: unknown;
  label: string;
  createdAt: string;
  error?: string; // set when the server refused it (validation) — the user must fix or discard it
}

const KEY = 'historique:outbox';
let items: OutboxItem[] = [];
const subs = new Set<() => void>();

const load = () => {
  try {
    items = JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    items = [];
  }
};
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // storage full / private mode — the queue still lives in memory for this session
  }
  subs.forEach((cb) => cb());
};
load();

export const outbox = {
  list: () => items,
  subscribe: (cb: () => void) => {
    subs.add(cb);
    return () => {
      subs.delete(cb);
    };
  },
  add: (item: Omit<OutboxItem, 'createdAt'>) => {
    items = [...items.filter((i) => i.id !== item.id), { ...item, createdAt: new Date().toISOString() }];
    save();
  },
  remove: (id: string) => {
    items = items.filter((i) => i.id !== id);
    save();
  },
};

let flushing = false;
const flushListeners = new Set<() => void>();
export const onOutboxFlushed = (cb: () => void) => {
  flushListeners.add(cb);
  return () => {
    flushListeners.delete(cb);
  };
};

export const flushOutbox = async (): Promise<void> => {
  if (flushing || items.length === 0) return;
  flushing = true;
  let sent = 0;
  try {
    for (const item of [...items]) {
      if (item.error) continue;
      try {
        await request(item.method, item.path, item.body);
        outbox.remove(item.id);
        sent += 1;
      } catch (e) {
        if (e instanceof NetworkError) break; // still offline — try again later
        if (e instanceof ApiError && (e.status === 401 || e.status === 403) && e.code !== 'RATTRAPAGE_DEPASSE') break; // logged out: retry after login
        items = items.map((i) => (i.id === item.id ? { ...i, error: e instanceof Error ? e.message : 'Refusé par le serveur.' } : i));
        save();
      }
    }
  } finally {
    flushing = false;
    if (sent > 0) flushListeners.forEach((cb) => cb());
  }
};

// Sends a creation now, or queues it if the network is down. Returns whether it was queued.
export const createOrQueue = async <T,>(path: string, body: { id: string } & Record<string, unknown>, label: string): Promise<{ queued: boolean; data?: T }> => {
  try {
    const data = await request<T>('POST', path, body);
    return { queued: false, data };
  } catch (e) {
    if (e instanceof NetworkError) {
      outbox.add({ id: body.id, method: 'POST', path, body, label });
      return { queued: true };
    }
    throw e;
  }
};

// Same for a save (PUT) that is idempotent by nature — the queue keeps only the latest version
// for a given key, so saving twice offline sends the last values once.
export const saveOrQueue = async <T,>(path: string, body: unknown, key: string, label: string): Promise<{ queued: boolean; data?: T }> => {
  try {
    const data = await request<T>('PUT', path, body);
    return { queued: false, data };
  } catch (e) {
    if (e instanceof NetworkError) {
      outbox.add({ id: key, method: 'PUT', path, body, label });
      return { queued: true };
    }
    throw e;
  }
};

export const useOutbox = (): OutboxItem[] => useSyncExternalStore(outbox.subscribe, outbox.list, outbox.list);

let started = false;
export const startOutboxSync = () => {
  if (started) return;
  started = true;
  window.addEventListener('online', () => void flushOutbox());
  setInterval(() => void flushOutbox(), 30_000);
  void flushOutbox();
};
