import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import './db/connection.js';
import { runSeed } from './seed/index.js';
import { authRouter } from './routes/auth.js';
import { productCatalogRouter } from './routes/productCatalog.js';
import { stockRouter } from './routes/stock.js';
import { salesRouter } from './routes/sales.js';
import { internalConsumptionRouter } from './routes/internalConsumption.js';
import { expensesRouter } from './routes/expenses.js';
import { purchasesRouter } from './routes/purchases.js';
import { hrRouter } from './routes/hr.js';
import { notificationsRouter } from './routes/notifications.js';
import { activityLogRouter } from './routes/activityLog.js';
import { dashboardRouter } from './routes/dashboard.js';
import { cashVerificationsRouter } from './routes/cashVerifications.js';
import { revenueEntriesRouter } from './routes/revenueEntries.js';
import { showcaseSettingsRouter } from './routes/showcaseSettings.js';
import { listPublicProducts, openCors, publicRouter } from './routes/public.js';
import { settingsRouter, applyPersistedSettingsAtBoot } from './routes/settings.js';
import { rolesRouter } from './routes/roles.js';
import { bootstrapRbac } from './rbac/bootstrap.js';
import { errorMiddleware } from './middleware/errors.js';
import { ensureCsrfCookie, csrfProtection } from './middleware/csrf.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

runSeed();
// Re-applies any setting the server itself enforces (currently maxShifts) from what was last
// persisted in app_settings — without this, a limit raised via Paramètres would silently reset to
// its hardcoded default on every server restart/redeploy.
applyPersistedSettingsAtBoot();
// Ensures the Super Admin/Compte Saisie roles exist and every user has a role (see
// server/rbac/bootstrap.ts) before any request is served — requireAuth depends on every user
// having a role_id.
bootstrapRbac();

const app = express();
// nginx sits in front of this process on the same host — trust its X-Forwarded-For so req.ip
// reflects the real client IP (used for session/device logging) instead of nginx's own address.
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '15mb' }));
app.use(cookieParser());
// Runs on every request (app shell + API) so the CSRF cookie is already set before the first
// state-changing request — see server/middleware/csrf.ts.
app.use(ensureCsrfCookie);
app.use('/api', csrfProtection);

app.use('/api/auth', authRouter);
// Must stay ABOVE every router that does `router.use(requireAuth)` on the bare '/api' prefix
// (productCatalogRouter, expensesRouter, settingsRouter, rolesRouter…): those run for any
// /api/* path before Express reaches later mounts, so a public route mounted after them would
// answer 401 to the storefront.
app.use('/api/public', publicRouter);
// Same catalog under the shorter, storefront-friendly URL (exact path only — no /api/products/:id).
app.get('/api/products', openCors, listPublicProducts);
app.use('/api', productCatalogRouter);
app.use('/api/stock', stockRouter);
app.use('/api/sales', salesRouter);
app.use('/api/internal-consumption', internalConsumptionRouter);
app.use('/api', expensesRouter);
app.use('/api/purchases', purchasesRouter);
app.use('/api/hr', hrRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/activity-log', activityLogRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/cash-verifications', cashVerificationsRouter);
app.use('/api/revenue-entries', revenueEntriesRouter);
app.use('/api/showcase-settings', showcaseSettingsRouter);
app.use('/api', settingsRouter);
app.use('/api', rolesRouter);

app.use(errorMiddleware);

const distDir = path.join(__dirname, '..', 'dist');
app.use(express.static(distDir));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Café Noir API listening on http://localhost:${port}`);
});
