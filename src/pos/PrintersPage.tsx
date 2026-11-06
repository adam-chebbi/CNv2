import React, { useState } from 'react';
import { AlertTriangle, Plus, Printer, RotateCcw } from 'lucide-react';
import { apiGet, apiPost, apiPut } from '../api/client';
import { usePosEvents } from '../hooks/usePosEvents';
import { posApi } from './api';
import { Badge, Btn, Card, cx, dateTime, Empty, ErrorNote, Field, inputCls, Loading, Modal, PageHeader, useAction, useLoader } from './ui';

// Imprimantes & tiroir-caisse (améliorations 03 & 04): print agents, printers per station,
// test page, print queue with retries.

interface Agent { id: string; name: string; version: string | null; lastSeenAt: string | null; online: boolean; revoked: boolean; createdAt: string }
interface PrinterView { id: string; name: string; agentId: string | null; target: string; address: string; paperWidth: 58 | 80; copies: number; autoPrint: boolean; cashDrawer: boolean; active: boolean; status: string | null; statusAt: string | null }
interface Job { id: string; kind: string; target: string; status: string; attempts: number; lastError: string | null; title: string; duplicate: boolean; createdBy: string; createdAt: string; printedAt: string | null }

const KIND_LABELS: Record<string, string> = { prep: 'Bon de préparation', bill: 'Addition', receipt: 'Ticket client', cancel: 'Annulation', drawer: 'Tiroir-caisse', test: 'Page de test' };

// Red banner on every screen that prints, when something prevents printing.
export const PrintStatusBanner: React.FC = () => {
  const status = useLoader(() => posApi.printStatus(), []);
  usePosEvents(['print.changed'], () => void status.reload(), 30_000);
  const s = status.data;
  if (!s || !s.configured || (s.failed === 0 && s.stuck === 0 && s.offline.length === 0)) return null;
  return (
    <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
      <AlertTriangle size={16} />
      <span>
        Impression : {s.offline.length > 0 && `${s.offline.join(', ')} hors ligne. `}
        {s.failed > 0 && `${s.failed} ticket(s) en échec. `}
        {s.stuck > 0 && `${s.stuck} ticket(s) en attente depuis plus d'une minute. `}
        Les écrans restent la référence.
      </span>
    </div>
  );
};

const PrinterForm: React.FC<{ initial?: PrinterView; agents: Agent[]; registers: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }> = ({ initial, agents, registers, onClose, onSaved }) => {
  const [f, setF] = useState({
    name: initial?.name ?? '',
    agentId: initial?.agentId ?? agents.find((a) => !a.revoked)?.id ?? '',
    target: initial?.target ?? 'kitchen',
    address: initial?.address ?? 'tcp://192.168.1.50:9100',
    paperWidth: initial?.paperWidth ?? 80,
    copies: initial?.copies ?? 1,
    autoPrint: initial?.autoPrint ?? true,
    cashDrawer: initial?.cashDrawer ?? false,
    active: initial?.active ?? true,
  });
  const { busy, error, run } = useAction();
  return (
    <Modal
      title={initial ? initial.name : 'Nouvelle imprimante'}
      onClose={onClose}
      footer={<Btn variant="primary" busy={busy} disabled={!f.name.trim() || !f.agentId} onClick={() => run(async () => { if (initial) await apiPut(`/pos/printers/${initial.id}`, f); else await apiPost('/pos/printers', f); onSaved(); })}>Enregistrer</Btn>}
    >
      <ErrorNote message={error} />
      <Field label="Nom"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Imprimante cuisine" /></Field>
      <Field label="Ce qu'elle imprime">
        <select className={inputCls} value={f.target} onChange={(e) => setF({ ...f, target: e.target.value, cashDrawer: e.target.value.startsWith('register:') ? f.cashDrawer : false })}>
          <option value="kitchen">Bons cuisine</option>
          <option value="bar">Bons bar</option>
          {registers.map((r) => <option key={r.id} value={`register:${r.id}`}>Tickets de {r.name}</option>)}
        </select>
      </Field>
      <Field label="Agent (ordinateur relié)">
        <select className={inputCls} value={f.agentId} onChange={(e) => setF({ ...f, agentId: e.target.value })}>
          {agents.filter((a) => !a.revoked).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Adresse" hint="tcp://IP:9100 (réseau), file:///dev/usb/lp0 (USB Linux), share://localhost/NomDuPartage (Windows)">
        <input className={inputCls} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value.trim() })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Largeur du papier"><select className={inputCls} value={f.paperWidth} onChange={(e) => setF({ ...f, paperWidth: Number(e.target.value) as 58 | 80 })}><option value={80}>80 mm</option><option value={58}>58 mm</option></select></Field>
        <Field label="Exemplaires"><select className={inputCls} value={f.copies} onChange={(e) => setF({ ...f, copies: Number(e.target.value) })}>{[1, 2, 3].map((n) => <option key={n}>{n}</option>)}</select></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.autoPrint} onChange={(e) => setF({ ...f, autoPrint: e.target.checked })} /> Impression automatique (bons à l'envoi, ticket au règlement)</label>
      {f.target.startsWith('register:') && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.cashDrawer} onChange={(e) => setF({ ...f, cashDrawer: e.target.checked })} /> Tiroir-caisse branché sur cette imprimante</label>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>
    </Modal>
  );
};

