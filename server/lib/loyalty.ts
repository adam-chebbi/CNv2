import { randomUUID } from 'node:crypto';
import { db } from '../db/connection.js';
import { fromJson } from '../db/json.js';
import { ApiError, notFound } from '../middleware/errors.js';
import {
  DEFAULT_LOYALTY_SETTINGS,
  eligibleAmount,
  pointsFor,
  pointsToReverse,
  rewardAmount,
  type LoyaltySettings,
  type Reward,
} from '../../src/data/loyalty.js';
import { applyTicketDiscounts, type AppliedDiscount } from '../../src/data/pricing.js';
import { getPosSetting, loadActiveDiscountRules, setPosSetting } from './posCatalog.js';
import {
  activeLinesOfSale,
  getSaleRow,
  onSaleCompleted,
  registerExtraDiscountProvider,
  storedLineToPriced,
  type Actor,
  type SaleRow,
} from './posService.js';
import { recordActivity } from './activity.js';

// Loyalty ledger and its integration with the register:
//   - points are earned once, when a sale with an identified customer is fully settled;
//   - a reward applied to an open bill is a ticket-level discount, redeemed (points deducted) when
//     the sale is settled;
//   - a credit note takes back points in proportion;
//   - manual adjustments need loyalty:adjust and a reason.

export const readLoyaltySettings = (): LoyaltySettings => {
  const raw = getPosSetting('loyalty_settings', '');
  return raw ? { ...DEFAULT_LOYALTY_SETTINGS, ...fromJson<Partial<LoyaltySettings>>(raw, {}) } : DEFAULT_LOYALTY_SETTINGS;
};

export const saveLoyaltySettings = (settings: LoyaltySettings, by: string): void => {
  setPosSetting('loyalty_settings', JSON.stringify(settings), by);
};

interface RewardRow {
  id: string;
  name: string;
  points_cost: number;
  kind: Reward['kind'];
  value: number;
  article_id: string | null;
  active: number;
}

export const rowToReward = (r: RewardRow): Reward => ({
  id: r.id,
  name: r.name,
  pointsCost: r.points_cost,
  kind: r.kind,
  value: r.value,
  articleId: r.article_id,
  active: r.active === 1,
});

export const getReward = (id: string): Reward => {
  const row = db.prepare('SELECT * FROM loyalty_rewards WHERE id = ?').get(id) as RewardRow | undefined;
  if (!row) throw notFound('Récompense');
  return rowToReward(row);
};

export const listRewards = (activeOnly: boolean): Reward[] =>
  (db.prepare(`SELECT * FROM loyalty_rewards ${activeOnly ? 'WHERE active = 1' : ''} ORDER BY points_cost`).all() as RewardRow[]).map(rowToReward);

// Expired points are written off lazily (no scheduler needed): before any balance is read.
export const expirePoints = (customerId?: string): void => {
  const now = new Date().toISOString();
  const due = db
    .prepare(`SELECT * FROM loyalty_ledger WHERE type = 'earn' AND expired = 0 AND expires_at IS NOT NULL AND expires_at < ? ${customerId ? 'AND customer_id = ?' : ''}`)
    .all(...(customerId ? [now, customerId] : [now])) as { id: string; customer_id: string; points: number }[];
  due.forEach((entry) => {
    const balance = rawBalance(entry.customer_id);
    const amount = Math.max(0, Math.min(entry.points, balance));
    if (amount > 0) {
      db.prepare(
        `INSERT INTO loyalty_ledger (id, customer_id, type, points, reason, created_by, created_at) VALUES (?, ?, 'expire', ?, 'Points expirés', 'Système', ?)`
      ).run(randomUUID(), entry.customer_id, -amount, now);
    }
    db.prepare('UPDATE loyalty_ledger SET expired = 1 WHERE id = ?').run(entry.id);
  });
};

const rawBalance = (customerId: string): number =>
  (db.prepare('SELECT COALESCE(SUM(points), 0) AS b FROM loyalty_ledger WHERE customer_id = ?').get(customerId) as { b: number }).b;

// Points reserved by rewards applied to bills not settled yet.
const reservedPoints = (customerId: string, exceptSaleId?: string): number =>
  (db
    .prepare(`SELECT COALESCE(SUM(sr.points_cost), 0) AS r FROM sale_rewards sr JOIN pos_sales s ON s.id = sr.sale_id WHERE sr.customer_id = ? AND s.status = 'open' AND sr.sale_id != ?`)
    .get(customerId, exceptSaleId ?? '') as { r: number }).r;

