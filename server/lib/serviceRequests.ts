import { randomUUID } from 'node:crypto';
import { db } from '../db/connection.js';
import { registerTableStateProvider } from './floorState.js';

export type ServiceRequestType = 'call_waiter' | 'bill';

export interface ServiceRequestRow {
  id: string;
  visit_id: string;
  table_id: string;
  type: ServiceRequestType;
  status: 'open' | 'in_progress' | 'done';
  press_count: number;
  created_at: string;
  taken_by: string | null;
  taken_at: string | null;
  done_by: string | null;
  done_at: string | null;
}

export const serializeServiceRequest = (r: ServiceRequestRow) => ({
  id: r.id,
  visitId: r.visit_id,
  tableId: r.table_id,
  type: r.type,
  status: r.status,
  pressCount: r.press_count,
  createdAt: r.created_at,
  takenBy: r.taken_by,
  takenAt: r.taken_at,
  doneBy: r.done_by,
  doneAt: r.done_at,
});

// Repeated taps while a request of the same type is active are grouped (§10.1).
export const createServiceRequest = (visitId: string, tableId: string, type: ServiceRequestType) => {
  const active = db.prepare("SELECT * FROM service_requests WHERE visit_id = ? AND type = ? AND status != 'done'").get(visitId, type) as ServiceRequestRow | undefined;
  if (active) {
    db.prepare('UPDATE service_requests SET press_count = press_count + 1 WHERE id = ?').run(active.id);
    return serializeServiceRequest({ ...active, press_count: active.press_count + 1 });
  }
  const id = randomUUID();
  db.prepare("INSERT INTO service_requests (id, visit_id, table_id, type, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)").run(
    id,
    visitId,
    tableId,
    type,
    new Date().toISOString()
  );
  return serializeServiceRequest(db.prepare('SELECT * FROM service_requests WHERE id = ?').get(id) as ServiceRequestRow);
};

// Floor plan colours: waiter called, bill requested.
registerTableStateProvider((_tableId, visitId) => {
  if (!visitId) return { waiterCalled: false, billRequested: false };
  const rows = db.prepare("SELECT type FROM service_requests WHERE visit_id = ? AND status != 'done'").all(visitId) as { type: ServiceRequestType }[];
  return { waiterCalled: rows.some((r) => r.type === 'call_waiter'), billRequested: rows.some((r) => r.type === 'bill') };
});
