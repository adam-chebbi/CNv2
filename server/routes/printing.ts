import { randomBytes, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler, ApiError, notFound } from '../middleware/errors.js';
import { requireAnyPermission, requireAuth, requirePermission } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';
import { sha256 } from '../lib/clientIdentity.js';
import { emitPosEvent } from '../lib/events.js';
import { hasPermission } from '../lib/posAccess.js';
import { getSaleRow, saleDetail } from '../lib/posService.js';
import { enqueueJob, prepTicketInput, queueBill, queueDrawer, queueTest, type JobRow, type PrinterRow } from '../lib/printing.js';
import { billDocument, prepTicketDocument, receiptDocument } from '../../src/data/receipts.js';
import { readPosSettings } from './posCatalog.js';

// Imprimantes, agents d'impression, file d'impression, tiroir-caisse (améliorations 03 & 04).

export const printingRouter = Router();
printingRouter.use(requireAuth);

const serializePrinter = (p: PrinterRow) => ({
  id: p.id,
  name: p.name,
  agentId: p.agent_id,
  target: p.target,
  address: p.address,
  paperWidth: p.paper_width,
  copies: p.copies,
  autoPrint: p.auto_print === 1,
  cashDrawer: p.cash_drawer === 1,
  active: p.active === 1,
  status: p.status,
  statusAt: p.status_at,
});

const serializeJob = (j: JobRow) => ({
  id: j.id,
  kind: j.kind,
  target: j.target,
  status: j.status,
  attempts: j.attempts,
  lastError: j.last_error,
  title: (JSON.parse(j.payload) as { title?: string }).title ?? j.kind,
  duplicate: Boolean(j.duplicate_of),
  createdBy: j.created_by,
  createdAt: j.created_at,
  printedAt: j.printed_at,
});

// --- Agents -------------------------------------------------------------------------------------------

printingRouter.get('/print-agents', requirePermission('pos:settings'), asyncHandler((_req, res) => {
  res.json(
    (db.prepare('SELECT id, name, version, last_seen_at, revoked_at, created_at FROM print_agents ORDER BY created_at').all() as {
      id: string;
      name: string;
      version: string | null;
      last_seen_at: string | null;
      revoked_at: string | null;
      created_at: string;
    }[]).map((a) => ({
      id: a.id,
      name: a.name,
      version: a.version,
      lastSeenAt: a.last_seen_at,
      online: Boolean(a.last_seen_at && Date.now() - Date.parse(a.last_seen_at) < 30_000 && !a.revoked_at),
      revoked: Boolean(a.revoked_at),
      createdAt: a.created_at,
    }))
  );
}));

// The token is shown once, at creation; only its hash is stored.
printingRouter.post('/print-agents', requirePermission('pos:settings'), asyncHandler((req, res) => {
  const { name } = z.object({ name: z.string().trim().min(1).max(60) }).parse(req.body);
  const id = randomUUID();
  const token = `cnpa_${randomBytes(24).toString('base64url')}`;
  db.transaction(() => {
    db.prepare('INSERT INTO print_agents (id, name, token_hash, created_by, created_at) VALUES (?, ?, ?, ?, ?)').run(id, name, sha256(token), req.user!.fullName, new Date().toISOString());
    recordActivity('Impression', 'Agent créé', name, req.user!.fullName, { userId: req.user!.id, entityType: 'print_agent', entityId: id });
  })();
  res.status(201).json({ id, name, token });
}));

