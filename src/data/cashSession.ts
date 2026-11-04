import type { Millimes } from './money';

// Cash session arithmetic (ouverture, mouvements, clôture). Pure functions shared by the server,
// which records the closing figures, and the closing screen, which shows them live.

export type PaymentMethod = 'cash' | 'card' | 'voucher';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Espèces',
  card: 'TPE',
  voucher: 'Ticket restaurant',
};

export interface SessionFigures {
  openingFloatMil: Millimes;
  // Net amounts settled per method during the session (refunds are negative).
  paymentsByMethod: Record<PaymentMethod, Millimes>;
  cashRefundsMil: Millimes; // positive number: cash given back on refunds (already inside paymentsByMethod.cash)
  cashInMil: Millimes;
  cashOutMil: Millimes;
}

export interface SessionSummary extends SessionFigures {
  cashSalesMil: Millimes; // cash collected on sales, before refunds
  expectedCashMil: Millimes;
  revenueMil: Millimes; // everything settled, all methods — the opening float is never revenue
}

// Espèces attendues = fond initial + encaissements espèces + entrées − sorties − remboursements espèces.
// Example (cahier des charges §2.9): 100 + 200 + 0 − 50 − 10 = 240 DT.
export const summarizeSession = (f: SessionFigures): SessionSummary => {
  const cashSalesMil = f.paymentsByMethod.cash + f.cashRefundsMil;
  return {
    ...f,
    cashSalesMil,
    expectedCashMil: f.openingFloatMil + cashSalesMil + f.cashInMil - f.cashOutMil - f.cashRefundsMil,
    revenueMil: f.paymentsByMethod.cash + f.paymentsByMethod.card + f.paymentsByMethod.voucher,
  };
};

// Tunisian notes and coins, for the counting aid at closing (values in millimes).
export const CASH_DENOMINATIONS: { valueMil: Millimes; label: string }[] = [
  { valueMil: 50_000, label: '50 DT' },
  { valueMil: 20_000, label: '20 DT' },
  { valueMil: 10_000, label: '10 DT' },
  { valueMil: 5_000, label: '5 DT' },
  { valueMil: 2_000, label: '2 DT' },
  { valueMil: 1_000, label: '1 DT' },
  { valueMil: 500, label: '500 m' },
  { valueMil: 200, label: '200 m' },
  { valueMil: 100, label: '100 m' },
  { valueMil: 50, label: '50 m' },
];

export const countedTotal = (counts: Record<string, number>): Millimes =>
  CASH_DENOMINATIONS.reduce((sum, d) => sum + d.valueMil * Math.max(0, Math.floor(counts[String(d.valueMil)] ?? 0)), 0);
