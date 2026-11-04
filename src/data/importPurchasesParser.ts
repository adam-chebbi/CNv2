import { parseDateFlexible, normalizeKey } from './textUtils';
import { StockProduct, resolveStockProductByName } from './stockModel';
import {
  Supplier,
  PurchaseOrder,
  DraftPurchaseOrder,
  DraftPurchaseLine,
  createEmptyDraftPurchaseOrder,
  createEmptyDraftPurchaseLine,
  validateDraftPurchaseOrder,
  buildPurchaseOrderFromDraft,
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
// Column contract — one row = one full purchase order (mirrors "one row = one
// ticket" in the sales import), shared by the template, the on-page docs and
// the parser itself.
// ---------------------------------------------------------------------------

export interface ImportColumnDoc {
  key: string;
  label: string;
  required: boolean;
  description: string;
}

export const IMPORT_COLUMNS: ImportColumnDoc[] = [
  { key: 'date', label: 'date', required: true, description: "Date de la commande au format AAAA-MM-JJ (ex: 2026-09-08) ou JJ/MM/AAAA." },
  { key: 'fournisseur', label: 'fournisseur', required: true, description: 'Nom exact du fournisseur déjà enregistré (ex: "Ben Yedder & Fils"). Insensible à la casse.' },
  { key: 'employe', label: 'employe', required: true, description: "Nom de l'employé ayant passé la commande (ex: Karim). Insensible à la casse." },
  {
    key: 'produits',
    label: 'produits',
    required: true,
    description:
      'Un ou plusieurs produits séparés par "|", au format "quantité x nom du produit @ prix unitaire" (ex: "50x Farine T55 @ 2.500|20x Sucre @ 1.800").',
  },
  { key: 'date_prevue', label: 'date_prevue', required: false, description: 'Date de livraison prévue, même format que "date".' },
  { key: 'notes', label: 'notes', required: false, description: 'Remarque libre sur la commande.' },
];

const REQUIRED_COLUMN_KEYS = IMPORT_COLUMNS.filter((c) => c.required).map((c) => c.key);
const KNOWN_COLUMN_KEYS = new Set(IMPORT_COLUMNS.map((c) => c.key));

// ---------------------------------------------------------------------------
// File-level result types
// ---------------------------------------------------------------------------

export interface ImportRowIssue {
  field: string;
  value: string;
  message: string;
}

export interface ImportLineHint {
  product?: string; // raw imported product name that couldn't be resolved
}

export interface ImportedOrderDraft {
  id: string;
  rowNumber: number; // matches the row number the user would see in Excel/a text editor (header = row 1)
  order: DraftPurchaseOrder;
  issues: ImportRowIssue[];
  // Raw imported text for line values that failed resolution, keyed by line id — used only to show
  // "valeur importée" hints in the correction UI; never touches the shared DraftPurchaseOrder model.
  lineHints: Record<string, ImportLineHint>;
}

export interface ImportParseResult {
  rows: ImportedOrderDraft[];
  unknownColumns: string[];
}

// ---------------------------------------------------------------------------
// Cell parsing helpers
// ---------------------------------------------------------------------------

const resolveEmployeeByName = (raw: string, employees: string[]): string | undefined => {
  const key = normalizeKey(raw);
  if (!key) return undefined;
  return employees.find((e) => normalizeKey(e) === key);
};

const parseProductSegments = (raw: string): string[] => {
  if (!raw || !raw.trim()) return [];
  return raw.split('|').map((s) => s.trim()).filter(Boolean);
};

// "<qty>x <nom du produit> @ <prix unitaire>" — quantity and unit price are required per line
// (unlike sales import, a purchase's price isn't looked up from a catalog: it's whatever was
// actually negotiated with the supplier for that delivery).
const PRODUCT_SEGMENT_PATTERN = /^(\d+(?:[.,]\d+)?)\s*x\s*(.+?)\s*@\s*(\d+(?:[.,]\d+)?)$/i;

const parseProductSegment = (segment: string): { qty: string; name: string; unitPrice: string } | null => {
  const match = segment.match(PRODUCT_SEGMENT_PATTERN);
  if (!match) return null;
  return { qty: match[1].replace(',', '.'), name: match[2].trim(), unitPrice: match[3].replace(',', '.') };
};

const parseImportRow = (
  get: (key: string) => string,
  rowNumber: number,
  suppliers: Supplier[],
  products: StockProduct[],
  employees: string[]
): ImportedOrderDraft => {
  const issues: ImportRowIssue[] = [];

  const rawDate = get('date');
  const rawSupplier = get('fournisseur');
  const rawEmployee = get('employe');
  const rawProductsCell = get('produits');
  const rawExpectedDate = get('date_prevue');
  const rawNotes = get('notes');

  const parsedDate = rawDate ? parseDateFlexible(rawDate) : null;
  if (!rawDate) {
    issues.push({ field: 'date', value: rawDate, message: 'La date est obligatoire.' });
  } else if (!parsedDate) {
    issues.push({ field: 'date', value: rawDate, message: `Date invalide : « ${rawDate} ». Utilisez AAAA-MM-JJ ou JJ/MM/AAAA.` });
  }

  let parsedExpectedDate: string | null = null;
  if (rawExpectedDate.trim()) {
    parsedExpectedDate = parseDateFlexible(rawExpectedDate);
    if (!parsedExpectedDate) {
      issues.push({ field: 'date_prevue', value: rawExpectedDate, message: `Date prévue invalide : « ${rawExpectedDate} ».` });
    }
  }

  const supplier = rawSupplier ? resolveSupplierByName(rawSupplier, suppliers) : undefined;
  if (!rawSupplier) {
    issues.push({ field: 'fournisseur', value: rawSupplier, message: 'Le fournisseur est obligatoire.' });
  } else if (!supplier) {
    issues.push({ field: 'fournisseur', value: rawSupplier, message: `Fournisseur introuvable : « ${rawSupplier} ».` });
  }

  const employee = rawEmployee ? resolveEmployeeByName(rawEmployee, employees) : undefined;
  if (!rawEmployee) {
    issues.push({ field: 'employe', value: rawEmployee, message: "L'employé est obligatoire." });
  } else if (!employee) {
    issues.push({ field: 'employe', value: rawEmployee, message: `Employé introuvable : « ${rawEmployee} ».` });
  }

  const productSegments = parseProductSegments(rawProductsCell);
  const lines: DraftPurchaseLine[] = [];
  const lineHints: Record<string, ImportLineHint> = {};

  if (productSegments.length === 0) {
    issues.push({ field: 'produits', value: rawProductsCell, message: 'Produits : au moins un article est obligatoire.' });
  }

  productSegments.forEach((segment) => {
    const parsed = parseProductSegment(segment);
    const line = createEmptyDraftPurchaseLine();

    if (!parsed) {
      issues.push({
        field: 'produits',
        value: segment,
        message: `Format invalide : « ${segment} ». Attendu : "quantité x produit @ prix unitaire".`,
      });
      lines.push(line);
      return;
    }

    const product = resolveStockProductByName(parsed.name, products);
    if (!product) {
      issues.push({ field: 'produits', value: parsed.name, message: `Produit introuvable : « ${parsed.name} ».` });
      lines.push({ ...line, quantity: parsed.qty, unitPrice: parsed.unitPrice });
      lineHints[line.id] = { product: parsed.name };
      return;
    }

    lines.push({ ...line, productId: product.id, quantity: parsed.qty, unitPrice: parsed.unitPrice });
  });

  const order: DraftPurchaseOrder = {
    ...createEmptyDraftPurchaseOrder(),
    id: generatePurchaseId('impPO'),
    supplierId: supplier?.id ?? '',
    orderDate: parsedDate ?? '',
    expectedDate: parsedExpectedDate ?? '',
    notes: rawNotes,
    createdBy: employee ?? '',
    lines: lines.length > 0 ? lines : [createEmptyDraftPurchaseLine()],
  };

  return {
    id: generatePurchaseId('impPOrow'),
    rowNumber,
    order,
    issues,
    lineHints,
  };
};

// ---------------------------------------------------------------------------
// Public entry point: parse a File (csv/xlsx/xls) into ImportedOrderDraft[]
// ---------------------------------------------------------------------------

export const parseImportFile = async (
  file: File,
  suppliers: Supplier[],
  products: StockProduct[],
  employees: string[]
): Promise<ImportParseResult> => {
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

  const rows = sheet.rows.map((rawCells, i) => parseImportRow(buildRowGetter(indexMap, rawCells), i + 2, suppliers, products, employees));

  return { rows, unknownColumns };
};

// ---------------------------------------------------------------------------
// Post-correction revalidation — once a row is edited through the same
// controlled inputs used by "Achats et acquisitions", every value is already
// canonical, so we reuse the exact same validator.
// ---------------------------------------------------------------------------

export const recomputeRowIssues = (row: ImportedOrderDraft, suppliers: Supplier[], products: StockProduct[]): ImportRowIssue[] =>
  validateDraftPurchaseOrder(row.order, suppliers, products).map((issue) => {
    let field = 'produits';
    if (issue.field === 'supplierId') field = 'fournisseur';
    else if (issue.field === 'orderDate') field = 'date';
    else if (issue.field === 'createdBy') field = 'employe';
    return { field, value: '', message: issue.message };
  });

// ---------------------------------------------------------------------------
// Building the final PurchaseOrder batch from a fully valid import — orderNumber
// is always re-assigned server-side, so an empty placeholder here is discarded.
// ---------------------------------------------------------------------------

export const buildPurchaseOrdersFromImportRows = (rows: ImportedOrderDraft[], products: StockProduct[]): PurchaseOrder[] =>
  rows.map((row) => buildPurchaseOrderFromDraft(row.order, products, ''));

// ---------------------------------------------------------------------------
// Downloadable CSV template
// ---------------------------------------------------------------------------

export const buildImportTemplateCsv = (suppliers: Supplier[], products: StockProduct[], employees: string[]): string => {
  const headerRow = IMPORT_COLUMNS.map((c) => c.key);

  const supplier1 = suppliers[0]?.name ?? 'Nom du fournisseur 1';
  const supplier2 = suppliers[1]?.name ?? suppliers[0]?.name ?? 'Nom du fournisseur 2';
  const product1 = products[0]?.name ?? 'Nom du produit 1';
  const product2 = products[1]?.name ?? 'Nom du produit 2';
  const employee1 = employees[0] ?? 'Employé 1';
  const employee2 = employees[1] ?? employees[0] ?? 'Employé 2';

  const exampleRows: string[][] = [
    ['2026-09-08', supplier1, employee1, `50x ${product1} @ 2.500|20x ${product2} @ 1.800`, '2026-09-12', 'Livraison hebdomadaire'],
    ['2026-09-08', supplier2, employee2, `30x ${product1} @ 2.450`, '', ''],
  ];

  return buildCsvDocument([headerRow, ...exampleRows]);
};

export const downloadImportTemplateCsv = (suppliers: Supplier[], products: StockProduct[], employees: string[]): void => {
  downloadCsvDocument('template_import_achats_cafe_noir.csv', buildImportTemplateCsv(suppliers, products, employees));
};
