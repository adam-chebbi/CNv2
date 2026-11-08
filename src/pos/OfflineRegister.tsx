import React, { useState } from 'react';
import { Banknote, CreditCard, Printer, Ticket, WifiOff } from 'lucide-react';
import { changeDue, type PricedCart } from '../data/pricing';
import { formatDt, parseDtInput } from '../data/money';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '../data/cashSession';
import { receiptDocument, type ReceiptSale } from '../data/receipts';
import { newIdempotencyKey } from '../hooks/usePosEvents';
import { nextOfflineRef, queueDelete, queuePut, syncQueue, useOfflineQueue, type OfflineSale } from './offline';
import { printDocument } from './ticket';
import { Btn, cx, ErrorNote, Field, inputCls, Modal, Money, dateTime, useAction } from './ui';

// Écrans de la caisse hors ligne (amélioration 05).

const ICONS: Record<PaymentMethod, React.ComponentType<{ size?: number }>> = { cash: Banknote, card: CreditCard, voucher: Ticket };

// Provisional ticket printed while offline; the final CN-… number is given at synchronisation.
const provisionalTicket = (sale: OfflineSale, cart: PricedCart): ReceiptSale => ({
  ticketNumber: null,
  offlineRef: `${sale.offlineRef} (provisoire)`,
  status: 'completed',
  serviceType: sale.serviceType,
  tableName: null,
  waiters: [],
  createdAt: sale.occurredAt,
  completedAt: sale.occurredAt,
  grossMil: cart.grossMil,
  totalMil: cart.totalMil,
  paidMil: sale.payments.reduce((s, p) => s + p.amountMil, 0),
  ticketDiscounts: cart.ticketDiscounts,
  vat: cart.vat,
  orders: [{ status: 'validated', lines: cart.lines.map((l) => ({ status: 'active', quantity: l.quantity, displayName: l.displayName, grossMil: l.grossMil, itemDiscounts: l.discounts })) }],
  payments: sale.payments.map((p) => {
    const change = p.method === 'cash' ? changeDue(Math.max(0, cart.totalMil - sale.payments.filter((x) => x !== p).reduce((s, x) => s + x.amountMil, 0)), p.amountMil) : 0;
    return { kind: 'payment', method: p.method, amountMil: p.amountMil - change, tenderedMil: p.method === 'cash' ? p.amountMil : null, changeMil: change };
  }),
});

