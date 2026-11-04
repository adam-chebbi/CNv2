import { parseDecimalCell } from './decimalInput';
import {
  StockProduct,
  StockZone,
  StockLedgerEntry,
  resolveStockProductByName,
  resolveStockZoneByName,
  generateStockId,
  getZoneQty,
} from './stockModel';
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
import { normalizeKey } from './textUtils';

export { MAX_IMPORT_FILE_SIZE_BYTES, MAX_IMPORT_ROWS, ACCEPTED_IMPORT_EXTENSIONS, ImportFileError };

// ---------------------------------------------------------------------------
// Column contract — one row = one product's physical count, for a specific zone, on the day of
// the count. The theoretical quantity is never read from the file — like the manual "Inventaires"
// page, it's always taken live from the current stock (getZoneQty), so the comparison is always
// against what the system believes *right now*, not a stale snapshot. Only rows with an actual
// discrepancy ever produce a stock movement — a row that matches exactly is still shown (as
// confirmation), but posts nothing.
// ---------------------------------------------------------------------------

export interface InventoryImportColumnDoc {
  key: string;
  label: string;
  required: boolean;
  description: string;
}

export const INVENTORY_IMPORT_COLUMNS: InventoryImportColumnDoc[] = [
  { key: 'produit', label: 'produit', required: true, description: 'Nom du produit de stock existant.' },
  { key: 'zone', label: 'zone', required: true, description: '"Réserve principale" ou "Dépôt" — la zone physiquement comptée.' },
  { key: 'stock_reel', label: 'stock_reel', required: true, description: 'Quantité réellement comptée dans cette zone.' },
  { key: 'choix', label: 'choix', required: false, description: '"Ajusté" (corrige le stock système, par défaut) ou "Conservé" (garde le stock théorique, écart tracé pour mémoire seulement).' },
  { key: 'commentaire', label: 'commentaire', required: false, description: 'Remarque libre sur cette ligne.' },
];

const REQUIRED_COLUMN_KEYS = INVENTORY_IMPORT_COLUMNS.filter((c) => c.required).map((c) => c.key);
const KNOWN_COLUMN_KEYS = new Set(INVENTORY_IMPORT_COLUMNS.map((c) => c.key));

export interface InventoryImportRowIssue {
  field: string;
  value: string;
  message: string;
}

export interface ImportedInventoryRowDraft {
  id: string;
  rowNumber: number;
  productId: string;
  productNameRaw: string;
  zone: StockZone | '';
  realQty: string;
  choice: 'Ajusté' | 'Conservé';
  comment: string;
  issues: InventoryImportRowIssue[];
}

export interface InventoryImportParseResult {
  rows: ImportedInventoryRowDraft[];
  unknownColumns: string[];
}

const parseInventoryImportRow = (
  get: (key: string) => string,
  rowNumber: number,
  products: StockProduct[]
): ImportedInventoryRowDraft => {
  const issues: InventoryImportRowIssue[] = [];

  const rawProduct = get('produit');
  const rawZone = get('zone');
  const rawReal = get('stock_reel');
  const rawChoice = get('choix');
  const rawComment = get('commentaire');

  const product = rawProduct ? resolveStockProductByName(rawProduct, products) : undefined;
  if (!rawProduct.trim()) issues.push({ field: 'produit', value: rawProduct, message: 'Le produit est obligatoire.' });
  else if (!product) issues.push({ field: 'produit', value: rawProduct, message: `Produit introuvable : « ${rawProduct} ».` });

  let zone: StockZone | '' = '';
  if (!rawZone.trim()) {
    issues.push({ field: 'zone', value: rawZone, message: 'La zone est obligatoire.' });
  } else {
    const z = resolveStockZoneByName(rawZone);
    if (!z) issues.push({ field: 'zone', value: rawZone, message: `Zone invalide : « ${rawZone} ». Utilisez "Réserve principale" ou "Dépôt".` });
    else zone = z;
  }

  if (!rawReal.trim()) {
    issues.push({ field: 'stock_reel', value: rawReal, message: 'Le stock réel est obligatoire.' });
  } else {
    const n = parseDecimalCell(rawReal);
    if (Number.isNaN(n) || n < 0) issues.push({ field: 'stock_reel', value: rawReal, message: 'Le stock réel doit être un nombre positif ou nul.' });
  }

  let choice: 'Ajusté' | 'Conservé' = 'Ajusté';
  if (rawChoice.trim()) {
    const key = normalizeKey(rawChoice);
    if (key === 'ajuste') choice = 'Ajusté';
    else if (key === 'conserve') choice = 'Conservé';
    else issues.push({ field: 'choix', value: rawChoice, message: `Valeur invalide : « ${rawChoice} ». Utilisez "Ajusté" ou "Conservé".` });
  }

  return {
    id: generateStockId('impinv'),
    rowNumber,
    productId: product?.id ?? '',
    productNameRaw: rawProduct,
    zone,
    realQty: rawReal.trim(),
    choice,
    comment: rawComment.trim(),
    issues,
  };
};

