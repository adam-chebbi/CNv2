import { formatDt, type Millimes } from './money';

// Printed documents (amélioration 03): customer ticket, provisional bill, kitchen/bar ticket,
// cancellation ticket. Each document is a list of typed lines, rendered either as HTML (browser
// printing) or as ESC/POS bytes by the print agent — the same content whatever the printer.

export type ReceiptLine =
  | { t: 'text'; text: string; align?: 'left' | 'center' | 'right'; bold?: boolean; size?: 1 | 2; invert?: boolean }
  | { t: 'row'; left: string; right: string; bold?: boolean; size?: 1 | 2 }
  | { t: 'rule'; char?: '-' | '=' }
  | { t: 'box'; lines: string[] }
  | { t: 'qr'; data: string }
  | { t: 'feed'; lines: number };

export interface PrintDocument {
  title: string;
  lines: ReceiptLine[];
  beep?: boolean; // kitchen printers: buzzer on arrival
  openDrawer?: boolean;
}

const PAYMENT_LABELS: Record<string, string> = { cash: 'Espèces', card: 'TPE', voucher: 'Ticket restaurant' };
const DESTINATION_LABELS = { kitchen: 'CUISINE', bar: 'BAR' } as const;

const tunisTime = (iso: string, withDate = false): string =>
  new Date(iso).toLocaleString('fr-FR', withDate ? { timeZone: 'Africa/Tunis', dateStyle: 'short', timeStyle: 'short' } : { timeZone: 'Africa/Tunis', hour: '2-digit', minute: '2-digit' });

const money = (mil: Millimes): string => formatDt(mil, false);

// Words that make an instruction a possible allergy warning (shown framed and in bold).
const ALLERGY_HINTS = ['allerg', 'gluten', 'lactose', 'lait', 'arachide', 'cacahu', 'noix', 'noisette', 'amande', 'œuf', 'oeuf', 'soja', 'sésame', 'sesame', 'poisson', 'crustac', 'fruits de mer', 'céleri', 'moutarde', 'sans '];
export const looksLikeAllergyNote = (text: string | null | undefined): boolean => {
  if (!text) return false;
  const t = text.toLowerCase();
  return ALLERGY_HINTS.some((h) => t.includes(h));
};

// --- Kitchen / bar ticket -------------------------------------------------------------------------

export interface PrepTicketInput {
  destination: 'kitchen' | 'bar';
  label: string; // "T7" or "À emporter"
  tableName: string | null;
  orderNumber: number;
  pickupNumber: number | null;
  sentAt: string;
  waiter: string | null;
  covers: number | null;
  followUp: boolean; // a later dispatch for the same table
  urgent: boolean;
  lines: { quantity: number; name: string; variant: string | null; extras: string[]; instruction: string | null }[];
}

// Never any price or amount: the kitchen and bar have no access to amounts (§3.2).
export const prepTicketDocument = (p: PrepTicketInput, duplicateNumber = 0): PrintDocument => {
  const lines: ReceiptLine[] = [
    { t: 'text', text: DESTINATION_LABELS[p.destination], align: 'center', bold: true, size: 2, invert: true },
  ];
  if (duplicateNumber > 0) lines.push({ t: 'text', text: `DUPLICATA n°${duplicateNumber}`, align: 'center', bold: true });
  if (p.urgent) lines.push({ t: 'text', text: '!!! URGENT !!!', align: 'center', bold: true, size: 2 });
  lines.push(
    { t: 'text', text: p.tableName ? `TABLE ${p.tableName}` : p.pickupNumber ? `RETRAIT n°${p.pickupNumber}` : p.label.toUpperCase(), align: 'center', bold: true, size: 2 },
    { t: 'text', text: `${p.followUp ? 'SUITE — ' : ''}Commande n°${p.orderNumber}`, align: 'center', bold: p.followUp },
    { t: 'text', text: [tunisTime(p.sentAt), p.waiter, p.covers ? `${p.covers} couvert(s)` : null].filter(Boolean).join(' · '), align: 'center' },
    { t: 'rule', char: '=' }
  );
  p.lines.forEach((l) => {
    lines.push({ t: 'text', text: `${l.quantity} × ${l.name.toUpperCase()}`, bold: true, size: 2 });
    if (l.variant) lines.push({ t: 'text', text: `   ${l.variant}` });
    l.extras.forEach((e) => lines.push({ t: 'text', text: `   + ${e}` }));
    if (l.instruction) lines.push({ t: 'box', lines: [`${looksLikeAllergyNote(l.instruction) ? '⚠ ' : ''}${l.instruction}`] });
    lines.push({ t: 'rule' });
  });
  lines.push({ t: 'feed', lines: 2 });
  return { title: `${DESTINATION_LABELS[p.destination]} ${p.label} n°${p.orderNumber}`, lines, beep: true };
};

