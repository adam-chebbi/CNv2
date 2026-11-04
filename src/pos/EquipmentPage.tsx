import React, { useState } from 'react';
import { Plus, Wrench } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { apiGet, apiPost, apiPut } from '../api/client';
import { formatDt, parseDtInput } from '../data/money';
import type { AssetSituation, ScheduleRow } from '../data/depreciation';
import { Badge, Btn, Card, Empty, ErrorNote, Field, inputCls, Loading, Modal, Money, PageHeader, useAction, useLoader } from './ui';

// Machines et amortissement (cahier des charges §15): register of equipment, linear depreciation.
// A management aid validated with the accountant — not statutory accounting.

interface Equipment {
  id: string;
  name: string;
  reference: string | null;
  category: string;
  serialNumber: string | null;
  supplier: string | null;
  purchaseDate: string | null;
  inServiceDate: string;
  valueMil: number;
  residualMil: number;
  durationMonths: number;
  document: string | null;
  status: 'active' | 'retired';
  retiredOn: string | null;
  retiredReason: string | null;
  situation: AssetSituation;
}

const EquipmentForm: React.FC<{ initial?: Equipment; onClose: () => void; onSaved: () => void }> = ({ initial, onClose, onSaved }) => {
  const [f, setF] = useState({
    name: initial?.name ?? '',
    reference: initial?.reference ?? '',
    category: initial?.category ?? 'Machines',
    serialNumber: initial?.serialNumber ?? '',
    supplier: initial?.supplier ?? '',
    purchaseDate: initial?.purchaseDate ?? '',
    inServiceDate: initial?.inServiceDate ?? '',
    value: initial ? formatDt(initial.valueMil, false) : '',
    residual: initial ? formatDt(initial.residualMil, false) : '0',
    durationMonths: initial?.durationMonths ?? 60,
    document: initial?.document ?? '',
  });
  const { busy, error, run } = useAction();
  const valueMil = parseDtInput(f.value);
  const residualMil = parseDtInput(f.residual) ?? 0;
  const monthly = valueMil ? Math.floor((valueMil - residualMil) / Math.max(1, f.durationMonths)) : 0;
  const save = () =>
    run(async () => {
      const body = { ...f, reference: f.reference || null, serialNumber: f.serialNumber || null, supplier: f.supplier || null, purchaseDate: f.purchaseDate || null, document: f.document || null, valueMil, residualMil };
      if (initial) await apiPut(`/pos/equipment/${initial.id}`, body);
      else await apiPost('/pos/equipment', body);
      onSaved();
    });
  return (
    <Modal title={initial ? initial.name : 'Nouvel équipement'} wide onClose={onClose} footer={<Btn variant="primary" busy={busy} disabled={!f.name.trim() || !valueMil || !f.inServiceDate} onClick={save}>Enregistrer</Btn>}>
      <ErrorNote message={error} />
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Nom"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Machine espresso 2 groupes" /></Field>
        <Field label="Catégorie"><input className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
        <Field label="Référence"><input className={inputCls} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        <Field label="N° de série"><input className={inputCls} value={f.serialNumber} onChange={(e) => setF({ ...f, serialNumber: e.target.value })} /></Field>
        <Field label="Fournisseur"><input className={inputCls} value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></Field>
        <Field label="Justificatif (n° de facture, emplacement)"><input className={inputCls} value={f.document} onChange={(e) => setF({ ...f, document: e.target.value })} /></Field>
        <Field label="Date d'achat"><input type="date" className={inputCls} value={f.purchaseDate} onChange={(e) => setF({ ...f, purchaseDate: e.target.value })} /></Field>
        <Field label="Mise en service" hint="L'amortissement commence ce mois-ci."><input type="date" className={inputCls} value={f.inServiceDate} onChange={(e) => setF({ ...f, inServiceDate: e.target.value })} /></Field>
        <Field label="Valeur amortissable (DT)"><input className={inputCls} inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>
        <Field label="Valeur résiduelle (DT)"><input className={inputCls} inputMode="decimal" value={f.residual} onChange={(e) => setF({ ...f, residual: e.target.value })} /></Field>
        <Field label="Durée (mois)"><input className={inputCls} inputMode="numeric" value={f.durationMonths} onChange={(e) => setF({ ...f, durationMonths: Number(e.target.value.replace(/\D/g, '')) || 1 })} /></Field>
      </div>
      {monthly > 0 && <p className="text-sm">Dotation mensuelle : <strong><Money mil={monthly} /></strong> · annuelle : <strong><Money mil={monthly * 12} /></strong></p>}
    </Modal>
  );
};

