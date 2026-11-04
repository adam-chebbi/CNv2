import React, { useMemo, useState } from 'react';
import { Boxes, TrendingDown, ClipboardCheck, AlertTriangle, ClipboardList } from 'lucide-react';
import { StockProduct, StockLedgerEntry, getTotalQty } from '../data/stockModel';
import {
  ReportPeriod,
  getPreviousPeriod,
  formatPeriodLabel,
  isDateInPeriod,
  computeStockValue,
  computeStockLosses,
  computeInventoryDiscrepancies,
  computeLowStockProducts,
  computeGlobalAlerts,
} from '../data/reportsModel';
import { generateReportPdf } from '../data/reportPdf';
import { ReportPageHeader, ReportKpiCard, ReportSection, ReportTable, ReportAlertsPanel, formatAmount, formatInt, useReportPeriodParam } from './reportShared';

interface StockReportPageProps {
  stockProducts: StockProduct[];
  stockLedger: StockLedgerEntry[];
  onNavigateToDashboard: () => void;
  onNavigateToMonthly: () => void;
  isDarkMode?: boolean;
}

const formatDateTime = (iso: string) => (iso ? iso.replace('T', ' ').slice(0, 16) : '—');

export const StockReportPage: React.FC<StockReportPageProps> = ({ stockProducts, stockLedger, onNavigateToDashboard, onNavigateToMonthly }) => {
  const [period, setPeriod] = useReportPeriodParam();
  const previousPeriod = getPreviousPeriod(period);

  const stockValue = useMemo(() => computeStockValue(stockProducts), [stockProducts]);
  const losses = useMemo(() => computeStockLosses(stockLedger, period), [stockLedger, period]);
  const previousLosses = useMemo(() => computeStockLosses(stockLedger, previousPeriod), [stockLedger, previousPeriod]);
  const discrepancies = useMemo(() => computeInventoryDiscrepancies(stockLedger, period), [stockLedger, period]);
  const discrepancyValue = useMemo(() => discrepancies.reduce((s, e) => s + Math.abs(e.discrepancyValue ?? 0), 0), [discrepancies]);
  const lowStock = useMemo(() => computeLowStockProducts(stockProducts), [stockProducts]);
  const lossEntries = useMemo(
    () => stockLedger.filter((e) => e.type === 'Perte' && e.status === 'Confirmé' && isDateInPeriod(e.timestamp, period)).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)),
    [stockLedger, period]
  );
  const productName = (id: string) => stockProducts.find((p) => p.id === id)?.name ?? '—';

  const alerts = useMemo(
    () => computeGlobalAlerts({ stockProducts, invoices: [], expenses: [], orders: [], lowMarginProducts: [], employees: [], period }).filter((a) => a.category === 'Stock'),
    [stockProducts, period]
  );

  const handleExportPdf = () => {
    generateReportPdf({
      title: 'Rapport sur les stocks',
      periodLabel: formatPeriodLabel(period),
      subtitle: 'Valeur du stock, pertes, écarts d\'inventaire et produits sous le seuil minimum.',
      kpis: [
        { label: 'Valeur du stock', value: formatAmount(stockValue), caption: 'Valorisation au coût moyen pondéré, à date' },
        { label: 'Pertes de la période', value: formatAmount(losses) },
        { label: "Écarts d'inventaire", value: formatAmount(discrepancyValue), caption: `${discrepancies.length} écart(s)` },
        { label: 'Produits sous le seuil', value: formatInt(lowStock.length) },
      ],
      tables: [
        {
          heading: 'Produits sous le seuil minimum',
          columns: ['Produit', 'Stock actuel', 'Seuil minimum', 'Unité'],
          rows: lowStock.map((p) => [p.name, formatInt(getTotalQty(p)), formatInt(p.minThreshold), p.unit]),
          align: ['left', 'right', 'right', 'left'],
        },
        {
          heading: 'Pertes enregistrées sur la période',
          columns: ['Date', 'Produit', 'Quantité', 'Motif', 'Valeur'],
          rows: lossEntries.map((e) => [formatDateTime(e.timestamp), productName(e.productId), formatInt(Math.abs(e.quantityDelta)), e.reason, formatAmount(Math.abs(e.valueImpact))]),
          align: ['left', 'left', 'right', 'left', 'right'],
          totalsRow: ['', '', '', 'Total', formatAmount(losses)],
        },
        {
          heading: "Écarts d'inventaire de la période",
          columns: ['Date', 'Produit', 'Qté théorique', 'Qté réelle', 'Écart', 'Valeur', 'Décision'],
          rows: discrepancies.map((e) => [formatDateTime(e.timestamp), productName(e.productId), formatInt(e.theoreticalQty ?? 0), formatInt(e.realQty ?? 0), formatInt(e.discrepancyQty ?? 0), formatAmount(Math.abs(e.discrepancyValue ?? 0)), e.inventoryChoice ?? '—']),
          align: ['left', 'left', 'right', 'right', 'right', 'right', 'left'],
        },
      ],
      alerts,
      insights: [
        'La valeur du stock est une photographie à la date de génération du rapport (coût moyen pondéré × quantité), et non une moyenne sur la période.',
        'Un produit apparaît « sous le seuil » lorsque son stock total (réserve + dépôt) est inférieur au seuil minimum défini dans sa fiche.',
      ],
    });
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <ReportPageHeader
        title="Rapport sur les stocks"
        description="Valeur du stock, pertes, écarts d'inventaire et produits sous le seuil minimum."
        period={period}
        onPeriodChange={setPeriod}
        onExportPdf={handleExportPdf}
        navLinks={[{ label: 'Rapport mensuel', onClick: onNavigateToMonthly, icon: ClipboardList }]}
        onNavigateToDashboard={onNavigateToDashboard}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        <ReportKpiCard label="Valeur du stock" value={formatAmount(stockValue)} icon={Boxes} color="blue" caption="À date, au coût moyen pondéré" />
        <ReportKpiCard label="Pertes de la période" value={formatAmount(losses)} icon={TrendingDown} color="red" variation={{ current: losses, previous: previousLosses, invert: true }} />
        <ReportKpiCard label="Écarts d'inventaire" value={formatAmount(discrepancyValue)} icon={ClipboardCheck} color="amber" caption={`${discrepancies.length} écart(s) constaté(s)`} />
        <ReportKpiCard label="Produits sous le seuil" value={formatInt(lowStock.length)} icon={AlertTriangle} color="gray" />
      </div>

      <ReportSection title="Produits sous le seuil minimum">
        <ReportTable
          columns={['Produit', 'Stock actuel', 'Seuil minimum', 'Unité']}
          align={['left', 'right', 'right', 'left']}
          rows={lowStock.map((p) => [
            p.name,
            <span key="q" className={getTotalQty(p) < 0 ? 'text-red-600 dark:text-red-400 font-semibold' : 'font-semibold text-amber-600 dark:text-amber-400'}>{formatInt(getTotalQty(p))}</span>,
            formatInt(p.minThreshold),
            p.unit,
          ])}
          emptyLabel="Tous les produits sont au-dessus de leur seuil minimum."
        />
      </ReportSection>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ReportSection title="Pertes de la période">
          <ReportTable
            columns={['Produit', 'Qté', 'Motif', 'Valeur']}
            align={['left', 'right', 'left', 'right']}
            rows={lossEntries.map((e) => [productName(e.productId), formatInt(Math.abs(e.quantityDelta)), e.reason, formatAmount(Math.abs(e.valueImpact))])}
          />
        </ReportSection>
        <ReportSection title="Écarts d'inventaire">
          <ReportTable
            columns={['Produit', 'Théorique', 'Réel', 'Écart']}
            align={['left', 'right', 'right', 'right']}
            rows={discrepancies.map((e) => [productName(e.productId), formatInt(e.theoreticalQty ?? 0), formatInt(e.realQty ?? 0), formatInt(e.discrepancyQty ?? 0)])}
          />
        </ReportSection>
      </div>

      <ReportSection title="Alertes et observations">
        <ReportAlertsPanel alerts={alerts} />
      </ReportSection>
    </div>
  );
};
