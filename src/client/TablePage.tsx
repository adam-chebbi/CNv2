import React, { useEffect, useMemo, useState } from 'react';
import { Bell, ChevronRight, Heart, Info, KeyRound, Receipt, ShoppingBag, Star, UserRound } from 'lucide-react';
import { computeCart, type CartLineInput, type PricedArticle } from '../data/pricing';
import { newIdempotencyKey } from '../hooks/usePosEvents';
import { addLine, CartLines, OptionPicker, toPricingCatalog } from '../pos/CartComposer';
import { Badge, Btn, cx, ErrorNote, inputCls, Loading, Modal, Money, useAction, useLoader } from '../pos/ui';
import { clientApi, rememberTable, takePendingCart, type ClientMenu, type ClientOrder, type Me } from './clientApi';

// Page ouverte par le QR code d'une table (cahier des charges §4, §10). Anyone can read the menu;
// ordering, the bill and calling a waiter require the code the staff gives when opening the table.

const STATUS: Record<ClientOrder['status'], { label: string; tone: 'amber' | 'green' | 'red' | 'gray' | 'blue' }> = {
  pending_validation: { label: 'Envoyée — en attente de validation', tone: 'amber' },
  awaiting_customer: { label: 'À confirmer par vous', tone: 'blue' },
  validated: { label: 'Validée', tone: 'green' },
  rejected: { label: 'Refusée', tone: 'red' },
  cancelled: { label: 'Annulée', tone: 'gray' },
};
const PREP: Record<string, string> = { to_prepare: 'Validée', in_progress: 'En préparation', ready: 'Prête', served: 'Servie', none: 'Validée' };

type Tab = 'menu' | 'cart' | 'orders' | 'bill' | 'more';