export const PrintersPage: React.FC = () => {
  const agents = useLoader(() => apiGet<Agent[]>('/pos/print-agents'), []);
  const printers = useLoader(() => apiGet<PrinterView[]>('/pos/printers'), []);
  const registers = useLoader(() => posApi.registers(), []);
  const jobs = useLoader(() => apiGet<Job[]>('/pos/print-jobs'), []);
  const [editing, setEditing] = useState<PrinterView | 'new' | null>(null);
  const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null);
  const [agentName, setAgentName] = useState('PC caisse');
  const { busy, error, run } = useAction();
  usePosEvents(['print.changed'], () => {
    void jobs.reload();
    void printers.reload();
  }, 15_000);
  if (agents.loading || printers.loading) return <Loading />;
  const targetLabel = (t: string) => (t === 'kitchen' ? 'Cuisine' : t === 'bar' ? 'Bar' : `Caisse — ${(registers.data ?? []).find((r) => `register:${r.id}` === t)?.name ?? t.slice(9)}`);
  return (
    <div className="space-y-4">
      <PageHeader icon={Printer} title="Imprimantes & tiroir" subtitle="Bons cuisine/bar et tickets imprimés automatiquement par l'agent installé sur l'ordinateur de la caisse" />
      <ErrorNote message={error ?? agents.error ?? printers.error} />
      <PrintStatusBanner />
      <Card title="Agents d'impression" actions={
        <div className="flex gap-2">
          <input className={cx(inputCls, 'w-40 min-h-[36px] py-1')} value={agentName} onChange={(e) => setAgentName(e.target.value)} aria-label="Nom de l'agent" />
          <Btn size="sm" busy={busy} disabled={!agentName.trim()} onClick={() => run(async () => { const r = await apiPost<{ name: string; token: string }>('/pos/print-agents', { name: agentName.trim() }); setNewToken(r); await agents.reload(); })}><Plus size={14} /> Nouvel agent</Btn>
        </div>
      }>
        {(agents.data ?? []).length === 0 ? <Empty>Aucun agent. Créez-en un puis installez le programme du dossier « agent » sur l'ordinateur de la caisse.</Empty> : (
          <ul className="divide-y divide-gray-100">
            {agents.data!.map((a) => (
              <li key={a.id} className="py-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="flex-1 font-semibold">{a.name}<span className="block text-xs font-normal text-gray-500">{a.version ? `version ${a.version}` : 'jamais connecté'}{a.lastSeenAt && ` · vu ${dateTime(a.lastSeenAt)}`}</span></span>
                <Badge tone={a.revoked ? 'gray' : a.online ? 'green' : 'red'}>{a.revoked ? 'Révoqué' : a.online ? 'En ligne' : 'Hors ligne'}</Badge>
                {!a.revoked && <Btn size="sm" variant="ghost" busy={busy} onClick={() => run(async () => { if (window.confirm(`Révoquer l'agent ${a.name} ? Il ne pourra plus imprimer.`)) { await apiPost(`/pos/print-agents/${a.id}/revoke`); await agents.reload(); } })}>Révoquer</Btn>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Imprimantes" actions={<Btn size="sm" variant="primary" disabled={!(agents.data ?? []).some((a) => !a.revoked)} onClick={() => setEditing('new')}><Plus size={14} /> Imprimante</Btn>}>
        {(printers.data ?? []).length === 0 ? <Empty>Aucune imprimante : les tickets s'impriment par le navigateur.</Empty> : (
          <ul className="divide-y divide-gray-100">
            {printers.data!.map((p) => (
              <li key={p.id} className="py-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="flex-1">
                  <strong>{p.name}</strong> — {targetLabel(p.target)}
                  <span className="block text-xs text-gray-500">{p.address} · {p.paperWidth} mm · {p.copies} ex.{p.autoPrint ? ' · automatique' : ''}{p.cashDrawer ? ' · tiroir' : ''}</span>
                </span>
                <Badge tone={!p.active ? 'gray' : p.status === 'ok' ? 'green' : p.status ? 'red' : 'amber'}>{!p.active ? 'Inactive' : p.status === 'ok' ? 'Joignable' : p.status ?? 'État inconnu'}</Badge>
                <Btn size="sm" busy={busy} onClick={() => run(async () => { await apiPost(`/pos/printers/${p.id}/test`); await jobs.reload(); })}>Page de test</Btn>
                <Btn size="sm" variant="ghost" onClick={() => setEditing(p)}>Modifier</Btn>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Derniers tickets envoyés">
        {(jobs.data ?? []).length === 0 ? <Empty>Aucun ticket.</Empty> : (
          <ul className="divide-y divide-gray-100 text-sm">
            {jobs.data!.slice(0, 40).map((j) => (
              <li key={j.id} className="py-1.5 flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-500 w-28">{dateTime(j.createdAt)}</span>
                <span className="flex-1">{KIND_LABELS[j.kind] ?? j.kind}{j.duplicate && ' (duplicata)'} — {j.title} <span className="text-xs text-gray-500">→ {targetLabel(j.target)}</span>{j.lastError && <span className="block text-xs text-red-600">{j.lastError}</span>}</span>
                <Badge tone={j.status === 'printed' ? 'green' : j.status === 'failed' ? 'red' : 'amber'}>{j.status === 'printed' ? 'Imprimé' : j.status === 'failed' ? 'Échec' : j.status === 'printing' ? 'En cours' : 'En attente'}</Badge>
                {j.status === 'failed' && <Btn size="sm" busy={busy} onClick={() => run(async () => { await apiPost(`/pos/print-jobs/${j.id}/retry`); await jobs.reload(); })}><RotateCcw size={13} /> Relancer</Btn>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && <PrinterForm initial={editing === 'new' ? undefined : editing} agents={agents.data ?? []} registers={registers.data ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void printers.reload(); }} />}
      {newToken && (
        <Modal title={`Jeton de l'agent « ${newToken.name} »`} onClose={() => setNewToken(null)}>
          <p className="text-sm">Copiez ce jeton dans <code>agent-config.json</code> sur l'ordinateur de la caisse. <strong>Il ne sera plus affiché.</strong></p>
          <pre className="p-3 rounded-xl bg-gray-100 text-xs break-all whitespace-pre-wrap select-all">{JSON.stringify({ serverUrl: window.location.origin, token: newToken.token }, null, 2)}</pre>
          <Btn onClick={() => void navigator.clipboard?.writeText(JSON.stringify({ serverUrl: window.location.origin, token: newToken.token }, null, 2))}>Copier</Btn>
        </Modal>
      )}
    </div>
  );
};
