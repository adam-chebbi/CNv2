import React, { useState } from 'react';
import { CalendarDays, Gift, Heart, LogOut, Receipt, ShoppingBag, UserRound } from 'lucide-react';
import { formatDt } from '../data/money';
import { Badge, Btn, cx, dateTime, Empty, ErrorNote, Field, inputCls, Loading, Money, useAction, useLoader } from '../pos/ui';
import { clientApi, lastTable, savePendingCart, type Me } from './clientApi';

// Compte et espace personnel client (cahier des charges §11, §12): optional account, history of
// the customer's own orders only, favourites and reorder, loyalty, offers, reservations, profile.

const RES_LABELS: Record<string, string> = { pending: 'En attente de confirmation', confirmed: 'Confirmée', rejected: 'Refusée', cancelled: 'Annulée', arrived: 'Vous étiez là', no_show: 'Non présenté', completed: 'Terminée' };
const LEDGER: Record<string, string> = { earn: 'Points gagnés', redeem: 'Récompense utilisée', expire: 'Points expirés', adjust: 'Ajustement', reverse: 'Points repris', restore: 'Points restitués' };

const AuthForms: React.FC<{ onSignedIn: (me: Me) => void }> = ({ onSignedIn }) => {
  const resetToken = new URLSearchParams(window.location.search).get('reinitialiser');
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>(resetToken ? 'reset' : 'login');
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', password: '', phone: '', birthday: '', marketingConsent: false });
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useAction();
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  return (
    <div className="rounded-2xl bg-white border border-gray-200 p-5 space-y-3 max-w-md mx-auto">
      {mode !== 'reset' && (
        <div className="grid grid-cols-2 gap-2">
          {(['login', 'register'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cx('min-h-[44px] rounded-xl border text-sm font-semibold', mode === m ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200')}>
              {m === 'login' ? 'Se connecter' : 'Créer un compte'}
            </button>
          ))}
        </div>
      )}
      <ErrorNote message={error} />
      {mode === 'register' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Prénom"><input className={inputCls} value={f.firstName} onChange={(e) => set({ firstName: e.target.value })} autoComplete="given-name" /></Field>
          <Field label="Nom"><input className={inputCls} value={f.lastName} onChange={(e) => set({ lastName: e.target.value })} autoComplete="family-name" /></Field>
        </div>
      )}
      {mode !== 'reset' && <Field label="Email"><input className={inputCls} type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} autoComplete="email" /></Field>}
      {mode !== 'forgot' && (
        <Field label={mode === 'reset' ? 'Nouveau mot de passe' : 'Mot de passe'} hint={mode !== 'login' ? '8 caractères minimum.' : undefined}>
          <input className={inputCls} type="password" value={f.password} onChange={(e) => set({ password: e.target.value })} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </Field>
      )}
      {mode === 'register' && (
        <>
          <Field label="Téléphone (facultatif)"><input className={inputCls} inputMode="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
          <Field label="Anniversaire (facultatif)" hint="Pour une éventuelle attention le mois de votre anniversaire."><input className={inputCls} type="date" value={f.birthday} onChange={(e) => set({ birthday: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.marketingConsent} onChange={(e) => set({ marketingConsent: e.target.checked })} /> J'accepte de recevoir des nouvelles de Café Noir</label>
        </>
      )}
      {mode === 'forgot' && sent && <p className="text-sm text-emerald-700">Si un compte existe avec cet email, un lien de réinitialisation vient d'être envoyé (valable une heure).</p>}
      <Btn
        variant="primary"
        size="lg"
        className="w-full"
        busy={busy}
        onClick={() =>
          run(async () => {
            if (mode === 'login') onSignedIn(await clientApi.login(f.email, f.password));
            else if (mode === 'register') onSignedIn(await clientApi.register({ ...f, phone: f.phone || null, birthday: f.birthday || null }));
            else if (mode === 'forgot') { await clientApi.forgot(f.email); setSent(true); }
            else {
              await clientApi.reset(resetToken!, f.password);
              window.history.replaceState(null, '', '/compte');
              const me = await clientApi.me();
              if (me) onSignedIn(me);
            }
          })
        }
      >
        {mode === 'login' ? 'Se connecter' : mode === 'register' ? 'Créer mon compte' : mode === 'forgot' ? 'Envoyer le lien' : 'Enregistrer le mot de passe'}
      </Btn>
      {mode === 'login' && <button className="text-sm text-emerald-700 underline" onClick={() => setMode('forgot')}>Mot de passe oublié ?</button>}
      <p className="text-xs text-gray-500">Le compte est facultatif : vous pouvez commander depuis votre table sans compte.</p>
    </div>
  );
};

type Section = 'loyalty' | 'orders' | 'favorites' | 'reservations' | 'profile';

const Profile: React.FC<{ me: Me; onChange: (me: Me | null) => void }> = ({ me, onChange }) => {
  const [p, setP] = useState({ firstName: me.firstName, lastName: me.lastName, phone: me.phone ?? '', preferences: me.preferences ?? '', birthday: me.birthday ?? '', marketingConsent: me.marketingConsent });
  const [pw, setPw] = useState({ current: '', next: '' });
  const [closePw, setClosePw] = useState('');
  const [saved, setSaved] = useState('');
  const { busy, error, run } = useAction();
  return (
    <div className="space-y-4">
      <ErrorNote message={error} />
      {saved && <p className="text-sm text-emerald-700">{saved}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Prénom"><input className={inputCls} value={p.firstName} onChange={(e) => setP({ ...p, firstName: e.target.value })} /></Field>
        <Field label="Nom"><input className={inputCls} value={p.lastName} onChange={(e) => setP({ ...p, lastName: e.target.value })} /></Field>
        <Field label="Téléphone"><input className={inputCls} value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} /></Field>
        <Field label="Anniversaire"><input type="date" className={inputCls} value={p.birthday} onChange={(e) => setP({ ...p, birthday: e.target.value })} /></Field>
      </div>
      <Field label="Préférences" hint="Elles ne remplacent pas une confirmation auprès de l'équipe."><input className={inputCls} value={p.preferences} onChange={(e) => setP({ ...p, preferences: e.target.value })} placeholder="ex. lait d'avoine, sans sucre" /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.marketingConsent} onChange={(e) => setP({ ...p, marketingConsent: e.target.checked })} /> Recevoir des nouvelles de Café Noir</label>
      <Btn variant="primary" busy={busy} onClick={() => run(async () => { const updated = await clientApi.updateMe({ ...p, phone: p.phone || null, preferences: p.preferences || null, birthday: p.birthday || null }); onChange({ ...me, ...updated }); setSaved('Profil enregistré.'); })}>Enregistrer</Btn>

      <div className="border-t border-gray-100 pt-3 space-y-2">
        <p className="font-semibold text-sm">Changer de mot de passe</p>
        <input className={inputCls} type="password" placeholder="Mot de passe actuel" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
        <input className={inputCls} type="password" placeholder="Nouveau mot de passe (8 caractères min.)" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
        <Btn busy={busy} disabled={!pw.current || pw.next.length < 8} onClick={() => run(async () => { await clientApi.changePassword(pw.current, pw.next); setPw({ current: '', next: '' }); setSaved('Mot de passe modifié. Vos autres appareils ont été déconnectés.'); })}>Modifier</Btn>
      </div>

      <div className="border-t border-gray-100 pt-3 space-y-2">
        <p className="font-semibold text-sm text-red-700">Fermer mon compte</p>
        <p className="text-xs text-gray-600">Vos informations personnelles sont effacées. Les ventes restent dans la comptabilité du café sans vous identifier. Vos points sont perdus.</p>
        <input className={inputCls} type="password" placeholder="Mot de passe pour confirmer" value={closePw} onChange={(e) => setClosePw(e.target.value)} />
        <Btn variant="danger" busy={busy} disabled={!closePw} onClick={() => run(async () => { if (window.confirm('Fermer définitivement votre compte ?')) { await clientApi.close(closePw); onChange(null); } })}>Fermer mon compte</Btn>
      </div>
    </div>
  );
};

export const AccountPage: React.FC<{ me: Me | null; onChange: (me: Me | null) => void }> = ({ me, onChange }) => {
  const [section, setSection] = useState<Section>('loyalty');
  if (!me) return <AuthForms onSignedIn={onChange} />;
  const tableToken = lastTable();
  const goOrder = (lines: Parameters<typeof savePendingCart>[0]) => {
    savePendingCart(lines);
    window.location.href = tableToken ? `/t/${tableToken}` : '/compte';
  };
  const SECTIONS: [Section, string, React.ComponentType<{ size?: number }>][] = [
    ['loyalty', 'Fidélité', Gift],
    ['orders', 'Commandes', ShoppingBag],
    ['favorites', 'Favoris', Heart],
    ['reservations', 'Réservations', CalendarDays],
    ['profile', 'Profil', UserRound],
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-bold">Bonjour {me.firstName}</p>
          <p className="text-sm text-gray-600">{me.loyalty.available} point(s) disponibles</p>
        </div>
        <Btn size="sm" variant="ghost" onClick={() => void clientApi.logout().then(() => onChange(null))}><LogOut size={14} /> Déconnexion</Btn>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {SECTIONS.map(([id, label, Icon]) => (
          <button key={id} onClick={() => setSection(id)} className={cx('shrink-0 px-4 min-h-[40px] rounded-full text-sm font-semibold border flex items-center gap-1.5', section === id ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 bg-white')}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>
      <div className="rounded-2xl bg-white border border-gray-200 p-4">
        {section === 'loyalty' && <LoyaltySection />}
        {section === 'orders' && <OrdersSection onReorder={goOrder} hasTable={Boolean(tableToken)} />}
        {section === 'favorites' && <FavoritesSection onOrder={goOrder} hasTable={Boolean(tableToken)} />}
        {section === 'reservations' && <ReservationsSection />}
        {section === 'profile' && <Profile me={me} onChange={onChange} />}
      </div>
    </div>
  );
};

const LoyaltySection: React.FC = () => {
  const data = useLoader(() => clientApi.loyalty(), []);
  const offers = useLoader(() => clientApi.offers(), []);
  if (data.loading) return <Loading />;
  if (!data.data) return <ErrorNote message={data.error} />;
  const d = data.data;
  const next = d.rewards.filter((r) => r.pointsCost > d.available).sort((a, b) => a.pointsCost - b.pointsCost)[0];
  return (
    <div className="space-y-3">
      <p className="text-3xl font-bold">{d.available} <span className="text-base font-normal text-gray-600">points</span></p>
      <p className="text-xs text-gray-500">{d.pointsPerDt} point(s) par dinar payé, crédités une fois l'addition entièrement réglée.{d.validityDays ? ` Valables ${d.validityDays} jours.` : ''}</p>
      {next && (
        <div>
          <p className="text-sm">Prochaine récompense : <strong>{next.name}</strong> ({next.pointsCost} pts)</p>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (d.available / next.pointsCost) * 100)}%` }} /></div>
        </div>
      )}
      <p className="font-semibold text-sm pt-2">Récompenses</p>
      {d.rewards.length === 0 ? <Empty>Aucune récompense pour le moment.</Empty> : d.rewards.map((r) => (
        <p key={r.id} className="text-sm flex justify-between"><span>{r.name}</span><Badge tone={d.available >= r.pointsCost ? 'green' : 'gray'}>{r.pointsCost} pts</Badge></p>
      ))}
      <p className="text-xs text-gray-500">À utiliser en caisse : présentez-vous à l'équipe au moment de régler.</p>
      {(offers.data ?? []).length > 0 && (
        <>
          <p className="font-semibold text-sm pt-2">Vos offres</p>
          {offers.data!.map((o) => <p key={o.id} className="text-sm">{o.name} — {o.kind === 'percent' ? `−${o.value / 100} %` : `−${formatDt(o.value)}`}{o.endsOn && ` jusqu'au ${o.endsOn}`}</p>)}
        </>
      )}
      <p className="font-semibold text-sm pt-2">Historique</p>
      {d.history.length === 0 ? <Empty>Pas encore de points.</Empty> : (
        <ul className="divide-y divide-gray-100 text-sm">
          {d.history.map((h) => <li key={h.id} className="py-1 flex justify-between"><span>{LEDGER[h.type] ?? h.type}{h.ticketNumber && ` · ${h.ticketNumber}`}<span className="block text-xs text-gray-400">{dateTime(h.createdAt)}</span></span><span className={h.points >= 0 ? 'text-emerald-700' : 'text-red-600'}>{h.points > 0 ? '+' : ''}{h.points}</span></li>)}
        </ul>
      )}
    </div>
  );
};

const OrdersSection: React.FC<{ onReorder: (lines: Parameters<typeof savePendingCart>[0]) => void; hasTable: boolean }> = ({ onReorder, hasTable }) => {
  const orders = useLoader(() => clientApi.orders(), []);
  const receipts = useLoader(() => clientApi.receipts(), []);
  const [dropped, setDropped] = useState<{ name: string; reason: string }[]>([]);
  const { busy, error, run } = useAction();
  if (orders.loading) return <Loading />;
  return (
    <div className="space-y-3">
      <ErrorNote message={error ?? orders.error} />
      {dropped.length > 0 && <p className="text-xs p-2 rounded-lg bg-amber-50 text-amber-800">Retirés car indisponibles : {dropped.map((d) => d.name).join(', ')}</p>}
      {!hasTable && <p className="text-xs text-gray-500">Pour recommander, scannez d'abord le QR code de votre table.</p>}
      {(orders.data ?? []).length === 0 ? <Empty>Aucune commande rattachée à votre compte.</Empty> : orders.data!.map((o) => (
        <div key={o.id} className="border-b border-gray-100 pb-2">
          <p className="text-sm font-semibold">{dateTime(o.createdAt)}{o.tableName && ` · Table ${o.tableName}`} · <Money mil={o.totalMil} /></p>
          <p className="text-xs text-gray-600">{o.lines.map((l) => `${l.quantity} × ${l.displayName}`).join(', ')}</p>
          <Btn size="sm" busy={busy} disabled={!hasTable} onClick={() => run(async () => { const r = await clientApi.reorder(o.id); setDropped(r.dropped); if (r.lines.length) onReorder(r.lines); })}>Recommander (prix actuels)</Btn>
        </div>
      ))}
      <p className="font-semibold text-sm flex items-center gap-1.5 pt-2"><Receipt size={14} /> Justificatifs</p>
      {(receipts.data ?? []).length === 0 ? <Empty>Aucun ticket rattaché.</Empty> : receipts.data!.map((r) => (
        <p key={r.id} className="text-sm flex justify-between"><span>{r.ticketNumber} · {dateTime(r.completedAt)}{r.advantages.length > 0 && <span className="text-emerald-700"> · {r.advantages.map((a) => a.label).join(', ')}</span>}</span><Money mil={r.totalMil} /></p>
      ))}
    </div>
  );
};

const FavoritesSection: React.FC<{ onOrder: (lines: Parameters<typeof savePendingCart>[0]) => void; hasTable: boolean }> = ({ onOrder, hasTable }) => {
  const favs = useLoader(() => clientApi.favorites(), []);
  const { busy, run } = useAction();
  if (favs.loading) return <Loading />;
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">Ajoutez des favoris depuis le menu de votre table (icône cœur).</p>
      {(favs.data ?? []).length === 0 ? <Empty>Aucun favori.</Empty> : favs.data!.map((f) => (
        <div key={f.id} className="flex items-center gap-2 text-sm">
          <span className={cx('flex-1', !f.available && 'text-gray-400')}>{f.displayName}{f.unitPriceMil !== null && <> · <Money mil={f.unitPriceMil} /></>}{!f.available && ` — ${f.reason}`}</span>
          {f.available && <Btn size="sm" disabled={!hasTable} onClick={() => onOrder([{ articleId: f.articleId, quantity: 1, variantId: f.variantId, extraIds: f.extraIds }])}>Commander</Btn>}
          <Btn size="sm" variant="ghost" busy={busy} onClick={() => run(async () => { await clientApi.removeFavorite(f.id); await favs.reload(); })}>Retirer</Btn>
        </div>
      ))}
    </div>
  );
};

const ReservationsSection: React.FC = () => {
  const list = useLoader(() => clientApi.reservations(), []);
  const { busy, error, run } = useAction();
  if (list.loading) return <Loading />;
  return (
    <div className="space-y-2">
      <ErrorNote message={error ?? list.error} />
      <a href="/reserver" className="inline-block text-sm font-semibold text-emerald-700 underline">Nouvelle réservation</a>
      {(list.data ?? []).length === 0 ? <Empty>Aucune réservation.</Empty> : list.data!.map((r) => (
        <div key={r.id} className="border-b border-gray-100 pb-2 text-sm space-y-1">
          <p><strong>{r.date} à {r.time}</strong> · {r.people} pers. · <Badge tone={r.status === 'confirmed' ? 'green' : r.status === 'pending' ? 'amber' : 'gray'}>{RES_LABELS[r.status] ?? r.status}</Badge></p>
          {r.changeRequest && <p className="text-xs text-gray-600">Modification demandée : « {r.changeRequest} »</p>}
          {['pending', 'confirmed'].includes(r.status) && (
            <div className="flex gap-2">
              <Btn size="sm" busy={busy} onClick={() => run(async () => { const msg = window.prompt('Quelle modification souhaitez-vous ? (date, heure, nombre de personnes…)'); if (msg) { await clientApi.reservationRequest(r.id, 'change', msg); await list.reload(); } })}>Demander une modification</Btn>
              <Btn size="sm" variant="ghost" busy={busy} onClick={() => run(async () => { if (window.confirm('Annuler cette réservation ?')) { await clientApi.reservationRequest(r.id, 'cancel'); await list.reload(); } })}>Annuler</Btn>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
