import React, { useState } from 'react';
import { BarChart3, Clock, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { apiGet, apiPost } from '../api/client';
import { tunisClock } from '../data/pricing';
import { CLOCK_LABELS, formatMinutes, type ClockAction, type ClockState, type Shift } from '../data/timeclock';
import { Badge, Btn, Card, cx, dateTime, Empty, ErrorNote, Field, inputCls, Loading, Modal, Money, PageHeader, time, useAction, useLoader } from './ui';

// Pointage, présences de l'équipe et statistiques des serveurs (cahier des charges §13).

interface ShiftView extends Shift {
  corrected: boolean;
}
interface EventView {
  id: string;
  action: ClockAction;
  at: string;
  originalAt: string | null;
  incoherent: boolean;
  source: 'self' | 'manual';
}
interface WaiterStats {
  userId: string | null;
  name: string;
  visitsServed: number;
  covers: number;
  revenueMil: number;
  ordersHandled: number;
  cancellationsRequested: number;
  workedMinutes: number;
  incompleteShifts: number;
}

const today = () => tunisClock(new Date()).date;
const daysAgo = (n: number) => tunisClock(new Date(Date.now() - n * 86_400_000)).date;

const STATE_LABEL: Record<ClockState, string> = { off: 'Non pointé', working: 'En service', on_break: 'En pause' };

const PeriodPicker: React.FC<{ from: string; to: string; onChange: (from: string, to: string) => void }> = ({ from, to, onChange }) => (
  <div className="flex flex-wrap gap-2 items-end">
    <Field label="Du"><input type="date" className={inputCls} value={from} onChange={(e) => onChange(e.target.value, to)} /></Field>
    <Field label="Au"><input type="date" className={inputCls} value={to} onChange={(e) => onChange(from, e.target.value)} /></Field>
    <Btn size="sm" onClick={() => onChange(today(), today())}>Aujourd'hui</Btn>
    <Btn size="sm" onClick={() => onChange(daysAgo(6), today())}>7 jours</Btn>
    <Btn size="sm" onClick={() => onChange(`${today().slice(0, 8)}01`, today())}>Ce mois</Btn>
  </div>
);

const ShiftsTable: React.FC<{ shifts: ShiftView[] }> = ({ shifts }) =>
  shifts.length === 0 ? (
    <Empty>Aucun pointage sur la période.</Empty>
  ) : (
    <table className="w-full text-sm">
      <thead className="text-xs text-gray-500 text-left">
        <tr><th className="py-1">Jour</th><th>Arrivée</th><th>Pauses</th><th>Départ</th><th>Travaillé</th><th /></tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {shifts.map((s, i) => (
          <tr key={i}>
            <td className="py-1.5">{s.date}</td>
            <td>{s.start ? time(s.start) : '—'}</td>
            <td className="text-xs">{s.breaks.map((b) => `${time(b.start)}–${b.end ? time(b.end) : '?'}`).join(', ') || '—'}</td>
            <td>{s.end ? time(s.end) : '—'}</td>
            <td className="font-semibold">{s.workedMinutes === null ? <Badge tone="red">Incomplet</Badge> : formatMinutes(s.workedMinutes)}</td>
            <td className="text-xs">
              {s.anomalies.map((a) => <Badge key={a} tone="amber">{a}</Badge>)}
              {s.corrected && <Badge tone="blue">Corrigé</Badge>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

const StatsCards: React.FC<{ s: WaiterStats }> = ({ s }) => (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
    {[
      ['Tables servies', String(s.visitsServed)],
      ['Couverts', String(s.covers)],
      ['Chiffre d’affaires', null],
      ['Commandes', String(s.ordersHandled)],
      ['Annulations demandées', String(s.cancellationsRequested)],
      ['Heures', formatMinutes(s.workedMinutes)],
    ].map(([label, value]) => (
      <div key={label} className="rounded-xl bg-gray-50 p-3">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-lg font-bold">{value ?? <Money mil={s.revenueMil} />}</p>
      </div>
    ))}
  </div>
);

export const TimeclockPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const [range, setRange] = useState({ from: daysAgo(6), to: today() });
  const me = useLoader(() => apiGet<{ state: ClockState; allowed: ClockAction[]; shifts: ShiftView[] }>(`/pos/timeclock/me?from=${range.from}&to=${range.to}`), [range]);
  const stats = useLoader(() => (hasPermission('stats:self') ? apiGet<{ stats: WaiterStats }>(`/pos/stats/waiters/me?from=${range.from}&to=${range.to}`) : Promise.resolve(null)), [range]);
  const [done, setDone] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  if (me.loading) return <Loading />;
  const d = me.data;
  return (
    <div className="space-y-4">
      <PageHeader icon={Clock} title="Pointage" subtitle="L'heure enregistrée est celle du système. Se connecter ne vaut pas arrivée." />
      <ErrorNote message={error ?? me.error} />
      {d && (
        <Card>
          <p className="text-sm">État : <Badge tone={d.state === 'working' ? 'green' : d.state === 'on_break' ? 'amber' : 'gray'}>{STATE_LABEL[d.state]}</Badge></p>
          {done && <p className="text-sm text-emerald-700">{done}</p>}
          <div className="grid sm:grid-cols-2 gap-3">
            {d.allowed.map((a) => (
              <Btn key={a} variant={a === 'out' ? 'warning' : 'primary'} size="lg" busy={busy} onClick={() => run(async () => { await apiPost('/pos/timeclock', { action: a }); setDone(`${CLOCK_LABELS[a]} enregistré à ${time(new Date().toISOString())}.`); await me.reload(); })}>
                {CLOCK_LABELS[a]}
              </Btn>
            ))}
          </div>
        </Card>
      )}
      <PeriodPicker from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
      {stats.data && <Card title="Mes statistiques"><StatsCards s={stats.data.stats} /></Card>}
      <Card title="Mon historique">{d && <ShiftsTable shifts={d.shifts} />}</Card>
      <p className="text-xs text-gray-500">Ce calcul d'heures ne remplace pas un logiciel de paie ni de déclaration sociale.</p>
    </div>
  );
};

const CorrectionModal: React.FC<{ event?: EventView; userId: string; name: string; onClose: () => void; onDone: () => void }> = ({ event, userId, name, onClose, onDone }) => {
  const toLocal = (iso: string) => new Date(new Date(iso).getTime() + 3600_000).toISOString().slice(0, 16);
  const [when, setWhen] = useState(event ? toLocal(event.at) : toLocal(new Date().toISOString()));
  const [action, setAction] = useState<ClockAction>(event?.action ?? 'out');
  const [reason, setReason] = useState('');
  const history = useLoader(() => (event ? apiGet<{ kind: string; beforeAt: string | null; afterAt: string | null; reason: string; createdBy: string; createdAt: string }[]>(`/pos/timeclock/events/${event.id}/corrections`) : Promise.resolve([])), [event?.id]);
  const { busy, error, run } = useAction();
  const at = `${when}:00+01:00`;
  return (
    <Modal
      title={event ? `Corriger — ${name}` : `Ajouter un pointage — ${name}`}
      onClose={onClose}
      footer={
        <>
          {event && <Btn variant="danger" busy={busy} disabled={reason.trim().length < 3} onClick={() => run(async () => { await apiPost(`/pos/timeclock/events/${event.id}/correct`, { void: true, reason: reason.trim() }); onDone(); })}>Annuler ce pointage</Btn>}
          <Btn variant="primary" busy={busy} disabled={reason.trim().length < 3} onClick={() => run(async () => { if (event) await apiPost(`/pos/timeclock/events/${event.id}/correct`, { at, reason: reason.trim() }); else await apiPost('/pos/timeclock/events', { userId, action, at, reason: reason.trim() }); onDone(); })}>Enregistrer</Btn>
        </>
      }
    >
      <ErrorNote message={error} />
      {event ? <p className="text-sm">{CLOCK_LABELS[event.action]} enregistré à {dateTime(event.at)}{event.originalAt && ` (valeur initiale ${dateTime(event.originalAt)})`}</p> : (
        <Field label="Action"><select className={inputCls} value={action} onChange={(e) => setAction(e.target.value as ClockAction)}>{(Object.keys(CLOCK_LABELS) as ClockAction[]).map((a) => <option key={a} value={a}>{CLOCK_LABELS[a]}</option>)}</select></Field>
      )}
      <Field label="Date et heure (heure de Tunis)"><input type="datetime-local" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
      <Field label="Motif (obligatoire)"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      {(history.data ?? []).length > 0 && (
        <div className="text-xs text-gray-600">
          <p className="font-semibold">Corrections précédentes</p>
          {history.data!.map((h, i) => <p key={i}>{dateTime(h.createdAt)} — {h.createdBy} : {h.reason}</p>)}
        </div>
      )}
    </Modal>
  );
};

export const TeamPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const [range, setRange] = useState({ from: daysAgo(6), to: today() });
  const team = useLoader(() => apiGet<{ people: { userId: string; name: string; state: ClockState; workedMinutes: number; incompleteShifts: number; shifts: ShiftView[]; events: EventView[] }[] }>(`/pos/timeclock/team?from=${range.from}&to=${range.to}`), [range]);
  const stats = useLoader(() => (hasPermission('stats:team') ? apiGet<{ rows: WaiterStats[] }>(`/pos/stats/waiters?from=${range.from}&to=${range.to}`) : Promise.resolve(null)), [range]);
  const members = useLoader(() => (hasPermission('timeclock:correct') ? apiGet<{ id: string; name: string }[]>('/pos/team/members') : Promise.resolve([])), []);
  const [open, setOpen] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<{ event?: EventView; userId: string; name: string } | null>(null);
  const [addFor, setAddFor] = useState('');
  return (
    <div className="space-y-4">
      <PageHeader icon={Users} title="Équipe" subtitle="Présences, anomalies, corrections et indicateurs des serveurs" />
      <PeriodPicker from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
      <ErrorNote message={team.error ?? stats.error} />
      <Card
        title="Présences"
        actions={hasPermission('timeclock:correct') && (
          <div className="flex gap-2">
            <select className={cx(inputCls, 'min-h-[36px] py-1 w-44')} value={addFor} onChange={(e) => setAddFor(e.target.value)} aria-label="Salarié">
              <option value="">Salarié…</option>
              {(members.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <Btn size="sm" disabled={!addFor} onClick={() => setCorrecting({ userId: addFor, name: members.data!.find((m) => m.id === addFor)!.name })}>Ajouter un pointage</Btn>
          </div>
        )}
      >
        {team.loading ? <Loading /> : (team.data?.people ?? []).length === 0 ? <Empty>Aucun pointage sur la période.</Empty> : (
          <ul className="divide-y divide-gray-100">
            {team.data!.people.map((p) => (
              <li key={p.userId} className="py-2 space-y-2">
                <button className="w-full flex flex-wrap items-center gap-2 text-sm text-left" onClick={() => setOpen(open === p.userId ? null : p.userId)}>
                  <span className="flex-1 font-semibold">{p.name}</span>
                  <Badge tone={p.state === 'working' ? 'green' : p.state === 'on_break' ? 'amber' : 'gray'}>{STATE_LABEL[p.state]}</Badge>
                  <span>{formatMinutes(p.workedMinutes)}</span>
                  {p.incompleteShifts > 0 && <Badge tone="red">{p.incompleteShifts} incomplet(s)</Badge>}
                </button>
                {open === p.userId && (
                  <div className="space-y-2 pl-2">
                    <ShiftsTable shifts={p.shifts} />
                    <p className="text-xs font-semibold text-gray-600">Pointages</p>
                    <ul className="text-xs space-y-1">
                      {p.events.map((e) => (
                        <li key={e.id} className="flex items-center gap-2">
                          <span className="flex-1">{dateTime(e.at)} — {CLOCK_LABELS[e.action]} {e.incoherent && <Badge tone="amber">hors séquence</Badge>} {e.originalAt && <Badge tone="blue">corrigé</Badge>} {e.source === 'manual' && <Badge>ajouté</Badge>}</span>
                          {hasPermission('timeclock:correct') && <Btn size="sm" variant="ghost" onClick={() => setCorrecting({ event: e, userId: p.userId, name: p.name })}>Corriger</Btn>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {stats.data && (
        <Card title={<span className="flex items-center gap-2"><BarChart3 size={16} /> Indicateurs des serveurs</span>}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 text-left">
                <tr><th className="py-1">Serveur</th><th>Tables</th><th>Couverts</th><th>CA attribué</th><th>Commandes</th><th>Annulations</th><th>Heures</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.data.rows.map((r) => (
                  <tr key={r.userId ?? 'none'}>
                    <td className="py-1.5">{r.userId ? r.name : <em>Non attribué</em>}</td>
                    <td>{r.visitsServed}</td>
                    <td>{r.covers}</td>
                    <td><Money mil={r.revenueMil} /></td>
                    <td>{r.ordersHandled}</td>
                    <td>{r.cancellationsRequested}</td>
                    <td>{formatMinutes(r.workedMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500">Une table servie = une visite clôturée, attribuée au serveur principal à la clôture. Le CA va au serveur responsable de chaque article lors de sa validation.</p>
        </Card>
      )}
      {correcting && <CorrectionModal {...correcting} onClose={() => setCorrecting(null)} onDone={() => { setCorrecting(null); void team.reload(); }} />}
    </div>
  );
};
