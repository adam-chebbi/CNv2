// Shared domain model for "Achat et dépenses" → Achats et acquisitions.
// Follows the same conventions as the rest of the app: canonical entity resolution via
// normalizeKey, draft/validation helpers for the Saisie → Validation → Confirmation workflow,
// and reuse of the existing Stock ledger (stockModel.ts) so a validated reception increases
// stock through the SAME append-only mechanism as every other stock movement — never a second,
// parallel way to change quantities.

import { todayIso } from './dateUtils';
import { normalizeKey } from './textUtils';
import { StockZone, StockLedgerEntry, StockProduct, generateStockId, getZoneQty } from './stockModel';

let idCounter = 0;
export const generatePurchaseId = (prefix: string): string => {
  idCounter += 1;
  return `${prefix}-${idCounter}-${Date.now().toString(36)}`;
};


// --- Suppliers -----------------------------------------------------------------------------

export interface Supplier {
  id: string;
  name: string;
  taxId?: string; // Matricule fiscal
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  mainContact?: string;
  notes?: string;
  createdAt: string;
}

export const resolveSupplierByName = (raw: string, suppliers: Supplier[]): Supplier | undefined => {
  const key = normalizeKey(raw);
  if (!key) return undefined;
  return suppliers.find((s) => normalizeKey(s.name) === key);
};

// Counts both commandes AND factures referencing this supplier — a supplier referenced only by a
// manually-entered invoice (no linked order) previously showed no usage warning at all before
// deletion, even though deleting it would orphan that invoice's supplierId.
export const getSupplierUsageCount = (supplier: Supplier, orders: PurchaseOrder[], invoices: SupplierInvoice[] = []): number =>
  orders.filter((o) => o.supplierId === supplier.id).length + invoices.filter((i) => i.supplierId === supplier.id).length;

// --- Supplier draft / workflow helpers --------------------------------------------------------

export interface DraftSupplier {
  id: string;
  name: string;
  taxId: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  mainContact: string;
  notes: string;
  createdAt: string | null;
}

export const createEmptyDraftSupplier = (): DraftSupplier => ({
  id: generatePurchaseId('sup'),
  name: '',
  taxId: '',
  phone: '',
  whatsapp: '',
  email: '',
  address: '',
  mainContact: '',
  notes: '',
  createdAt: null,
});

export const createDraftFromSupplier = (supplier: Supplier): DraftSupplier => ({
  id: supplier.id,
  name: supplier.name,
  taxId: supplier.taxId ?? '',
  phone: supplier.phone ?? '',
  whatsapp: supplier.whatsapp ?? '',
  email: supplier.email ?? '',
  address: supplier.address ?? '',
  mainContact: supplier.mainContact ?? '',
  notes: supplier.notes ?? '',
  createdAt: supplier.createdAt,
});

export interface SupplierValidationIssue {
  field: string;
  message: string;
}

export const validateDraftSupplier = (draft: DraftSupplier, suppliers: Supplier[]): SupplierValidationIssue[] => {
  const issues: SupplierValidationIssue[] = [];
  const trimmed = draft.name.trim();
  if (!trimmed) {
    issues.push({ field: 'name', message: 'Le nom / raison sociale est obligatoire.' });
  } else {
    const existing = resolveSupplierByName(trimmed, suppliers);
    if (existing && existing.id !== draft.id) issues.push({ field: 'name', message: `Ce fournisseur existe déjà : « ${existing.name} ».` });
  }
  if (draft.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
    issues.push({ field: 'email', message: 'Adresse email invalide.' });
  }
  return issues;
};

export const buildSupplierFromDraft = (draft: DraftSupplier): Supplier => ({
  id: draft.id,
  name: draft.name.trim(),
  taxId: draft.taxId.trim() || undefined,
  phone: draft.phone.trim() || undefined,
  whatsapp: draft.whatsapp.trim() || undefined,
  email: draft.email.trim() || undefined,
  address: draft.address.trim() || undefined,
  mainContact: draft.mainContact.trim() || undefined,
  notes: draft.notes.trim() || undefined,
  createdAt: draft.createdAt ?? todayIso(),
});

