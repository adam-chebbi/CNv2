// Real-data replacement for the former src/data/mockData.ts — every function here computes its
// result from the app's live state (sales, purchases, expenses, stock, HR), the same way
// reportsModel.ts computes the 7 report pages' numbers. reportsModel's own aggregation functions
// are month-grain (ReportPeriod = {year, monthIndex}) and can't express Today/Yesterday/Week/
// Custom-range, so the range-based aggregations below are written directly against a plain
// {start, end} ISO range instead of reusing reportsModel's period type.

import { todayIso, addDaysIso, diffDaysIso, firstOfMonthIso, mondayOfWeekIso, weekdayMondayFirst, dayOfMonth, monthIndexOf, yearOf } from './dateUtils';
import { TimeFilterPeriod, MetricCardData, TopProduct, LowStockProduct, CoffeeAlert } from '../types';
import { SaleTransaction } from './salesTransactions';
import { StockProduct, StockLot, StockLedgerEntry, getTotalQty } from './stockModel';
import { computeStockValue, computeLowStockProducts, computeVatBreakdown } from './reportsModel';
import { CatalogArticle, DEFAULT_VAT_RATE } from './manualSalesCatalog';
import { SubRecipe, computeRecipeCost, computeMargin, computeArticleMargin } from './productsModel';
import { Supplier, PurchaseOrder, SupplierInvoice, computeOrderTotal, isCountedPurchase } from './purchasesModel';
import { Expense, excludeOverlappingExpenses } from './expensesModel';
import { FinancialRecord } from './hrModel';
import { OperationalAlert, AlertsContext, computeOperationalAlerts } from './alertsModel';
import { normalizeKey } from './textUtils';

export interface DateRange {
  start: string; // ISO yyyy-mm-dd, inclusive
  end: string; // ISO yyyy-mm-dd, inclusive
}

const inRange = (dateIso: string, range: DateRange): boolean => dateIso >= range.start && dateIso <= range.end;
// Calendar-day arithmetic lives in dateUtils (business-clock "today", no UTC round-trip).
const addDays = addDaysIso;
const daysBetween = (start: string, end: string): number => diffDaysIso(start, end) + 1;
const startOfMonth = (iso: string): string => `${iso.slice(0, 7)}-01`;

// --- Range resolution (mirrors AnalysisFilterBar's Today/Yesterday/Week/Month/Custom choices) ---

export const resolveDashboardRange = (period: TimeFilterPeriod, customRange?: { start: string; end: string }): DateRange => {
  const today = todayIso();
  switch (period) {
    case 'yesterday': {
      const y = addDays(today, -1);
      return { start: y, end: y };
    }
    case 'week':
      return { start: addDays(today, -6), end: today };
    case 'month':
      return { start: startOfMonth(today), end: today };
    case 'custom':
      return customRange ?? { start: today, end: today };
    case 'today':
    default:
      return { start: today, end: today };
  }
};

// The equivalent-length period immediately preceding `range`, used for "vs période précédente".
export const getPreviousRange = (range: DateRange): DateRange => {
  const length = daysBetween(range.start, range.end);
  return { start: addDays(range.start, -length), end: addDays(range.start, -1) };
};

export const formatDT = (value: number): string => `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DT`;
// A previous-period baseline of 0 makes any percentage meaningless (going from 0 to anything is
// mathematically "+100%" but reads as a real, comparable growth figure it isn't — especially
// misleading in a café's first days, or for a just-launched product). "Nouveau" mirrors the "—"
// shown by the Rapports pages (computeVariation) for the exact same null-baseline case.
const formatPercentChange = (current: number, previous: number): string => {
  if (previous <= 0) return current > 0 ? 'Nouveau' : '+0%';
  const pct = ((current - previous) / previous) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
};

// --- Sales / purchases / expenses / margin aggregation over a date range -----------------------

const sumSales = (transactions: SaleTransaction[], range: DateRange): { revenue: number; ticketCount: number; itemsCount: number } => {
  let revenue = 0;
  let ticketCount = 0;
  let itemsCount = 0;
  transactions.forEach((t) => {
    if (t.status !== 'Payé' || !inRange(t.date, range)) return;
    revenue += t.totalAmount;
    ticketCount += 1;
    itemsCount += t.itemsCount;
  });
  return { revenue, ticketCount, itemsCount };
};

