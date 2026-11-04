import React, { useMemo, useState } from 'react';
import { Banknote, CreditCard, Ticket, CalendarDays, AlertCircle, Receipt } from 'lucide-react';
import { SaleTransaction } from '../data/salesTransactions';
import { Expense } from '../data/expensesModel';
import { SupplierInvoice } from '../data/purchasesModel';
import { RevenueEntry, RevenueEntryInput } from '../data/revenueEntriesModel';
import {
  CashVerification,
  CashVerificationInput,
  CASH_DENOMINATIONS,
  computeCashKpis,
  computeDaySystemTotals,
  buildCashCheckCalendar,
  findLatestVerificationForDate,
} from '../data/cashCheckModel';
import { todayIso } from '../data/dateUtils';
import { computeVatBreakdown } from '../data/reportsModel';
import { CashCheckHeatmap } from './cashCheck/CashCheckHeatmap';
import { CashVerificationPanel } from './cashCheck/CashVerificationPanel';
import { CashCheckHistory } from './cashCheck/CashCheckHistory';
import { RevenueEntriesPanel } from './cashCheck/RevenueEntriesPanel';

interface CashCheckPageProps {
  salesTransactions: SaleTransaction[];
  expenses: Expense[];
  supplierInvoices: SupplierInvoice[];
  verifications: CashVerification[];
  revenueEntries: RevenueEntry[];
  onConfirmVerification: (input: CashVerificationInput) => Promise<void>;
  onCreateRevenueEntry: (input: RevenueEntryInput) => Promise<void>;
  onUpdateRevenueEntry: (id: string, input: RevenueEntryInput) => Promise<void>;
  onDeleteRevenueEntry: (id: string) => Promise<void>;
  onNavigateToDashboard: () => void;
}

const formatDT = (v: number): string => `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DT`;

