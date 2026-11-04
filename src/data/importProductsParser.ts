import { parseDecimalCell } from './decimalInput';
import { todayIso } from './dateUtils';
import { normalizeKey } from './textUtils';
import { StockProduct, resolveStockUnitByName, StockUnit, areUnitsCompatible } from './stockModel';
import { CatalogArticle, CatalogExtra, RecipeLine, VariantOption, ArticleCategory } from './manualSalesCatalog';
import {
  ProductCategory,
  ProductSubCategory,
  SubRecipe,
  resolveProductCategoryByName,
  resolveProductSubCategoryByName,
  resolveSubRecipeByName,
  generateProductId,
} from './productsModel';
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
// Column contract — one row = one product. Multi-value cells reuse the same "|"-separated,
// case-insensitive-resolved convention already established by the Ventes and Stock imports.
// ---------------------------------------------------------------------------

export interface ProductImportColumnDoc {
  key: string;
  label: string;
  required: boolean;
  description: string;
}

export const PRODUCT_IMPORT_COLUMNS: ProductImportColumnDoc[] = [
  { key: 'nom', label: 'nom', required: true, description: 'Nom du produit. Insensible à la casse pour la détection de doublons.' },
  { key: 'description', label: 'description', required: false, description: 'Description libre du produit.' },
  { key: 'prix', label: 'prix', required: true, description: 'Prix de vente (nombre positif).' },
  { key: 'categorie', label: 'categorie', required: true, description: 'Catégorie existante (ex: Café chaud). Doit déjà exister dans le Catalogue.' },
  { key: 'sous_categorie', label: 'sous_categorie', required: false, description: 'Sous-catégorie existante appartenant à la catégorie indiquée.' },
  { key: 'disponibilite', label: 'disponibilite', required: false, description: '"Oui" ou "Non". Vide = disponible par défaut.' },
  {
    key: 'variantes',
    label: 'variantes',
    required: false,
    description: 'Variantes séparées par "|", au format "Nom:supplément" (ex: "Petite:0|Moyenne:1|Grande:2").',
  },
  {
    key: 'extras',
    label: 'extras',
    required: false,
    description: 'Extras existants séparés par "|" (ex: "Chantilly|Sirop caramel"). Doivent déjà exister.',
  },
  {
    key: 'fiche_technique',
    label: 'fiche_technique',
    required: false,
    description:
      'Composants séparés par "|". Ingrédient : "Ingrédient:Quantité:Unité" (ex: "Café:80:g"). Sous-recette existante (gérée dans Gestion des produits → Sous-recettes) : "SOUSRECETTE:Nom:Quantité:Unité" (ex: "SOUSRECETTE:Pâte à Crêpe Maison:150:g"). Produit composé — un produit existant utilisé comme composant (ex: un "Petit Déjeuner" fait de plusieurs produits) : "PRODUIT:Nom:Quantité" (ex: "PRODUIT:Cappuccino:1"), sans unité — la quantité est un simple nombre d\'unités. Le produit référencé doit déjà exister (l\'importer dans un fichier séparé au préalable).',
  },
];

const REQUIRED_COLUMN_KEYS = PRODUCT_IMPORT_COLUMNS.filter((c) => c.required).map((c) => c.key);
const KNOWN_COLUMN_KEYS = new Set(PRODUCT_IMPORT_COLUMNS.map((c) => c.key));

export interface ProductImportRowIssue {
  field: string;
  value: string;
  message: string;
}

export interface ImportedProductRowDraft {
  id: string;
  rowNumber: number;
  name: string;
  description: string;
  price: string;
  categoryId: string;
  subCategoryId: string;
  isAvailable: boolean;
  variants: VariantOption[];
  extraIds: string[];
  recipe: RecipeLine[];
  issues: ProductImportRowIssue[];
}

export interface ProductImportParseResult {
  rows: ImportedProductRowDraft[];
  unknownColumns: string[];
}

const parsePipeCell = (raw: string): string[] => (!raw || !raw.trim() ? [] : raw.split('|').map((s) => s.trim()).filter(Boolean));