export interface CancelTicketInput {
  destination: 'kitchen' | 'bar';
  tableName: string | null;
  label: string;
  orderNumber: number;
  decidedAt: string;
  reason: string;
  lines: { quantity: number; name: string }[];
}

export const cancelTicketDocument = (c: CancelTicketInput): PrintDocument => ({
  title: `ANNULATION ${c.label}`,
  beep: true,
  lines: [
    { t: 'text', text: '*** ANNULÉ ***', align: 'center', bold: true, size: 2, invert: true },
    { t: 'text', text: c.tableName ? `TABLE ${c.tableName}` : c.label.toUpperCase(), align: 'center', bold: true, size: 2 },
    { t: 'text', text: `Commande n°${c.orderNumber} · ${tunisTime(c.decidedAt)}`, align: 'center' },
    { t: 'rule', char: '=' },
    ...c.lines.map((l): ReceiptLine => ({ t: 'text', text: `${l.quantity} × ${l.name.toUpperCase()}`, bold: true, size: 2 })),
    { t: 'box', lines: [`Motif : ${c.reason}`] },
    { t: 'feed', lines: 2 },
  ],
});

// --- Customer documents ---------------------------------------------------------------------------

export interface ReceiptSale {
  ticketNumber: string | null;
  status: string;
  serviceType: 'dine_in' | 'takeaway';
  tableName: string | null;
  pickupNumber?: number | null;
  offlineRef?: string | null;
  waiters: string[];
  createdAt: string;
  completedAt: string | null;
  grossMil: number;
  totalMil: number;
  paidMil: number;
  ticketDiscounts: { label: string; amountMil: number }[];
  vat: { rate: number; baseMil: number; vatMil: number }[];
  orders: { status: string; lines: { status: string; quantity: number; displayName: string; grossMil: number; itemDiscounts: { label: string; amountMil: number }[] }[] }[];
  payments: { kind: string; method: string; amountMil: number; tenderedMil: number | null; changeMil: number }[];
}

const header = (): ReceiptLine[] => [
  { t: 'text', text: 'Café Noir', align: 'center', bold: true, size: 2 },
  { t: 'text', text: 'Menzah 9 — Tunis', align: 'center' },
];

const itemLines = (sale: ReceiptSale): ReceiptLine[] =>
  sale.orders
    .filter((o) => o.status === 'validated')
    .flatMap((o) => o.lines.filter((l) => l.status === 'active'))
    .flatMap((l): ReceiptLine[] => [
      { t: 'row', left: `${l.quantity} × ${l.displayName}`, right: money(l.grossMil) },
      ...l.itemDiscounts.map((d): ReceiptLine => ({ t: 'row', left: `   ${d.label}`, right: `-${money(d.amountMil)}` })),
    ]);

const context = (sale: ReceiptSale): ReceiptLine[] => {
  const parts: ReceiptLine[] = [];
  if (sale.tableName) parts.push({ t: 'text', text: `Table ${sale.tableName}`, align: 'center', bold: true });
  if (sale.waiters.length) parts.push({ t: 'text', text: `Serveur : ${sale.waiters.join(', ')}`, align: 'center' });
  parts.push({ t: 'text', text: sale.serviceType === 'takeaway' ? 'À emporter' : 'Sur place', align: 'center' });
  if (sale.pickupNumber) parts.push({ t: 'text', text: `Votre numéro : ${sale.pickupNumber}`, align: 'center', bold: true, size: 2 });
  return parts;
};

export const receiptDocument = (sale: ReceiptSale, duplicateNumber = 0, reviewUrl?: string | null): PrintDocument => {
  const lines: ReceiptLine[] = [...header()];
  if (duplicateNumber > 0) lines.push({ t: 'text', text: `DUPLICATA n°${duplicateNumber}`, align: 'center', bold: true, invert: true });
  lines.push(
    { t: 'text', text: `Ticket ${sale.ticketNumber ?? sale.offlineRef ?? '—'}`, align: 'center' },
    { t: 'text', text: tunisTime(sale.completedAt ?? sale.createdAt, true), align: 'center' },
    ...context(sale),
    { t: 'rule' },
    ...itemLines(sale),
    { t: 'rule' },
    ...sale.ticketDiscounts.map((d): ReceiptLine => ({ t: 'row', left: d.label, right: `-${money(d.amountMil)}` })),
    { t: 'row', left: 'TOTAL', right: formatDt(sale.totalMil), bold: true, size: 2 },
    ...sale.vat.map((v): ReceiptLine => ({ t: 'row', left: `dont TVA ${Math.round(v.rate * 100)} %`, right: money(v.vatMil) })),
    { t: 'rule' }
  );
  sale.payments.forEach((p) => {
    if (p.kind === 'refund') lines.push({ t: 'row', left: `Remboursement ${PAYMENT_LABELS[p.method] ?? p.method}`, right: money(p.amountMil) });
    else {
      lines.push({ t: 'row', left: `${PAYMENT_LABELS[p.method] ?? p.method}${p.tenderedMil ? ` (reçu ${money(p.tenderedMil)})` : ''}`, right: money(p.amountMil) });
      if (p.changeMil) lines.push({ t: 'row', left: 'Monnaie rendue', right: money(p.changeMil) });
    }
  });
  lines.push({ t: 'rule' }, { t: 'text', text: 'Merci de votre visite !', align: 'center' });
  if (reviewUrl) lines.push({ t: 'text', text: 'Votre avis compte :', align: 'center' }, { t: 'qr', data: reviewUrl });
  lines.push({ t: 'feed', lines: 2 });
  return { title: `Ticket ${sale.ticketNumber ?? ''}`, lines };
};