// A product can have several suppliers, and the purchase price history is never a separate
// mutable store — it is simply every purchase order line ever recorded for that supplier,
// grouped by product, so it can never drift from what was actually purchased.
export interface SupplierPriceHistoryEntry {
  productId: string;
  orderId: string;
  orderNumber: string;
  date: string;
  unitPrice: number;
}

export const getSupplierPurchaseHistory = (supplierId: string, orders: PurchaseOrder[]): SupplierPriceHistoryEntry[] =>
  orders
    .filter((o) => o.supplierId === supplierId)
    .flatMap((o) => o.lines.map((l) => ({ productId: l.productId, orderId: o.id, orderNumber: o.orderNumber, date: o.orderDate, unitPrice: l.unitPrice })))
    .sort((a, b) => (a.date < b.date ? 1 : -1));


// --- Purchase order lines / statuses --------------------------------------------------------

export type PurchaseOrderStatus = 'Brouillon' | 'Commandée' | 'Partiellement reçue' | 'Reçue' | 'Annulée';
export const PURCHASE_ORDER_STATUSES: PurchaseOrderStatus[] = ['Brouillon', 'Commandée', 'Partiellement reçue', 'Reçue', 'Annulée'];

// Terminal / closed statuses used for the "Activité" vs "Pas actif" grouping.
const CLOSED_STATUSES: PurchaseOrderStatus[] = ['Reçue', 'Annulée'];
export const isPurchaseOrderActive = (status: PurchaseOrderStatus): boolean => !CLOSED_STATUSES.includes(status);

export interface PurchaseOrderLine {
  id: string;
  productId: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  receivedQuantity: number;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplierId: string;
  orderDate: string; // ISO date
  expectedDate?: string;
  status: PurchaseOrderStatus;
  lines: PurchaseOrderLine[];
  notes?: string;
  createdAt: string;
  createdBy: string;
}

export const generatePurchaseOrderNumber = (existing: PurchaseOrder[]): string => {
  const year = Number(todayIso().slice(0, 4));
  const countThisYear = existing.filter((o) => o.orderNumber.startsWith(`PO-${year}-`)).length;
  return `PO-${year}-${String(countThisYear + 1).padStart(4, '0')}`;
};

export const computeOrderTotal = (order: PurchaseOrder): number =>
  order.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

// Whether an order counts as an actual purchase in "Achats" totals (dashboard + reports): a
// cancelled order never happened and a draft hasn't been sent to the supplier yet.
export const isCountedPurchase = (order: Pick<PurchaseOrder, 'status'>): boolean =>
  order.status !== 'Annulée' && order.status !== 'Brouillon';

export const computeOrderReceivedRatio = (order: PurchaseOrder): 'none' | 'partial' | 'full' => {
  const totalQty = order.lines.reduce((sum, l) => sum + l.quantity, 0);
  const receivedQty = order.lines.reduce((sum, l) => sum + l.receivedQuantity, 0);
  if (receivedQty <= 0) return 'none';
  if (receivedQty >= totalQty) return 'full';
  return 'partial';
};

// Valid manual status transitions from the detail view — "Partiellement reçue" → "Reçue" is never
// listed here because it only ever happens automatically when a reception completes the order.
export const getAllowedManualTransitions = (status: PurchaseOrderStatus): PurchaseOrderStatus[] => {
  switch (status) {
    case 'Brouillon':
      return ['Commandée', 'Annulée'];
    case 'Commandée':
      return ['Annulée'];
    case 'Partiellement reçue':
      return ['Annulée'];
    default:
      return [];
  }
};

// Purchase price history is never a separate mutable store — it is simply every purchase order
// line ever recorded for that supplier/product pair, so it can never drift from real purchases.
export interface PriceHistoryEntry {
  orderId: string;
  orderNumber: string;
  supplierId: string;
  date: string;
  unitPrice: number;
}

