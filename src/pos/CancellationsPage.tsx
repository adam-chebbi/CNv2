import React, { useState } from 'react';
import { Undo2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { usePosEvents } from '../hooks/usePosEvents';
import { posApi, type Cancellation } from './api';
import { PREP_LABELS, TREATMENT_LABELS } from './labels';
import { Badge, Btn, Card, cx, dateTime, Empty, ErrorNote, Field, inputCls, Loading, Modal, Money, PageHeader, useAction, useLoader } from './ui';

// Annulations et double validation (cahier des charges §7): pending requests to decide, and the
// full history (requester, decision, decider, stock treatment).

const STATUS_TONE = { pending: 'amber', approved: 'green', rejected: 'red' } as const;
const STATUS_LABEL = { pending: 'En attente', approved: 'Acceptée', rejected: 'Refusée' };

export const CancellationDecision: React.FC<{ id: string; onClose: () => void }> = ({ id, onClose }) => {
  const list = useLoader(() => posApi.cancellations('pending'), [id]);
  const [note, setNote] = useState('');
  const [treatment, setTreatment] = useState('');
  const [stockNote, setStockNote] = useState('');
  const { busy, error, run } = useAction();
  const request = list.data?.find((c) => c.id === id);
  const prepared = request?.prepStatusAtRequest && !['none', 'to_prepare'].includes(request.prepStatusAtRequest);
  return (
    <Modal
      title="Décision d'annulation"
      onClose={onClose}
      footer={
        request && (
          <>
            <Btn variant="danger" busy={busy} disabled={note.trim().length < 2} onClick={() => run(async () => { await posApi.rejectCancellation(id, note.trim()); onClose(); })}>
              Refuser
            </Btn>
            <Btn variant="primary" busy={busy} onClick={() => run(async () => { await posApi.approveCancellation(id, { note: note.trim() || undefined, stockTreatment: treatment || undefined, stockNote: stockNote.trim() || undefined }); onClose(); })}>
              Accepter
            </Btn>
          </>
        )
      }
    >
      <ErrorNote message={error ?? list.error} />
      {!request ? (
        list.loading ? <Loading /> : <p className="text-sm">Cette demande a déjà été traitée.</p>
      ) : (
        <>
          <div className="text-sm space-y-1">
            <p><strong>{request.description}</strong> {request.tableName && `— ${request.tableName}`}</p>
            <p>Montant : <Money mil={request.amountMil} /></p>
            <p>Demandée par {request.requester} le {dateTime(request.createdAt)}</p>
            <p>Motif : « {request.reason} »</p>
            {request.prepStatusAtRequest && <p>État de préparation à la demande : {PREP_LABELS[request.prepStatusAtRequest]}</p>}
          </div>
          {prepared ? (
            <Field label="Les articles sont déjà en préparation : que deviennent-ils ?" hint="Les ingrédients ne sont pas remis en stock automatiquement.">
              <select className={inputCls} value={treatment} onChange={(e) => setTreatment(e.target.value)}>
                <option value="">— Choisir —</option>
                {['loss', 'offered', 'prep_error', 'other'].map((t) => (
                  <option key={t} value={t}>{TREATMENT_LABELS[t]}</option>
                ))}
              </select>
            </Field>
          ) : (
            <p className="text-xs p-2 rounded-lg bg-emerald-50 text-emerald-800">Pas encore préparé : les ingrédients seront remis en stock si vous acceptez.</p>
          )}
          {prepared && (
            <Field label="Précision (facultatif)">
              <input className={inputCls} value={stockNote} onChange={(e) => setStockNote(e.target.value)} />
            </Field>
          )}
          <Field label="Note de décision (obligatoire pour refuser)">
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </>
      )}
    </Modal>
  );
};

export const CancellationsPage: React.FC = () => {
  const { hasPermission, user } = useAuth();
  const [filter, setFilter] = useState<'pending' | ''>('pending');
  const list = useLoader(() => posApi.cancellations(filter || undefined), [filter]);
  const [deciding, setDeciding] = useState<string | null>(null);
  usePosEvents(['actions.changed'], () => void list.reload(), 30_000);

  return (
    <div className="space-y-4">
      <PageHeader icon={Undo2} title="Annulations" subtitle="Un serveur demande, le gérant ou la direction décide. Rien n'est supprimé." />
      <div className="flex gap-2">
        {([['pending', 'En attente'], ['', 'Historique complet']] as const).map(([v, label]) => (
          <button key={label} onClick={() => setFilter(v)} className={cx('px-4 min-h-[40px] rounded-full text-sm font-semibold border', filter === v ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-200')}>
            {label}
          </button>
        ))}
      </div>
      <ErrorNote message={list.error} />
      <Card>
        {list.loading ? (
          <Loading />
        ) : (list.data ?? []).length === 0 ? (
          <Empty>Aucune demande.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 text-left">
                <tr>
                  <th className="py-2">Date</th>
                  <th>Élément</th>
                  <th>Montant</th>
                  <th>Motif</th>
                  <th>Demandeur</th>
                  <th>État</th>
                  <th>Décision</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {list.data!.map((c: Cancellation) => (
                  <tr key={c.id}>
                    <td className="py-2 whitespace-nowrap">{dateTime(c.createdAt)}</td>
                    <td>{c.description}{c.tableName && <span className="text-gray-500"> · {c.tableName}</span>}</td>
                    <td><Money mil={c.amountMil} /></td>
                    <td>{c.reason}</td>
                    <td>{c.requester}</td>
                    <td><Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge></td>
                    <td className="text-xs text-gray-600">
                      {c.decidedBy && `${c.decidedBy}, ${dateTime(c.decidedAt!)}`}
                      {c.stockTreatment && <span className="block">{TREATMENT_LABELS[c.stockTreatment]}</span>}
                      {c.decisionNote && <span className="block">« {c.decisionNote} »</span>}
                    </td>
                    <td>
                      {c.status === 'pending' && hasPermission('cancel:approve') && c.requester !== user?.fullName && (
                        <Btn size="sm" variant="primary" onClick={() => setDeciding(c.id)}>Décider</Btn>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {deciding && <CancellationDecision id={deciding} onClose={() => { setDeciding(null); void list.reload(); }} />}
    </div>
  );
};
