import { SaleTransaction } from './salesTransactions';
import {
  DraftTicket,
  DraftTicketItem,
  SalesCatalogContext,
  generateId,
  createEmptyItem,
  validateGeneralFields,
  validateTicketFields,
  buildSaleTransactionFromTicket,
  resolveArticleByName,
  resolveExtraByName,
  resolveVariantOptionByName,
  resolveEmployeeByName,
  resolveShiftByName,
  resolveServiceType,
  resolvePaymentMethod,
  parseDateFlexible,
} from './salesEntryModel';
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
// Column contract — the single source of truth shared by the downloadable
// template, the on-page documentation and the parser itself, so they can
// never drift apart.
// ---------------------------------------------------------------------------

export interface ImportColumnDoc {
  key: string;
  label: string;
  required: boolean;
  description: string;
}

export const IMPORT_COLUMNS: ImportColumnDoc[] = [
  { key: 'date', label: 'date', required: true, description: 'Date de la vente au format AAAA-MM-JJ (ex: 2026-09-08) ou JJ/MM/AAAA.' },
  { key: 'shift', label: 'shift', required: true, description: 'Nom exact du shift (ex: "Matin (07h - 14h)"). Insensible à la casse et aux espaces.' },
  { key: 'employee', label: 'employee', required: true, description: "Nom de l'employé (ex: Karim). Insensible à la casse." },
  {
    key: 'consommations_articles',
    label: 'consommations_articles',
    required: true,
    description:
      'Un ou plusieurs articles séparés par "|". Préfixez par la quantité avec "x" (ex: "2x Espresso Double Arabica|1x Croissant Pur Beurre"). Sans préfixe, la quantité vaut 1.',
  },
  {
    key: 'extras',
    label: 'extras',
    required: false,
    description:
      'Extras optionnels, alignés avec consommations_articles par position ("|"). Plusieurs extras pour un même article sont séparés par une virgule (ex: "Shot espresso supplémentaire, Chantilly|").',
  },
  {
    key: 'variantes',
    label: 'variantes',
    required: false,
    description:
      'Variante optionnelle par article, alignée avec consommations_articles par position ("|"). Une seule variante par article (ex: "Grand|").',
  },
  { key: 'service', label: 'service', required: true, description: 'Valeurs acceptées : "Sur place" ou "À emporter" (insensible à la casse).' },
  { key: 'comptoir', label: 'comptoir', required: false, description: 'Obligatoire uniquement si service = "À emporter".' },
  { key: 'table', label: 'table', required: false, description: 'Obligatoire uniquement si service = "Sur place".' },
  { key: 'reglement', label: 'reglement', required: true, description: 'Valeurs acceptées : "Espèces", "Carte bancaire" ou "Ticket resto".' },
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

export interface ImportItemHint {
  article?: string;
  variant?: string;
  extras?: string[];
}

export interface ImportedTicketDraft {
  id: string;
  rowNumber: number; // matches the row number the user would see in Excel/a text editor (header = row 1)
  date: string;
  shift: string;
  employee: string;
  ticket: DraftTicket;
  issues: ImportRowIssue[];
  // Raw imported text for values that failed resolution, keyed by item rowId — used only to show
  // "valeur importée" hints in the correction UI; never touches the shared DraftTicket model.
  itemHints: Record<string, ImportItemHint>;
}

export interface ImportParseResult {
  rows: ImportedTicketDraft[];
  unknownColumns: string[];
}

// ---------------------------------------------------------------------------
// Cell parsing helpers
// ---------------------------------------------------------------------------

const parseMultiSegmentCell = (raw: string): string[] => {
  if (!raw || !raw.trim()) return [];
  return raw.split('|').map((s) => s.trim());
};

const parseArticleSegment = (segment: string): { qty: number; name: string } => {
  const match = segment.match(/^(\d+)\s*x\s*(.+)$/i);
  if (match) {
    return { qty: Math.max(1, parseInt(match[1], 10) || 1), name: match[2].trim() };
  }
  return { qty: 1, name: segment.trim() };
};

const parseImportRow = (get: (key: string) => string, rowNumber: number, catalog: SalesCatalogContext): ImportedTicketDraft => {
  const issues: ImportRowIssue[] = [];

  const rawDate = get('date');
  const rawShift = get('shift');
  const rawEmployee = get('employee');
  const rawArticlesCell = get('consommations_articles');
  const rawExtrasCell = get('extras');
  const rawVariantesCell = get('variantes');
  const rawService = get('service');
  const rawComptoir = get('comptoir');
  const rawTable = get('table');
  const rawReglement = get('reglement');

  const parsedDate = rawDate ? parseDateFlexible(rawDate) : null;
  if (!rawDate) {
    issues.push({ field: 'date', value: rawDate, message: 'La date est obligatoire.' });
  } else if (!parsedDate) {
    issues.push({ field: 'date', value: rawDate, message: `Date invalide : « ${rawDate} ». Utilisez AAAA-MM-JJ ou JJ/MM/AAAA.` });
  }

  const shift = rawShift ? resolveShiftByName(rawShift, catalog.shifts) : undefined;
  if (!rawShift) {
    issues.push({ field: 'shift', value: rawShift, message: 'Le shift est obligatoire.' });
  } else if (!shift) {
    issues.push({ field: 'shift', value: rawShift, message: `Shift introuvable : « ${rawShift} ».` });
  }

  const employee = rawEmployee ? resolveEmployeeByName(rawEmployee, catalog.employees) : undefined;
  if (!rawEmployee) {
    issues.push({ field: 'employee', value: rawEmployee, message: "L'employé est obligatoire." });
  } else if (!employee) {
    issues.push({ field: 'employee', value: rawEmployee, message: `Employé introuvable : « ${rawEmployee} ».` });
  }

  const articleSegments = parseMultiSegmentCell(rawArticlesCell);
  const extraSegmentGroups = parseMultiSegmentCell(rawExtrasCell);
  const variantSegmentGroups = parseMultiSegmentCell(rawVariantesCell);

  const items: DraftTicketItem[] = [];
  const itemHints: Record<string, ImportItemHint> = {};
  if (articleSegments.length === 0) {
    issues.push({
      field: 'consommations_articles',
      value: rawArticlesCell,
      message: 'Consommations & Articles : au moins un article est obligatoire.',
    });
  }

  articleSegments.forEach((segment, i) => {
    const { qty, name } = parseArticleSegment(segment);
    const article = resolveArticleByName(name, catalog.articles);
    const itemRowId = generateId('impitem');

    if (!article) {
      issues.push({ field: 'consommations_articles', value: name, message: `Produit introuvable : « ${name} ».` });
      // Keep the row visible (empty/unresolved article select) so the user can pick the right
      // product directly, instead of silently dropping the line the file actually contained.
      items.push({ rowId: itemRowId, articleId: '', qty, variantOptionId: '', extraIds: [] });
      itemHints[itemRowId] = { article: name };
      return;
    }

    let variantOptionId = '';
    const variantRaw = (variantSegmentGroups[i] ?? '').trim();
    if (variantRaw) {
      const variant = resolveVariantOptionByName(article.category, variantRaw);
      if (!variant) {
        issues.push({
          field: 'variantes',
          value: variantRaw,
          message: `Variante introuvable pour « ${article.name} » : « ${variantRaw} ».`,
        });
        itemHints[itemRowId] = { ...itemHints[itemRowId], variant: variantRaw };
      } else {
        variantOptionId = variant.id;
      }
    }

    const extraIds: string[] = [];
    const extrasRaw = (extraSegmentGroups[i] ?? '').trim();
    if (extrasRaw) {
      const unresolvedExtras: string[] = [];
      extrasRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((exName) => {
          const extra = resolveExtraByName(exName, catalog.extras);
          if (!extra) {
            issues.push({
              field: 'extras',
              value: exName,
              message: `Extra introuvable pour « ${article.name} » : « ${exName} ».`,
            });
            unresolvedExtras.push(exName);
          } else {
            extraIds.push(extra.id);
          }
        });
      if (unresolvedExtras.length > 0) {
        itemHints[itemRowId] = { ...itemHints[itemRowId], extras: unresolvedExtras };
      }
    }

    items.push({ rowId: itemRowId, articleId: article.id, qty, variantOptionId, extraIds });
  });

  const serviceType = rawService ? resolveServiceType(rawService) : undefined;
  if (!rawService) {
    issues.push({ field: 'service', value: rawService, message: 'Le service est obligatoire.' });
  } else if (!serviceType) {
    issues.push({
      field: 'service',
      value: rawService,
      message: `Service invalide : « ${rawService} ». Valeurs acceptées : "Sur place", "À emporter".`,
    });
  }

  if (serviceType === 'Sur place' && !rawTable.trim()) {
    issues.push({ field: 'table', value: rawTable, message: 'Numéro de table obligatoire pour un service "Sur place".' });
  }
  if (serviceType === 'À emporter' && !rawComptoir.trim()) {
    issues.push({ field: 'comptoir', value: rawComptoir, message: 'Comptoir obligatoire pour un service "À emporter".' });
  }

  const paymentMethod = rawReglement ? resolvePaymentMethod(rawReglement) : undefined;
  if (!rawReglement) {
    issues.push({ field: 'reglement', value: rawReglement, message: 'Le règlement est obligatoire.' });
  } else if (!paymentMethod) {
    issues.push({
      field: 'reglement',
      value: rawReglement,
      message: `Règlement invalide : « ${rawReglement} ». Valeurs acceptées : "Espèces", "Carte bancaire", "Ticket resto".`,
    });
  }

  const ticket: DraftTicket = {
    rowId: generateId('impticket'),
    items: items.length > 0 ? items : [createEmptyItem()],
    serviceType: serviceType ?? '',
    tableNumber: rawTable.trim(),
    counterLabel: rawComptoir.trim(),
    paymentMethod: paymentMethod ?? '',
  };

  return {
    id: generateId('improw'),
    rowNumber,
    date: parsedDate ?? '',
    shift: shift ?? '',
    employee: employee ?? '',
    ticket,
    issues,
    itemHints,
  };
};

// ---------------------------------------------------------------------------
// Public entry point: parse a File (csv/xlsx/xls) into ImportedTicketDraft[]
// ---------------------------------------------------------------------------

export const parseImportFile = async (file: File, catalog: SalesCatalogContext): Promise<ImportParseResult> => {
  const sheet = await readSheetFromFile(file);

  const { indexMap, missingColumns, unknownColumns } = resolveColumns(sheet.headers, REQUIRED_COLUMN_KEYS, KNOWN_COLUMN_KEYS);
  if (missingColumns.length > 0) {
    throw new ImportFileError(
      `Colonne(s) obligatoire(s) manquante(s) : ${missingColumns.map((c) => `« ${c} »`).join(', ')}.`
    );
  }

  if (sheet.rows.length === 0) {
    throw new ImportFileError('Le fichier ne contient aucune ligne de données à importer.');
  }
  if (sheet.rows.length > MAX_IMPORT_ROWS) {
    throw new ImportFileError(`Le fichier contient trop de lignes (${sheet.rows.length}). Maximum autorisé : ${MAX_IMPORT_ROWS}.`);
  }

  const rows = sheet.rows.map((rawCells, i) => parseImportRow(buildRowGetter(indexMap, rawCells), i + 2, catalog));

  return { rows, unknownColumns };
};

// ---------------------------------------------------------------------------
// Post-correction revalidation — once a row is edited through the same
// controlled inputs used by "Ajout manuel des ventes", every value is already
// canonical, so we can reuse the exact same validators (no more free-text
// resolution needed).
// ---------------------------------------------------------------------------

export const recomputeRowIssues = (row: ImportedTicketDraft): ImportRowIssue[] => {
  const issues: ImportRowIssue[] = [];

  validateGeneralFields(row.date, row.shift, row.employee, 'row').forEach((issue) => {
    const field = issue.fieldKey.split(':')[1] ?? issue.fieldKey;
    issues.push({ field, value: '', message: issue.message });
  });

  validateTicketFields(row.ticket, `Ligne ${row.rowNumber}`).forEach((issue) => {
    let field = 'ticket';
    if (issue.fieldKey.endsWith(':items')) field = 'consommations_articles';
    else if (issue.fieldKey.endsWith(':service')) field = 'service';
    else if (issue.fieldKey.endsWith(':table')) field = 'table';
    else if (issue.fieldKey.endsWith(':counter')) field = 'comptoir';
    else if (issue.fieldKey.endsWith(':payment')) field = 'reglement';
    else if (issue.fieldKey.startsWith('item:')) field = 'consommations_articles';
    issues.push({ field, value: '', message: issue.message });
  });

  return issues;
};

// ---------------------------------------------------------------------------
// Building the final SaleTransaction batch from a fully valid import
// ---------------------------------------------------------------------------

export const buildSaleTransactionsFromImportRows = (rows: ImportedTicketDraft[], catalog: Pick<SalesCatalogContext, 'articles' | 'extras'>): SaleTransaction[] => {
  const baseId = Date.now();
  return rows
    .map((row, idx) =>
      buildSaleTransactionFromTicket(
        row.ticket,
        { date: row.date, shift: row.shift, employee: row.employee },
        {
          id: baseId + idx,
          saleNumber: `TKT-IMP-${row.date.replace(/-/g, '')}-${(idx + 1).toString().padStart(3, '0')}`,
        },
        catalog
      )
    )
    .filter((tx): tx is SaleTransaction => tx !== null);
};

// ---------------------------------------------------------------------------
// Downloadable CSV template — built from the very same IMPORT_COLUMNS +
// resolution helpers used by the parser, so the template can never drift out
// of sync with what the parser actually accepts.
// ---------------------------------------------------------------------------

const csvEscape = (value: string): string => {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
};

export const buildImportTemplateCsv = (catalog: SalesCatalogContext): string => {
  const headerRow = IMPORT_COLUMNS.map((c) => c.key);

  const article1 = catalog.articles[0]?.name ?? 'Nom du produit 1';
  const article2 = catalog.articles[1]?.name ?? 'Nom du produit 2';
  const article3 = catalog.articles[2]?.name ?? article1;
  const shift1 = catalog.shifts[0] ?? 'Matin';
  const shift2 = catalog.shifts[1] ?? catalog.shifts[0] ?? 'Après-midi';
  const shift3 = catalog.shifts[2] ?? catalog.shifts[0] ?? 'Soir';
  const employee1 = catalog.employees[0] ?? 'Employé 1';
  const employee2 = catalog.employees[1] ?? catalog.employees[0] ?? 'Employé 2';
  const employee3 = catalog.employees[2] ?? catalog.employees[0] ?? 'Employé 3';
  const extra1 = catalog.extras[0]?.name ?? '';

  const exampleRows: string[][] = [
    ['2026-09-08', shift1, employee1, `2x ${article1}|1x ${article2}`, '|', '|', 'Sur place', '', '04', 'Espèces'],
    ['2026-09-08', shift2, employee2, `1x ${article3}`, extra1, '', 'À emporter', 'Comptoir Express', '', 'Carte bancaire'],
    ['2026-09-08', shift3, employee3, `1x ${article1}|1x ${article2}`, '|', '', 'Sur place', '', '08', 'Ticket resto'],
  ];

  return buildCsvDocument([headerRow, ...exampleRows]);
};

export const downloadImportTemplateCsv = (catalog: SalesCatalogContext): void => {
  downloadCsvDocument('template_import_ventes_cafe_noir.csv', buildImportTemplateCsv(catalog));
};