// Only orders that were really placed count as "achats": a cancelled order was never purchased and a
// draft ('Brouillon') hasn't been sent to the supplier yet (see purchasesModel.isCountedPurchase,
// shared with the reports so the two never disagree).
const sumPurchases = (orders: PurchaseOrder[], range: DateRange): number =>
  orders
    .filter((o) => inRange(o.orderDate, range) && isCountedPurchase(o))
    .reduce((sum, o) => sum + computeOrderTotal(o), 0);

// Only 'Approuvé' expenses represent real money actually spent — matches the "dépenses
// approuvées" label already shown under this card (the Rapport sur les dépenses page
// intentionally counts pending expenses too, for budgeting oversight — a different, equally
// valid purpose that stays untouched in reportsModel.ts's own computeExpensesMetrics).
//
// The automatic "TVA collectée" and supplier-payment expenses are left out here on purpose: the VAT
// is already removed from the net sales, and a supplier payment is a purchase already counted in
// "Achats". Keeping them would subtract the same money a second time in Bénéfices, and the four
// cards (Ventes − TVA − Achats − Dépenses = Bénéfices) could never add up.
const sumExpenses = (expenses: Expense[], range: DateRange): number =>
  excludeOverlappingExpenses(
    expenses.filter((e) => inRange(e.date, range) && e.status === 'Approuvé'),
    'sale_vat',
    'invoice_payment'
  ).reduce((sum, e) => sum + e.amount, 0);

// Recipe-cost-based COGS estimate for the transactions in range: items whose name matches a
// CatalogArticle with a recipe cost that recipe (converted through sub-recipes); anything without
// a resolvable recipe is treated as zero-cost (its full price counts as margin), matching the
// conservative "never invent a cost we can't derive" approach used across the app.
// The revenue here is HT (VAT excluded): margin is what's left of the café's own turnover, the VAT
// collected is owed to the state.
const estimateMargin = (
  transactions: SaleTransaction[],
  range: DateRange,
  articles: CatalogArticle[],
  stockProducts: StockProduct[],
  subRecipes: SubRecipe[]
): { revenue: number; margin: number } => {
  let revenue = 0;
  let cost = 0;
  transactions.forEach((t) => {
    if (t.status !== 'Payé' || !inRange(t.date, range)) return;
    t.items.forEach((item) => {
      const gross = item.price * item.qty;
      // Prefer the net amount frozen at sale time; derive it only for items that predate it.
      revenue += item.netAmount ?? gross / (1 + (item.vatRate ?? DEFAULT_VAT_RATE));
      const article = articles.find((a) => normalizeKey(a.name) === normalizeKey(item.name));
      if (article?.recipe) {
        const { cost: unitCost } = computeRecipeCost(article.recipe, stockProducts, subRecipes, articles);
        cost += unitCost * item.qty;
      }
    });
  });
  return { revenue, margin: revenue - cost };
};

// --- Metric cards (replaces METRIC_CARDS + PERIOD_ANALYSIS_DATA[activePeriod]) -----------------

export interface DashboardPeriodData {
  turnover: string;
  turnoverChange: string;
  purchases: string;
  purchasesChange: string;
  expenses: string;
  expensesChange: string;
  benefice: string;
  beneficeChange: string;
  stockValue: string;
  staffCost: string;
  staffCostChange: string;
  staffCostRatio: string;
  ticketCount: number;
  ticketCountChange: string;
  averageBasket: string;
  itemsPerTicket: string;
  estimatedMargin: string;
  estimatedMarginChange: string;
  marginPercent: string;
}

export interface DashboardDataSources {
  transactions: SaleTransaction[];
  orders: PurchaseOrder[];
  expenses: Expense[];
  stockProducts: StockProduct[];
  financialRecords: FinancialRecord[];
  articles: CatalogArticle[];
  subRecipes: SubRecipe[];
}

