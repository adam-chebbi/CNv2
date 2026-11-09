// Pilotage (amélioration 09): small, explainable models — no black box. Pure functions shared by
// the server and the screens. Dates are Tunis calendar dates (YYYY-MM-DD).

export const addDays = (date: string, days: number): string => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Expected quantity for `target`: weighted average of the same weekday over the previous `weeks`
 * weeks (the most recent week weighs most). Weeks before the first known sale are ignored, so a
 * new café is not dragged down by days it was closed.
 */
export const forecastDay = (daily: Map<string, number>, target: string, firstDate: string | null, weeks = 8): number => {
  let sum = 0;
  let weights = 0;
  for (let k = 1; k <= weeks; k += 1) {
    const day = addDays(target, -7 * k);
    if (!firstDate || day < firstDate) break;
    const w = weeks - k + 1;
    sum += (daily.get(day) ?? 0) * w;
    weights += w;
  }
  return weights === 0 ? 0 : sum / weights;
};

/** Mean absolute percentage error over the days that had sales (shown as the confidence level). */
export const mape = (pairs: { actual: number; predicted: number }[]): number | null => {
  const usable = pairs.filter((p) => p.actual > 0);
  if (usable.length === 0) return null;
  return usable.reduce((s, p) => s + Math.abs(p.actual - p.predicted) / p.actual, 0) / usable.length;
};

/** What to order so the stock still covers the expected need and the safety threshold. */
export const reorderQuantity = (p: { need: number; stock: number; onOrder: number; minThreshold: number; packSize?: number | null }): number => {
  const missing = p.need + p.minThreshold - p.stock - p.onOrder;
  if (missing <= 0) return 0;
  const pack = p.packSize && p.packSize > 0 ? p.packSize : null;
  return pack ? Math.ceil(missing / pack - 1e-9) * pack : Math.ceil(missing * 1000) / 1000;
};

export type MenuClass = 'star' | 'plowhorse' | 'puzzle' | 'dog';
export const MENU_CLASS_LABELS: Record<MenuClass, { label: string; advice: string }> = {
  star: { label: 'Étoile', advice: 'Populaire et rentable : mettez-le en avant, ne touchez pas à la recette.' },
  plowhorse: { label: 'Vache à lait', advice: 'Très vendu mais peu de marge : revoir le coût matière ou augmenter légèrement le prix.' },
  puzzle: { label: 'Énigme', advice: 'Bonne marge mais peu vendu : meilleure place sur la carte, suggestion du serveur, photo.' },
  dog: { label: 'Poids mort', advice: 'Peu vendu et peu rentable : à remplacer ou retirer de la carte.' },
};

/**
 * Menu engineering (Kasavana & Smith): popular when its share of items sold reaches 70 % of an equal
 * share; profitable when its unit margin reaches the average margin weighted by quantity.
 */
export const menuEngineering = <T extends { quantity: number; unitMarginMil: number }>(items: T[]): (T & { class: MenuClass; popularityShare: number })[] => {
  const sold = items.reduce((s, i) => s + i.quantity, 0);
  if (sold === 0 || items.length === 0) return [];
  const popularityThreshold = (1 / items.length) * 0.7;
  const avgMargin = items.reduce((s, i) => s + i.unitMarginMil * i.quantity, 0) / sold;
  return items.map((i) => {
    const share = i.quantity / sold;
    const popular = share >= popularityThreshold;
    const profitable = i.unitMarginMil >= avgMargin;
    const cls: MenuClass = popular ? (profitable ? 'star' : 'plowhorse') : profitable ? 'puzzle' : 'dog';
    return { ...i, class: cls, popularityShare: share };
  });
};

/** Recommended staff on the floor for an expected number of orders in one hour. */
export const staffFor = (ordersPerHour: number, ordersPerStaffHour = 12): number => (ordersPerHour <= 0 ? 0 : Math.max(1, Math.ceil(ordersPerHour / ordersPerStaffHour)));
