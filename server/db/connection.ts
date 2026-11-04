import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../lib/password.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'cafenoir.sqlite3');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

// One-time, idempotent migration: the `sessions` table gained device/location/revocation columns
// after the original minimal schema shipped. CREATE TABLE IF NOT EXISTS above is a no-op on an
// existing database, so any database created before this change needs these columns added here.
const sessionColumns = new Set((db.pragma('table_info(sessions)') as { name: string }[]).map((c) => c.name));
const addSessionColumn = (name: string, ddl: string) => {
  if (!sessionColumns.has(name)) db.exec(`ALTER TABLE sessions ADD COLUMN ${ddl}`);
};
addSessionColumn('public_id', 'public_id TEXT');
addSessionColumn('ip_address', 'ip_address TEXT');
addSessionColumn('user_agent', 'user_agent TEXT');
addSessionColumn('device_label', 'device_label TEXT');
addSessionColumn('location', 'location TEXT');
addSessionColumn('last_seen_at', 'last_seen_at TEXT');
addSessionColumn('revoked_at', 'revoked_at TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_public_id ON sessions(public_id)');

// Backfill public_id for any session rows created before that column existed.
const rowsNeedingPublicId = db.prepare('SELECT token FROM sessions WHERE public_id IS NULL').all() as { token: string }[];
if (rowsNeedingPublicId.length > 0) {
  const assignPublicId = db.prepare('UPDATE sessions SET public_id = ? WHERE token = ?');
  rowsNeedingPublicId.forEach((row) => assignPublicId.run(randomUUID(), row.token));
}

// Sessions created before the device/IP/location capture above existed have no way to ever gain
// that data retroactively, and would otherwise sit in "Sessions actives" forever showing
// "Inconnue" for everything. A session only ever has a NULL ip_address if it predates this
// feature (a freshly created one always gets a real value, even '' is never stored as NULL), so
// this one-time, idempotent cleanup revokes exactly those — the next login captures full details.
db.prepare(
  "UPDATE sessions SET revoked_at = ? WHERE ip_address IS NULL AND revoked_at IS NULL"
).run(new Date().toISOString());

// One-time, idempotent migration: catalog_articles gained a per-product VAT rate and a
// tax-inclusive-price flag after the original schema shipped. NULL on either column means "use
// the app's default" (see manualSalesCatalog.getArticleVatRate / getArticleTtcPrice) — existing
// rows are left NULL rather than backfilled with a guess, since only the business knows which of
// its products are actually reduced-rate or HT-priced.
const catalogArticleColumns = new Set((db.pragma('table_info(catalog_articles)') as { name: string }[]).map((c) => c.name));
if (!catalogArticleColumns.has('vat_rate')) {
  db.exec('ALTER TABLE catalog_articles ADD COLUMN vat_rate REAL');
}
if (!catalogArticleColumns.has('price_includes_tax')) {
  db.exec('ALTER TABLE catalog_articles ADD COLUMN price_includes_tax INTEGER');
}

// One-time, idempotent migration: extras (suppléments) gained their own optional fiche technique
// (ingredients + quantities), so selecting one on a sale can deduct its consumption too, on top of
// the base product's own recipe — see server/routes/sales.ts's deductStockForSale.
const catalogExtraColumns = new Set((db.pragma('table_info(catalog_extras)') as { name: string }[]).map((c) => c.name));
if (!catalogExtraColumns.has('recipe')) {
  db.exec('ALTER TABLE catalog_extras ADD COLUMN recipe TEXT');
}

// One-time, idempotent migration: stock_ledger and expenses gained source_type/source_id tracking
// columns (so an automated entry, e.g. the stock deduction or VAT expense a sale creates, can be
// found and reversed by a later refund) after the original schema shipped.
const stockLedgerColumns = new Set((db.pragma('table_info(stock_ledger)') as { name: string }[]).map((c) => c.name));
if (!stockLedgerColumns.has('source_type')) db.exec('ALTER TABLE stock_ledger ADD COLUMN source_type TEXT');
if (!stockLedgerColumns.has('source_id')) db.exec('ALTER TABLE stock_ledger ADD COLUMN source_id TEXT');

const expenseColumns = new Set((db.pragma('table_info(expenses)') as { name: string }[]).map((c) => c.name));
if (!expenseColumns.has('source_type')) db.exec('ALTER TABLE expenses ADD COLUMN source_type TEXT');
if (!expenseColumns.has('source_id')) db.exec('ALTER TABLE expenses ADD COLUMN source_id TEXT');

