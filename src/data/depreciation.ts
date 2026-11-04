import type { Millimes } from './money';

// Amortissement linéaire (cahier des charges §15.2), in integer millimes.
//
//   dotation mensuelle = (valeur amortissable − valeur résiduelle) / durée en mois
//
// The rounding remainder goes to the last month, so the dotations always add up exactly to the
// depreciable base. Depreciation starts with the month the equipment is put into service and
// stops after the month it leaves the register. Example: 6 000 DT over 60 months → 100 DT a month,
// 1 200 DT a year. A management aid — not statutory accounting.

export interface DepreciableAsset {
  valueMil: Millimes;
  residualMil: Millimes;
  durationMonths: number;
  inServiceDate: string; // YYYY-MM-DD
  retiredOn?: string | null; // YYYY-MM-DD
}

export interface ScheduleRow {
  month: string; // YYYY-MM
  dotationMil: Millimes;
  cumulativeMil: Millimes;
  netMil: Millimes;
}

const monthIndex = (yyyyMm: string): number => Number(yyyyMm.slice(0, 4)) * 12 + Number(yyyyMm.slice(5, 7)) - 1;
const monthLabel = (index: number): string => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;

export const depreciableBase = (a: DepreciableAsset): Millimes => Math.max(0, a.valueMil - a.residualMil);

export const monthlyDotation = (a: DepreciableAsset): Millimes => Math.floor(depreciableBase(a) / a.durationMonths);

export const schedule = (a: DepreciableAsset): ScheduleRow[] => {
  const base = depreciableBase(a);
  const regular = monthlyDotation(a);
  const start = monthIndex(a.inServiceDate.slice(0, 7));
  const lastByRetirement = a.retiredOn ? monthIndex(a.retiredOn.slice(0, 7)) : Infinity;
  const rows: ScheduleRow[] = [];
  let cumulative = 0;
  for (let i = 0; i < a.durationMonths; i++) {
    const index = start + i;
    if (index > lastByRetirement) break;
    const dotation = i === a.durationMonths - 1 ? base - cumulative : regular;
    cumulative += dotation;
    rows.push({ month: monthLabel(index), dotationMil: dotation, cumulativeMil: cumulative, netMil: a.valueMil - cumulative });
  }
  return rows;
};

// Dotations falling between two months, inclusive (YYYY-MM).
export const dotationBetween = (a: DepreciableAsset, fromMonth: string, toMonth: string): Millimes =>
  schedule(a)
    .filter((r) => r.month >= fromMonth && r.month <= toMonth)
    .reduce((s, r) => s + r.dotationMil, 0);

export interface AssetSituation {
  monthlyMil: Millimes;
  annualMil: Millimes;
  cumulativeMil: Millimes;
  netMil: Millimes;
  remainingMonths: number;
}

// Situation at a given month (YYYY-MM), counting that month as elapsed.
export const situationAt = (a: DepreciableAsset, month: string): AssetSituation => {
  const rows = schedule(a);
  const elapsed = rows.filter((r) => r.month <= month);
  const cumulative = elapsed.at(-1)?.cumulativeMil ?? 0;
  const monthly = monthlyDotation(a);
  return {
    monthlyMil: monthly,
    annualMil: Math.min(depreciableBase(a), monthly * 12),
    cumulativeMil: cumulative,
    netMil: a.valueMil - cumulative,
    remainingMonths: rows.length - elapsed.length,
  };
};
