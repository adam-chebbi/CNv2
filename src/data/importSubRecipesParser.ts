import { normalizeKey } from './textUtils';
import { StockProduct, StockUnit, resolveStockUnitByName, areUnitsCompatible } from './stockModel';
import { RecipeLine } from './manualSalesCatalog';
import { SubRecipe, resolveSubRecipeByName, detectCircularReference, generateProductId } from './productsModel';
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
// Column contract — one row = one new SubRecipe. Reuses the exact same component grammar as the
// products import's fiche_technique column ("Ingrédient:Quantité:Unité" /
// "SOUSRECETTE:Nom:Quantité:Unité") so the two imports stay consistent. A sub-recipe referencing
// another sub-recipe must reference one that already exists — either seeded/manually created, or
// imported in an earlier file — never one created later in the same file (see fiche_technique's
// own PRODUIT: two-pass note in importProductsParser.ts for the same reasoning).
// ---------------------------------------------------------------------------

export interface SubRecipeImportColumnDoc {
  key: string;
  label: string;
  required: boolean;
  description: string;
}

export const SUBRECIPE_IMPORT_COLUMNS: SubRecipeImportColumnDoc[] = [
  { key: 'nom', label: 'nom', required: true, description: "Nom de la nouvelle sous-recette. Doit être unique — s'il existe déjà, modifiez-la directement dans Sous-recettes." },
  { key: 'description', label: 'description', required: false, description: 'Description libre.' },
  { key: 'rendement_quantite', label: 'rendement_quantite', required: true, description: 'Quantité produite par un lot (ex: 1000).' },
  { key: 'rendement_unite', label: 'rendement_unite', required: true, description: "Unité de stock existante pour le rendement (ex: g, ml)." },
  {
    key: 'ingredients',
    label: 'ingredients',
    required: true,
    description:
      'Composants séparés par "|". Ingrédient : "Ingrédient:Quantité:Unité" (ex: "Farine:500:g"). Sous-recette déjà existante : "SOUSRECETTE:Nom:Quantité:Unité".',
  },
];

const REQUIRED_COLUMN_KEYS = SUBRECIPE_IMPORT_COLUMNS.filter((c) => c.required).map((c) => c.key);
const KNOWN_COLUMN_KEYS = new Set(SUBRECIPE_IMPORT_COLUMNS.map((c) => c.key));

export interface SubRecipeImportRowIssue {
  field: string;
  value: string;
  message: string;
}

export interface ImportedSubRecipeRowDraft {
  id: string;
  rowNumber: number;
  name: string;
  description: string;
  yieldQuantity: string;
  yieldUnit: string;
  ingredients: RecipeLine[];
  issues: SubRecipeImportRowIssue[];
}

export interface SubRecipeImportParseResult {
  rows: ImportedSubRecipeRowDraft[];
  unknownColumns: string[];
}

const parsePipeCell = (raw: string): string[] => (!raw || !raw.trim() ? [] : raw.split('|').map((s) => s.trim()).filter(Boolean));

