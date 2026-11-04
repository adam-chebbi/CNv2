import { parseDecimalCell } from './decimalInput';
import { normalizeKey } from './textUtils';
import {
  StockProduct,
  StockUnit,
  StockCategory,
  STOCK_CATEGORIES,
  resolveStockProductByName,
  resolveStockUnitByName,
  resolveStockCategoryByName,
  generateStockId,
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
// Column contract — one row = one NEW stock ingredient (StockProduct) to create. This is the
// counterpart to importStockParser.ts, which only ever adjusts quantities/thresholds for
// ingredients that already exist: that one never creates a product, this one never touches
// quantities for an existing one — a name that already exists is rejected here, pointing the user
// at the "Mouvements de stock" import instead.
// ---------------------------------------------------------------------------

export interface IngredientImportColumnDoc {
  key: string;
  label: string;
  required: boolean;
  description: string;
}

export const INGREDIENT_IMPORT_COLUMNS: IngredientImportColumnDoc[] = [
  { key: 'nom', label: 'nom', required: true, description: "Nom du nouvel ingrédient. Doit être unique — s'il existe déjà, utilisez l'import « Mouvements de stock » à la place." },
  { key: 'categorie', label: 'categorie', required: true, description: `Une des catégories existantes : ${STOCK_CATEGORIES.join(', ')}.` },
  { key: 'unite', label: 'unite', required: true, description: 'Unité de stock existante (ex: kg, g, litres, ml, unité).' },
  { key: 'sku', label: 'sku', required: false, description: 'Référence interne. Laissez vide pour la générer automatiquement à partir du nom.' },
  { key: 'seuil_minimum', label: 'seuil_minimum', required: false, description: 'Seuil minimum avant alerte de rupture. Défaut : 0.' },
  { key: 'stock_cible', label: 'stock_cible', required: false, description: 'Niveau de stock cible. Défaut : 0.' },
  { key: 'gestion_par_lot', label: 'gestion_par_lot', required: false, description: '"Oui" ou "Non" — suivi par numéro de lot et date de péremption. Défaut : Non.' },
  { key: 'cout_moyen', label: 'cout_moyen', required: true, description: "Coût moyen d'achat par unité de stock (DT), utilisé pour le coût des fiches techniques." },
  { key: 'stock_initial_reserve', label: 'stock_initial_reserve', required: false, description: 'Quantité initiale en Réserve principale. Défaut : 0.' },
  { key: 'stock_initial_depot', label: 'stock_initial_depot', required: false, description: 'Quantité initiale en Dépôt. Défaut : 0.' },
];

const REQUIRED_COLUMN_KEYS = INGREDIENT_IMPORT_COLUMNS.filter((c) => c.required).map((c) => c.key);
const KNOWN_COLUMN_KEYS = new Set(INGREDIENT_IMPORT_COLUMNS.map((c) => c.key));

export interface IngredientImportRowIssue {
  field: string;
  value: string;
  message: string;
}

export interface ImportedIngredientRowDraft {
  id: string;
  rowNumber: number;
  name: string;
  category: StockCategory | '';
  unit: string;
  sku: string;
  minThreshold: string;
  targetStock: string;
  lotTracked: boolean;
  // Only used by the manual "Ajouter un ingrédient" form (Inventaires page) — never set by the
  // Excel/CSV import, which has no lot-number column. Both stay blank/optional: leaving lotNumber
  // empty simply means the initial stock isn't tied to any specific lot, same as any other product.
  lotNumber: string;
  expiryDate: string;
  averageCost: string;
  reserveQty: string;
  depotQty: string;
  issues: IngredientImportRowIssue[];
}

export interface IngredientImportParseResult {
  rows: ImportedIngredientRowDraft[];
  unknownColumns: string[];
}

// Same "STOCK-<slug>" shape as no existing convention forces a specific prefix — kept short and
// legible so the auto-generated SKU is still meaningful when the column is left blank.
const slugifySku = (name: string): string =>
  `ING-${normalizeKey(name).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 24) || 'NOUVEAU'}`;

// One blank row for the manual "Ajouter un ingrédient" form (Inventaires page) — same row shape as
// a parsed import line, just empty, so it can reuse recomputeIngredientRowIssues and
// buildStockProductsFromImportRows unchanged. rowNumber only matters for file-import error
// messages ("Ligne N"), so it's irrelevant here and left at 0.
export const createEmptyIngredientRow = (): ImportedIngredientRowDraft => ({
  id: generateStockId('newingr'),
  rowNumber: 0,
  name: '',
  category: '',
  unit: '',
  sku: '',
  minThreshold: '0',
  targetStock: '0',
  lotTracked: false,
  lotNumber: '',
  expiryDate: '',
  averageCost: '',
  reserveQty: '0',
  depotQty: '0',
  issues: [],
});

const parseIngredientImportRow = (
  get: (key: string) => string,
  rowNumber: number,
  existingProducts: StockProduct[],
  units: StockUnit[],
  rowsSoFar: ImportedIngredientRowDraft[]
): ImportedIngredientRowDraft => {
  const issues: IngredientImportRowIssue[] = [];

  const rawName = get('nom');
  const rawCategory = get('categorie');
  const rawUnit = get('unite');
  const rawSku = get('sku');
  const rawMinThreshold = get('seuil_minimum');
  const rawTargetStock = get('stock_cible');
  const rawLotTracked = get('gestion_par_lot');
  const rawAverageCost = get('cout_moyen');
  const rawReserveQty = get('stock_initial_reserve');
  const rawDepotQty = get('stock_initial_depot');

  if (!rawName.trim()) {
    issues.push({ field: 'nom', value: rawName, message: 'Le nom est obligatoire.' });
  } else {
    if (resolveStockProductByName(rawName, existingProducts)) {
      issues.push({ field: 'nom', value: rawName, message: `Un ingrédient « ${rawName} » existe déjà — utilisez l'import « Mouvements de stock » pour le mettre à jour.` });
    }
    if (rowsSoFar.some((r) => normalizeKey(r.name) === normalizeKey(rawName))) {
      issues.push({ field: 'nom', value: rawName, message: `« ${rawName} » apparaît plusieurs fois dans ce fichier.` });
    }
  }

  let category: StockCategory | '' = '';
  if (!rawCategory.trim()) {
    issues.push({ field: 'categorie', value: rawCategory, message: 'La catégorie est obligatoire.' });
  } else {
    const cat = resolveStockCategoryByName(rawCategory);
    if (!cat) issues.push({ field: 'categorie', value: rawCategory, message: `Catégorie invalide : « ${rawCategory} ». Catégories autorisées : ${STOCK_CATEGORIES.join(', ')}.` });
    else category = cat;
  }

  let unit = '';
  if (!rawUnit.trim()) {
    issues.push({ field: 'unite', value: rawUnit, message: "L'unité est obligatoire." });
  } else {
    const u = resolveStockUnitByName(rawUnit, units);
    if (!u) issues.push({ field: 'unite', value: rawUnit, message: `Unité introuvable : « ${rawUnit} ». Créez-la dans Stock → Unités avant d'importer.` });
    else unit = u.name;
  }

  let lotTracked = false;
  if (rawLotTracked.trim()) {
    const key = normalizeKey(rawLotTracked);
    if (key === 'oui') lotTracked = true;
    else if (key === 'non') lotTracked = false;
    else issues.push({ field: 'gestion_par_lot', value: rawLotTracked, message: `Valeur invalide : « ${rawLotTracked} ». Utilisez "Oui" ou "Non".` });
  }

  const numericField = (raw: string, field: string, label: string, required: boolean): void => {
    if (!raw.trim()) {
      if (required) issues.push({ field, value: raw, message: `${label} est obligatoire.` });
      return;
    }
    const n = parseDecimalCell(raw);
    if (Number.isNaN(n) || n < 0) issues.push({ field, value: raw, message: `${label} doit être un nombre positif ou nul.` });
  };
  numericField(rawMinThreshold, 'seuil_minimum', 'Le seuil minimum', false);
  numericField(rawTargetStock, 'stock_cible', 'Le stock cible', false);
  numericField(rawAverageCost, 'cout_moyen', 'Le coût moyen', true);
  numericField(rawReserveQty, 'stock_initial_reserve', 'Le stock initial (Réserve)', false);
  numericField(rawDepotQty, 'stock_initial_depot', 'Le stock initial (Dépôt)', false);

  return {
    id: generateStockId('impingr'),
    rowNumber,
    name: rawName.trim(),
    category,
    unit,
    sku: rawSku.trim(),
    minThreshold: rawMinThreshold.trim() || '0',
    targetStock: rawTargetStock.trim() || '0',
    lotTracked,
    lotNumber: '',
    expiryDate: '',
    averageCost: rawAverageCost.trim(),
    reserveQty: rawReserveQty.trim() || '0',
    depotQty: rawDepotQty.trim() || '0',
    issues,
  };
};

export const parseIngredientImportFile = async (
  file: File,
  existingProducts: StockProduct[],
  units: StockUnit[]
): Promise<IngredientImportParseResult> => {
  const sheet = await readSheetFromFile(file);
  const { indexMap, missingColumns, unknownColumns } = resolveColumns(sheet.headers, REQUIRED_COLUMN_KEYS, KNOWN_COLUMN_KEYS);
  if (missingColumns.length > 0) {
    throw new ImportFileError(`Colonne(s) obligatoire(s) manquante(s) : ${missingColumns.map((c) => `« ${c} »`).join(', ')}.`);
  }
  if (sheet.rows.length === 0) throw new ImportFileError('Le fichier ne contient aucune ligne de données à importer.');
  if (sheet.rows.length > MAX_IMPORT_ROWS) throw new ImportFileError(`Le fichier contient trop de lignes (${sheet.rows.length}). Maximum autorisé : ${MAX_IMPORT_ROWS}.`);

  const rows: ImportedIngredientRowDraft[] = [];
  sheet.rows.forEach((rawCells, i) => {
    rows.push(parseIngredientImportRow(buildRowGetter(indexMap, rawCells), i + 2, existingProducts, units, rows));
  });

  return { rows, unknownColumns };
};

export const recomputeIngredientRowIssues = (
  row: ImportedIngredientRowDraft,
  existingProducts: StockProduct[],
  allRows: ImportedIngredientRowDraft[]
): IngredientImportRowIssue[] => {
  const issues: IngredientImportRowIssue[] = [];
  if (!row.name.trim()) {
    issues.push({ field: 'nom', value: '', message: 'Le nom est obligatoire.' });
  } else {
    if (resolveStockProductByName(row.name, existingProducts)) {
      issues.push({ field: 'nom', value: row.name, message: `Un ingrédient « ${row.name} » existe déjà.` });
    }
    if (allRows.some((r) => r.id !== row.id && normalizeKey(r.name) === normalizeKey(row.name))) {
      issues.push({ field: 'nom', value: row.name, message: `« ${row.name} » apparaît plusieurs fois dans ce fichier.` });
    }
  }
  if (!row.category) issues.push({ field: 'categorie', value: '', message: 'La catégorie est obligatoire.' });
  if (!row.unit) issues.push({ field: 'unite', value: '', message: "L'unité est obligatoire." });
  const cost = parseDecimalCell(row.averageCost);
  if (!row.averageCost.trim() || Number.isNaN(cost) || cost < 0) {
    issues.push({ field: 'cout_moyen', value: row.averageCost, message: 'Le coût moyen doit être un nombre positif ou nul.' });
  }
  // A lot number is always optional (leaving it blank just means this initial stock isn't tied to
  // any specific lot) — but a lot record needs an expiry date to mean anything in Lots &
  // péremptions, so it's only required once a lot number is actually given, same rule as receiving
  // stock from Mouvements.
  if (row.lotNumber.trim() && !row.expiryDate.trim()) {
    issues.push({ field: 'expiryDate', value: row.expiryDate, message: 'La date de péremption est obligatoire pour créer ce lot.' });
  }
  return issues;
};

export const buildStockProductsFromImportRows = (rows: ImportedIngredientRowDraft[]): Omit<StockProduct, 'id'>[] =>
  rows.map((row) => ({
    name: row.name,
    sku: row.sku || slugifySku(row.name),
    category: row.category as StockCategory,
    unit: row.unit,
    minThreshold: parseDecimalCell(row.minThreshold) || 0,
    targetStock: parseDecimalCell(row.targetStock) || 0,
    lotTracked: row.lotTracked,
    averageCost: parseDecimalCell(row.averageCost) || 0,
    reserveQty: parseDecimalCell(row.reserveQty) || 0,
    depotQty: parseDecimalCell(row.depotQty) || 0,
  }));

export const buildIngredientImportTemplateCsv = (): string => {
  const headerRow = INGREDIENT_IMPORT_COLUMNS.map((c) => c.key);
  const exampleRows: string[][] = [
    ['Café Ben Yedder', 'Café & Boissons', 'kg', '', '5', '20', 'Oui', '45', '8', '4'],
    ['Lait Frais', 'Produits laitiers', 'litres', '', '20', '80', 'Non', '1.9', '18', '30'],
    ['Gobelets carton 8oz', 'Emballages & Consommables', 'unité', '', '500', '3000', 'Non', '0.08', '1500', '2000'],
  ];
  return buildCsvDocument([headerRow, ...exampleRows]);
};

export const downloadIngredientImportTemplateCsv = (): void => {
  downloadCsvDocument('template_import_ingredients_cafe_noir.csv', buildIngredientImportTemplateCsv());
};
