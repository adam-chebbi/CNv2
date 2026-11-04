import {
  Supplier,
  DraftSupplier,
  createEmptyDraftSupplier,
  validateDraftSupplier,
  buildSupplierFromDraft,
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
// Column contract — one row = one fournisseur.
// ---------------------------------------------------------------------------

export interface ImportColumnDoc {
  key: string;
  label: string;
  required: boolean;
  description: string;
}

export const IMPORT_COLUMNS: ImportColumnDoc[] = [
  { key: 'nom', label: 'nom', required: true, description: 'Nom / raison sociale du fournisseur.' },
  { key: 'matricule_fiscal', label: 'matricule_fiscal', required: false, description: 'Matricule fiscal.' },
  { key: 'telephone', label: 'telephone', required: false, description: 'Numéro de téléphone.' },
  { key: 'whatsapp', label: 'whatsapp', required: false, description: 'Numéro WhatsApp.' },
  { key: 'email', label: 'email', required: false, description: 'Adresse email.' },
  { key: 'adresse', label: 'adresse', required: false, description: 'Adresse postale.' },
  { key: 'contact_principal', label: 'contact_principal', required: false, description: 'Nom du contact principal chez le fournisseur.' },
  { key: 'notes', label: 'notes', required: false, description: 'Remarque libre.' },
];

const REQUIRED_COLUMN_KEYS = IMPORT_COLUMNS.filter((c) => c.required).map((c) => c.key);
const KNOWN_COLUMN_KEYS = new Set(IMPORT_COLUMNS.map((c) => c.key));

export interface ImportRowIssue {
  field: string;
  message: string;
}

export interface ImportedSupplierDraft {
  id: string;
  rowNumber: number;
  draft: DraftSupplier;
  issues: ImportRowIssue[];
}

export interface ImportParseResult {
  rows: ImportedSupplierDraft[];
  unknownColumns: string[];
}

const parseImportRow = (get: (key: string) => string, rowNumber: number, existingSuppliers: Supplier[]): ImportedSupplierDraft => {
  const draft: DraftSupplier = {
    ...createEmptyDraftSupplier(),
    id: generatePurchaseId('impSup'),
    name: get('nom'),
    taxId: get('matricule_fiscal'),
    phone: get('telephone'),
    whatsapp: get('whatsapp'),
    email: get('email'),
    address: get('adresse'),
    mainContact: get('contact_principal'),
    notes: get('notes'),
  };

  return {
    id: generatePurchaseId('impSuprow'),
    rowNumber,
    draft,
    issues: validateDraftSupplier(draft, existingSuppliers),
  };
};

export const parseImportFile = async (file: File, existingSuppliers: Supplier[]): Promise<ImportParseResult> => {
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

  // Duplicate-name detection runs against existing suppliers PLUS every row already parsed in this
  // same file, so two rows importing the same new supplier twice are caught too.
  const seen: Supplier[] = [...existingSuppliers];
  const rows = sheet.rows.map((rawCells, i) => {
    const row = parseImportRow(buildRowGetter(indexMap, rawCells), i + 2, seen);
    if (row.issues.length === 0) seen.push(buildSupplierFromDraft(row.draft));
    return row;
  });

  return { rows, unknownColumns };
};

export const recomputeRowIssues = (row: ImportedSupplierDraft, existingSuppliers: Supplier[]): ImportRowIssue[] =>
  validateDraftSupplier(row.draft, existingSuppliers);

export const buildSuppliersFromImportRows = (rows: ImportedSupplierDraft[]): Supplier[] => rows.map((r) => buildSupplierFromDraft(r.draft));

export const buildImportTemplateCsv = (): string => {
  const headerRow = IMPORT_COLUMNS.map((c) => c.key);
  const exampleRows: string[][] = [
    ['Ben Yedder & Fils', '1234567A', '20123456', '20123456', 'contact@benyedder.tn', 'Sfax, Tunisie', 'Mohamed Ben Yedder', 'Fournisseur de café'],
    ['Lavazza Tunisie', '', '71987654', '', '', 'Tunis, Tunisie', '', ''],
  ];
  return buildCsvDocument([headerRow, ...exampleRows]);
};

export const downloadImportTemplateCsv = (): void => {
  downloadCsvDocument('template_import_fournisseurs_cafe_noir.csv', buildImportTemplateCsv());
};