export const computeDashboardPeriodData = (range: DateRange, sources: DashboardDataSources): DashboardPeriodData => {
  const prevRange = getPreviousRange(range);
  const { transactions, orders, expenses, stockProducts, financialRecords, articles, subRecipes } = sources;

  const current = sumSales(transactions, range);
  const previous = sumSales(transactions, prevRange);
  const purchases = sumPurchases(orders, range);
  const prevPurchases = sumPurchases(orders, prevRange);
  const expensesTotal = sumExpenses(expenses, range);
  const prevExpensesTotal = sumExpenses(expenses, prevRange);

  // Bénéfices = Ventes nettes − Achats − Dépenses, où Ventes nettes = Ventes brutes − TVA
  // collectée (never the gross/TTC figure — taxes collected on behalf of the state are not
  // profit). Sales stats/KPIs elsewhere (turnover, etc.) still show the gross amount actually
  // paid by customers; only this profit figure nets the tax back out.
  const inRangeSales = transactions.filter((t) => t.status === 'Payé' && inRange(t.date, range));
  const prevInRangeSales = transactions.filter((t) => t.status === 'Payé' && inRange(t.date, prevRange));
  const netSales = current.revenue - computeVatBreakdown(inRangeSales).totalTax;
  const prevNetSales = previous.revenue - computeVatBreakdown(prevInRangeSales).totalTax;
  const benefice = netSales - purchases - expensesTotal;
  const prevBenefice = prevNetSales - prevPurchases - prevExpensesTotal;

  const thisMonthStart = firstOfMonthIso(todayIso());
  const prevMonthStart = firstOfMonthIso(todayIso(), -1);
  const staffCost = financialRecords
    .filter((r) => r.periodMonthIndex === monthIndexOf(thisMonthStart) && r.periodYear === yearOf(thisMonthStart))
    .reduce((sum, r) => sum + r.baseSalary + r.bonuses - r.deductions, 0);
  const prevStaffCost = financialRecords
    .filter((r) => r.periodMonthIndex === monthIndexOf(prevMonthStart) && r.periodYear === yearOf(prevMonthStart))
    .reduce((sum, r) => sum + r.baseSalary + r.bonuses - r.deductions, 0);

  // The staff cost is a whole calendar month, so its ratio must be against that month's revenue —
  // dividing it by a single day's (or week's) revenue gave absurd figures like 4000% du CA.
  const monthRevenue = sumSales(transactions, { start: thisMonthStart, end: todayIso() }).revenue;

  const { revenue: marginRevenue, margin } = estimateMargin(transactions, range, articles, stockProducts, subRecipes);
  const { margin: prevMargin } = estimateMargin(transactions, prevRange, articles, stockProducts, subRecipes);

  return {
    turnover: formatDT(current.revenue),
    turnoverChange: formatPercentChange(current.revenue, previous.revenue),
    purchases: formatDT(purchases),
    purchasesChange: formatPercentChange(purchases, prevPurchases),
    expenses: formatDT(expensesTotal),
    expensesChange: formatPercentChange(expensesTotal, prevExpensesTotal),
    benefice: formatDT(benefice),
    beneficeChange: formatPercentChange(benefice, prevBenefice),
    stockValue: formatDT(computeStockValue(stockProducts)),
    staffCost: formatDT(staffCost),
    staffCostChange: formatPercentChange(staffCost, prevStaffCost),
    staffCostRatio: monthRevenue > 0 ? `${((staffCost / monthRevenue) * 100).toFixed(1)}% du CA du mois` : '—',
    ticketCount: current.ticketCount,
    ticketCountChange: formatPercentChange(current.ticketCount, previous.ticketCount),
    averageBasket: formatDT(current.ticketCount > 0 ? current.revenue / current.ticketCount : 0),
    itemsPerTicket: current.ticketCount > 0 ? `${(current.itemsCount / current.ticketCount).toFixed(1)} art./ticket` : '0 art./ticket',
    estimatedMargin: formatDT(margin),
    estimatedMarginChange: formatPercentChange(margin, prevMargin),
    marginPercent: `${marginRevenue > 0 ? ((margin / marginRevenue) * 100).toFixed(1) : '0.0'}%`,
  };
};

