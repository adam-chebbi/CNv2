import React, { useState } from 'react';
import { Vault } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '../data/cashSession';
import { parseDtInput } from '../data/money';
import { posApi, type CashSessionDetail } from './api';
import { Badge, Btn, Card, cx, dateTime, Empty, ErrorNote, Field, inputCls, Loading, Modal, Money, PageHeader, useAction, useLoader } from './ui';

// Historique des sessions de caisse: opening, movements, closing summary, differences and
// corrections (a correction never hides the original count).

const SessionDetail: React.FC<{ id: string; onClose: () => void }> = ({ id, onClose }) => {
  const { hasPermission } = useAuth();
  const detail = useLoader(() => posApi.session(id), [id]);
  const [counted, setCounted] = useState('');
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  const s: CashSessionDetail | null = detail.data;
  return (
    <Modal title="Session de caisse" wide onClose={onClose}>
      <ErrorNote message={error ?? detail.error} />
      {!s ? (
        <Loading />
      ) : (
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <p><strong>{s.registerName}</strong> — {s.status === 'open' ? <Badge tone="green">Ouverte</Badge> : <Badge>Clôturée</Badge>}</p>
            <p>Ouverte par {s.openedBy} le {dateTime(s.openedAt)} {s.openingComment && `(« ${s.openingComment} »)`}</p>
            {s.closedAt && <p>Clôturée par {s.closedBy} le {dateTime(s.closedAt)}</p>}
            <p>{s.ticketCount} ticket(s) réglé(s)</p>
            <hr className="my-2" />
            {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
              <p key={m} className="flex justify-between"><span>{PAYMENT_METHOD_LABELS[m]}</span> <Money mil={s.summary.paymentsByMethod[m]} /></p>
            ))}
            <p className="flex justify-between font-semibold"><span>Total encaissé</span> <Money mil={s.summary.revenueMil} /></p>
            <hr className="my-2" />
            <p className="flex justify-between"><span>Fond initial</span> <Money mil={s.openingFloatMil} /></p>
            <p className="flex justify-between"><span>Espèces attendues</span> <Money mil={s.summary.expectedCashMil} /></p>
            {s.countedCashMil !== null && <p className="flex justify-between"><span>Espèces comptées</span> <Money mil={s.countedCashMil} /></p>}
            {s.differenceMil !== null && (
              <p className={cx('flex justify-between font-bold', s.differenceMil === 0 ? 'text-emerald-700' : 'text-red-600')}>
                <span>Écart</span> <Money mil={s.differenceMil} />
              </p>
            )}
            {s.closingComment && <p className="text-gray-600">« {s.closingComment} »</p>}
          </div>
          <div className="space-y-3">
            <div>
              <p className="font-semibold mb-1">Mouvements d'espèces</p>
              {s.movements.length === 0 ? <p className="text-gray-400">Aucun.</p> : (
                <ul className="space-y-1">
                  {s.movements.map((m) => (
                    <li key={m.id} className="flex justify-between gap-2">
                      <span>{m.type === 'in' ? 'Entrée' : 'Sortie'} — {m.reason} <span className="text-xs text-gray-500">({m.createdBy}, {dateTime(m.createdAt)})</span></span>
                      <Money mil={m.type === 'in' ? m.amountMil : -m.amountMil} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {s.corrections.length > 0 && (
              <div>
                <p className="font-semibold mb-1">Corrections</p>
                {s.corrections.map((c) => (
                  <p key={c.id} className="text-xs">
                    {dateTime(c.createdAt)} — {c.createdBy} : <Money mil={c.countedBeforeMil} /> → <Money mil={c.countedAfterMil} /> (« {c.reason} »)
                  </p>
                ))}
              </div>
            )}
            {s.status === 'closed' && hasPermission('cash:session_correct') && (
              <div className="rounded-xl border border-gray-100 p-3 space-y-2">
                <p className="font-semibold">Corriger le comptage</p>
                <Field label="Nouveau montant compté (DT)">
                  <input className={inputCls} inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} />
                </Field>
                <Field label="Motif (obligatoire)">
                  <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
                </Field>
                <Btn
                  variant="warning"
                  busy={busy}
                  disabled={parseDtInput(counted) === null || reason.trim().length < 3}
                  onClick={() => run(async () => { detail.setData(await posApi.correctSession(s.id, parseDtInput(counted)!, reason.trim())); setCounted(''); setReason(''); })}
                >
                  Enregistrer la correction
                </Btn>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

export const SessionsHistoryPage: React.FC = () => {
  const sessions = useLoader(() => posApi.sessions(), []);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <PageHeader icon={Vault} title="Sessions de caisse" subtitle="Ouvertures, clôtures, écarts et corrections" />
      <ErrorNote message={sessions.error} />
      <Card>
        {sessions.loading ? (
          <Loading />
        ) : (sessions.data ?? []).length === 0 ? (
          <Empty>Aucune session.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 text-left">
                <tr>
                  <th className="py-2">Ouverture</th>
                  <th>Caisse</th>
                  <th>Par</th>
                  <th>Encaissé</th>
                  <th>Attendu</th>
                  <th>Compté</th>
                  <th>Écart</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sessions.data!.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setOpen(s.id)}>
                    <td className="py-2">{dateTime(s.openedAt)}</td>
                    <td>{s.registerName} {s.status === 'open' && <Badge tone="green">Ouverte</Badge>}</td>
                    <td>{s.openedBy}</td>
                    <td><Money mil={s.summary.revenueMil} /></td>
                    <td>{s.expectedCashMil !== null ? <Money mil={s.expectedCashMil} /> : <Money mil={s.summary.expectedCashMil} />}</td>
                    <td>{s.countedCashMil !== null ? <Money mil={s.countedCashMil} /> : '—'}</td>
                    <td className={cx(s.differenceMil ? 'text-red-600 font-semibold' : '')}>{s.differenceMil !== null ? <Money mil={s.differenceMil} /> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {open && <SessionDetail id={open} onClose={() => { setOpen(null); void sessions.reload(); }} />}
    </div>
  );
};
