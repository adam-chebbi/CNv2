import { randomUUID } from 'node:crypto';
import { db } from '../db/connection.js';
import { fromJson } from '../db/json.js';
import { emitPosEvent } from './events.js';
import { onPrepDispatched, onSaleCompleted, saleDetail } from './posService.js';
import { readPosSettings } from '../routes/posCatalog.js';
import {
  billDocument,
  cancelTicketDocument,
  prepTicketDocument,
  receiptDocument,
  testDocument,
  type PrepTicketInput,
  type PrintDocument,
} from '../../src/data/receipts.js';
import type { PricedExtra, PricedVariant } from '../../src/data/pricing.js';

// Print jobs (améliorations 03 & 04). A job is created only when a printer is configured for its
// target (kitchen, bar, or a register); without one, screens print through the browser as before.
// Kitchen/bar tickets are created in the same transaction as the order validation, once per
// dispatch: a replay, a refresh or a reconnection never prints twice. Duplicates are explicit.

export type JobKind = 'prep' | 'bill' | 'receipt' | 'cancel' | 'drawer' | 'test';

export interface PrinterRow {
  id: string;
  name: string;
  agent_id: string | null;
  target: string;
  address: string;
  paper_width: 58 | 80;
  copies: number;
  auto_print: number;
  cash_drawer: number;
  active: number;
  status: string | null;
  status_at: string | null;
  created_at: string;
}

export interface JobRow {
  id: string;
  kind: JobKind;
  target: string;
  ref_id: string | null;
  payload: string;
  status: 'queued' | 'printing' | 'printed' | 'failed';
  attempts: number;
  last_error: string | null;
  printer_id: string | null;
  duplicate_of: string | null;
  created_by: string;
  created_at: string;
  printed_at: string | null;
}

export const registerTarget = (registerId: string): string => `register:${registerId}`;

export const printersFor = (target: string): PrinterRow[] =>
  db
    .prepare(
      `SELECT p.* FROM printers p JOIN print_agents a ON a.id = p.agent_id
       WHERE p.target = ? AND p.active = 1 AND a.revoked_at IS NULL ORDER BY p.created_at`
    )
    .all(target) as PrinterRow[];

export const hasPrinter = (target: string, filter: (p: PrinterRow) => boolean = () => true): boolean => printersFor(target).some(filter);

export const enqueueJob = (kind: JobKind, target: string, refId: string | null, doc: PrintDocument, by: string, duplicateOf: string | null = null): string => {
  if (refId && !duplicateOf) {
    const existing = db.prepare('SELECT id FROM print_jobs WHERE kind = ? AND ref_id = ? AND target = ? AND duplicate_of IS NULL').get(kind, refId, target) as { id: string } | undefined;
    if (existing) return existing.id;
  }
  const id = randomUUID();
  db.prepare(
    `INSERT INTO print_jobs (id, kind, target, ref_id, payload, status, created_by, created_at, duplicate_of)
     VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?)`
  ).run(id, kind, target, refId, JSON.stringify(doc), by, new Date().toISOString(), duplicateOf);
  emitPosEvent({ type: 'print.changed' });
  return id;
};

const registerOfSale = (saleId: string): string | null =>
  (db.prepare('SELECT s.register_id FROM pos_sales p JOIN cash_sessions s ON s.id = p.session_id WHERE p.id = ?').get(saleId) as { register_id: string } | undefined)
    ?.register_id ?? null;

// --- Kitchen / bar tickets ------------------------------------------------------------------------

interface PrepRow {
  id: string;
  order_id: string;
  destination: 'kitchen' | 'bar';
  sent_at: string;
  order_number: number;
  pickup_number: number | null;
  priority: number;
  visit_id: string | null;
  service_type: string;
}

export const prepTicketInput = (prepTicketId: string): PrepTicketInput | null => {
  const t = db
    .prepare(
      `SELECT pt.id, pt.order_id, pt.destination, pt.sent_at, o.order_number, o.pickup_number, o.priority, o.visit_id, o.service_type
       FROM prep_tickets pt JOIN pos_orders o ON o.id = pt.order_id WHERE pt.id = ?`
    )
    .get(prepTicketId) as PrepRow | undefined;
  if (!t) return null;
  const visit = t.visit_id
    ? (db.prepare('SELECT v.covers, tb.name FROM visits v JOIN dining_tables tb ON tb.id = v.table_id WHERE v.id = ?').get(t.visit_id) as { covers: number | null; name: string } | undefined)
    : undefined;
  const lines = db
    .prepare("SELECT quantity, display_name, name, variant_json, extras_json, instruction, responsible_waiter_name FROM pos_order_lines WHERE prep_ticket_id = ? AND status = 'active' ORDER BY position")
    .all(prepTicketId) as { quantity: number; name: string; display_name: string; variant_json: string | null; extras_json: string; instruction: string | null; responsible_waiter_name: string | null }[];
  // Anything sent earlier to the same station for the same table makes this a follow-up ("SUITE").
  const followUp = t.visit_id
    ? Boolean(
        db
          .prepare('SELECT 1 FROM prep_tickets pt JOIN pos_orders o ON o.id = pt.order_id WHERE o.visit_id = ? AND pt.destination = ? AND pt.sent_at < ? LIMIT 1')
          .get(t.visit_id, t.destination, t.sent_at)
      )
    : false;
  return {
    destination: t.destination,
    label: visit?.name ?? (t.service_type === 'takeaway' ? 'À emporter' : 'Comptoir'),
    tableName: visit?.name ?? null,
    orderNumber: t.order_number,
    pickupNumber: t.pickup_number,
    sentAt: t.sent_at,
    waiter: lines[0]?.responsible_waiter_name ?? null,
    covers: visit?.covers ?? null,
    followUp,
    urgent: t.priority > 0,
    lines: lines.map((l) => ({
      quantity: l.quantity,
      name: l.name,
      variant: l.variant_json ? fromJson<PricedVariant>(l.variant_json, { id: '', label: '', deltaMil: 0 }).label : null,
      extras: fromJson<PricedExtra[]>(l.extras_json, []).map((e) => e.name),
      instruction: l.instruction,
    })),
  };
};

