import React, { useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Phone, Plus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { tunisClock } from '../data/pricing';
import { usePosEvents } from '../hooks/usePosEvents';
import { posApi, type Reservation, type ReservationInput } from './api';
import { RESERVATION_LABELS } from './labels';
import { Badge, Btn, Card, cx, Empty, ErrorNote, Field, inputCls, Loading, Modal, PageHeader, useAction, useLoader } from './ui';

// Réservations (cahier des charges §9): day view, requests to confirm, phone bookings, slot and
// capacity checks, seating on arrival.

const TONE: Record<Reservation['status'], 'amber' | 'green' | 'red' | 'gray' | 'blue' | 'violet'> = {
  pending: 'amber',
  confirmed: 'green',
  rejected: 'red',
  cancelled: 'gray',
  arrived: 'blue',
  no_show: 'red',
  completed: 'gray',
};

const shiftDate = (date: string, days: number) => tunisClock(new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000)).date;

const TablePicker: React.FC<{ date: string; time: string; people: number; exceptId?: string; value: string | null; onChange: (id: string | null) => void }> = ({ date, time, people, exceptId, value, onChange }) => {
  const [options, setOptions] = useState<Awaited<ReturnType<typeof posApi.availability>>>([]);
  useEffect(() => {
    if (!date || !/^\d{2}:\d{2}$/.test(time) || people < 1) return;
    void posApi.availability(date, time, people, exceptId).then(setOptions).catch(() => setOptions([]));
  }, [date, time, people, exceptId]);
  return (
    <Field label="Table" hint="Tables libres sur ce créneau et assez grandes en premier.">
      <select className={inputCls} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">— Sans table pour l'instant —</option>
        {[...options].sort((a, b) => Number(Boolean(a.conflict)) - Number(Boolean(b.conflict)) || Number(!a.fits) - Number(!b.fits)).map((t) => (
          <option key={t.id} value={t.id} disabled={Boolean(t.conflict)}>
            {t.name} ({t.capacity} pl.){!t.fits ? ' — trop petite' : ''}{t.conflict ? ` — déjà réservée (${t.conflict.name} ${t.conflict.time})` : ''}
          </option>
        ))}
      </select>
    </Field>
  );
};

