import type { Millimes } from './money';

// The one pricing engine of the point of sale. The cash register, the QR menu cart, the table bill
// and the printed ticket all call computeCart() — on the server for anything recorded, in the
// browser only for display — so a total can never differ between two screens.
//
// Pure functions, integer millimes, no I/O.

// --- Catalogue snapshot ---------------------------------------------------------------------

export type Availability = 'available' | 'unavailable' | 'hidden';
export type PrepDestination = 'kitchen' | 'bar' | 'none';

export interface PricedVariant {
  id: string;
  label: string;
  deltaMil: Millimes;
}

export interface PricedExtra {
  id: string;
  name: string;
  priceMil: Millimes;
}

export interface PricedArticle {
  id: string;
  name: string;
  category: string;
  subCategory?: string;
  description?: string;
  imageUrl?: string;
  unitPriceMil: Millimes; // TTC — what the customer pays for one unit, before options
  vatRate: number; // 0..1
  availability: Availability;
  prepDestination: PrepDestination;
  variantLabel?: string; // e.g. "Taille" — set when the article has variants
  variants: PricedVariant[]; // when non-empty, choosing exactly one is mandatory
  extraIds: string[]; // extras allowed on this article
}

export interface PricingCatalog {
  articles: Map<string, PricedArticle>;
  extras: Map<string, PricedExtra>;
  // Pairs of extras that cannot be chosen together on the same item (e.g. two kinds of milk).
  incompatibleExtras: [string, string][];
}

// --- Discounts --------------------------------------------------------------------------------

export type DiscountKind = 'percent' | 'fixed';

export interface DiscountRule {
  id: string;
  name: string;
  kind: DiscountKind;
  // percent: basis points (2000 = 20 %) — fixed: millimes (per unit for item offers, per ticket otherwise)
  value: number;
  scope: 'items' | 'ticket';
  articleIds: string[]; // empty + empty categories = every article
  categories: string[];
  startsOn?: string; // YYYY-MM-DD, inclusive
  endsOn?: string;
  weekdays: number[]; // 1 = Monday … 7 = Sunday; empty = every day
  startTime?: string; // HH:MM, Tunis time
  endTime?: string;
  minTicketMil: Millimes; // ticket offers only
  identifiedCustomersOnly: boolean;
  customerIds?: string[]; // targeted offers (fidélité): only these customers
  stackable: boolean;
  active: boolean;
}

export type DiscountSource = 'offer' | 'manual' | 'loyalty';

export interface AppliedDiscount {
  source: DiscountSource;
  discountId?: string;
  label: string;
  amountMil: Millimes;
}

// --- Cart ---------------------------------------------------------------------------------------

export interface CartLineInput {
  articleId: string;
  quantity: number;
  variantId?: string;
  extraIds?: string[];
  instruction?: string;
}

export interface CartContext {
  now: Date;
  customerId?: string | null;
  manualDiscount?: { kind: DiscountKind; value: number; reason?: string } | null;
  // Additional ticket-level discounts decided elsewhere (e.g. a loyalty reward), applied last.
  extraTicketDiscounts?: AppliedDiscount[];
}

export interface PricedLine {
  articleId: string;
  name: string; // snapshot, e.g. "Cappuccino"
  displayName: string; // e.g. "Cappuccino (Grand, Chantilly)"
  category: string;
  quantity: number;
  variant?: PricedVariant;
  extras: PricedExtra[];
  instruction?: string;
  unitPriceMil: Millimes; // base + variant
  optionsPriceMil: Millimes; // extras, per unit
  grossMil: Millimes; // (unit + options) × quantity
  discounts: AppliedDiscount[]; // item-level offers
  ticketDiscountMil: Millimes; // this line's share of ticket-level discounts
  totalMil: Millimes; // what this line finally costs
  vatRate: number;
  prepDestination: PrepDestination;
}

export interface PricedCart {
  lines: PricedLine[];
  ticketDiscounts: AppliedDiscount[];
  grossMil: Millimes;
  discountMil: Millimes; // every discount, item + ticket
  totalMil: Millimes;
  vat: { rate: number; baseMil: Millimes; vatMil: Millimes }[];
}

export class PricingError extends Error {
  constructor(message: string, readonly articleId?: string) {
    super(message);
  }
}

// --- Rules ----------------------------------------------------------------------------------

const TUNIS_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Tunis',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});
const WEEKDAY_NUMBER: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export const tunisClock = (now: Date): { date: string; time: string; weekday: number } => {
  const parts = Object.fromEntries(TUNIS_PARTS.formatToParts(now).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, weekday: WEEKDAY_NUMBER[parts.weekday] ?? 1 };
};

export const isDiscountActiveAt = (rule: DiscountRule, now: Date, customerId?: string | null): boolean => {
  if (!rule.active) return false;
  const clock = tunisClock(now);
  if (rule.startsOn && clock.date < rule.startsOn) return false;
  if (rule.endsOn && clock.date > rule.endsOn) return false;
  if (rule.weekdays.length > 0 && !rule.weekdays.includes(clock.weekday)) return false;
  if (rule.startTime && clock.time < rule.startTime) return false;
  if (rule.endTime && clock.time >= rule.endTime) return false;
  if ((rule.identifiedCustomersOnly || rule.customerIds) && !customerId) return false;
  if (rule.customerIds && customerId && !rule.customerIds.includes(customerId)) return false;
  return true;
};

