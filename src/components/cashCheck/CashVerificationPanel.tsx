import { DecimalInput } from '../ui/DecimalInput';
import React, { useMemo, useState } from 'react';
import {
  ClipboardCheck,
  Banknote,
  Ticket,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  ArrowUpCircle,
  ArrowDownCircle,
  ShieldCheck,
  Loader2,
  X,
} from 'lucide-react';
import {
  CASH_DENOMINATIONS,
  CashCounts,
  createEmptyCashCounts,
  computeCashTotal,
  computeRestoNet,
  DiscrepancyCategory,
  DiscrepancyJustification,
  CashVerificationInput,
  isSignificantDifference,
  deriveVerificationStatus,
} from '../../data/cashCheckModel';

const inputBaseClass =
  'w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:border-emerald-500 focus:ring-emerald-500 transition text-center';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer';

const formatDT = (v: number): string => `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DT`;

interface CashVerificationPanelProps {
  selectedDate: string;
  cashSystemAmount: number;
  restoSystemGross: number;
  restoSystemNet: number;
  cardSystemAmount: number;
  cardSystemCount: number;
  isSaving: boolean;
  onConfirm: (input: CashVerificationInput) => void;
}

interface DiffRow {
  category: DiscrepancyCategory;
  expected: number;
  actual: number;
  difference: number;
}

