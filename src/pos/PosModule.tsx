import React, { lazy, Suspense, useEffect, useState } from 'react';
import { HelpCircle, Lightbulb, ShieldAlert, UserRoundCog, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { helpSeen, markHelpSeen, SCREEN_HELP } from './help';
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
  { id: 'pos_dashboard', label: 'Tableau de bord direction', permission: 'dashboard:view', component: page(() => import('./DirectionPages'), 'DirectionDashboardPage') },
  { id: 'pos_sales_report', label: 'Rapport des ventes', permission: 'reports:view', component: page(() => import('./DirectionPages'), 'SalesReportPage') },
  { id: 'pos_journal', label: 'Journal détaillé', permission: 'activity_log:view', component: page(() => import('./DirectionPages'), 'JournalPage') },
  { id: 'pos_insights', label: 'Pilotage', permission: 'insights:view', component: page(() => import('./InsightsPage'), 'InsightsPage') },
  { id: 'pos_floor_designer', label: 'Concepteur du plan (2D/3D)', permission: 'floor:manage', component: page(() => import('./FloorDesignerPage'), 'FloorDesignerPage') },
  { id: 'pos_floor_library', label: 'Bibliothèque 3D', permission: 'floor:assets', component: page(() => import('./FloorDesignerPage'), 'FloorDesignerPage') },
  { id: 'pos_floor_editor', label: 'Plan de salle & QR codes', permission: 'floor:manage', component: page(() => import('./FloorEditorPage'), 'FloorEditorPage') },
  { id: 'pos_menu', label: 'Carte & disponibilités', permission: 'products:manage', component: page(() => import('./MenuSettingsPage'), 'MenuSettingsPage') },
  { id: 'pos_consumption', label: 'Fiche de consommation', permission: 'stock:view', component: page(() => import('./ConsumptionPage'), 'ConsumptionPage') },
  { id: 'pos_offers', label: 'Réductions & offres', permission: 'offers:manage', component: page(() => import('./OffersPage'), 'OffersPage') },
  { id: 'pos_equipment', label: 'Machines & amortissement', permission: 'equipment:view', component: page(() => import('./EquipmentPage'), 'EquipmentPage') },
  { id: 'pos_customers', label: 'Clients', permission: 'customers:view', component: page(() => import('./CustomersPage'), 'CustomersPage') },
  { id: 'pos_loyalty', label: 'Fidélité', permission: 'loyalty:manage', component: page(() => import('./LoyaltyPage'), 'LoyaltyPage') },
  { id: 'pos_feedback', label: 'FAQ & avis clients', permission: 'feedback:manage', component: page(() => import('./FaqFeedbackPage'), 'FaqFeedbackPage') },
  { id: 'pos_setup', label: 'Mise en service', permission: 'pos:settings', component: page(() => import('./SetupPage'), 'SetupPage') },
  { id: 'pos_printers', label: 'Imprimantes & tiroir', permission: 'pos:settings', component: page(() => import('./PrintersPage'), 'PrintersPage') },
  { id: 'pos_recette', label: 'Recette', permission: 'pos:settings', component: page(() => import('./RecettePage'), 'RecettePage') },
  { id: 'pos_settings', label: 'Paramètres caisse', permission: 'pos:settings', component: page(() => import('./PosSettingsPage'), 'PosSettingsPage') },
];

export const PosModule: React.FC<{ subId: string }> = ({ subId }) => {
  const { hasPermission, logout, user } = useAuth();
  const all = [...POS_PAGES, ...POS_ADMIN_PAGES];
  // Without a sub-page (section clicked), open the first screen the user may use.
  const def = all.find((p) => p.id === subId) ?? all.find((p) => hasPermission(p.permission)) ?? all[0];
  // The guide opens by itself the first time a person reaches a screen on this device.
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    setHelpOpen(Boolean(SCREEN_HELP[def.id]) && hasPermission(def.permission) && !helpSeen(def.id));
  }, [def.id]);
  if (!hasPermission(def.permission)) {
    return (
      <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-center gap-2">
        <ShieldAlert size={16} /> Votre profil ne donne pas accès à cet écran. Demandez à la direction si vous en avez besoin.
      </div>
    );
  }
  const Component = def.component;
  return (
    <div className="space-y-2">
      {/* Shared devices: each person works under their own account (§3.1). */}
      <div className="flex justify-end gap-1">
        {SCREEN_HELP[def.id] && (
          <button onClick={() => setHelpOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 px-2 py-1 rounded-lg hover:bg-emerald-50">
            <HelpCircle size={14} /> Aide
          </button>
        )}
        <button onClick={() => void logout()} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-emerald-700 px-2 py-1 rounded-lg hover:bg-gray-100">
          <UserRoundCog size={14} /> {user?.fullName} · Changer d'utilisateur
        </button>
      </div>
      <Suspense fallback={<Loading />}>
        <Component />
      </Suspense>
      {helpOpen && SCREEN_HELP[def.id] && <HelpPanel title={def.label} id={def.id} onClose={() => setHelpOpen(false)} />}
    </div>
  );
};

const HelpPanel: React.FC<{ id: string; title: string; onClose: () => void }> = ({ id, title, onClose }) => {
  const h = SCREEN_HELP[id];
  const close = () => {
    markHelpSeen(id);
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={close}>
      <aside role="dialog" aria-label={`Aide : ${title}`} className="w-full max-w-md h-full overflow-y-auto bg-white shadow-xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Comment ça marche</p>
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-600 mt-1">{h.goal}</p>
          </div>
          <button onClick={close} aria-label="Fermer l'aide" className="p-2 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <ol className="space-y-3">
          {h.steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-gray-800">
              <span className="shrink-0 w-7 h-7 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center">{i + 1}</span>
              <span className="pt-1">{step}</span>
            </li>
          ))}
        </ol>
        {h.tips?.map((tip, i) => (
          <p key={i} className="flex gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3"><Lightbulb size={16} className="shrink-0 mt-0.5" /> {tip}</p>
        ))}
        <p className="text-xs text-gray-500">Le bouton « Aide » en haut de l’écran rouvre ce guide à tout moment.</p>
        <button onClick={close} className="w-full min-h-[48px] rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700">J’ai compris</button>
      </aside>
    </div>
  );
};