export const balanceOf = (customerId: string): { balance: number; reserved: number; available: number } => {
  expirePoints(customerId);
  const balance = rawBalance(customerId);
  const reserved = reservedPoints(customerId);
  return { balance, reserved, available: balance - reserved };
};

export const ledgerOf = (customerId: string) =>
  (db.prepare('SELECT * FROM loyalty_ledger WHERE customer_id = ? ORDER BY created_at DESC LIMIT 200').all(customerId) as {
    id: string;
    type: string;
    points: number;
    sale_id: string | null;
    reason: string | null;
    expires_at: string | null;
    created_by: string;
    created_at: string;
  }[]).map((e) => ({
    id: e.id,
    type: e.type,
    points: e.points,
    saleId: e.sale_id,
    ticketNumber: e.sale_id ? ((db.prepare('SELECT ticket_number FROM pos_sales WHERE id = ?').get(e.sale_id) as { ticket_number: string | null } | undefined)?.ticket_number ?? null) : null,
    reason: e.reason,
    expiresAt: e.expires_at,
    createdBy: e.created_by,
    createdAt: e.created_at,
  }));

const unitPricesOnBill = (saleId: string) =>
  activeLinesOfSale(saleId).map((l) => ({ articleId: l.article_id, unitMil: l.unit_price_mil + l.options_price_mil }));

// Rewards on a bill become ticket-level discounts (source 'loyalty'), applied after offers.
registerExtraDiscountProvider((sale: SaleRow): AppliedDiscount[] => {
  const applied = db.prepare('SELECT reward_id FROM sale_rewards WHERE sale_id = ?').all(sale.id) as { reward_id: string }[];
  if (applied.length === 0) return [];
  const lines = activeLinesOfSale(sale.id).map(storedLineToPriced);
  const beforeRewards = applyTicketDiscounts(lines, loadActiveDiscountRules(), {
    now: new Date(),
    customerId: sale.customer_id,
    manualDiscount: sale.manual_discount_json ? JSON.parse(sale.manual_discount_json) : null,
  }).totalMil;
  const prices = unitPricesOnBill(sale.id);
  return applied.map(({ reward_id }) => {
    const reward = getReward(reward_id);
    return { source: 'loyalty' as const, discountId: reward.id, label: `Fidélité — ${reward.name}`, amountMil: rewardAmount(reward, beforeRewards, prices) };
  });
});

export const applyRewardToSale = (saleId: string, rewardId: string, by: Actor): void => {
  const sale = getSaleRow(saleId);
  if (sale.status !== 'open') throw new ApiError(409, 'Cette vente est déjà réglée.');
  if (!sale.customer_id) throw new ApiError(409, "Identifiez d'abord le client.");
  if (sale.paid_mil > 0) throw new ApiError(409, 'Appliquez la récompense avant le premier règlement.');
  const reward = getReward(rewardId);
  if (!reward.active) throw new ApiError(409, "Cette récompense n'est plus proposée.");
  if (db.prepare('SELECT 1 FROM sale_rewards WHERE sale_id = ? AND reward_id = ?').get(saleId, rewardId)) throw new ApiError(409, 'Récompense déjà appliquée.');
  if (reward.kind === 'product' && !unitPricesOnBill(saleId).some((p) => p.articleId === reward.articleId)) {
    throw new ApiError(409, "Le produit offert par cette récompense n'est pas sur l'addition.");
  }
  expirePoints(sale.customer_id);
  const available = rawBalance(sale.customer_id) - reservedPoints(sale.customer_id, saleId) -
    (db.prepare('SELECT COALESCE(SUM(points_cost), 0) AS p FROM sale_rewards WHERE sale_id = ?').get(saleId) as { p: number }).p;
  if (available < reward.pointsCost) throw new ApiError(409, `Points insuffisants (${available} disponibles, ${reward.pointsCost} nécessaires).`);
  db.prepare('INSERT INTO sale_rewards (sale_id, reward_id, customer_id, points_cost, applied_by, applied_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    saleId,
    rewardId,
    sale.customer_id,
    reward.pointsCost,
    by.name,
    new Date().toISOString()
  );
};

