import { todayIso } from './dateUtils';
import { SaleItem, SaleTransaction, ServiceType, PaymentMethod, MONTHS_LIST } from './salesTransactions';
import { CatalogArticle, getArticleById, getArticleVatRate, getArticleTtcPrice } from './manualSalesCatalog';
import { SalesCatalogContext } from './salesEntryModel';
import { roundToPayableCash } from './currencyRounding';

// Second way to enter "Ajout manuel des ventes", for businesses that don't work with individual
// tickets/tables: the whole product catalog is listed (grouped by category) with a quantity
// stepper on each product — "how many of this product sold today". A product only becomes a row
// of the form state once its quantity is above 0 (and stops being one when it goes back to 0), so
// `rows` never holds an empty or duplicate line. Each row carries its own reduction (flat amount
// or percentage, on every unit or a chosen count) and "dont à emporter" split, but payment is
// entered once for the whole entry (Espèces / Carte bancaire / Tickets restaurant) rather than
// per product — used both to reconcile against the computed total and to split the generated
// sales across payment methods. Kept as its own model (rather than bolted onto
// DraftTicket) because the two entry styles have almost nothing in common beyond the shared
// date/shift/employee header and the final SaleTransaction output shape.

export type DiscountMode = 'amount' | 'percent';

export interface DraftQuantityRow {
  rowId: string;
  articleId: string;
  qty: number;
  discountMode: DiscountMode; // whether discountValue is a flat DT amount or a percentage of the unit price
  discountValue: number; // DT per unit when discountMode === 'amount' ; 0-100 when discountMode === 'percent'
  discountScope: 'all' | 'partial'; // whether the reduction covers every sold unit or a chosen count
  discountQty: number; // used only when discountScope === 'partial', clamped to [0, qty]
  takeawayQty: number; // subset of qty that was "à emporter" rather than consommé sur place
}

export interface QuantitySalesFormState {
  date: string;
  shift: string;
  employee: string;
  rows: DraftQuantityRow[];
  paidCash: number;
  paidCard: number;
  paidRestoTicket: number;
  // Justification for a gap between "Total encaissé" (paidCash+paidCard+paidRestoTicket) and the
  // computed sales total — required only when that gap exists (see validateQuantitySalesForm).
  // Persisted onto every SaleTransaction this entry produces (SaleTransaction.note) so the reason
  // survives past the entry session.
  paymentNote: string;
}

let idCounter = 0;
const generateRowId = (): string => {
  idCounter += 1;
  return `qrow-${idCounter}`;
};

export const createEmptyQuantityRow = (init: Partial<DraftQuantityRow> = {}): DraftQuantityRow => ({
  rowId: generateRowId(),
  articleId: '',
  qty: 1,
  discountMode: 'amount',
  discountValue: 0,
  discountScope: 'all',
  discountQty: 0,
  takeawayQty: 0,
  ...init,
});

// Sets how many units of one catalog product were sold, keeping the "sparse rows" invariant:
// 0 (or less) removes the product's row, a first positive quantity creates it, and changing an
// existing quantity clamps the counts that depend on it (à emporter, reduced units) so they can
// never exceed what was sold.
export const setQuantityForArticle = (rows: DraftQuantityRow[], articleId: string, qty: number): DraftQuantityRow[] => {
  const next = Math.max(0, Math.round(Number.isFinite(qty) ? qty : 0));
  const existing = rows.find((r) => r.articleId === articleId);
  if (next === 0) return existing ? rows.filter((r) => r.articleId !== articleId) : rows;
  if (!existing) return [...rows, createEmptyQuantityRow({ articleId, qty: next })];
  return rows.map((r) =>
    r.articleId === articleId
      ? { ...r, qty: next, takeawayQty: Math.min(r.takeawayQty, next), discountQty: Math.min(r.discountQty, next) }
      : r
  );
};

export const createEmptyQuantityForm = (): QuantitySalesFormState => ({
  date: todayIso(),
  shift: '',
  employee: '',
  rows: [],
  paidCash: 0,
  paidCard: 0,
  paidRestoTicket: 0,
  paymentNote: '',
});

