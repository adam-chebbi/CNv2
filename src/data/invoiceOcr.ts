// OCR des factures fournisseurs: text extraction (image / PDF / DOCX) + best-effort parsing into
// an editable draft. Extraction is inherently imperfect — the review screen (InvoiceOcrPage) is the
// mandatory human-validation step the spec requires before anything is integrated, so heuristics
// here favor recall (surface a candidate row for the admin to fix) over silently dropping a line.

import { normalizeKey, parseDateFlexible } from './textUtils';
import { Supplier } from './purchasesModel';
import { StockProduct } from './stockModel';
import { ProductAlias, findProductMatch } from './productAliases';

export type { ProductAlias } from './productAliases';
export { findProductMatch } from './productAliases';

// --- File type detection --------------------------------------------------------------------------

export const OCR_ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.docx'];
export const MAX_OCR_FILE_SIZE_BYTES = 20 * 1024 * 1024;

export type OcrFileKind = 'image' | 'pdf' | 'docx';

export const detectFileKind = (file: File): OcrFileKind | null => {
  const name = file.name.toLowerCase();
  if (file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/.test(name)) return 'image';
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    return 'docx';
  }
  return null;
};

export class OcrExtractionError extends Error {}

// --- Text extraction ---------------------------------------------------------------------------

const ocrImageLike = async (image: Blob | HTMLCanvasElement): Promise<string> => {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('fra');
  try {
    const { data } = await worker.recognize(image);
    return data.text;
  } finally {
    await worker.terminate();
  }
};

const extractFromImage = (file: File): Promise<string> => ocrImageLike(file);

// Digital PDFs (text already selectable) are read directly via pdf.js — far faster and more
// accurate than OCR. Scanned PDFs (no text layer) fall back to rendering each page to a canvas
// and running OCR on it, same as a photographed invoice.
const extractFromPdf = async (file: File): Promise<string> => {
  const pdfjsLib = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;

  let textLayer = '';
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    textLayer += `${content.items.map((item) => ('str' in item ? item.str : '')).join(' ')}\n`;
  }

  if (textLayer.trim().length >= 20) return textLayer;

  // Scanned PDF: render each page to a canvas and OCR it.
  let ocrText = '';
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    ocrText += `${await ocrImageLike(canvas)}\n`;
  }
  return ocrText;
};

const extractFromDocx = async (file: File): Promise<string> => {
  const mammoth = await import('mammoth');
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
};

export const extractTextFromFile = async (file: File): Promise<string> => {
  const kind = detectFileKind(file);
  if (!kind) throw new OcrExtractionError('Format non supporté. Utilisez une photo, un PDF ou un DOCX.');
  if (file.size > MAX_OCR_FILE_SIZE_BYTES) {
    throw new OcrExtractionError(`Fichier trop volumineux (max ${(MAX_OCR_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)} Mo).`);
  }
  const text = kind === 'image' ? await extractFromImage(file) : kind === 'pdf' ? await extractFromPdf(file) : await extractFromDocx(file);
  if (!text || !text.trim()) {
    throw new OcrExtractionError("Aucun texte n'a pu être extrait de ce fichier. Vérifiez la qualité de l'image.");
  }
  return text;
};

// --- Parsing: extracted text -> editable invoice draft --------------------------------------------

export interface OcrLineItemDraft {
  id: string;
  rawLabel: string;
  productId: string; // '' until matched or manually chosen
  quantity: string;
  unitPrice: string;
}

export interface ParsedInvoiceDraft {
  supplierNameRaw: string;
  supplierId: string; // '' if no existing supplier matched
  invoiceNumber: string;
  invoiceDate: string; // ISO yyyy-mm-dd, or '' if not detected
  lines: OcrLineItemDraft[];
  amountHT: string;
  vatAmount: string;
  amountTTC: string;
}

let ocrLineIdCounter = 0;
const generateOcrLineId = (): string => {
  ocrLineIdCounter += 1;
  return `ocrline-${ocrLineIdCounter}-${Date.now().toString(36)}`;
};

const parseFrenchAmount = (raw: string): number | null => {
  const cleaned = raw.replace(/[^\d.,]/g, '');
  if (!cleaned) return null;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized = cleaned;
  if (lastComma > -1 && lastDot > -1) {
    normalized = lastComma > lastDot ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/,/g, '');
  } else if (lastComma > -1) {
    normalized = cleaned.replace(',', '.');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
};

