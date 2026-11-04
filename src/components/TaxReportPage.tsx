import React, { useMemo, useState } from 'react';
import { Landmark, Receipt, Truck, Scale, Info, ClipboardList } from 'lucide-react';
import { SaleTransaction } from '../data/salesTransactions';
import { Supplier, SupplierInvoice } from '../data/purchasesModel';
import {
  ReportPeriod,
  getPreviousPeriod,
  formatPeriodLabel,
  isDateInPeriod,
  computeTaxSummary,
} from '../data/reportsModel';
import { generateReportPdf } from '../data/reportPdf';
import { ReportPageHeader, ReportKpiCard, ReportSection, ReportTable, formatAmount, formatPercent, useReportPeriodParam } from './reportShared';

interface TaxReportPageProps {
  transactions: SaleTransaction[];
  invoices: SupplierInvoice[];
  suppliers: Supplier[];
  onNavigateToDashboard: () => void;
  onNavigateToMonthly: () => void;
  isDarkMode?: boolean;
}

const formatDate = (iso: string) => {
  const [y, m, d] = (iso || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso || '—';
};

export const TaxReportPage: React.FC<TaxReportPageProps> = ({ transactions, invoices, suppliers, onNavigateToDashboard, onNavigateToMonthly }) => {
  const [period, setPeriod] = useReportPeriodParam();
  const previousPeriod = getPreviousPeriod(period);

  const summary = useMemo(() => computeTaxSummary(transactions, invoices, period), [transactions, invoices, period]);
  const previousSummary = useMemo(() => computeTaxSummary(transactions, invoices, previousPeriod), [transactions, invoices, previousPeriod]);
  const invoicesInPeriod = useMemo(() => invoices.filter((i) => isDateInPeriod(i.invoiceDate, period)).sort((a, b) => (a.invoiceDate < b.invoiceDate ? 1 : -1)), [invoices, period]);
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? '—';

  const handleExportPdf = () => {
    generateReportPdf({
      title: 'Rapport fiscal',
      periodLabel: formatPeriodLabel(period),
      subtitle: "Rapport informatif de suivi de la TVA, calculée par ligne de vente selon le taux propre à chaque produit — ne constitue pas une déclaration fiscale officielle.",
      kpis: [
        { label: 'Ventes brutes (TTC)', value: formatAmount(summary.grossSales) },
        { label: 'CA HT', value: formatAmount(summary.salesHT) },
        { label: 'TVA collectée (ventes)', value: formatAmount(summary.vatCollected) },
        { label: 'TVA déductible (achats)', value: formatAmount(summary.vatDeductible) },
        { label: 'TVA nette', value: formatAmount(summary.netVat), caption: summary.netVat >= 0 ? 'À reverser (estimation)' : 'Crédit de TVA (estimation)' },
      ],
      tables: [
        {
          heading: 'Synthèse TVA de la période',
          columns: ['Élément', 'Montant'],
          rows: [
            ['Ventes brutes (TTC)', formatAmount(summary.grossSales)],
            ["Chiffre d'affaires HT", formatAmount(summary.salesHT)],
            ['TVA collectée sur les ventes', formatAmount(summary.vatCollected)],
            ['Achats HT (factures fournisseurs)', formatAmount(summary.purchasesHT)],
            ['TVA déductible sur achats', `- ${formatAmount(summary.vatDeductible)}`],
          ],
          align: ['left', 'right'],
          totalsRow: ['TVA nette estimée', formatAmount(summary.netVat)],
        },
        {
          heading: 'Ventes par taux de TVA',
          columns: ['Taux', 'TTC', 'HT', 'TVA'],
          rows: summary.vatByRate.map((r) => [formatPercent(r.rate), formatAmount(r.gross), formatAmount(r.net), formatAmount(r.tax)]),
          align: ['left', 'right', 'right', 'right'],
          totalsRow: ['Total', formatAmount(summary.grossSales), formatAmount(summary.salesHT), formatAmount(summary.vatCollected)],
        },
        {
          heading: 'Détail des factures fournisseurs de la période',
          columns: ['Facture', 'Fournisseur', 'Date', 'Montant HT', 'TVA', 'Montant TTC'],
          rows: invoicesInPeriod.map((i) => [i.invoiceNumber, supplierName(i.supplierId), formatDate(i.invoiceDate), formatAmount(i.amountHT), formatAmount(i.vatAmount), formatAmount(i.amountTTC)]),
          align: ['left', 'left', 'left', 'right', 'right', 'right'],
          totalsRow: ['', '', 'Total', formatAmount(summary.purchasesHT), formatAmount(summary.vatDeductible), formatAmount(summary.purchasesHT + summary.vatDeductible)],
        },
      ],
      insights: [
        'La TVA collectée est calculée ligne par ligne, selon le taux configuré pour chaque produit au moment de la vente, puis agrégée par taux — jamais à partir d\'un taux unique.',
        'La TVA déductible provient uniquement des factures fournisseurs enregistrées avec un montant de TVA sur la période.',
        'Ce rapport est un outil de suivi interne — la V1 de la plateforme n\'effectue aucune déclaration fiscale ou sociale officielle.',
      ],
    });
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <ReportPageHeader
        title="Rapport fiscal"
        description="Suivi informatif de la TVA collectée et déductible, calculée selon le taux propre à chaque produit."
        period={period}
        onPeriodChange={setPeriod}
        onExportPdf={handleExportPdf}
        navLinks={[{ label: 'Rapport mensuel', onClick: onNavigateToMonthly, icon: ClipboardList }]}
        onNavigateToDashboard={onNavigateToDashboard}
      />

      <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 text-xs flex items-start gap-2">
        <Info size={15} className="shrink-0 mt-0.5" />
        <span>Rapport informatif de gestion — la V1 de la plateforme n'effectue aucune déclaration fiscale ou sociale officielle. Les montants ci-dessous sont des estimations à vérifier avec votre comptable.</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 sm:gap-5">
        <ReportKpiCard label="Ventes brutes (TTC)" value={formatAmount(summary.grossSales)} icon={Receipt} color="gray" />
        <ReportKpiCard label="CA HT" value={formatAmount(summary.salesHT)} icon={Receipt} color="blue" />
        <ReportKpiCard label="TVA collectée (ventes)" value={formatAmount(summary.vatCollected)} icon={Landmark} color="emerald" variation={{ current: summary.vatCollected, previous: previousSummary.vatCollected }} />
        <ReportKpiCard label="TVA déductible (achats)" value={formatAmount(summary.vatDeductible)} icon={Truck} color="amber" />
        <ReportKpiCard label="TVA nette estimée" value={formatAmount(summary.netVat)} icon={Scale} color={summary.netVat >= 0 ? 'gray' : 'emerald'} caption={summary.netVat >= 0 ? 'À reverser (estimation)' : 'Crédit de TVA (estimation)'} />
      </div>

      <ReportSection title="Synthèse TVA de la période">
        <ReportTable
          columns={['Élément', 'Montant']}
          align={['left', 'right']}
          rows={[
            ['Ventes brutes (TTC)', formatAmount(summary.grossSales)],
            ["Chiffre d'affaires HT", formatAmount(summary.salesHT)],
            ['TVA collectée sur les ventes', formatAmount(summary.vatCollected)],
            ['Achats HT (factures fournisseurs)', formatAmount(summary.purchasesHT)],
            ['TVA déductible sur achats', `- ${formatAmount(summary.vatDeductible)}`],
          ]}
          totalsRow={['TVA nette estimée', formatAmount(summary.netVat)]}
        />
      </ReportSection>

      <ReportSection title="Ventes par taux de TVA">
        <ReportTable
          columns={['Taux', 'TTC', 'HT', 'TVA']}
          align={['left', 'right', 'right', 'right']}
          rows={summary.vatByRate.map((r) => [formatPercent(r.rate), formatAmount(r.gross), formatAmount(r.net), formatAmount(r.tax)])}
          totalsRow={['Total', formatAmount(summary.grossSales), formatAmount(summary.salesHT), formatAmount(summary.vatCollected)]}
        />
      </ReportSection>

      <ReportSection title="Détail des factures fournisseurs de la période">
        <ReportTable
          columns={['Facture', 'Fournisseur', 'Date', 'HT', 'TVA', 'TTC']}
          align={['left', 'left', 'left', 'right', 'right', 'right']}
          rows={invoicesInPeriod.map((i) => [i.invoiceNumber, supplierName(i.supplierId), formatDate(i.invoiceDate), formatAmount(i.amountHT), formatAmount(i.vatAmount), formatAmount(i.amountTTC)])}
          totalsRow={['', '', 'Total', formatAmount(summary.purchasesHT), formatAmount(summary.vatDeductible), formatAmount(summary.purchasesHT + summary.vatDeductible)]}
        />
      </ReportSection>
    </div>
  );
};
