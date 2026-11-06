import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler, ApiError } from '../middleware/errors.js';
import { sha256 } from '../lib/clientIdentity.js';
import { emitPosEvent } from '../lib/events.js';
import type { JobRow, PrinterRow } from '../lib/printing.js';

// API of the print agent installed on the register PC (amélioration 04). Authenticated by its own
// token (Authorization: Bearer cnpa_…), never by a staff session; mounted before the CSRF guard,
// which protects cookie-based sessions only. The agent connects out to the server: nothing to open
// on the café's network.

export const agentRouter = Router();

const STALE_MS = 60_000; // a job "printing" for longer than this is handed out again
const MAX_ATTEMPTS = 3;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      printAgentId?: string;
    }
  }
}

const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new ApiError(401, 'Jeton d’agent manquant.');
  const agent = db.prepare('SELECT id FROM print_agents WHERE token_hash = ? AND revoked_at IS NULL').get(sha256(token)) as { id: string } | undefined;
  if (!agent) throw new ApiError(401, 'Jeton d’agent invalide ou révoqué.');
  db.prepare('UPDATE print_agents SET last_seen_at = ?, version = COALESCE(?, version) WHERE id = ?').run(new Date().toISOString(), req.get('x-agent-version') ?? null, agent.id);
  req.printAgentId = agent.id;
  next();
};

agentRouter.use(authenticate);

const printersOfAgent = (agentId: string): PrinterRow[] => db.prepare('SELECT * FROM printers WHERE agent_id = ? AND active = 1').all(agentId) as PrinterRow[];

agentRouter.get('/config', asyncHandler((req, res) => {
  res.json({
    printers: printersOfAgent(req.printAgentId!).map((p) => ({ id: p.id, name: p.name, target: p.target, address: p.address, paperWidth: p.paper_width, copies: p.copies, cashDrawer: p.cash_drawer === 1 })),
  });
}));

// Hands out the queued jobs this agent can print, each with the printer to use.
agentRouter.get('/jobs', asyncHandler((req, res) => {
  const printers = printersOfAgent(req.printAgentId!);
  if (printers.length === 0) {
    res.json([]);
    return;
  }
  const targets = [...new Set(printers.map((p) => p.target))];
  const now = new Date().toISOString();
  const handed = db.transaction(() => {
    db.prepare("UPDATE print_jobs SET status = 'queued' WHERE status = 'printing' AND printed_at IS NULL AND created_at < ? AND attempts < ?").run(new Date(Date.now() - STALE_MS).toISOString(), MAX_ATTEMPTS);
    const jobs = db
      .prepare(`SELECT * FROM print_jobs WHERE status = 'queued' AND target IN (${targets.map(() => '?').join(',')}) ORDER BY created_at LIMIT 20`)
      .all(...targets) as JobRow[];
    return jobs.map((j) => {
      // A job aimed at one printer (test page) goes there; otherwise the first printer of the target.
      const printer = (j.printer_id && printers.find((p) => p.id === j.printer_id)) || printers.find((p) => p.target === j.target)!;
      db.prepare("UPDATE print_jobs SET status = 'printing', attempts = attempts + 1, printer_id = ? WHERE id = ?").run(printer.id, j.id);
      return { id: j.id, kind: j.kind, printerId: printer.id, copies: j.kind === 'drawer' ? 1 : printer.copies, document: JSON.parse(j.payload), createdAt: j.created_at, now };
    });
  })();
  res.json(handed);
}));

agentRouter.post('/jobs/:id/done', asyncHandler((req, res) => {
  const r = db.prepare("UPDATE print_jobs SET status = 'printed', printed_at = ?, last_error = NULL WHERE id = ? AND status = 'printing'").run(new Date().toISOString(), req.params.id);
  emitPosEvent({ type: 'print.changed' });
  res.json({ ok: r.changes > 0 });
}));

agentRouter.post('/jobs/:id/failed', asyncHandler((req, res) => {
  const { error } = z.object({ error: z.string().max(500) }).parse(req.body);
  const job = db.prepare('SELECT attempts FROM print_jobs WHERE id = ?').get(req.params.id) as { attempts: number } | undefined;
  if (!job) throw new ApiError(404, 'Ticket introuvable.');
  db.prepare('UPDATE print_jobs SET status = ?, last_error = ? WHERE id = ?').run(job.attempts >= MAX_ATTEMPTS ? 'failed' : 'queued', error, req.params.id);
  emitPosEvent({ type: 'print.changed' });
  res.json({ ok: true });
}));

agentRouter.post('/status', asyncHandler((req, res) => {
  const body = z.object({ printers: z.array(z.object({ id: z.string(), status: z.string().max(60) })).max(20) }).parse(req.body);
  const now = new Date().toISOString();
  const update = db.prepare('UPDATE printers SET status = ?, status_at = ? WHERE id = ? AND agent_id = ?');
  body.printers.forEach((p) => update.run(p.status, now, p.id, req.printAgentId));
  res.json({ ok: true });
}));
