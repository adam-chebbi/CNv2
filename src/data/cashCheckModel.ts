import { toLocalIsoDate, todayIso } from './dateUtils';
import { SaleTransaction } from './salesTransactions';
import { Expense } from './expensesModel';
import { SupplierInvoice } from './purchasesModel';
import { RevenueEntry } from './revenueEntriesModel';

// "Calcul du quotidien" — daily cash/card/ticket-resto reconciliation. See PUBLIC note in
// server/db/schema.sql's cash_verifications table for the persistence model this mirrors.
//
// Ticket resto is counted as a plain amount, not a breakdown of physical note denominations
// (5/7/10 DT) — it can now also be settled by card, which has no "notes" to count, so the
// verification step is just "how much did you count/receive", the same shape as the card check.

// Runtime-configurable via Paramètres (see src/data/settingsModel.ts) — a live `let` so every
// caller that reads this constant directly picks up a changed commission rate without a reload.
export let RESTO_DEDUCTION_RATE = 0.1;
export const setRestoDeductionRate = (rate: number): void => { RESTO_DEDUCTION_RATE = rate; };

export const computeRestoNet = (grossAmount: number): number => grossAmount * (1 - RESTO_DEDUCTION_RATE);

// --- Cash denominations (billets/pièces en circulation en Tunisie) ---

export type DenominationKey = 'm50' | 'm100' | 'm200' | 'm500' | 'dt1' | 'dt2' | 'dt5' | 'dt10' | 'dt20' | 'dt50';

export const CASH_DENOMINATIONS: { id: DenominationKey; value: number; label: string }[] = [
  { id: 'm50', value: 0.05, label: '50 millimes' },
  { id: 'm100', value: 0.1, label: '100 millimes' },
  { id: 'm200', value: 0.2, label: '200 millimes' },
  { id: 'm500', value: 0.5, label: '500 millimes' },
  { id: 'dt1', value: 1, label: '1 DT' },
  { id: 'dt2', value: 2, label: '2 DT' },
  { id: 'dt5', value: 5, label: '5 DT' },
  { id: 'dt10', value: 10, label: '10 DT' },
  { id: 'dt20', value: 20, label: '20 DT' },
  { id: 'dt50', value: 50, label: '50 DT' },
];

export type CashCounts = Record<DenominationKey, number>;

export const createEmptyCashCounts = (): CashCounts =>
  Object.fromEntries(CASH_DENOMINATIONS.map((d) => [d.id, 0])) as CashCounts;

export const computeCashTotal = (counts: CashCounts): number =>
  CASH_DENOMINATIONS.reduce((sum, d) => sum + (counts[d.id] || 0) * d.value, 0);

// --- Justifications ---

export type DiscrepancyCategory = 'Espèces' | 'Ticket resto' | 'Carte bancaire';

export interface DiscrepancyJustification {
  id: string;
  category: DiscrepancyCategory;
  expectedAmount: number;
  actualAmount: number;
  difference: number; // actualAmount - expectedAmount
  comment: string;
  createdAt: string;
}

// --- Persisted verification record ---

export type CashVerificationStatus = 'Vérifiée' | 'Vérifiée avec écart' | 'Vérifiée avec justification';

export interface CashVerification {
  id: string;
  coveredDate: string;
  cashCounts: CashCounts;
  cashSystemAmount: number;
  cashCountedAmount: number;
  restoSystemAmount: number;
  restoCountedGross: number;
  restoCountedNet: number;
  cardSystemAmount: number;
  cardVerifiedAmount: number;
  cardVerifiedCount?: number;
  totalSystem: number;
  totalCounted: number;
  totalDifference: number;
  status: CashVerificationStatus;
  justifications: DiscrepancyJustification[];
  supersedesId?: string;
  confirmedAt: string;
  confirmedBy: string;
}

export type CashVerificationInput = Omit<CashVerification, 'id' | 'confirmedAt' | 'confirmedBy'>;

const DISCREPANCY_EPSILON = 0.01;

export const isSignificantDifference = (difference: number): boolean => Math.abs(difference) > DISCREPANCY_EPSILON;

export const deriveVerificationStatus = (totalDifference: number, hasJustifications: boolean): CashVerificationStatus => {
  if (!isSignificantDifference(totalDifference)) return 'Vérifiée';
  return hasJustifications ? 'Vérifiée avec justification' : 'Vérifiée avec écart';
};

