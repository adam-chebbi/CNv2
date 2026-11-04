import React, { useState } from 'react';
import { BadgePercent, Plus } from 'lucide-react';
import { formatDt, parseDtInput } from '../data/money';
import { posApi, type Discount, type DiscountInput } from './api';
import { Badge, Btn, Card, cx, Empty, ErrorNote, Field, inputCls, Loading, Modal, PageHeader, useAction, useLoader } from './ui';

// Réductions et offres (cahier des charges §8.5): percent or fixed amount, products or categories,
// dates, days, hours, minimum ticket, identified customers only, stacking.

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const describe = (d: Discount): string => {
  const amount = d.kind === 'percent' ? `−${d.value / 100} %` : `−${formatDt(d.value)}${d.scope === 'items' ? ' / article' : ''}`;
  const target = d.scope === 'ticket' ? 'sur le ticket' : d.categories.length || d.articleIds.length ? `sur ${[...d.categories, ...(d.articleIds.length ? [`${d.articleIds.length} produit(s)`] : [])].join(', ')}` : 'sur toute la carte';
  const when = [d.weekdays.length ? d.weekdays.map((w) => DAYS[w - 1]).join(' ') : '', d.startTime ? `${d.startTime}–${d.endTime ?? ''}` : '', d.endsOn ? `jusqu'au ${d.endsOn}` : ''].filter(Boolean).join(' · ');
  return [amount, target, when].filter(Boolean).join(' · ');
};

const blank: DiscountInput = { name: '', kind: 'percent', value: 1000, scope: 'items', articleIds: [], categories: [], weekdays: [], minTicketMil: 0, identifiedCustomersOnly: false, stackable: false, active: true };

