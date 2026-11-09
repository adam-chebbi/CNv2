import React, { useState } from 'react';
import { AlertTriangle, Brain, PackageSearch, Sparkles, TrendingUp, Users } from 'lucide-react';
import { apiGet, apiPut } from '../api/client';
import type { MenuClass } from '../data/insights';
import { Badge, Btn, Card, cx, Empty, ErrorNote, inputCls, Loading, Money, PageHeader, useAction, useLoader } from './ui';

// Pilotage (amélioration 09): what to expect, what to order, what to change on the menu, what needs
// attention now. Simple, explainable models; the error of the forecast is always shown.

interface Forecast {
  historyFrom: string | null;
  tomorrow: string;
  mape: number | null;
  days: { date: string; items: number; revenueMil: number }[];
  top: { articleId: string; name: string; tomorrow: number; week: number }[];
  staffing: { hour: string; orders: number; staff: number }[];
}
interface Reorder {
  horizon: number;
  rows: { productId: string; name: string; unit: string; stock: number; minThreshold: number; need: number; onOrder: number; packSize: number | null; leadDays: number; suggested: number; daysLeft: number | null; costDt: number }[];
}
interface Menu {
  days: number;
  classes: Record<MenuClass, { label: string; advice: string }>;
  items: { articleId: string; name: string; category: string; quantity: number; unitPriceHtMil: number; unitCostMil: number; costKnown: boolean; unitMarginMil: number; foodCostRate: number | null; class: MenuClass }[];
}
type Alert = { level: 'high' | 'medium'; kind: string; title: string; detail: string };

const api = {
  forecast: () => apiGet<Forecast>('/pos/insights/forecast'),
  reorder: (horizon: number) => apiGet<Reorder>(`/pos/insights/reorder?horizon=${horizon}`),
  setReorder: (id: string, packSize: number | null, leadDays: number | null) => apiPut(`/pos/insights/reorder/${id}`, { packSize, leadDays }),
  menu: (days: number) => apiGet<Menu>(`/pos/insights/menu?days=${days}`),
  alerts: () => apiGet<Alert[]>('/pos/insights/alerts'),
};

const WEEKDAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const dayLabel = (date: string) => `${WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]} ${date.slice(8, 10)}/${date.slice(5, 7)}`;
const qty = (v: number) => (Math.round(v * 100) / 100).toLocaleString('fr-FR');
const CLASS_TONE: Record<MenuClass, 'green' | 'blue' | 'violet' | 'red'> = { star: 'green', plowhorse: 'blue', puzzle: 'violet', dog: 'red' };

