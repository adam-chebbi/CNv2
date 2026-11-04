import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ApiError } from './errors.js';

// Double-submit-cookie CSRF protection: the server hands out a CSRF token in a JS-readable
// cookie, and the client must echo it back in a request header for every state-changing call.
// A cross-site attacker can trigger a request with the cookie auto-attached, but — thanks to the
// same-origin policy — can never read the cookie's value to also set the matching header, so a
// forged request always fails this check.
const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const isProd = process.env.NODE_ENV === 'production';

// Runs on every request (not just /api) so the cookie already exists in the browser by the time
// any state-changing request — including the very first login — is submitted.
export const ensureCsrfCookie = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.cookies?.[CSRF_COOKIE]) {
    const token = randomUUID();
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false, // must be readable by client JS to be echoed back in a header
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
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
    throw new ApiError(403, 'Jeton CSRF invalide ou manquant.');
  }
  next();
};
