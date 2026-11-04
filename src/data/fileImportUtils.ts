import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { normalizeHeaderKey } from './textUtils';

// Generic CSV/Excel reading, header resolution, validation and CSV-building helpers shared by
// every bulk-import feature in the app (Ventes → Import Excel/CSV, Stock → Import Excel/CSV, …),
// so each feature only has to define its own column contract and row-parsing rules.

export const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMPORT_ROWS = 2000;
export const ACCEPTED_IMPORT_EXTENSIONS = ['csv', 'xlsx', 'xls'];

export class ImportFileError extends Error {}

export interface RawSheet {
  headers: string[];
  rows: string[][];
}

const getFileExtension = (file: File): string => file.name.split('.').pop()?.toLowerCase() ?? '';

export const validateFileBeforeParsing = (file: File): string | null => {
  const ext = getFileExtension(file);
  if (!ACCEPTED_IMPORT_EXTENSIONS.includes(ext)) {
    return `Format non pris en charge (.${ext || '?'}). Utilisez un fichier .csv, .xlsx ou .xls.`;
  }
  if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
    return `Le fichier est trop volumineux (${(file.size / (1024 * 1024)).toFixed(1)} Mo). Taille maximale : ${(MAX_IMPORT_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)} Mo.`;
  }
  return null;
};

const readCsvSheet = async (file: File): Promise<RawSheet> => {
  let text = await file.text();
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip UTF-8 BOM
  const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const [headerRow, ...dataRows] = result.data;
  return {
    headers: (headerRow || []).map((h) => String(h ?? '')),
    rows: dataRows.map((r) => r.map((c) => String(c ?? ''))),
  };
};

const readExcelSheet = async (file: File): Promise<RawSheet> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new ImportFileError('Le classeur Excel ne contient aucune feuille exploitable.');
  const sheet = workbook.Sheets[firstSheetName];
  const grid = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' });
  const [headerRow, ...dataRows] = grid;
  return {
    headers: (headerRow || []).map((h) => String(h ?? '')),
    rows: dataRows
      .filter((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== ''))
      .map((r) => r.map((c) => String(c ?? ''))),
  };
};

// Reads a .csv/.xlsx/.xls File into a plain string grid (headers + data rows), applying the
// shared size/extension checks. Throws ImportFileError on anything unreadable.
export const readSheetFromFile = async (file: File): Promise<RawSheet> => {
  const fileSizeError = validateFileBeforeParsing(file);
  if (fileSizeError) throw new ImportFileError(fileSizeError);
  const ext = getFileExtension(file);
  const sheet = ext === 'csv' ? await readCsvSheet(file) : await readExcelSheet(file);
  if (sheet.headers.length === 0) {
    throw new ImportFileError("Le fichier semble vide ou ne contient pas de ligne d'en-têtes.");
  }
  return sheet;
};

export interface ColumnResolution {
  indexMap: Map<string, number>;
  missingColumns: string[];
  unknownColumns: string[];
}

// Matches a sheet's header row against a column contract, case/space/hyphen-insensitively.
export const resolveColumns = (headers: string[], requiredKeys: string[], knownKeys: Set<string>): ColumnResolution => {
  const normalizedHeaders = headers.map(normalizeHeaderKey);
  const indexMap = new Map<string, number>();
  normalizedHeaders.forEach((h, idx) => {
    if (!indexMap.has(h)) indexMap.set(h, idx);
  });
  const missingColumns = requiredKeys.filter((key) => !indexMap.has(key));
  const unknownColumns = normalizedHeaders.filter((h) => h && !knownKeys.has(h));
  return { indexMap, missingColumns, unknownColumns };
};

// Builds a `get(columnKey)` accessor for one raw data row, trimmed and defaulting to ''.
export const buildRowGetter =
  (indexMap: Map<string, number>, rawCells: string[]) =>
  (key: string): string => {
    const idx = indexMap.get(key);
    if (idx === undefined || idx < 0 || idx >= rawCells.length) return '';
    return (rawCells[idx] ?? '').toString().trim();
  };

const csvEscape = (value: string): string => {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
};

export const buildCsvDocument = (rows: string[][]): string => rows.map((row) => row.map(csvEscape).join(',')).join('\n');

// Triggers a browser download of a UTF-8 CSV (with BOM, for Excel compatibility on Windows),
// matching the download pattern already used elsewhere in the app (data: URI + temporary link).
export const downloadCsvDocument = (filename: string, csvContent: string): void => {
  const withBom = '\uFEFF' + csvContent;
  const encodedUri = encodeURI('data:text/csv;charset=utf-8,' + withBom);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
