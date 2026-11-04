import type { Request, Response } from 'express';
import { db } from '../db/connection.js';
import { ApiError } from '../middleware/errors.js';

// Executes a create/collect action at most once per Idempotency-Key.
//
// The screens send a fresh key (crypto.randomUUID) per user intention — one "Envoyer", one
// "Encaisser" — and resend the SAME key on a double tap, an automatic retry or after a reconnection.
// The first execution's response is stored; every replay gets it back unchanged, so the action is
// never applied twice. better-sqlite3 is synchronous and Node runs one handler at a time, so a
// synchronous `run` cannot interleave with a concurrent replay.
//
// `scope` namespaces keys per action (and per actor where relevant), so a key reused by mistake on
// a different action never returns an unrelated response.

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

export const readIdempotencyKey = (req: Request, required: boolean): string | null => {
  const key = req.get('Idempotency-Key')?.trim() ?? '';
  if (!key) {
    if (required) throw new ApiError(400, 'En-tête Idempotency-Key manquant.');
    return null;
  }
  if (!KEY_PATTERN.test(key)) throw new ApiError(400, 'En-tête Idempotency-Key invalide.');
  return key;
};

interface StoredRow {
  status: number;
  response: string;
}

export const runIdempotent = <T>(
  req: Request,
  res: Response,
  scope: string,
  run: () => { status: number; body: T },
  options: { required?: boolean } = {}
): void => {
  const key = readIdempotencyKey(req, options.required ?? true);
  if (!key) {
    const { status, body } = run();
    res.status(status).json(body);
    return;
  }

  const stored = db.prepare('SELECT status, response FROM idempotency_keys WHERE key = ? AND scope = ?').get(key, scope) as StoredRow | undefined;
  if (stored) {
    res.status(stored.status).set('Idempotent-Replay', 'true').json(JSON.parse(stored.response));
    return;
  }

  const result = db.transaction(() => {
    const out = run();
    db.prepare('INSERT INTO idempotency_keys (key, scope, status, response, created_at) VALUES (?, ?, ?, ?, ?)').run(
      key,
      scope,
      out.status,
      JSON.stringify(out.body),
      new Date().toISOString()
    );
    return out;
  })();
  res.status(result.status).json(result.body);
};

// Keys only need to outlive realistic retries; called at boot.
export const purgeOldIdempotencyKeys = (maxAgeHours = 48): void => {
  const cutoff = new Date(Date.now() - maxAgeHours * 3600_000).toISOString();
  db.prepare('DELETE FROM idempotency_keys WHERE created_at < ?').run(cutoff);
};
