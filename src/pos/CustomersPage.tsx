import React, { useEffect, useState } from 'react';
import { Contact, Search } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { posApi, type CustomerSummary } from './api';
import { RESERVATION_LABELS } from './labels';
import { Badge, Btn, Card, dateTime, Empty, ErrorNote, Field, inputCls, Loading, Modal, Money, PageHeader, useAction, useLoader } from './ui';

// Fiche client pour la direction (cahier des charges §12.4).

const LEDGER_LABELS: Record<string, string> = { earn: 'Gagnés', redeem: 'Utilisés', expire: 'Expirés', adjust: 'Ajustement', reverse: 'Repris (avoir)', restore: 'Restitués' };

const CustomerFileModal: React.FC<{ id: string; onClose: () => void }> = ({ id, onClose }) => {
  const { hasPermission } = useAuth();
  const file = useLoader(() => posApi.customer(id), [id]);
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  const c = file.data;
  return (
    <Modal title={c ? `${c.firstName} ${c.lastName}` : 'Client'} wide onClose={onClose}>
      <ErrorNote message={error ?? file.error} />
      {!c ? <Loading /> : (
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <p>{c.email}{c.phone && ` · ${c.phone}`}</p>
            {c.birthday && <p>Anniversaire : {c.birthday.slice(5)}</p>}
            {c.preferences && <p>Préférences : {c.preferences}</p>}
            <p>Client depuis le {dateTime(c.createdAt)}</p>
            <hr className="my-2" />
            <p>Dernière visite : {c.lastVisit ? dateTime(c.lastVisit) : '—'}</p>
            <p>Visites : <strong>{c.visitsCount}</strong></p>
            <p>Dépenses rattachées : <strong><Money mil={c.spentMil} /></strong></p>
            <p>Avantages utilisés : {c.advantagesUsed}</p>
            <p className="font-semibold pt-2">Produits fréquents</p>
            {c.topProducts.length === 0 ? <p className="text-gray-400">—</p> : <ul>{c.topProducts.map((p) => <li key={p.name}>{p.qty} × {p.name}</li>)}</ul>}
            <p className="font-semibold pt-2">Réservations</p>
            {c.reservations.length === 0 ? <p className="text-gray-400">—</p> : <ul>{c.reservations.map((r) => <li key={r.id}>{r.date} {r.time} · {r.people} pers. · {RESERVATION_LABELS[r.status] ?? r.status}</li>)}</ul>}
            <p className="font-semibold pt-2">Retours</p>
            {c.feedback.length === 0 ? <p className="text-gray-400">—</p> : <ul>{c.feedback.map((f) => <li key={f.id}>{'★'.repeat(f.rating)} {f.comment}</li>)}</ul>}
          </div>
          <div className="space-y-2">
            <p className="text-base font-bold">Fidélité : {c.loyalty.available} point(s) disponibles</p>
            {c.loyalty.reserved > 0 && <p className="text-xs text-gray-500">{c.loyalty.reserved} point(s) réservés sur une addition en cours</p>}
            <ul className="max-h-60 overflow-y-auto divide-y divide-gray-100">
              {c.loyalty.history.map((e) => (
                <li key={e.id} className="py-1 flex justify-between gap-2">
                  <span>{LEDGER_LABELS[e.type] ?? e.type}{e.ticketNumber && ` · ${e.ticketNumber}`}{e.reason && e.type === 'adjust' && ` · ${e.reason}`}<span className="block text-xs text-gray-400">{dateTime(e.createdAt)} · {e.createdBy}</span></span>
                  <span className={e.points >= 0 ? 'text-emerald-700 font-semibold' : 'text-red-600 font-semibold'}>{e.points > 0 ? '+' : ''}{e.points}</span>
                </li>
              ))}
            </ul>
            {hasPermission('loyalty:adjust') && (
              <div className="rounded-xl border border-gray-100 p-3 space-y-2">
                <p className="font-semibold">Ajuster les points</p>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Points (+ ou −)"><input className={inputCls} inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value.replace(/[^\d-]/g, ''))} /></Field>
                  <Field label="Motif (obligatoire)"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
                </div>
                <Btn variant="warning" busy={busy} disabled={!Number(points) || reason.trim().length < 3} onClick={() => run(async () => { await posApi.adjustPoints(c.id, Number(points), reason.trim()); setPoints(''); setReason(''); await file.reload(); })}>
                  Enregistrer l'ajustement
                </Btn>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

export const CustomersPage: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerSummary[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = window.setTimeout(() => void posApi.searchCustomers(q).then(setResults).catch((e: Error) => setError(e.message)), 250);
    return () => window.clearTimeout(t);
  }, [query]);
  return (
    <div className="space-y-4">
      <PageHeader icon={Contact} title="Clients" subtitle="Comptes clients facultatifs, créés par les clients eux-mêmes" />
      <ErrorNote message={error} />
      <Card>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className={`${inputCls} pl-9`} placeholder="Nom, email ou téléphone…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {query.trim().length >= 2 && results.length === 0 ? <Empty>Aucun client trouvé.</Empty> : (
          <ul className="divide-y divide-gray-100">
            {results.map((c) => (
              <li key={c.id} className="py-2 flex items-center gap-2 text-sm">
                <span className="flex-1">{c.firstName} {c.lastName}<span className="block text-xs text-gray-500">{c.email}{c.phone && ` · ${c.phone}`}</span></span>
                <Badge tone="green">{c.points} pts</Badge>
                <Btn size="sm" onClick={() => setOpen(c.id)}>Fiche</Btn>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {open && <CustomerFileModal id={open} onClose={() => setOpen(null)} />}
    </div>
  );
};