// On settlement: rewards are redeemed, then points are earned on what was paid (§12.2).
onSaleCompleted((sale, by) => {
  if (!sale.customer_id) return;
  const now = new Date().toISOString();
  const rewards = db.prepare('SELECT * FROM sale_rewards WHERE sale_id = ?').all(sale.id) as { reward_id: string; points_cost: number }[];
  rewards.forEach((r) => {
    db.prepare(`INSERT INTO loyalty_ledger (id, customer_id, type, points, sale_id, reward_id, reason, created_by, created_at) VALUES (?, ?, 'redeem', ?, ?, ?, ?, ?, ?)`).run(
      randomUUID(),
      sale.customer_id,
      -r.points_cost,
      sale.id,
      r.reward_id,
      getReward(r.reward_id).name,
      by.name,
      now
    );
  });

  const settings = readLoyaltySettings();
  if (!settings.enabled) return;
  // Split bill: each payer earns on their own part (credited when the part is paid).
  if (db.prepare('SELECT 1 FROM sale_splits WHERE sale_id = ? LIMIT 1').get(sale.id)) return;
  const points = pointsFor(Math.min(eligibleOfSale(sale), sale.total_mil), settings);
  if (points <= 0) return;
  creditEarn(sale.customer_id, points, sale.id, null, `Ticket ${sale.ticket_number}`, by.name);
});

/** Amount of a sale that earns points (excluded categories/products removed, after discounts). */
export const eligibleOfSale = (sale: SaleRow): number => {
  const settings = readLoyaltySettings();
  const lines = activeLinesOfSale(sale.id);
  const cart = applyTicketDiscounts(lines.map(storedLineToPriced), loadActiveDiscountRules(), {
    now: new Date(),
    customerId: sale.customer_id,
    manualDiscount: sale.manual_discount_json ? JSON.parse(sale.manual_discount_json) : null,
    extraTicketDiscounts: fromJson<AppliedDiscount[]>(sale.ticket_discounts_json, []).filter((d) => d.source === 'loyalty'),
  });
  const eligible = eligibleAmount(
    lines.map((l, i) => ({ articleId: l.article_id, category: l.category, paidMil: cart.lines[i]?.totalMil ?? 0 })),
    settings
  );
  return eligible;
};

export const creditEarn = (customerId: string, points: number, saleId: string, splitId: string | null, reason: string, by: string): void => {
  const settings = readLoyaltySettings();
  const expiresAt = settings.validityDays > 0 ? new Date(Date.now() + settings.validityDays * 86_400_000).toISOString() : null;
  // The unique index (one 'earn' per sale, or per part) makes a second credit impossible, whatever the path.
  db.prepare(`INSERT OR IGNORE INTO loyalty_ledger (id, customer_id, type, points, sale_id, split_id, reason, expires_at, created_by, created_at) VALUES (?, ?, 'earn', ?, ?, ?, ?, ?, ?, ?)`).run(
    randomUUID(),
    customerId,
    points,
    saleId,
    splitId,
    reason,
    expiresAt,
    by,
    new Date().toISOString()
  );
};

// A credit note takes back points in proportion to what was refunded (§12.3).
export const reversePointsForAdjustment = (saleId: string, adjustedMil: number, by: Actor): void => {
  const sale = getSaleRow(saleId);
  if (!sale.customer_id) return;
  const earned = (db.prepare("SELECT COALESCE(SUM(points), 0) AS p FROM loyalty_ledger WHERE sale_id = ? AND type = 'earn'").get(saleId) as { p: number }).p;
  const alreadyReversed = -(db.prepare("SELECT COALESCE(SUM(points), 0) AS p FROM loyalty_ledger WHERE sale_id = ? AND type = 'reverse'").get(saleId) as { p: number }).p;
  const points = Math.min(earned - alreadyReversed, pointsToReverse(earned, sale.total_mil, adjustedMil));
  if (points <= 0) return;
  db.prepare(`INSERT INTO loyalty_ledger (id, customer_id, type, points, sale_id, reason, created_by, created_at) VALUES (?, ?, 'reverse', ?, ?, ?, ?, ?)`).run(
    randomUUID(),
    sale.customer_id,
    -points,
    saleId,
    `Avoir sur le ticket ${sale.ticket_number}`,
    by.name,
    new Date().toISOString()
  );
};

export const adjustPoints = (customerId: string, points: number, reason: string, by: Actor): void => {
  if (points === 0) throw new ApiError(400, 'Indiquez un nombre de points.');
  if (points < 0 && balanceOf(customerId).balance + points < 0) throw new ApiError(409, 'Le solde ne peut pas devenir négatif.');
  db.prepare(`INSERT INTO loyalty_ledger (id, customer_id, type, points, reason, created_by, created_at) VALUES (?, ?, 'adjust', ?, ?, ?, ?)`).run(
    randomUUID(),
    customerId,
    points,
    reason,
    by.name,
    new Date().toISOString()
  );
  recordActivity('Fidélité', 'Ajustement', `${points > 0 ? '+' : ''}${points} point(s) — ${reason}`, by.name, {
    userId: by.id ?? undefined,
    entityType: 'customer',
    entityId: customerId,
    after: { points, reason },
  });
};
