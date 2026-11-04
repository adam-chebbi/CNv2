import React, { useEffect, useState } from 'react';
import { Gift, Plus } from 'lucide-react';
import type { LoyaltySettings, Reward } from '../data/loyalty';
import { formatDt, parseDtInput } from '../data/money';
import { posApi, type Segment } from './api';
import { Badge, Btn, Card, cx, Empty, ErrorNote, Field, inputCls, Loading, Modal, PageHeader, useAction, useLoader } from './ui';

// Programme de fidélité (cahier des charges §12.1, §12.5): barème, récompenses, offres ciblées.
// The commercial values are decided by Café Noir before going live.

const RewardForm: React.FC<{ initial?: Reward; onClose: () => void; onSaved: () => void }> = ({ initial, onClose, onSaved }) => {
  const catalog = useLoader(() => posApi.catalog(), []);
  const [r, setR] = useState<Omit<Reward, 'id'>>(initial ?? { name: '', pointsCost: 100, kind: 'fixed', value: 2000, articleId: null, active: true });
  const [valueText, setValueText] = useState(initial ? (initial.kind === 'percent' ? String(initial.value / 100) : formatDt(initial.value, false)) : '2');
  const { busy, error, run } = useAction();
  const value = r.kind === 'percent' ? Math.round(Number(valueText.replace(',', '.')) * 100) : r.kind === 'fixed' ? parseDtInput(valueText) ?? 0 : 0;
  return (
    <Modal title={initial ? 'Modifier la récompense' : 'Nouvelle récompense'} onClose={onClose} footer={<Btn variant="primary" busy={busy} disabled={!r.name.trim()} onClick={() => run(async () => { const body = { ...r, value }; if (initial) await posApi.updateReward(initial.id, body); else await posApi.createReward(body); onSaved(); })}>Enregistrer</Btn>}>
      <ErrorNote message={error} />
      <Field label="Nom"><input className={inputCls} value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="Café offert" /></Field>
      <Field label="Points nécessaires"><input className={inputCls} inputMode="numeric" value={r.pointsCost} onChange={(e) => setR({ ...r, pointsCost: Number(e.target.value.replace(/\D/g, '')) || 1 })} /></Field>
      <Field label="Type">
        <select className={inputCls} value={r.kind} onChange={(e) => setR({ ...r, kind: e.target.value as Reward['kind'] })}>
          <option value="fixed">Réduction d'un montant</option>
          <option value="percent">Réduction en pourcentage</option>
          <option value="product">Produit offert</option>
        </select>
      </Field>
      {r.kind === 'product' ? (
        <Field label="Produit offert (doit être sur l'addition)">
          <select className={inputCls} value={r.articleId ?? ''} onChange={(e) => setR({ ...r, articleId: e.target.value || null })}>
            <option value="">—</option>
            {(catalog.data?.articles ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
      ) : (
        <Field label={r.kind === 'percent' ? 'Valeur (%)' : 'Valeur (DT)'}><input className={inputCls} inputMode="decimal" value={valueText} onChange={(e) => setValueText(e.target.value)} /></Field>
      )}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={r.active} onChange={(e) => setR({ ...r, active: e.target.checked })} /> Proposée aux clients</label>
    </Modal>
  );
};

const TargetedOffers: React.FC = () => {
  const catalog = useLoader(() => posApi.catalog(), []);
  const offers = useLoader(() => posApi.targetedOffers(), []);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', kind: 'percent' as 'percent' | 'fixed', valueText: '10', scope: 'ticket' as 'items' | 'ticket', validDays: 14 });
  const [segment, setSegment] = useState<Segment>({});
  const [count, setCount] = useState<number | null>(null);
  const { busy, error, run } = useAction();
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => void posApi.previewSegment(segment).then((r) => setCount(r.customerCount)).catch(() => setCount(null)), 300);
    return () => window.clearTimeout(t);
  }, [segment, open]);
  const value = form.kind === 'percent' ? Math.round(Number(form.valueText.replace(',', '.')) * 100) : parseDtInput(form.valueText) ?? 0;
  return (
    <Card title="Offres ciblées" actions={<Btn size="sm" onClick={() => setOpen(true)}><Plus size={14} /> Offre ciblée</Btn>}>
      <p className="text-xs text-gray-500">Affichées dans l'espace des clients concernés et appliquées en caisse quand ils sont identifiés. Aucun envoi SMS/email automatique.</p>
      <ErrorNote message={offers.error ?? error} />
      {(offers.data ?? []).length === 0 ? <Empty>Aucune offre ciblée.</Empty> : (
        <ul className="divide-y divide-gray-100">
          {offers.data!.map((o) => (
            <li key={o.id} className="py-2 flex items-center gap-2 text-sm">
              <span className="flex-1"><strong>{o.name}</strong><span className="block text-xs text-gray-500">{o.kind === 'percent' ? `−${o.value / 100} %` : `−${formatDt(o.value)}`} · {o.customerCount} client(s) · jusqu'au {o.endsOn}</span></span>
              <Badge tone={o.active ? 'green' : 'gray'}>{o.active ? 'Active' : 'Arrêtée'}</Badge>
              {o.active && <Btn size="sm" variant="ghost" busy={busy} onClick={() => run(async () => { await posApi.deactivateTargetedOffer(o.id); await offers.reload(); })}>Arrêter</Btn>}
            </li>
          ))}
        </ul>
      )}
      {open && (
        <Modal title="Nouvelle offre ciblée" onClose={() => setOpen(false)} footer={<Btn variant="primary" busy={busy} disabled={!form.name.trim() || !value || !count} onClick={() => run(async () => { await posApi.createTargetedOffer({ name: form.name.trim(), kind: form.kind, value, scope: form.scope, validDays: form.validDays, segment }); setOpen(false); await offers.reload(); })}>Créer pour {count ?? 0} client(s)</Btn>}>
          <Field label="Nom"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Revenez nous voir" /></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Type"><select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as 'percent' | 'fixed' })}><option value="percent">%</option><option value="fixed">DT</option></select></Field>
            <Field label="Valeur"><input className={inputCls} inputMode="decimal" value={form.valueText} onChange={(e) => setForm({ ...form, valueText: e.target.value })} /></Field>
            <Field label="Validité (jours)"><input className={inputCls} inputMode="numeric" value={form.validDays} onChange={(e) => setForm({ ...form, validDays: Number(e.target.value.replace(/\D/g, '')) || 1 })} /></Field>
          </div>
          <p className="text-xs font-semibold text-gray-600">Critères (tous doivent être remplis)</p>
          <Field label="Pas venu depuis (jours)"><input className={inputCls} inputMode="numeric" value={segment.notSeenForDays ?? ''} onChange={(e) => setSegment({ ...segment, notSeenForDays: Number(e.target.value) || undefined })} /></Field>
          <Field label="Au moins N visites sur 90 jours"><input className={inputCls} inputMode="numeric" value={segment.minVisitsLast90Days ?? ''} onChange={(e) => setSegment({ ...segment, minVisitsLast90Days: Number(e.target.value) || undefined })} /></Field>
          <Field label="A déjà acheté">
            <select className={inputCls} value={segment.boughtArticleId ?? ''} onChange={(e) => setSegment({ ...segment, boughtArticleId: e.target.value || undefined })}>
              <option value="">—</option>
              {(catalog.data?.articles ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(segment.birthdayThisMonth)} onChange={(e) => setSegment({ ...segment, birthdayThisMonth: e.target.checked || undefined })} /> Anniversaire ce mois-ci</label>
          <p className={cx('text-sm font-semibold', count ? 'text-emerald-700' : 'text-gray-500')}>{count === null ? '…' : `${count} client(s) concerné(s)`}</p>
        </Modal>
      )}
    </Card>
  );
};

