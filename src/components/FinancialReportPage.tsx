import React, { useMemo, useState } from 'react';
import { Wallet, TrendingUp, TrendingDown, PiggyBank, Users, ClipboardList } from 'lucide-react';
import { SaleTransaction } from '../data/salesTransactions';
import { CatalogArticle } from '../data/manualSalesCatalog';
import { SubRecipe } from '../data/productsModel';
import { StockProduct } from '../data/stockModel';
import { Expense } from '../data/expensesModel';
import { PurchaseOrder } from '../data/purchasesModel';
import { Employee, FinancialRecord } from '../data/hrModel';
import {
  ReportPeriod,
  getPreviousPeriod,
  getMonthlySeries,
  formatPeriodShort,
  formatPeriodLabel,
  computeFinancialSummary,
  getResultSynthesisLines,
  computeLowMarginProducts,
  computeGlobalAlerts,
} from '../data/reportsModel';
import { generateReportPdf } from '../data/reportPdf';
import { ReportPageHeader, ReportKpiCard, ReportSection, ReportTable, ReportAlertsPanel, MiniLineChart, MiniBarChart, formatAmount, formatPercent, useReportPeriodParam } from './reportShared';

interface FinancialReportPageProps {
  transactions: SaleTransaction[];
  articles: CatalogArticle[];
  stockProducts: StockProduct[];
  subRecipes: SubRecipe[];
  orders: PurchaseOrder[];
  expenses: Expense[];
  financialRecords: FinancialRecord[];
  employees: Employee[];
  onNavigateToDashboard: () => void;
  onNavigateToMonthly: () => void;
  isDarkMode?: boolean;
}

