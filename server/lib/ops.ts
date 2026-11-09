import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response, Router } from 'express';
import { db } from '../db/connection.js';

// Exploitation (amélioration 10): health probe, response-time metrics, structured logs and the
// content security policy. Nothing here touches business data.

const startedAt = Date.now();
const VERSION = process.env.APP_VERSION ?? process.env.npm_package_version ?? 'dev';

/** One JSON line per event, easy to grep or to ship to a log service (pm2 keeps the files). */
export const logEvent = (level: 'info' | 'warn' | 'error', event: string, data: Record<string, unknown> = {}): void => {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...data });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else if (process.env.NODE_ENV !== 'test') console.log(line);
};

// --- Response times ------------------------------------------------------------------------------
// Rolling window of the last requests per group; the register routes target p95 < 300 ms.
const WINDOW = 500;
const samples = new Map<string, number[]>();
const groupOf = (url: string): string => {
  const p = url.split('?')[0];
  if (p.startsWith('/api/pos/')) return 'pos';
  if (p.startsWith('/api/client/')) return 'client';
  if (p.startsWith('/api/')) return 'api';
  return 'app';
};
export const percentile = (values: number[], p: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};

export const requestMetrics = (req: Request, res: Response, next: NextFunction): void => {
  if (req.path === '/api/events') return next(); // long-lived stream
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const g = groupOf(req.originalUrl);
    const list = samples.get(g) ?? [];
    list.push(ms);
    if (list.length > WINDOW) list.shift();
    samples.set(g, list);
    if (ms > 1000) logEvent('warn', 'slow_request', { method: req.method, path: req.route?.path ?? req.path, status: res.statusCode, ms: Math.round(ms) });
    if (res.statusCode >= 500) logEvent('error', 'server_error', { method: req.method, path: req.path, status: res.statusCode, ms: Math.round(ms) });
  });
  next();
};

// --- Health ----------------------------------------------------------------------------------------

const newestBackup = (): { file: string; ageHours: number } | null => {
  const dbPath = process.env.DB_PATH ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'cafenoir.sqlite3');
  const dir = process.env.BACKUP_DIR ?? path.join(path.dirname(dbPath), 'backups');
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sqlite3') || f.endsWith('.sqlite3.gz'));
    let best: { file: string; mtime: number } | null = null;
    for (const f of files) {
      const m = fs.statSync(path.join(dir, f)).mtimeMs;
      if (!best || m > best.mtime) best = { file: f, mtime: m };
    }
    return best ? { file: best.file, ageHours: Math.round(((Date.now() - best.mtime) / 3_600_000) * 10) / 10 } : null;
  } catch {
    return null;
  }
};

const diskFree = (): { freeMb: number; usedPct: number } | null => {
  try {
    const s = fs.statfsSync(process.cwd());
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    return { freeMb: Math.round(free / 1024 / 1024), usedPct: Math.round((1 - free / total) * 100) };
  } catch {
    return null;
  }
};

export const healthReport = () => {
  let database = 'ok';
  try {
    db.prepare('SELECT 1').get();
  } catch {
    database = 'down';
  }
  const disk = diskFree();
  const backup = newestBackup();
  const warnings: string[] = [];
  if (disk && disk.freeMb < 1024) warnings.push('disk_low');
  if (process.env.NODE_ENV === 'production' && (!backup || backup.ageHours > 26)) warnings.push('backup_missing');
  const pos = samples.get('pos') ?? [];
  if ((percentile(pos, 95) ?? 0) > 300 && pos.length >= 50) warnings.push('pos_slow');
  return {
    status: database !== 'ok' ? 'down' : warnings.length ? 'degraded' : 'ok',
    version: VERSION,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    database,
    disk,
    lastBackup: backup,
    responseMs: Object.fromEntries([...samples.entries()].map(([g, v]) => [g, { p50: round(percentile(v, 50)), p95: round(percentile(v, 95)), n: v.length }])),
    warnings,
  };
};
const round = (v: number | null) => (v === null ? null : Math.round(v));

// Public and cheap: an external probe calls it every minute. 503 only when the database is down,
// so a warning (low disk, old backup) is visible without triggering a restart.
export const opsRouter = Router();
opsRouter.get('/health', (_req, res) => {
  const report = healthReport();
  res.setHeader('Cache-Control', 'no-store');
  res.status(report.status === 'down' ? 503 : 200).json(report);
});

// Browsers post policy violations here while the policy is in report-only mode.
opsRouter.post('/csp-report', express.json({ type: ['application/csp-report', 'application/reports+json', 'application/json'], limit: '20kb' }), (req, res) => {
  const body = req.body as Record<string, unknown> | Record<string, unknown>[];
  const reports = Array.isArray(body) ? body.map((r) => r.body ?? r) : [body['csp-report'] ?? body];
  reports.slice(0, 5).forEach((r) => {
    const x = r as Record<string, unknown>;
    logEvent('warn', 'csp_violation', { directive: x['violated-directive'] ?? x.effectiveDirective, blocked: x['blocked-uri'] ?? x.blockedURL, page: x['document-uri'] ?? x.documentURL });
  });
  res.status(204).end();
});

// --- Content security policy ---------------------------------------------------------------------
// Sources actually used: Google Fonts, the jsDelivr CDN (3D textures/models of the floor plan,
// OCR engine of invoice capture), images and 3D models from any https CDN chosen in the asset
// library. Report-only until CSP_ENFORCE=1, so nothing breaks while the reports are reviewed.
export const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https: blob: data:",
  "worker-src 'self' blob: https://cdn.jsdelivr.net",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  'report-uri /api/csp-report',
].join('; ');

export const contentSecurityPolicy = (_req: Request, res: Response, next: NextFunction): void => {
  res.setHeader(process.env.CSP_ENFORCE === '1' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only', CSP);
  next();
};