export const LoyaltyPage: React.FC = () => {
  const data = useLoader(() => posApi.loyalty(), []);
  const catalog = useLoader(() => posApi.catalog(), []);
  const [settings, setSettings] = useState<LoyaltySettings | null>(null);
  const [editing, setEditing] = useState<Reward | 'new' | null>(null);
  const { busy, error, run } = useAction();
  useEffect(() => {
    if (data.data && !settings) setSettings(data.data.settings);
  }, [data.data, settings]);
  if (data.loading || !settings) return <Loading />;
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <div className="space-y-4">
      <PageHeader icon={Gift} title="Fidélité" subtitle="Les points sont acquis une seule fois, après encaissement complet, sur le montant payé." />
      <ErrorNote message={error ?? data.error} />
      <Card title="Barème" actions={<Btn size="sm" variant="primary" busy={busy} onClick={() => run(async () => { const r = await posApi.saveLoyalty(settings); setSettings(r.settings); })}>Enregistrer</Btn>}>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} /> Programme actif</label>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Points par dinar payé"><input className={inputCls} inputMode="decimal" value={settings.pointsPerDt} onChange={(e) => setSettings({ ...settings, pointsPerDt: Number(e.target.value.replace(',', '.')) || 0 })} /></Field>
          <Field label="Validité des points (jours, 0 = sans expiration)"><input className={inputCls} inputMode="numeric" value={settings.validityDays} onChange={(e) => setSettings({ ...settings, validityDays: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></Field>
        </div>
        <p className="text-xs font-semibold text-gray-600">Catégories exclues</p>
        <div className="flex flex-wrap gap-2">
          {(catalog.data?.categories ?? []).map((c) => (
            <button key={c} onClick={() => setSettings({ ...settings, excludedCategories: toggle(settings.excludedCategories, c) })} className={cx('px-3 min-h-[36px] rounded-full border text-xs', settings.excludedCategories.includes(c) ? 'border-red-400 bg-red-50 font-semibold' : 'border-gray-200')}>
              {c}
            </button>
          ))}
        </div>
      </Card>
      <Card title="Récompenses" actions={<Btn size="sm" onClick={() => setEditing('new')}><Plus size={14} /> Récompense</Btn>}>
        {data.data!.rewards.length === 0 ? <Empty>Aucune récompense.</Empty> : (
          <ul className="divide-y divide-gray-100">
            {data.data!.rewards.map((r) => (
              <li key={r.id} className="py-2 flex items-center gap-2 text-sm">
                <span className="flex-1"><strong>{r.name}</strong><span className="block text-xs text-gray-500">{r.pointsCost} points · {r.kind === 'fixed' ? `−${formatDt(r.value)}` : r.kind === 'percent' ? `−${r.value / 100} %` : 'produit offert'}</span></span>
                <Badge tone={r.active ? 'green' : 'gray'}>{r.active ? 'Proposée' : 'Retirée'}</Badge>
                <Btn size="sm" onClick={() => setEditing(r)}>Modifier</Btn>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <TargetedOffers />
      {editing && <RewardForm initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void data.reload(); }} />}
    </div>
  );
};
