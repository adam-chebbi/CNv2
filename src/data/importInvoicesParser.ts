import { parseDateFlexible, normalizeKey } from './textUtils';
import {
  Supplier,
  PurchaseOrder,
  DraftSupplierInvoice,
  SupplierInvoice,
  PURCHASE_PAYMENT_METHODS,
  PurchasePaymentMethod,
  createEmptyDraftInvoice,
  validateDraftInvoice,
  buildInvoiceFromDraft,
  resolveSupplierByName,
  generatePurchaseId,
} from './purchasesModel';
import {
  MAX_IMPORT_FILE_SIZE_BYTES,
  MAX_IMPORT_ROWS,
  ACCEPTED_IMPORT_EXTENSIONS,
  ImportFileError,
  readSheetFromFile,
  resolveColumns,
  buildRowGetter,
  buildCsvDocument,
  downloadCsvDocument,
} from './fileImportUtils';

export { MAX_IMPORT_FILE_SIZE_BYTES, MAX_IMPORT_ROWS, ACCEPTED_IMPORT_EXTENSIONS, ImportFileError };

// ---------------------------------------------------------------------------
// Column contract — one row = one facture fournisseur.
// ---------------------------------------------------------------------------

export interface ImportColumnDoc {
  key: string;
  label: string;
  required: boolean;
  description: string;
}

export const IMPORT_COLUMNS: ImportColumnDoc[] = [
  { key: 'fournisseur', label: 'fournisseur', required: true, description: 'Nom exact du fournisseur déjà enregistré.' },
  { key: 'numero_facture', label: 'numero_facture', required: true, description: 'Numéro de la facture.' },
  { key: 'date_facture', label: 'date_facture', required: true, description: 'Date de la facture, AAAA-MM-JJ ou JJ/MM/AAAA.' },
  { key: 'echeance', label: 'echeance', required: true, description: "Date d'échéance de paiement, même format que date_facture." },
  { key: 'montant_ht', label: 'montant_ht', required: true, description: 'Montant hors taxes.' },
  { key: 'tva', label: 'tva', required: true, description: 'Montant de la TVA.' },
  { key: 'montant_ttc', label: 'montant_ttc', required: true, description: 'Montant toutes taxes comprises.' },
  { key: 'montant_paye', label: 'montant_paye', required: false, description: 'Montant déjà payé (0 par défaut).' },
  { key: 'mode_paiement', label: 'mode_paiement', required: true, description: `Valeurs acceptées : ${PURCHASE_PAYMENT_METHODS.map((m) => `"${m}"`).join(', ')}.` },
  { key: 'commande', label: 'commande', required: false, description: "Numéro d'une commande d'achat existante à laquelle rattacher la facture (ex: PO-2026-0001)." },
];

const REQUIRED_COLUMN_KEYS = IMPORT_COLUMNS.filter((c) => c.required).map((c) => c.key);
const KNOWN_COLUMN_KEYS = new Set(IMPORT_COLUMNS.map((c) => c.key));

export interface ImportRowIssue {
  field: string;
  value: string;
  message: string;
}

export interface ImportedInvoiceDraft {
  id: string;
  rowNumber: number;
  draft: DraftSupplierInvoice;
  issues: ImportRowIssue[];
  supplierHint?: string; // raw supplier text when it couldn't be resolved
  orderHint?: string; // raw order number when it couldn't be resolved
}

export interface ImportParseResult {
  rows: ImportedInvoiceDraft[];
  unknownColumns: string[];
}

const resolvePaymentMethod = (raw: string): PurchasePaymentMethod | undefined => {
  const key = normalizeKey(raw);
  return PURCHASE_PAYMENT_METHODS.find((m) => normalizeKey(m) === key);
};

const resolveOrderByNumber = (raw: string, orders: PurchaseOrder[]): PurchaseOrder | undefined => {
  const key = normalizeKey(raw);
  if (!key) return undefined;
  return orders.find((o) => normalizeKey(o.orderNumber) === key);
};

