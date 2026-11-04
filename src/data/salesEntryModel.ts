import { todayIso } from './dateUtils';
import { SaleItem, SaleTransaction, ServiceType, PaymentMethod, MONTHS_LIST } from './salesTransactions';
import {
  CatalogArticle,
  CatalogExtra,
  ArticleCategory,
  VariantOption,
  getArticleById,
  getExtraById,
  getVariantGroupForCategory,
  getVariantOption,
  getArticleVatRate,
  getArticleTtcPrice,
} from './manualSalesCatalog';
import { normalizeKey, parseDateFlexible } from './textUtils';
import { roundToPayableCash } from './currencyRounding';

export { normalizeKey, parseDateFlexible };

// The real, live catalog data every function below needs — supplied by the caller (App.tsx state,
// threaded through ManualSalesEntryPage/ImportSalesPage) instead of a hardcoded module constant.
export interface SalesCatalogContext {
  articles: CatalogArticle[];
  extras: CatalogExtra[];
  employees: string[]; // real employees' full names
  shifts: string[]; // real shift names
}

// Shared draft model used by both "Ajout manuel des ventes" and "Import Excel/CSV" so the two
// features apply identical validation, resolution and sale-building rules (single source of truth).

export interface DraftTicketItem {
  rowId: string;
  articleId: string;
  qty: number;
  variantOptionId: string;
  extraIds: string[];
}

export interface DraftTicket {
  rowId: string;
  items: DraftTicketItem[];
  serviceType: ServiceType | '';
  tableNumber: string;
  counterLabel: string;
  paymentMethod: PaymentMethod | '';
}

export interface ManualSalesFormState {
  date: string;
  shift: string;
  employee: string;
  tickets: DraftTicket[];
}

export interface ValidationIssue {
  ticketIndex: number; // -1 for general/global issues
  fieldKey: string;
  message: string;
}

let idCounter = 0;
export const generateId = (prefix: string): string => {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
};

export const createEmptyItem = (): DraftTicketItem => ({
  rowId: generateId('item'),
  articleId: '',
  qty: 1,
  variantOptionId: '',
  extraIds: [],
});

export const createEmptyTicket = (): DraftTicket => ({
  rowId: generateId('ticket'),
  items: [createEmptyItem()],
  serviceType: 'Sur place',
  tableNumber: '',
  counterLabel: 'Comptoir Express',
  paymentMethod: 'Espèces',
});

export const createEmptyForm = (): ManualSalesFormState => ({
  date: todayIso(),
  shift: '',
  employee: '',
  tickets: [createEmptyTicket()],
});

// --- Pricing ---

export const computeItemUnitPrice = (item: DraftTicketItem, catalog: Pick<SalesCatalogContext, 'articles' | 'extras'>): number => {
  const article = getArticleById(item.articleId, catalog.articles);
  if (!article) return 0;
  const variantDelta = item.variantOptionId
    ? getVariantOption(article.category, item.variantOptionId)?.priceDelta ?? 0
    : 0;
  const extrasTotal = item.extraIds.reduce((sum, id) => sum + (getExtraById(id, catalog.extras)?.price ?? 0), 0);
  return getArticleTtcPrice(article) + variantDelta + extrasTotal;
};

export const computeItemLineTotal = (item: DraftTicketItem, catalog: Pick<SalesCatalogContext, 'articles' | 'extras'>): number =>
  computeItemUnitPrice(item, catalog) * item.qty;

export const computeTicketTotal = (ticket: DraftTicket, catalog: Pick<SalesCatalogContext, 'articles' | 'extras'>): number =>
  ticket.items.reduce((sum, it) => sum + (it.articleId ? computeItemLineTotal(it, catalog) : 0), 0);

export const computeGrandTotal = (form: ManualSalesFormState, catalog: Pick<SalesCatalogContext, 'articles' | 'extras'>): number =>
  form.tickets.reduce((sum, t) => sum + computeTicketTotal(t, catalog), 0);

// --- Validation (shared between Manual Add and Import correction) ---

export const validateGeneralFields = (
  date: string,
  shift: string,
  employee: string,
  prefix = 'general'
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (!date) issues.push({ ticketIndex: -1, fieldKey: `${prefix}:date`, message: 'La date est obligatoire.' });
  if (!shift) issues.push({ ticketIndex: -1, fieldKey: `${prefix}:shift`, message: 'Le shift est obligatoire.' });
  if (!employee) issues.push({ ticketIndex: -1, fieldKey: `${prefix}:employee`, message: "L'employé est obligatoire." });
  return issues;
};

