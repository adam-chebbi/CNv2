import { useEffect, useRef } from 'react';

export type PosEventType =
  | 'orders.changed'
  | 'prep.changed'
  | 'floor.changed'
  | 'actions.changed'
  | 'catalog.changed'
  | 'cash.changed'
  | 'reservations.changed';

export interface PosEvent {
  type: PosEventType;
  visitId?: string;
  orderId?: string;
  destination?: string;
}

// Calls `onEvent` whenever the server announces a change of one of `types` (Server-Sent Events on
// /api/events). If the stream is unavailable (proxy, flaky network), the screen still converges:
// `onEvent` is also called every `fallbackMs` as a plain refresh.
export const usePosEvents = (types: PosEventType[], onEvent: (event: PosEvent | null) => void, fallbackMs = 20_000): void => {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  const typesKey = types.join(',');

  useEffect(() => {
    const wanted = new Set(typesKey.split(','));
    let source: EventSource | null = null;
    if (typeof EventSource !== 'undefined') {
      source = new EventSource('/api/events', { withCredentials: true });
      source.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data) as PosEvent;
          if (wanted.has(event.type)) handlerRef.current(event);
        } catch {
          // Ignore malformed frames; the periodic refresh below keeps the screen correct.
        }
      };
    }
    const timer = window.setInterval(() => handlerRef.current(null), fallbackMs);
    return () => {
      source?.close();
      window.clearInterval(timer);
    };
  }, [typesKey, fallbackMs]);
};

// One key per user intention: generate it when the cart/payment form opens, reuse it on every
// retry of that same submission, and renew it only after a success.
export const newIdempotencyKey = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