export const getProductPriceHistory = (productId: string, orders: PurchaseOrder[]): PriceHistoryEntry[] =>
  orders
    .flatMap((o) =>
      o.lines
        .filter((l) => l.productId === productId)
        .map((l) => ({ orderId: o.id, orderNumber: o.orderNumber, supplierId: o.supplierId, date: o.orderDate, unitPrice: l.unitPrice }))
    )
    .sort((a, b) => (a.date < b.date ? 1 : -1));

export const getLastPriceForSupplierProduct = (supplierId: string, productId: string, orders: PurchaseOrder[]): number | null => {
  const matches = getProductPriceHistory(productId, orders).filter((e) => e.supplierId === supplierId);
  return matches.length > 0 ? matches[0].unitPrice : null;
};

// --- Draft / workflow helpers (purchase order) ----------------------------------------------

export interface DraftPurchaseLine {
  id: string;
  productId: string;
  quantity: string;
  unitPrice: string;
}

export interface DraftPurchaseOrder {
  id: string;
  supplierId: string;
  orderDate: string;
  expectedDate: string;
  notes: string;
  createdBy: string;
  lines: DraftPurchaseLine[];
  // Carried through unchanged from the existing record when editing.
  status: PurchaseOrderStatus;
  orderNumber: string | null;
  createdAt: string | null;
}

export const createEmptyDraftPurchaseLine = (): DraftPurchaseLine => ({
  id: generatePurchaseId('poline'),
  productId: '',
  quantity: '',
  unitPrice: '',
});

export const createEmptyDraftPurchaseOrder = (): DraftPurchaseOrder => ({
  id: generatePurchaseId('po'),
  supplierId: '',
  orderDate: todayIso(),
  expectedDate: '',
  notes: '',
  createdBy: '',
  lines: [createEmptyDraftPurchaseLine()],
  status: 'Brouillon',
  orderNumber: null,
  createdAt: null,
});

export const createDraftFromPurchaseOrder = (order: PurchaseOrder): DraftPurchaseOrder => ({
  id: order.id,
  supplierId: order.supplierId,
  orderDate: order.orderDate,
  expectedDate: order.expectedDate ?? '',
  notes: order.notes ?? '',
  createdBy: order.createdBy,
  lines: order.lines.map((l) => ({ id: l.id, productId: l.productId, quantity: String(l.quantity), unitPrice: String(l.unitPrice) })),
  status: order.status,
  orderNumber: order.orderNumber,
  createdAt: order.createdAt,
});

export interface PurchaseValidationIssue {
  field: string;
  message: string;
}

export const validateDraftPurchaseOrder = (
  draft: DraftPurchaseOrder,
  suppliers: Supplier[],
  products: StockProduct[]
): PurchaseValidationIssue[] => {
  const issues: PurchaseValidationIssue[] = [];

  if (!draft.supplierId) issues.push({ field: 'supplierId', message: 'Le fournisseur est obligatoire.' });
  else if (!suppliers.some((s) => s.id === draft.supplierId)) issues.push({ field: 'supplierId', message: 'Fournisseur invalide.' });

  if (!draft.orderDate) issues.push({ field: 'orderDate', message: "La date d'achat est obligatoire." });

  if (!draft.createdBy) issues.push({ field: 'createdBy', message: "L'employé ayant passé la commande est obligatoire." });

  if (draft.lines.length === 0) {
    issues.push({ field: 'lines', message: 'Ajoutez au moins un article.' });
  }

  const seenProducts = new Set<string>();
  draft.lines.forEach((line, idx) => {
    if (!line.productId) issues.push({ field: `line-${idx}-product`, message: `Ligne ${idx + 1} — le produit est obligatoire.` });
    else if (!products.some((p) => p.id === line.productId)) issues.push({ field: `line-${idx}-product`, message: `Ligne ${idx + 1} — produit invalide.` });
    else if (seenProducts.has(line.productId)) issues.push({ field: `line-${idx}-product`, message: `Ligne ${idx + 1} — ce produit est déjà présent dans une autre ligne.` });
    else seenProducts.add(line.productId);

    const qty = Number(line.quantity);
    if (!line.quantity.trim()) issues.push({ field: `line-${idx}-quantity`, message: `Ligne ${idx + 1} — la quantité est obligatoire.` });
    else if (Number.isNaN(qty) || qty <= 0) issues.push({ field: `line-${idx}-quantity`, message: `Ligne ${idx + 1} — quantité invalide.` });

    const price = Number(line.unitPrice);
    if (!line.unitPrice.trim()) issues.push({ field: `line-${idx}-unitPrice`, message: `Ligne ${idx + 1} — le prix unitaire est obligatoire.` });
    else if (Number.isNaN(price) || price < 0) issues.push({ field: `line-${idx}-unitPrice`, message: `Ligne ${idx + 1} — prix invalide.` });
  });

  return issues;
};