const parseSubRecipeImportRow = (
  get: (key: string) => string,
  rowNumber: number,
  existingSubRecipes: SubRecipe[],
  ingredients: StockProduct[],
  units: StockUnit[],
  rowsSoFar: ImportedSubRecipeRowDraft[]
): ImportedSubRecipeRowDraft => {
  const issues: SubRecipeImportRowIssue[] = [];
  const id = generateProductId('impsubrec');

  const rawName = get('nom');
  const rawDescription = get('description');
  const rawYieldQty = get('rendement_quantite');
  const rawYieldUnit = get('rendement_unite');
  const rawIngredients = get('ingredients');

  if (!rawName.trim()) {
    issues.push({ field: 'nom', value: rawName, message: 'Le nom est obligatoire.' });
  } else {
    if (resolveSubRecipeByName(rawName, existingSubRecipes)) {
      issues.push({ field: 'nom', value: rawName, message: `Une sous-recette « ${rawName} » existe déjà — modifiez-la directement plutôt que de la réimporter.` });
    }
    if (rowsSoFar.some((r) => normalizeKey(r.name) === normalizeKey(rawName))) {
      issues.push({ field: 'nom', value: rawName, message: `« ${rawName} » apparaît plusieurs fois dans ce fichier.` });
    }
  }

  const yieldQty = Number(rawYieldQty);
  if (!rawYieldQty.trim()) issues.push({ field: 'rendement_quantite', value: rawYieldQty, message: 'La quantité produite est obligatoire.' });
  else if (Number.isNaN(yieldQty) || yieldQty <= 0) issues.push({ field: 'rendement_quantite', value: rawYieldQty, message: 'La quantité produite doit être un nombre supérieur à 0.' });

  let yieldUnit = '';
  if (!rawYieldUnit.trim()) {
    issues.push({ field: 'rendement_unite', value: rawYieldUnit, message: "L'unité produite est obligatoire." });
  } else {
    const u = resolveStockUnitByName(rawYieldUnit, units);
    if (!u) issues.push({ field: 'rendement_unite', value: rawYieldUnit, message: `Unité introuvable : « ${rawYieldUnit} ».` });
    else yieldUnit = u.name;
  }

  const ingredientLines: RecipeLine[] = [];
  const pipeCells = parsePipeCell(rawIngredients);
  if (pipeCells.length === 0) {
    issues.push({ field: 'ingredients', value: rawIngredients, message: 'Ajoutez au moins un ingrédient ou une sous-recette.' });
  }
  pipeCells.forEach((entry) => {
    const parts = entry.split(':').map((s) => s.trim());
    if (parts[0] && normalizeKey(parts[0]) === 'sousrecette') {
      const [, subName, qtyStr, unitName] = parts;
      if (!subName) {
        issues.push({ field: 'ingredients', value: entry, message: `Sous-recette : nom manquant dans « ${entry} ».` });
        return;
      }
      if (normalizeKey(subName) === normalizeKey(rawName)) {
        issues.push({ field: 'ingredients', value: entry, message: `Une sous-recette ne peut pas se référencer elle-même : « ${subName} ».` });
        return;
      }
      const subRecipe = resolveSubRecipeByName(subName, existingSubRecipes);
      if (!subRecipe) {
        issues.push({ field: 'ingredients', value: entry, message: `Sous-recette introuvable : « ${subName} ». Elle doit déjà exister (créez-la ou importez-la avant celle-ci).` });
        return;
      }
      const qty = Number(qtyStr);
      if (!qtyStr || Number.isNaN(qty) || qty <= 0) {
        issues.push({ field: 'ingredients', value: entry, message: `Sous-recette « ${subName} » : quantité invalide « ${qtyStr ?? ''} ».` });
        return;
      }
      const unit = unitName ? resolveStockUnitByName(unitName, units) : undefined;
      if (!unitName || !unit) {
        issues.push({ field: 'ingredients', value: entry, message: `Sous-recette « ${subName} » : unité introuvable « ${unitName ?? ''} ».` });
        return;
      }
      if (!areUnitsCompatible(unit.name, subRecipe.yieldUnit)) {
        issues.push({ field: 'ingredients', value: entry, message: `Sous-recette « ${subName} » : unité « ${unit.name} » incompatible avec « ${subRecipe.yieldUnit} ».` });
        return;
      }
      ingredientLines.push({ id: generateProductId('rline'), kind: 'subrecipe', subRecipeId: subRecipe.id, quantity: qty, unit: unit.name });
      return;
    }

    const [ingName, qtyStr, unitName] = parts;
    if (!ingName) {
      issues.push({ field: 'ingredients', value: entry, message: `Ingrédient manquant dans « ${entry} ».` });
      return;
    }
    const ingredient = ingredients.find((i) => normalizeKey(i.name) === normalizeKey(ingName));
    if (!ingredient) {
      issues.push({ field: 'ingredients', value: entry, message: `Ingrédient introuvable : « ${ingName} ».` });
      return;
    }
    const qty = Number(qtyStr);
    if (!qtyStr || Number.isNaN(qty) || qty <= 0) {
      issues.push({ field: 'ingredients', value: entry, message: `Ingrédient « ${ingName} » : quantité invalide « ${qtyStr ?? ''} ».` });
      return;
    }
    const unit = unitName ? resolveStockUnitByName(unitName, units) : undefined;
    if (!unitName || !unit) {
      issues.push({ field: 'ingredients', value: entry, message: `Ingrédient « ${ingName} » : unité introuvable « ${unitName ?? ''} ».` });
      return;
    }
    if (!areUnitsCompatible(unit.name, ingredient.unit)) {
      issues.push({ field: 'ingredients', value: entry, message: `Ingrédient « ${ingName} » : unité « ${unit.name} » incompatible avec « ${ingredient.unit} ».` });
      return;
    }
    ingredientLines.push({ id: generateProductId('rline'), kind: 'ingredient', ingredientId: ingredient.id, quantity: qty, unit: unit.name });
  });

  if (ingredientLines.length > 0 && detectCircularReference(id, ingredientLines, existingSubRecipes)) {
    issues.push({ field: 'ingredients', value: rawIngredients, message: 'Référence circulaire détectée entre sous-recettes.' });
  }

  return {
    id,
    rowNumber,
    name: rawName.trim(),
    description: rawDescription.trim(),
    yieldQuantity: rawYieldQty.trim(),
    yieldUnit,
    ingredients: ingredientLines,
    issues,
  };
};

