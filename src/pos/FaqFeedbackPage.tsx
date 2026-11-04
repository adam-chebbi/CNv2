import React, { useState } from 'react';
import { HelpCircle, MessageSquare, Plus, Star } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { posApi, type FaqEntry, type Feedback } from './api';
import { Badge, Btn, Card, cx, dateTime, Empty, ErrorNote, Field, inputCls, Loading, Modal, PageHeader, useAction, useLoader } from './ui';

// FAQ (ingrédients, allergies, préférences) and internal reviews (cahier des charges §10.3, §10.4).

const FaqForm: React.FC<{ initial?: FaqEntry; onClose: () => void; onSaved: () => void }> = ({ initial, onClose, onSaved }) => {
  const [f, setF] = useState({ question: initial?.question ?? '', answer: initial?.answer ?? '', articleId: initial?.articleId ?? null, sort: initial?.sort ?? 0, published: initial?.published ?? true });
  const { busy, error, run } = useAction();
  return (
    <Modal
      title={initial ? 'Modifier la question' : 'Nouvelle question'}
      onClose={onClose}
      footer={
        <>
          {initial && <Btn variant="danger" busy={busy} onClick={() => run(async () => { await posApi.deleteFaq(initial.id); onSaved(); })}>Supprimer</Btn>}
          <Btn variant="primary" busy={busy} disabled={f.question.trim().length < 3 || !f.answer.trim()} onClick={() => run(async () => { if (initial) await posApi.updateFaq(initial.id, f); else await posApi.createFaq(f); onSaved(); })}>Enregistrer</Btn>
        </>
      }
    >
      <ErrorNote message={error} />
      <Field label="Question"><input className={inputCls} value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} /></Field>
      <Field label="Réponse validée par Café Noir"><textarea className={cx(inputCls, 'min-h-[110px]')} value={f.answer} onChange={(e) => setF({ ...f, answer: e.target.value })} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} /> Publiée sur le menu QR</label>
    </Modal>
  );
};

const STATUS = { to_handle: ['À traiter', 'amber'], in_progress: ['En cours', 'blue'], resolved: ['Résolu', 'green'] } as const;

const FeedbackItem: React.FC<{ f: Feedback; onChanged: () => void }> = ({ f, onChanged }) => {
  const [notes, setNotes] = useState(f.internalNotes ?? '');
  const { busy, error, run } = useAction();
  return (
    <li className="py-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-amber-500 flex">{Array.from({ length: 5 }, (_, i) => <Star key={i} size={14} fill={i < f.rating ? 'currentColor' : 'none'} />)}</span>
        <span className="text-gray-500">{dateTime(f.createdAt)}{f.tableName && ` · ${f.tableName}`}{f.customerId && ' · client identifié'}</span>
        <Badge tone={STATUS[f.status][1]}>{STATUS[f.status][0]}</Badge>
      </div>
      {f.comment && <p className="text-sm">« {f.comment} »</p>}
      <ErrorNote message={error} />
      <div className="flex flex-wrap gap-2 items-center">
        <input className={cx(inputCls, 'flex-1 min-w-[200px] min-h-[38px] py-1')} placeholder="Note interne (jamais visible du client)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {(['in_progress', 'resolved'] as const).map((s) => (
          <Btn key={s} size="sm" variant={s === 'resolved' ? 'primary' : 'secondary'} busy={busy} disabled={f.status === s && notes === (f.internalNotes ?? '')} onClick={() => run(async () => { await posApi.updateFeedback(f.id, s, notes); onChanged(); })}>
            {STATUS[s][0]}
          </Btn>
        ))}
      </div>
    </li>
  );
};

export const FaqFeedbackPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canFaq = hasPermission('pos:settings') || hasPermission('products:manage');
  const faq = useLoader(() => (canFaq ? posApi.faq() : Promise.resolve([] as FaqEntry[])), []);
  const [status, setStatus] = useState<'to_handle' | 'in_progress' | 'resolved' | ''>('to_handle');
  const feedback = useLoader(() => (hasPermission('feedback:manage') ? posApi.feedback(status || undefined) : Promise.resolve([] as Feedback[])), [status]);
  const [editing, setEditing] = useState<FaqEntry | 'new' | null>(null);
  return (
    <div className="space-y-4">
      <PageHeader icon={MessageSquare} title="FAQ & avis clients" />
      {hasPermission('feedback:manage') && (
        <Card title="Avis internes">
          <div className="flex flex-wrap gap-2">
            {([['to_handle', 'À traiter'], ['in_progress', 'En cours'], ['resolved', 'Résolus'], ['', 'Tous']] as const).map(([v, label]) => (
              <button key={label} onClick={() => setStatus(v)} className={cx('px-3 min-h-[36px] rounded-full text-xs font-semibold border', status === v ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-200')}>{label}</button>
            ))}
          </div>
          <ErrorNote message={feedback.error} />
          {feedback.loading ? <Loading /> : (feedback.data ?? []).length === 0 ? <Empty>Aucun avis.</Empty> : (
            <ul className="divide-y divide-gray-100">{feedback.data!.map((f) => <FeedbackItem key={f.id} f={f} onChanged={() => void feedback.reload()} />)}</ul>
          )}
        </Card>
      )}
      {canFaq && (
        <Card title={<span className="flex items-center gap-2"><HelpCircle size={16} /> FAQ du menu QR</span>} actions={<Btn size="sm" onClick={() => setEditing('new')}><Plus size={14} /> Question</Btn>}>
          <ErrorNote message={faq.error} />
          {(faq.data ?? []).length === 0 ? <Empty>Aucune question.</Empty> : (
            <ul className="divide-y divide-gray-100">
              {faq.data!.map((q) => (
                <li key={q.id} className="py-2 flex gap-2 items-start text-sm">
                  <span className="flex-1"><strong>{q.question}</strong><span className="block text-gray-600">{q.answer}</span></span>
                  {!q.published && <Badge>Masquée</Badge>}
                  <Btn size="sm" variant="ghost" onClick={() => setEditing(q)}>Modifier</Btn>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {editing && <FaqForm initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void faq.reload(); }} />}
    </div>
  );
};