const OfferForm: React.FC<{ initial?: Discount; onClose: () => void; onSaved: () => void }> = ({ initial, onClose, onSaved }) => {
  const catalog = useLoader(() => posApi.catalog(), []);
  const [d, setD] = useState<DiscountInput>(initial ? { ...blank, ...initial } : blank);
  const [valueText, setValueText] = useState(initial ? (initial.kind === 'percent' ? String(initial.value / 100) : formatDt(initial.value, false)) : '10');
  const { busy, error, run } = useAction();
  const value = d.kind === 'percent' ? Math.round(Number(valueText.replace(',', '.')) * 100) : parseDtInput(valueText) ?? 0;
  const save = () =>
    run(async () => {
      const body = { ...d, value, startsOn: d.startsOn || undefined, endsOn: d.endsOn || undefined, startTime: d.startTime || undefined, endTime: d.endTime || undefined };
      if (initial) await posApi.updateDiscount(initial.id, body);
      else await posApi.createDiscount(body);
      onSaved();
    });
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <Modal title={initial ? 'Modifier l’offre' : 'Nouvelle offre'} wide onClose={onClose} footer={<><Btn onClick={onClose}>Annuler</Btn><Btn variant="primary" busy={busy} disabled={!d.name.trim() || !value || value <= 0} onClick={save}>Enregistrer</Btn></>}>
      <ErrorNote message={error} />
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Nom affiché sur le ticket"><input className={inputCls} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Happy hour" /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Type">
            <select className={inputCls} value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as Discount['kind'] })}>
              <option value="percent">Pourcentage</option>
              <option value="fixed">Montant fixe</option>
            </select>
          </Field>
          <Field label={d.kind === 'percent' ? 'Valeur (%)' : 'Valeur (DT)'}><input className={inputCls} inputMode="decimal" value={valueText} onChange={(e) => setValueText(e.target.value)} /></Field>
        </div>
        <Field label="S'applique">
          <select className={inputCls} value={d.scope} onChange={(e) => setD({ ...d, scope: e.target.value as Discount['scope'] })}>
            <option value="items">Sur des produits</option>
            <option value="ticket">Sur le ticket entier</option>
          </select>
        </Field>
        {d.scope === 'ticket' && (
          <Field label="Montant minimum du ticket (DT)"><input className={inputCls} inputMode="decimal" value={d.minTicketMil ? formatDt(d.minTicketMil, false) : ''} onChange={(e) => setD({ ...d, minTicketMil: parseDtInput(e.target.value) ?? 0 })} /></Field>
        )}
        <Field label="Du (facultatif)"><input type="date" className={inputCls} value={d.startsOn ?? ''} onChange={(e) => setD({ ...d, startsOn: e.target.value })} /></Field>
        <Field label="Au (facultatif)"><input type="date" className={inputCls} value={d.endsOn ?? ''} onChange={(e) => setD({ ...d, endsOn: e.target.value })} /></Field>
        <Field label="De (heure)"><input type="time" className={inputCls} value={d.startTime ?? ''} onChange={(e) => setD({ ...d, startTime: e.target.value })} /></Field>
        <Field label="À (heure)"><input type="time" className={inputCls} value={d.endTime ?? ''} onChange={(e) => setD({ ...d, endTime: e.target.value })} /></Field>
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-600 mb-1">Jours (aucun = tous les jours)</p>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((label, i) => (
            <button key={label} onClick={() => setD({ ...d, weekdays: toggle(d.weekdays, i + 1) })} className={cx('w-14 min-h-[40px] rounded-xl border text-sm', d.weekdays.includes(i + 1) ? 'border-emerald-500 bg-emerald-50 font-semibold' : 'border-gray-200')}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {d.scope === 'items' && catalog.data && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-600">Catégories et produits concernés (aucun = toute la carte)</p>
          <div className="flex flex-wrap gap-2">
            {catalog.data.categories.map((c) => (
              <button key={c} onClick={() => setD({ ...d, categories: toggle(d.categories, c) })} className={cx('px-3 min-h-[36px] rounded-full border text-xs', d.categories.includes(c) ? 'border-emerald-500 bg-emerald-50 font-semibold' : 'border-gray-200')}>
                {c}
              </button>
            ))}
          </div>
          <div className="max-h-40 overflow-y-auto grid sm:grid-cols-2 gap-1">
            {catalog.data.articles.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={d.articleIds.includes(a.id)} onChange={() => setD({ ...d, articleIds: toggle(d.articleIds, a.id) })} /> {a.name}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-1 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={d.stackable} onChange={(e) => setD({ ...d, stackable: e.target.checked })} /> Cumulable avec d'autres offres cumulables</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={d.identifiedCustomersOnly} onChange={(e) => setD({ ...d, identifiedCustomersOnly: e.target.checked })} /> Réservée aux clients identifiés (compte fidélité)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} /> Active</label>
      </div>
      <p className="text-xs text-gray-500">Une offre non cumulable ne s'applique seule que si elle est plus avantageuse que les offres cumulables réunies. Une réduction ne rend jamais un montant négatif.</p>
    </Modal>
  );
};

export const OffersPage: React.FC = () => {
  const list = useLoader(() => posApi.discounts(), []);
  const [editing, setEditing] = useState<Discount | 'new' | null>(null);
  return (
    <div className="space-y-4">
      <PageHeader icon={BadgePercent} title="Réductions & offres" actions={<Btn variant="primary" onClick={() => setEditing('new')}><Plus size={14} /> Offre</Btn>} />
      <ErrorNote message={list.error} />
      <Card>
        {list.loading ? <Loading /> : (list.data ?? []).length === 0 ? <Empty>Aucune offre.</Empty> : (
          <ul className="divide-y divide-gray-100">
            {list.data!.map((d) => (
              <li key={d.id} className="py-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="flex-1 min-w-[200px]"><strong>{d.name}</strong><span className="block text-xs text-gray-500">{describe(d)}</span></span>
                {d.stackable && <Badge tone="blue">Cumulable</Badge>}
                {d.identifiedCustomersOnly && <Badge tone="violet">Clients identifiés</Badge>}
                <Badge tone={d.active ? 'green' : 'gray'}>{d.active ? 'Active' : 'Inactive'}</Badge>
                <Btn size="sm" onClick={() => setEditing(d)}>Modifier</Btn>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && <OfferForm initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void list.reload(); }} />}
    </div>
  );
};
