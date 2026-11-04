// "Chiffres d'affaires" typed by hand on the Calcul du quotidien page (server/routes/revenueEntries.ts).
//
// A revenue entry is a day-level total — no products, so no stock deduction, no margin and no
// automatic VAT expense (those all hang off real sales lines). What it does feed, on that same
// page: the day's "système" amounts, the "situation actuelle" KPIs and the daily-evolution grid.
//
// The règlement is optional. `paymentMethod === null` is the "CA général" case (règlement not
// specified): it counts in the day's revenue but can't be attributed to Espèces / Carte / Tickets
// resto, so it doesn't move those reconciliation amounts. The same goes for the catch-all "Autre"
// (virement, chèque…), which has no counted-till equivalent on the page.

export type RevenuePaymentMethod = 'Espèces' | 'Carte bancaire' | 'Ticket resto' | 'Autre';

export const REVENUE_PAYMENT_METHODS: RevenuePaymentMethod[] = ['Espèces', 'Carte bancaire', 'Ticket resto', 'Autre'];

export interface RevenueEntry {
  id: string;
  date: string; // YYYY-MM-DD — the day the revenue belongs to
  amount: number; // DT, TTC, always > 0
  paymentMethod: RevenuePaymentMethod | null; // null = CA général
  note?: string;
  createdAt: string; // ISO instant (UTC)
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type RevenueEntryInput = Pick<RevenueEntry, 'date' | 'amount' | 'paymentMethod' | 'note'>;

export const REVENUE_NOTE_MAX_LENGTH = 500;

/** Returns a French error message, or null when the draft can be saved. */
export const validateRevenueDraft = (amount: number, note: string): string | null => {
  if (!Number.isFinite(amount) || amount <= 0) return 'Saisissez un montant supérieur à 0.';
  if (amount > 10_000_000) return 'Montant trop élevé.';
  if (note.trim().length > REVENUE_NOTE_MAX_LENGTH) return `La note ne peut pas dépasser ${REVENUE_NOTE_MAX_LENGTH} caractères.`;
  return null;
};

export const sortRevenueEntries = (entries: RevenueEntry[]): RevenueEntry[] =>
  [...entries].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

export interface DayRevenueSummary {
  total: number;
  byMethod: Record<RevenuePaymentMethod, number>;
  unspecified: number; // CA général — no règlement chosen
}

export const summarizeDayRevenue = (entries: RevenueEntry[], date: string): DayRevenueSummary => {
  const summary: DayRevenueSummary = {
    total: 0,
    byMethod: { Espèces: 0, 'Carte bancaire': 0, 'Ticket resto': 0, Autre: 0 },
    unspecified: 0,
  };
  entries.forEach((e) => {
    if (e.date !== date) return;
    summary.total += e.amount;
    if (e.paymentMethod) summary.byMethod[e.paymentMethod] += e.amount;
    else summary.unspecified += e.amount;
  });
  return summary;
};
