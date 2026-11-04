// Shared, professional PDF report generator used by every page in "Rapports et analyses" —
// built with jsPDF + jspdf-autotable so the output is a REAL multi-page PDF document (true page
// numbers, automatically repeated table headers, automatic page breaks) rather than a browser
// print-to-PDF screenshot. Every report page only supplies data (KPIs, tables, alerts, insights);
// the branding, layout and pagination logic live here ONCE so every exported report looks like
// the same professional document family.

import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

export interface PdfKpi {
  label: string;
  value: string;
  caption?: string;
}

export interface PdfTableSection {
  heading: string;
  intro?: string;
  columns: string[];
  rows: (string | number)[][];
  align?: ('left' | 'right' | 'center')[];
  totalsRow?: (string | number)[];
}

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface PdfAlert {
  severity: AlertSeverity;
  category: string;
  message: string;
}

export interface ReportPdfOptions {
  title: string;
  periodLabel: string;
  subtitle?: string;
  kpis: PdfKpi[];
  tables: PdfTableSection[];
  alerts?: PdfAlert[];
  insights?: string[];
}

const BRAND_NAME = 'CAFÉ NOIR';
const BRAND_TAGLINE = 'Torréfacteur & Coffee Shop Artisanal';

const PRIMARY: [number, number, number] = [0, 137, 94];
const DARK: [number, number, number] = [17, 24, 39];
const GRAY: [number, number, number] = [107, 114, 128];
const LIGHT: [number, number, number] = [241, 243, 245];
const WHITE: [number, number, number] = [255, 255, 255];

const SEVERITY_COLOR: Record<AlertSeverity, [number, number, number]> = {
  critical: [220, 38, 38],
  warning: [180, 96, 6],
  info: [37, 99, 235],
};
const SEVERITY_LABEL: Record<AlertSeverity, string> = { critical: 'Critique', warning: 'Attention', info: 'Info' };

const slugify = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

// French number/currency formatting (via toLocaleString('fr-FR')) inserts a narrow no-break
// space (U+202F) — and sometimes a plain no-break space (U+00A0) — as the thousands separator,
// e.g. "1 290,00 DT". Browsers render that fine, but jsPDF's standard "helvetica" font doesn't
// have that glyph and draws a stray character in its place (a value like "1 290,00 DT" turns
// into "1 /290,00 DT" in the exported PDF). Every string handed to jsPDF is normalized through
// here first so this can never resurface, regardless of which report page formatted it.
const NON_STANDARD_SPACE_PATTERN = /[\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000]/g;

const sanitizePdfText = (value: string): string => value.replace(NON_STANDARD_SPACE_PATTERN, ' ');

const sanitizeCell = (cell: string | number): string | number => (typeof cell === 'string' ? sanitizePdfText(cell) : cell);

const sanitizeReportOptions = (opts: ReportPdfOptions): ReportPdfOptions => ({
  ...opts,
  title: sanitizePdfText(opts.title),
  periodLabel: sanitizePdfText(opts.periodLabel),
  subtitle: opts.subtitle ? sanitizePdfText(opts.subtitle) : opts.subtitle,
  kpis: opts.kpis.map((k) => ({
    label: sanitizePdfText(k.label),
    value: sanitizePdfText(k.value),
    caption: k.caption ? sanitizePdfText(k.caption) : k.caption,
  })),
  tables: opts.tables.map((t) => ({
    ...t,
    heading: sanitizePdfText(t.heading),
    intro: t.intro ? sanitizePdfText(t.intro) : t.intro,
    columns: t.columns.map(sanitizePdfText),
    rows: t.rows.map((row) => row.map(sanitizeCell)),
    totalsRow: t.totalsRow ? t.totalsRow.map(sanitizeCell) : t.totalsRow,
  })),
  alerts: opts.alerts?.map((a) => ({ ...a, category: sanitizePdfText(a.category), message: sanitizePdfText(a.message) })),
  insights: opts.insights?.map(sanitizePdfText),
});