const parseProductImportRow = (
  get: (key: string) => string,
  rowNumber: number,
  categories: ProductCategory[],
  subCategories: ProductSubCategory[],
  ingredients: StockProduct[],
  units: StockUnit[],
  subRecipes: SubRecipe[],
  extras: CatalogExtra[],
  articles: CatalogArticle[]
): ImportedProductRowDraft => {
  const issues: ProductImportRowIssue[] = [];
  const rawName = get('nom');
  const rawDescription = get('description');
  const rawPrice = get('prix');
  const rawCategory = get('categorie');
  const rawSubCategory = get('sous_categorie');
  const rawAvailability = get('disponibilite');
  const rawVariantes = get('variantes');
  const rawExtras = get('extras');
  const rawRecipe = get('fiche_technique');

  if (!rawName.trim()) issues.push({ field: 'nom', value: rawName, message: 'Le nom est obligatoire.' });

  const priceNum = parseDecimalCell(rawPrice);
  if (!rawPrice.trim()) issues.push({ field: 'prix', value: rawPrice, message: 'Le prix est obligatoire.' });
  else if (Number.isNaN(priceNum) || priceNum <= 0) issues.push({ field: 'prix', value: rawPrice, message: 'Le prix doit être un nombre supérieur à 0.' });

  let categoryId = '';
  if (!rawCategory.trim()) {
    issues.push({ field: 'categorie', value: rawCategory, message: 'La catégorie est obligatoire.' });
  } else {
    const cat = resolveProductCategoryByName(rawCategory, categories);
    if (!cat) issues.push({ field: 'categorie', value: rawCategory, message: `Catégorie introuvable : « ${rawCategory} ».` });
    else categoryId = cat.id;
  }

  let subCategoryId = '';
  if (rawSubCategory.trim()) {
    const sub = resolveProductSubCategoryByName(rawSubCategory, subCategories, categoryId || undefined);
    if (!sub) {
      issues.push({
        field: 'sous_categorie',
        value: rawSubCategory,
        message: categoryId
          ? `Sous-catégorie « ${rawSubCategory} » introuvable pour la catégorie « ${rawCategory} ».`
          : `Sous-catégorie introuvable : « ${rawSubCategory} ».`,
      });
    } else {
      subCategoryId = sub.id;
    }
  }

  let isAvailable = true;
  if (rawAvailability.trim()) {
    const key = normalizeKey(rawAvailability);
    if (key === 'oui' || key === 'disponible') isAvailable = true;
    else if (key === 'non' || key === 'indisponible') isAvailable = false;
    else issues.push({ field: 'disponibilite', value: rawAvailability, message: `Valeur de disponibilité invalide : « ${rawAvailability} ». Utilisez "Oui" ou "Non".` });
  }

  const variants: VariantOption[] = [];
  parsePipeCell(rawVariantes).forEach((entry, idx) => {
    const [labelPart, deltaPart] = entry.split(':').map((s) => s.trim());
    if (!labelPart) {
      issues.push({ field: 'variantes', value: entry, message: `Variante ${idx + 1} : nom manquant dans « ${entry} ».` });
      return;
    }
    const delta = deltaPart ? parseDecimalCell(deltaPart) : 0;
    if (deltaPart && Number.isNaN(delta)) {
      issues.push({ field: 'variantes', value: entry, message: `Variante « ${labelPart} » : supplément invalide « ${deltaPart} ».` });
      return;
    }
    variants.push({ id: generateProductId('var'), label: labelPart, priceDelta: delta });
  });

  const extraIds: string[] = [];
  parsePipeCell(rawExtras).forEach((entry) => {
    const key = normalizeKey(entry);
    const extra = extras.find((e) => normalizeKey(e.name) === key);
    if (!extra) issues.push({ field: 'extras', value: entry, message: `Extra introuvable : « ${entry} ».` });
    else extraIds.push(extra.id);
  });

  const recipe: RecipeLine[] = [];
  parsePipeCell(rawRecipe).forEach((entry) => {
    const parts = entry.split(':').map((s) => s.trim());
    if (parts[0] && normalizeKey(parts[0]) === 'produit') {
      const [, prodName, qtyStr] = parts;
      if (!prodName) {
        issues.push({ field: 'fiche_technique', value: entry, message: `Produit composé : nom manquant dans « ${entry} ».` });
        return;
      }
      if (normalizeKey(prodName) === normalizeKey(rawName)) {
        issues.push({ field: 'fiche_technique', value: entry, message: `Un produit ne peut pas se composer de lui-même : « ${prodName} ».` });
        return;
      }
      const product = articles.find((a) => normalizeKey(a.name) === normalizeKey(prodName));
      if (!product) {
        issues.push({ field: 'fiche_technique', value: entry, message: `Produit composé introuvable : « ${prodName} ». Il doit déjà exister (importez-le dans un fichier séparé au préalable).` });
        return;
      }
      const qty = parseDecimalCell(qtyStr);
      if (!qtyStr || Number.isNaN(qty) || qty <= 0) {
        issues.push({ field: 'fiche_technique', value: entry, message: `Produit composé « ${prodName} » : quantité invalide « ${qtyStr ?? ''} ».` });
        return;
      }
      recipe.push({ id: generateProductId('rline'), kind: 'product', productId: product.id, quantity: qty, unit: 'unité' });
      return;
    }
    if (parts[0] && normalizeKey(parts[0]) === 'sousrecette') {
      const [, subName, qtyStr, unitName] = parts;
      if (!subName) {
        issues.push({ field: 'fiche_technique', value: entry, message: `Sous-recette : nom manquant dans « ${entry} ».` });
        return;
      }
      const subRecipe = resolveSubRecipeByName(subName, subRecipes);
      if (!subRecipe) {
        issues.push({ field: 'fiche_technique', value: entry, message: `Sous-recette introuvable : « ${subName} ».` });
        return;
      }
      const qty = parseDecimalCell(qtyStr);
      if (!qtyStr || Number.isNaN(qty) || qty <= 0) {
        issues.push({ field: 'fiche_technique', value: entry, message: `Sous-recette « ${subName} » : quantité invalide « ${qtyStr ?? ''} ».` });
        return;
      }
      const unit = unitName ? resolveStockUnitByName(unitName, units) : undefined;
      if (!unitName || !unit) {
        issues.push({ field: 'fiche_technique', value: entry, message: `Sous-recette « ${subName} » : unité introuvable « ${unitName ?? ''} ».` });
        return;
      }
      if (!areUnitsCompatible(unit.name, subRecipe.yieldUnit)) {
        issues.push({
          field: 'fiche_technique',
          value: entry,
          message: `Sous-recette « ${subName} » : unité « ${unit.name} » incompatible avec l'unité de la sous-recette (« ${subRecipe.yieldUnit} »).`,
        });
        return;
      }
      recipe.push({ id: generateProductId('rline'), kind: 'subrecipe', subRecipeId: subRecipe.id, quantity: qty, unit: unit.name });
      return;
    }

    const [ingName, qtyStr, unitName] = parts;
    if (!ingName) {
      issues.push({ field: 'fiche_technique', value: entry, message: `Ingrédient manquant dans « ${entry} ».` });
      return;
    }
    const ingredient = ingredients.find((i) => normalizeKey(i.name) === normalizeKey(ingName));
    if (!ingredient) {
      issues.push({ field: 'fiche_technique', value: entry, message: `Ingrédient introuvable : « ${ingName} ».` });
      return;
    }
    const qty = parseDecimalCell(qtyStr);
    if (!qtyStr || Number.isNaN(qty) || qty <= 0) {
      issues.push({ field: 'fiche_technique', value: entry, message: `Ingrédient « ${ingName} » : quantité invalide « ${qtyStr ?? ''} ».` });
      return;
    }
    const unit = unitName ? resolveStockUnitByName(unitName, units) : undefined;
    if (!unitName || !unit) {
      issues.push({ field: 'fiche_technique', value: entry, message: `Ingrédient « ${ingName} » : unité introuvable « ${unitName ?? ''} ».` });
      return;
    }
    recipe.push({ id: generateProductId('rline'), kind: 'ingredient', ingredientId: ingredient.id, quantity: qty, unit: unit.name });
  });

  // A product's own fiche technique can never be circular relative to the product itself — only
  // SubRecipe entities can nest each other, so that cycle guard lives on the Sous-recettes CRUD
  // (validateDraftSubRecipe) instead of here.
  const draftId = generateProductId('improd');

  return {
    id: draftId,
    rowNumber,
    name: rawName.trim(),
    description: rawDescription.trim(),
    price: rawPrice.trim(),
    categoryId,
    subCategoryId,
    isAvailable,
    variants,
    extraIds,
    recipe,
    issues,
  };
};

