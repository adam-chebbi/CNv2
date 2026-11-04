import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../middleware/errors.js';

// In-memory sliding-window limiter for the public routes (QR ordering, customer login,
// reservations). One process serves the café, so memory is the right place; a restart simply
// resets the counters.

const hits = new Map<string, number[]>();

export const rateLimit = (name: string, max: number, windowMs: number) => (req: Request, _res: Response, next: NextFunction): void => {
  const now = Date.now();
  const id = `${name}:${req.ip}`;
  const recent = (hits.get(id) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) throw new ApiError(429, 'Trop de tentatives. Patientez un instant puis réessayez.');
  recent.push(now);
  hits.set(id, recent);
  next();
};

// Keeps the map from growing forever.
setInterval(() => {
  const now = Date.now();
  hits.forEach((times, id) => {
    const recent = times.filter((t) => now - t < 3_600_000);
    if (recent.length === 0) hits.delete(id);
    else hits.set(id, recent);
  });
}, 600_000).unref();
