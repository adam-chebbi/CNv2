import { EventEmitter } from 'node:events';
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';

// Live updates for the screens that must react without a reload: kitchen/bar boards, the floor
// plan, the "Actions à traiter" queue, the cash register. Events are deliberately thin ("something
// about X changed") — screens refetch what they display, so permissions are always enforced by the
// regular API routes and an event can never leak data.

export type PosEventType =
  | 'orders.changed'
  | 'prep.changed'
  | 'floor.changed'
  | 'actions.changed'
  | 'catalog.changed'
  | 'cash.changed'
  | 'reservations.changed'
  | 'print.changed'
  | 'display.changed';

export interface PosEvent {
  type: PosEventType;
  // Optional hints (ids) so a screen can skip refetching when the change does not concern it.
  visitId?: string;
  orderId?: string;
  destination?: string;
}

const bus = new EventEmitter();
bus.setMaxListeners(500);

// Events are emitted after the transaction that caused them has committed (callers emit after
// their db.transaction() returns), so a screen refetching on receipt always sees the new state.
export const emitPosEvent = (event: PosEvent): void => {
  bus.emit('event', event);
};

export const onPosEvent = (listener: (event: PosEvent) => void): (() => void) => {
  bus.on('event', listener);
  return () => bus.off('event', listener);
};

const HEARTBEAT_MS = 25_000;

export const eventsRouter = Router();

eventsRouter.get('/', requireAuth, (req: Request, res: Response) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // nginx would otherwise buffer the stream and deliver events in batches.
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');

  const send = (event: PosEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  const unsubscribe = onPosEvent(send);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});