const ruleTargets = (rule: DiscountRule, article: { id: string; category: string }): boolean =>
  (rule.articleIds.length === 0 && rule.categories.length === 0) ||
  rule.articleIds.includes(article.id) ||
  rule.categories.includes(article.category);

const percentOf = (amount: Millimes, basisPoints: number): Millimes => Math.round((amount * basisPoints) / 10_000);

// Combination rule (RG-07-07/RG-07-10): every stackable offer applies; a non-stackable offer
// applies alone, and only when it is worth more than all stackable offers together. Never more
// than the amount itself.
const combine = (candidates: AppliedDiscount[], stackable: boolean[], cap: Millimes): AppliedDiscount[] => {
  if (candidates.length === 0 || cap <= 0) return [];
  const stack = candidates.filter((_, i) => stackable[i]);
  const stackTotal = stack.reduce((s, d) => s + d.amountMil, 0);
  const bestSolo = candidates.filter((_, i) => !stackable[i]).sort((a, b) => b.amountMil - a.amountMil)[0];
  const chosen = bestSolo && bestSolo.amountMil > stackTotal ? [bestSolo] : stack;
  let remaining = cap;
  return chosen
    .map((d) => {
      const amount = Math.min(d.amountMil, remaining);
      remaining -= amount;
      return { ...d, amountMil: amount };
    })
    .filter((d) => d.amountMil > 0);
};

// Spreads `amount` over `weights` proportionally, in whole millimes (largest remainder), so the
// shares always add up exactly to `amount`.
export const allocateProportionally = (amount: Millimes, weights: Millimes[]): Millimes[] => {
  const total = weights.reduce((s, w) => s + w, 0);
  if (amount <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (amount * w) / total);
  const shares = raw.map(Math.floor);
  let rest = amount - shares.reduce((s, v) => s + v, 0);
  raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
    .forEach(({ i }) => {
      if (rest > 0 && shares[i] < weights[i]) {
        shares[i] += 1;
        rest -= 1;
      }
    });
  return shares;
};

export const MAX_LINE_QUANTITY = 99;

// Validates one line against the catalogue (availability, mandatory variant, allowed and compatible
// extras) and prices it before discounts.
export const priceLine = (input: CartLineInput, catalog: PricingCatalog): Omit<PricedLine, 'discounts' | 'ticketDiscountMil' | 'totalMil'> => {
  const article = catalog.articles.get(input.articleId);
  if (!article || article.availability === 'hidden') throw new PricingError('Produit introuvable.', input.articleId);
  if (article.availability === 'unavailable') throw new PricingError(`« ${article.name} » n'est plus disponible.`, article.id);
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > MAX_LINE_QUANTITY) {
    throw new PricingError(`Quantité invalide pour « ${article.name} ».`, article.id);
  }

  let variant: PricedVariant | undefined;
  if (article.variants.length > 0) {
    variant = article.variants.find((v) => v.id === input.variantId);
    if (!variant) throw new PricingError(`Choisissez : ${article.variantLabel ?? 'variante'} pour « ${article.name} ».`, article.id);
  } else if (input.variantId) {
    throw new PricingError(`« ${article.name} » n'a pas de variante.`, article.id);
  }

  const extraIds = [...new Set(input.extraIds ?? [])];
  const extras = extraIds.map((id) => {
    const extra = catalog.extras.get(id);
    if (!extra || !article.extraIds.includes(id)) throw new PricingError(`Supplément non proposé pour « ${article.name} ».`, article.id);
    return extra;
  });
  for (const [a, b] of catalog.incompatibleExtras) {
    if (extraIds.includes(a) && extraIds.includes(b)) {
      const names = [a, b].map((id) => catalog.extras.get(id)?.name ?? id);
      throw new PricingError(`« ${names[0]} » et « ${names[1]} » ne peuvent pas être choisis ensemble.`, article.id);
    }
  }

  const unitPriceMil = article.unitPriceMil + (variant?.deltaMil ?? 0);
  const optionsPriceMil = extras.reduce((s, e) => s + e.priceMil, 0);
  const suffix = [variant?.label, ...extras.map((e) => e.name)].filter(Boolean).join(', ');
  return {
    articleId: article.id,
    name: article.name,
    displayName: suffix ? `${article.name} (${suffix})` : article.name,
    category: article.category,
    quantity: input.quantity,
    variant,
    extras,
    instruction: input.instruction?.trim() || undefined,
    unitPriceMil,
    optionsPriceMil,
    grossMil: (unitPriceMil + optionsPriceMil) * input.quantity,
    vatRate: article.vatRate,
    prepDestination: article.prepDestination,
  };
};

