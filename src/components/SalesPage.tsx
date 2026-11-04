import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  ShoppingBag,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Printer,
  Calendar as CalendarIcon,
  FilterX,
  X,
  Coffee,
  Clock,
  Sparkles,
  CreditCard,
  Banknote,
  Smartphone,
  CheckCircle2,
  Receipt,
  Utensils,
  Ticket,
  FileText,
  Info,
  Undo2,
} from 'lucide-react';
import {
  SaleTransaction,
  SaleItem,
  MONTHS_LIST,
  ServiceType,
  PaymentMethod,
} from '../data/salesTransactions';
import { DEFAULT_VAT_RATE } from '../data/manualSalesCatalog';

interface SalesPageProps {
  onNavigateToDashboard: () => void;
  isDarkMode?: boolean;
  transactions: SaleTransaction[];
  onRefundSale: (id: number) => void;
}

// Escape user-facing text before interpolating it into a raw HTML document string
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Per-item VAT, preferring the values frozen at sale time (see manualSalesCatalog.getArticleVatRate)
// and falling back to deriving them from price/qty for any sale recorded before those fields
// existed — never a single flat rate, since each product can carry its own real Tunisian VAT tier.
const getItemVat = (item: SaleItem): { rate: number; net: number; tax: number } => {
  const rate = item.vatRate ?? DEFAULT_VAT_RATE;
  const gross = item.qty * item.price;
  const net = item.netAmount ?? gross / (1 + rate);
  return { rate, net, tax: item.taxAmount ?? gross - net };
};

// Shared receipt figures (kept in sync between the on-screen preview and the printed/downloaded documents)
const getReceiptTotals = (sale: SaleTransaction) => {
  let subtotalHT = 0;
  let tva = 0;
  sale.items.forEach((it) => {
    const { net, tax } = getItemVat(it);
    subtotalHT += net;
    tva += tax;
  });
  return { subtotalHT, tva };
};