// One-time, idempotent migration: employees gained an optional departure_date after the original
// schema shipped (an employee's "Inactif" status previously had no associated date at all).
const employeeColumns = new Set((db.pragma('table_info(employees)') as { name: string }[]).map((c) => c.name));
if (!employeeColumns.has('departure_date')) db.exec('ALTER TABLE employees ADD COLUMN departure_date TEXT');

// One-time, idempotent migration: users gained a role_id (RBAC) after the original schema shipped.
// Left NULL here on purpose — server/rbac/bootstrap.ts backfills every NULL-role user to Super
// Admin right after this runs, so no pre-existing account is ever locked out by this migration.
const userColumns = new Set((db.pragma('table_info(users)') as { name: string }[]).map((c) => c.name));
if (!userColumns.has('role_id')) db.exec('ALTER TABLE users ADD COLUMN role_id TEXT REFERENCES roles(id)');

// One-time, idempotent migration: sales_transactions gained an optional free-text note after the
// original schema shipped — currently only ever set by "Par quantités vendues" to justify a
// payment-breakdown mismatch (see quantitySalesEntryModel.ts).
const salesTransactionColumns = new Set((db.pragma('table_info(sales_transactions)') as { name: string }[]).map((c) => c.name));
if (!salesTransactionColumns.has('note')) db.exec('ALTER TABLE sales_transactions ADD COLUMN note TEXT');

// One-time, idempotent migration: users gained email/phone/password-based login after the original
// CIN-only, passwordless schema shipped. New columns are added individually since some may already
// exist on a database that picked up part of this migration on an earlier boot.
const addUserColumnIfMissing = (name: string, ddl: string) => {
  const cols = new Set((db.pragma('table_info(users)') as { name: string }[]).map((c) => c.name));
  if (!cols.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${ddl}`);
};
addUserColumnIfMissing('email', 'email TEXT');
addUserColumnIfMissing('phone', 'phone TEXT');
addUserColumnIfMissing('password_hash', 'password_hash TEXT');
addUserColumnIfMissing('password_updated_at', 'password_updated_at TEXT');
addUserColumnIfMissing('must_change_password', 'must_change_password INTEGER NOT NULL DEFAULT 0');
addUserColumnIfMissing('failed_login_attempts', 'failed_login_attempts INTEGER NOT NULL DEFAULT 0');
addUserColumnIfMissing('locked_until', 'locked_until TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL');

// One-time, idempotent migration: users gained an optional employee_id (linking a login account to
// its HR record, set from the "Compte de connexion" section of the employee form) and an is_active
// flag (deactivating a login independently of deleting anything) after the original schema shipped.
addUserColumnIfMissing('employee_id', 'employee_id TEXT REFERENCES employees(id)');
addUserColumnIfMissing('is_active', 'is_active INTEGER NOT NULL DEFAULT 1');

// One-time, idempotent migration: employees gained an archive workflow (status + departure_date)
// replacing outright deletion — departure_date existed in the schema already but was never written;
// this just backfills it to today for any employee that was already Inactif before this shipped, so
// the Archive page has a sensible date to show instead of blank.
db.prepare("UPDATE employees SET departure_date = COALESCE(departure_date, ?) WHERE status = 'Inactif'").run(
  new Date().toISOString().slice(0, 10)
);

// Backfill: any account that predates passwords (password_hash IS NULL) gets its own CIN as a
// temporary password, with must_change_password forcing the change-password screen on next login —
// same rule as every other temporary password in the app (see server/routes/roles.ts): it's always
// the account's CIN, never a generated secret, so there's nothing to print or deliver anywhere —
// the account holder already knows their own CIN.
const passwordlessUsers = db.prepare('SELECT id, cin FROM users WHERE password_hash IS NULL').all() as { id: string; cin: string }[];
if (passwordlessUsers.length > 0) {
  const setTempPassword = db.prepare(
    'UPDATE users SET password_hash = ?, must_change_password = 1, password_updated_at = ? WHERE id = ?'
  );
  const now = new Date().toISOString();
  passwordlessUsers.forEach((u) => setTempPassword.run(hashPassword(u.cin), now, u.id));
}

// One-time cleanup: sales no longer auto-generate a "TVA collectée" expense on every paid sale
// (see server/routes/sales.ts) — it duplicated the same figure already shown, informationally, in
// Calcul du quotidien and Rapport fiscal, and cluttered Gestion des dépenses with entries the user
// never entered. Removes any such row a database created before this change; idempotent (deletes
// zero rows once none are left) so it's safe to run on every boot rather than needing a version flag.
db.exec("DELETE FROM expenses WHERE source_type = 'sale_vat'");
