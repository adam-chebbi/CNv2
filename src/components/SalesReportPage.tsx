import React, { useMemo, useState } from 'react';
import { Receipt, Ticket, Wallet, Undo2, TrendingDown, LineChart, ClipboardList } from 'lucide-react';
import { SaleTransaction } from '../data/salesTransactions';
import { CatalogArticle } from '../data/manualSalesCatalog';
import { SubRecipe } from '../data/productsModel';
import { StockProduct } from '../data/stockModel';
import {
  ReportPeriod,
  getPreviousPeriod,
  getMonthlySeries,
  formatPeriodShort,
  formatPeriodLabel,
  computeSalesMetrics,
  computeTopProducts,
  computeSalesByPaymentMethod,
  computeLowMarginProducts,
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
  formatPercent,
  formatInt,
  useReportPeriodParam,
} from './reportShared';

interface SalesReportPageProps {
  transactions: SaleTransaction[];
  articles: CatalogArticle[];
  stockProducts: StockProduct[];
  subRecipes: SubRecipe[];
  onNavigateToDashboard: () => void;
  onNavigateToMonthly: () => void;
  isDarkMode?: boolean;
}

export const SalesReportPage: React.FC<SalesReportPageProps> = ({ transactions, articles, stockProducts, subRecipes, onNavigateToDashboard, onNavigateToMonthly }) => {
  const [period, setPeriod] = useReportPeriodParam();
  const previousPeriod = getPreviousPeriod(period);

  const metrics = useMemo(() => computeSalesMetrics(transactions, period), [transactions, period]);
  const previousMetrics = useMemo(() => computeSalesMetrics(transactions, previousPeriod), [transactions, previousPeriod]);
  const topProducts = useMemo(() => computeTopProducts(transactions, period, 10), [transactions, period]);
  const byPayment = useMemo(() => computeSalesByPaymentMethod(transactions, period), [transactions, period]);
  const lowMarginProducts = useMemo(() => computeLowMarginProducts(articles, stockProducts, subRecipes, 8), [articles, stockProducts, subRecipes]);
  const series = useMemo(() => getMonthlySeries(period, 6).map((p) => ({ label: formatPeriodShort(p), value: computeSalesMetrics(transactions, p).revenue })), [transactions, period]);

  const alerts = useMemo(
    () =>
      computeGlobalAlerts({ stockProducts: [], invoices: [], expenses: [], orders: [], lowMarginProducts, employees: [], period }).filter(
        (a) => a.category === 'Produits'
      ),
    [lowMarginProducts, period]
  );

  const handleExportPdf = () => {
    generateReportPdf({
      title: 'Rapport sur les ventes',
      periodLabel: formatPeriodLabel(period),
      subtitle: "Chiffre d'affaires, tickets, panier moyen, produits les plus vendus et produits à faible marge.",
      kpis: [
        { label: "Chiffre d'affaires", value: formatAmount(metrics.revenue), caption: `${previousMetrics.revenue > 0 ? formatPercent((metrics.revenue - previousMetrics.revenue) / previousMetrics.revenue) : '—'} vs mois préc.` },
        { label: 'Nombre de tickets', value: formatInt(metrics.ticketCount) },
        { label: 'Panier moyen', value: formatAmount(metrics.averageTicket) },
        { label: 'Montant remboursé', value: formatAmount(metrics.refundedAmount) },
      ],
      tables: [
        {
          heading: 'Évolution mensuelle du chiffre d\'affaires',
          columns: ['Mois', "Chiffre d'affaires"],
          rows: series.map((s) => [s.label, formatAmount(s.value)]),
          align: ['left', 'right'],
        },
        {
          heading: 'Produits les plus vendus',
          columns: ['Produit', 'Quantité vendue', 'CA généré', '% du CA'],
          rows: topProducts.map((p) => [p.name, formatInt(p.qty), formatAmount(p.revenue), metrics.revenue > 0 ? formatPercent(p.revenue / metrics.revenue) : '—']),
          align: ['left', 'right', 'right', 'right'],
        },
        {
          heading: 'Répartition par mode de règlement',
          columns: ['Mode de règlement', 'Nombre de tickets', 'Montant', '% du CA'],
          rows: byPayment.map((p) => [p.method, formatInt(p.count), formatAmount(p.amount), metrics.revenue > 0 ? formatPercent(p.amount / metrics.revenue) : '—']),
          align: ['left', 'right', 'right', 'right'],
        },
        {
          heading: 'Produits à faible marge (sous la cible)',
          columns: ['Produit', 'Coût matière', 'Prix de vente HT', 'Marge brute', 'Taux', 'Cible'],
          rows: lowMarginProducts.map((p) => [p.article.name, formatAmount(p.cost), formatAmount(p.priceHT), formatAmount(p.grossMargin), formatPercent(p.marginRate), formatPercent(p.targetRate)]),
          align: ['left', 'right', 'right', 'right', 'right', 'right'],
        },
      ],
      alerts,
      insights: [
        "Le chiffre d'affaires et le panier moyen ne comptabilisent que les tickets au statut « Payé » (les remboursements sont exclus et indiqués séparément).",
        'Les produits à faible marge sont ceux dont la marge réelle est inférieure à la marge cible définie dans la fiche produit.',
      ],
    });
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <ReportPageHeader
        title="Rapport sur les ventes"
        description="Chiffre d'affaires, tickets, panier moyen, produits les plus vendus et produits à faible marge."
        period={period}
        onPeriodChange={setPeriod}
        onExportPdf={handleExportPdf}
        navLinks={[{ label: 'Rapport mensuel', onClick: onNavigateToMonthly, icon: ClipboardList }]}
        onNavigateToDashboard={onNavigateToDashboard}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        <ReportKpiCard label="Chiffre d'affaires" value={formatAmount(metrics.revenue)} icon={Wallet} color="emerald" variation={{ current: metrics.revenue, previous: previousMetrics.revenue }} />
        <ReportKpiCard label="Nombre de tickets" value={formatInt(metrics.ticketCount)} icon={Ticket} color="blue" variation={{ current: metrics.ticketCount, previous: previousMetrics.ticketCount }} />
        <ReportKpiCard label="Panier moyen" value={formatAmount(metrics.averageTicket)} icon={Receipt} color="indigo" variation={{ current: metrics.averageTicket, previous: previousMetrics.averageTicket }} />
        <ReportKpiCard label="Montant remboursé" value={formatAmount(metrics.refundedAmount)} icon={Undo2} color="red" caption="Tickets remboursés sur la période" />
      </div>

      <ReportSection title="Évolution mensuelle du chiffre d'affaires" description="6 derniers mois, jusqu'à la période sélectionnée.">
        <MiniLineChart data={series} />
      </ReportSection>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ReportSection title="Produits les plus vendus" description="Top 10 sur la période — par chiffre d'affaires généré.">
          <ReportTable
            columns={['Produit', 'Qté', 'CA', '% CA']}
            align={['left', 'right', 'right', 'right']}
            rows={topProducts.map((p) => [p.name, formatInt(p.qty), formatAmount(p.revenue), metrics.revenue > 0 ? formatPercent(p.revenue / metrics.revenue) : '—'])}
          />
        </ReportSection>
        <ReportSection title="Répartition par mode de règlement">
          <ReportTable
            columns={['Mode', 'Tickets', 'Montant', '% CA']}
            align={['left', 'right', 'right', 'right']}
            rows={byPayment.map((p) => [p.method, formatInt(p.count), formatAmount(p.amount), metrics.revenue > 0 ? formatPercent(p.amount / metrics.revenue) : '—'])}
          />
        </ReportSection>
      </div>

      <ReportSection title="Produits à faible marge" description="Produits dont la marge réelle est inférieure à la marge cible — à surveiller pour la rentabilité.">
        <ReportTable
          columns={['Produit', 'Coût matière', 'Prix HT', 'Marge', 'Taux', 'Cible']}
          align={['left', 'right', 'right', 'right', 'right', 'right']}
          rows={lowMarginProducts.map((p) => [
            p.article.name,
            formatAmount(p.cost),
            formatAmount(p.priceHT),
            formatAmount(p.grossMargin),
            <span key="rate" className="font-semibold text-red-600 dark:text-red-400">{formatPercent(p.marginRate)}</span>,
            formatPercent(p.targetRate),
          ])}
          emptyLabel="Aucun produit sous sa marge cible — bon signal."
        />
      </ReportSection>

      <ReportSection title="Alertes et observations">
        <ReportAlertsPanel alerts={alerts} />
      </ReportSection>
    </div>
  );
};
