// One place for "what day is it" and calendar-day arithmetic, shared by the client and the server.
//
// Why this exists: business dates in this app are plain "YYYY-MM-DD" strings (SaleTransaction.date,
// Expense.date, …) that mean a day on the TILL'S calendar — Tunisia, UTC+1 all year. The classic
// `new Date().toISOString().slice(0, 10)` and `d.toISOString()` after local-time arithmetic both go
// through UTC, which lands one day EARLY anywhere east of UTC (local midnight in Tunisia is 23:00Z
// of the previous day). That silently shifted "Hier", the weekly range, the monthly chart buckets,
// the planning week and every "today" default. So:
//
//   - "today" is read on the business clock (Africa/Tunis), whatever timezone the browser or the
//     server process happens to run in;
//   - day arithmetic is done on the Y/M/D numbers with Date.UTC, so no timezone or DST can move
//     a date.

export const BUSINESS_TIME_ZONE = 'Africa/Tunis';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const dayFormatter = (() => {
  try {
    // The en-CA locale formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return null;
  }
})();

/** YYYY-MM-DD of a Date in the machine's own local calendar (never via UTC). */
export const toLocalIsoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Today's business date (Africa/Tunis), as YYYY-MM-DD. */
export const todayIso = (now: Date = new Date()): string => {
  const formatted = dayFormatter?.format(now);
  return formatted && ISO_DAY.test(formatted) ? formatted : toLocalIsoDate(now);
};

const parseIso = (iso: string): [number, number, number] => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return [y, m, d];
};

const fromUtcMs = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** The date `days` after (or before, if negative) `iso`. */
export const addDaysIso = (iso: string, days: number): string => {
  const [y, m, d] = parseIso(iso);
  return fromUtcMs(Date.UTC(y, m - 1, d + days));
};

/** First day of the month `monthOffset` months after (negative: before) the month of `iso`. */
export const firstOfMonthIso = (iso: string, monthOffset = 0): string => {
  const [y, m] = parseIso(iso);
  return fromUtcMs(Date.UTC(y, m - 1 + monthOffset, 1));
};

/** Number of days from `from` to `to` (negative when `to` is earlier). */
export const diffDaysIso = (from: string, to: string): number => {
  const [fy, fm, fd] = parseIso(from);
  const [ty, tm, td] = parseIso(to);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
};

/** Weekday of a date with Monday first: 0 = Lundi … 6 = Dimanche. */
export const weekdayMondayFirst = (iso: string): number => {
  const [y, m, d] = parseIso(iso);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
};

/** Monday of the week containing `iso`. */
export const mondayOfWeekIso = (iso: string): string => addDaysIso(iso, -weekdayMondayFirst(iso));

/** Day of the month (1-31) and month index (0-11) of an ISO date, without a Date round-trip. */
export const dayOfMonth = (iso: string): number => parseIso(iso)[2];
export const monthIndexOf = (iso: string): number => parseIso(iso)[1] - 1;
export const yearOf = (iso: string): number => parseIso(iso)[0];