export const clampInt = (value: number, min: number, max: number): number => {
  const n = Math.round(Number.isFinite(value) ? value : 0);
  return Math.min(Math.max(n, min), max);
};

// --- Per-row pricing ---

export const effectiveDiscountQty = (row: DraftQuantityRow): number =>
  row.discountScope === 'all' ? row.qty : Math.min(row.discountQty, row.qty);

// Resolves discountValue (a flat DT amount or a 0-100 percentage, depending on discountMode) to an
// actual DT-per-unit figure — a percentage only makes sense against the product's own unit price.
export const computeDiscountPerUnit = (row: DraftQuantityRow, article: CatalogArticle | undefined): number => {
  if (row.discountMode === 'percent') {
    const unitPrice = article ? getArticleTtcPrice(article) : 0;
    return (unitPrice * Math.max(0, Math.min(100, row.discountValue))) / 100;
  }
  return Math.max(0, row.discountValue);
};

export const computeRowDiscountTotal = (row: DraftQuantityRow, article: CatalogArticle | undefined): number => {
  const perUnit = computeDiscountPerUnit(row, article);
  return perUnit > 0 ? perUnit * effectiveDiscountQty(row) : 0;
};

export const computeRowGrossTotal = (row: DraftQuantityRow, article: CatalogArticle | undefined): number =>
  article ? row.qty * getArticleTtcPrice(article) : 0;

export const computeRowNetTotal = (row: DraftQuantityRow, article: CatalogArticle | undefined): number =>
  Math.max(0, computeRowGrossTotal(row, article) - computeRowDiscountTotal(row, article));

// A single blended unit price for the day's sales of this product (after its reduction) — used
// both for display and to price the SaleTransaction items built from this row.
export const computeRowUnitPriceAfterDiscount = (row: DraftQuantityRow, article: CatalogArticle | undefined): number =>
  row.qty > 0 ? computeRowNetTotal(row, article) / row.qty : (article ? getArticleTtcPrice(article) : 0);

// --- Form-wide totals (recomputed live as the user types) ---

export interface QuantitySalesTotals {
  activeProductsCount: number;
  totalQty: number;
  totalTakeawayQty: number;
  totalOnSiteQty: number;
  totalGross: number;
  totalDiscount: number;
  totalNet: number;
  paidTotal: number;
  remaining: number; // totalNet - paidTotal ; 0 once the payment breakdown matches the computed total
}

export const computeQuantitySalesTotals = (
  form: QuantitySalesFormState,
  catalog: Pick<SalesCatalogContext, 'articles'>
): QuantitySalesTotals => {
  let activeProductsCount = 0;
  let totalQty = 0;
  let totalTakeawayQty = 0;
  let totalGross = 0;
  let totalDiscount = 0;
  let totalNet = 0;

  form.rows.forEach((row) => {
    if (!row.articleId || row.qty <= 0) return;
    const article = getArticleById(row.articleId, catalog.articles);
    if (!article) return;
    const takeaway = Math.min(row.takeawayQty, row.qty);

    activeProductsCount += 1;
    totalQty += row.qty;
    totalTakeawayQty += takeaway;
    totalGross += computeRowGrossTotal(row, article);
    totalDiscount += computeRowDiscountTotal(row, article);
    totalNet += computeRowNetTotal(row, article);
  });

  const paidTotal = form.paidCash + form.paidCard + form.paidRestoTicket;
  return {
    activeProductsCount,
    totalQty,
    totalTakeawayQty,
    totalOnSiteQty: totalQty - totalTakeawayQty,
    totalGross,
    totalDiscount,
    totalNet,
    paidTotal,
    remaining: totalNet - paidTotal,
  };
};

// --- Validation ---

export interface QuantityValidationIssue {
  fieldKey: string;
  message: string;
}

const PAYMENT_EPSILON = 0.01;