export const parseProductImportFile = async (
  file: File,
  categories: ProductCategory[],
  subCategories: ProductSubCategory[],
  ingredients: StockProduct[],
  units: StockUnit[],
  subRecipes: SubRecipe[],
  extras: CatalogExtra[],
  articles: CatalogArticle[]
): Promise<ProductImportParseResult> => {
  const sheet = await readSheetFromFile(file);
  const { indexMap, missingColumns, unknownColumns } = resolveColumns(sheet.headers, REQUIRED_COLUMN_KEYS, KNOWN_COLUMN_KEYS);
  if (missingColumns.length > 0) {
    throw new ImportFileError(`Colonne(s) obligatoire(s) manquante(s) : ${missingColumns.map((c) => `« ${c} »`).join(', ')}.`);
  }
  if (sheet.rows.length === 0) throw new ImportFileError('Le fichier ne contient aucune ligne de données à importer.');
  if (sheet.rows.length > MAX_IMPORT_ROWS) throw new ImportFileError(`Le fichier contient trop de lignes (${sheet.rows.length}). Maximum autorisé : ${MAX_IMPORT_ROWS}.`);

  const rows = sheet.rows.map((rawCells, i) =>
    parseProductImportRow(buildRowGetter(indexMap, rawCells), i + 2, categories, subCategories, ingredients, units, subRecipes, extras, articles)
  );

  return { rows, unknownColumns };
};