export const generateReportPdf = (rawOpts: ReportPdfOptions): void => {
  const opts = sanitizeReportOptions(rawOpts);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const headerHeight = 24;
  const contentTop = headerHeight + 10;
  const footerReserve = 18;

  let cursorY = contentTop;

  const ensureSpace = (needed: number) => {
    if (cursorY + needed > pageHeight - footerReserve) {
      doc.addPage();
      cursorY = contentTop;
    }
  };

  // --- Title block ---
  doc.setTextColor(...DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(opts.title, marginX, cursorY);
  cursorY += 6.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...PRIMARY);
  doc.text(`Période analysée : ${opts.periodLabel}`, marginX, cursorY);
  cursorY += 5.5;

  if (opts.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    const lines = doc.splitTextToSize(opts.subtitle, pageWidth - marginX * 2);
    doc.text(lines, marginX, cursorY);
    cursorY += lines.length * 4 + 2;
  }
  cursorY += 3;

  // --- KPI summary grid ---
  if (opts.kpis.length > 0) {
    ensureSpace(28);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...DARK);
    doc.text('Résumé', marginX, cursorY);
    cursorY += 5;

    const cols = Math.min(4, opts.kpis.length) || 1;
    const gap = 3;
    const boxWidth = (pageWidth - marginX * 2 - gap * (cols - 1)) / cols;
    const boxHeight = 19;

    opts.kpis.forEach((kpi, i) => {
      const col = i % cols;
      if (col === 0 && i > 0) {
        cursorY += boxHeight + gap;
        ensureSpace(boxHeight + gap);
      }
      const x = marginX + col * (boxWidth + gap);
      doc.setFillColor(...LIGHT);
      doc.roundedRect(x, cursorY, boxWidth, boxHeight, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.3);
      doc.setTextColor(...GRAY);
      doc.text(kpi.label, x + 3, cursorY + 6, { maxWidth: boxWidth - 6 });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...DARK);
      doc.text(kpi.value, x + 3, cursorY + 13.5, { maxWidth: boxWidth - 6 });
      if (kpi.caption) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.3);
        doc.setTextColor(...GRAY);
        doc.text(kpi.caption, x + 3, cursorY + 17, { maxWidth: boxWidth - 6 });
      }
    });
    cursorY += boxHeight + 10;
  }

  // --- Detailed tables ---
  opts.tables.forEach((t) => {
    ensureSpace(22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...DARK);
    doc.text(t.heading, marginX, cursorY);
    cursorY += 4.5;
    if (t.intro) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.3);
      doc.setTextColor(...GRAY);
      const lines = doc.splitTextToSize(t.intro, pageWidth - marginX * 2);
      doc.text(lines, marginX, cursorY);
      cursorY += lines.length * 3.7 + 2;
    }

    if (t.rows.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.3);
      doc.setTextColor(...GRAY);
      doc.text('Aucune donnée pour cette période.', marginX, cursorY + 2);
      cursorY += 10;
      return;
    }

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX, top: contentTop, bottom: footerReserve },
      head: [t.columns],
      body: t.rows,
      foot: t.totalsRow ? [t.totalsRow] : undefined,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.2, textColor: DARK, lineColor: LIGHT, lineWidth: 0.15 },
      headStyles: { fillColor: PRIMARY, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
      footStyles: { fillColor: LIGHT, textColor: DARK, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [250, 250, 251] },
      columnStyles: t.align ? Object.fromEntries(t.align.map((a, i) => [i, { halign: a }])) : undefined,
    });
    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9;
  });

  // --- Alerts / anomalies ---
  if (opts.alerts && opts.alerts.length > 0) {
    ensureSpace(22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...DARK);
    doc.text('Alertes et observations importantes', marginX, cursorY);
    cursorY += 4.5;

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX, top: contentTop, bottom: footerReserve },
      head: [['Niveau', 'Catégorie', 'Observation']],
      body: opts.alerts.map((a) => [SEVERITY_LABEL[a.severity], a.category, a.message]),
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.2, textColor: DARK, lineColor: LIGHT, lineWidth: 0.15 },
      headStyles: { fillColor: DARK, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 32 } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 0) {
          const rowAlert = opts.alerts![data.row.index];
          if (rowAlert) {
            data.cell.styles.textColor = SEVERITY_COLOR[rowAlert.severity];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });
    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9;
  }

  // --- Insights / explanatory notes ---
  if (opts.insights && opts.insights.length > 0) {
    ensureSpace(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...DARK);
    doc.text('Explications et points clés', marginX, cursorY);
    cursorY += 5.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY);
    opts.insights.forEach((line) => {
      const wrapped = doc.splitTextToSize(`•  ${line}`, pageWidth - marginX * 2 - 2);
      ensureSpace(wrapped.length * 4 + 1.5);
      doc.text(wrapped, marginX, cursorY);
      cursorY += wrapped.length * 4 + 1.5;
    });
  }

  // --- Header + footer stamped on every page, once total page count is known ---
  const totalPages = doc.getNumberOfPages();
  const now = new Date();
  const generatedLabel = `Généré le ${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;

  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);

    doc.setFillColor(...DARK);
    doc.rect(0, 0, pageWidth, headerHeight, 'F');
    doc.setTextColor(...WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(BRAND_NAME, marginX, 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(BRAND_TAGLINE, marginX, 15);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(opts.title, pageWidth - marginX, 10, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(209, 213, 219);
    doc.text(generatedLabel, pageWidth - marginX, 15, { align: 'right' });

    doc.setDrawColor(...LIGHT);
    doc.setLineWidth(0.2);
    doc.line(marginX, pageHeight - 14, pageWidth - marginX, pageHeight - 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.3);
    doc.setTextColor(...GRAY);
    doc.text('Café Noir — Système de gestion (document interne, généré automatiquement)', marginX, pageHeight - 9);
    doc.text(`Page ${p} / ${totalPages}`, pageWidth - marginX, pageHeight - 9, { align: 'right' });
  }

  doc.save(`${slugify(opts.title)}_${slugify(opts.periodLabel)}.pdf`);
};