const findAmountAfterKeyword = (lines: string[], keywordRegex: RegExp): string => {
  for (const line of lines) {
    const m = line.match(keywordRegex);
    if (m && m[1]) {
      const amount = parseFrenchAmount(m[1]);
      if (amount !== null) return amount.toFixed(3);
    }
  }
  return '';
};

const findInvoiceNumber = (lines: string[]): string => {
  for (const line of lines) {
    const m =
      line.match(/facture\s*n[°ºo]?\s*[:\-]?\s*([A-Za-z0-9\-/]{2,})/i) ||
      line.match(/n[°ºo]\s*[:\-]?\s*([A-Za-z0-9\-/]{2,})/i);
    if (m && m[1]) return m[1].trim();
  }
  return '';
};

const findInvoiceDate = (text: string): string => {
  const matches = text.matchAll(/(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/g);
  for (const m of matches) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = `20${y}`;
    const iso = parseDateFlexible(`${d}/${mo}/${y}`);
    if (iso) return iso;
  }
  return '';
};

const HEADER_LINE_PATTERN = /d[ée]signation|quantit[ée]|prix\s*unit|montant|^total$/i;
const KEYWORD_LINE_PATTERN = /\b(HT|TVA|TTC)\b|facture|n[°ºo]\s*[:\-]/i;

// Matches "<description> <qty> <unit price>[ <line total>]" — a best-effort read of a tabular
// invoice line. Real layouts vary; the review screen is where the admin fixes what this misses.
const PRODUCT_LINE_PATTERN =
  /^(.{2,60}?)\s+(\d{1,4}(?:[.,]\d{1,3})?)\s+(\d{1,6}(?:[.,]\d{1,3})?)(?:\s+\d{1,6}(?:[.,]\d{1,3})?)?\s*(?:DT|TND)?$/i;

const findSupplierMatch = (text: string, suppliers: Supplier[]): { name: string; id: string } => {
  const normalizedText = normalizeKey(text);
  const matches = suppliers
    .filter((s) => normalizedText.includes(normalizeKey(s.name)))
    .sort((a, b) => b.name.length - a.name.length);
  if (matches.length > 0) return { name: matches[0].name, id: matches[0].id };
  const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l.length >= 3) ?? '';
  return { name: firstLine, id: '' };
};

const MAX_DETECTED_LINES = 40;

export const parseInvoiceText = (
  text: string,
  suppliers: Supplier[],
  products: StockProduct[],
  aliases: ProductAlias[]
): ParsedInvoiceDraft => {
  const rawLines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const supplierMatch = findSupplierMatch(text, suppliers);
  const invoiceNumber = findInvoiceNumber(rawLines);
  const invoiceDate = findInvoiceDate(text);
  const amountHT = findAmountAfterKeyword(rawLines, /\bHT\b[^\d]{0,15}(\d[\d\s]*[.,]?\d*)/i);
  const vatAmount = findAmountAfterKeyword(rawLines, /\bTVA\b[^\d]{0,15}(\d[\d\s]*[.,]?\d*)/i);
  const amountTTC = findAmountAfterKeyword(rawLines, /\bTTC\b[^\d]{0,15}(\d[\d\s]*[.,]?\d*)/i);

  const lines: OcrLineItemDraft[] = [];
  for (const line of rawLines) {
    if (lines.length >= MAX_DETECTED_LINES) break;
    if (HEADER_LINE_PATTERN.test(line) || KEYWORD_LINE_PATTERN.test(line)) continue;
    const m = line.match(PRODUCT_LINE_PATTERN);
    if (!m) continue;
    const [, label, qtyRaw, priceRaw] = m;
    const quantity = parseFrenchAmount(qtyRaw);
    const unitPrice = parseFrenchAmount(priceRaw);
    if (quantity === null || unitPrice === null || quantity <= 0) continue;
    const rawLabel = label.trim();
    lines.push({
      id: generateOcrLineId(),
      rawLabel,
      productId: findProductMatch(rawLabel, products, aliases),
      quantity: String(quantity),
      unitPrice: unitPrice.toFixed(3),
    });
  }

  return {
    supplierNameRaw: supplierMatch.name,
    supplierId: supplierMatch.id,
    invoiceNumber,
    invoiceDate,
    lines,
    amountHT,
    vatAmount,
    amountTTC,
  };
};

export const createEmptyOcrLine = (): OcrLineItemDraft => ({
  id: generateOcrLineId(),
  rawLabel: '',
  productId: '',
  quantity: '',
  unitPrice: '',
});
