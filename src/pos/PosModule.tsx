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
  { id: 'pos_floor', label: 'Plan de salle', permission: 'floor:view', component: page(() => import('./FloorPage'), 'FloorPage') },
  { id: 'pos_actions', label: 'Actions à traiter', permission: 'actions:view', component: page(() => import('./ActionsPage'), 'ActionsPage') },
  { id: 'pos_kitchen', label: 'Écran cuisine', permission: 'prep:kitchen', component: page(() => import('./PrepBoardPage'), 'KitchenBoardPage') },
  { id: 'pos_bar', label: 'Écran bar', permission: 'prep:bar', component: page(() => import('./PrepBoardPage'), 'BarBoardPage') },
  { id: 'pos_reservations', label: 'Réservations', permission: 'reservations:view', component: page(() => import('./ReservationsPage'), 'ReservationsPage') },
  { id: 'pos_cancellations', label: 'Annulations', permission: 'cancel:request', component: page(() => import('./CancellationsPage'), 'CancellationsPage') },
  { id: 'pos_timeclock', label: 'Pointage', permission: 'timeclock:self', component: page(() => import('./TeamPages'), 'TimeclockPage') },
  { id: 'pos_team', label: 'Équipe', permission: 'timeclock:team', component: page(() => import('./TeamPages'), 'TeamPage') },
  { id: 'pos_tickets', label: 'Tickets', permission: 'pos:history', component: page(() => import('./TicketsPage'), 'TicketsPage') },
  { id: 'pos_sessions', label: 'Sessions de caisse', permission: 'cash:view', component: page(() => import('./SessionsHistoryPage'), 'SessionsHistoryPage') },
];

export const POS_ADMIN_PAGES: PosPageDef[] = [
  { id: 'pos_floor_editor', label: 'Plan de salle & QR codes', permission: 'floor:manage', component: page(() => import('./FloorEditorPage'), 'FloorEditorPage') },
  { id: 'pos_menu', label: 'Carte & disponibilités', permission: 'products:manage', component: page(() => import('./MenuSettingsPage'), 'MenuSettingsPage') },
  { id: 'pos_consumption', label: 'Fiche de consommation', permission: 'stock:view', component: page(() => import('./ConsumptionPage'), 'ConsumptionPage') },
  { id: 'pos_offers', label: 'Réductions & offres', permission: 'offers:manage', component: page(() => import('./OffersPage'), 'OffersPage') },
  { id: 'pos_customers', label: 'Clients', permission: 'customers:view', component: page(() => import('./CustomersPage'), 'CustomersPage') },
  { id: 'pos_loyalty', label: 'Fidélité', permission: 'loyalty:manage', component: page(() => import('./LoyaltyPage'), 'LoyaltyPage') },
  { id: 'pos_feedback', label: 'FAQ & avis clients', permission: 'feedback:manage', component: page(() => import('./FaqFeedbackPage'), 'FaqFeedbackPage') },
  { id: 'pos_settings', label: 'Paramètres caisse', permission: 'pos:settings', component: page(() => import('./PosSettingsPage'), 'PosSettingsPage') },
];

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