export const InsightsPage: React.FC = () => {
  const [tab, setTab] = useState<'forecast' | 'reorder' | 'menu' | 'alerts'>('forecast');
  const tabs = [
    ['forecast', 'Prévisions', TrendingUp],
    ['reorder', 'Réassort', PackageSearch],
    ['menu', 'Ingénierie de menu', Sparkles],
    ['alerts', 'Alertes', AlertTriangle],
  ] as const;
  return (
    <div className="space-y-4">
      <PageHeader icon={Brain} title="Pilotage" subtitle="Prévisions, réassort, carte et alertes — calculés à partir des ventes de la caisse" />
      <div className="flex flex-wrap gap-2">
        {tabs.map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)} className={cx('px-4 min-h-[40px] rounded-xl text-sm font-semibold border flex items-center gap-1.5', tab === key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200')}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
      {tab === 'forecast' && <ForecastTab />}
      {tab === 'reorder' && <ReorderTab />}
      {tab === 'menu' && <MenuTab />}
      {tab === 'alerts' && <AlertsTab />}
    </div>
  );
};

const ForecastTab: React.FC = () => {
  const f = useLoader(api.forecast, []);
  if (f.loading) return <Loading />;
  if (!f.data) return <ErrorNote message={f.error} />;
  const d = f.data;
  if (!d.historyFrom) return <Card><Empty>Pas encore assez de ventes encaissées pour prévoir : revenez après une semaine de service.</Empty></Card>;
  const max = Math.max(1, ...d.days.map((x) => x.items));
  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <Card title="14 prochains jours">
        <p className="text-xs text-gray-500">
          Moyenne pondérée des mêmes jours de semaine (8 dernières semaines, depuis le {d.historyFrom}).{' '}
          {d.mape !== null ? <Badge tone={d.mape < 0.2 ? 'green' : d.mape < 0.35 ? 'amber' : 'red'}>Erreur moyenne {Math.round(d.mape * 100)} % sur 14 jours</Badge> : <Badge>Erreur non mesurable encore</Badge>}
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              <th className="py-1">Jour</th>
              <th>Articles</th>
              <th className="text-right">CA HT estimé</th>
            </tr>
          </thead>
          <tbody>
            {d.days.map((x) => (
              <tr key={x.date} className="border-t border-gray-100">
                <td className="py-1.5 whitespace-nowrap">{dayLabel(x.date)}</td>
                <td className="w-1/2">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 rounded bg-emerald-500" style={{ width: `${(x.items / max) * 100}%` }} aria-hidden />
                    <span className="text-xs tabular-nums">{x.items}</span>
                  </div>
                </td>
                <td className="text-right tabular-nums">
                  <Money mil={x.revenueMil} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="space-y-4">
        <Card title={`À préparer pour ${dayLabel(d.tomorrow)}`}>
          {d.top.length === 0 ? (
            <Empty>Aucune prévision.</Empty>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th className="py-1">Produit</th>
                  <th className="text-right">Demain</th>
                  <th className="text-right">7 jours</th>
                </tr>
              </thead>
              <tbody>
                {d.top.map((t) => (
                  <tr key={t.articleId} className="border-t border-gray-100">
                    <td className="py-1.5">{t.name}</td>
                    <td className="text-right tabular-nums font-semibold">{qty(t.tomorrow)}</td>
                    <td className="text-right tabular-nums">{t.week}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title={<span className="flex items-center gap-1.5"><Users size={15} /> Équipe conseillée demain</span>}>
          {d.staffing.length === 0 ? (
            <Empty>Pas assez d’historique pour ce jour de semaine.</Empty>
          ) : (
            <div className="flex flex-wrap gap-2">
              {d.staffing.map((s) => (
                <span key={s.hour} className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-center">
                  <strong className="block">{s.hour}</strong>
                  {s.orders} cmd · {s.staff} pers.
                </span>
              ))}
            </div>
          )}
          <p className="text-[11px] text-gray-500">Base : 12 commandes par personne et par heure.</p>
        </Card>
      </div>
    </div>
  );
};

const ReorderTab: React.FC = () => {
  const [horizon, setHorizon] = useState(7);
  const r = useLoader(() => api.reorder(horizon), [horizon]);
  const [edit, setEdit] = useState<{ id: string; pack: string; lead: string } | null>(null);
  const { busy, error, run } = useAction();
  return (
    <Card title="Suggestions de commande fournisseur">
      <ErrorNote message={error ?? r.error} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        Couvrir
        {[3, 7, 14].map((h) => (
          <Btn key={h} size="sm" variant={horizon === h ? 'primary' : 'secondary'} onClick={() => setHorizon(h)}>
            {h} jours
          </Btn>
        ))}
        <span className="text-xs text-gray-500">Besoin = prévisions × recettes ; commande = besoin + seuil − stock − commandes en cours, arrondie au conditionnement.</span>
      </div>
      {r.loading ? (
        <Loading />
      ) : (r.data?.rows ?? []).length === 0 ? (
        <Empty>Aucun ingrédient à commander (ou recettes non renseignées).</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="py-1">Ingrédient</th>
                <th className="text-right">Stock</th>
                <th className="text-right">Besoin</th>
                <th className="text-right">En commande</th>
                <th className="text-right">Jours restants</th>
                <th>Conditionnement · délai</th>
                <th className="text-right">À commander</th>
              </tr>
            </thead>
            <tbody>
              {r.data!.rows.map((x) => (
                <tr key={x.productId} className={cx('border-t border-gray-100', x.stock < x.minThreshold && 'bg-red-50/50')}>
                  <td className="py-1.5">{x.name}</td>
                  <td className="text-right tabular-nums">{qty(x.stock)} {x.unit}</td>
                  <td className="text-right tabular-nums">{qty(x.need)}</td>
                  <td className="text-right tabular-nums">{x.onOrder ? qty(x.onOrder) : '—'}</td>
                  <td className={cx('text-right tabular-nums', x.daysLeft !== null && x.daysLeft <= 2 && 'text-red-700 font-semibold')}>{x.daysLeft ?? '—'}</td>
                  <td>
                    {edit?.id === x.productId ? (
                      <span className="flex gap-1">
                        <input className={cx(inputCls, 'w-20')} inputMode="decimal" value={edit.pack} placeholder="lot" onChange={(e) => setEdit({ ...edit, pack: e.target.value })} />
                        <input className={cx(inputCls, 'w-16')} inputMode="numeric" value={edit.lead} placeholder="j" onChange={(e) => setEdit({ ...edit, lead: e.target.value.replace(/\D/g, '') })} />
                        <Btn size="sm" busy={busy} onClick={() => run(async () => { await api.setReorder(x.productId, Number(edit.pack.replace(',', '.')) || null, Number(edit.lead) || null); setEdit(null); await r.reload(); })}>OK</Btn>
                      </span>
                    ) : (
                      <button className="text-xs text-emerald-700 underline" onClick={() => setEdit({ id: x.productId, pack: x.packSize ? String(x.packSize) : '', lead: String(x.leadDays) })}>
                        {x.packSize ? `${qty(x.packSize)} ${x.unit}` : 'à l’unité'} · {x.leadDays} j
                      </button>
                    )}
                  </td>
                  <td className="text-right tabular-nums font-bold">{x.suggested > 0 ? `${qty(x.suggested)} ${x.unit}` : '—'}{x.suggested > 0 && <span className="block text-[11px] font-normal text-gray-500">≈ {x.costDt.toFixed(3)} DT</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

const MenuTab: React.FC = () => {
  const [days, setDays] = useState(30);
  const m = useLoader(() => api.menu(days), [days]);
  if (m.loading) return <Loading />;
  if (!m.data) return <ErrorNote message={m.error} />;
  const { classes, items } = m.data;
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[30, 90].map((d) => (
          <Btn key={d} size="sm" variant={days === d ? 'primary' : 'secondary'} onClick={() => setDays(d)}>
            {d} jours
          </Btn>
        ))}
      </div>
      {items.length === 0 ? (
        <Card><Empty>Aucune vente encaissée sur la période.</Empty></Card>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {(Object.keys(classes) as MenuClass[]).map((c) => {
              const list = items.filter((i) => i.class === c);
              return (
                <Card key={c} title={<span className="flex items-center gap-2"><Badge tone={CLASS_TONE[c]}>{classes[c].label}</Badge> {list.length}</span>}>
                  <p className="text-xs text-gray-600">{classes[c].advice}</p>
                  <p className="text-sm">{list.slice(0, 6).map((i) => i.name).join(' · ') || '—'}</p>
                </Card>
              );
            })}
          </div>
          <Card title="Détail par produit">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-left text-xs text-gray-500">
                    <th className="py-1">Produit</th>
                    <th className="text-right">Vendus</th>
                    <th className="text-right">Prix HT</th>
                    <th className="text-right">Coût matière</th>
                    <th className="text-right">Marge / unité</th>
                    <th className="text-right">Ratio</th>
                    <th>Classe</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.articleId} className="border-t border-gray-100">
                      <td className="py-1.5">{i.name}<span className="block text-[11px] text-gray-500">{i.category}</span></td>
                      <td className="text-right tabular-nums">{i.quantity}</td>
                      <td className="text-right tabular-nums"><Money mil={i.unitPriceHtMil} /></td>
                      <td className="text-right tabular-nums">{i.costKnown ? <Money mil={i.unitCostMil} /> : <span className="text-amber-700 text-xs">recette incomplète</span>}</td>
                      <td className="text-right tabular-nums font-semibold"><Money mil={i.unitMarginMil} /></td>
                      <td className={cx('text-right tabular-nums', (i.foodCostRate ?? 0) > 0.35 && 'text-red-700')}>{i.foodCostRate !== null && i.costKnown ? `${Math.round(i.foodCostRate * 100)} %` : '—'}</td>
                      <td><Badge tone={CLASS_TONE[i.class]}>{classes[i.class].label}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

const AlertsTab: React.FC = () => {
  const a = useLoader(api.alerts, []);
  if (a.loading) return <Loading />;
  return (
    <Card title="À surveiller maintenant">
      <ErrorNote message={a.error} />
      {(a.data ?? []).length === 0 ? (
        <Empty>Rien d’anormal : stock suffisant pour 3 jours, caisses justes, pas d’annulations répétées.</Empty>
      ) : (
        <ul className="space-y-2">
          {a.data!.map((x, i) => (
            <li key={i} className={cx('rounded-xl border p-3 text-sm flex gap-2', x.level === 'high' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50')}>
              <AlertTriangle size={16} className={x.level === 'high' ? 'text-red-600' : 'text-amber-600'} />
              <span>
                <strong>{x.title}</strong>
                <span className="block text-gray-700">{x.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};