// Post-correction revalidation for the fields the correction UI allows editing directly
// (name/price/category/subcategory/availability); variant/extra/recipe issues require replacing
// the file, so they are preserved as-is until a fresh parse.
export const recomputeProductRowIssues = (row: ImportedProductRowDraft, subCategories: ProductSubCategory[]): ProductImportRowIssue[] => {
  const structural = row.issues.filter((i) => ['variantes', 'extras', 'fiche_technique'].includes(i.field));
  const issues: ProductImportRowIssue[] = [...structural];

  if (!row.name.trim()) issues.push({ field: 'nom', value: '', message: 'Le nom est obligatoire.' });
  const priceNum = parseDecimalCell(row.price);
  if (!row.price.trim()) issues.push({ field: 'prix', value: '', message: 'Le prix est obligatoire.' });
  else if (Number.isNaN(priceNum) || priceNum <= 0) issues.push({ field: 'prix', value: row.price, message: 'Le prix doit être un nombre supérieur à 0.' });

  if (!row.categoryId) {
    issues.push({ field: 'categorie', value: '', message: 'La catégorie est obligatoire.' });
  }
  if (row.subCategoryId) {
    const sub = subCategories.find((s) => s.id === row.subCategoryId);
    if (sub && row.categoryId && sub.categoryId !== row.categoryId) {
      issues.push({ field: 'sous_categorie', value: '', message: "La sous-catégorie n'appartient pas à la catégorie choisie." });
    }
  }
  return issues;
};

export const buildCatalogArticlesFromImportRows = (rows: ImportedProductRowDraft[], categories: ProductCategory[], subCategories: ProductSubCategory[]): CatalogArticle[] =>
  rows.map((row) => {
    const category = categories.find((c) => c.id === row.categoryId);
    const subCategory = subCategories.find((s) => s.id === row.subCategoryId);
    return {
      id: row.id,
      name: row.name,
      category: (category?.name ?? '') as ArticleCategory,
      subCategory: subCategory?.name,
      price: parseDecimalCell(row.price),
      description: row.description || undefined,
      isAvailable: row.isAvailable,
      extraIds: row.extraIds.length > 0 ? row.extraIds : undefined,
      variants: row.variants.length > 0 ? row.variants : undefined,
      recipe: row.recipe.length > 0 ? row.recipe : undefined,
      createdAt: todayIso(),
    };
  });

export const buildProductImportTemplateCsv = (): string => {
  const headerRow = PRODUCT_IMPORT_COLUMNS.map((c) => c.key);
  const exampleRows: string[][] = [
    ['Expresso Maison', 'Espresso corsé', '4.50', 'Café chaud', 'Espresso & Ristretto', 'Oui', 'Simple:0|Double:1.5', '', 'Café:80:g|Gobelet:1:unités'],
    ['Crêpe au Sucre', 'Crêpe garnie de sucre', '5.00', 'Snack', 'Salé', 'Oui', '', '', 'SOUSRECETTE:Pâte à Crêpe Maison:150:g'],
    ['Pizza Margherita', 'Tomate, mozzarella, basilic', '18.00', 'Snack', 'Salé', 'Oui', 'Petite:0|Moyenne:3|Grande:6', 'Fromage supplémentaire|Sauce', ''],
    ['Burger Signature', 'Bœuf, cheddar, sauce maison', '22.00', 'Snack', 'Salé', 'Non', '', 'Bacon|Fromage supplémentaire', ''],
  ];
  return buildCsvDocument([headerRow, ...exampleRows]);
};

export const downloadProductImportTemplateCsv = (): void => {
  downloadCsvDocument('template_import_produits_cafe_noir.csv', buildProductImportTemplateCsv());
};
