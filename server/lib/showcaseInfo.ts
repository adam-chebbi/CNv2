import { db } from '../db/connection.js';
import { fromJson } from '../db/json.js';
import {
  SHOWCASE_SETTINGS_KEY,
  normalizeShowcaseSiteInfo,
  type ShowcaseSiteInfo,
} from '../../src/data/showcaseSettingsModel.js';

interface StoredRow {
  value: string;
  updated_at: string;
  updated_by: string;
}

export interface StoredShowcaseInfo {
  info: ShowcaseSiteInfo;
  updatedAt: string | null;
  updatedBy: string | null;
}

// Reads the record kept in app_settings. No row = nothing was ever saved = the defaults; a stored
// value that is incomplete or no longer valid is normalized (missing parts take their default, unsafe
// URLs are dropped) so the public site can never be served something it should not link to.
export const readShowcaseInfo = (): StoredShowcaseInfo => {
  const row = db.prepare('SELECT value, updated_at, updated_by FROM app_settings WHERE key = ?').get(SHOWCASE_SETTINGS_KEY) as StoredRow | undefined;
  if (!row) return { info: normalizeShowcaseSiteInfo(undefined), updatedAt: null, updatedBy: null };
  let stored: unknown;
  try {
    stored = fromJson<unknown>(row.value, undefined);
  } catch {
    // Unreadable JSON must never take the public site down: serve the defaults until it is saved again.
    stored = undefined;
  }
  return { info: normalizeShowcaseSiteInfo(stored), updatedAt: row.updated_at, updatedBy: row.updated_by };
};
