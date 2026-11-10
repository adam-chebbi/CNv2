import QRCode from 'qrcode';
import { billDocument, receiptDocument, renderHtml, type PrintDocument, type ReceiptSale } from '../data/receipts';
import type { SaleDetail } from './api';
import { apiGet } from '../api/client';

// Browser printing (80 mm) of the shared document model — used when no printer is connected
// through the print agent. Same content as the thermal printers (src/data/receipts.ts).

export const printDocument = async (doc: PrintDocument): Promise<void> => {
  const qrImages: Record<string, string> = {};
  for (const line of doc.lines) {
    if (line.t === 'qr' && !qrImages[line.data]) qrImages[line.data] = await QRCode.toDataURL(line.data, { margin: 0, width: 220 });
  }
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;';
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1000);
  };
  frame.srcdoc = renderHtml(doc, qrImages);
  document.body.appendChild(frame);
};

// The server builds customer documents (café identity from the settings); the local layout is
// only a fallback when it can't be reached.
export const printTicket = async (sale: SaleDetail, duplicateNumber = 0, reviewUrl?: string | null): Promise<void> => {
  try {
    await printDocument(await apiGet<PrintDocument>(`/pos/sales/${sale.id}/receipt-document?duplicate=${duplicateNumber}`));
  } catch {
    await printDocument(receiptDocument(sale as unknown as ReceiptSale, duplicateNumber, reviewUrl));
  }
};

export const printBill = (sale: SaleDetail, serverDocument?: PrintDocument): Promise<void> => printDocument(serverDocument ?? billDocument(sale as unknown as ReceiptSale));