export const buildPurchaseOrderFromDraft = (draft: DraftPurchaseOrder, products: StockProduct[], orderNumberIfNew: string): PurchaseOrder => ({
  id: draft.id,
  orderNumber: draft.orderNumber ?? orderNumberIfNew,
  supplierId: draft.supplierId,
  orderDate: draft.orderDate,
  expectedDate: draft.expectedDate || undefined,
  status: draft.status,
  notes: draft.notes.trim() || undefined,
  createdAt: draft.createdAt ?? new Date().toISOString(),
  createdBy: draft.createdBy,
  lines: draft.lines.map((l) => {
    const product = products.find((p) => p.id === l.productId);
    return {
      id: l.id,
      productId: l.productId,
      quantity: Number(l.quantity),
      unit: product?.unit ?? '',
      unitPrice: Number(l.unitPrice),
      receivedQuantity: 0,
    };
  }),
});

// --- Receptions -----------------------------------------------------------------------------

export interface PurchaseReceptionLine {
  lineId: string;
  quantityReceived: number;
}

export interface PurchaseReception {
  id: string;
  purchaseOrderId: string;
  receptionDate: string; // ISO date
  zone: StockZone;
  lines: PurchaseReceptionLine[];
  performedBy: string;
  createdAt: string;
}

// Builds the stock ledger entries a reception posts — reuses the SAME StockLedgerEntry shape and
// the SAME applyLedgerEntries() pipeline as every manual stock movement, so a purchase reception
// is not a second way to change stock, just another source of "Entrée" entries.
export const buildReceptionLedgerEntries = (order: PurchaseOrder, reception: PurchaseReception, products: StockProduct[]): StockLedgerEntry[] => {
  const entries: StockLedgerEntry[] = [];
  reception.lines.forEach((rl) => {
    if (rl.quantityReceived <= 0) return;
    const orderLine = order.lines.find((l) => l.id === rl.lineId);
    const product = orderLine ? products.find((p) => p.id === orderLine.productId) : undefined;
    if (!orderLine || !product) return;
    const before = getZoneQty(product, reception.zone);
    entries.push({
      id: generateStockId('led'),
      timestamp: new Date(reception.receptionDate).toISOString(),
      type: 'Entrée',
      productId: product.id,
      zone: reception.zone,
      quantityBefore: before,
      quantityDelta: rl.quantityReceived,
      quantityAfter: before + rl.quantityReceived,
      reason: `Réception achat ${order.orderNumber}`,
      performedBy: reception.performedBy,
      status: 'Confirmé',
      valueImpact: rl.quantityReceived * product.averageCost,
    });
  });
  return entries;
};