export const validateQuantitySalesForm = (
  form: QuantitySalesFormState,
  articles: CatalogArticle[]
): QuantityValidationIssue[] => {
  const issues: QuantityValidationIssue[] = [];
  if (!form.date) issues.push({ fieldKey: 'qgeneral:date', message: 'La date est obligatoire.' });
  if (!form.shift) issues.push({ fieldKey: 'qgeneral:shift', message: 'Le shift est obligatoire.' });
  if (!form.employee) issues.push({ fieldKey: 'qgeneral:employee', message: "L'employé est obligatoire." });

  const filledRows = form.rows.filter((r) => r.articleId);
  if (filledRows.length === 0) {
    issues.push({ fieldKey: 'qgeneral:rows', message: 'Ajoutez au moins un produit vendu.' });
  }

  const seen = new Set<string>();
  form.rows.forEach((row, idx) => {
    const label = `Produit ${idx + 1}`;
    if (!row.articleId) {
      issues.push({ fieldKey: `qrow:${row.rowId}:article`, message: `${label} : veuillez choisir un produit.` });
      return;
    }
    if (seen.has(row.articleId)) {
      issues.push({ fieldKey: `qrow:${row.rowId}:duplicate`, message: `${label} : ce produit est déjà présent dans une autre ligne.` });
    }
    seen.add(row.articleId);
    if (row.qty < 1) {
      issues.push({ fieldKey: `qrow:${row.rowId}:qty`, message: `${label} : la quantité doit être d'au moins 1.` });
    }
    if (row.takeawayQty > row.qty) {
      issues.push({ fieldKey: `qrow:${row.rowId}:takeaway`, message: `${label} : la quantité « à emporter » ne peut pas dépasser la quantité vendue.` });
    }
    if (row.discountScope === 'partial' && row.discountQty > row.qty) {
      issues.push({ fieldKey: `qrow:${row.rowId}:discount`, message: `${label} : le nombre d'unités concernées par la réduction ne peut pas dépasser la quantité vendue.` });
    }
    if (row.discountMode === 'percent' && (row.discountValue < 0 || row.discountValue > 100)) {
      issues.push({ fieldKey: `qrow:${row.rowId}:discount`, message: `${label} : le pourcentage de réduction doit être compris entre 0 et 100.` });
    }
  });

  const totals = computeQuantitySalesTotals(form, { articles });
  if (filledRows.length > 0 && Math.abs(totals.remaining) > PAYMENT_EPSILON && !form.paymentNote.trim()) {
    issues.push({
      fieldKey: 'qgeneral:payment',
      message: `Écart entre le total encaissé (${totals.paidTotal.toFixed(2)} DT) et le total des ventes (${totals.totalNet.toFixed(2)} DT) : veuillez saisir une justification ci-dessous.`,
    });
  }

  return issues;
};

// --- Building SaleTransactions ---
//
// Two independent splits of the same row quantity — service (sur place/à emporter, per row) and
// payment method (Espèces/Carte/Ticket resto, entered once for the whole entry) — with no record
// of which specific units overlap. To turn that into SaleTransaction records (which each need one
// fixed serviceType and paymentMethod), each row's quantity is apportioned across the 2x3 grid of
// combinations in proportion to both splits, using the largest-remainder method so the six cells
// always sum back to the row's exact quantity sold.
const SERVICE_TYPES: ServiceType[] = ['Sur place', 'À emporter'];
const PAYMENT_METHODS: PaymentMethod[] = ['Espèces', 'Carte bancaire', 'Ticket resto'];

const apportionGrid = (rowTotals: [number, number], colTotals: [number, number, number]): number[][] => {
  const total = rowTotals[0] + rowTotals[1];
  if (total <= 0) return [[0, 0, 0], [0, 0, 0]];
  const raw = rowTotals.map((r) => colTotals.map((c) => (r * c) / total));
  const floors = raw.map((row) => row.map((v) => Math.floor(v)));
  const allocated = floors.reduce((s, row) => s + row.reduce((a, b) => a + b, 0), 0);
  const remaining = total - allocated;
  const cells: { i: number; j: number; frac: number }[] = [];
  raw.forEach((row, i) => row.forEach((v, j) => cells.push({ i, j, frac: v - Math.floor(v) })));
  cells.sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remaining && k < cells.length; k += 1) {
    floors[cells[k].i][cells[k].j] += 1;
  }
  return floors;
};

