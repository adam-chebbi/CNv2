import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiPostOnce } from '../api/client';
import type { CartLineInput } from '../data/pricing';
import type { PaymentMethod } from '../data/cashSession';

// Caisse résiliente aux coupures d'Internet (amélioration 05).
//
// Sales made while offline are kept on this device (IndexedDB) with their own Idempotency-Key and
// sent, in order, as soon as the connection returns. The server applies each one exactly once.
// The catalogue, offers and cash session are cached so the register still opens without network.

export interface OfflineSale {
  id: string; // Idempotency-Key, generated when the sale is recorded
  sessionId: string;
  offlineRef: string; // HL-<register>-<n>, printed on the provisional ticket
  occurredAt: string;
  serviceType: 'dine_in' | 'takeaway';
  lines: CartLineInput[];
  payments: { method: PaymentMethod; amountMil: number }[];
  clientTotalMil: number;
  conflict?: string; // refused by the server: to regularise
}

const DB_NAME = 'cn-offline';
const STORE = 'sales';

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const tx = async <T,>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

export const queueAll = (): Promise<OfflineSale[]> =>
  tx<OfflineSale[]>('readonly', (s) => s.getAll() as IDBRequest<OfflineSale[]>).then((l) => l.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)));
export const queuePut = (sale: OfflineSale): Promise<IDBValidKey> => tx('readwrite', (s) => s.put(sale));
export const queueDelete = (id: string): Promise<undefined> => tx('readwrite', (s) => s.delete(id) as IDBRequest<undefined>);

// --- Small cache (catalogue, offers, session) ------------------------------------------------------

export const saveCache = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(`cn_cache:${key}`, JSON.stringify({ at: Date.now(), value }));
  } catch {
    // storage full or blocked: offline mode simply has no cache
  }
};
export const readCache = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(`cn_cache:${key}`);
    return raw ? (JSON.parse(raw).value as T) : null;
  } catch {
    return null;
  }
};

// Network failures (fetch rejects) are offline; an HTTP error answer is not.
export const isNetworkError = (err: unknown): boolean => !(err instanceof ApiError);

// Loads from the server and caches; falls back to the cache when the network is unavailable.
export const withCache = async <T,>(key: string, load: () => Promise<T>): Promise<T> => {
  try {
    const value = await load();
    saveCache(key, value);
    return value;
  } catch (err) {
    const cached = readCache<T>(key);
    if (cached && isNetworkError(err)) return cached;
    throw err;
  }
};

export const nextOfflineRef = (registerId: string): string => `HL-${registerId.replace(/[^A-Za-z0-9]/g, '').slice(0, 8)}-${Date.now().toString(36).toUpperCase()}`;

let syncing = false;

// Sends the waiting sales, oldest first. Stops at the first network failure; a refusal by the
// server marks that sale "à régulariser" (kept, never dropped silently).
export const syncQueue = async (): Promise<void> => {
  if (syncing || !navigator.onLine) return;
  syncing = true;
  try {
    for (const sale of await queueAll()) {
      if (sale.conflict) continue;
      try {
        const { id, conflict: _c, ...body } = sale;
        await apiPostOnce('/pos/offline-sales', body, id);
        await queueDelete(id);
      } catch (err) {
        if (isNetworkError(err)) break;
        await queuePut({ ...sale, conflict: (err as Error).message });
      }
    }
  } finally {
    syncing = false;
    window.dispatchEvent(new Event('cn-offline-queue'));
  }
};

export const useOfflineQueue = () => {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [queue, setQueue] = useState<OfflineSale[]>([]);
  const refresh = useCallback(() => void queueAll().then(setQueue).catch(() => setQueue([])), []);
  useEffect(() => {
    refresh();
    const goOnline = () => {
      setOnline(true);
      void syncQueue();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    window.addEventListener('cn-offline-queue', refresh);
    const timer = window.setInterval(() => void syncQueue(), 15_000);
    void syncQueue();
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('cn-offline-queue', refresh);
      window.clearInterval(timer);
    };
  }, [refresh]);
  return {
    online,
    pending: queue.filter((s) => !s.conflict),
    conflicts: queue.filter((s) => s.conflict),
    refresh,
  };
};
