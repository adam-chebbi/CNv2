import React, { useState } from 'react';
import { CheckCircle2, CircleAlert, CircleDot, Rocket } from 'lucide-react';
import { apiGet } from '../api/client';
import { Badge, Card, cx, ErrorNote, Loading, PageHeader, useLoader } from './ui';

// Mise en service (cahier des charges §17.1, §20.3): configuration status computed from the data,
// to be completed with Café Noir before going live.

interface Item {
  id: string;
  label: string;
  status: 'ok' | 'todo' | 'check';
  detail: string;
  screen?: string;
  list?: string[];
}

const ICON = { ok: CheckCircle2, todo: CircleAlert, check: CircleDot };
const TONE = { ok: 'text-emerald-600', todo: 'text-red-600', check: 'text-amber-600' };
const LABEL = { ok: 'Prêt', todo: 'À faire', check: 'À valider avec Café Noir' };

export const SetupPage: React.FC = () => {
  const status = useLoader(() => apiGet<{ items: Item[]; ready: boolean }>('/pos/setup-status'), []);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <PageHeader icon={Rocket} title="Mise en service" subtitle="Paramètres à arrêter avant la mise en production. Calculé à partir des données réelles." />
      <ErrorNote message={status.error} />
      {!status.data ? <Loading /> : (
        <>
          <Card>
            <p className={cx('text-lg font-bold', status.data.ready ? 'text-emerald-700' : 'text-amber-700')}>
              {status.data.ready ? 'Tout est prêt pour la mise en service.' : `${status.data.items.filter((i) => i.status === 'todo').length} point(s) restent à faire.`}
            </p>
          </Card>
          <Card>
            <ul className="divide-y divide-gray-100">
              {status.data.items.map((i) => {
                const Icon = ICON[i.status];
                return (
                  <li key={i.id} className="py-2">
                    <button className="w-full flex items-center gap-3 text-left" onClick={() => setOpen(open === i.id ? null : i.id)} disabled={!i.list?.length}>
                      <Icon size={20} className={TONE[i.status]} />
                      <span className="flex-1">
                        <span className="block text-sm font-semibold">{i.label}</span>
                        <span className="block text-xs text-gray-600">{i.detail}{i.screen && <span className="text-gray-400"> — {i.screen}</span>}</span>
                      </span>
                      <Badge tone={i.status === 'ok' ? 'green' : i.status === 'todo' ? 'red' : 'amber'}>{LABEL[i.status]}</Badge>
                    </button>
                    {open === i.id && i.list && <p className="mt-2 ml-8 text-xs text-gray-600">{i.list.join(', ')}</p>}
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
};