export const parseSubRecipeImportFile = async (
  file: File,
  existingSubRecipes: SubRecipe[],
  ingredients: StockProduct[],
  units: StockUnit[]
): Promise<SubRecipeImportParseResult> => {
  const sheet = await readSheetFromFile(file);
  const { indexMap, missingColumns, unknownColumns } = resolveColumns(sheet.headers, REQUIRED_COLUMN_KEYS, KNOWN_COLUMN_KEYS);
  if (missingColumns.length > 0) {
    throw new ImportFileError(`Colonne(s) obligatoire(s) manquante(s) : ${missingColumns.map((c) => `« ${c} »`).join(', ')}.`);
  }
  if (sheet.rows.length === 0) throw new ImportFileError('Le fichier ne contient aucune ligne de données à importer.');
  if (sheet.rows.length > MAX_IMPORT_ROWS) throw new ImportFileError(`Le fichier contient trop de lignes (${sheet.rows.length}). Maximum autorisé : ${MAX_IMPORT_ROWS}.`);

  const rows: ImportedSubRecipeRowDraft[] = [];
  sheet.rows.forEach((rawCells, i) => {
    rows.push(parseSubRecipeImportRow(buildRowGetter(indexMap, rawCells), i + 2, existingSubRecipes, ingredients, units, rows));
  });

  return { rows, unknownColumns };
};

export const buildSubRecipesFromImportRows = (rows: ImportedSubRecipeRowDraft[]): Omit<SubRecipe, 'id' | 'createdAt'>[] =>
  rows.map((row) => ({
    name: row.name,
    description: row.description || undefined,
    yieldQuantity: Number(row.yieldQuantity),
    yieldUnit: row.yieldUnit,
    ingredients: row.ingredients,
  }));

export const buildSubRecipeImportTemplateCsv = (): string => {
  const headerRow = SUBRECIPE_IMPORT_COLUMNS.map((c) => c.key);
  const exampleRows: string[][] = [
    ['Pâte à Crêpe Maison', 'Base pour crêpes et gaufres', '1000', 'g', 'Farine:500:g|Œufs:4:unité|Lait frais:600:ml|Beurre:50:g|Sucre blanc:60:g'],
    ['Sauce Fromage Maison', '', '1000', 'g', 'Cheddar:500:g|Lait frais:400:ml|Beurre:60:g'],
  ];
  return buildCsvDocument([headerRow, ...exampleRows]);
};

export const downloadSubRecipeImportTemplateCsv = (): void => {
  downloadCsvDocument('template_import_sous_recettes_cafe_noir.csv', buildSubRecipeImportTemplateCsv());
};