// Applies a validated reception's received quantities onto the order and derives its new status —
// "Reçue" once every line is fully received, "Partiellement reçue" otherwise. Never reverts to an
// earlier status: a cancelled order stays cancelled regardless of late receptions.
export const applyReceptionToOrder = (order: PurchaseOrder, reception: PurchaseReception): PurchaseOrder => {
  const receivedByLine = new Map(reception.lines.map((rl) => [rl.lineId, rl.quantityReceived]));
  const lines = order.lines.map((l) => {
    const added = receivedByLine.get(l.id);
    return added ? { ...l, receivedQuantity: l.receivedQuantity + added } : l;
  });
  const updated: PurchaseOrder = { ...order, lines };
  if (order.status === 'Annulée') return updated;
  const ratio = computeOrderReceivedRatio(updated);
  const status: PurchaseOrderStatus = ratio === 'full' ? 'Reçue' : ratio === 'partial' ? 'Partiellement reçue' : order.status;
  return { ...updated, status };
};

// --- Supplier invoices ----------------------------------------------------------------------

export type PurchasePaymentMethod = 'Espèces' | 'Carte bancaire' | 'Chèque' | 'Virement bancaire';
export const PURCHASE_PAYMENT_METHODS: PurchasePaymentMethod[] = ['Espèces', 'Carte bancaire', 'Chèque', 'Virement bancaire'];

export type InvoicePaymentStatus = 'Non payée' | 'Partiellement payée' | 'Payée';
export const INVOICE_PAYMENT_STATUSES: InvoicePaymentStatus[] = ['Non payée', 'Partiellement payée', 'Payée'];

export interface SupplierInvoice {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  purchaseOrderId?: string;
  invoiceDate: string;
  dueDate: string;
  amountHT: number;
  vatAmount: number;
  amountTTC: number;
  amountPaid: number;
  paymentMethod: PurchasePaymentMethod;
  createdAt: string;
}

// Payment status is always derived from the amounts — never stored/settable directly — so it can
// never drift out of sync with amountPaid.
export const computeInvoiceStatus = (invoice: SupplierInvoice): InvoicePaymentStatus => {
  if (invoice.amountPaid <= 0) return 'Non payée';
  if (invoice.amountPaid >= invoice.amountTTC) return 'Payée';
  return 'Partiellement payée';
};

export const isInvoiceDueSoon = (invoice: SupplierInvoice, referenceIso: string = todayIso(), thresholdDays = 7): boolean => {
  if (computeInvoiceStatus(invoice) === 'Payée') return false;
  const dueMs = new Date(invoice.dueDate).getTime();
  const refMs = new Date(referenceIso).getTime();
  if (Number.isNaN(dueMs) || Number.isNaN(refMs)) return false;
  const diffDays = (dueMs - refMs) / 86400000;
  return diffDays <= thresholdDays;
};

export const isInvoiceOverdue = (invoice: SupplierInvoice, referenceIso: string = todayIso()): boolean => {
  if (computeInvoiceStatus(invoice) === 'Payée') return false;
  return new Date(invoice.dueDate).getTime() < new Date(referenceIso).getTime();
};

// A facture can be linked to a purchase order or stand fully on its own (§5.3) — the draft always
// carries its own supplierId/purchaseOrderId rather than receiving them from a fixed context, so
// the SAME workflow serves both "créer depuis la commande" and "saisie manuelle" entry points.
export interface DraftSupplierInvoice {
  id: string;
  supplierId: string;
  purchaseOrderId: string; // '' = not linked to any commande
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amountHT: string;
  vatAmount: string;
  amountTTC: string;
  amountPaid: string;
  paymentMethod: PurchasePaymentMethod | '';
  createdAt: string | null;
}

export const createEmptyDraftInvoice = (opts?: { supplierId?: string; purchaseOrderId?: string; prefillTTC?: number }): DraftSupplierInvoice => {
  const ttc = opts?.prefillTTC ?? 0;
  const ht = ttc / 1.19;
  return {
    id: generatePurchaseId('inv'),
    supplierId: opts?.supplierId ?? '',
    purchaseOrderId: opts?.purchaseOrderId ?? '',
    invoiceNumber: '',
    invoiceDate: todayIso(),
    dueDate: todayIso(),
    amountHT: ttc > 0 ? ht.toFixed(2) : '',
    vatAmount: ttc > 0 ? (ttc - ht).toFixed(2) : '',
    amountTTC: ttc > 0 ? ttc.toFixed(2) : '',
    amountPaid: '',
    paymentMethod: '',
    createdAt: null,
  };
};