export const OfflineSaleModal: React.FC<{
  cart: PricedCart;
  lines: OfflineSale['lines'];
  serviceType: OfflineSale['serviceType'];
  sessionId: string;
  registerId: string;
  onClose: () => void;
  onRecorded: () => void;
}> = ({ cart, lines, serviceType, sessionId, registerId, onClose, onRecorded }) => {
  const [payments, setPayments] = useState<OfflineSale['payments']>([]);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amount, setAmount] = useState('');
  const [recorded, setRecorded] = useState<OfflineSale | null>(null);
  const { busy, error, run } = useAction();
  const paid = payments.reduce((s, p) => s + p.amountMil, 0);
  const due = Math.max(0, cart.totalMil - paid);
  const entered = parseDtInput(amount) ?? due;
  const change = paid > cart.totalMil ? paid - cart.totalMil : 0;

  const add = () => {
    if (entered <= 0) return;
    if (method !== 'cash' && entered > due) return;
    setPayments([...payments, { method, amountMil: entered }]);
    setAmount('');
  };
  const record = () =>
    run(async () => {
      const sale: OfflineSale = { id: newIdempotencyKey(), sessionId, offlineRef: nextOfflineRef(registerId), occurredAt: new Date().toISOString(), serviceType, lines, payments, clientTotalMil: cart.totalMil };
      await queuePut(sale);
      setRecorded(sale);
      window.dispatchEvent(new Event('cn-offline-queue'));
      void syncQueue();
    });

  return (
    <Modal title="Encaissement hors ligne" onClose={recorded ? onRecorded : onClose} wide>
      <ErrorNote message={error} />
      <p className="p-2 rounded-lg bg-amber-50 text-amber-900 text-sm flex items-center gap-2">
        <WifiOff size={16} /> Pas de connexion : la vente est gardée sur cet appareil et envoyée automatiquement au retour d'Internet, sans doublon.
      </p>
      {recorded ? (
        <div className="text-center space-y-3 py-4">
          <p className="text-lg font-bold text-emerald-700">Vente enregistrée — {recorded.offlineRef}</p>
          {change > 0 && <p className="text-2xl font-bold">Monnaie à rendre : <Money mil={change} /></p>}
          <Btn variant="primary" onClick={() => void printDocument(receiptDocument(provisionalTicket(recorded, cart)))}><Printer size={16} /> Imprimer le ticket provisoire</Btn>
          <Btn onClick={onRecorded}>Terminé</Btn>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="text-sm space-y-1">
            {cart.lines.map((l, i) => <p key={i} className="flex justify-between"><span>{l.quantity} × {l.displayName}</span><Money mil={l.totalMil} /></p>)}
            <p className="flex justify-between font-bold text-base border-t border-gray-100 pt-1"><span>Total</span><Money mil={cart.totalMil} /></p>
            {payments.map((p, i) => <p key={i} className="flex justify-between text-gray-600"><span>{PAYMENT_METHOD_LABELS[p.method]}</span><Money mil={p.amountMil} /></p>)}
            <p className={cx('flex justify-between font-semibold', due > 0 ? 'text-amber-700' : 'text-emerald-700')}><span>Reste</span><Money mil={due} /></p>
            {change > 0 && <p className="flex justify-between text-lg font-bold"><span>Monnaie</span><Money mil={change} /></p>}
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => {
                const Icon = ICONS[m];
                return (
                  <button key={m} onClick={() => setMethod(m)} className={cx('min-h-[56px] rounded-xl border flex flex-col items-center justify-center text-xs font-semibold', method === m ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200')}>
                    <Icon size={18} /> {PAYMENT_METHOD_LABELS[m]}
                  </button>
                );
              })}
            </div>
            <Field label={method === 'cash' ? 'Montant reçu (DT)' : 'Montant (DT)'}>
              <input className={inputCls} inputMode="decimal" placeholder={formatDt(due, false)} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Btn className="w-full" disabled={due <= 0} onClick={add}>Ajouter ce règlement</Btn>
            <Btn variant="primary" size="lg" className="w-full" busy={busy} disabled={due > 0} onClick={record}>Enregistrer la vente</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
};

// Status of the offline queue, shown on the register.
export const OfflineBanner: React.FC = () => {
  const { online, pending, conflicts, refresh } = useOfflineQueue();
  const [showConflicts, setShowConflicts] = useState(false);
  if (online && pending.length === 0 && conflicts.length === 0) return null;
  return (
    <>
      <div role="status" className={cx('p-3 rounded-xl border text-sm flex flex-wrap items-center gap-2', online ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-orange-100 border-orange-300 text-orange-900')}>
        <WifiOff size={16} />
        <span className="flex-1">
          {online ? 'Connexion rétablie' : 'Hors ligne — la caisse continue de vendre'}
          {pending.length > 0 && ` · ${pending.length} vente(s) en attente d'envoi`}
          {conflicts.length > 0 && ` · ${conflicts.length} vente(s) à régulariser`}
        </span>
        {online && pending.length > 0 && <Btn size="sm" onClick={() => void syncQueue()}>Envoyer maintenant</Btn>}
        {conflicts.length > 0 && <Btn size="sm" variant="warning" onClick={() => setShowConflicts(true)}>Voir</Btn>}
      </div>
      {showConflicts && (
        <Modal title="Ventes hors ligne à régulariser" onClose={() => setShowConflicts(false)} wide>
          <p className="text-xs text-gray-500">Ces ventes ont été refusées par le serveur (par exemple une session clôturée entre-temps). Elles restent gardées ici : saisissez-les à nouveau ou faites-les régulariser par la direction, puis marquez-les comme traitées.</p>
          <ul className="divide-y divide-gray-100 text-sm">
            {conflicts.map((s) => (
              <li key={s.id} className="py-2 flex flex-wrap items-center gap-2">
                <span className="flex-1">
                  <strong>{s.offlineRef}</strong> · {dateTime(s.occurredAt)} · <Money mil={s.clientTotalMil} />
                  <span className="block text-xs text-red-600">{s.conflict}</span>
                </span>
                <Btn size="sm" onClick={() => void queuePut({ ...s, conflict: undefined }).then(() => syncQueue())}>Réessayer</Btn>
                <Btn size="sm" variant="ghost" onClick={() => { if (window.confirm(`Marquer ${s.offlineRef} comme régularisée ? Elle sera retirée de cet appareil.`)) void queueDelete(s.id).then(refresh); }}>Traitée</Btn>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </>
  );
};