onPrepDispatched((ids) => {
  ids.forEach((id) => {
    const input = prepTicketInput(id);
    if (input && hasPrinter(input.destination, (p) => p.auto_print === 1)) enqueueJob('prep', input.destination, id, prepTicketDocument(input), 'Impression automatique');
  });
});

// --- Customer documents ---------------------------------------------------------------------------

const reviewUrl = (): string | null => readPosSettings().googleReviewUrl || null;

// Automatic receipt when the bill is settled, on the register's printer if it prints automatically.
onSaleCompleted((sale, by) => {
  const registerId = registerOfSale(sale.id);
  if (!registerId || !hasPrinter(registerTarget(registerId), (p) => p.auto_print === 1)) return;
  enqueueJob('receipt', registerTarget(registerId), sale.id, receiptDocument(saleDetail(sale.id), 0, reviewUrl()), by.name);
  db.prepare('INSERT INTO pos_ticket_prints (id, sale_id, duplicate, printed_by, printed_at) VALUES (?, ?, 0, ?, ?)').run(randomUUID(), sale.id, 'Impression automatique', new Date().toISOString());
});

// Receipt printed on request (original or duplicate). Returns false when no printer is configured,
// so the screen prints through the browser instead.
export const queueReceipt = (saleId: string, duplicateNumber: number, by: string): boolean => {
  const registerId = registerOfSale(saleId);
  if (!registerId || !hasPrinter(registerTarget(registerId))) return false;
  const target = registerTarget(registerId);
  const original = db.prepare("SELECT id FROM print_jobs WHERE kind = 'receipt' AND ref_id = ? AND target = ? AND duplicate_of IS NULL").get(saleId, target) as { id: string } | undefined;
  const doc = receiptDocument(saleDetail(saleId), duplicateNumber, reviewUrl());
  if (duplicateNumber > 0 && original) enqueueJob('receipt', target, saleId, doc, by, original.id);
  else enqueueJob('receipt', target, saleId, doc, by);
  return true;
};

export const queueBill = (saleId: string, registerId: string | null, by: string): boolean => {
  const target = registerId ? registerTarget(registerId) : null;
  if (!target || !hasPrinter(target)) return false;
  enqueueJob('bill', target, null, billDocument(saleDetail(saleId)), by);
  return true;
};

export const queueDrawer = (registerId: string, refId: string, by: string): boolean => {
  const target = registerTarget(registerId);
  if (!hasPrinter(target, (p) => p.cash_drawer === 1)) return false;
  enqueueJob('drawer', target, refId, { title: 'Tiroir-caisse', lines: [], openDrawer: true }, by);
  return true;
};

// Cancellation accepted for items the station already received: a "ANNULÉ" ticket at that station.
export const queueCancelTickets = (requestId: string, lineIds: string[], reason: string, by: string): void => {
  if (lineIds.length === 0) return;
  const lines = db
    .prepare(
      `SELECT l.quantity, l.name, l.prep_destination, o.order_number, o.visit_id, o.service_type FROM pos_order_lines l JOIN pos_orders o ON o.id = l.order_id
       WHERE l.id IN (${lineIds.map(() => '?').join(',')}) AND l.sent_to_prep_at IS NOT NULL AND l.prep_destination != 'none'`
    )
    .all(...lineIds) as { quantity: number; name: string; prep_destination: 'kitchen' | 'bar'; order_number: number; visit_id: string | null; service_type: string }[];
  (['kitchen', 'bar'] as const).forEach((destination) => {
    const forStation = lines.filter((l) => l.prep_destination === destination);
    if (forStation.length === 0 || !hasPrinter(destination)) return;
    const table = forStation[0].visit_id
      ? (db.prepare('SELECT tb.name FROM visits v JOIN dining_tables tb ON tb.id = v.table_id WHERE v.id = ?').get(forStation[0].visit_id) as { name: string } | undefined)?.name ?? null
      : null;
    enqueueJob(
      'cancel',
      destination,
      requestId,
      cancelTicketDocument({
        destination,
        tableName: table,
        label: table ?? (forStation[0].service_type === 'takeaway' ? 'À emporter' : 'Comptoir'),
        orderNumber: forStation[0].order_number,
        decidedAt: new Date().toISOString(),
        reason,
        lines: forStation.map((l) => ({ quantity: l.quantity, name: l.name })),
      }),
      by
    );
  });
};

export const queueTest = (printer: PrinterRow, by: string): string => enqueueJob('test', printer.target, null, testDocument(printer.name), by);
