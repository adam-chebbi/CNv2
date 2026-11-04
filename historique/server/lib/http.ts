import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

// Same conventions as the main app (server/middleware/errors.ts & csrf.ts there): JSON errors as
// { error: { message, code } }, and double-submit-cookie CSRF protection on every mutation.

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const notFound = (entity: string): ApiError => new ApiError(404, `${entity} introuvable.`);

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => unknown) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export const errorMiddleware = (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { message: err.message, code: err.code } });
    return;
  }
  if (err instanceof ZodError) {
    const message = err.issues.map((i) => (i.path.length ? `${i.path.join('.')} : ${i.message}` : i.message)).join(' ; ');
    res.status(400).json({ error: { message } });
    return;
  }
  // body-parser's "request entity too large" (a photo above the limit) — a client error, not a crash.
  if (typeof err === 'object' && err && (err as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({ error: { message: 'Fichier trop volumineux.' } });
    return;
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: { message: 'Erreur interne du serveur.' } });
};

export const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const isProd = () => process.env.NODE_ENV === 'production';

export const ensureCsrfCookie = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.cookies?.[CSRF_COOKIE]) {
    const token = randomUUID();
    res.cookie(CSRF_COOKIE, token, { httpOnly: false, secure: isProd(), sameSite: 'lax', path: '/', maxAge: 1000 * 60 * 60 * 24 * 7 });
    req.cookies = { ...req.cookies, [CSRF_COOKIE]: token };
  }
  next();
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const csrfProtection = (req: Request, _res: Response, next: NextFunction): void => {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get(CSRF_HEADER);
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    throw new ApiError(403, 'Jeton CSRF invalide ou manquant. Rechargez la page.');
  }
  next();
};
