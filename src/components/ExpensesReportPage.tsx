import React, { useMemo, useState } from 'react';
import { Wallet, TrendingDown, TrendingUp, Clock, ClipboardList } from 'lucide-react';
import { Expense, ExpenseCategory } from '../data/expensesModel';
import {
  ReportPeriod,
  getPreviousPeriod,
  getMonthlySeries,
  formatPeriodShort,
  formatPeriodLabel,
  isDateInPeriod,
  computeExpensesMetrics,
  computeExpensesByCategory,
  computeGlobalAlerts,
} from '../data/reportsModel';
import { generateReportPdf } from '../data/reportPdf';
import { ReportPageHeader, ReportKpiCard, ReportSection, ReportTable, ReportAlertsPanel, MiniLineChart, MiniBarChart, formatAmount, formatInt, useReportPeriodParam } from './reportShared';

interface ExpensesReportPageProps {
  expenses: Expense[];
  categories: ExpenseCategory[];
  onNavigateToDashboard: () => void;
  onNavigateToMonthly: () => void;
  isDarkMode?: boolean;
}

const formatDate = (iso: string) => {
  const [y, m, d] = (iso || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso || '—';
};

export const ExpensesReportPage: React.FC<ExpensesReportPageProps> = ({ expenses, categories, onNavigateToDashboard, onNavigateToMonthly }) => {
  const [period, setPeriod] = useReportPeriodParam();
  const previousPeriod = getPreviousPeriod(period);

  const metrics = useMemo(() => computeExpensesMetrics(expenses, period), [expenses, period]);
  const previousMetrics = useMemo(() => computeExpensesMetrics(expenses, previousPeriod), [expenses, previousPeriod]);
  const byCategory = useMemo(() => computeExpensesByCategory(expenses, categories, period), [expenses, categories, period]);
  const series = useMemo(() => getMonthlySeries(period, 6).map((p) => ({ label: formatPeriodShort(p), value: computeExpensesMetrics(expenses, p).total })), [expenses, period]);
  const detail = useMemo(
    () => expenses.filter((e) => isDateInPeriod(e.date, period) && e.status !== 'Rejeté').sort((a, b) => (a.date < b.date ? 1 : -1)),
    [expenses, period]
  );
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? '—';

  const alerts = useMemo(
    () => computeGlobalAlerts({ stockProducts: [], invoices: [], expenses, orders: [], lowMarginProducts: [], employees: [], period }).filter((a) => a.category === 'Dépenses'),
    [expenses, period]
  );

  const handleExportPdf = () => {
    generateReportPdf({
      title: 'Rapport sur les dépenses',
      periodLabel: formatPeriodLabel(period),
      subtitle: 'Total des dépenses, répartition fixe/variable, par catégorie et détail de la période.',
      kpis: [
        { label: 'Total des dépenses', value: formatAmount(metrics.total) },
        { label: 'Dépenses fixes', value: formatAmount(metrics.fixed) },
        { label: 'Dépenses variables', value: formatAmount(metrics.variable) },
        { label: 'En attente de validation', value: formatInt(metrics.pendingCount) },
      ],
      tables: [
        { heading: 'Évolution mensuelle des dépenses', columns: ['Mois', 'Montant'], rows: series.map((s) => [s.label, formatAmount(s.value)]), align: ['left', 'right'] },
        {
          heading: 'Répartition par catégorie',
          columns: ['Catégorie', 'Montant', '% du total'],
          rows: byCategory.map((c) => [c.category.name, formatAmount(c.total), metrics.total > 0 ? `${((c.total / metrics.total) * 100).toFixed(1)}%` : '—']),
          align: ['left', 'right', 'right'],
        },
        {
          heading: 'Détail des dépenses de la période',
          columns: ['Date', 'Titre', 'Catégorie', 'Nature', 'Montant', 'Statut'],
          rows: detail.map((e) => [formatDate(e.date), e.title, categoryName(e.categoryId), e.nature, formatAmount(e.amount), e.status]),
          align: ['left', 'left', 'left', 'left', 'right', 'left'],
          totalsRow: ['', '', '', 'Total', formatAmount(metrics.total), ''],
        },
      ],
      alerts,
      insights: [
        'Les dépenses rejetées ne sont pas comptabilisées dans les totaux (elles ne constituent pas une dépense réelle).',
        'Les dépenses en attente de validation sont comptabilisées dans le total mais méritent une vérification.',
      ],
    });
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <ReportPageHeader
        title="Rapport sur les dépenses"
        description="Total des dépenses, répartition fixe/variable, par catégorie et détail de la période."
        period={period}
        onPeriodChange={setPeriod}
        onExportPdf={handleExportPdf}
        navLinks={[{ label: 'Rapport mensuel', onClick: onNavigateToMonthly, icon: ClipboardList }]}
        onNavigateToDashboard={onNavigateToDashboard}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        <ReportKpiCard label="Total des dépenses" value={formatAmount(metrics.total)} icon={Wallet} color="blue" variation={{ current: metrics.total, previous: previousMetrics.total, invert: true }} />
        <ReportKpiCard label="Dépenses fixes" value={formatAmount(metrics.fixed)} icon={TrendingDown} color="amber" />
        <ReportKpiCard label="Dépenses variables" value={formatAmount(metrics.variable)} icon={TrendingUp} color="emerald" />
        <ReportKpiCard label="En attente" value={formatInt(metrics.pendingCount)} icon={Clock} color="gray" caption="Dépenses à valider" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ReportSection title="Évolution mensuelle">
          <MiniLineChart data={series} color="#dc2626" />
        </ReportSection>
        <ReportSection title="Répartition par catégorie">
          <MiniBarChart data={byCategory.map((c) => ({ label: c.category.name, value: c.total }))} color="bg-blue-500" />
        </ReportSection>
      </div>

      <ReportSection title="Détail des dépenses de la période">
        <ReportTable
          columns={['Date', 'Titre', 'Catégorie', 'Nature', 'Montant', 'Statut']}
          align={['left', 'left', 'left', 'left', 'right', 'left']}
          rows={detail.map((e) => [formatDate(e.date), e.title, categoryName(e.categoryId), e.nature, formatAmount(e.amount), e.status])}
          totalsRow={['', '', '', 'Total', formatAmount(metrics.total), '']}
        />
      </ReportSection>

      <ReportSection title="Alertes et observations">
        <ReportAlertsPanel alerts={alerts} />
      </ReportSection>
    </div>
  );
};