export const buildMetricCards = (data: DashboardPeriodData): MetricCardData[] => [
  { id: 'total-sales', title: 'Ventes totales', amount: data.turnover, subtitle: `${data.turnoverChange} vs période préc.`, accentColor: 'emerald', iconType: 'receipt' },
  { id: 'total-purchases', title: 'Achat total des biens et services', amount: data.purchases, subtitle: `${data.purchasesChange} vs période préc.`, accentColor: 'blue', iconType: 'cart' },
  { id: 'total-expenses', title: 'Total des dépenses', amount: data.expenses, subtitle: `${data.expensesChange} vs période préc.`, accentColor: 'rose', iconType: 'wallet' },
  { id: 'benefice', title: 'Bénéfices', amount: data.benefice, subtitle: `${data.beneficeChange} vs période préc.`, accentColor: 'purple', iconType: 'trending' },
];

// --- Top/least/revenue/margin products + low stock (replaces the 4 TopProduct[] + LOW_STOCK_PRODUCTS) --

const formatPrice = (v: number): string => `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DT`;

export const buildProductRankings = (
  transactions: SaleTransaction[],
  articles: CatalogArticle[],
  stockProducts: StockProduct[],
  subRecipes: SubRecipe[]
): { top: TopProduct[]; least: TopProduct[]; topRevenue: TopProduct[]; topMargin: TopProduct[] } => {
  const agg = new Map<string, { name: string; category?: string; qty: number; revenue: number }>();
  transactions.forEach((t) => {
    if (t.status !== 'Payé') return;
    t.items.forEach((item) => {
      const key = normalizeKey(item.name);
      const entry = agg.get(key) ?? { name: item.name, category: item.category, qty: 0, revenue: 0 };
      entry.qty += item.qty;
      entry.revenue += item.price * item.qty;
      agg.set(key, entry);
    });
  });

  const rows = Array.from(agg.entries()).map(([key, v]) => {
    const article = articles.find((a) => normalizeKey(a.name) === key);
    let marginPercent: number | undefined;
    let costPrice: string | undefined;
    if (article?.recipe) {
      const { cost } = computeRecipeCost(article.recipe, stockProducts, subRecipes, articles);
      // Margin on the price WITHOUT VAT; an article with no price yet falls back to the average
      // price it actually sold at (TTC, so its VAT share is removed at the default rate).
      const { marginRate } =
        article.price > 0
          ? computeArticleMargin(article, cost)
          : computeMargin((v.qty > 0 ? v.revenue / v.qty : 0) / (1 + DEFAULT_VAT_RATE), cost);
      marginPercent = Math.round(marginRate * 100);
      costPrice = formatPrice(cost);
    }
    const price = article?.price ?? (v.qty > 0 ? v.revenue / v.qty : 0);
    return {
      id: article?.id ?? key,
      name: v.name,
      sku: article?.id ?? key,
      price: formatPrice(price),
      soldCount: v.qty,
      soldLabel: `${v.qty} vendu${v.qty > 1 ? 's' : ''}`,
      category: v.category,
      revenue: formatPrice(v.revenue),
      marginPercent,
      costPrice,
    } satisfies TopProduct;
  });

  const bySoldDesc = [...rows].sort((a, b) => b.soldCount - a.soldCount);
  const byRevenueDesc = [...rows].sort((a, b) => parseFloat(b.revenue!) - parseFloat(a.revenue!));
  const byMarginDesc = [...rows].filter((r) => r.marginPercent !== undefined).sort((a, b) => (b.marginPercent ?? 0) - (a.marginPercent ?? 0));

  return {
    top: bySoldDesc.slice(0, 5),
    least: [...bySoldDesc].reverse().slice(0, 5),
    topRevenue: byRevenueDesc.slice(0, 5),
    topMargin: byMarginDesc.slice(0, 5),
  };
};