export const buildSaleTransactionsFromQuantityForm = (
  form: QuantitySalesFormState,
  catalog: Pick<SalesCatalogContext, 'articles'>
): SaleTransaction[] => {
  const amounts = [form.paidCash, form.paidCard, form.paidRestoTicket];
  const amountsSum = amounts.reduce((a, b) => a + b, 0);
  // The whole-entry payment breakdown applies uniformly to every row — the same three weights are
  // used to split each row's quantity across payment methods, combined with that row's own
  // service-type (sur place / à emporter) split. Normalized against their own sum (not the sales
  // total) so the split always adds up correctly even when the two are justified as not matching
  // (see validateQuantitySalesForm's paymentNote allowance).
  const paymentWeights = amountsSum > 0 ? amounts.map((a) => a / amountsSum) : [1, 0, 0];
  const note = form.paymentNote.trim() || undefined;

  const buckets: SaleItem[][][] = SERVICE_TYPES.map(() => PAYMENT_METHODS.map(() => [] as SaleItem[]));

  form.rows.forEach((row) => {
    if (!row.articleId || row.qty <= 0) return;
    const article = getArticleById(row.articleId, catalog.articles);
    if (!article) return;

    const unitPrice = computeRowUnitPriceAfterDiscount(row, article);
    const vatRate = getArticleVatRate(article);
    const takeaway = Math.min(row.takeawayQty, row.qty);
    const onSite = row.qty - takeaway;
    const paymentColTotals: [number, number, number] = [
      row.qty * paymentWeights[0],
      row.qty * paymentWeights[1],
      row.qty * paymentWeights[2],
    ];

    const grid = apportionGrid([onSite, takeaway], paymentColTotals);
    const name = computeRowDiscountTotal(row, article) > 0 ? `${article.name} (remise)` : article.name;

    SERVICE_TYPES.forEach((_service, sIdx) => {
      PAYMENT_METHODS.forEach((_payment, pIdx) => {
        const qty = grid[sIdx][pIdx];
        if (qty <= 0) return;
        const lineTtc = unitPrice * qty;
        const lineNet = lineTtc / (1 + vatRate);
        buckets[sIdx][pIdx].push({
          name,
          qty,
          price: unitPrice,
          category: article.category,
          vatRate,
          netAmount: lineNet,
          taxAmount: lineTtc - lineNet,
        });
      });
    });
  });

  const dateObj = new Date(`${form.date}T00:00:00`);
  const monthLabel = MONTHS_LIST[dateObj.getMonth()]?.label ?? 'Sep';
  const now = new Date();
  const timeLabel = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const datePrefix = form.date.replace(/-/g, '');
  const baseId = Date.now();

  const transactions: SaleTransaction[] = [];
  let seq = 0;
  SERVICE_TYPES.forEach((serviceType, sIdx) => {
    PAYMENT_METHODS.forEach((paymentMethod, pIdx) => {
      const items = buckets[sIdx][pIdx];
      if (items.length === 0) return;
      seq += 1;
      const itemsCount = items.reduce((sum, it) => sum + it.qty, 0);
      const preciseAmount = items.reduce((sum, it) => sum + it.qty * it.price, 0);
      const totalAmount = paymentMethod === 'Espèces' ? roundToPayableCash(preciseAmount) : preciseAmount;
      transactions.push({
        id: baseId + seq,
        saleNumber: `QTE-${datePrefix}-${seq.toString().padStart(3, '0')}`,
        serviceType,
        tableOrArea: serviceType === 'À emporter' ? 'À emporter' : 'Vente du jour',
        items,
        itemsCount,
        itemsSummary: items.map((it) => `${it.qty}x ${it.name}`).join(', '),
        paymentMethod,
        barista: form.employee,
        totalAmount,
        preciseAmount,
        date: form.date,
        time: timeLabel,
        month: monthLabel,
        year: dateObj.getFullYear(),
        status: 'Payé',
        note,
      });
    });
  });
  return transactions;
};
