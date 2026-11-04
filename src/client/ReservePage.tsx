import React, { useState } from 'react';
import { tunisClock } from '../data/pricing';
import { Btn, ErrorNote, Field, inputCls, useAction } from '../pos/ui';
import { clientApi, type Me } from './clientApi';

// Demande de réservation en ligne (cahier des charges §9.1): no account needed. The request is
// only ever "en attente de confirmation" until Café Noir confirms it.

export const ReservePage: React.FC<{ me: Me | null }> = ({ me }) => {
  const tomorrow = tunisClock(new Date(Date.now() + 86_400_000)).date;
  const [f, setF] = useState({ name: me ? `${me.firstName} ${me.lastName}` : '', phone: me?.phone ?? '', email: me?.email ?? '', date: tomorrow, time: '20:00', people: 2, comment: '', website: '' });
  const [done, setDone] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  if (done) {
    return (
      <div className="rounded-2xl bg-white border border-gray-200 p-6 text-center space-y-3 max-w-md mx-auto">
        <p className="text-lg font-bold">Demande envoyée</p>
        <p className="text-sm text-gray-700">{done}</p>
        <p className="text-xs text-gray-500">Votre réservation n'est pas encore confirmée.{me ? ' Suivez-la dans votre compte.' : ''}</p>
        {me && <a href="/compte" className="text-sm font-semibold text-emerald-700 underline">Mon compte</a>}
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-white border border-gray-200 p-5 space-y-3 max-w-md mx-auto">
      <h1 className="text-xl font-bold">Réserver une table</h1>
      <ErrorNote message={error} />
      <Field label="Nom"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></Field>
      <Field label="Téléphone" hint="Nous vous appellerons si besoin."><input className={inputCls} inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" /></Field>
      <Field label="Email (facultatif)"><input className={inputCls} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Date"><input type="date" className={inputCls} min={tunisClock(new Date()).date} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Heure"><input type="time" className={inputCls} value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
        <Field label="Personnes"><input className={inputCls} inputMode="numeric" value={f.people} onChange={(e) => setF({ ...f, people: Number(e.target.value.replace(/\D/g, '')) || 1 })} /></Field>
      </div>
      <Field label="Commentaire (facultatif)"><input className={inputCls} value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} placeholder="ex. anniversaire, chaise bébé" /></Field>
      {/* Invisible to people; robots fill it and are refused. */}
      <input tabIndex={-1} aria-hidden="true" autoComplete="off" className="hidden" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} name="website" />
      <Btn
        variant="primary"
        size="lg"
        className="w-full"
        busy={busy}
        disabled={f.name.trim().length < 2 || !f.phone.trim()}
        onClick={() => run(async () => { const r = await clientApi.reserve({ ...f, email: f.email || undefined, comment: f.comment || undefined }); setDone(r.message); })}
      >
        Envoyer la demande
      </Btn>
    </div>
  );
};
