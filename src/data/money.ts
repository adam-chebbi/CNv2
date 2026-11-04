// Money as integer millimes (1 DT = 1000 millimes) — shared by the server and every screen of the
// point of sale, so the cash register, the QR menu, the bill and the ticket can never disagree on
// a total because of floating-point drift. Catalogue prices are still stored in DT (REAL) by the
// V1 tables; they are converted once, at the boundary, with toMillimes().

export type Millimes = number;

export const toMillimes = (dt: number): Millimes => Math.round(dt * 1000);

export const fromMillimes = (mil: Millimes): number => mil / 1000;

// "22,500 DT" — the café's usual 3-decimal display, French separators.
export const formatDt = (mil: Millimes, withUnit = true): string => {
  const sign = mil < 0 ? '-' : '';
  const abs = Math.abs(Math.round(mil));
  const units = Math.floor(abs / 1000).toLocaleString('fr-FR');
  const decimals = String(abs % 1000).padStart(3, '0');
  return `${sign}${units},${decimals}${withUnit ? ' DT' : ''}`;
};

// Parses what a cashier types ("22,5", "22.500", "30") into millimes; null when not a number.
export const parseDtInput = (raw: string): Millimes | null => {
  const cleaned = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (cleaned === '' || !/^-?\d*(\.\d*)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? toMillimes(n) : null;
};

// Smallest coin in circulation in Tunisia is 50 millimes (see currencyRounding.ts).
export const CASH_STEP_MILLIMES = 50;

export const roundUpToCashStep = (mil: Millimes): Millimes => Math.ceil(mil / CASH_STEP_MILLIMES) * CASH_STEP_MILLIMES;