export const buildLowStockList = (stockProducts: StockProduct[]): LowStockProduct[] =>
  computeLowStockProducts(stockProducts).slice(0, 5).map((p) => {
    const qty = getTotalQty(p);
    const urgency: LowStockProduct['urgency'] = qty <= 0 ? 'Critique' : qty < p.minThreshold * 0.5 ? 'Critique' : qty < p.minThreshold * 0.8 ? 'Faible' : 'Modéré';
    return { id: p.id, name: p.name, sku: p.sku, stock: qty, minThreshold: p.minThreshold, unit: p.unit, urgency };
  });

// --- Operational alerts, mapped to the dashboard's simpler CoffeeAlert shape --------------------

const relativeTimeFromNow = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}j`;
};

const alertCategoryFor = (alert: OperationalAlert): CoffeeAlert['category'] => {
  if (alert.type === 'invoice_due') return 'Fournisseur';
  return 'Stock';
};

const alertLevelFor = (severity: OperationalAlert['severity']): CoffeeAlert['level'] => {
  if (severity === 'Critique') return 'danger';
  if (severity === 'Information') return 'info';
  return 'warning';
};

export const buildDashboardAlerts = (ctx: AlertsContext): CoffeeAlert[] =>
  computeOperationalAlerts(ctx)
    .slice(0, 4)
    .map((a) => ({
      id: a.id,
      title: a.title,
      description: a.message,
      level: alertLevelFor(a.severity),
      category: alertCategoryFor(a),
      timeAgo: relativeTimeFromNow(a.detectedAt),
      actionLabel: a.actionLabel,
    }));

const MONTH_LABELS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

// --- Sales / purchases by day/month/year series (replaces SALES_BY_PERIOD / PURCHASES_BY_PERIOD) --

export interface SeriesPoint {
  label: string;
  current: number;
  previous: number;
  tickets: number;
}

export interface PurchasesPeriodPoint {
  label: string;
  dateKey: string;
  amount: number;
}

const WEEKDAY_SHORT_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export const buildSalesByPeriod = (transactions: SaleTransaction[]): { days: SeriesPoint[]; months: SeriesPoint[]; years: SeriesPoint[] } => {
  const paid = transactions.filter((t) => t.status === 'Payé');
  const today = todayIso();
  const sumOf = (list: SaleTransaction[]) => list.reduce((s, t) => s + t.totalAmount, 0);

  const days: SeriesPoint[] = Array.from({ length: 7 }, (_, i) => {
    const iso = addDaysIso(today, -(6 - i));
    const dayTx = paid.filter((t) => t.date === iso);
    const prevTx = paid.filter((t) => t.date === addDaysIso(iso, -7));
    return {
      label: `${WEEKDAY_SHORT_FR[weekdayMondayFirst(iso)]} ${String(dayOfMonth(iso)).padStart(2, '0')}/${String(monthIndexOf(iso) + 1).padStart(2, '0')}`,
      current: sumOf(dayTx),
      previous: sumOf(prevTx),
      tickets: dayTx.length,
    };
  });

  // Buckets are 'YYYY-MM' keys taken straight from the ISO dates — never a Date converted through
  // UTC, which used to shift every month bar onto the previous month east of UTC.
  const months: SeriesPoint[] = Array.from({ length: 9 }, (_, i) => {
    const monthStart = firstOfMonthIso(today, -(8 - i));
    const key = monthStart.slice(0, 7);
    const prevKey = firstOfMonthIso(monthStart, -1).slice(0, 7);
    const monthTx = paid.filter((t) => t.date.slice(0, 7) === key);
    const prevTx = paid.filter((t) => t.date.slice(0, 7) === prevKey);
    return {
      label: MONTH_LABELS_FR[monthIndexOf(monthStart)].replace('.', ''),
      current: sumOf(monthTx),
      previous: sumOf(prevTx),
      tickets: monthTx.length,
    };
  });

  const years: SeriesPoint[] = Array.from({ length: 4 }, (_, i) => {
    const y = yearOf(today) - (3 - i);
    const yearTx = paid.filter((t) => t.year === y);
    const prevTx = paid.filter((t) => t.year === y - 1);
    return { label: String(y), current: sumOf(yearTx), previous: sumOf(prevTx), tickets: yearTx.length };
  });

  return { days, months, years };
};

// --- Daily sales calendar: GitHub-contributions-style grid, weekday rows x week columns grouped --
// into month labels (used by the "Ventes par jour" card). Each cell is a single calendar day.

export interface DailySalesCalendarCell {
  dateIso: string;
  weekday: number; // 0=Lun .. 6=Dim
  revenue: number;
  operations: number;
  itemsSold: number;
  inRange: boolean; // false for grid-padding days outside the displayed window
}

export interface DailySalesCalendarWeek {
  cells: DailySalesCalendarCell[]; // always 7, Lun..Dim
}

export interface DailySalesCalendarMonthLabel {
  label: string; // full French month name, e.g. 'Avril'
  weekIndex: number; // column index of the week this label should sit above
}

export interface DailySalesCalendarData {
  weeks: DailySalesCalendarWeek[]; // oldest to newest
  monthLabels: DailySalesCalendarMonthLabel[];
  maxValue: number;
  rangeStartIso: string;
  rangeEndIso: string;
}

const MONTH_LABELS_FULL_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export const buildDailySalesCalendar = (transactions: SaleTransaction[], monthsBack = 6): DailySalesCalendarData => {
  const paid = transactions.filter((t) => t.status === 'Payé');

  const rangeEnd = todayIso();
  const rangeStart = firstOfMonthIso(rangeEnd, -(monthsBack - 1));

  // Snap the grid to full Monday-to-Sunday weeks so every column has all 7 rows.
  const gridStart = mondayOfWeekIso(rangeStart);
  const gridEnd = addDaysIso(rangeEnd, 6 - weekdayMondayFirst(rangeEnd));

  const byDate = new Map<string, { revenue: number; operations: number; itemsSold: number }>();
  paid.forEach((t) => {
    const bucket = byDate.get(t.date) ?? { revenue: 0, operations: 0, itemsSold: 0 };
    bucket.revenue += t.totalAmount;
    bucket.operations += 1;
    bucket.itemsSold += t.itemsCount;
    byDate.set(t.date, bucket);
  });

  const weeks: DailySalesCalendarWeek[] = [];
  const monthLabels: DailySalesCalendarMonthLabel[] = [];
  let maxValue = 0;
  let lastLabeledMonth = -1;

  for (let cursor = gridStart; cursor <= gridEnd; ) {
    const cells: DailySalesCalendarCell[] = [];
    let containsFirstOfMonth = false;
    for (let w = 0; w < 7; w += 1) {
      const iso = cursor;
      const cellInRange = iso >= rangeStart && iso <= rangeEnd;
      if (dayOfMonth(iso) === 1) containsFirstOfMonth = true;
      const bucket = byDate.get(iso);
      const revenue = bucket?.revenue ?? 0;
      if (cellInRange && revenue > maxValue) maxValue = revenue;
      cells.push({
        dateIso: iso,
        weekday: w,
        revenue,
        operations: bucket?.operations ?? 0,
        itemsSold: bucket?.itemsSold ?? 0,
        inRange: cellInRange,
      });
      cursor = addDaysIso(cursor, 1);
    }
    const mondayMonth = monthIndexOf(cells[0].dateIso);
    if ((weeks.length === 0 || containsFirstOfMonth) && mondayMonth !== lastLabeledMonth) {
      monthLabels.push({ label: MONTH_LABELS_FULL_FR[mondayMonth], weekIndex: weeks.length });
      lastLabeledMonth = mondayMonth;
    }
    weeks.push({ cells });
  }

  return { weeks, monthLabels, maxValue, rangeStartIso: rangeStart, rangeEndIso: rangeEnd };
};

// Purchase orders only carry a date (no time-of-day field), so — unlike sales — there's no real
// hourly data for purchases; day/month/year buckets (matching the Sales chart's Jours/Mois/Année
// filter) are the finest granularity purchases actually support.
export const buildPurchasesByPeriod = (orders: PurchaseOrder[]): { days: PurchasesPeriodPoint[]; months: PurchasesPeriodPoint[]; years: PurchasesPeriodPoint[] } => {
  const today = todayIso();
  // Same rule as the "Achat total" card: cancelled and draft orders are not purchases.
  const counted = orders.filter(isCountedPurchase);
  const sumOf = (list: PurchaseOrder[]) => list.reduce((s, o) => s + computeOrderTotal(o), 0);

  const days: PurchasesPeriodPoint[] = Array.from({ length: 7 }, (_, i) => {
    const iso = addDaysIso(today, -(6 - i));
    return {
      label: `${String(dayOfMonth(iso)).padStart(2, '0')}/${String(monthIndexOf(iso) + 1).padStart(2, '0')}`,
      dateKey: iso,
      amount: sumOf(counted.filter((o) => o.orderDate === iso)),
    };
  });

  const months: PurchasesPeriodPoint[] = Array.from({ length: 9 }, (_, i) => {
    const monthStart = firstOfMonthIso(today, -(8 - i));
    const key = monthStart.slice(0, 7);
    return {
      label: MONTH_LABELS_FR[monthIndexOf(monthStart)].replace('.', ''),
      dateKey: key,
      amount: sumOf(counted.filter((o) => o.orderDate.slice(0, 7) === key)),
    };
  });

  const years: PurchasesPeriodPoint[] = Array.from({ length: 4 }, (_, i) => {
    const y = yearOf(today) - (3 - i);
    return {
      label: String(y),
      dateKey: String(y),
      amount: sumOf(counted.filter((o) => o.orderDate.startsWith(String(y)))),
    };
  });

  return { days, months, years };
};

// --- Category breakdown for PlanOverview's donut (replaces its hardcoded categories) ------------

export interface CategoryShare {
  id: string;
  label: string;
  percent: number;
  amount: string;
  color: string;
  strokeOffset: number;
  strokeLength: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  'Café chaud': '#10b981',
  'Boisson lactée': '#0ea5e9',
  'Boisson glacée': '#6366f1',
  'Pâtisserie': '#f59e0b',
  'Snack': '#f43f5e',
  'Épicerie Café': '#8b5cf6',
};
const FALLBACK_COLORS = ['#10b981', '#0ea5e9', '#6366f1', '#f59e0b', '#f43f5e', '#8b5cf6', '#14b8a6', '#a855f7'];

export interface CategorySharesResult {
  categories: CategoryShare[];
  monthlyTarget: number;
  achievedToDate: number;
  currentMonthKey: string; // 'YYYY-MM', for looking up / saving a custom target
  isCustomTarget: boolean;
}

export const buildCategoryShares = (
  transactions: SaleTransaction[],
  range: DateRange,
  customMonthlyTarget?: number
): CategorySharesResult => {
  const byCategory = new Map<string, number>();
  let total = 0;
  transactions.forEach((t) => {
    if (t.status !== 'Payé' || !inRange(t.date, range)) return;
    t.items.forEach((item) => {
      const amount = item.price * item.qty;
      byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + amount);
      total += amount;
    });
  });

  let offset = 0;
  const categories: CategoryShare[] = Array.from(byCategory.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, amount], i) => {
      const percent = total > 0 ? Math.round((amount / total) * 1000) / 10 : 0;
      const entry: CategoryShare = {
        id: normalizeKey(label),
        label,
        percent,
        amount: formatDT(amount),
        color: CATEGORY_COLORS[label] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
        strokeOffset: offset,
        strokeLength: percent,
      };
      offset += percent;
      return entry;
    });

  // Falls back to the previous calendar month's real revenue — an honest, data-driven stand-in —
  // whenever the user hasn't set a real objective for the current month via the PlanOverview card.
  const today = todayIso();
  const monthRange = { start: startOfMonth(today), end: today };
  const prevMonthEnd = addDays(monthRange.start, -1);
  const prevMonthRange = { start: startOfMonth(prevMonthEnd), end: prevMonthEnd };
  const achievedToDate = sumSales(transactions, monthRange).revenue;
  const fallbackTarget = sumSales(transactions, prevMonthRange).revenue;
  const monthlyTarget = customMonthlyTarget ?? fallbackTarget;

  return { categories, monthlyTarget, achievedToDate, currentMonthKey: today.slice(0, 7), isCustomTarget: customMonthlyTarget !== undefined };
};