// Builds the standalone thermal (80mm) receipt document used for thermal printing and HTML export
const buildThermalReceiptDoc = (sale: SaleTransaction): string => {
  const { subtotalHT, tva } = getReceiptTotals(sale);
  const itemsHtml = sale.items
    .map((it) => {
      const amount = it.qty * it.price;
      const { rate, tax } = getItemVat(it);
      return `
        <div style="margin-bottom:5px;padding-bottom:5px;border-bottom:1px dashed #aaa;">
          <div style="font-size:11px;font-weight:bold;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(it.name)}</div>
          <div style="display:flex;justify-content:space-between;font-size:11px;">
            <span>${it.qty} x ${it.price.toFixed(2)} DT</span>
            <span style="font-weight:bold;">${amount.toFixed(2)} DT</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:10px;margin-top:1px;color:#555;">
            <span>TVA: ${(rate * 100).toFixed(2)}%</span><span>${tax.toFixed(2)} DT</span>
          </div>
        </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Ticket ${escapeHtml(sale.saleNumber)}</title>
<style>
  body { margin: 0; padding: 16px; background: #f0f0f1; }
  @media print {
    body { background: #fff; padding: 0; }
    @page { margin: 0; size: 80mm auto; }
  }
</style>
</head>
<body>
  <div style="width:80mm;max-width:302px;margin:0 auto;padding:8px;font-family:'Courier New',monospace;font-size:12px;line-height:1.2;background:#fff;color:#000;">
    <div style="text-align:center;margin-bottom:8px;">
      <div style="font-weight:bold;font-size:14px;margin-bottom:4px;">CAFÉ NOIR</div>
      <div style="font-size:10px;margin-bottom:2px;">Torréfacteur &amp; Coffee Shop Artisanal</div>
      <div style="font-size:10px;margin-bottom:2px;">Avenue Habib Bourguiba, Tunis - MF: 1482930/B</div>
    </div>
    <div style="border-top:1px dashed #999;margin:8px 0;"></div>
    <div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:2px;"><span>Ticket N&deg; :</span><span>${escapeHtml(sale.saleNumber)}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:2px;"><span>Date :</span><span>${sale.date}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:2px;"><span>Heure :</span><span>${sale.time}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:2px;"><span>Barista :</span><span>${escapeHtml(sale.barista)}</span></div>
    </div>
    <div style="border-top:1px dashed #999;margin:8px 0;"></div>
    <div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:2px;"><span>Service :</span><span>${sale.serviceType}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:2px;"><span>${sale.serviceType === 'Sur place' ? 'Table' : 'Emplacement'} :</span><span>${escapeHtml(sale.tableOrArea)}</span></div>
    </div>
    <div style="border-top:1px dashed #999;margin:8px 0;"></div>
    <div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:bold;border-bottom:1px solid #000;padding-bottom:3px;margin-bottom:4px;"><span>D&eacute;signation</span><span>Montant</span></div>
      ${itemsHtml}
      <div style="margin-top:6px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:2px;font-size:11px;"><span>Total Articles :</span><span>${sale.itemsCount}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:2px;font-size:11px;"><span>Sous-total HT :</span><span>${subtotalHT.toFixed(2)} DT</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:2px;font-size:11px;"><span>TVA :</span><span>${tva.toFixed(2)} DT</span></div>
        <div style="border-top:1px solid #000;margin-top:4px;padding-top:4px;display:flex;justify-content:space-between;font-weight:bold;font-size:13px;"><span>TOTAL TTC</span><span>${sale.totalAmount.toFixed(2)} DT</span></div>
      </div>
    </div>
    <div style="border-top:1px dashed #999;margin:8px 0;"></div>
    <div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:2px;"><span>R&egrave;glement :</span><span style="text-transform:capitalize;">${sale.paymentMethod}</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:2px;"><span>Pay&eacute; :</span><span>${sale.totalAmount.toFixed(2)} DT</span></div>
    </div>
    ${sale.note ? `<div style="border-top:1px dashed #999;margin:8px 0;"></div>
    <div style="font-size:10px;">
      <div style="font-weight:bold;margin-bottom:2px;">Note :</div>
      <div>${escapeHtml(sale.note)}</div>
    </div>` : ''}
    <div style="border-top:1px dashed #999;margin:8px 0;"></div>
    <div style="text-align:center;font-size:10px;">
      <div>Merci pour votre visite !</div>
      <div>&Agrave; bient&ocirc;t chez Caf&eacute; Noir</div>
    </div>
    <div style="margin-top:16px;text-align:center;font-size:10px;">
      <div>* * * * * * * * * * * * * *</div>
    </div>
  </div>
</body>
</html>`;
};

// Builds the standalone A4 document used for A4 printing and PDF generation (via the browser's print dialog)
const buildA4ReceiptDoc = (sale: SaleTransaction): string => {
  const { subtotalHT, tva } = getReceiptTotals(sale);
  const rowsHtml = sale.items
    .map((it) => {
      const amount = it.qty * it.price;
      return `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;">${escapeHtml(it.name)}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:center;">${it.qty}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;">${it.price.toFixed(2)} DT</td>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${amount.toFixed(2)} DT</td>
        </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Ticket ${escapeHtml(sale.saleNumber)}</title>
<style>
  @page { size: A4; margin: 20mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; margin: 0; padding: 24px; }
  table { width: 100%; border-collapse: collapse; }
</style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111827;padding-bottom:16px;margin-bottom:24px;">
    <div>
      <div style="font-size:22px;font-weight:800;letter-spacing:1px;">CAFÉ NOIR</div>
      <div style="font-size:12px;color:#6b7280;margin-top:2px;">Torréfacteur &amp; Coffee Shop Artisanal</div>
      <div style="font-size:12px;color:#6b7280;">Avenue Habib Bourguiba, Tunis - MF: 1482930/B</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:18px;font-weight:700;">Ticket ${escapeHtml(sale.saleNumber)}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:2px;">${sale.date} à ${sale.time}</div>
    </div>
  </div>

  <div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:24px;font-size:13px;">
    <div>
      <div style="color:#6b7280;font-size:11px;text-transform:uppercase;font-weight:700;margin-bottom:4px;">Service</div>
      <div>${sale.serviceType} (${escapeHtml(sale.tableOrArea)})</div>
    </div>
    <div>
      <div style="color:#6b7280;font-size:11px;text-transform:uppercase;font-weight:700;margin-bottom:4px;">Barista</div>
      <div>${escapeHtml(sale.barista)}</div>
    </div>
    <div>
      <div style="color:#6b7280;font-size:11px;text-transform:uppercase;font-weight:700;margin-bottom:4px;">Règlement</div>
      <div style="text-transform:capitalize;">${sale.paymentMethod}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr style="background:#f9fafb;">
        <th style="padding:10px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;">Désignation</th>
        <th style="padding:10px 8px;text-align:center;font-size:11px;text-transform:uppercase;color:#6b7280;">Qté</th>
        <th style="padding:10px 8px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280;">P.U.</th>
        <th style="padding:10px 8px;text-align:right;font-size:11px;text-transform:uppercase;color:#6b7280;">Montant</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div style="display:flex;justify-content:flex-end;margin-top:20px;">
    <div style="width:280px;font-size:13px;">
      <div style="display:flex;justify-content:space-between;padding:4px 0;color:#6b7280;"><span>Sous-total HT</span><span>${subtotalHT.toFixed(2)} DT</span></div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;color:#6b7280;"><span>TVA</span><span>${tva.toFixed(2)} DT</span></div>
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:2px solid #111827;margin-top:6px;font-weight:800;font-size:16px;"><span>TOTAL TTC</span><span>${sale.totalAmount.toFixed(2)} DT</span></div>
    </div>
  </div>

  ${sale.note ? `<div style="margin-top:20px;padding:12px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:12px;color:#92400e;">
    <strong>Note :</strong> ${escapeHtml(sale.note)}
  </div>` : ''}

  <div style="margin-top:40px;padding-top:16px;border-top:1px dashed #d1d5db;text-align:center;font-size:12px;color:#6b7280;">
    Merci pour votre visite ! À bientôt chez Café Noir.
  </div>
</body>
</html>`;
};

// Opens a hidden print window populated with the given document, then triggers the browser print dialog
const openPrintDocument = (html: string) => {
  const printWindow = window.open('', '_blank', 'width=850,height=960');
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
};

export const SalesPage: React.FC<SalesPageProps> = ({
  onNavigateToDashboard,
  transactions,
  onRefundSale,
}) => {
  const [refundingId, setRefundingId] = useState<number | null>(null);
  const handleRefund = (sale: SaleTransaction) => {
    if (!window.confirm(
      `Rembourser le ticket ${sale.saleNumber} ?\n\nLes ingrédients consommés seront réintégrés au stock et la dépense de TVA générée automatiquement sera annulée.`
    )) {
      return;
    }
    setRefundingId(sale.id);
    Promise.resolve(onRefundSale(sale.id)).finally(() => setRefundingId(null));
  };
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  // 'all' for entire year or month label 'Jan', 'Fév', etc.
  const [selectedMonth, setSelectedMonth] = useState<string>('Sep');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedService, setSelectedService] = useState<string>('all');
  const [selectedPayment, setSelectedPayment] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);
  const [sortField, setSortField] = useState<'saleNumber' | 'totalAmount' | 'date'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedSaleForModal, setSelectedSaleForModal] = useState<SaleTransaction | null>(null);

  // Month activity counts in the selected year
  const monthActivityMap = useMemo(() => {
    const map = new Map<string, number>();
    transactions.forEach((tx) => {
      if (tx.year === selectedYear) {
        map.set(tx.month, (map.get(tx.month) || 0) + 1);
      }
    });
    return map;
  }, [transactions, selectedYear]);

  // Reset filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedService('all');
    setSelectedPayment('all');
    setSelectedCategory('all');
    setSelectedEmployee('all');
    setSelectedMonth('Sep');
    setSelectedYear(2026);
    setCurrentPage(1);
  };

  // Categories actually present in the sales history, derived live rather than a fixed list —
  // categories are managed dynamically (Gestion des produits → Catégories) and no longer match
  // the old hardcoded 6-category set this filter used to offer.
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => t.items.forEach((item) => set.add(item.category)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [transactions]);

  // Employees who rang up at least one sale — the "barista" field was previously only reachable
  // via free-text search, not selectable directly. (Sales carry no "shift" of their own — only
  // HR's Planning module does — so a shift filter isn't representable here without a schema
  // change; employee is the closest equivalent already on every sale.)
  const availableEmployees = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => { if (t.barista) set.add(t.barista); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [transactions]);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      // Year filter
      if (t.year !== selectedYear) return false;

      // Month filter
      if (selectedMonth !== 'all' && t.month !== selectedMonth) {
        return false;
      }

      // Service type filter
      if (selectedService !== 'all' && t.serviceType !== selectedService) {
        return false;
      }

      // Payment method filter
      if (selectedPayment !== 'all' && t.paymentMethod !== selectedPayment) {
        return false;
      }

      // Category filter (checks if transaction includes any item with that category)
      if (selectedCategory !== 'all') {
        const hasCategory = t.items.some((item) => item.category === selectedCategory);
        if (!hasCategory) return false;
      }

      // Employee filter
      if (selectedEmployee !== 'all' && t.barista !== selectedEmployee) {
        return false;
      }

      // Search query (ticket number, item name, table/area, barista)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesQuery =
          t.saleNumber.toLowerCase().includes(q) ||
          t.itemsSummary.toLowerCase().includes(q) ||
          t.tableOrArea.toLowerCase().includes(q) ||
          t.barista.toLowerCase().includes(q) ||
          t.serviceType.toLowerCase().includes(q) ||
          t.paymentMethod.toLowerCase().includes(q);
        if (!matchesQuery) return false;
      }

      return true;
    });
  }, [
    transactions,
    selectedYear,
    selectedMonth,
    selectedService,
    selectedPayment,
    selectedCategory,
    selectedEmployee,
    searchQuery,
  ]);

  // Sorted transactions
  const sortedTransactions = useMemo(() => {
    const list = [...filteredTransactions];
    list.sort((a, b) => {
      if (sortField === 'saleNumber') {
        return sortOrder === 'asc'
          ? a.saleNumber.localeCompare(b.saleNumber)
          : b.saleNumber.localeCompare(a.saleNumber);
      }
      if (sortField === 'totalAmount') {
        return sortOrder === 'asc' ? a.totalAmount - b.totalAmount : b.totalAmount - a.totalAmount;
      }
      if (sortField === 'date') {
        const timeA = new Date(`${a.date}T${a.time || '00:00'}`).getTime();
        const timeB = new Date(`${b.date}T${b.time || '00:00'}`).getTime();
        return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
      }
      return 0;
    });
    return list;
  }, [filteredTransactions, sortField, sortOrder]);

  // Dynamic Metrics computed strictly from filtered transactions — a refunded sale still shows up
  // in the list (with its "Remboursé" badge) but must never count toward revenue/ticket totals,
  // since its revenue was reversed.
  const paidFilteredTransactions = useMemo(() => filteredTransactions.filter((t) => t.status !== 'Remboursé'), [filteredTransactions]);
  const totalSalesCount = paidFilteredTransactions.length;
  const totalRevenue = useMemo(() => {
    return paidFilteredTransactions.reduce((acc, curr) => acc + curr.totalAmount, 0);
  }, [paidFilteredTransactions]);
  const averageTicket = totalSalesCount > 0 ? totalRevenue / totalSalesCount : 0;

  // Pagination calculation
  const totalResults = sortedTransactions.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / rowsPerPage));
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return sortedTransactions.slice(start, start + rowsPerPage);
  }, [sortedTransactions, currentPage, rowsPerPage]);

  const handleSort = (field: 'saleNumber' | 'totalAmount' | 'date') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handlePrint = (sale: SaleTransaction) => {
    setSelectedSaleForModal(sale);
  };

  const handleThermalPrint = () => {
    if (!selectedSaleForModal) return;
    openPrintDocument(buildThermalReceiptDoc(selectedSaleForModal));
  };

  const handleA4Print = () => {
    if (!selectedSaleForModal) return;
    openPrintDocument(buildA4ReceiptDoc(selectedSaleForModal));
  };

  const handleGeneratePdf = () => {
    if (!selectedSaleForModal) return;
    // Browsers don't expose a direct "save as PDF" API; reusing the print dialog
    // lets the user pick "Enregistrer au format PDF" as the destination.
    openPrintDocument(buildA4ReceiptDoc(selectedSaleForModal));
  };

  const handleDownloadHtml = () => {
    if (!selectedSaleForModal) return;
    const html = buildThermalReceiptDoc(selectedSaleForModal);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ticket_${selectedSaleForModal.saleNumber}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const headers = ['N° Ticket', 'Service', 'Emplacement', 'Articles', 'Mode Paiement', 'Barista', 'Total (DT)', 'Date', 'Heure'];
    const rows = sortedTransactions.map((t) => [
      t.saleNumber,
      `"${t.serviceType}"`,
      `"${t.tableOrArea}"`,
      `"${t.itemsSummary}"`,
      `"${t.paymentMethod}"`,
      `"${t.barista}"`,
      t.totalAmount.toFixed(2),
      t.date,
      t.time,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `tickets_cafe_noir_${selectedYear}_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper for service badge styling (only Sur place and À emporter)
  const getServiceBadge = (type: ServiceType) => {
    switch (type) {
      case 'Sur place':
        return 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70';
      case 'À emporter':
        return 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/70';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  // Helper for payment icon (only Espèces, Carte bancaire, Ticket resto)
  const getPaymentIcon = (method: PaymentMethod) => {
    switch (method) {
      case 'Espèces':
        return <Banknote size={12} className="text-emerald-500" />;
      case 'Carte bancaire':
        return <CreditCard size={12} className="text-blue-500" />;
      case 'Ticket resto':
        return <Ticket size={12} className="text-amber-500" />;
    }
  };

  const selectedMonthObj = MONTHS_LIST.find((m) => m.label === selectedMonth);
  const selectedPeriodLabel =
    selectedMonth === 'all'
      ? `Année complète ${selectedYear}`
      : `${selectedMonthObj ? selectedMonthObj.fullName : selectedMonth} ${selectedYear}`;

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Page Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>Gestion des ventes</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Café & Caisse
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Historique des commandes, tickets de caisse et consommations Café Noir.
          </p>
        </div>

        {/* Actions: Export CSV & Retour au Tableau de bord */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            id="export-sales-csv-button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer"
          >
            <Download size={14} className="text-gray-500 dark:text-gray-400" />
            <span>Exporter les tickets</span>
          </button>

          <button
            onClick={onNavigateToDashboard}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700/80 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition active:scale-98 cursor-pointer"
          >
            <span>Tableau de bord</span>
          </button>
        </div>
      </div>

      {/* 3 Balanced Metric / KPI Cards (Client KPI successfully removed) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        {/* Card 1: Ventes Totales (Tickets) */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">
              Ventes Totales (Tickets)
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                {totalSalesCount}
              </span>
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md">
                Commandes
              </span>
            </div>
            <p className="text-[11px] text-gray-400">
              Enregistrées sur la période sélectionnée
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 flex items-center justify-center text-blue-500 shrink-0">
            <Receipt size={22} />
          </div>
        </div>

        {/* Card 2: Chiffre d'Affaires / Revenu Total */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">
              Chiffre d'Affaires Encaissé
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                {totalRevenue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-xs font-bold text-gray-600 dark:text-gray-400">DT</span>
            </div>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <Sparkles size={11} /> 100% des règlements validés
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-500 shrink-0 font-bold text-lg">
            <TrendingUp size={22} />
          </div>
        </div>

        {/* Card 3: Valeur Moyenne De L'ordre / Ticket Moyen */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between hover:border-gray-200 dark:hover:border-gray-700 transition">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">
              Panier / Ticket Moyen
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                {averageTicket.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-xs font-bold text-gray-600 dark:text-gray-400">DT</span>
            </div>
            <p className="text-[11px] text-gray-400">
              Moyenne par consommateur / commande
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 flex items-center justify-center text-amber-500 shrink-0">
            <Coffee size={22} />
          </div>
        </div>
      </div>

      {/* Intelligent Date Filter Bar (Year + 12 Intelligent French Months + All Year) */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-3.5">
        {/* Top line: Year Selector + Quick Presets */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800/80 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Période d'activité :
            </span>
            <span className="text-sm font-bold text-gray-900 dark:text-white">
              {selectedPeriodLabel}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Year switch */}
            <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg p-0.5 bg-gray-50/50 dark:bg-gray-800/50">
              <button
                onClick={() => {
                  setSelectedYear((y) => y - 1);
                  setCurrentPage(1);
                }}
                className="w-7 h-7 rounded-md flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 transition cursor-pointer"
                title="Année précédente"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="px-3 text-xs font-bold text-gray-900 dark:text-white">
                {selectedYear}
              </span>
              <button
                onClick={() => {
                  setSelectedYear((y) => y + 1);
                  setCurrentPage(1);
                }}
                className="w-7 h-7 rounded-md flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 transition cursor-pointer"
                title="Année suivante"
              >
                <ChevronRight size={15} />
              </button>
            </div>

            {/* Smart shortcut to Current Month (Septembre) */}
            <button
              onClick={() => {
                setSelectedYear(2026);
                setSelectedMonth('Sep');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition cursor-pointer ${
                selectedYear === 2026 && selectedMonth === 'Sep'
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 shadow-2xs'
                  : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              Mois en cours (Sep)
            </button>

            {/* Smart shortcut for All Year */}
            <button
              onClick={() => {
                setSelectedMonth('all');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition cursor-pointer ${
                selectedMonth === 'all'
                  ? 'border-emerald-500 bg-[#00A86B] text-white shadow-xs'
                  : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              Toute l'année
            </button>
          </div>
        </div>

        {/* 12 Intelligent French Month Pills with dynamic activity indicators */}
        <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 sm:gap-2">
          {MONTHS_LIST.map((m) => {
            const isCurrentActive = selectedMonth === m.label;
            const count = monthActivityMap.get(m.label) || 0;
            const hasData = count > 0;

            return (
              <button
                key={m.id}
                onClick={() => {
                  setSelectedMonth(m.label);
                  setCurrentPage(1);
                }}
                title={`${m.fullName} ${selectedYear} (${count} tickets enregistrés)`}
                className={`group relative py-2 px-1 rounded-xl text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                  isCurrentActive
                    ? 'bg-[#00A86B] text-white shadow-sm font-bold ring-2 ring-emerald-400/50 dark:ring-emerald-500/50'
                    : hasData
                    ? 'border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80 text-gray-800 dark:text-gray-200 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-gray-50'
                    : 'border border-dashed border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 text-gray-400 dark:text-gray-600 hover:text-gray-700'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span className="text-xs">{m.label}</span>
                  {/* Subtle intelligent activity indicator dot */}
                  {hasData && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isCurrentActive ? 'bg-white' : 'bg-emerald-500'
                      }`}
                    />
                  )}
                </div>

                {/* Subtext count badge */}
                <span
                  className={`text-[10px] mt-0.5 leading-none ${
                    isCurrentActive
                      ? 'text-emerald-100'
                      : hasData
                      ? 'text-gray-500 dark:text-gray-400'
                      : 'text-gray-300 dark:text-gray-700'
                  }`}
                >
                  {count > 0 ? `${count}` : '—'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Intelligent contextual stats banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 px-3.5 py-2 rounded-xl border border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
            <span>
              <strong className="text-gray-800 dark:text-gray-200 font-semibold">{selectedPeriodLabel}</strong> : {totalSalesCount} tickets de caisse • Total {totalRevenue.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} DT
            </span>
          </div>
          <span className="text-[11px] text-gray-400 mt-1 sm:mt-0">
            Mise à jour en temps réel avec le point de vente
          </span>
        </div>
      </div>

      {/* Filter Row: Search + Service Type + Payment Method + Category + Reset */}
      <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 flex-1">
            {/* Search Input */}
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="N° ticket, boisson, table, barista..."
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Service Type Filter (Only Sur place and À emporter) */}
            <div className="relative">
              <select
                value={selectedService}
                onChange={(e) => {
                  setSelectedService(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="all">Tous les services (Sur place, À emporter)</option>
                <option value="Sur place">Sur place</option>
                <option value="À emporter">À emporter</option>
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
            </div>

            {/* Payment Method Filter (Only Espèces, Carte bancaire, Ticket resto) */}
            <div className="relative">
              <select
                value={selectedPayment}
                onChange={(e) => {
                  setSelectedPayment(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="all">Tous les modes de règlement</option>
                <option value="Espèces">Espèces</option>
                <option value="Carte bancaire">Carte bancaire</option>
                <option value="Ticket resto">Ticket resto</option>
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
            </div>

            {/* Category Filter */}
            <div className="relative">
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="all">Toutes les catégories</option>
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
            </div>

            {/* Employee Filter */}
            <div className="relative">
              <select
                value={selectedEmployee}
                onChange={(e) => {
                  setSelectedEmployee(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full appearance-none pl-3.5 pr-8 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="all">Tous les employés</option>
                {availableEmployees.map((emp) => (
                  <option key={emp} value={emp}>{emp}</option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
            </div>
          </div>

          {/* Reset Filters button */}
          <button
            onClick={handleResetFilters}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 shadow-2xs transition active:scale-98 shrink-0 cursor-pointer"
          >
            <FilterX size={14} className="text-gray-500" />
            <span>Réinitialiser</span>
          </button>
        </div>
      </div>

      {/* Café Sales Transactions Table (Client & Branch removed and replaced with authentic Café fields) */}
      <div className="rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 text-[11px] font-bold text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-gray-800/30">
                <th className="py-3.5 px-4 w-12 text-center">#</th>
                <th
                  onClick={() => handleSort('saleNumber')}
                  className="py-3.5 px-4 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>N° de vente</span>
                    <span className="text-[10px] opacity-70">⇅</span>
                  </div>
                </th>
                <th className="py-3.5 px-4">Consommations & Articles Café</th>
                <th className="py-3.5 px-4">Service</th>
                <th className="py-3.5 px-4">Règlement</th>
                <th
                  onClick={() => handleSort('totalAmount')}
                  className="py-3.5 px-4 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>Total (TTC)</span>
                    <span className="text-[10px] opacity-70">⇅</span>
                  </div>
                </th>
                <th
                  onClick={() => handleSort('date')}
                  className="py-3.5 px-4 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>Date & Heure</span>
                    <span className="text-[10px] opacity-70">⇅</span>
                  </div>
                </th>
                <th className="py-3.5 px-4 text-center">Statut</th>
                <th className="py-3.5 px-4 text-center">Ticket</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 text-xs">
              {paginatedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-400">
                    <div className="max-w-sm mx-auto space-y-2">
                      <Coffee className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600" />
                      <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">
                        Aucun ticket pour cette sélection
                      </p>
                      <p className="text-xs text-gray-400">
                        Essayez de sélectionner un autre mois ou cliquez sur le bouton ci-dessous pour revenir au mois actif.
                      </p>
                      <button
                        onClick={() => {
                          setSelectedMonth('Sep');
                          setSelectedYear(2026);
                        }}
                        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer"
                      >
                        Afficher Septembre 2026
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedTransactions.map((tx, idx) => {
                  const globalIndex = (currentPage - 1) * rowsPerPage + idx + 1;
                  return (
                    <tr
                      key={tx.id}
                      className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors"
                    >
                      {/* # Index */}
                      <td className="py-3.5 px-4 text-center font-bold text-gray-400 dark:text-gray-500">
                        {globalIndex}
                      </td>

                      {/* Sale ID Badge */}
                      <td className="py-3.5 px-4 font-mono font-bold">
                        <button
                          onClick={() => setSelectedSaleForModal(tx)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 hover:bg-emerald-100/80 transition cursor-pointer"
                          title="Cliquer pour afficher le reçu détaillé"
                        >
                          <Receipt size={12} className="text-emerald-500" />
                          <span>{tx.saleNumber}</span>
                        </button>
                      </td>

                      {/* Café Consumptions & Articles */}
                      <td className="py-3.5 px-4 max-w-[340px]">
                        <div className="space-y-1">
                          <p className="font-semibold text-gray-900 dark:text-white line-clamp-1 flex items-center gap-1.5">
                            <span className="line-clamp-1">{tx.itemsSummary}</span>
                            {tx.note && (
                              <span title={tx.note} className="shrink-0 text-amber-500">
                                <Info size={12} />
                              </span>
                            )}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                            <span className="inline-flex items-center gap-1">
                              <Coffee size={11} className="text-amber-500" />
                              <span>{tx.itemsCount} {tx.itemsCount > 1 ? 'articles' : 'article'}</span>
                            </span>
                            <span>•</span>
                            <span className="text-gray-400">Barista {tx.barista}</span>
                          </div>
                        </div>
                      </td>

                      {/* Service (Only Sur place and À emporter) */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1 items-start">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${getServiceBadge(
                              tx.serviceType
                            )}`}
                          >
                            {tx.serviceType === 'Sur place' ? (
                              <Utensils size={10} />
                            ) : (
                              <ShoppingBag size={10} />
                            )}
                            <span>{tx.serviceType}</span>
                          </span>
                          <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 pl-0.5">
                            {tx.serviceType === 'Sur place' ? tx.tableOrArea : 'Comptoir'}
                          </span>
                        </div>
                      </td>

                      {/* Payment Method */}
                      <td className="py-3.5 px-4">
                        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700/80 text-[11px] font-medium text-gray-700 dark:text-gray-300">
                          {getPaymentIcon(tx.paymentMethod)}
                          <span>{tx.paymentMethod}</span>
                        </div>
                      </td>

                      {/* Total Amount in DT */}
                      <td className="py-3.5 px-4 font-bold text-gray-900 dark:text-white">
                        <span className="text-sm">
                          {tx.totalAmount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>{' '}
                        <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">DT</span>
                      </td>

                      {/* Date & Exact Time */}
                      <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300">
                        <div className="flex flex-col text-[11px]">
                          <div className="flex items-center gap-1 font-medium text-gray-800 dark:text-gray-200">
                            <CalendarIcon size={12} className="text-gray-400" />
                            <span>{tx.date}</span>
                          </div>
                          <div className="flex items-center gap-1 text-gray-400 pl-4">
                            <Clock size={11} />
                            <span>{tx.time}</span>
                          </div>
                        </div>
                      </td>

                      {/* Statut */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                            tx.status === 'Remboursé'
                              ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/70'
                              : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70'
                          }`}
                        >
                          {tx.status}
                        </span>
                      </td>

                      {/* Actions (View/Print Receipt, Refund) */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handlePrint(tx)}
                            title="Imprimer le ticket de caisse"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer"
                          >
                            <Printer size={16} />
                          </button>
                          {tx.status === 'Payé' && (
                            <button
                              onClick={() => handleRefund(tx)}
                              disabled={refundingId === tx.id}
                              title="Rembourser cette vente"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Undo2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer & Pagination */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <span>Afficher</span>
            <select
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="py-1 px-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-medium cursor-pointer"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
            <span>sur un total de {totalResults} tickets</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
              title="Page précédente"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 py-1 font-semibold text-gray-700 dark:text-gray-300">
              Page {currentPage} sur {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
              title="Page suivante"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Ticket / Receipt Modal — "Vue d'avance de la réception" (Café Noir Branded Receipt) */}
      {selectedSaleForModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setSelectedSaleForModal(null)}
        >
          <div
            className="relative w-full max-w-6xl max-h-[90vh] rounded-lg bg-white dark:bg-[#151D2A] border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Top Bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-lg font-semibold leading-none tracking-tight flex items-center text-gray-900 dark:text-white">
                <Receipt className="h-5 w-5 mr-2 text-emerald-500" />
                <span>Vue d'avance de la réception - {selectedSaleForModal.saleNumber}</span>
              </h2>
              <button
                onClick={() => setSelectedSaleForModal(null)}
                className="absolute right-4 top-4 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            </div>

            <div className="flex flex-col lg:flex-row h-[75vh] overflow-hidden">
              {/* Left: Receipt live preview */}
              <div className="flex-1 p-6 lg:border-r border-gray-100 dark:border-gray-800 flex flex-col overflow-hidden">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Vue d'avance de la réception
                </div>
                <div className="flex-1 bg-[#F0F0F1] dark:bg-gray-800 rounded-lg p-4 overflow-y-auto custom-scrollbar">
                  <div
                    className="thermal-receipt mx-auto"
                    style={{
                      width: '80mm',
                      maxWidth: 302,
                      padding: 8,
                      fontFamily: "'Courier New', monospace",
                      fontSize: 12,
                      lineHeight: 1.2,
                      backgroundColor: 'white',
                      color: 'black',
                    }}
                  >
                    <div style={{ textAlign: 'center', marginBottom: 8 }}>
                      <div style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 4 }}>CAFÉ NOIR</div>
                      <div style={{ fontSize: 10, marginBottom: 2 }}>Torréfacteur & Coffee Shop Artisanal</div>
                      <div style={{ fontSize: 10, marginBottom: 2 }}>Avenue Habib Bourguiba, Tunis • MF: 1482930/B</div>
                    </div>
                    <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span>Ticket N° :</span><span>{selectedSaleForModal.saleNumber}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span>Date :</span><span>{selectedSaleForModal.date}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span>Heure :</span><span>{selectedSaleForModal.time}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span>Barista :</span><span>{selectedSaleForModal.barista}</span>
                      </div>
                    </div>
                    <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span>Service :</span><span>{selectedSaleForModal.serviceType}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span>{selectedSaleForModal.serviceType === 'Sur place' ? 'Table' : 'Emplacement'} :</span>
                        <span>{selectedSaleForModal.tableOrArea}</span>
                      </div>
                    </div>
                    <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />

                    {/* Items */}
                    <div style={{ marginBottom: 8 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: 11,
                          fontWeight: 'bold',
                          borderBottom: '1px solid #000',
                          paddingBottom: 3,
                          marginBottom: 4,
                        }}
                      >
                        <span>Désignation</span>
                        <span>Montant</span>
                      </div>
                      {selectedSaleForModal.items.map((it, idx) => {
                        const { rate, tax } = getItemVat(it);
                        return (
                          <div
                            key={idx}
                            style={{
                              marginBottom: 5,
                              paddingBottom: 5,
                              borderBottom: '1px dashed #aaa',
                            }}
                          >
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 'bold',
                                marginBottom: 2,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {it.name}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                              <span>{it.qty} x {it.price.toFixed(2)} DT</span>
                              <span style={{ fontWeight: 'bold' }}>{(it.qty * it.price).toFixed(2)} DT</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginTop: 1, color: '#555' }}>
                              <span>TVA: {(rate * 100).toFixed(2)}%</span>
                              <span>{tax.toFixed(2)} DT</span>
                            </div>
                          </div>
                        );
                      })}

                      <div style={{ marginTop: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, fontSize: 11 }}>
                          <span>Total Articles :</span><span>{selectedSaleForModal.itemsCount}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, fontSize: 11 }}>
                          <span>Sous-total HT :</span><span>{getReceiptTotals(selectedSaleForModal).subtotalHT.toFixed(2)} DT</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, fontSize: 11 }}>
                          <span>TVA :</span><span>{getReceiptTotals(selectedSaleForModal).tva.toFixed(2)} DT</span>
                        </div>
                        <div
                          style={{
                            borderTop: '1px solid #000',
                            marginTop: 4,
                            paddingTop: 4,
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontWeight: 'bold',
                            fontSize: 13,
                          }}
                        >
                          <span>TOTAL TTC</span><span>{selectedSaleForModal.totalAmount.toFixed(2)} DT</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span>Règlement :</span>
                        <span style={{ textTransform: 'capitalize' }}>{selectedSaleForModal.paymentMethod}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span>Payé :</span><span>{selectedSaleForModal.totalAmount.toFixed(2)} DT</span>
                      </div>
                    </div>
                    {selectedSaleForModal.note && (
                      <>
                        <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />
                        <div style={{ fontSize: 10 }}>
                          <div style={{ fontWeight: 600, marginBottom: 2 }}>Note :</div>
                          <div>{selectedSaleForModal.note}</div>
                        </div>
                      </>
                    )}
                    <div style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />
                    <div style={{ textAlign: 'center', fontSize: 10 }}>
                      <div>Merci pour votre visite !</div>
                      <div>À bientôt chez Café Noir</div>
                    </div>
                    <div style={{ marginTop: 16, textAlign: 'center', fontSize: 10 }}>
                      <div>* * * * * * * * * * * * * *</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Print / Download options + guide */}
              <div className="w-full lg:w-80 p-6 flex flex-col overflow-y-auto custom-scrollbar">
                <div className="space-y-6">
                  {/* Print options */}
                  <div>
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Options d'impression
                    </div>
                    <div className="space-y-3">
                      <button
                        onClick={handleThermalPrint}
                        className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition h-9 px-4 py-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                      >
                        <Printer className="h-4 w-4 mr-2" />
                        Impression thermique
                      </button>
                      <button
                        onClick={handleA4Print}
                        className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition h-9 px-4 py-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        A4 Imprimer
                      </button>
                    </div>
                  </div>

                  {/* Download options */}
                  <div>
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Options de téléchargement
                    </div>
                    <div className="space-y-3">
                      <button
                        onClick={handleDownloadHtml}
                        className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition h-9 px-4 py-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Fichier HTML
                      </button>
                      <button
                        onClick={handleGeneratePdf}
                        className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition h-9 px-4 py-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Générer le fichier PDF
                      </button>
                    </div>
                  </div>

                  {/* Guide */}
                  <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 p-4 rounded-lg">
                    <div className="flex items-center mb-3">
                      <div className="flex items-center justify-center w-6 h-6 bg-emerald-600 rounded-full mr-2">
                        <Info className="h-3 w-3 text-white" />
                      </div>
                      <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                        Guide des options
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-start space-x-3">
                        <div className="flex items-center justify-center w-8 h-8 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg mt-0.5 shrink-0">
                          <Printer className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">Impression thermique</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">Format 80 mm pour imprimantes thermiques</div>
                        </div>
                      </div>
                      <div className="flex items-start space-x-3">
                        <div className="flex items-center justify-center w-8 h-8 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg mt-0.5 shrink-0">
                          <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">A4 Imprimer</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">Papier standard avec présentation détaillée</div>
                        </div>
                      </div>
                      <div className="flex items-start space-x-3">
                        <div className="flex items-center justify-center w-8 h-8 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg mt-0.5 shrink-0">
                          <Download className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">Fichier HTML</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">Enregistrer en HTML pour une mise en forme personnalisée</div>
                        </div>
                      </div>
                      <div className="flex items-start space-x-3">
                        <div className="flex items-center justify-center w-8 h-8 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg mt-0.5 shrink-0">
                          <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">Générer le fichier PDF</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">Créer un PDF via la fonction d'impression du navigateur</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
