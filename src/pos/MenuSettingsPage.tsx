import React, { useMemo, useState } from 'react';
import { BookOpen } from 'lucide-react';
import type { PricedArticle } from '../data/pricing';
import { posApi } from './api';
import { Btn, Card, cx, ErrorNote, Field, inputCls, Loading, Modal, Money, PageHeader, useAction, useLoader } from './ui';

// Carte & disponibilités (cahier des charges §5, §8.3, §8.4, §10.3): availability shared by the
// register, the QR menu and the website; kitchen/bar routing; allergens; incompatible extras.

const COMMON_ALLERGENS = ['Gluten', 'Lait', 'Œufs', 'Fruits à coque', 'Arachides', 'Soja', 'Sésame', 'Poisson', 'Crustacés', 'Céleri', 'Moutarde', 'Sulfites', 'Lupin', 'Mollusques'];

const AllergenModal: React.FC<{ article: PricedArticle; current: { allergen: string; state: 'contains' | 'free' }[]; onClose: () => void; onSaved: () => void }> = ({ article, current, onClose, onSaved }) => {
  const [states, setStates] = useState<Record<string, 'contains' | 'free' | ''>>(() => Object.fromEntries(current.map((c) => [c.allergen, c.state])));
  const { busy, error, run } = useAction();
  const names = [...new Set([...COMMON_ALLERGENS, ...current.map((c) => c.allergen)])];
  return (
    <Modal
      title={`Allergènes — ${article.name}`}
      onClose={onClose}
      footer={<Btn variant="primary" busy={busy} onClick={() => run(async () => { await posApi.setAllergens(article.id, Object.entries(states).filter(([, s]) => s).map(([name, state]) => ({ name, state: state as 'contains' | 'free' }))); onSaved(); })}>Enregistrer</Btn>}
    >
      <ErrorNote message={error} />
      <p className="text-xs text-gray-500">« Non renseigné » n'est jamais présenté au client comme une absence : il lui est conseillé de demander à l'équipe.</p>
      <div className="space-y-1">
        {names.map((n) => (
          <div key={n} className="flex items-center gap-2 text-sm">
            <span className="flex-1">{n}</span>
            <select className={cx(inputCls, 'w-44 min-h-[36px] py-1')} value={states[n] ?? ''} onChange={(e) => setStates({ ...states, [n]: e.target.value as 'contains' | 'free' | '' })}>
              <option value="">Non renseigné</option>
              <option value="contains">Contient</option>
              <option value="free">Ne contient pas (vérifié)</option>
            </select>
          </div>
        ))}
      </div>
    </Modal>
  );
};

export const MenuSettingsPage: React.FC = () => {
  const catalog = useLoader(() => posApi.catalog(true), []);
  const allergens = useLoader(() => posApi.allergens(), []);
  const [query, setQuery] = useState('');
  const [allergenFor, setAllergenFor] = useState<PricedArticle | null>(null);
  const [pairs, setPairs] = useState<[string, string][] | null>(null);
  const [pair, setPair] = useState<[string, string]>(['', '']);
  const { busy, error, setError, run } = useAction();

  const currentPairs = pairs ?? catalog.data?.incompatibleExtras ?? [];
  const extras = catalog.data?.extras ?? [];
  const extraName = (id: string) => extras.find((e) => e.id === id)?.name ?? id;
  const filtered = useMemo(() => (catalog.data?.articles ?? []).filter((a) => a.name.toLowerCase().includes(query.trim().toLowerCase())), [catalog.data, query]);

  if (catalog.loading) return <Loading />;
  const patch = (a: PricedArticle, body: Parameters<typeof posApi.setArticle>[1]) =>
    run(async () => {
      await posApi.setArticle(a.id, body);
      await catalog.reload();
    });

  return (
    <div className="space-y-4">
      <PageHeader icon={BookOpen} title="Carte & disponibilités" subtitle="Disponibilité synchronisée entre caisse, menu QR et site. Une alerte de stock ne rend pas un produit indisponible." />
      <ErrorNote message={error ?? catalog.error} onClose={() => setError(null)} />
      <Card>
        <input className={inputCls} placeholder="Rechercher un produit…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 text-left">
              <tr>
                <th className="py-2">Produit</th>
                <th>Prix</th>
                <th>Disponibilité</th>
                <th>Préparation</th>
                <th>Allergènes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((a) => {
                const own = (allergens.data ?? []).filter((x) => x.articleId === a.id);
                return (
                  <tr key={a.id}>
                    <td className="py-2">{a.name}<span className="block text-xs text-gray-400">{a.category}</span></td>
                    <td><Money mil={a.unitPriceMil} /></td>
                    <td>
                      <select className={cx(inputCls, 'min-h-[36px] py-1 w-40')} value={a.availability} disabled={busy} onChange={(e) => patch(a, { availability: e.target.value as PricedArticle['availability'] })}>
                        <option value="available">Disponible</option>
                        <option value="unavailable">Indisponible (affiché)</option>
                        <option value="hidden">Masqué</option>
                      </select>
                    </td>
                    <td>
                      <select className={cx(inputCls, 'min-h-[36px] py-1 w-32')} value={a.prepDestination} disabled={busy} onChange={(e) => patch(a, { prepDestination: e.target.value as PricedArticle['prepDestination'] })}>
                        <option value="bar">Bar</option>
                        <option value="kitchen">Cuisine</option>
                        <option value="none">Servi direct</option>
                      </select>
                    </td>
                    <td>
                      <Btn size="sm" variant="ghost" onClick={() => setAllergenFor(a)}>
                        {own.length ? own.filter((x) => x.state === 'contains').map((x) => x.allergen).join(', ') || 'Renseignés' : 'Non renseignés'}
                      </Btn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Suppléments incompatibles" actions={pairs && <Btn size="sm" variant="primary" busy={busy} onClick={() => run(async () => { await posApi.setIncompatibilities(currentPairs); setPairs(null); await catalog.reload(); })}>Enregistrer</Btn>}>
        <p className="text-xs text-gray-500">Deux suppléments d'une même paire ne peuvent pas être choisis ensemble (ex. deux sortes de lait).</p>
        <ul className="space-y-1 text-sm">
          {currentPairs.map(([a, b]) => (
            <li key={`${a}|${b}`} className="flex items-center gap-2">
              <span className="flex-1">{extraName(a)} ✕ {extraName(b)}</span>
              <Btn size="sm" variant="ghost" onClick={() => setPairs(currentPairs.filter(([x, y]) => !(x === a && y === b)))}>Retirer</Btn>
            </li>
          ))}
        </ul>
        <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
          {[0, 1].map((i) => (
            <Field key={i} label={`Supplément ${i + 1}`}>
              <select className={inputCls} value={pair[i]} onChange={(e) => setPair(i === 0 ? [e.target.value, pair[1]] : [pair[0], e.target.value])}>
                <option value="">—</option>
                {extras.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
          ))}
          <Btn disabled={!pair[0] || !pair[1] || pair[0] === pair[1]} onClick={() => { setPairs([...currentPairs, pair]); setPair(['', '']); }}>Ajouter</Btn>
        </div>
      </Card>

      {allergenFor && (
        <AllergenModal
          article={allergenFor}
          current={(allergens.data ?? []).filter((x) => x.articleId === allergenFor.id)}
          onClose={() => setAllergenFor(null)}
          onSaved={() => {
            setAllergenFor(null);
            void allergens.reload();
          }}
        />
      )}
    </div>
  );
};