export const parseInventoryImportFile = async (file: File, products: StockProduct[]): Promise<InventoryImportParseResult> => {
  const sheet = await readSheetFromFile(file);
  const { indexMap, missingColumns, unknownColumns } = resolveColumns(sheet.headers, REQUIRED_COLUMN_KEYS, KNOWN_COLUMN_KEYS);
  if (missingColumns.length > 0) {
    throw new ImportFileError(`Colonne(s) obligatoire(s) manquante(s) : ${missingColumns.map((c) => `« ${c} »`).join(', ')}.`);
  }
  if (sheet.rows.length === 0) throw new ImportFileError('Le fichier ne contient aucune ligne de données à importer.');
  if (sheet.rows.length > MAX_IMPORT_ROWS) throw new ImportFileError(`Le fichier contient trop de lignes (${sheet.rows.length}). Maximum autorisé : ${MAX_IMPORT_ROWS}.`);

  const rows = sheet.rows.map((rawCells, i) => parseInventoryImportRow(buildRowGetter(indexMap, rawCells), i + 2, products));
  return { rows, unknownColumns };
};

export interface InventoryImportRowPreview {
  row: ImportedInventoryRowDraft;
  product: StockProduct;
  theoreticalQty: number;
  realQty: number;
  discrepancyQty: number;
  discrepancyValue: number;
}

// Theoretical quantity is always read live from `products` — never trusted from the file — so the
// comparison reflects the system's current state at the moment of import, exactly like the manual
// "Inventaires" page.
export const buildInventoryPreviewRows = (rows: ImportedInventoryRowDraft[], products: StockProduct[]): InventoryImportRowPreview[] =>
  rows
    .filter((r) => r.issues.length === 0 && r.productId && r.zone)
    .map((r) => {
      const product = products.find((p) => p.id === r.productId)!;
      const theoreticalQty = getZoneQty(product, r.zone as StockZone);
      const realQty = parseDecimalCell(r.realQty);
      const discrepancyQty = realQty - theoreticalQty;
      return { row: r, product, theoreticalQty, realQty, discrepancyQty, discrepancyValue: discrepancyQty * product.averageCost };
    });

export const buildLedgerEntriesFromInventoryImport = (
  previews: InventoryImportRowPreview[],
  performedBy: string
): StockLedgerEntry[] => {
  const now = new Date().toISOString();
  return previews
    .filter((p) => p.discrepancyQty !== 0)
    .map(({ row, product, theoreticalQty, realQty, discrepancyQty, discrepancyValue }) => {
      const zone = row.zone as StockZone;
      const delta = row.choice === 'Ajusté' ? discrepancyQty : 0;
      return {
        id: generateStockId('led'),
        timestamp: now,
        type: 'Inventaire',
        productId: product.id,
        zone,
        quantityBefore: theoreticalQty,
        quantityDelta: delta,
        quantityAfter: theoreticalQty + delta,
        reason: "Ajustement d'inventaire (import)",
        comment: row.comment || `Inventaire importé — ligne ${row.rowNumber}`,
        performedBy,
        status: 'Confirmé',
        valueImpact: row.choice === 'Ajusté' ? discrepancyValue : 0,
        theoreticalQty,
        realQty,
        discrepancyQty,
        discrepancyValue,
        inventoryChoice: row.choice,
        inventoryScope: `Import CSV — ${zone}`,
      };
    });
};

export const buildInventoryImportTemplateCsv = (): string => {
  const headerRow = INVENTORY_IMPORT_COLUMNS.map((c) => c.key);
  const exampleRows: string[][] = [
    ['Grains de café Arabica', 'Réserve principale', '7.5', 'Ajusté', 'Comptage mensuel'],
    ['Lait frais', 'Dépôt', '30', 'Conservé', ''],
  ];
  return buildCsvDocument([headerRow, ...exampleRows]);
};

export const downloadInventoryImportTemplateCsv = (): void => {
  downloadCsvDocument('template_import_inventaires_cafe_noir.csv', buildInventoryImportTemplateCsv());
};