export const computeCart = (inputs: CartLineInput[], catalog: PricingCatalog, discounts: DiscountRule[], context: CartContext): PricedCart => {
  const active = discounts.filter((d) => isDiscountActiveAt(d, context.now, context.customerId));
  const itemOffers = active.filter((d) => d.scope === 'items');

  // 1. Lines and their item-level offers.
  const lines = inputs.map((input) => {
    const base = priceLine(input, catalog);
    const candidates: AppliedDiscount[] = [];
    const stackable: boolean[] = [];
    itemOffers
      .filter((rule) => ruleTargets(rule, { id: base.articleId, category: base.category }))
      .forEach((rule) => {
        const amount = rule.kind === 'percent' ? percentOf(base.grossMil, rule.value) : rule.value * base.quantity;
        if (amount > 0) {
          candidates.push({ source: 'offer', discountId: rule.id, label: rule.name, amountMil: amount });
          stackable.push(rule.stackable);
        }
      });
    const applied = combine(candidates, stackable, base.grossMil);
    const afterItems = base.grossMil - applied.reduce((s, d) => s + d.amountMil, 0);
    return { ...base, discounts: applied, ticketDiscountMil: 0, totalMil: afterItems };
  });

  return applyTicketDiscounts(lines, discounts, context);
};

// Ticket-level offers, then the manual discount, then externally decided discounts (loyalty), on
// lines whose item-level price is already fixed. Used by computeCart for a new cart, and on its
// own to recompute a table bill from lines frozen at validation — the catalogue is never re-read
// for a validated line.
export const applyTicketDiscounts = (
  pricedLines: PricedLine[],
  ticketRules: DiscountRule[],
  context: CartContext
): PricedCart => {
  const lines = pricedLines.map((l) => ({ ...l, totalMil: l.grossMil - l.discounts.reduce((s, d) => s + d.amountMil, 0), ticketDiscountMil: 0 }));
  const ticketOffers = ticketRules.filter((d) => d.scope === 'ticket' && isDiscountActiveAt(d, context.now, context.customerId));
  const subtotal = lines.reduce((s, l) => s + l.totalMil, 0);
  const ticketCandidates: AppliedDiscount[] = [];
  const ticketStackable: boolean[] = [];
  ticketOffers
    .filter((rule) => subtotal >= rule.minTicketMil)
    .forEach((rule) => {
      const amount = rule.kind === 'percent' ? percentOf(subtotal, rule.value) : rule.value;
      if (amount > 0) {
        ticketCandidates.push({ source: 'offer', discountId: rule.id, label: rule.name, amountMil: amount });
        ticketStackable.push(rule.stackable);
      }
    });
  const ticketDiscounts = combine(ticketCandidates, ticketStackable, subtotal);
  let remaining = subtotal - ticketDiscounts.reduce((s, d) => s + d.amountMil, 0);

  if (context.manualDiscount && context.manualDiscount.value > 0 && remaining > 0) {
    const m = context.manualDiscount;
    const amount = Math.min(remaining, m.kind === 'percent' ? percentOf(remaining, m.value) : m.value);
    if (amount > 0) {
      ticketDiscounts.push({ source: 'manual', label: m.reason?.trim() ? `Remise — ${m.reason.trim()}` : 'Remise manuelle', amountMil: amount });
      remaining -= amount;
    }
  }
  (context.extraTicketDiscounts ?? []).forEach((d) => {
    const amount = Math.min(remaining, d.amountMil);
    if (amount > 0) {
      ticketDiscounts.push({ ...d, amountMil: amount });
      remaining -= amount;
    }
  });

  // Each line carries its share of the ticket discounts (needed for VAT and per-line revenue).
  const ticketTotal = ticketDiscounts.reduce((s, d) => s + d.amountMil, 0);
  const shares = allocateProportionally(ticketTotal, lines.map((l) => l.totalMil));
  lines.forEach((line, i) => {
    line.ticketDiscountMil = shares[i];
    line.totalMil -= shares[i];
  });

  return summarize(lines, ticketDiscounts);
};

// Totals and VAT breakdown of already-priced lines (also used to rebuild a bill from stored lines).
export const summarize = (lines: PricedLine[], ticketDiscounts: AppliedDiscount[]): PricedCart => {
  const grossMil = lines.reduce((s, l) => s + l.grossMil, 0);
  const totalMil = lines.reduce((s, l) => s + l.totalMil, 0);
  const byRate = new Map<number, Millimes>();
  lines.forEach((l) => byRate.set(l.vatRate, (byRate.get(l.vatRate) ?? 0) + l.totalMil));
  const vat = [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, ttc]) => {
      const base = Math.round(ttc / (1 + rate));
      return { rate, baseMil: base, vatMil: ttc - base };
    });
  return { lines, ticketDiscounts, grossMil, discountMil: grossMil - totalMil, totalMil, vat };
};

// --- Payment arithmetic (cash register) -------------------------------------------------------

// Change to give back when `cashTenderedMil` is handed over for a remaining `dueMil`.
export const changeDue = (dueMil: Millimes, cashTenderedMil: Millimes): Millimes => Math.max(0, cashTenderedMil - dueMil);
