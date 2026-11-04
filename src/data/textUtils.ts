// Generic, domain-agnostic text normalization shared by every "match a free-text import value
// against a canonical entity" flow in the app (sales import, stock import, manual entry, etc).
// A match always resolves to the entity's real stored value — never mutates or creates one.

export const normalizeKey = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

// Column headers additionally fold whitespace/hyphens to underscores so "Stock Cible",
// "stock-cible" and "stock_cible" all resolve to the same canonical column key.
export const normalizeHeaderKey = (value: string): string => normalizeKey(value).replace(/[\s-]+/g, '_');

const isValidCalendarDate = (y: number, m: number, d: number): boolean => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
};

// Accepts ISO (yyyy-mm-dd) or French-style (dd/mm/yyyy, dd-mm-yyyy) dates and returns an ISO
// string, or null if the value can't be parsed as a real calendar date. Never guesses blindly.
// Shared by every bulk-import feature that reads a date column (sales import, stock import, …).
export const parseDateFlexible = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let m = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    return isValidCalendarDate(y, mo, d)
      ? `${y}-${mo.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`
      : null;
  }

  m = trimmed.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = Number(m[3]);
    return isValidCalendarDate(y, mo, d)
      ? `${y}-${mo.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`
      : null;
  }

  return null;
};