export const validateTicketFields = (ticket: DraftTicket, label: string): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const validItems = ticket.items.filter((it) => it.articleId);

  if (validItems.length === 0) {
    issues.push({
      ticketIndex: -1,
      fieldKey: `ticket:${ticket.rowId}:items`,
      message: `${label} — Articles : sélectionnez au moins une consommation ou un article.`,
    });
  }

  ticket.items.forEach((it, itemIdx) => {
    if (!it.articleId) {
      issues.push({
        ticketIndex: -1,
        fieldKey: `item:${it.rowId}:article`,
        message: `${label} — Article ${itemIdx + 1} : veuillez choisir une consommation ou un article.`,
      });
    }
    if (it.qty < 1) {
      issues.push({
        ticketIndex: -1,
        fieldKey: `item:${it.rowId}:qty`,
        message: `${label} — Article ${itemIdx + 1} : la quantité doit être d'au moins 1.`,
      });
    }
  });

  if (!ticket.serviceType) {
    issues.push({
      ticketIndex: -1,
      fieldKey: `ticket:${ticket.rowId}:service`,
      message: `${label} — Service : veuillez choisir "À emporter" ou "Sur place".`,
    });
  } else if (ticket.serviceType === 'Sur place' && !ticket.tableNumber.trim()) {
    issues.push({
      ticketIndex: -1,
      fieldKey: `ticket:${ticket.rowId}:table`,
      message: `${label} — Service : le numéro de table est obligatoire pour une vente "Sur place".`,
    });
  } else if (ticket.serviceType === 'À emporter' && !ticket.counterLabel.trim()) {
    issues.push({
      ticketIndex: -1,
      fieldKey: `ticket:${ticket.rowId}:counter`,
      message: `${label} — Service : le comptoir est obligatoire pour une vente "À emporter".`,
    });
  }

  if (!ticket.paymentMethod) {
    issues.push({
      ticketIndex: -1,
      fieldKey: `ticket:${ticket.rowId}:payment`,
      message: `${label} — Règlement : veuillez sélectionner un mode de règlement.`,
    });
  }

  return issues;
};

export const validateManualSalesForm = (form: ManualSalesFormState): ValidationIssue[] => {
  const issues = validateGeneralFields(form.date, form.shift, form.employee, 'general');

  if (form.tickets.length === 0) {
    issues.push({
      ticketIndex: -1,
      fieldKey: 'general:tickets',
      message: 'Ajoutez au moins un ticket avant de vérifier les ventes.',
    });
  }

  form.tickets.forEach((ticket, idx) => {
    validateTicketFields(ticket, `Ticket ${idx + 1}`).forEach((issue) => {
      issues.push({ ...issue, ticketIndex: idx });
    });
  });

  return issues;
};

// --- Sale-building (shared) ---

const buildSaleItemFromDraft = (item: DraftTicketItem, catalog: Pick<SalesCatalogContext, 'articles' | 'extras'>): SaleItem | null => {
  const article = getArticleById(item.articleId, catalog.articles);
  if (!article) return null;
  const variant = item.variantOptionId ? getVariantOption(article.category, item.variantOptionId) : undefined;
  const extraNames = item.extraIds.map((id) => getExtraById(id, catalog.extras)?.name).filter((n): n is string => Boolean(n));
  const nameSuffix = [variant?.label, ...extraNames].filter(Boolean).join(', ');
  const unitPrice = computeItemUnitPrice(item, catalog);
  const vatRate = getArticleVatRate(article);
  const lineTtc = unitPrice * item.qty;
  const lineNet = lineTtc / (1 + vatRate);
  return {
    name: nameSuffix ? `${article.name} (${nameSuffix})` : article.name,
    qty: item.qty,
    price: unitPrice,
    category: article.category,
    vatRate,
    netAmount: lineNet,
    taxAmount: lineTtc - lineNet,
    extraIds: item.extraIds.length > 0 ? item.extraIds : undefined,
  };
};

