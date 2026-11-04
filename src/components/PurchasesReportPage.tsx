import React, { useMemo, useState } from 'react';
import { ShoppingCart, ClipboardList, Package, Wallet, AlertTriangle, Truck } from 'lucide-react';
import { Supplier, PurchaseOrder, PurchaseReception, SupplierInvoice, computeOrderTotal, computeInvoiceStatus, isInvoiceOverdue } from '../data/purchasesModel';
import {
  ReportPeriod,
  getPreviousPeriod,
  getMonthlySeries,
  formatPeriodShort,
  formatPeriodLabel,
  isDateInPeriod,
  computePurchasesMetrics,
  computeSupplierPerformance,
  computeGlobalAlerts,
} from '../data/reportsModel';
import { generateReportPdf } from '../data/reportPdf';
import {
  ReportPageHeader,
  ReportKpiCard,
  ReportSection,
  ReportTable,
  ReportAlertsPanel,
  MiniLineChart,
  formatAmount,
  formatInt,
  useReportPeriodParam,
} from './reportShared';

interface PurchasesReportPageProps {
  orders: PurchaseOrder[];
  suppliers: Supplier[];
  receptions: PurchaseReception[];
  invoices: SupplierInvoice[];
  onNavigateToDashboard: () => void;
  onNavigateToMonthly: () => void;
  isDarkMode?: boolean;
}