printingRouter.post('/print-agents/:id/revoke', requirePermission('pos:settings'), asyncHandler((req, res) => {
  const r = db.prepare('UPDATE print_agents SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(new Date().toISOString(), req.params.id);
  if (r.changes === 0) throw notFound('Agent');
  recordActivity('Impression', 'Agent révoqué', req.params.id, req.user!.fullName, { userId: req.user!.id, entityType: 'print_agent', entityId: req.params.id });
  res.json({ ok: true });
}));

// --- Printers -----------------------------------------------------------------------------------------

const target = z.string().regex(/^(kitchen|bar|register:[A-Za-z0-9_-]+)$/, 'Destination invalide.');
const printerSchema = z.object({
  name: z.string().trim().min(1).max(60),
  agentId: z.string().min(1),
  target,
  // tcp://192.168.1.50:9100 (network printer), file:///dev/usb/lp0 (Linux USB),
  // share://localhost/Ticket (Windows shared printer)
  address: z.string().trim().regex(/^(tcp:\/\/[^\s/:]+(:\d{2,5})?|file:\/\/\S+|share:\/\/\S+)$/, 'Adresse au format tcp://IP:9100, file:///dev/usb/lp0 ou share://localhost/Nom.'),
  paperWidth: z.union([z.literal(58), z.literal(80)]).default(80),
  copies: z.number().int().min(1).max(3).default(1),
  autoPrint: z.boolean().default(true),
  cashDrawer: z.boolean().default(false),
  active: z.boolean().default(true),
});

const params = (b: z.infer<typeof printerSchema>) => [b.name, b.agentId, b.target, b.address, b.paperWidth, b.copies, b.autoPrint ? 1 : 0, b.cashDrawer ? 1 : 0, b.active ? 1 : 0];

printingRouter.get('/printers', requireAnyPermission('pos:settings', 'pos:sell', 'prep:kitchen', 'prep:bar'), asyncHandler((_req, res) => {
  res.json((db.prepare('SELECT * FROM printers ORDER BY target, name').all() as PrinterRow[]).map(serializePrinter));
}));

printingRouter.post('/printers', requirePermission('pos:settings'), asyncHandler((req, res) => {
  const b = printerSchema.parse(req.body);
  if (!db.prepare('SELECT 1 FROM print_agents WHERE id = ? AND revoked_at IS NULL').get(b.agentId)) throw notFound('Agent');
  const id = randomUUID();
  db.prepare(
    'INSERT INTO printers (id, name, agent_id, target, address, paper_width, copies, auto_print, cash_drawer, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, ...params(b), new Date().toISOString());
  recordActivity('Impression', 'Imprimante ajoutée', `${b.name} → ${b.target}`, req.user!.fullName, { userId: req.user!.id, entityType: 'printer', entityId: id, after: b });
  res.status(201).json(serializePrinter(db.prepare('SELECT * FROM printers WHERE id = ?').get(id) as PrinterRow));
}));

printingRouter.put('/printers/:id', requirePermission('pos:settings'), asyncHandler((req, res) => {
  const b = printerSchema.parse(req.body);
  const r = db.prepare('UPDATE printers SET name = ?, agent_id = ?, target = ?, address = ?, paper_width = ?, copies = ?, auto_print = ?, cash_drawer = ?, active = ? WHERE id = ?').run(
    ...params(b),
    req.params.id
  );
  if (r.changes === 0) throw notFound('Imprimante');
  recordActivity('Impression', 'Imprimante modifiée', `${b.name} → ${b.target}`, req.user!.fullName, { userId: req.user!.id, entityType: 'printer', entityId: req.params.id, after: b });
  res.json(serializePrinter(db.prepare('SELECT * FROM printers WHERE id = ?').get(req.params.id) as PrinterRow));
}));

printingRouter.post('/printers/:id/test', requirePermission('pos:settings'), asyncHandler((req, res) => {
  const printer = db.prepare('SELECT * FROM printers WHERE id = ?').get(req.params.id) as PrinterRow | undefined;
  if (!printer) throw notFound('Imprimante');
  const jobId = queueTest(printer, req.user!.fullName);
  db.prepare('UPDATE print_jobs SET printer_id = ? WHERE id = ?').run(printer.id, jobId);
  res.status(201).json({ jobId });
}));

// --- Jobs ---------------------------------------------------------------------------------------------

printingRouter.get('/print-jobs', requireAnyPermission('pos:settings', 'pos:sell', 'prep:kitchen', 'prep:bar'), asyncHandler((req, res) => {
  const q = z.object({ status: z.enum(['queued', 'printing', 'printed', 'failed']).optional(), target: z.string().optional() }).parse(req.query);
  const where: string[] = [];
  const args: unknown[] = [];
  if (q.status) {
    where.push('status = ?');
    args.push(q.status);
  }
  if (q.target) {
    where.push('target = ?');
    args.push(q.target);
  }
  const rows = db.prepare(`SELECT * FROM print_jobs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT 100`).all(...args) as JobRow[];
  res.json(rows.map(serializeJob));
}));

// Problems to show on every screen that prints: offline agent, failed or stuck jobs.
printingRouter.get('/print-status', asyncHandler((_req, res) => {
  const failed = (db.prepare("SELECT COUNT(*) AS n FROM print_jobs WHERE status = 'failed' AND created_at > ?").get(new Date(Date.now() - 86_400_000).toISOString()) as { n: number }).n;
  const stuck = (db.prepare("SELECT COUNT(*) AS n FROM print_jobs WHERE status IN ('queued', 'printing') AND created_at < ?").get(new Date(Date.now() - 60_000).toISOString()) as { n: number }).n;
  const printers = db.prepare("SELECT p.name, p.status, a.last_seen_at FROM printers p JOIN print_agents a ON a.id = p.agent_id WHERE p.active = 1 AND a.revoked_at IS NULL").all() as {
    name: string;
    status: string | null;
    last_seen_at: string | null;
  }[];
  const offline = printers.filter((p) => !p.last_seen_at || Date.now() - Date.parse(p.last_seen_at) > 30_000 || (p.status && p.status !== 'ok')).map((p) => p.name);
  res.json({ configured: printers.length > 0, failed, stuck, offline });
}));

printingRouter.post('/print-jobs/:id/retry', requireAnyPermission('pos:settings', 'pos:sell', 'prep:kitchen', 'prep:bar'), asyncHandler((req, res) => {
  const r = db.prepare("UPDATE print_jobs SET status = 'queued', attempts = 0, last_error = NULL WHERE id = ? AND status = 'failed'").run(req.params.id);
  if (r.changes === 0) throw new ApiError(409, "Ce ticket n'est pas en échec.");
  emitPosEvent({ type: 'print.changed' });
  res.json({ ok: true });
}));

// --- Documents for browser printing (no printer configured) and explicit reprints ------------------

const canSeeStation = (user: NonNullable<Express.Request['user']>, destination: 'kitchen' | 'bar') =>
  hasPermission(user, destination === 'kitchen' ? 'prep:kitchen' : 'prep:bar') || hasPermission(user, 'pos:sell') || hasPermission(user, 'orders:take');

printingRouter.get('/prep-tickets/:id/document', asyncHandler((req, res) => {
  const input = prepTicketInput(req.params.id);
  if (!input) throw notFound('Bon de préparation');
  if (!canSeeStation(req.user!, input.destination)) throw new ApiError(403, "Vous n'avez pas accès à ce poste.");
  res.json(prepTicketDocument(input));
}));

// Duplicate of a kitchen/bar ticket: always explicit, numbered, journalled.
printingRouter.post('/prep-tickets/:id/reprint', asyncHandler((req, res) => {
  const input = prepTicketInput(req.params.id);
  if (!input) throw notFound('Bon de préparation');
  if (!canSeeStation(req.user!, input.destination)) throw new ApiError(403, "Vous n'avez pas accès à ce poste.");
  const original = db.prepare("SELECT id FROM print_jobs WHERE kind = 'prep' AND ref_id = ? AND duplicate_of IS NULL").get(req.params.id) as { id: string } | undefined;
  const count = (db.prepare("SELECT COUNT(*) AS n FROM print_jobs WHERE kind = 'prep' AND ref_id = ? AND duplicate_of IS NOT NULL").get(req.params.id) as { n: number }).n;
  const doc = prepTicketDocument(input, count + 1);
  let queued = false;
  db.transaction(() => {
    const printers = db.prepare('SELECT 1 FROM printers WHERE target = ? AND active = 1').get(input.destination);
    if (printers) {
      if (original) enqueueJob('prep', input.destination, req.params.id, doc, req.user!.fullName, original.id);
      else enqueueJob('prep', input.destination, req.params.id, prepTicketDocument(input), req.user!.fullName);
      queued = true;
    }
    recordActivity('Impression', 'Duplicata bon', `${input.label} n°${input.orderNumber}`, req.user!.fullName, { userId: req.user!.id });
  })();
  res.json({ queued, document: doc });
}));

// Provisional bill ("addition"): on the register printer, or returned for browser printing.
printingRouter.post('/sales/:id/print-bill', requireAnyPermission('pos:sell', 'pos:collect', 'orders:take'), asyncHandler((req, res) => {
  const { registerId } = z.object({ registerId: z.string().nullable().optional() }).parse(req.body ?? {});
  const sale = getSaleRow(req.params.id);
  if (sale.status !== 'open') throw new ApiError(409, "L'addition n'est imprimable que tant qu'elle n'est pas réglée.");
  const queued = queueBill(sale.id, registerId ?? null, req.user!.fullName);
  res.json({ queued, document: billDocument(saleDetail(sale.id)) });
}));

// Receipt document for browser printing (used when no register printer is configured).
printingRouter.get('/sales/:id/receipt-document', requireAnyPermission('pos:sell', 'pos:collect', 'pos:history'), asyncHandler((req, res) => {
  const sale = getSaleRow(req.params.id);
  const duplicate = Number(req.query.duplicate ?? 0) || 0;
  res.json(receiptDocument(saleDetail(sale.id), duplicate, readPosSettings().googleReviewUrl || null));
}));

printingRouter.post('/registers/:id/open-drawer', requirePermission('cash:movement'), asyncHandler((req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(2, 'Indiquez le motif.').max(120) }).parse(req.body);
  const register = db.prepare('SELECT id, name FROM cash_registers WHERE id = ?').get(req.params.id) as { id: string; name: string } | undefined;
  if (!register) throw notFound('Caisse');
  const queued = db.transaction(() => {
    const ok = queueDrawer(register.id, `manual:${randomUUID()}`, req.user!.fullName);
    recordActivity('Caisse', 'Ouverture du tiroir', `${register.name} — ${reason}`, req.user!.fullName, { userId: req.user!.id });
    return ok;
  })();
  if (!queued) throw new ApiError(409, "Aucun tiroir-caisse n'est raccordé à cette caisse.");
  res.json({ ok: true });
}));
