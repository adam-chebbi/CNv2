import { parseDecimalCell } from './decimalInput';
import { normalizeKey, parseDateFlexible } from './textUtils';
import {
  StockProduct,
  StockUnit,
  StockZone,
  StockLot,
  StockLedgerEntry,
  generateStockId,
  generateAutoLotNumber,
  getZoneQty,
  resolveStockProductByName,
  resolveStockUnitByName,
  resolveStockCategoryByName,
  resolveStockZoneByName,
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

export { MAX_IMPORT_FILE_SIZE_BYTES, MAX_IMPORT_ROWS, ACCEPTED_IMPORT_EXTENSIONS, ImportFileError };

// ---------------------------------------------------------------------------
// Column contract — single source of truth for the template, on-page docs and the parser.
// The import never creates products, units or zones: every reference must already exist.
// ---------------------------------------------------------------------------

export interface StockImportColumnDoc {
  key: string;
  label: string;
  required: boolean;
  description: string;
}

export const STOCK_IMPORT_COLUMNS: StockImportColumnDoc[] = [
  { key: 'produit', label: 'produit', required: true, description: "Nom du produit stockable existant (ex: Grains Colombie Supremo). Insensible à la casse ; le produit doit déjà exister." },
  { key: 'categorie', label: 'categorie', required: false, description: 'Catégorie du produit, à titre de vérification uniquement — doit correspondre à la catégorie réelle du produit.' },
  { key: 'unite', label: 'unite', required: false, description: "Unité du produit, à titre de vérification uniquement — doit correspondre à l'unité réelle du produit." },
  { key: 'zone', label: 'zone', required: false, description: 'Zone concernée : "Réserve principale" ou "Dépôt" uniquement. Obligatoire si une quantité est renseignée.' },
  { key: 'quantite', label: 'quantite', required: false, description: "Quantité à ajouter au stock (crée un mouvement d'entrée). Laissez vide pour ne mettre à jour que le seuil ou la cible." },
  { key: 'seuil_minimum', label: 'seuil_minimum', required: false, description: 'Nouveau seuil minimum du produit. Laissez vide pour ne pas le modifier.' },
  { key: 'stock_cible', label: 'stock_cible', required: false, description: 'Nouveau stock cible du produit. Laissez vide pour ne pas le modifier.' },
  { key: 'lot', label: 'lot', required: false, description: 'Numéro de lot. Obligatoire si une quantité est renseignée pour un produit à gestion par lot.' },
  { key: 'date_peremption', label: 'date_peremption', required: false, description: 'Date de péremption (AAAA-MM-JJ ou JJ/MM/AAAA). Obligatoire si une quantité est renseignée pour un produit à gestion par lot.' },
];

const REQUIRED_COLUMN_KEYS = STOCK_IMPORT_COLUMNS.filter((c) => c.required).map((c) => c.key);
const KNOWN_COLUMN_KEYS = new Set(STOCK_IMPORT_COLUMNS.map((c) => c.key));

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface StockImportRowIssue {
  field: string;
  value: string;
  message: string;
}

export interface ImportedStockRowDraft {
  id: string;
  rowNumber: number;
  productId: string; // '' when unresolved
  productNameRaw: string;
  zone: StockZone | '';
  quantity: string; // '' = no movement for this row
  minThreshold: string; // '' = leave unchanged
  targetStock: string; // '' = leave unchanged
  lotNumber: string;
  expiryDate: string;
  issues: StockImportRowIssue[];
}

export interface StockImportParseResult {
  rows: ImportedStockRowDraft[];
  unknownColumns: string[];
}

// ---------------------------------------------------------------------------
// Row parsing / validation
// ---------------------------------------------------------------------------

const validateStockImportRow = (
  row: Pick<ImportedStockRowDraft, 'productId' | 'zone' | 'quantity' | 'minThreshold' | 'targetStock' | 'lotNumber' | 'expiryDate'>,
  products: StockProduct[],
  rowNumber: number
): StockImportRowIssue[] => {
  const issues: StockImportRowIssue[] = [];
  const product = products.find((p) => p.id === row.productId);
  const label = `Ligne ${rowNumber}`;

  if (!row.productId) {
    issues.push({ field: 'produit', value: '', message: `${label} — Produit : sélectionnez un produit.` });
  }

  const hasQuantity = row.quantity.trim() !== '';
  if (hasQuantity) {
    const qty = parseDecimalCell(row.quantity);
    if (Number.isNaN(qty) || qty <= 0) {
      issues.push({ field: 'quantite', value: row.quantity, message: `${label} — Quantité : doit être un nombre supérieur à 0.` });
    }
    if (!row.zone) {
      issues.push({ field: 'zone', value: '', message: `${label} — Zone : obligatoire lorsqu'une quantité est renseignée.` });
    }
    if (product?.lotTracked) {
      // Le numéro de lot reste optionnel même pour un produit à gestion par lot : laissé vide, un
      // numéro est généré automatiquement à l'import (voir generateAutoLotNumber côté application).
      if (!row.expiryDate.trim()) {
        issues.push({ field: 'date_peremption', value: row.expiryDate, message: `${label} — Péremption : obligatoire pour ce produit.` });
      } else if (!parseDateFlexible(row.expiryDate)) {
        issues.push({ field: 'date_peremption', value: row.expiryDate, message: `${label} — Péremption : date invalide « ${row.expiryDate} ».` });
      }
    }
  }

  if (row.minThreshold.trim() !== '') {
    const v = parseDecimalCell(row.minThreshold);
    if (Number.isNaN(v) || v < 0) issues.push({ field: 'seuil_minimum', value: row.minThreshold, message: `${label} — Seuil minimum : doit être un nombre positif ou nul.` });
  }
  if (row.targetStock.trim() !== '') {
    const v = parseDecimalCell(row.targetStock);
    if (Number.isNaN(v) || v < 0) issues.push({ field: 'stock_cible', value: row.targetStock, message: `${label} — Stock cible : doit être un nombre positif ou nul.` });
  }

  if (!hasQuantity && row.minThreshold.trim() === '' && row.targetStock.trim() === '') {
    issues.push({ field: 'quantite', value: '', message: `${label} : renseignez au moins une quantité, un seuil minimum ou un stock cible.` });
  }

  return issues;
};

const parseStockImportRow = (
  get: (key: string) => string,
  rowNumber: number,
  products: StockProduct[],
  units: StockUnit[]
): ImportedStockRowDraft => {
  const issues: StockImportRowIssue[] = [];

  const rawProduct = get('produit');
  const rawCategory = get('categorie');
  const rawUnit = get('unite');
  const rawZone = get('zone');
  const rawQuantity = get('quantite');
  const rawMinThreshold = get('seuil_minimum');
  const rawTargetStock = get('stock_cible');
  const rawLot = get('lot');
  const rawExpiry = get('date_peremption');

  const product = rawProduct ? resolveStockProductByName(rawProduct, products) : undefined;
  if (!rawProduct) {
    issues.push({ field: 'produit', value: rawProduct, message: 'Le produit est obligatoire.' });
  } else if (!product) {
    issues.push({ field: 'produit', value: rawProduct, message: `Produit introuvable : « ${rawProduct} ».` });
  }

  if (rawCategory) {
    const cat = resolveStockCategoryByName(rawCategory);
    if (!cat) {
      issues.push({ field: 'categorie', value: rawCategory, message: `Catégorie invalide : « ${rawCategory} ».` });
    } else if (product && normalizeKey(cat) !== normalizeKey(product.category)) {
      issues.push({
        field: 'categorie',
        value: rawCategory,
        message: `La catégorie « ${rawCategory} » ne correspond pas au produit « ${product.name} » (catégorie réelle : ${product.category}).`,
      });
    }
  }

  if (rawUnit) {
    const unit = resolveStockUnitByName(rawUnit, units);
    if (!unit) {
      issues.push({ field: 'unite', value: rawUnit, message: `Unité introuvable : « ${rawUnit} ».` });
    } else if (product && normalizeKey(unit.name) !== normalizeKey(product.unit)) {
      issues.push({
        field: 'unite',
        value: rawUnit,
        message: `L'unité « ${rawUnit} » ne correspond pas au produit « ${product.name} » (unité réelle : ${product.unit}).`,
      });
    }
  }

  let zone: StockZone | undefined;
  if (rawZone) {
    zone = resolveStockZoneByName(rawZone);
    if (!zone) {
      issues.push({
        field: 'zone',
        value: rawZone,
        message: `Zone invalide : « ${rawZone} ». Zones autorisées : "Réserve principale", "Dépôt".`,
      });
    }
  }

  const parsedExpiry = rawExpiry ? parseDateFlexible(rawExpiry) : null;

  const draft = {
    productId: product?.id ?? '',
    zone: zone ?? ('' as StockZone | ''),
    quantity: rawQuantity.trim(),
    minThreshold: rawMinThreshold.trim(),
    targetStock: rawTargetStock.trim(),
    lotNumber: rawLot.trim(),
    expiryDate: parsedExpiry ?? rawExpiry.trim(),
  };

  const rowLevelIssues = validateStockImportRow(draft, products, rowNumber);

  // Merge: field-resolution issues found above (produit/categorie/unite/zone) come first,
  // followed by the structural checks (quantities, lot requirements) from validateStockImportRow.
  return {
    id: generateStockId('simprow'),
    rowNumber,
    productNameRaw: rawProduct,
    ...draft,
    issues: [...issues, ...rowLevelIssues],
  };
};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export const parseStockImportFile = async (
  file: File,
  products: StockProduct[],
  units: StockUnit[]
): Promise<StockImportParseResult> => {
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

  const rows = sheet.rows.map((rawCells, i) => parseStockImportRow(buildRowGetter(indexMap, rawCells), i + 2, products, units));

  return { rows, unknownColumns };
};

// Post-correction revalidation: once a row is edited through controlled inputs (product select,
// zone buttons, number inputs), every value is already canonical — re-run only the structural
// checks, no more free-text resolution needed.
export const recomputeStockRowIssues = (row: ImportedStockRowDraft, products: StockProduct[]): StockImportRowIssue[] =>
  validateStockImportRow(row, products, row.rowNumber);

// ---------------------------------------------------------------------------
// Building the operations to post from a fully valid import
// ---------------------------------------------------------------------------

export interface StockImportOperations {
  ledgerEntries: StockLedgerEntry[];
  lotUpserts: StockLot[];
  productUpdates: Array<{ id: string; minThreshold?: number; targetStock?: number }>;
}

export const buildStockOperationsFromRows = (
  rows: ImportedStockRowDraft[],
  products: StockProduct[],
  performedBy: string
): StockImportOperations => {
  const now = new Date().toISOString();
  const ledgerEntries: StockLedgerEntry[] = [];
  const lotUpserts: StockLot[] = [];
  const productUpdates: Array<{ id: string; minThreshold?: number; targetStock?: number }> = [];

  rows.forEach((row) => {
    const product = products.find((p) => p.id === row.productId);
    if (!product) return;

    if (row.quantity.trim() !== '' && row.zone) {
      const qty = parseDecimalCell(row.quantity);
      const before = getZoneQty(product, row.zone);
      let lotId: string | undefined;
      let lotNumberUsed: string | undefined;
      if (product.lotTracked) {
        const lotNumber = row.lotNumber.trim() || generateAutoLotNumber();
        const newLot: StockLot = {
          id: generateStockId('lot'),
          productId: product.id,
          lotNumber,
          zone: row.zone,
          quantity: qty,
          expiryDate: row.expiryDate,
          receivedAt: now.slice(0, 10),
        };
        lotUpserts.push(newLot);
        lotId = newLot.id;
        lotNumberUsed = lotNumber;
      }
      ledgerEntries.push({
        id: generateStockId('led'),
        timestamp: now,
        type: 'Entrée',
        productId: product.id,
        zone: row.zone,
        quantityBefore: before,
        quantityDelta: qty,
        quantityAfter: before + qty,
        reason: 'Import Excel/CSV',
        comment: `Ligne ${row.rowNumber} du fichier importé`,
        lotId,
        lotNumber: lotNumberUsed,
        expiryDate: product.lotTracked ? row.expiryDate : undefined,
        performedBy,
        status: 'Confirmé',
        valueImpact: qty * product.averageCost,
      });
    }

    const minThreshold = row.minThreshold.trim() !== '' ? parseDecimalCell(row.minThreshold) : undefined;
    const targetStock = row.targetStock.trim() !== '' ? parseDecimalCell(row.targetStock) : undefined;
    if (minThreshold !== undefined || targetStock !== undefined) {
      productUpdates.push({ id: product.id, minThreshold, targetStock });
    }
  });

  return { ledgerEntries, lotUpserts, productUpdates };
};

// ---------------------------------------------------------------------------
// Downloadable CSV template
// ---------------------------------------------------------------------------

export const buildStockImportTemplateCsv = (products: StockProduct[]): string => {
  const headerRow = STOCK_IMPORT_COLUMNS.map((c) => c.key);
  const sample1 = products.find((p) => p.id === 'sp-2'); // Grains Colombie Supremo (lot-tracked)
  const sample2 = products.find((p) => p.id === 'sp-11'); // Sucre en Poudre (not lot-tracked)
  const sample3 = products.find((p) => p.id === 'sp-15'); // Gobelets (threshold-only update)

  const exampleRows: string[][] = [
    [sample1?.name ?? '', sample1?.category ?? '', sample1?.unit ?? '', 'Réserve principale', '10', '', '', 'COL-2026-030', '2027-03-01'],
    [sample2?.name ?? '', sample2?.category ?? '', sample2?.unit ?? '', 'Dépôt', '25', '15', '50', '', ''],
    [sample3?.name ?? '', sample3?.category ?? '', sample3?.unit ?? '', '', '', '300', '1200', '', ''],
  ];

  return buildCsvDocument([headerRow, ...exampleRows]);
};

export const downloadStockImportTemplateCsv = (products: StockProduct[]): void => {
  downloadCsvDocument('template_import_stock_cafe_noir.csv', buildStockImportTemplateCsv(products));
};