const formatDate = (iso: string) => {
  const [y, m, d] = (iso || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso || '—';
};

export const PurchasesReportPage: React.FC<PurchasesReportPageProps> = ({ orders, suppliers, receptions, invoices, onNavigateToDashboard, onNavigateToMonthly }) => {
  const [period, setPeriod] = useReportPeriodParam();
  const previousPeriod = getPreviousPeriod(period);

  const metrics = useMemo(() => computePurchasesMetrics(orders, period), [orders, period]);
  const previousMetrics = useMemo(() => computePurchasesMetrics(orders, previousPeriod), [orders, previousPeriod]);
  const supplierPerf = useMemo(() => computeSupplierPerformance(suppliers, orders, receptions, invoices, period), [suppliers, orders, receptions, invoices, period]);
  const series = useMemo(() => getMonthlySeries(period, 6).map((p) => ({ label: formatPeriodShort(p), value: computePurchasesMetrics(orders, p).total })), [orders, period]);
  const ordersInPeriod = useMemo(() => orders.filter((o) => isDateInPeriod(o.orderDate, period)).sort((a, b) => (a.orderDate < b.orderDate ? 1 : -1)), [orders, period]);
  const unpaidInvoices = useMemo(() => invoices.filter((i) => computeInvoiceStatus(i) !== 'Payée').sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)), [invoices]);
  const totalUnpaid = useMemo(() => unpaidInvoices.reduce((s, i) => s + (i.amountTTC - i.amountPaid), 0), [unpaidInvoices]);

  const alerts = useMemo(
    () => computeGlobalAlerts({ stockProducts: [], invoices, expenses: [], orders, lowMarginProducts: [], employees: [], period }).filter((a) => a.category === 'Achats' || a.category === 'Fournisseurs'),
    [invoices, orders, period]
  );

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? '—';

  const handleExportPdf = () => {
    generateReportPdf({
      title: 'Rapport achats & fournisseurs',
      periodLabel: formatPeriodLabel(period),
      subtitle: 'Volume des achats, performance fournisseurs, réceptions et factures impayées.',
      kpis: [
        { label: 'Total des achats', value: formatAmount(metrics.total) },
        { label: 'Commandes passées', value: formatInt(metrics.orderCount) },
        { label: 'Commandes en cours', value: formatInt(metrics.pendingCount) },
        { label: 'Factures impayées', value: formatAmount(totalUnpaid), caption: `${unpaidInvoices.length} facture(s)` },
      ],
      tables: [
        { heading: 'Évolution mensuelle des achats', columns: ['Mois', 'Montant'], rows: series.map((s) => [s.label, formatAmount(s.value)]), align: ['left', 'right'] },
        {
          heading: 'Performance par fournisseur',
          columns: ['Fournisseur', 'Commandes', 'Montant', 'Délai moyen réception', 'Impayé'],
          rows: supplierPerf.map((s) => [s.name, formatInt(s.orderCount), formatAmount(s.totalAmount), s.avgReceptionDays !== null ? `${s.avgReceptionDays.toFixed(1)} j` : '—', formatAmount(s.unpaidInvoiceAmount)]),
          align: ['left', 'right', 'right', 'right', 'right'],
        },
        {
          heading: 'Commandes de la période',
          columns: ['N° achat', 'Fournisseur', 'Date', 'Montant', 'État'],
          rows: ordersInPeriod.map((o) => [o.orderNumber, supplierName(o.supplierId), formatDate(o.orderDate), formatAmount(computeOrderTotal(o)), o.status]),
          align: ['left', 'left', 'left', 'right', 'left'],
        },
        {
          heading: 'Factures fournisseurs non soldées',
          columns: ['Facture', 'Fournisseur', 'Échéance', 'Montant TTC', 'Restant dû', 'Statut'],
          rows: unpaidInvoices.map((i) => [i.invoiceNumber, supplierName(i.supplierId), formatDate(i.dueDate), formatAmount(i.amountTTC), formatAmount(i.amountTTC - i.amountPaid), computeInvoiceStatus(i)]),
          align: ['left', 'left', 'left', 'right', 'right', 'left'],
          totalsRow: ['', '', '', '', formatAmount(totalUnpaid), ''],
        },
      ],
      alerts,
      insights: [
        'Le délai moyen de réception est calculé entre la date de commande et la date de la première réception validée.',
        'Les commandes annulées sont exclues du total des achats.',
      ],
    });
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <ReportPageHeader
        title="Rapport achats & fournisseurs"
        description="Volume des achats, performance fournisseurs, réceptions et factures impayées — regroupe achats et fournisseurs dans un seul rapport cohérent."
        period={period}
        onPeriodChange={setPeriod}
        onExportPdf={handleExportPdf}
        navLinks={[{ label: 'Rapport mensuel', onClick: onNavigateToMonthly, icon: ClipboardList }]}
        onNavigateToDashboard={onNavigateToDashboard}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        <ReportKpiCard label="Total des achats" value={formatAmount(metrics.total)} icon={Wallet} color="blue" variation={{ current: metrics.total, previous: previousMetrics.total, invert: true }} />
        <ReportKpiCard label="Commandes passées" value={formatInt(metrics.orderCount)} icon={ShoppingCart} color="gray" />
        <ReportKpiCard label="Commandes en cours" value={formatInt(metrics.pendingCount)} icon={Package} color="amber" caption="Brouillon, commandée, partielle" />
        <ReportKpiCard label="Factures impayées" value={formatAmount(totalUnpaid)} icon={AlertTriangle} color="red" caption={`${unpaidInvoices.length} facture(s)`} />
      </div>

      <ReportSection title="Évolution mensuelle des achats">
        <MiniLineChart data={series} color="#2563eb" />
      </ReportSection>

      <ReportSection title="Performance par fournisseur" description="Volume traité, délai moyen de réception et encours impayé, par fournisseur.">
        <ReportTable
          columns={['Fournisseur', 'Commandes', 'Montant', 'Délai moyen', 'Impayé']}
          align={['left', 'right', 'right', 'right', 'right']}
          rows={supplierPerf.map((s) => [
            <span key="n" className="font-semibold text-gray-900 dark:text-white flex items-center gap-1.5"><Truck size={11} className="text-gray-400" /> {s.name}</span>,
            formatInt(s.orderCount),
            formatAmount(s.totalAmount),
            s.avgReceptionDays !== null ? `${s.avgReceptionDays.toFixed(1)} j` : '—',
            s.unpaidInvoiceAmount > 0 ? <span key="u" className="font-semibold text-red-600 dark:text-red-400">{formatAmount(s.unpaidInvoiceAmount)}</span> : formatAmount(0),
          ])}
        />
      </ReportSection>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ReportSection title="Commandes de la période">
          <ReportTable
            columns={['N° achat', 'Fournisseur', 'Montant', 'État']}
            align={['left', 'left', 'right', 'left']}
            rows={ordersInPeriod.map((o) => [o.orderNumber, supplierName(o.supplierId), formatAmount(computeOrderTotal(o)), o.status])}
          />
        </ReportSection>
        <ReportSection title="Factures non soldées" description="Toutes échéances confondues, hors factures payées.">
          <ReportTable
            columns={['Facture', 'Fournisseur', 'Échéance', 'Restant dû']}
            align={['left', 'left', 'left', 'right']}
            rows={unpaidInvoices.map((i) => [
              i.invoiceNumber,
              supplierName(i.supplierId),
              <span key="d" className={isInvoiceOverdue(i) ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>{formatDate(i.dueDate)}</span>,
              formatAmount(i.amountTTC - i.amountPaid),
            ])}
          />
        </ReportSection>
      </div>

      <ReportSection title="Alertes et observations">
        <ReportAlertsPanel alerts={alerts} />
      </ReportSection>
    </div>
  );
};
