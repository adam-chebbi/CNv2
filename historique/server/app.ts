import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { Db } from './db/connection.js';
import { csrfProtection, ensureCsrfCookie, errorMiddleware } from './lib/http.js';
import { createLocalAuth } from './lib/localAuth.js';
import { createMailerFromEnv, type Mailer } from './lib/mailer.js';
import { createStore } from './lib/store.js';
import { authRouter } from './routes/auth.js';
import { avancesRouter } from './routes/avances.js';
import { caisseRouter } from './routes/caisse.js';

export interface AppOptions {
  db: Db;
  distDir?: string;
  mailer?: Mailer; // defaults to SMTP_* environment variables; tests inject a fake
  publicUrl?: string; // base of the links in emails, e.g. https://historique.cafenoir.tn
}

// Built as a factory (rather than at import time) so the tests can spin up the whole app against a
// throwaway database.
export const createApp = ({ db, distDir, mailer = createMailerFromEnv(), publicUrl = process.env.PUBLIC_URL }: AppOptions) => {
  const store = createStore(db);
  const auth = createLocalAuth(db);
  const app = express();

  app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');
  // Set here rather than in nginx: in production the Cloudflare tunnel reaches this process directly.
  app.use((_req, res, next) => {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());
  app.use(ensureCsrfCookie);
  app.use('/api', csrfProtection);
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/auth', authRouter(auth, store, mailer, publicUrl));

  // Everything below requires a signed-in account (see server/lib/localAuth.ts).
  app.use('/api', auth.requireUser);
  app.use('/api', caisseRouter(store));
  app.use('/api', avancesRouter(store, auth));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { message: 'Route inconnue.' } });
  });
  app.use(errorMiddleware);

  if (distDir && fs.existsSync(distDir)) {
    app.use(express.static(distDir, { index: false }));
    app.get(/.*/, (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return { app, store };
};
