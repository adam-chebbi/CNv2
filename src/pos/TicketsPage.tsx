import React, { useState } from 'react';
import { FileText, Search } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '../data/cashSession';
import { parseDtInput } from '../data/money';
import { tunisClock } from '../data/pricing';
import { newIdempotencyKey } from '../hooks/usePosEvents';
import { posApi, type SaleDetail } from './api';
import { useCashSession } from './CashSessionControls';
import { PaymentPanel } from './PaymentPanel';
import { TREATMENT_LABELS } from './labels';
import { Badge, Btn, Card, cx, dateTime, Empty, ErrorNote, Field, inputCls, Loading, Modal, Money, PageHeader, useAction, useLoader } from './ui';

// Tickets et historique des ventes (cahier des charges §2.6, §7.4): search by number, date or
// table; reprint (duplicate, never a new sale); correction of a paid sale by a credit note.

const CorrectionModal: React.FC<{ sale: SaleDetail; sessionId: string | null; onClose: () => void; onDone: () => void }> = ({ sale, sessionId, onClose, onDone }) => {
  const adjustments = useLoader(() => posApi.adjustments(sale.id), [sale.id]);
  const corrected = new Set((adjustments.data ?? []).flatMap((a) => a.lineIds));
  const lines = sale.orders.flatMap((o) => o.lines.filter((l) => l.status === 'active' && !corrected.has(l.id)));
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [treatment, setTreatment] = useState('none');
  const [refund, setRefund] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amount, setAmount] = useState('');
  const [key] = useState(newIdempotencyKey);
  const { busy, error, run } = useAction();
  const refundMil = parseDtInput(amount);
  return (
    <Modal
      title={`Avoir sur le ticket ${sale.ticketNumber}`}
      onClose={onClose}
      footer={
        <Btn
          variant="danger"
          busy={busy}
          disabled={selected.length === 0 || reason.trim().length < 3 || (refund && (!refundMil || !sessionId))}
          onClick={() =>
            run(async () => {
              await posApi.correctSale(sale.id, { lineIds: selected, reason: reason.trim(), stockTreatment: treatment, refund: refund ? { sessionId: sessionId!, method, amountMil: refundMil! } : null }, key);
              onDone();
            })
          }
        >
          Enregistrer l'avoir
        </Btn>
      }
    >
      <ErrorNote message={error} />
      <p className="text-xs text-gray-500">Le ticket d'origine reste inchangé et consultable. Un remboursement n'est pas un virement bancaire automatique.</p>
      <div className="space-y-1">
        {lines.map((l) => (
          <label key={l.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selected.includes(l.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, l.id] : selected.filter((x) => x !== l.id))} />
            <span className="flex-1">{l.quantity} × {l.displayName}</span>
            <Money mil={l.totalMil} />
          </label>
        ))}
      </div>
      <Field label="Motif (obligatoire)">
        <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Field label="Que deviennent les produits ?">
        <select className={inputCls} value={treatment} onChange={(e) => setTreatment(e.target.value)}>
          {Object.entries(TREATMENT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} /> Rembourser le client
      </label>
      {refund && (
        <div className="grid grid-cols-2 gap-2">
          <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
              <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
            ))}
          </select>
          <input className={inputCls} inputMode="decimal" placeholder="Montant (DT)" value={amount} onChange={(e) => setAmount(e.target.value)} />
          {!sessionId && <p className="col-span-2 text-xs text-red-600">Ouvrez la caisse pour enregistrer un remboursement.</p>}
        </div>
      )}
    </Modal>
  );
};

export const TicketsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const cash = useCashSession();
  const [filters, setFilters] = useState({ number: '', date: tunisClock(new Date()).date, table: '' });
  const [query, setQuery] = useState(filters);
  const results = useLoader(() => posApi.searchSales({ ...query, status: undefined }), [query]);
  const [open, setOpen] = useState<SaleDetail | null>(null);
  const [correcting, setCorrecting] = useState<SaleDetail | null>(null);
  const { error, run } = useAction();

  const show = (id: string) => run(async () => setOpen(await posApi.sale(id)));

  return (
    <div className="space-y-4">
      <PageHeader icon={FileText} title="Tickets" subtitle="Rechercher, consulter, réimprimer ou corriger une vente" />
      <Card>
        <form
          className="grid sm:grid-cols-4 gap-2 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(filters);
          }}
        >
          <Field label="Numéro">
            <input className={inputCls} value={filters.number} onChange={(e) => setFilters({ ...filters, number: e.target.value })} placeholder="CN-2026-…" />
          </Field>
          <Field label="Date">
            <input type="date" className={inputCls} value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} />
          </Field>
          <Field label="Table">
            <input className={inputCls} value={filters.table} onChange={(e) => setFilters({ ...filters, table: e.target.value })} />
          </Field>
          <Btn variant="primary" type="submit">
            <Search size={14} /> Rechercher
          </Btn>
        </form>
      </Card>
      <ErrorNote message={error ?? results.error} />
      <Card>
        {results.loading ? (
          <Loading />
        ) : (results.data ?? []).length === 0 ? (
          <Empty>Aucune vente trouvée.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 text-left">
                <tr>
                  <th className="py-2">Ticket</th>
                  <th>Heure</th>
                  <th>Table</th>
                  <th>Total</th>
                  <th>État</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.data!.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => show(s.id)}>
                    <td className="py-2 font-mono">{s.ticketNumber ?? '—'}</td>
                    <td>{dateTime(s.completedAt ?? s.createdAt)}</td>
                    <td>{s.tableName ?? (s.serviceType === 'takeaway' ? 'À emporter' : 'Comptoir')}</td>
                    <td><Money mil={s.totalMil} /></td>
                    <td>
                      <Badge tone={s.status === 'completed' ? 'green' : s.status === 'open' ? 'amber' : 'gray'}>
                        {s.status === 'completed' ? 'Réglée' : s.status === 'open' ? 'Ouverte' : 'Annulée'}
                      </Badge>
                      {s.reprintCount > 0 && <span className="ml-1 text-xs text-gray-500">{s.reprintCount} duplicata(s)</span>}
                    </td>
                    <td className={cx('text-right')}>›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {open && (
        <>
          <PaymentPanel sale={open} sessionId={cash.session?.id ?? null} onClose={() => { setOpen(null); void results.reload(); }} />
          {open.status === 'completed' && hasPermission('pos:correct') && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60]">
              <Btn variant="danger" onClick={() => { setCorrecting(open); setOpen(null); }}>
                Corriger / annuler cette vente (avoir)
              </Btn>
            </div>
          )}
        </>
      )}
      {correcting && (
        <CorrectionModal sale={correcting} sessionId={cash.session?.id ?? null} onClose={() => setCorrecting(null)} onDone={() => { setCorrecting(null); void results.reload(); }} />
      )}
    </div>
  );
};
