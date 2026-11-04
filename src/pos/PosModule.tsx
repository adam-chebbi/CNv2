import React, { lazy, Suspense } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Loading } from './ui';

// Entry point of the point-of-sale screens, rendered by App.tsx for the "Caisse & service" and
// "Paramétrage caisse" menu sections. Each screen is loaded on demand.

const page = <K extends string>(loader: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => loader().then((m) => ({ default: m[name] })));

export interface PosPageDef {
  id: string;
  label: string;
  permission: string;
  component: React.LazyExoticComponent<React.ComponentType>;
}

export const POS_PAGES: PosPageDef[] = [
  { id: 'pos_register', label: 'Caisse', permission: 'pos:sell', component: page(() => import('./RegisterPage'), 'RegisterPage') },
];

export const POS_ADMIN_PAGES: PosPageDef[] = [];

export const PosModule: React.FC<{ subId: string }> = ({ subId }) => {
  const { hasPermission } = useAuth();
  const all = [...POS_PAGES, ...POS_ADMIN_PAGES];
  // Without a sub-page (section clicked), open the first screen the user may use.
  const def = all.find((p) => p.id === subId) ?? all.find((p) => hasPermission(p.permission)) ?? all[0];
  if (!hasPermission(def.permission)) {
    return (
      <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-center gap-2">
        <ShieldAlert size={16} /> Votre profil ne donne pas accès à cet écran. Demandez à la direction si vous en avez besoin.
      </div>
    );
  }
  const Component = def.component;
  return (
    <Suspense fallback={<Loading />}>
      <Component />
    </Suspense>
  );
};