export const createDraftFromInvoice = (invoice: SupplierInvoice): DraftSupplierInvoice => ({
  id: invoice.id,
  supplierId: invoice.supplierId,
  purchaseOrderId: invoice.purchaseOrderId ?? '',
  invoiceNumber: invoice.invoiceNumber,
  invoiceDate: invoice.invoiceDate,
  dueDate: invoice.dueDate,
  amountHT: String(invoice.amountHT),
  vatAmount: String(invoice.vatAmount),
  amountTTC: String(invoice.amountTTC),
  amountPaid: String(invoice.amountPaid),
  paymentMethod: invoice.paymentMethod,
  createdAt: invoice.createdAt,
});

export interface InvoiceValidationIssue {
  field: string;
  message: string;
}

export const validateDraftInvoice = (draft: DraftSupplierInvoice, suppliers: Supplier[]): InvoiceValidationIssue[] => {
  const issues: InvoiceValidationIssue[] = [];

  if (!draft.supplierId) issues.push({ field: 'supplierId', message: 'Le fournisseur est obligatoire.' });
  else if (!suppliers.some((s) => s.id === draft.supplierId)) issues.push({ field: 'supplierId', message: 'Fournisseur invalide.' });

  if (!draft.invoiceNumber.trim()) issues.push({ field: 'invoiceNumber', message: 'Le numéro de facture est obligatoire.' });
  if (!draft.invoiceDate) issues.push({ field: 'invoiceDate', message: 'La date de facture est obligatoire.' });
  if (!draft.dueDate) issues.push({ field: 'dueDate', message: "L'échéance est obligatoire." });

  const ht = Number(draft.amountHT);
  if (!draft.amountHT.trim() || Number.isNaN(ht) || ht < 0) issues.push({ field: 'amountHT', message: 'Le montant HT est invalide.' });

  const vat = Number(draft.vatAmount);
  if (!draft.vatAmount.trim() || Number.isNaN(vat) || vat < 0) issues.push({ field: 'vatAmount', message: 'La TVA est invalide.' });

  const ttc = Number(draft.amountTTC);
  if (!draft.amountTTC.trim() || Number.isNaN(ttc) || ttc <= 0) issues.push({ field: 'amountTTC', message: 'Le montant TTC est invalide.' });

  const paid = Number(draft.amountPaid || '0');
  if (Number.isNaN(paid) || paid < 0) issues.push({ field: 'amountPaid', message: 'Le montant payé est invalide.' });
  else if (!Number.isNaN(ttc) && paid > ttc) issues.push({ field: 'amountPaid', message: 'Le montant payé ne peut pas dépasser le montant TTC.' });

  if (!draft.paymentMethod) issues.push({ field: 'paymentMethod', message: 'Le mode de paiement est obligatoire.' });

  return issues;
};

export const buildInvoiceFromDraft = (draft: DraftSupplierInvoice): SupplierInvoice => ({
  id: draft.id,
  invoiceNumber: draft.invoiceNumber.trim(),
  supplierId: draft.supplierId,
  purchaseOrderId: draft.purchaseOrderId || undefined,
  invoiceDate: draft.invoiceDate,
  dueDate: draft.dueDate,
  amountHT: Number(draft.amountHT),
  vatAmount: Number(draft.vatAmount),
  amountTTC: Number(draft.amountTTC),
  amountPaid: Number(draft.amountPaid || '0'),
  paymentMethod: draft.paymentMethod as PurchasePaymentMethod,
  createdAt: draft.createdAt ?? new Date().toISOString(),
});