const parseImportRow = (
  get: (key: string) => string,
  rowNumber: number,
  suppliers: Supplier[],
  orders: PurchaseOrder[]
): ImportedInvoiceDraft => {
  const rawSupplier = get('fournisseur');
  const rawOrder = get('commande');
  const rawDate = get('date_facture');
  const rawDue = get('echeance');
  const rawPayment = get('mode_paiement');

  const supplier = rawSupplier ? resolveSupplierByName(rawSupplier, suppliers) : undefined;
  const order = rawOrder.trim() ? resolveOrderByNumber(rawOrder, orders) : undefined;
  const parsedDate = rawDate ? parseDateFlexible(rawDate) : null;
  const parsedDue = rawDue ? parseDateFlexible(rawDue) : null;
  const paymentMethod = rawPayment ? resolvePaymentMethod(rawPayment) : undefined;

  const draft: DraftSupplierInvoice = {
    ...createEmptyDraftInvoice(),
    id: generatePurchaseId('impInv'),
    supplierId: supplier?.id ?? '',
    purchaseOrderId: order?.id ?? '',
    invoiceNumber: get('numero_facture'),
    invoiceDate: parsedDate ?? '',
    dueDate: parsedDue ?? '',
    amountHT: get('montant_ht').replace(',', '.'),
    vatAmount: get('tva').replace(',', '.'),
    amountTTC: get('montant_ttc').replace(',', '.'),
    amountPaid: get('montant_paye').replace(',', '.') || '0',
    paymentMethod: paymentMethod ?? '',
  };

  const issues: ImportRowIssue[] = validateDraftInvoice(draft, suppliers).map((i) => ({ field: i.field, value: '', message: i.message }));
  if (rawSupplier && !supplier) {
    issues.unshift({ field: 'supplierId', value: rawSupplier, message: `Fournisseur introuvable : « ${rawSupplier} ».` });
  }
  if (rawOrder.trim() && !order) {
    issues.push({ field: 'purchaseOrderId', value: rawOrder, message: `Commande introuvable : « ${rawOrder} ».` });
  }
  if (rawDate && !parsedDate) {
    issues.push({ field: 'invoiceDate', value: rawDate, message: `Date invalide : « ${rawDate} ».` });
  }
  if (rawDue && !parsedDue) {
    issues.push({ field: 'dueDate', value: rawDue, message: `Date d'échéance invalide : « ${rawDue} ».` });
  }
  if (rawPayment && !paymentMethod) {
    issues.push({ field: 'paymentMethod', value: rawPayment, message: `Mode de paiement invalide : « ${rawPayment} ».` });
  }

  return {
    id: generatePurchaseId('impInvrow'),
    rowNumber,
    draft,
    issues,
    supplierHint: rawSupplier && !supplier ? rawSupplier : undefined,
    orderHint: rawOrder.trim() && !order ? rawOrder : undefined,
  };
};

export const parseImportFile = async (file: File, suppliers: Supplier[], orders: PurchaseOrder[]): Promise<ImportParseResult> => {
  const sheet = await readSheetFromFile(file);

  const { indexMap, missingColumns, unknownColumns } = resolveColumns(sheet.headers, REQUIRED_COLUMN_KEYS, KNOWN_COLUMN_KEYS);
  if (missingColumns.length > 0) {
    throw new ImportFileError(`Colonne(s) obligatoire(s) manquante(s) : ${missingColumns.map((c) => `« ${c} »`).join(', ')}.`);
  }
  if (sheet.rows.length === 0) {
    throw new ImportFileError('Le fichier ne contient aucune ligne de données à importer.');
  }
  if (sheet.rows.length > MAX_IMPORT_ROWS) {
    throw new ImportFileError(`Le fichier contient trop de lignes (${sheet.rows.length}). Maximum autorisé : ${MAX_IMPORT_ROWS}.`);
  }

  const rows = sheet.rows.map((rawCells, i) => parseImportRow(buildRowGetter(indexMap, rawCells), i + 2, suppliers, orders));
  return { rows, unknownColumns };
};

export const recomputeRowIssues = (row: ImportedInvoiceDraft, suppliers: Supplier[]): ImportRowIssue[] =>
  validateDraftInvoice(row.draft, suppliers).map((i) => ({ field: i.field, value: '', message: i.message }));

export const buildInvoicesFromImportRows = (rows: ImportedInvoiceDraft[]): SupplierInvoice[] => rows.map((r) => buildInvoiceFromDraft(r.draft));

export const buildImportTemplateCsv = (suppliers: Supplier[]): string => {
  const headerRow = IMPORT_COLUMNS.map((c) => c.key);
  const supplier1 = suppliers[0]?.name ?? 'Nom du fournisseur';
  const exampleRows: string[][] = [
    [supplier1, 'FAC-2026-001', '2026-09-08', '2026-10-08', '1000.000', '190.000', '1190.000', '0', 'Virement bancaire', ''],
  ];
  return buildCsvDocument([headerRow, ...exampleRows]);
};

export const downloadImportTemplateCsv = (suppliers: Supplier[]): void => {
  downloadCsvDocument('template_import_factures_cafe_noir.csv', buildImportTemplateCsv(suppliers));
};
