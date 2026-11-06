import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Lock } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { CASH_DENOMINATIONS, countedTotal, PAYMENT_METHOD_LABELS, type PaymentMethod } from '../data/cashSession';
import { formatDt, parseDtInput } from '../data/money';
import { newIdempotencyKey } from '../hooks/usePosEvents';
import { posApi, type CashSessionDetail } from './api';
import { getExpenses } from '../api/expenses';
import type { Expense } from '../data/expensesModel';
import { toMillimes } from '../data/money';
import { Btn, cx, ErrorNote, Field, inputCls, Modal, Money, useAction } from './ui';

// Ouverture, mouvements d'espèces et clôture de la caisse (cahier des charges §2.7 – §2.9).

const REGISTER_KEY = 'cn_register_id';

const readRegister = (): string | null => {
  try {
    return localStorage.getItem(REGISTER_KEY);
  } catch {
    return null;
  }
};
const saveRegister = (id: string) => {
  try {
    localStorage.setItem(REGISTER_KEY, id);
  } catch {
    // a private window simply asks again next time
  }
};

// The register this device works on, and its open session (if any).
export const useCashSession = () => {
  const [registers, setRegisters] = useState<{ id: string; name: string; openSessionId: string | null }[]>([]);
  const [registerId, setRegisterId] = useState<string | null>(readRegister);
  const [session, setSession] = useState<CashSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await posApi.registers();
      setRegisters(list);
      const current = list.find((r) => r.id === registerId) ?? list[0];
      if (current && current.id !== registerId) setRegisterId(current.id);
      setSession(current?.openSessionId ? await posApi.session(current.openSessionId) : null);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [registerId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const chooseRegister = (id: string) => {
    saveRegister(id);
    setRegisterId(id);
  };
  return { registers, registerId, chooseRegister, session, setSession, refresh, loading, error };
};

export const OpenSessionForm: React.FC<{ registers: { id: string; name: string }[]; registerId: string | null; onChoose: (id: string) => void; onOpened: (s: CashSessionDetail) => void }> = ({
  registers,
  registerId,
  onChoose,
  onOpened,
}) => {
  const { hasPermission } = useAuth();
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [key] = useState(newIdempotencyKey);
  const { busy, error, run } = useAction();
  const float = parseDtInput(amount || '0');
  if (!hasPermission('cash:open')) {
    return <p className="text-sm text-gray-600">La caisse n'est pas ouverte. Demandez à une personne habilitée de l'ouvrir.</p>;
  }
  return (
    <div className="max-w-md mx-auto space-y-3">
      <ErrorNote message={error} />
      {registers.length > 1 && (
        <Field label="Caisse">
          <select className={inputCls} value={registerId ?? ''} onChange={(e) => onChoose(e.target.value)}>
            {registers.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Fond de caisse (DT)" hint="Les espèces placées dans le tiroir à l'ouverture. Ce n'est pas du chiffre d'affaires.">
        <input className={cx(inputCls, 'text-lg font-semibold')} inputMode="decimal" placeholder="0,000" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Commentaire (facultatif)">
        <input className={inputCls} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
      <Btn variant="primary" size="lg" className="w-full" busy={busy} disabled={float === null || !registerId} onClick={() => run(async () => onOpened(await posApi.openSession(registerId!, float!, comment, key)))}>
        Ouvrir la caisse
      </Btn>
    </div>
  );
};

export const MovementModal: React.FC<{ session: CashSessionDetail; onClose: () => void; onDone: (s: CashSessionDetail) => void }> = ({ session, onClose, onDone }) => {
  const [type, setType] = useState<'in' | 'out'>('out');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [expenseId, setExpenseId] = useState('');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [key] = useState(newIdempotencyKey);
  const { busy, error, run } = useAction();
  const { hasPermission } = useAuth();
  const mil = parseDtInput(amount);
  // A cash-out for an expense already entered in Dépenses is linked to it instead of creating a
  // second one (§2.8). Only the last 7 days, and only for users who can see expenses.
  useEffect(() => {
    if (!hasPermission('expenses:view')) return;
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    void getExpenses().then((list) => setExpenses(list.filter((e) => e.date >= since && e.status !== 'Rejeté'))).catch(() => setExpenses([]));
  }, [hasPermission]);
  const pickExpense = (id: string) => {
    setExpenseId(id);
    const e = expenses.find((x) => x.id === id);
    if (e) {
      setAmount(formatDt(toMillimes(e.amount), false));
      if (!reason.trim()) setReason(e.title);
    }
  };
  return (
    <Modal
      title="Mouvement d'espèces"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Annuler</Btn>
          <Btn
            variant="primary"
            busy={busy}
            disabled={!mil || mil <= 0 || !reason.trim()}
            onClick={() => run(async () => onDone(await posApi.movement(session.id, { type, amountMil: mil!, reason: reason.trim(), comment: comment.trim() || undefined, expenseId: type === 'out' && expenseId ? expenseId : undefined }, key)))}
          >
            Enregistrer
          </Btn>
        </>
      }
    >
      <ErrorNote message={error} />
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setType('in')} className={cx('min-h-[56px] rounded-xl border text-sm font-semibold flex items-center justify-center gap-2', type === 'in' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200')}>
          <ArrowDownCircle size={18} /> Entrée
        </button>
        <button onClick={() => setType('out')} className={cx('min-h-[56px] rounded-xl border text-sm font-semibold flex items-center justify-center gap-2', type === 'out' ? 'border-amber-500 bg-amber-50' : 'border-gray-200')}>
          <ArrowUpCircle size={18} /> Sortie
        </button>
      </div>
      {type === 'out' && expenses.length > 0 && (
        <Field label="Dépense déjà saisie (facultatif)" hint="Liée au mouvement : aucune nouvelle dépense n'est créée.">
          <select className={inputCls} value={expenseId} onChange={(e) => pickExpense(e.target.value)}>
            <option value="">— Aucune —</option>
            {expenses.map((e) => <option key={e.id} value={e.id}>{e.date} · {e.title} · {formatDt(toMillimes(e.amount))}</option>)}
          </select>
        </Field>
      )}
      <Field label="Montant (DT)">
        <input className={inputCls} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Motif (obligatoire)">
        <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex. achat de pain, apport de monnaie" />
      </Field>
      <Field label="Commentaire / justificatif" hint="Si la dépense est déjà saisie dans Dépenses, ce mouvement ne la recrée pas.">
        <input className={inputCls} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
    </Modal>
  );
};

export const CloseSessionModal: React.FC<{ session: CashSessionDetail; onClose: () => void; onDone: (s: CashSessionDetail) => void }> = ({ session, onClose, onDone }) => {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [manual, setManual] = useState('');
  const [comment, setComment] = useState('');
  const [key] = useState(newIdempotencyKey);
  const { busy, error, run } = useAction();
  const s = session.summary;
  const fromCounts = countedTotal(counts);
  const counted = manual.trim() ? parseDtInput(manual) : fromCounts;
  const difference = counted === null ? null : counted - s.expectedCashMil;
  return (
    <Modal
      title="Clôture de la caisse"
      wide
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Annuler</Btn>
          <Btn
            variant="primary"
            busy={busy}
            disabled={counted === null || (difference !== 0 && !comment.trim())}
            onClick={() => run(async () => onDone(await posApi.closeSession(session.id, { countedCashMil: counted!, counts: manual.trim() ? undefined : counts, comment: comment.trim() || undefined }, key)))}
          >
            Clôturer
          </Btn>
        </>
      }
    >
      <ErrorNote message={error} />
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-1 text-sm">
          <p className="font-semibold text-gray-700">Récapitulatif</p>
          {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
            <p key={m} className="flex justify-between">
              <span>{PAYMENT_METHOD_LABELS[m]}</span> <Money mil={s.paymentsByMethod[m]} />
            </p>
          ))}
          <hr className="my-2" />
          <p className="flex justify-between"><span>Fond initial</span> <Money mil={s.openingFloatMil} /></p>
          <p className="flex justify-between"><span>+ Encaissements espèces</span> <Money mil={s.cashSalesMil} /></p>
          <p className="flex justify-between"><span>+ Entrées</span> <Money mil={s.cashInMil} /></p>
          <p className="flex justify-between"><span>− Sorties</span> <Money mil={s.cashOutMil} /></p>
          <p className="flex justify-between"><span>− Remboursements espèces</span> <Money mil={s.cashRefundsMil} /></p>
          <p className="flex justify-between font-bold text-base pt-1"><span>Espèces attendues</span> <Money mil={s.expectedCashMil} /></p>
          {session.openBills.length > 0 && (
            <p className="mt-2 p-2 rounded-lg bg-amber-50 text-amber-800 text-xs">
              {session.openBills.length} addition(s) encore ouverte(s) : la clôture ne les règle pas et ne libère pas les tables.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-700">Comptage des espèces</p>
          <div className="grid grid-cols-2 gap-2">
            {CASH_DENOMINATIONS.map((d) => (
              <label key={d.valueMil} className="flex items-center gap-2 text-sm">
                <span className="w-14 text-right text-gray-600">{d.label}</span>
                <input
                  className={cx(inputCls, 'min-h-[38px] py-1')}
                  inputMode="numeric"
                  value={counts[String(d.valueMil)] ?? ''}
                  onChange={(e) => setCounts({ ...counts, [String(d.valueMil)]: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                />
              </label>
            ))}
          </div>
          <Field label="Ou total compté (DT)">
            <input className={inputCls} inputMode="decimal" value={manual} onChange={(e) => setManual(e.target.value)} placeholder={formatDt(fromCounts, false)} />
          </Field>
          {difference !== null && (
            <p className={cx('text-base font-bold', difference === 0 ? 'text-emerald-700' : 'text-red-600')}>
              Écart : <Money mil={difference} />
            </p>
          )}
          <Field label={difference ? 'Commentaire (obligatoire en cas d’écart)' : 'Commentaire'}>
            <input className={inputCls} value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
};

export const SessionBar: React.FC<{ session: CashSessionDetail; onChange: (s: CashSessionDetail | null) => void }> = ({ session, onChange }) => {
  const { hasPermission } = useAuth();
  const [modal, setModal] = useState<'movement' | 'close' | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
      <span>
        {session.registerName} · ouverte par {session.openedBy} · fond <Money mil={session.openingFloatMil} />
      </span>
      {hasPermission('cash:movement') && (
        <Btn size="sm" variant="ghost" onClick={() => { const reason = window.prompt("Motif de l'ouverture du tiroir (ex. rendu de monnaie, contrôle) :"); if (reason && reason.trim().length >= 2) void posApi.openDrawer(session.registerId, reason.trim()).catch((e: Error) => window.alert(e.message)); }}>
          Ouvrir le tiroir
        </Btn>
      )}
      {hasPermission('cash:movement') && (
        <Btn size="sm" onClick={() => setModal('movement')}>
          Mouvement d'espèces
        </Btn>
      )}
      {hasPermission('cash:close') && (
        <Btn size="sm" variant="warning" onClick={() => setModal('close')}>
          <Lock size={13} /> Clôturer
        </Btn>
      )}
      {modal === 'movement' && <MovementModal session={session} onClose={() => setModal(null)} onDone={(s) => { onChange(s); setModal(null); }} />}
      {modal === 'close' && (
        <CloseSessionModal
          session={session}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            onChange(null);
          }}
        />
      )}
    </div>
  );
};
