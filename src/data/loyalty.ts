import type { Millimes } from './money';

// Programme de fidélité (cahier des charges §12) — pure rules shared by server and screens.

export interface LoyaltySettings {
  enabled: boolean;
  pointsPerDt: number; // points earned per dinar of eligible amount
  excludedCategories: string[];
  excludedArticleIds: string[];
  validityDays: number; // 0 = points never expire
}

export const DEFAULT_LOYALTY_SETTINGS: LoyaltySettings = {
  enabled: true,
  pointsPerDt: 1,
  excludedCategories: [],
  excludedArticleIds: [],
  validityDays: 0,
};

export interface EligibleLine {
  articleId: string;
  category: string;
  paidMil: Millimes; // what the line finally cost, after every discount
}

// Points are computed on what was actually paid for eligible products, after discounts and
// cancellations (§12.2). Rounded down: 22,900 DT at 1 point/DT → 22 points.
export const eligibleAmount = (lines: EligibleLine[], settings: LoyaltySettings): Millimes =>
  lines
    .filter((l) => !settings.excludedCategories.includes(l.category) && !settings.excludedArticleIds.includes(l.articleId))
    .reduce((s, l) => s + Math.max(0, l.paidMil), 0);

export const pointsFor = (eligibleMil: Millimes, settings: LoyaltySettings): number =>
  settings.enabled ? Math.floor((eligibleMil * settings.pointsPerDt) / 1000) : 0;

// Points to take back when a settled sale is corrected by a credit note, in proportion.
export const pointsToReverse = (earned: number, saleTotalMil: Millimes, adjustedMil: Millimes): number =>
  saleTotalMil <= 0 ? 0 : Math.min(earned, Math.ceil((earned * adjustedMil) / saleTotalMil));

export type RewardKind = 'fixed' | 'percent' | 'product';

export interface Reward {
  id: string;
  name: string;
  pointsCost: number;
  kind: RewardKind; // fixed: value in millimes — percent: basis points — product: one article offered
  value: number;
  articleId?: string | null;
  active: boolean;
}

// Value of a reward on a bill. A product reward is worth one unit of that product if it is on the
// bill (the cheapest matching unit), nothing otherwise.
export const rewardAmount = (reward: Reward, billTotalMil: Millimes, unitPricesOnBill: { articleId: string; unitMil: Millimes }[]): Millimes => {
  if (reward.kind === 'fixed') return Math.min(reward.value, billTotalMil);
  if (reward.kind === 'percent') return Math.min(billTotalMil, Math.round((billTotalMil * reward.value) / 10_000));
  const prices = unitPricesOnBill.filter((p) => p.articleId === reward.articleId).map((p) => p.unitMil);
  return prices.length ? Math.min(Math.min(...prices), billTotalMil) : 0;
};
