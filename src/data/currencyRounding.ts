// Tunisian cash rounding: everyday cash transactions never use 1, 10 or 20 millime coins — the
// smallest denomination actually in circulation is 50 millimes, and every other Tunisian
// denomination (100m, 200m, 500m, 1/2/5/10/20/50 DT) is a whole multiple of it. So "round up to
// the next amount payable in real coins/notes" is exactly "round up to the next multiple of
// 0.050 DT". Done in integer millimes throughout to avoid floating-point drift.

export const SMALLEST_CASH_DENOMINATION = 0.05; // 50 millimes, in DT

export const roundToPayableCash = (amount: number): number => {
  const stepMillimes = Math.round(SMALLEST_CASH_DENOMINATION * 1000); // 50
  const amountMillimes = Math.round(amount * 1000);
  const roundedMillimes = Math.ceil(amountMillimes / stepMillimes) * stepMillimes;
  return roundedMillimes / 1000;
};