export const CashCheckPage: React.FC<CashCheckPageProps> = ({
  salesTransactions,
  expenses,
  supplierInvoices,
  verifications,
  revenueEntries,
  onConfirmVerification,
  onCreateRevenueEntry,
  onUpdateRevenueEntry,
  onDeleteRevenueEntry,
  onNavigateToDashboard,
}) => {
  const today = useMemo(() => todayIso(), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const kpis = useMemo(
    () => computeCashKpis(salesTransactions, expenses, supplierInvoices, verifications, revenueEntries),
    [salesTransactions, expenses, supplierInvoices, verifications, revenueEntries]
  );

  const calendar = useMemo(
    () => buildCashCheckCalendar(salesTransactions, expenses, supplierInvoices, 8, revenueEntries),
    [salesTransactions, expenses, supplierInvoices, revenueEntries]
  );

  const dayTotals = useMemo(
    () => computeDaySystemTotals(selectedDate, salesTransactions, expenses, supplierInvoices, revenueEntries),
    [selectedDate, salesTransactions, expenses, supplierInvoices, revenueEntries]
  );

  const dayVerification = useMemo(
    () => findLatestVerificationForDate(verifications, selectedDate),
    [verifications, selectedDate]
  );

  // Accounting analysis only — never the basis for the money verification above/below, which
  // stays entirely TTC (the real amount collected). Computed per rate, from each sale item's own
  // vatRate, never a single flat rate.
  const dayVatBreakdown = useMemo(
    () => computeVatBreakdown(salesTransactions.filter((t) => t.date === selectedDate)),
    [salesTransactions, selectedDate]
  );

  const handleConfirm = async (input: CashVerificationInput) => {
    setIsSaving(true);
    setSaveError(null);
    try {
      await onConfirmVerification({
        ...input,
        supersedesId: dayVerification?.id,
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setIsSaving(false);
    }
  };

  const selectedDateLabel = new Date(`${selectedDate}T00:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Calcul du quotidien</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Suivi, comptage et vérification des montants réellement présents en caisse.
          </p>
        </div>
        <button
          onClick={onNavigateToDashboard}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700/80 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition active:scale-98 cursor-pointer self-start sm:self-auto"
        >
          <span>Tableau de bord</span>
        </button>
      </div>

      {/* 1. KPIs — situation actuelle */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Banknote size={16} />
            </span>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Espèces</span>
          </div>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{formatDT(kpis.especes)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Situation actuelle en caisse</p>
        </div>
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <CreditCard size={16} />
            </span>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Carte bancaire</span>
          </div>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{formatDT(kpis.carte)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Situation actuelle</p>
        </div>
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Ticket size={16} />
            </span>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Tickets restaurant</span>
          </div>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{formatDT(kpis.restoNet)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Montant net, après déduction</p>
        </div>
      </div>

      {/* 2. Graphique d'évolution quotidienne */}
      <CashCheckHeatmap
        data={calendar}
        selectedDate={selectedDate}
        todayIso={today}
        onSelectDate={setSelectedDate}
        onResetToToday={() => setSelectedDate(today)}
      />

      {/* Selected day banner */}
      <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 flex items-center gap-2 text-xs">
        <CalendarDays size={14} className="text-emerald-500 shrink-0" />
        <span className="text-gray-500 dark:text-gray-400">
          Journée affichée ci-dessous : <strong className="text-gray-900 dark:text-white capitalize">{selectedDateLabel}</strong>
          {selectedDate === today && <span className="text-emerald-600 dark:text-emerald-400 font-semibold"> (aujourd'hui)</span>}
        </span>
      </div>

      {/* Chiffres d'affaires saisis à la main (CRUD) — placés avant les sections Espèces / Tickets /
          Carte car un CA avec règlement alimente leurs montants système. */}
      <RevenueEntriesPanel
        key={selectedDate}
        selectedDate={selectedDate}
        entries={revenueEntries}
        onCreate={onCreateRevenueEntry}
        onUpdate={onUpdateRevenueEntry}
        onDelete={onDeleteRevenueEntry}
      />

      {/* 3. Espèces */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-3">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white inline-flex items-center gap-2">
          <Banknote size={15} className="text-emerald-500" /> Espèces
        </h2>
        {!dayVerification ? (
          <p className="text-xs text-gray-400 flex items-center gap-2">
            <AlertCircle size={13} /> Aucune vérification confirmée pour ce jour — lancez une vérification ci-dessous.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 dark:text-gray-500">
                  <th className="py-1 font-semibold">Coupure</th>
                  <th className="py-1 font-semibold text-right">Nombre</th>
                  <th className="py-1 font-semibold text-right">Sous-total</th>
                </tr>
              </thead>
              <tbody>
                {CASH_DENOMINATIONS.map((d) => {
                  const count = dayVerification.cashCounts[d.id] || 0;
                  return (
                    <tr key={d.id} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="py-1 text-gray-600 dark:text-gray-300">{d.label}</td>
                      <td className="py-1 text-right text-gray-600 dark:text-gray-300">{count}</td>
                      <td className="py-1 text-right font-semibold text-gray-800 dark:text-gray-200">{formatDT(count * d.value)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
          <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Total espèces</span>
          <span className="text-base font-bold text-gray-900 dark:text-white">{formatDT(dayVerification?.cashCountedAmount ?? 0)}</span>
        </div>
      </div>

      {/* 4. Tickets restaurant */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-3">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white inline-flex items-center gap-2">
          <Ticket size={15} className="text-amber-500" /> Tickets restaurant
        </h2>
        {!dayVerification ? (
          <p className="text-xs text-gray-400 flex items-center gap-2">
            <AlertCircle size={13} /> Aucune vérification confirmée pour ce jour.
          </p>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Montant compté (espèces ou carte confondus) :{' '}
            <span className="font-semibold text-gray-800 dark:text-gray-200">{formatDT(dayVerification.restoCountedGross)}</span>
          </p>
        )}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100 dark:border-gray-800 text-xs">
          <div>
            <span className="text-gray-400 block">Total avant déduction</span>
            <span className="font-bold text-gray-800 dark:text-gray-200">{formatDT(dayVerification?.restoCountedGross ?? 0)}</span>
          </div>
          <div>
            <span className="text-gray-400 block">Déduction (10%)</span>
            <span className="font-bold text-red-500">
              − {formatDT((dayVerification?.restoCountedGross ?? 0) - (dayVerification?.restoCountedNet ?? 0))}
            </span>
          </div>
          <div>
            <span className="text-gray-400 block">Montant net</span>
            <span className="font-bold text-gray-900 dark:text-white">{formatDT(dayVerification?.restoCountedNet ?? 0)}</span>
          </div>
        </div>
      </div>

      {/* 5. Paiements par carte bancaire */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-2">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white inline-flex items-center gap-2">
          <CreditCard size={15} className="text-blue-500" /> Paiements par carte bancaire
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-gray-400 block">Ventes carte</span>
            <span className="font-bold text-gray-800 dark:text-gray-200">{formatDT(dayTotals.ventesCarte)}</span>
          </div>
          <div>
            <span className="text-gray-400 block">Nombre de paiements</span>
            <span className="font-bold text-gray-800 dark:text-gray-200">{dayTotals.ventesCarteCount}</span>
          </div>
          <div>
            <span className="text-gray-400 block">Dépenses/achats carte</span>
            <span className="font-bold text-gray-800 dark:text-gray-200">
              {dayTotals.depensesCarte + dayTotals.achatsCarte > 0 ? `− ${formatDT(dayTotals.depensesCarte + dayTotals.achatsCarte)}` : '—'}
            </span>
          </div>
          <div>
            <span className="text-gray-400 block">Total système (net)</span>
            <span className="text-base font-bold text-gray-900 dark:text-white">{formatDT(dayTotals.netCarte)}</span>
          </div>
        </div>
      </div>

      {/* Analyse comptable HT / TVA — informative only, never the basis for the cash verification
          below: real-money reconciliation always stays TTC, per l'argent réellement encaissé. */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-3">
        <div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white inline-flex items-center gap-2">
            <Receipt size={15} className="text-purple-500" /> Analyse comptable HT / TVA
          </h2>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Ventilation fiscale des ventes de la journée, calculée par taux propre à chaque produit — à titre
            d'analyse uniquement, sans effet sur la vérification de caisse (toujours en TTC) ci-dessous.
          </p>
        </div>
        {dayVatBreakdown.byRate.length === 0 ? (
          <p className="text-xs text-gray-400">Aucune vente enregistrée pour ce jour.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 dark:text-gray-500">
                  <th className="py-1 font-semibold">Taux de TVA</th>
                  <th className="py-1 font-semibold text-right">TTC</th>
                  <th className="py-1 font-semibold text-right">HT</th>
                  <th className="py-1 font-semibold text-right">TVA</th>
                </tr>
              </thead>
              <tbody>
                {dayVatBreakdown.byRate.map((r) => (
                  <tr key={r.rate} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="py-1 text-gray-600 dark:text-gray-300">{(r.rate * 100).toFixed(0)}%</td>
                    <td className="py-1 text-right text-gray-600 dark:text-gray-300">{formatDT(r.gross)}</td>
                    <td className="py-1 text-right text-gray-600 dark:text-gray-300">{formatDT(r.net)}</td>
                    <td className="py-1 text-right font-semibold text-gray-800 dark:text-gray-200">{formatDT(r.tax)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 dark:border-gray-700 font-bold">
                  <td className="py-1.5 text-gray-900 dark:text-white">Total</td>
                  <td className="py-1.5 text-right text-gray-900 dark:text-white">{formatDT(dayVatBreakdown.totalGross)}</td>
                  <td className="py-1.5 text-right text-gray-900 dark:text-white">{formatDT(dayVatBreakdown.totalNet)}</td>
                  <td className="py-1.5 text-right text-gray-900 dark:text-white">{formatDT(dayVatBreakdown.totalTax)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* 6-9. Vérification */}
      {saveError && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 flex items-start gap-3">
          <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-700 dark:text-red-300">Échec de l'enregistrement</p>
            <p className="text-xs text-red-600/90 dark:text-red-400/90">{saveError}</p>
          </div>
        </div>
      )}
      <CashVerificationPanel
        key={selectedDate}
        selectedDate={selectedDate}
        cashSystemAmount={dayTotals.netEspeces}
        restoSystemGross={dayTotals.ventesRestoGross}
        restoSystemNet={dayTotals.ventesRestoNet}
        cardSystemAmount={dayTotals.netCarte}
        cardSystemCount={dayTotals.ventesCarteCount}
        isSaving={isSaving}
        onConfirm={handleConfirm}
      />

      {/* 12. Historique */}
      <CashCheckHistory verifications={verifications} />
    </div>
  );
};