const ProductSheet: React.FC<{ article: ClientMenu['articles'][number]; menu: ClientMenu; canOrder: boolean; me: Me | null; onAdd: (l: CartLineInput) => void; onClose: () => void }> = ({ article, menu, canOrder, me, onAdd, onClose }) => {
  const pricing = useMemo(() => toPricingCatalog(menu), [menu]);
  const [picking, setPicking] = useState(false);
  const [faved, setFaved] = useState(false);
  const contains = article.allergens.filter((a) => a.state === 'contains');
  const free = article.allergens.filter((a) => a.state === 'free');
  if (picking) {
    return <OptionPicker article={article as PricedArticle} catalog={pricing} allowInstruction onCancel={() => setPicking(false)} onAdd={(l) => { onAdd(l); onClose(); }} />;
  }
  return (
    <Modal title={article.name} onClose={onClose}>
      {article.imageUrl && <img src={article.imageUrl} alt="" className="w-full h-48 object-cover rounded-xl" />}
      {article.description && <p className="text-sm text-gray-700">{article.description}</p>}
      <p className="text-lg font-bold"><Money mil={article.unitPriceMil} /></p>
      <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
        <p className="font-semibold flex items-center gap-1"><Info size={13} /> Allergènes</p>
        {contains.length > 0 && <p>Contient : {contains.map((a) => a.name).join(', ')}</p>}
        {free.length > 0 && <p>Ne contient pas (vérifié) : {free.map((a) => a.name).join(', ')}</p>}
        {article.allergens.length === 0 && <p>Information non disponible — demandez à l'équipe.</p>}
        <p>Informations fournies par Café Noir. En cas d'allergie, demandez confirmation à l'équipe.</p>
      </div>
      <div className="flex gap-2">
        {article.availability === 'available' ? (
          canOrder ? (
            <Btn variant="primary" className="flex-1" onClick={() => (article.variants.length || article.extraIds.length ? setPicking(true) : (onAdd({ articleId: article.id, quantity: 1 }), onClose()))}>
              Ajouter à ma commande
            </Btn>
          ) : (
            <p className="text-sm text-gray-600 flex-1">Saisissez le code de la table pour commander.</p>
          )
        ) : (
          <p className="text-sm text-gray-500 flex-1">Indisponible pour le moment.</p>
        )}
        {me && (
          <Btn aria-label="Ajouter aux favoris" disabled={faved} onClick={() => void clientApi.addFavorite(article.id, article.variants[0]?.id).then(() => setFaved(true))}>
            <Heart size={16} fill={faved ? 'currentColor' : 'none'} />
          </Btn>
        )}
      </div>
    </Modal>
  );
};

export const TablePage: React.FC<{ token: string; me: Me | null }> = ({ token, me }) => {
  const table = useLoader(() => clientApi.table(token), [token]);
  const menu = useLoader(() => clientApi.menu(), []);
  const faq = useLoader(() => clientApi.faq(), []);
  const [visit, setVisit] = useState<Awaited<ReturnType<typeof clientApi.visit>> | null>(null);
  const [tab, setTab] = useState<Tab>('menu');
  const [category, setCategory] = useState('');
  const [sheet, setSheet] = useState<ClientMenu['articles'][number] | null>(null);
  const [lines, setLines] = useState<CartLineInput[]>(() => takePendingCart());
  const [code, setCode] = useState('');
  const [sendKey, setSendKey] = useState(newIdempotencyKey);
  const [notice, setNotice] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [reviewSent, setReviewSent] = useState(false);
  const { busy, error, setError, run } = useAction();

  useEffect(() => rememberTable(token), [token]);
  const joined = Boolean(table.data?.joined);

  // Order tracking: refreshed every 5 s while the page is open.
  useEffect(() => {
    if (!joined) return;
    const load = () => void clientApi.visit(token).then(setVisit).catch(() => undefined);
    load();
    const t = window.setInterval(load, 5000);
    return () => window.clearInterval(t);
  }, [joined, token]);

  const preview = useMemo(() => {
    if (!menu.data || lines.length === 0) return null;
    try {
      return computeCart(lines, toPricingCatalog(menu.data), menu.data.offers, { now: new Date() });
    } catch {
      return null;
    }
  }, [menu.data, lines]);

  if (table.loading || menu.loading) return <Loading />;
  if (table.error || !table.data) return <ErrorNote message={table.error ?? 'Table introuvable. Scannez à nouveau le QR code.'} />;
  const m = menu.data!;
  const categories = m.categories.filter((c) => m.articles.some((a) => a.category === c));
  const shown = m.articles.filter((a) => !category || a.category === category);
  const awaiting = visit?.myOrders.filter((o) => o.status === 'awaiting_customer') ?? [];
  const requested = (type: 'call_waiter' | 'bill') => visit?.activeRequests.some((r) => r.type === type);

  const join = () => run(async () => { await clientApi.join(token, code.trim()); setCode(''); await table.reload(); });
  const send = () =>
    run(async () => {
      await clientApi.order(token, lines, sendKey);
      setLines([]);
      setSendKey(newIdempotencyKey());
      setNotice("Commande envoyée. L'équipe va la valider.");
      setTab('orders');
      setVisit(await clientApi.visit(token));
    });

  return (
    <div className="space-y-4 pb-28">
      <header className="flex items-center justify-between">
        <div>
          <p className="font-serif text-2xl font-bold">Café Noir</p>
          <p className="text-sm text-gray-600">Table {table.data.table.name}</p>
        </div>
        <a href="/compte" className="inline-flex items-center gap-1 text-sm text-emerald-700 font-semibold">
          <UserRound size={16} /> {me ? me.firstName : 'Mon compte'}
        </a>
      </header>
      <ErrorNote message={error ?? menu.error} onClose={() => setError(null)} />
      {notice && <p className="p-3 rounded-xl bg-emerald-50 text-emerald-800 text-sm">{notice}</p>}

      {!joined && (
        <div className="rounded-2xl bg-white border border-gray-200 p-4 space-y-2">
          <p className="text-sm font-semibold flex items-center gap-2"><KeyRound size={16} /> Pour commander depuis la table</p>
          {table.data.visitOpen ? (
            <>
              <p className="text-xs text-gray-600">Saisissez le code à 4 chiffres que notre équipe vous a donné.</p>
              <div className="flex gap-2">
                <input className={cx(inputCls, 'text-center text-xl tracking-[0.4em] font-bold')} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-label="Code de la table" />
                <Btn variant="primary" busy={busy} disabled={code.length < 4} onClick={join}>Valider</Btn>
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-600">La table n'est pas encore ouverte : un membre de l'équipe va vous accueillir. Vous pouvez consulter le menu.</p>
          )}
        </div>
      )}

      {awaiting.map((o) => (
        <div key={o.id} className="rounded-2xl border-2 border-sky-400 bg-sky-50 p-4 space-y-2">
          <p className="font-semibold">Votre commande n°{o.number} a été modifiée</p>
          <p className="text-sm">« {o.changeRequest} »</p>
          <ul className="text-sm">{o.lines.map((l) => <li key={l.id}>{l.quantity} × {l.displayName} — <Money mil={l.totalMil} /></li>)}</ul>
          <p className="text-sm font-semibold">Nouveau total : <Money mil={o.totalMil} /></p>
          <div className="flex gap-2">
            <Btn variant="primary" busy={busy} onClick={() => run(async () => { await clientApi.confirm(token, o.id, true); setVisit(await clientApi.visit(token)); })}>Je confirme</Btn>
            <Btn busy={busy} onClick={() => run(async () => { await clientApi.confirm(token, o.id, false); setVisit(await clientApi.visit(token)); })}>Je ne veux plus</Btn>
          </div>
        </div>
      ))}

      {tab === 'menu' && (
        <section className="space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => setCategory('')} className={cx('shrink-0 px-4 min-h-[40px] rounded-full text-sm font-semibold border', !category ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 bg-white')}>Tout</button>
            {categories.map((c) => (
              <button key={c} onClick={() => setCategory(c)} className={cx('shrink-0 px-4 min-h-[40px] rounded-full text-sm font-semibold border', category === c ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 bg-white')}>{c}</button>
            ))}
          </div>
          <ul className="space-y-2">
            {shown.map((a) => (
              <li key={a.id}>
                <button onClick={() => setSheet(a)} className={cx('w-full flex items-center gap-3 rounded-2xl bg-white border border-gray-200 p-3 text-left', a.availability !== 'available' && 'opacity-60')}>
                  {a.imageUrl ? <img src={a.imageUrl} alt="" className="w-16 h-16 rounded-xl object-cover" /> : <span className="w-16 h-16 rounded-xl bg-amber-50" />}
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold">{a.name}</span>
                    {a.description && <span className="block text-xs text-gray-500 truncate">{a.description}</span>}
                    <span className="block text-sm">{a.availability === 'available' ? <Money mil={a.unitPriceMil} /> : 'Indisponible'}</span>
                  </span>
                  <ChevronRight size={18} className="text-gray-400" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'cart' && (
        <section className="rounded-2xl bg-white border border-gray-200 p-4 space-y-3">
          <h2 className="font-semibold">Ma commande</h2>
          {table.data.features?.ordering === false && (
            <p className="text-sm rounded-xl bg-amber-50 border border-amber-200 text-amber-900 p-3">La commande par téléphone est fermée pour le moment. Appelez un serveur, il prendra votre commande.</p>
          )}
          <CartLines catalog={m} lines={lines} onChange={setLines} />
          {preview && (
            <div className="border-t border-gray-100 pt-2 text-sm space-y-1">
              {preview.discountMil > 0 && <p className="flex justify-between text-emerald-700"><span>Réductions</span><span>−<Money mil={preview.discountMil} /></span></p>}
              <p className="flex justify-between text-lg font-bold"><span>Total</span><Money mil={preview.totalMil} /></p>
            </div>
          )}
          <p className="text-xs text-gray-500">Votre commande sera vérifiée par l'équipe avant préparation. Le paiement se fait auprès de l'équipe.</p>
          <Btn variant="primary" size="lg" className="w-full" busy={busy} disabled={!joined || lines.length === 0} onClick={send}>
            Envoyer à l'équipe
          </Btn>
        </section>
      )}

      {tab === 'orders' && (
        <section className="space-y-2">
          {!joined ? <p className="text-sm text-gray-600">Saisissez le code de la table pour suivre vos commandes.</p> : (visit?.myOrders ?? []).length === 0 ? <p className="text-sm text-gray-500">Aucune commande envoyée depuis ce téléphone.</p> : (
            visit!.myOrders.map((o) => (
              <div key={o.id} className="rounded-2xl bg-white border border-gray-200 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">Commande n°{o.number}</p>
                  <Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge>
                </div>
                {o.rejectionReason && <p className="text-xs text-red-600">{o.rejectionReason}</p>}
                <ul className="text-sm">
                  {o.lines.map((l) => (
                    <li key={l.id} className="flex justify-between gap-2">
                      <span className={l.status !== 'active' ? 'line-through text-gray-400' : ''}>{l.quantity} × {l.displayName}</span>
                      {o.status === 'validated' && l.status === 'active' && <span className="text-xs text-gray-600">{PREP[l.prepStatus] ?? ''}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      )}

      {tab === 'bill' && (
        <section className="rounded-2xl bg-white border border-gray-200 p-4 space-y-2">
          <h2 className="font-semibold">Addition de la table</h2>
          {!joined || !visit ? <p className="text-sm text-gray-600">Saisissez le code de la table pour consulter l'addition.</p> : (
            <>
              <ul className="text-sm">
                {visit.bill.lines.map((l, i) => (
                  <li key={i} className="flex justify-between"><span>{l.quantity} × {l.displayName}</span><Money mil={l.totalMil} /></li>
                ))}
              </ul>
              {visit.bill.ticketDiscounts.map((d, i) => <p key={i} className="text-sm text-emerald-700 flex justify-between"><span>{d.label}</span><span>−<Money mil={d.amountMil} /></span></p>)}
              <p className="flex justify-between font-bold text-lg border-t border-gray-100 pt-2"><span>Total</span><Money mil={visit.bill.totalMil} /></p>
              {visit.bill.paidMil > 0 && <p className="flex justify-between text-sm"><span>Déjà réglé</span><Money mil={visit.bill.paidMil} /></p>}
              {visit.bill.pendingLines.length > 0 && (
                <div className="text-xs text-gray-500">
                  <p className="font-semibold">En attente de validation (non comptés) :</p>
                  {visit.bill.pendingLines.map((l, i) => <p key={i}>{l.quantity} × {l.displayName}</p>)}
                </div>
              )}
              {table.data.features?.bill !== false ? (
                <Btn variant="primary" className="w-full" busy={busy} disabled={requested('bill')} onClick={() => run(async () => { await clientApi.request(token, 'bill'); setVisit(await clientApi.visit(token)); })}>
                  <Receipt size={16} /> {requested('bill') ? "L'équipe arrive pour le règlement" : 'Je souhaite régler'}
                </Btn>
              ) : (
                <p className="text-sm text-gray-600">Pour régler, appelez un serveur avec le bouton ci-dessous.</p>
              )}
              <p className="text-xs text-gray-500">Le règlement se fait auprès de l'équipe (espèces, carte, ticket restaurant). Aucun paiement en ligne.</p>
            </>
          )}
        </section>
      )}

      {tab === 'more' && (
        <section className="space-y-3">
          <div className="rounded-2xl bg-white border border-gray-200 p-4 space-y-3">
            <h2 className="font-semibold flex items-center gap-2"><Star size={16} /> Votre avis</h2>
            {table.data.features?.feedback === false ? null : reviewSent ? <p className="text-sm text-emerald-700">Merci pour votre retour !</p> : (
              <>
                <div className="flex gap-1" role="radiogroup" aria-label="Note">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} aria-label={`${n} étoile(s)`} onClick={() => setRating(n)} className="p-1 text-amber-500"><Star size={30} fill={n <= rating ? 'currentColor' : 'none'} /></button>
                  ))}
                </div>
                <textarea className={cx(inputCls, 'min-h-[80px]')} placeholder="Un commentaire pour Café Noir (facultatif)" value={comment} onChange={(e) => setComment(e.target.value)} />
                <Btn variant="primary" busy={busy} disabled={rating === 0} onClick={() => run(async () => { await clientApi.feedback(rating, comment.trim(), token); setReviewSent(true); })}>Envoyer à Café Noir</Btn>
              </>
            )}
            {table.data.googleReviewUrl && (
              <a href={table.data.googleReviewUrl} target="_blank" rel="noreferrer" className="block text-center text-sm font-semibold text-emerald-700 underline">Laisser aussi un avis sur Google</a>
            )}
          </div>
          <div className="rounded-2xl bg-white border border-gray-200 p-4 space-y-2">
            <h2 className="font-semibold">Questions fréquentes</h2>
            {(faq.data ?? []).length === 0 ? <p className="text-sm text-gray-500">Demandez à notre équipe, elle vous renseignera.</p> : faq.data!.map((q) => (
              <details key={q.id} className="text-sm"><summary className="font-semibold cursor-pointer py-1">{q.question}</summary><p className="text-gray-700 pb-2">{q.answer}</p></details>
            ))}
            <p className="text-xs text-gray-500">Vos préférences ne remplacent pas une confirmation auprès de l'équipe pour une demande particulière.</p>
          </div>
          <a href="/reserver" className="block text-center text-sm font-semibold text-emerald-700 underline">Réserver une table pour une autre fois</a>
        </section>
      )}

      {joined && (
        <button
          onClick={() => run(async () => { await clientApi.request(token, 'call_waiter'); setNotice('Un serveur a été prévenu.'); setVisit(await clientApi.visit(token)); })}
          disabled={requested('call_waiter')}
          className="fixed right-4 bottom-24 z-30 rounded-full bg-gray-900 text-white px-4 min-h-[52px] shadow-lg flex items-center gap-2 text-sm font-semibold disabled:opacity-60"
        >
          <Bell size={18} /> {requested('call_waiter') ? 'Serveur prévenu' : 'Appeler un serveur'}
        </button>
      )}

      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 grid grid-cols-5 text-[11px] font-semibold">
        {([['menu', 'Menu'], ['cart', `Commande${lines.length ? ` (${lines.reduce((s, l) => s + l.quantity, 0)})` : ''}`], ['orders', 'Suivi'], ['bill', 'Addition'], ['more', 'Plus']] as [Tab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={cx('min-h-[60px] flex flex-col items-center justify-center gap-1', tab === id ? 'text-emerald-700' : 'text-gray-500')}>
            {id === 'cart' ? <ShoppingBag size={18} /> : id === 'bill' ? <Receipt size={18} /> : id === 'more' ? <Star size={18} /> : id === 'orders' ? <Bell size={18} /> : <Info size={18} />}
            {label}
          </button>
        ))}
      </nav>

      {sheet && <ProductSheet article={sheet} menu={m} canOrder={joined} me={me} onAdd={(l) => { setLines((p) => addLine(p, l)); setNotice(null); }} onClose={() => setSheet(null)} />}
    </div>
  );
};

