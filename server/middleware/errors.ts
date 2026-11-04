import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class ApiError extends Error {
  status: number;
  // Optional machine-readable discriminator for the rare case a client needs to react to a
  // specific error rather than just display its message — e.g. 'PASSWORD_CHANGE_REQUIRED' so the
  // frontend can route to the forced password-change screen instead of showing a generic failure.
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const notFound = (entity: string): ApiError => new ApiError(404, `${entity} introuvable.`);

// Wraps an async route handler so a rejected promise reaches the error middleware instead of
// crashing the process or hanging the request.
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
    const message = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' ; ');
    res.status(400).json({ error: { message } });
    return;
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: { message: 'Erreur interne du serveur.' } });
};
