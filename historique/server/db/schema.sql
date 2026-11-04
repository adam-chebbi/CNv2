-- Historique & Comptage — this app's OWN database (historique.sqlite3). Nothing here is shared
-- with the main app's cafenoir.sqlite3: users are referenced by the main app's user id + a copy of
-- their name at the time of the action. Every amount is INTEGER millimes (see shared/model.ts).

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- One row per (date, service). `depenses` is a JSON array of {libelle, montant}; the derived
-- totals are stored too so the history list never has to recompute them.
CREATE TABLE IF NOT EXISTS caisses (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  shift TEXT NOT NULL,
  ca INTEGER NOT NULL,
  depenses TEXT NOT NULL DEFAULT '[]',
  total_depenses INTEGER NOT NULL,
  attendu_caisse INTEGER NOT NULL,
  tpe INTEGER NOT NULL DEFAULT 0,
  tickets_resto INTEGER NOT NULL DEFAULT 0,
  especes INTEGER NOT NULL,
  cree_par_id TEXT NOT NULL,
  cree_par_nom TEXT NOT NULL,
  cree_le TEXT NOT NULL,
  maj_par_nom TEXT,
  maj_le TEXT,
  UNIQUE (date, shift)
);
CREATE INDEX IF NOT EXISTS idx_caisses_date ON caisses(date);

-- Audit trail: every save keeps the previous values, so a correction never erases what was there.
CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  user_id TEXT,
  user_name TEXT NOT NULL,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  journee_date TEXT,
  entity_id TEXT,
  details TEXT,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_log(timestamp);

-- Avances au personnel: independent from `caisses` (never part of any caisse calculation).
-- Never hard-deleted: a deletion (allowed within 24 h, password required) only sets supprime_*.
CREATE TABLE IF NOT EXISTS avances (
  id TEXT PRIMARY KEY,
  employe TEXT NOT NULL,
  employe_cle TEXT NOT NULL,
  montant INTEGER NOT NULL CHECK (montant > 0),
  motif TEXT,
  commentaire TEXT,
  date TEXT NOT NULL,
  heure TEXT NOT NULL,
  saisie_manuelle INTEGER NOT NULL DEFAULT 0,
  cree_par_id TEXT NOT NULL,
  cree_par_nom TEXT NOT NULL,
  cree_le TEXT NOT NULL,
  supprime_par_nom TEXT,
  supprime_le TEXT
);
CREATE INDEX IF NOT EXISTS idx_avances_date ON avances(date);
CREATE INDEX IF NOT EXISTS idx_avances_employe ON avances(employe_cle);

-- Employee names typed in the avance form, remembered locally to suggest them next time (no link
-- to the main app's HR records, on purpose).
CREATE TABLE IF NOT EXISTS avance_employes (
  cle TEXT PRIMARY KEY,
  nom TEXT NOT NULL,
  dernier_usage TEXT NOT NULL
);

-- Accounts of this app — fully independent from the main app since 2026-10-17. Passwords are
-- scrypt-hashed ("<salt-hex>:<hash-hex>"). must_change_password forces a new password at the next
-- login (temporary passwords). Accounts are never deleted, only deactivated.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'gerant',
  password_hash TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  password_updated_at TEXT,
  created_at TEXT NOT NULL
);

-- One row per signed-in device. The token lives only in an httpOnly cookie.
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- "Mot de passe oublié" links: only the SHA-256 of the token is stored (the token itself only
-- travels in the email). Valid 30 minutes, single use.
CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id, created_at);
