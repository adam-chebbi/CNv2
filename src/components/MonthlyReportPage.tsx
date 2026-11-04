import React, { useMemo, useState } from 'react';
import {
  FileBarChart2,
  Settings2,
  Wallet,
  Ticket,
  Receipt,
  ShoppingCart,
  TrendingDown,
  Users,
  Boxes,
  PiggyBank,
  ShieldCheck,
  ArrowLeft,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { SaleTransaction } from '../data/salesTransactions';
import { CatalogArticle } from '../data/manualSalesCatalog';
import { SubRecipe } from '../data/productsModel';
import { StockProduct, StockLedgerEntry, getTotalQty } from '../data/stockModel';
import { Expense, ExpenseCategory } from '../data/expensesModel';
import { Supplier, PurchaseOrder, PurchaseReception, SupplierInvoice } from '../data/purchasesModel';
import { Employee, FinancialRecord } from '../data/hrModel';
import {
  ReportPeriod,
  getPreviousPeriod,
  formatPeriodLabel,
  computeSalesMetrics,
  computeTopProducts,
  computeLowMarginProducts,
  computePurchasesMetrics,
  computeSupplierPerformance,
  computeExpensesMetrics,
  computeExpensesByCategory,
  computeStockValue,
  computeStockLosses,
  computeInventoryDiscrepancies,
  computeLowStockProducts,
  computePersonnelCost,
  computeFinancialSummary,
  getResultSynthesisLines,
  computeTaxSummary,
  computeGlobalAlerts,
} from '../data/reportsModel';
import { generateReportPdf } from '../data/reportPdf';
import { ReportPeriodNav, ReportKpiCard, ReportSection, ReportTable, ReportAlertsPanel, formatAmount, formatPercent, formatInt, primaryButtonClass, secondaryButtonClass, useReportPeriodParam } from './reportShared';
import { useQueryParam } from '../hooks/useQueryParam';

interface MonthlyReportPageProps {
  transactions: SaleTransaction[];
  articles: CatalogArticle[];
  stockProducts: StockProduct[];
  subRecipes: SubRecipe[];
  stockLedger: StockLedgerEntry[];
  expenses: Expense[];
  expenseCategories: ExpenseCategory[];
  orders: PurchaseOrder[];
  suppliers: Supplier[];
  receptions: PurchaseReception[];
  invoices: SupplierInvoice[];
  employees: Employee[];
  financialRecords: FinancialRecord[];
  onNavigateToDashboard: () => void;
  isDarkMode?: boolean;
}

type Mode = 'configure' | 'preview';

export const MonthlyReportPage: React.FC<MonthlyReportPageProps> = ({
  transactions,
  articles,
  stockProducts,
  subRecipes,
  stockLedger,
  expenses,
  expenseCategories,
  orders,
  suppliers,
  receptions,
  invoices,
  employees,
  financialRecords,
  onNavigateToDashboard,
}) => {
  const [period, setPeriod] = useReportPeriodParam();
  // ?generated=1 lets a deep link open the report straight into its preview — the applied period
  // already comes from the URL via useReportPeriodParam above.
  const [generatedParam, setGeneratedParam] = useQueryParam('generated');
  const [mode, setMode] = useState<Mode>(generatedParam === '1' ? 'preview' : 'configure');
  const [draftPeriod, setDraftPeriod] = useState<ReportPeriod>(period);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exported, setExported] = useState(false);

  const previousPeriod = getPreviousPeriod(period);

  // --- All domain computations, assembled once for the consolidated report ---
  const sales = useMemo(() => computeSalesMetrics(transactions, period), [transactions, period]);
  const previousSales = useMemo(() => computeSalesMetrics(transactions, previousPeriod), [transactions, previousPeriod]);
  const topProducts = useMemo(() => computeTopProducts(transactions, period, 5), [transactions, period]);
  const lowMarginProducts = useMemo(() => computeLowMarginProducts(articles, stockProducts, subRecipes, 5), [articles, stockProducts, subRecipes]);
  // Untruncated — only used to feed the alert's *count*, so "X produit(s) sous leur marge cible"
  // reflects the true total even when the table above only ever shows the worst 5.
  const allLowMarginProducts = useMemo(() => computeLowMarginProducts(articles, stockProducts, subRecipes, articles.length), [articles, stockProducts, subRecipes]);

  const purchases = useMemo(() => computePurchasesMetrics(orders, period), [orders, period]);
  const supplierPerf = useMemo(() => computeSupplierPerformance(suppliers, orders, receptions, invoices, period).slice(0, 5), [suppliers, orders, receptions, invoices, period]);

  const expensesMetrics = useMemo(() => computeExpensesMetrics(expenses, period), [expenses, period]);
  const expensesByCategory = useMemo(() => computeExpensesByCategory(expenses, expenseCategories, period), [expenses, expenseCategories, period]);

  const stockValue = useMemo(() => computeStockValue(stockProducts), [stockProducts]);
  const stockLosses = useMemo(() => computeStockLosses(stockLedger, period), [stockLedger, period]);
  const discrepancies = useMemo(() => computeInventoryDiscrepancies(stockLedger, period), [stockLedger, period]);
  const lowStock = useMemo(() => computeLowStockProducts(stockProducts), [stockProducts]);

  const personnelCost = useMemo(() => computePersonnelCost(financialRecords, period), [financialRecords, period]);

  const financialSummary = useMemo(() => computeFinancialSummary(transactions, articles, stockProducts, subRecipes, orders, expenses, financialRecords, period), [transactions, articles, stockProducts, subRecipes, orders, expenses, financialRecords, period]);

  const taxSummary = useMemo(() => computeTaxSummary(transactions, invoices, period), [transactions, invoices, period]);

  const alerts = useMemo(
    () => computeGlobalAlerts({ stockProducts, invoices, expenses, orders, lowMarginProducts: allLowMarginProducts, employees, period }),
    [stockProducts, invoices, expenses, orders, allLowMarginProducts, employees, period]
  );

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? '—';

  const handleGenerate = async () => {
    setIsGenerating(true);
    await new Promise((r) => setTimeout(r, 400));
    setPeriod(draftPeriod);
    setGeneratedParam('1');
    setIsGenerating(false);
    setExported(false);
    setMode('preview');
  };

  const handleBackToConfigure = () => {
    setMode('configure');
    setGeneratedParam('');
    setExported(false);
  };

  const handleExportPdf = async () => {
    setIsExporting(true);
    await new Promise((r) => setTimeout(r, 300));
    generateReportPdf({
      title: 'Rapport mensuel de gestion',
      periodLabel: formatPeriodLabel(period),
      subtitle: "Synthèse consolidée : ventes, achats & fournisseurs, dépenses, stock, personnel, marge estimée et fiscalité.",
      kpis: [
        { label: "Chiffre d'affaires", value: formatAmount(sales.revenue) },
        { label: 'Tickets / panier moyen', value: `${formatInt(sales.ticketCount)} / ${formatAmount(sales.averageTicket)}` },
        { label: 'Achats', value: formatAmount(purchases.total) },
        { label: 'Dépenses', value: formatAmount(expensesMetrics.total) },
        { label: 'Coût du personnel', value: formatAmount(personnelCost.total) },
        { label: 'Marge brute estimée', value: formatAmount(financialSummary.grossMargin) },
        { label: 'Valeur du stock', value: formatAmount(stockValue) },
        { label: 'Résultat estimé', value: formatAmount(financialSummary.estimatedResult) },
      ],
      tables: [
        {
          heading: 'Ventes — produits les plus vendus',
          columns: ['Produit', 'Qté', 'CA généré'],
          rows: topProducts.map((p) => [p.name, formatInt(p.qty), formatAmount(p.revenue)]),
          align: ['left', 'right', 'right'],
        },
        {
          heading: 'Ventes — produits à faible marge',
          columns: ['Produit', 'Marge', 'Cible'],
          rows: lowMarginProducts.map((p) => [p.article.name, formatPercent(p.marginRate), formatPercent(p.targetRate)]),
          align: ['left', 'right', 'right'],
        },
        {
          heading: 'Achats & fournisseurs — top fournisseurs',
          columns: ['Fournisseur', 'Commandes', 'Montant', 'Impayé'],
          rows: supplierPerf.map((s) => [s.name, formatInt(s.orderCount), formatAmount(s.totalAmount), formatAmount(s.unpaidInvoiceAmount)]),
          align: ['left', 'right', 'right', 'right'],
        },
        {
          heading: 'Dépenses par catégorie',
          columns: ['Catégorie', 'Montant'],
          rows: expensesByCategory.map((c) => [c.category.name, formatAmount(c.total)]),
          align: ['left', 'right'],
          totalsRow: ['Total', formatAmount(expensesMetrics.total)],
        },
        {
          heading: 'Stock — produits sous le seuil',
          columns: ['Produit', 'Stock actuel', 'Seuil'],
          rows: lowStock.slice(0, 10).map((p) => [p.name, formatInt(getTotalQty(p)), formatInt(p.minThreshold)]),
          align: ['left', 'right', 'right'],
        },
        {
          heading: 'Synthèse du résultat estimé',
          columns: ['Poste', 'Montant'],
          rows: getResultSynthesisLines(financialSummary).map((l) => [l.label, l.kind === 'minus' ? `- ${formatAmount(l.value)}` : formatAmount(l.value)]),
          align: ['left', 'right'],
          totalsRow: ['Résultat estimé', formatAmount(financialSummary.estimatedResult)],
        },
        {
          heading: 'Fiscalité (informatif)',
          columns: ['Élément', 'Montant'],
          rows: [
            ["CA HT", formatAmount(taxSummary.salesHT)],
            ['TVA collectée', formatAmount(taxSummary.vatCollected)],
            ['TVA déductible', `- ${formatAmount(taxSummary.vatDeductible)}`],
          ],
          align: ['left', 'right'],
          totalsRow: ['TVA nette estimée', formatAmount(taxSummary.netVat)],
        },
      ],
      alerts,
      insights: [
        'Ce rapport consolide les indicateurs clés issus des modules Ventes, Stock, Achats, Dépenses, Personnel et Fiscalité — chaque module dispose également de son propre rapport détaillé.',
        "Le coût matière et la marge sont des estimations basées sur les fiches techniques des produits vendus.",
        "La section fiscale est informative — la V1 de la plateforme n'effectue aucune déclaration officielle.",
      ],
    });
    setIsExporting(false);
    setExported(true);
  };

  if (mode === 'configure') {
    return (
      <div className="space-y-5 animate-in fade-in duration-200">
        <div className="pt-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>Rapport mensuel de gestion</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Rapports et analyses
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-2xl">
            Synthèse consolidée de tous les indicateurs de gestion du mois — ventes, achats, dépenses, stock, personnel, marge et fiscalité — en un seul document.
          </p>
        </div>

        <div className="max-w-lg mx-auto mt-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-5 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-500 mx-auto">
              <Settings2 size={28} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Configurer le rapport</h2>
              <p className="text-xs text-gray-400 mt-1">Sélectionnez la période à synthétiser, puis générez l'aperçu avant export.</p>
            </div>
            <div className="flex justify-center">
              <ReportPeriodNav period={draftPeriod} onChange={setDraftPeriod} />
            </div>
            <button onClick={handleGenerate} disabled={isGenerating} className={`${primaryButtonClass} w-full`}>
              {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <FileBarChart2 size={14} />}
              <span>{isGenerating ? 'Génération…' : 'Générer le rapport'}</span>
            </button>
            <button onClick={onNavigateToDashboard} className={`${secondaryButtonClass} w-full`}>
              <span>Retour au tableau de bord</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <span>Rapport mensuel de gestion</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              {formatPeriodLabel(period)}
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Prévisualisation — vérifiez les chiffres ci-dessous avant d'exporter le document final.</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button onClick={handleBackToConfigure} className={secondaryButtonClass}>
            <ArrowLeft size={14} /><span>Modifier la période</span>
          </button>
          <button onClick={handleExportPdf} disabled={isExporting} className={primaryButtonClass}>
            {isExporting ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            <span>{isExporting ? 'Export…' : 'Exporter en PDF'}</span>
          </button>
        </div>
      </div>

      {exported && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 size={14} /> Le PDF a été généré et téléchargé.
        </div>
      )}

      <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 text-xs flex items-start gap-2">
        <ShieldCheck size={15} className="shrink-0 mt-0.5" />
        <span>Étape de vérification — cette prévisualisation reflète exactement le contenu du PDF qui sera généré. Vérifiez les montants avant de confirmer l'export.</span>
      </div>

      {/* Global KPI summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        <ReportKpiCard label="Chiffre d'affaires" value={formatAmount(sales.revenue)} icon={Wallet} color="emerald" variation={{ current: sales.revenue, previous: previousSales.revenue }} />
        <ReportKpiCard label="Tickets" value={formatInt(sales.ticketCount)} icon={Ticket} color="blue" caption={`Panier moyen : ${formatAmount(sales.averageTicket)}`} />
        <ReportKpiCard label="Achats" value={formatAmount(purchases.total)} icon={ShoppingCart} color="indigo" />
        <ReportKpiCard label="Dépenses" value={formatAmount(expensesMetrics.total)} icon={TrendingDown} color="amber" />
        <ReportKpiCard label="Coût du personnel" value={formatAmount(personnelCost.total)} icon={Users} color="gray" />
        <ReportKpiCard label="Valeur du stock" value={formatAmount(stockValue)} icon={Boxes} color="blue" />
        <ReportKpiCard label="Marge brute estimée" value={formatAmount(financialSummary.grossMargin)} icon={Receipt} color="emerald" />
        <ReportKpiCard label="Résultat estimé" value={formatAmount(financialSummary.estimatedResult)} icon={PiggyBank} color={financialSummary.estimatedResult >= 0 ? 'emerald' : 'red'} />
      </div>

      <ReportSection title="Alertes principales">
        <ReportAlertsPanel alerts={alerts} />
      </ReportSection>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ReportSection title="Ventes — produits les plus vendus">
          <ReportTable columns={['Produit', 'Qté', 'CA']} align={['left', 'right', 'right']} rows={topProducts.map((p) => [p.name, formatInt(p.qty), formatAmount(p.revenue)])} />
        </ReportSection>
        <ReportSection title="Ventes — produits à faible marge">
          <ReportTable columns={['Produit', 'Marge', 'Cible']} align={['left', 'right', 'right']} rows={lowMarginProducts.map((p) => [p.article.name, formatPercent(p.marginRate), formatPercent(p.targetRate)])} />
        </ReportSection>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ReportSection title="Achats & fournisseurs — top fournisseurs">
          <ReportTable columns={['Fournisseur', 'Commandes', 'Montant']} align={['left', 'right', 'right']} rows={supplierPerf.map((s) => [s.name, formatInt(s.orderCount), formatAmount(s.totalAmount)])} />
        </ReportSection>
        <ReportSection title="Dépenses par catégorie">
          <ReportTable columns={['Catégorie', 'Montant']} align={['left', 'right']} rows={expensesByCategory.map((c) => [c.category.name, formatAmount(c.total)])} totalsRow={['Total', formatAmount(expensesMetrics.total)]} />
        </ReportSection>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ReportSection title="Stock — produits sous le seuil" description={`Pertes de la période : ${formatAmount(stockLosses)} — Écarts d'inventaire : ${discrepancies.length}`}>
          <ReportTable columns={['Produit', 'Stock', 'Seuil']} align={['left', 'right', 'right']} rows={lowStock.slice(0, 8).map((p) => [p.name, formatInt(getTotalQty(p)), formatInt(p.minThreshold)])} />
        </ReportSection>
        <ReportSection title="Synthèse du résultat estimé">
          <ReportTable
            columns={['Poste', 'Montant']}
            align={['left', 'right']}
            rows={getResultSynthesisLines(financialSummary).map((l) => [l.label, l.kind === 'minus' ? `- ${formatAmount(l.value)}` : formatAmount(l.value)])}
            totalsRow={['Résultat estimé', formatAmount(financialSummary.estimatedResult)]}
          />
        </ReportSection>
      </div>

      <ReportSection title="Fiscalité (informatif)" description="Ne constitue pas une déclaration fiscale officielle.">
        <ReportTable
          columns={['Élément', 'Montant']}
          align={['left', 'right']}
          rows={[
            ['CA HT', formatAmount(taxSummary.salesHT)],
            ['TVA collectée', formatAmount(taxSummary.vatCollected)],
            ['TVA déductible', `- ${formatAmount(taxSummary.vatDeductible)}`],
          ]}
          totalsRow={['TVA nette estimée', formatAmount(taxSummary.netVat)]}
        />
      </ReportSection>

      <div className="flex items-center justify-end gap-2 pb-2">
        <button onClick={handleBackToConfigure} className={secondaryButtonClass}>
          <ArrowLeft size={14} /><span>Modifier la période</span>
        </button>
        <button onClick={handleExportPdf} disabled={isExporting} className={primaryButtonClass}>
          {isExporting ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
          <span>{isExporting ? 'Export…' : 'Confirmer et exporter en PDF'}</span>
        </button>
      </div>
    </div>
  );
};