const ScheduleModal: React.FC<{ eq: Equipment; onClose: () => void; onChanged: () => void }> = ({ eq, onClose, onChanged }) => {
  const { hasPermission } = useAuth();
  const data = useLoader(() => apiGet<{ schedule: ScheduleRow[] }>(`/pos/equipment/${eq.id}/schedule`), [eq.id]);
  const [retire, setRetire] = useState({ date: '', reason: '' });
  const { busy, error, run } = useAction();
  return (
    <Modal title={`Amortissement — ${eq.name}`} wide onClose={onClose}>
      <ErrorNote message={error ?? data.error} />
      {!data.data ? <Loading /> : (
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 text-left"><tr><th className="py-1">Mois</th><th>Dotation</th><th>Cumul</th><th>Valeur nette</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {data.data.schedule.map((r) => <tr key={r.month}><td className="py-1">{r.month}</td><td><Money mil={r.dotationMil} /></td><td><Money mil={r.cumulativeMil} /></td><td><Money mil={r.netMil} /></td></tr>)}
            </tbody>
          </table>
        </div>
      )}
      {eq.status === 'active' && hasPermission('equipment:manage') && (
        <div className="rounded-xl border border-gray-100 p-3 space-y-2">
          <p className="font-semibold text-sm">Sortir du suivi (vente, panne définitive…)</p>
          <div className="grid sm:grid-cols-2 gap-2">
            <input type="date" className={inputCls} value={retire.date} onChange={(e) => setRetire({ ...retire, date: e.target.value })} />
            <input className={inputCls} placeholder="Motif" value={retire.reason} onChange={(e) => setRetire({ ...retire, reason: e.target.value })} />
          </div>
          <Btn variant="warning" busy={busy} disabled={!retire.date || retire.reason.trim().length < 3} onClick={() => run(async () => { await apiPost(`/pos/equipment/${eq.id}/retire`, retire); onChanged(); })}>Sortir du suivi</Btn>
        </div>
      )}
    </Modal>
  );
};

export const EquipmentPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const list = useLoader(() => apiGet<Equipment[]>('/pos/equipment'), []);
  const [editing, setEditing] = useState<Equipment | 'new' | null>(null);
  const [scheduleOf, setScheduleOf] = useState<Equipment | null>(null);
  const active = (list.data ?? []).filter((e) => e.status === 'active');
  return (
    <div className="space-y-4">
      <PageHeader icon={Wrench} title="Machines & amortissement" subtitle="Amortissement linéaire. Les achats, paiements et dotations sont présentés séparément." actions={hasPermission('equipment:manage') && <Btn variant="primary" onClick={() => setEditing('new')}><Plus size={14} /> Équipement</Btn>} />
      <ErrorNote message={list.error} />
      <div className="grid sm:grid-cols-3 gap-3">
        <Card><p className="text-xs text-gray-500">Dotation mensuelle totale</p><p className="text-xl font-bold"><Money mil={active.reduce((s, e) => s + (e.situation.remainingMonths > 0 ? e.situation.monthlyMil : 0), 0)} /></p></Card>
        <Card><p className="text-xs text-gray-500">Valeur nette estimée</p><p className="text-xl font-bold"><Money mil={active.reduce((s, e) => s + e.situation.netMil, 0)} /></p></Card>
        <Card><p className="text-xs text-gray-500">Équipements suivis</p><p className="text-xl font-bold">{active.length}</p></Card>
      </div>
      <Card>
        {list.loading ? <Loading /> : (list.data ?? []).length === 0 ? <Empty>Aucun équipement enregistré.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 text-left"><tr><th className="py-1">Équipement</th><th>Mise en service</th><th>Valeur</th><th>Mensuel</th><th>Cumul</th><th>Valeur nette</th><th>Reste</th><th /></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {list.data!.map((e) => (
                  <tr key={e.id}>
                    <td className="py-1.5">{e.name}<span className="block text-xs text-gray-400">{e.category}{e.supplier && ` · ${e.supplier}`}</span></td>
                    <td>{e.inServiceDate}</td>
                    <td><Money mil={e.valueMil} /></td>
                    <td><Money mil={e.situation.monthlyMil} /></td>
                    <td><Money mil={e.situation.cumulativeMil} /></td>
                    <td><Money mil={e.situation.netMil} /></td>
                    <td>{e.status === 'retired' ? <Badge>Sorti le {e.retiredOn}</Badge> : `${e.situation.remainingMonths} mois`}</td>
                    <td className="whitespace-nowrap">
                      <Btn size="sm" variant="ghost" onClick={() => setScheduleOf(e)}>Tableau</Btn>
                      {hasPermission('equipment:manage') && e.status === 'active' && <Btn size="sm" variant="ghost" onClick={() => setEditing(e)}>Modifier</Btn>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-gray-500">Ce suivi de gestion ne remplace ni la comptabilité réglementaire ni une déclaration fiscale. Bases et durées à valider avec votre comptable.</p>
      {editing && <EquipmentForm initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void list.reload(); }} />}
      {scheduleOf && <ScheduleModal eq={scheduleOf} onClose={() => setScheduleOf(null)} onChanged={() => { setScheduleOf(null); void list.reload(); }} />}
    </div>
  );
};