export const sortVerificationsByConfirmedAtDesc = (verifications: CashVerification[]): CashVerification[] =>
  [...verifications].sort((a, b) => new Date(b.confirmedAt).getTime() - new Date(a.confirmedAt).getTime());

export const findLatestVerificationForDate = (verifications: CashVerification[], date: string): CashVerification | null =>
  sortVerificationsByConfirmedAtDesc(verifications.filter((v) => v.coveredDate === date))[0] ?? null;

// --- KPIs ("situation actuelle") ---
//
// Baseline = the last confirmed verification's counted/verified amounts. From there, every sale
// after the verification's confirmation adds to the matching payment method, and every approved
// expense / paid supplier invoice recorded after it subtracts — exactly like a till that gets
// reset at each confirmed check and moves with real cash flow afterwards. Ticket-resto physical
// ticket counts can only ever be known by actually counting them, so the running count stays
// pinned to the last verification's count; only its net monetary value keeps moving with new sales.

// Business date/time fields (SaleTransaction.date/time, Expense/SupplierInvoice.createdAt written
// as plain "YYYY-MM-DDTHH:mm") carry no timezone of their own — they're the till's Tunisia wall
// clock. confirmedAt, on the other hand, is always a real UTC instant (new Date().toISOString()
// server-side). Anchoring the wall-clock side to a fixed Africa/Tunis offset (+01:00, no DST)
// before comparing turns both sides into genuinely comparable absolute instants — comparing them
// as-is would silently mis-order "before/after the verification" depending on the server process's
// own OS timezone.
const TUNISIA_OFFSET = '+01:00';

const saleDateTimeMs = (t: SaleTransaction): number => {
  const ms = new Date(`${t.date}T${t.time || '00:00'}:00${TUNISIA_OFFSET}`).getTime();
  return Number.isNaN(ms) ? new Date(`${t.date}T00:00:00${TUNISIA_OFFSET}`).getTime() : ms;
};

const recordCreatedAtMs = (createdAt: string): number => {
  // Already a real timezone-aware instant (has 'Z' or an explicit offset) — parse as-is.
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(createdAt)) {
    const ms = new Date(createdAt).getTime();
    return Number.isNaN(ms) ? -Infinity : ms;
  }
  const ms = new Date(`${createdAt}${TUNISIA_OFFSET}`).getTime();
  return Number.isNaN(ms) ? -Infinity : ms;
};

const isoDateTimeMs = (iso: string): number => {
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? -Infinity : ms;
};

export interface CashKpis {
  especes: number;
  carte: number;
  restoNet: number;
  lastVerification: CashVerification | null;
}

export const computeCashKpis = (
  salesTransactions: SaleTransaction[],
  expenses: Expense[],
  supplierInvoices: SupplierInvoice[],
  verifications: CashVerification[],
  revenueEntries: RevenueEntry[] = []
): CashKpis => {
  const lastVerification = sortVerificationsByConfirmedAtDesc(verifications)[0] ?? null;
  const cutoff = lastVerification ? isoDateTimeMs(lastVerification.confirmedAt) : -Infinity;

  let especes = lastVerification?.cashCountedAmount ?? 0;
  let carte = lastVerification?.cardVerifiedAmount ?? 0;
  let restoNet = lastVerification?.restoCountedNet ?? 0;

  salesTransactions.forEach((t) => {
    if (t.status !== 'Payé') return;
    if (saleDateTimeMs(t) <= cutoff) return;
    if (t.paymentMethod === 'Espèces') especes += t.totalAmount;
    else if (t.paymentMethod === 'Carte bancaire') carte += t.totalAmount;
    else if (t.paymentMethod === 'Ticket resto') restoNet += t.totalAmount * (1 - RESTO_DEDUCTION_RATE);
  });

  // Hand-typed chiffres d'affaires: only those with a règlement move the till (an entry without
  // one, or "Autre", can't be attributed to Espèces / Carte / Tickets resto). Ordered against the
  // last verification by when they were entered, like expenses and supplier invoices.
  revenueEntries.forEach((r) => {
    if (recordCreatedAtMs(r.createdAt) <= cutoff) return;
    if (r.paymentMethod === 'Espèces') especes += r.amount;
    else if (r.paymentMethod === 'Carte bancaire') carte += r.amount;
    else if (r.paymentMethod === 'Ticket resto') restoNet += r.amount * (1 - RESTO_DEDUCTION_RATE);
  });

  expenses.forEach((e) => {
    if (e.status !== 'Approuvé') return;
    if (recordCreatedAtMs(e.createdAt) <= cutoff) return;
    if (e.paymentMethod === 'Espèces') especes -= e.amount;
    else if (e.paymentMethod === 'Carte bancaire') carte -= e.amount;
  });

  supplierInvoices.forEach((inv) => {
    if (inv.amountPaid <= 0) return;
    if (recordCreatedAtMs(inv.createdAt) <= cutoff) return;
    if (inv.paymentMethod === 'Espèces') especes -= inv.amountPaid;
    else if (inv.paymentMethod === 'Carte bancaire') carte -= inv.amountPaid;
  });

  return { especes, carte, restoNet, lastVerification };
};