export const CashVerificationPanel: React.FC<CashVerificationPanelProps> = ({
  selectedDate,
  cashSystemAmount,
  restoSystemGross,
  restoSystemNet,
  cardSystemAmount,
  cardSystemCount,
  isSaving,
  onConfirm,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [cashCounts, setCashCounts] = useState<CashCounts>(() => createEmptyCashCounts());
  const [restoCountedAmount, setRestoCountedAmount] = useState<number>(0);
  const [cardVerifiedAmount, setCardVerifiedAmount] = useState<number>(0);
  const [cardVerifiedCountInput, setCardVerifiedCountInput] = useState<string>('');
  const [comments, setComments] = useState<Record<DiscrepancyCategory, string>>({
    'Espèces': '',
    'Ticket resto': '',
    'Carte bancaire': '',
  });
  const [showValidation, setShowValidation] = useState(false);

  const cashCounted = computeCashTotal(cashCounts);
  const restoGross = restoCountedAmount;
  const restoNet = computeRestoNet(restoCountedAmount);

  const diffRows: DiffRow[] = useMemo(
    () => [
      { category: 'Espèces', expected: cashSystemAmount, actual: cashCounted, difference: cashCounted - cashSystemAmount },
      { category: 'Ticket resto', expected: restoSystemNet, actual: restoNet, difference: restoNet - restoSystemNet },
      { category: 'Carte bancaire', expected: cardSystemAmount, actual: cardVerifiedAmount, difference: cardVerifiedAmount - cardSystemAmount },
    ],
    [cashSystemAmount, cashCounted, restoSystemNet, restoNet, cardSystemAmount, cardVerifiedAmount]
  );

  const totalSystem = cashSystemAmount + restoSystemNet + cardSystemAmount;
  const totalCounted = cashCounted + restoNet + cardVerifiedAmount;
  const totalDifference = totalCounted - totalSystem;

  const rowsNeedingJustification = diffRows.filter((r) => isSignificantDifference(r.difference));
  const missingJustifications = rowsNeedingJustification.filter((r) => !comments[r.category].trim());

  const handleOpen = () => {
    setCashCounts(createEmptyCashCounts());
    setRestoCountedAmount(0);
    setCardVerifiedAmount(cardSystemAmount);
    setCardVerifiedCountInput(cardSystemCount > 0 ? String(cardSystemCount) : '');
    setComments({ 'Espèces': '', 'Ticket resto': '', 'Carte bancaire': '' });
    setShowValidation(false);
    setIsOpen(true);
  };

  const handleConfirmClick = () => {
    if (missingJustifications.length > 0) {
      setShowValidation(true);
      return;
    }
    const justifications: DiscrepancyJustification[] = rowsNeedingJustification.map((r) => ({
      id: `${r.category}-${Date.now()}`,
      category: r.category,
      expectedAmount: r.expected,
      actualAmount: r.actual,
      difference: r.difference,
      comment: comments[r.category].trim(),
      createdAt: new Date().toISOString(),
    }));

    const status = deriveVerificationStatus(totalDifference, justifications.length > 0);
    const cardVerifiedCount = cardVerifiedCountInput.trim() ? Math.max(0, Math.round(Number(cardVerifiedCountInput))) : undefined;

    onConfirm({
      coveredDate: selectedDate,
      cashCounts,
      cashSystemAmount,
      cashCountedAmount: cashCounted,
      restoSystemAmount: restoSystemGross,
      restoCountedGross: restoGross,
      restoCountedNet: restoNet,
      cardSystemAmount,
      cardVerifiedAmount,
      cardVerifiedCount,
      totalSystem,
      totalCounted,
      totalDifference,
      status,
      justifications,
    });
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ClipboardCheck size={16} className="text-emerald-500" />
            Vérification de la situation réelle
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Comptez physiquement l'espèces, les tickets restaurant et la carte pour le{' '}
            <strong>{new Date(`${selectedDate}T00:00:00`).toLocaleDateString('fr-FR')}</strong>, et comparez au système.
          </p>
        </div>
        <button onClick={handleOpen} className={`${primaryButtonClass} shrink-0`}>
          <ClipboardCheck size={14} />
          <span>Lancer une vérification</span>
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-[#151D2A] border border-emerald-200 dark:border-emerald-800/50 shadow-2xs overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <ClipboardCheck size={16} className="text-emerald-500" />
          Vérification en cours — {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('fr-FR')}
        </h2>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-4 sm:p-5 space-y-5">
        {/* 6.1 Espèces */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 inline-flex items-center gap-1.5">
            <Banknote size={13} className="text-emerald-500" /> Comptage des espèces
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {CASH_DENOMINATIONS.map((d) => {
              const count = cashCounts[d.id];
              return (
                <div key={d.id} className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 space-y-1">
                  <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 text-center">{d.label}</p>
                  <input
                    type="number"
                    min={0}
                    value={count}
                    onChange={(e) =>
                      setCashCounts((prev) => ({ ...prev, [d.id]: Math.max(0, Math.round(Number(e.target.value)) || 0) }))
                    }
                    className={inputBaseClass}
                  />
                  <p className="text-[10px] text-gray-400 text-center">{formatDT(count * d.value)}</p>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-xs">
            <span className="text-gray-500 dark:text-gray-400">
              Système : <strong className="text-gray-800 dark:text-gray-200">{formatDT(cashSystemAmount)}</strong>
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              Compté : <strong className="text-gray-900 dark:text-white">{formatDT(cashCounted)}</strong>
            </span>
            <DifferenceBadge value={cashCounted - cashSystemAmount} />
          </div>
        </div>

        {/* 6.2 Tickets resto — a plain counted amount, not physical note denominations: ticket
            resto can now also be settled by card, which has nothing to "count" the way cash does. */}
        <div className="space-y-2 pt-1 border-t border-gray-100 dark:border-gray-800">
          <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 inline-flex items-center gap-1.5 pt-3">
            <Ticket size={13} className="text-amber-500" /> Vérification tickets restaurant
          </h3>
          <div>
            <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 block">Montant compté (DT)</label>
            <DecimalInput
              min={0}
              step={0.1}
              value={restoCountedAmount}
              onChange={(e) => setRestoCountedAmount(Math.max(0, Number(e.target.value) || 0))}
              className={`${inputBaseClass} w-32`}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-xs">
            <span className="text-gray-500 dark:text-gray-400">
              Facial compté : <strong className="text-gray-800 dark:text-gray-200">{formatDT(restoGross)}</strong>
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              Déduction (10%) : <strong className="text-red-500">− {formatDT(restoGross - restoNet)}</strong>
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              Net compté : <strong className="text-gray-900 dark:text-white">{formatDT(restoNet)}</strong>
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-xs">
            <span className="text-gray-500 dark:text-gray-400">
              Système (net) : <strong className="text-gray-800 dark:text-gray-200">{formatDT(restoSystemNet)}</strong>
            </span>
            <DifferenceBadge value={restoNet - restoSystemNet} />
          </div>
        </div>

        {/* 6.3 Carte bancaire */}
        <div className="space-y-2 pt-1 border-t border-gray-100 dark:border-gray-800">
          <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 inline-flex items-center gap-1.5 pt-3">
            <CreditCard size={13} className="text-blue-500" /> Vérification carte bancaire
          </h3>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 block">Montant vérifié (DT)</label>
              <DecimalInput
                min={0}
                step={0.1}
                value={cardVerifiedAmount}
                onChange={(e) => setCardVerifiedAmount(Math.max(0, Number(e.target.value) || 0))}
                className={`${inputBaseClass} w-32`}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 block">Nb. paiements (optionnel)</label>
              <input
                type="number"
                min={0}
                value={cardVerifiedCountInput}
                onChange={(e) => setCardVerifiedCountInput(e.target.value)}
                className={`${inputBaseClass} w-28`}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-xs">
            <span className="text-gray-500 dark:text-gray-400">
              Système : <strong className="text-gray-800 dark:text-gray-200">{formatDT(cardSystemAmount)}</strong>
            </span>
            <DifferenceBadge value={cardVerifiedAmount - cardSystemAmount} />
          </div>
        </div>

        {/* 7. Synthèse */}
        <div className="space-y-2 pt-1 border-t border-gray-100 dark:border-gray-800">
          <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 pt-3">Synthèse de la vérification</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 dark:text-gray-500">
                  <th className="py-1.5 font-semibold">Catégorie</th>
                  <th className="py-1.5 font-semibold text-right">Système</th>
                  <th className="py-1.5 font-semibold text-right">Réel / vérifié</th>
                  <th className="py-1.5 font-semibold text-right">Différence</th>
                </tr>
              </thead>
              <tbody>
                {diffRows.map((r) => (
                  <tr key={r.category} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="py-1.5 font-semibold text-gray-700 dark:text-gray-300">{r.category}</td>
                    <td className="py-1.5 text-right text-gray-500 dark:text-gray-400">{formatDT(r.expected)}</td>
                    <td className="py-1.5 text-right font-semibold text-gray-900 dark:text-white">{formatDT(r.actual)}</td>
                    <td className="py-1.5 text-right">
                      <DifferenceBadge value={r.difference} compact />
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-200 dark:border-gray-700 font-bold">
                  <td className="py-1.5 text-gray-900 dark:text-white">Total général</td>
                  <td className="py-1.5 text-right text-gray-700 dark:text-gray-300">{formatDT(totalSystem)}</td>
                  <td className="py-1.5 text-right text-gray-900 dark:text-white">{formatDT(totalCounted)}</td>
                  <td className="py-1.5 text-right">
                    <DifferenceBadge value={totalDifference} compact />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 8. Justifications */}
        {rowsNeedingJustification.length > 0 && (
          <div className="space-y-2.5 pt-1 border-t border-gray-100 dark:border-gray-800">
            <h3 className="text-xs font-bold text-amber-700 dark:text-amber-400 inline-flex items-center gap-1.5 pt-3">
              <AlertTriangle size={13} /> Écart détecté — justification requise
            </h3>
            {rowsNeedingJustification.map((r) => (
              <div key={r.category} className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 space-y-1.5">
                <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 flex items-center justify-between">
                  <span>{r.category}</span>
                  <DifferenceBadge value={r.difference} compact />
                </p>
                <textarea
                  value={comments[r.category]}
                  onChange={(e) => setComments((prev) => ({ ...prev, [r.category]: e.target.value }))}
                  placeholder="Expliquez l'écart : erreur de comptage, dépense constatée, correction nécessaire…"
                  rows={2}
                  className={`w-full px-3 py-2 text-xs rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 transition ${
                    showValidation && !comments[r.category].trim()
                      ? 'border-red-400 dark:border-red-500/70 focus:border-red-500 focus:ring-red-500'
                      : 'border-gray-200 dark:border-gray-700 focus:border-emerald-500 focus:ring-emerald-500'
                  }`}
                />
                {showValidation && !comments[r.category].trim() && (
                  <p className="text-[11px] text-red-500">Une justification est requise pour cet écart.</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 9. Confirmation */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {isSignificantDifference(totalDifference) ? (
              <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-semibold">
                <AlertTriangle size={13} /> Écart total de {formatDT(Math.abs(totalDifference))}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                <CheckCircle2 size={13} /> Aucun écart significatif
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button onClick={() => setIsOpen(false)} disabled={isSaving} className={`${secondaryButtonClass} flex-1 sm:flex-none`}>
              <span>Annuler</span>
            </button>
            <button onClick={handleConfirmClick} disabled={isSaving} className={`${primaryButtonClass} flex-1 sm:flex-none`}>
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              <span>{isSaving ? 'Confirmation…' : 'Confirmer la vérification'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const DifferenceBadge: React.FC<{ value: number; compact?: boolean }> = ({ value, compact }) => {
  if (!isSignificantDifference(value)) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 size={compact ? 11 : 12} /> Conforme
      </span>
    );
  }
  const isSurplus = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
        isSurplus ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'
      }`}
    >
      {isSurplus ? <ArrowUpCircle size={compact ? 11 : 12} /> : <ArrowDownCircle size={compact ? 11 : 12} />}
      {isSurplus ? '+' : ''}
      {value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DT{' '}
      {isSurplus ? '(excédent)' : '(manquant)'}
    </span>
  );
};