export const FinancialReportPage: React.FC<FinancialReportPageProps> = ({
  transactions,
  articles,
  stockProducts,
  subRecipes,
  orders,
  expenses,
  financialRecords,
  employees,
  onNavigateToDashboard,
  onNavigateToMonthly,
}) => {
  const [period, setPeriod] = useReportPeriodParam();
  const previousPeriod = getPreviousPeriod(period);

  const summary = useMemo(() => computeFinancialSummary(transactions, articles, stockProducts, subRecipes, orders, expenses, financialRecords, period), [transactions, articles, stockProducts, subRecipes, orders, expenses, financialRecords, period]);
  const previousSummary = useMemo(() => computeFinancialSummary(transactions, articles, stockProducts, subRecipes, orders, expenses, financialRecords, previousPeriod), [transactions, articles, stockProducts, subRecipes, orders, expenses, financialRecords, previousPeriod]);
  const series = useMemo(
    () => getMonthlySeries(period, 6).map((p) => ({ label: formatPeriodShort(p), value: computeFinancialSummary(transactions, articles, stockProducts, subRecipes, orders, expenses, financialRecords, p).estimatedResult })),
    [transactions, articles, stockProducts, subRecipes, orders, expenses, financialRecords, period]
  );
  const lowMarginProducts = useMemo(() => computeLowMarginProducts(articles, stockProducts, subRecipes, 6), [articles, stockProducts, subRecipes]);
  // Rate on the turnover WITHOUT VAT, like the margin itself.
  const marginRate = summary.revenueHT > 0 ? summary.grossMargin / summary.revenueHT : 0;
  const synthesisLines = getResultSynthesisLines(summary);
  const signed = (l: { value: number; kind: string }) => (l.kind === 'minus' ? `- ${formatAmount(l.value)}` : formatAmount(l.value));

  const alerts = useMemo(() => {
    const base = computeGlobalAlerts({ stockProducts: [], invoices: [], expenses: [], orders: [], lowMarginProducts, employees, period });
    if (summary.estimatedResult < 0) base.unshift({ severity: 'critical', category: 'Résultat', message: `Résultat estimé négatif : ${formatAmount(summary.estimatedResult)} pour ${formatPeriodLabel(period)}` });
    return base;
  }, [lowMarginProducts, employees, period, summary.estimatedResult]);

  const costBreakdown = [
    { label: 'Coût matière (COGS)', value: summary.cogs },
    { label: "Dépenses d'exploitation", value: summary.expenses },
    { label: 'Coût du personnel', value: summary.personnelCost },
  ];

  const handleExportPdf = () => {
    generateReportPdf({
      title: 'Rapport financier',
      periodLabel: formatPeriodLabel(period),
      subtitle: "Chiffre d'affaires, marge estimée, charges et résultat estimé de la période — estimation de gestion, pas un bilan comptable officiel.",
      kpis: [
        { label: "Chiffre d'affaires", value: formatAmount(summary.revenue) },
        { label: 'Marge brute estimée', value: formatAmount(summary.grossMargin), caption: `Taux : ${formatPercent(marginRate)}` },
        { label: 'Coût du personnel', value: formatAmount(summary.personnelCost) },
        { label: 'Résultat estimé', value: formatAmount(summary.estimatedResult) },
      ],
      tables: [
        {
          heading: 'Synthèse du résultat estimé',
          columns: ['Poste', 'Montant'],
          rows: synthesisLines.map((l) => [l.label, signed(l)]),
          align: ['left', 'right'],
          totalsRow: ['Résultat estimé', formatAmount(summary.estimatedResult)],
        },
        { heading: 'Évolution du résultat estimé (6 mois)', columns: ['Mois', 'Résultat estimé'], rows: series.map((s) => [s.label, formatAmount(s.value)]), align: ['left', 'right'] },
        {
          heading: 'Produits à faible marge',
          columns: ['Produit', 'Marge', 'Cible'],
          rows: lowMarginProducts.map((p) => [p.article.name, formatPercent(p.marginRate), formatPercent(p.targetRate)]),
          align: ['left', 'right', 'right'],
        },
      ],
      alerts,
      insights: [
        "Le coût matière (COGS) est estimé à partir des fiches techniques des produits vendus ; les articles sans fiche technique ne sont pas inclus dans l'estimation.",
        "Ce rapport est une estimation de gestion interne — il ne constitue pas un bilan comptable ou fiscal officiel.",
        `Achats de la période (${formatAmount(summary.purchases)}) : donnés à titre d'information, ils ne sont pas déduits car déjà reflétés par le coût matière.`,
        "La TVA collectée, les paiements fournisseurs et les salaires versés ne sont pas recomptés dans les dépenses d'exploitation : ils sont déjà pris en compte ailleurs.",
        'Dépenses comptées sur leur date de dépense, indépendamment de leur statut de paiement.',
      ],
    });
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <ReportPageHeader
        title="Rapport financier"
        description="Chiffre d'affaires, marge estimée, charges et résultat estimé de la période — vision de gestion interne, pas un bilan comptable officiel."
        period={period}
        onPeriodChange={setPeriod}
        onExportPdf={handleExportPdf}
        navLinks={[{ label: 'Rapport mensuel', onClick: onNavigateToMonthly, icon: ClipboardList }]}
        onNavigateToDashboard={onNavigateToDashboard}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        <ReportKpiCard label="Chiffre d'affaires" value={formatAmount(summary.revenue)} icon={Wallet} color="blue" variation={{ current: summary.revenue, previous: previousSummary.revenue }} />
        <ReportKpiCard label="Marge brute estimée" value={formatAmount(summary.grossMargin)} icon={TrendingUp} color="emerald" caption={`Taux : ${formatPercent(marginRate)}`} />
        <ReportKpiCard label="Coût du personnel" value={formatAmount(summary.personnelCost)} icon={Users} color="amber" />
        <ReportKpiCard
          label="Résultat estimé"
          value={formatAmount(summary.estimatedResult)}
          icon={PiggyBank}
          color={summary.estimatedResult >= 0 ? 'emerald' : 'red'}
          variation={{ current: summary.estimatedResult, previous: previousSummary.estimatedResult }}
        />
      </div>

      <ReportSection title="Synthèse du résultat estimé" description="Chiffre d'affaires HT moins coût matière, dépenses d'exploitation et coût du personnel. Les achats de la période sont donnés à titre d'information : ils sont déjà reflétés par le coût matière.">
        <ReportTable
          columns={['Poste', 'Montant']}
          align={['left', 'right']}
          rows={synthesisLines.map((l) =>
            l.kind === 'subtotal'
              ? [
                  <span key={`${l.label}-l`} className="font-semibold text-gray-900 dark:text-white">{l.label}</span>,
                  <span key={`${l.label}-v`} className="font-semibold text-gray-900 dark:text-white">{formatAmount(l.value)}</span>,
                ]
              : [l.label, signed(l)]
          )}
          totalsRow={['Résultat estimé', formatAmount(summary.estimatedResult)]}
        />
      </ReportSection>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ReportSection title="Évolution du résultat estimé" description="6 derniers mois.">
          <MiniLineChart data={series} color={summary.estimatedResult >= 0 ? '#00A86B' : '#dc2626'} />
        </ReportSection>
        <ReportSection title="Structure des charges" description="Répartition du mois sélectionné.">
          <MiniBarChart data={costBreakdown} color="bg-amber-500" />
        </ReportSection>
      </div>

      <ReportSection title="Alertes et observations">
        <ReportAlertsPanel alerts={alerts} />
      </ReportSection>
    </div>
  );
};