// --- Per-day "système" totals (sections Espèces / Tickets resto / Carte bancaire) ---

export interface DaySystemTotals {
  date: string;
  ventesEspeces: number;
  ventesCarte: number;
  ventesCarteCount: number;
  ventesRestoGross: number;
  ventesRestoNet: number;
  depensesEspeces: number;
  depensesCarte: number;
  achatsEspeces: number;
  achatsCarte: number;
  netEspeces: number;
  netCarte: number;
  // Hand-typed chiffres d'affaires of the day (already included in ventesEspeces / ventesCarte /
  // ventesRestoGross when they have a règlement). `revenueEntriesUnallocated` is the part with no
  // règlement or "Autre", which has no till to reconcile against.
  revenueEntriesTotal: number;
  revenueEntriesUnallocated: number;
}

export const computeDaySystemTotals = (
  date: string,
  salesTransactions: SaleTransaction[],
  expenses: Expense[],
  supplierInvoices: SupplierInvoice[],
  revenueEntries: RevenueEntry[] = []
): DaySystemTotals => {
  let ventesEspeces = 0;
  let ventesCarte = 0;
  let ventesCarteCount = 0;
  let ventesRestoGross = 0;

  salesTransactions.forEach((t) => {
    if (t.status !== 'Payé' || t.date !== date) return;
    if (t.paymentMethod === 'Espèces') ventesEspeces += t.totalAmount;
    else if (t.paymentMethod === 'Carte bancaire') {
      ventesCarte += t.totalAmount;
      ventesCarteCount += 1;
    } else if (t.paymentMethod === 'Ticket resto') ventesRestoGross += t.totalAmount;
  });

  // A chiffre d'affaires with a règlement counts like a sale paid that way. It adds to the amount,
  // never to the number of card payments (an entered total isn't a count of transactions).
  let revenueEntriesTotal = 0;
  let revenueEntriesUnallocated = 0;
  revenueEntries.forEach((r) => {
    if (r.date !== date) return;
    revenueEntriesTotal += r.amount;
    if (r.paymentMethod === 'Espèces') ventesEspeces += r.amount;
    else if (r.paymentMethod === 'Carte bancaire') ventesCarte += r.amount;
    else if (r.paymentMethod === 'Ticket resto') ventesRestoGross += r.amount;
    else revenueEntriesUnallocated += r.amount;
  });

  let depensesEspeces = 0;
  let depensesCarte = 0;
  expenses.forEach((e) => {
    if (e.status !== 'Approuvé' || e.date !== date) return;
    if (e.paymentMethod === 'Espèces') depensesEspeces += e.amount;
    else if (e.paymentMethod === 'Carte bancaire') depensesCarte += e.amount;
  });

  let achatsEspeces = 0;
  let achatsCarte = 0;
  supplierInvoices.forEach((inv) => {
    if (inv.amountPaid <= 0 || inv.invoiceDate !== date) return;
    if (inv.paymentMethod === 'Espèces') achatsEspeces += inv.amountPaid;
    else if (inv.paymentMethod === 'Carte bancaire') achatsCarte += inv.amountPaid;
  });

  return {
    date,
    ventesEspeces,
    ventesCarte,
    ventesCarteCount,
    ventesRestoGross,
    ventesRestoNet: ventesRestoGross * (1 - RESTO_DEDUCTION_RATE),
    depensesEspeces,
    depensesCarte,
    achatsEspeces,
    achatsCarte,
    netEspeces: ventesEspeces - depensesEspeces - achatsEspeces,
    netCarte: ventesCarte - depensesCarte - achatsCarte,
    revenueEntriesTotal,
    revenueEntriesUnallocated,
  };
};

// --- Daily evolution calendar (GitHub-contributions-style grid, reusing the dashboard's layout) ---

export interface CashCheckCalendarCell {
  dateIso: string;
  weekday: number; // 0=Lun .. 6=Dim
  ventes: number;
  depenses: number;
  combined: number;
  inRange: boolean;
}