const ReservationForm: React.FC<{ initial?: Reservation; date: string; onClose: () => void; onSaved: () => void }> = ({ initial, date, onClose, onSaved }) => {
  const [form, setForm] = useState<ReservationInput>({
    name: initial?.name ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    date: initial?.date ?? date,
    time: initial?.time ?? '20:00',
    people: initial?.people ?? 2,
    comment: initial?.comment ?? '',
    tableId: initial?.tableId ?? null,
  });
  const { busy, error, run } = useAction();
  const set = (patch: Partial<ReservationInput>) => setForm({ ...form, ...patch });
  return (
    <Modal
      title={initial ? 'Modifier la réservation' : 'Nouvelle réservation (téléphone)'}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Annuler</Btn>
          <Btn
            variant="primary"
            busy={busy}
            disabled={!form.name.trim() || !form.phone.trim()}
            onClick={() =>
              run(async () => {
                if (initial) await posApi.updateReservation(initial.id, form);
                else await posApi.createReservation({ ...form, confirm: true, source: 'phone' });
                onSaved();
              })
            }
          >
            Enregistrer
          </Btn>
        </>
      }
    >
      <ErrorNote message={error} />
      <Field label="Nom">
        <input className={inputCls} value={form.name} onChange={(e) => set({ name: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Téléphone">
          <input className={inputCls} inputMode="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
        </Field>
        <Field label="Personnes">
          <input className={inputCls} inputMode="numeric" value={form.people} onChange={(e) => set({ people: Number(e.target.value.replace(/\D/g, '')) || 1 })} />
        </Field>
        <Field label="Date">
          <input type="date" className={inputCls} value={form.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>
        <Field label="Heure">
          <input type="time" className={inputCls} value={form.time} onChange={(e) => set({ time: e.target.value })} />
        </Field>
      </div>
      <TablePicker date={form.date} time={form.time} people={form.people} exceptId={initial?.id} value={form.tableId ?? null} onChange={(id) => set({ tableId: id })} />
      <Field label="Commentaire">
        <input className={inputCls} value={form.comment} onChange={(e) => set({ comment: e.target.value })} />
      </Field>
    </Modal>
  );
};

const Decision: React.FC<{ r: Reservation; onClose: () => void; onDone: () => void }> = ({ r, onClose, onDone }) => {
  const { hasPermission } = useAuth();
  const [tableId, setTableId] = useState<string | null>(r.tableId);
  const [note, setNote] = useState('');
  const { busy, error, run } = useAction();
  const act = (status: string) => run(async () => { await posApi.reservationStatus(r.id, status, note.trim() || undefined, tableId ?? undefined); onDone(); });
  return (
    <Modal title={`${r.name} — ${r.date} à ${r.time}`} onClose={onClose}>
      <ErrorNote message={error} />
      <div className="text-sm space-y-1">
        <p><Phone size={13} className="inline" /> <a className="text-emerald-700 underline" href={`tel:${r.phone}`}>{r.phone}</a> {r.email && `· ${r.email}`}</p>
        <p>{r.people} personne(s) · <Badge tone={TONE[r.status]}>{RESERVATION_LABELS[r.status]}</Badge> · {r.source === 'online' ? 'En ligne' : 'Téléphone'}</p>
        {r.comment && <p>« {r.comment} »</p>}
        {r.changeRequest && <p className="p-2 rounded-lg bg-amber-50 text-amber-800">Modification demandée : « {r.changeRequest} »</p>}
      </div>
      {['pending', 'confirmed'].includes(r.status) && (
        <TablePicker date={r.date} time={r.time} people={r.people} exceptId={r.id} value={tableId} onChange={setTableId} />
      )}
      <Field label="Note (obligatoire pour refuser)">
        <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        {r.status === 'pending' && (
          <>
            <Btn variant="primary" busy={busy} onClick={() => act('confirmed')}>Confirmer</Btn>
            <Btn variant="danger" busy={busy} disabled={note.trim().length < 2} onClick={() => act('rejected')}>Refuser</Btn>
          </>
        )}
        {r.status === 'confirmed' && (
          <>
            {hasPermission('visits:manage') && <Btn variant="primary" busy={busy} disabled={!tableId} onClick={() => act('arrived')}>Client arrivé — installer</Btn>}
            <Btn busy={busy} onClick={() => act('no_show')}>Non présenté</Btn>
          </>
        )}
        {['pending', 'confirmed'].includes(r.status) && <Btn variant="ghost" busy={busy} onClick={() => act('cancelled')}>Annuler la réservation</Btn>}
      </div>
    </Modal>
  );
};

export const ReservationsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const [date, setDate] = useState(tunisClock(new Date()).date);
  const list = useLoader(() => posApi.reservations(date, date), [date]);
  const pendingAll = useLoader(() => posApi.reservations(tunisClock(new Date()).date, shiftDate(tunisClock(new Date()).date, 90)), []);
  const [editing, setEditing] = useState<Reservation | 'new' | null>(null);
  const [deciding, setDeciding] = useState<Reservation | null>(null);
  usePosEvents(['reservations.changed'], () => {
    void list.reload();
    void pendingAll.reload();
  }, 30_000);

  const refresh = () => {
    void list.reload();
    void pendingAll.reload();
  };
  const toHandle = (pendingAll.data ?? []).filter((r) => r.status === 'pending' || (r.changeRequest && r.status === 'confirmed'));

  return (
    <div className="space-y-4">
      <PageHeader
        icon={CalendarDays}
        title="Réservations"
        subtitle="Une demande en ligne reste en attente tant qu'elle n'est pas confirmée"
        actions={hasPermission('reservations:manage') && <Btn variant="primary" onClick={() => setEditing('new')}><Plus size={14} /> Réservation téléphone</Btn>}
      />
      <ErrorNote message={list.error} />
      {toHandle.length > 0 && (
        <Card title={`À traiter (${toHandle.length})`}>
          <ul className="space-y-2">
            {toHandle.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="flex-1">
                  <strong>{r.name}</strong> — {r.date} à {r.time}, {r.people} pers.
                  {r.changeRequest && <span className="text-amber-700"> · modification : « {r.changeRequest} »</span>}
                </span>
                <Badge tone={TONE[r.status]}>{RESERVATION_LABELS[r.status]}</Badge>
                {hasPermission('reservations:manage') && <Btn size="sm" variant="primary" onClick={() => setDeciding(r)}>Traiter</Btn>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card
        title={
          <span className="flex items-center gap-2">
            <button aria-label="Jour précédent" onClick={() => setDate(shiftDate(date, -1))} className="p-2 rounded-lg hover:bg-gray-100"><ChevronLeft size={16} /></button>
            <input type="date" className={cx(inputCls, 'w-auto')} value={date} onChange={(e) => setDate(e.target.value)} />
            <button aria-label="Jour suivant" onClick={() => setDate(shiftDate(date, 1))} className="p-2 rounded-lg hover:bg-gray-100"><ChevronRight size={16} /></button>
          </span>
        }
      >
        {list.loading ? (
          <Loading />
        ) : (list.data ?? []).length === 0 ? (
          <Empty>Aucune réservation ce jour.</Empty>
        ) : (
          <ul className="divide-y divide-gray-100">
            {list.data!.map((r) => (
              <li key={r.id} className="py-2 flex flex-wrap items-center gap-3 text-sm">
                <span className="w-14 font-bold tabular-nums">{r.time}</span>
                <span className="flex-1 min-w-[160px]">
                  {r.name} · {r.people} pers. {r.tableName && <span className="text-gray-500">· {r.tableName}</span>}
                  {r.comment && <span className="block text-xs text-gray-500">« {r.comment} »</span>}
                </span>
                <Badge tone={TONE[r.status]}>{RESERVATION_LABELS[r.status]}</Badge>
                {hasPermission('reservations:manage') && (
                  <span className="flex gap-1">
                    <Btn size="sm" onClick={() => setDeciding(r)}>Ouvrir</Btn>
                    {['pending', 'confirmed'].includes(r.status) && <Btn size="sm" variant="ghost" onClick={() => setEditing(r)}>Modifier</Btn>}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && <ReservationForm initial={editing === 'new' ? undefined : editing} date={date} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
      {deciding && <Decision r={deciding} onClose={() => setDeciding(null)} onDone={() => { setDeciding(null); refresh(); }} />}
    </div>
  );
};