// Provisional bill: never a sales receipt, never numbered (§2.6).
export const billDocument = (sale: ReceiptSale): PrintDocument => ({
  title: `Addition ${sale.tableName ?? ''}`,
  lines: [
    ...header(),
    { t: 'text', text: 'ADDITION', align: 'center', bold: true, size: 2 },
    { t: 'text', text: 'Non valable comme ticket de caisse', align: 'center' },
    { t: 'text', text: tunisTime(new Date().toISOString(), true), align: 'center' },
    ...context(sale),
    { t: 'rule' },
    ...itemLines(sale),
    { t: 'rule' },
    ...sale.ticketDiscounts.map((d): ReceiptLine => ({ t: 'row', left: d.label, right: `-${money(d.amountMil)}` })),
    { t: 'row', left: 'TOTAL', right: formatDt(sale.totalMil), bold: true, size: 2 },
    ...(sale.paidMil > 0
      ? ([
          { t: 'row', left: 'Déjà réglé', right: money(sale.paidMil) },
          { t: 'row', left: 'Reste à régler', right: formatDt(sale.totalMil - sale.paidMil), bold: true },
        ] as ReceiptLine[])
      : []),
    { t: 'feed', lines: 2 },
  ],
});

export const testDocument = (printerName: string): PrintDocument => ({
  title: 'Page de test',
  beep: true,
  lines: [
    ...header(),
    { t: 'text', text: 'PAGE DE TEST', align: 'center', bold: true, size: 2, invert: true },
    { t: 'text', text: printerName, align: 'center' },
    { t: 'text', text: tunisTime(new Date().toISOString(), true), align: 'center' },
    { t: 'rule' },
    { t: 'row', left: 'Accents : éèêàçùô', right: '12,500' },
    { t: 'box', lines: ['Cadre d’instruction'] },
    { t: 'qr', data: 'https://cafenoir.tn' },
    { t: 'feed', lines: 2 },
  ],
});

// --- HTML rendering (browser printing, 80 mm) -----------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export const renderHtml = (doc: PrintDocument, qrImages: Record<string, string> = {}): string => {
  const body = doc.lines
    .map((l) => {
      switch (l.t) {
        case 'text':
          return `<p class="${[l.align ?? 'left', l.bold ? 'b' : '', l.size === 2 ? 'big' : '', l.invert ? 'inv' : ''].join(' ')}">${esc(l.text)}</p>`;
        case 'row':
          return `<p class="row ${l.bold ? 'b' : ''} ${l.size === 2 ? 'big' : ''}"><span>${esc(l.left)}</span><span>${esc(l.right)}</span></p>`;
        case 'rule':
          return `<hr class="${l.char === '=' ? 'double' : ''}">`;
        case 'box':
          return `<div class="box">${l.lines.map(esc).join('<br>')}</div>`;
        case 'qr':
          return qrImages[l.data] ? `<p class="center"><img src="${qrImages[l.data]}" alt="" width="110" height="110"></p>` : '';
        case 'feed':
          return '';
      }
    })
    .join('\n');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>
@page { size: 80mm auto; margin: 3mm; }
body { font: 12px/1.35 'Courier New', monospace; width: 74mm; margin: 0 auto; color: #000; }
p { margin: 0; } .center { text-align: center; } .right { text-align: right; } .b { font-weight: bold; }
.big { font-size: 17px; } .inv { background: #000; color: #fff; padding: 2px 0; }
.row { display: flex; justify-content: space-between; gap: 6px; } .row span:last-child { white-space: nowrap; }
hr { border: 0; border-top: 1px dashed #000; margin: 5px 0; } hr.double { border-top: 3px double #000; }
.box { border: 2px solid #000; padding: 3px 5px; margin: 3px 0; font-weight: bold; font-size: 14px; }
</style></head><body>${body}</body></html>`;
};
