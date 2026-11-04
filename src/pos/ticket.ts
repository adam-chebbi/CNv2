import { formatDt } from '../data/money';
import { PAYMENT_METHOD_LABELS } from '../data/cashSession';
import type { SaleDetail } from './api';

// Printable ticket, 80 mm wide, printed through the browser's print dialog (works with any
// receipt printer installed on the device; direct printing is a kiosk-mode setting of the browser).

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export const ticketHtml = (sale: SaleDetail, duplicateNumber = 0): string => {
  const lines = sale.orders
    .filter((o) => o.status === 'validated')
    .flatMap((o) => o.lines.filter((l) => l.status === 'active'));
  const when = new Date(sale.completedAt ?? sale.createdAt).toLocaleString('fr-FR', { timeZone: 'Africa/Tunis', dateStyle: 'short', timeStyle: 'short' });
  const row = (left: string, right: string, bold = false) => `<tr${bold ? ' class="b"' : ''}><td>${left}</td><td class="r">${right}</td></tr>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(sale.ticketNumber ?? 'Ticket')}</title>
<style>
@page { size: 80mm auto; margin: 4mm; }
body { font: 12px/1.35 'Courier New', monospace; width: 72mm; margin: 0 auto; color: #000; }
h1 { font-size: 16px; text-align: center; margin: 0 0 2px; } .c { text-align: center; } .r { text-align: right; white-space: nowrap; }
table { width: 100%; border-collapse: collapse; } td { vertical-align: top; padding: 1px 0; } .b td { font-weight: bold; font-size: 14px; }
hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; } .s { font-size: 11px; color: #333; } .dup { border: 2px solid #000; text-align: center; font-weight: bold; padding: 2px; margin: 4px 0; }
</style></head><body>
<h1>Café Noir</h1><p class="c s">Menzah 9 — Tunis</p>
${duplicateNumber > 0 ? `<p class="dup">DUPLICATA n°${duplicateNumber}</p>` : ''}
<p class="c">Ticket ${esc(sale.ticketNumber ?? '—')}<br>${esc(when)}${sale.tableName ? `<br>Table ${esc(sale.tableName)}` : ''}${sale.waiters.length ? `<br>Serveur : ${esc(sale.waiters.join(', '))}` : ''}<br>${sale.serviceType === 'takeaway' ? 'À emporter' : 'Sur place'}</p>
<hr><table>
${lines
  .map(
    (l) =>
      row(`${l.quantity} × ${esc(l.displayName)}${l.itemDiscounts.map((d) => `<br><span class="s">  ${esc(d.label)} -${formatDt(d.amountMil, false)}</span>`).join('')}`, formatDt(l.grossMil, false))
  )
  .join('')}
</table><hr><table>
${sale.ticketDiscounts.map((d) => row(esc(d.label), `-${formatDt(d.amountMil, false)}`)).join('')}
${row('TOTAL', formatDt(sale.totalMil), true)}
${sale.vat.map((v) => row(`<span class="s">dont TVA ${Math.round(v.rate * 100)} %</span>`, `<span class="s">${formatDt(v.vatMil, false)}</span>`)).join('')}
</table><hr><table>
${sale.payments
  .map((p) =>
    p.kind === 'refund'
      ? row(`Remboursement ${PAYMENT_METHOD_LABELS[p.method]}`, formatDt(p.amountMil, false))
      : row(`${PAYMENT_METHOD_LABELS[p.method]}${p.tenderedMil ? ` (reçu ${formatDt(p.tenderedMil, false)})` : ''}`, formatDt(p.amountMil, false)) +
        (p.changeMil ? row('Monnaie rendue', formatDt(p.changeMil, false)) : '')
  )
  .join('')}
</table><hr><p class="c">Merci de votre visite !</p></body></html>`;
};

// Prints through a hidden iframe so the register screen stays in place.
export const printTicket = (sale: SaleDetail, duplicateNumber = 0): void => {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;';
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1000);
  };
  frame.srcdoc = ticketHtml(sale, duplicateNumber);
  document.body.appendChild(frame);
};