export const buildSaleTransactionFromTicket = (
  ticket: DraftTicket,
  context: { date: string; shift: string; employee: string },
  meta: { id: number; saleNumber: string },
  catalog: Pick<SalesCatalogContext, 'articles' | 'extras'>
): SaleTransaction | null => {
  if (!ticket.serviceType || !ticket.paymentMethod) return null;
  const items = ticket.items.map((it) => buildSaleItemFromDraft(it, catalog)).filter((it): it is SaleItem => it !== null);
  if (items.length === 0) return null;

  const dateObj = new Date(`${context.date}T00:00:00`);
  if (Number.isNaN(dateObj.getTime())) return null;
  const monthLabel = MONTHS_LIST[dateObj.getMonth()]?.label ?? 'Sep';
  const now = new Date();
  const timeLabel = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const preciseAmount = items.reduce((sum, it) => sum + it.qty * it.price, 0);
  // Only cash payments face the "can this be made with real coins/notes" problem — card and
  // ticket resto settle at the exact electronic amount.
  const totalAmount = ticket.paymentMethod === 'Espèces' ? roundToPayableCash(preciseAmount) : preciseAmount;
  const itemsCount = items.reduce((sum, it) => sum + it.qty, 0);
  const itemsSummary = items.map((it) => `${it.qty}x ${it.name}`).join(', ');

  return {
    id: meta.id,
    saleNumber: meta.saleNumber,
    serviceType: ticket.serviceType,
    tableOrArea:
      ticket.serviceType === 'Sur place'
        ? `Table ${ticket.tableNumber.trim()}`
        : ticket.counterLabel.trim() || 'Comptoir Express',
    items,
    itemsCount,
    itemsSummary,
    paymentMethod: ticket.paymentMethod,
    barista: context.employee,
    totalAmount,
    preciseAmount,
    date: context.date,
    time: timeLabel,
    month: monthLabel,
    year: dateObj.getFullYear(),
    status: 'Payé',
  };
};

export const buildSaleTransactionsFromForm = (form: ManualSalesFormState, catalog: Pick<SalesCatalogContext, 'articles' | 'extras'>): SaleTransaction[] => {
  const datePrefix = form.date.replace(/-/g, '');
  const baseId = Date.now();
  const context = { date: form.date, shift: form.shift, employee: form.employee };
  return form.tickets
    .map((ticket, idx) =>
      buildSaleTransactionFromTicket(
        ticket,
        context,
        { id: baseId + idx, saleNumber: `TKT-MAN-${datePrefix}-${(idx + 1).toString().padStart(3, '0')}` },
        catalog
      )
    )
    .filter((tx): tx is SaleTransaction => tx !== null);
};

// --- Case / accent / whitespace tolerant resolution (shared by Manual Add + Import) ---
//
// Comparisons never mutate canonical data: a match always returns the entity/label exactly as
// stored in the catalog, so "COCA COLA" resolves to the real "Coca Cola" product without ever
// creating a duplicate or renaming anything.

export const resolveArticleByName = (raw: string, articles: CatalogArticle[]): CatalogArticle | undefined => {
  const key = normalizeKey(raw);
  if (!key) return undefined;
  return articles.find((a) => normalizeKey(a.name) === key);
};

export const resolveExtraByName = (raw: string, extras: CatalogExtra[]): CatalogExtra | undefined => {
  const key = normalizeKey(raw);
  if (!key) return undefined;
  return extras.find((e) => normalizeKey(e.name) === key);
};

export const resolveVariantOptionByName = (category: ArticleCategory, raw: string): VariantOption | undefined => {
  const key = normalizeKey(raw);
  if (!key) return undefined;
  const group = getVariantGroupForCategory(category);
  return group?.options.find((o) => normalizeKey(o.label) === key);
};

export const resolveEmployeeByName = (raw: string, employees: string[]): string | undefined => {
  const key = normalizeKey(raw);
  if (!key) return undefined;
  return employees.find((e) => normalizeKey(e) === key);
};

export const resolveShiftByName = (raw: string, shifts: string[]): string | undefined => {
  const key = normalizeKey(raw);
  if (!key) return undefined;
  return shifts.find((s) => normalizeKey(s) === key);
};

const SERVICE_TYPE_CANONICAL: ServiceType[] = ['Sur place', 'À emporter'];
export const resolveServiceType = (raw: string): ServiceType | undefined => {
  const key = normalizeKey(raw);
  if (!key) return undefined;
  return SERVICE_TYPE_CANONICAL.find((s) => normalizeKey(s) === key);
};

const PAYMENT_METHOD_CANONICAL: PaymentMethod[] = ['Espèces', 'Carte bancaire', 'Ticket resto'];
export const resolvePaymentMethod = (raw: string): PaymentMethod | undefined => {
  const key = normalizeKey(raw);
  if (!key) return undefined;
  return PAYMENT_METHOD_CANONICAL.find((p) => normalizeKey(p) === key);
};