export interface CashCheckCalendarWeek {
  cells: CashCheckCalendarCell[];
}

export interface CashCheckCalendarMonthLabel {
  label: string;
  weekIndex: number;
}

export interface CashCheckCalendarData {
  weeks: CashCheckCalendarWeek[];
  monthLabels: CashCheckCalendarMonthLabel[];
  maxVentes: number;
  maxDepenses: number;
  maxCombined: number;
  rangeStartIso: string;
  rangeEndIso: string;
}

const MONTH_LABELS_FULL_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export const buildCashCheckCalendar = (
  salesTransactions: SaleTransaction[],
  expenses: Expense[],
  supplierInvoices: SupplierInvoice[],
  monthsBack = 8,
  revenueEntries: RevenueEntry[] = []
): CashCheckCalendarData => {
  // Local midnight of the business date, so the local-time grid arithmetic below and the ISO dates
  // read back through toLocalIsoDate always agree with the sales' own date strings.
  const today = new Date(`${todayIso()}T00:00:00`);

  const rangeEnd = today;
  const rangeStart = new Date(today.getFullYear(), today.getMonth() - (monthsBack - 1), 1);

  const gridStart = new Date(rangeStart);
  gridStart.setDate(gridStart.getDate() - ((gridStart.getDay() + 6) % 7));
  const gridEnd = new Date(rangeEnd);
  gridEnd.setDate(gridEnd.getDate() + (6 - ((gridEnd.getDay() + 6) % 7)));

  const ventesByDate = new Map<string, number>();
  salesTransactions.forEach((t) => {
    if (t.status !== 'Payé') return;
    ventesByDate.set(t.date, (ventesByDate.get(t.date) ?? 0) + t.totalAmount);
  });

  // Every hand-typed chiffre d'affaires counts as that day's sales in the grid, règlement or not.
  revenueEntries.forEach((r) => {
    ventesByDate.set(r.date, (ventesByDate.get(r.date) ?? 0) + r.amount);
  });

  const depensesByDate = new Map<string, number>();
  expenses.forEach((e) => {
    if (e.status !== 'Approuvé') return;
    depensesByDate.set(e.date, (depensesByDate.get(e.date) ?? 0) + e.amount);
  });
  supplierInvoices.forEach((inv) => {
    if (inv.amountPaid <= 0) return;
    depensesByDate.set(inv.invoiceDate, (depensesByDate.get(inv.invoiceDate) ?? 0) + inv.amountPaid);
  });

  const weeks: CashCheckCalendarWeek[] = [];
  const monthLabels: CashCheckCalendarMonthLabel[] = [];
  let maxVentes = 0;
  let maxDepenses = 0;
  let maxCombined = 0;
  let lastLabeledMonth = -1;

  for (let cursor = new Date(gridStart); cursor <= gridEnd; ) {
    const cells: CashCheckCalendarCell[] = [];
    let containsFirstOfMonth = false;
    for (let w = 0; w < 7; w += 1) {
      const iso = toLocalIsoDate(cursor);
      const cellInRange = cursor >= rangeStart && cursor <= rangeEnd;
      if (cursor.getDate() === 1) containsFirstOfMonth = true;
      const ventes = ventesByDate.get(iso) ?? 0;
      const depenses = depensesByDate.get(iso) ?? 0;
      const combined = ventes + depenses;
      if (cellInRange) {
        if (ventes > maxVentes) maxVentes = ventes;
        if (depenses > maxDepenses) maxDepenses = depenses;
        if (combined > maxCombined) maxCombined = combined;
      }
      cells.push({ dateIso: iso, weekday: w, ventes, depenses, combined, inRange: cellInRange });
      cursor.setDate(cursor.getDate() + 1);
    }
    const mondayMonth = new Date(`${cells[0].dateIso}T00:00:00`).getMonth();
    if ((weeks.length === 0 || containsFirstOfMonth) && mondayMonth !== lastLabeledMonth) {
      monthLabels.push({ label: MONTH_LABELS_FULL_FR[mondayMonth], weekIndex: weeks.length });
      lastLabeledMonth = mondayMonth;
    }
    weeks.push({ cells });
  }

  return {
    weeks,
    monthLabels,
    maxVentes,
    maxDepenses,
    maxCombined,
    rangeStartIso: toLocalIsoDate(rangeStart),
    rangeEndIso: toLocalIsoDate(rangeEnd),
  };
};
