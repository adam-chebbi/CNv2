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
  // One right, or several (any of them opens the page).
  permission: string | string[];
  component: React.LazyExoticComponent<React.ComponentType>;
}

// A menu entry groups related screens as tabs, so each section of the menu stays short.
export interface PosHub {
  id: string;
  label: string;
  pages: PosPageDef[];
}

const P = {
  register: { id: 'pos_register', label: 'Caisse', permission: 'pos:sell', component: page(() => import('./RegisterPage'), 'RegisterPage') },
  floor: { id: 'pos_floor', label: 'Plan de salle', permission: 'floor:view', component: page(() => import('./FloorPage'), 'FloorPage') },
  actions: { id: 'pos_actions', label: 'Actions à traiter', permission: 'actions:view', component: page(() => import('./ActionsPage'), 'ActionsPage') },
  reservations: { id: 'pos_reservations', label: 'Réservations', permission: 'reservations:view', component: page(() => import('./ReservationsPage'), 'ReservationsPage') },
  cancellations: { id: 'pos_cancellations', label: 'Annulations', permission: 'cancel:request', component: page(() => import('./CancellationsPage'), 'CancellationsPage') },
  kitchen: { id: 'pos_kitchen', label: 'Cuisine', permission: 'prep:kitchen', component: page(() => import('./PrepBoardPage'), 'KitchenBoardPage') },
  bar: { id: 'pos_bar', label: 'Bar', permission: 'prep:bar', component: page(() => import('./PrepBoardPage'), 'BarBoardPage') },
  tickets: { id: 'pos_tickets', label: 'Tickets', permission: 'pos:history', component: page(() => import('./TicketsPage'), 'TicketsPage') },
  sessions: { id: 'pos_sessions', label: 'Sessions de caisse', permission: 'cash:view', component: page(() => import('./SessionsHistoryPage'), 'SessionsHistoryPage') },
  timeclock: { id: 'pos_timeclock', label: 'Mon pointage', permission: 'timeclock:self', component: page(() => import('./TeamPages'), 'TimeclockPage') },
  team: { id: 'pos_team', label: 'Équipe', permission: 'timeclock:team', component: page(() => import('./TeamPages'), 'TeamPage') },

  dashboard: { id: 'pos_dashboard', label: 'Tableau de bord', permission: 'dashboard:view', component: page(() => import('./DirectionPages'), 'DirectionDashboardPage') },
  salesReport: { id: 'pos_sales_report', label: 'Rapport des ventes', permission: 'reports:view', component: page(() => import('./DirectionPages'), 'SalesReportPage') },
  insights: { id: 'pos_insights', label: 'Prévisions & alertes', permission: 'insights:view', component: page(() => import('./InsightsPage'), 'InsightsPage') },
  journal: { id: 'pos_journal', label: 'Journal', permission: 'activity_log:view', component: page(() => import('./DirectionPages'), 'JournalPage') },
  designer: { id: 'pos_floor_designer', label: 'Concepteur 2D/3D', permission: ['floor:manage', 'floor:assets'], component: page(() => import('./FloorDesignerPage'), 'FloorDesignerPage') },
  floorEditor: { id: 'pos_floor_editor', label: 'Tables, carrés & QR codes', permission: 'floor:manage', component: page(() => import('./FloorEditorPage'), 'FloorEditorPage') },
  menu: { id: 'pos_menu', label: 'Carte & disponibilités', permission: 'products:manage', component: page(() => import('./MenuSettingsPage'), 'MenuSettingsPage') },
  offers: { id: 'pos_offers', label: 'Réductions & offres', permission: 'offers:manage', component: page(() => import('./OffersPage'), 'OffersPage') },
  consumption: { id: 'pos_consumption', label: 'Fiche de consommation', permission: 'stock:view', component: page(() => import('./ConsumptionPage'), 'ConsumptionPage') },
  customers: { id: 'pos_customers', label: 'Clients', permission: 'customers:view', component: page(() => import('./CustomersPage'), 'CustomersPage') },
  loyalty: { id: 'pos_loyalty', label: 'Fidélité', permission: 'loyalty:manage', component: page(() => import('./LoyaltyPage'), 'LoyaltyPage') },
  feedback: { id: 'pos_feedback', label: 'FAQ & avis', permission: 'feedback:manage', component: page(() => import('./FaqFeedbackPage'), 'FaqFeedbackPage') },
  setup: { id: 'pos_setup', label: 'Mise en service', permission: 'pos:settings', component: page(() => import('./SetupPage'), 'SetupPage') },
  settings: { id: 'pos_settings', label: 'Paramètres', permission: 'pos:settings', component: page(() => import('./PosSettingsPage'), 'PosSettingsPage') },
  rules: { id: 'pos_rules', label: 'Règles', permission: 'rules:service', component: page(() => import('./RulesPage'), 'RulesPage') },
  printers: { id: 'pos_printers', label: 'Imprimantes & tiroir', permission: 'pos:settings', component: page(() => import('./PrintersPage'), 'PrintersPage') },
  equipment: { id: 'pos_equipment', label: 'Machines', permission: 'equipment:view', component: page(() => import('./EquipmentPage'), 'EquipmentPage') },
  recette: { id: 'pos_recette', label: 'Recette', permission: 'pos:settings', component: page(() => import('./RecettePage'), 'RecettePage') },
} satisfies Record<string, PosPageDef>;

// "Caisse & service": what the team uses during service.
export const POS_HUBS: PosHub[] = [
  { id: 'pos_register', label: 'Caisse', pages: [P.register] },
  { id: 'pos_room', label: 'Salle & demandes', pages: [P.floor, P.actions, P.reservations, P.cancellations] },
  { id: 'pos_prep', label: 'Préparation', pages: [P.kitchen, P.bar] },
  { id: 'pos_history', label: 'Tickets & sessions', pages: [P.tickets, P.sessions] },
  { id: 'pos_staff', label: 'Pointage & équipe', pages: [P.timeclock, P.team] },
];

// "Paramétrage caisse": setup and follow-up by the direction.
export const POS_ADMIN_HUBS: PosHub[] = [
  { id: 'pos_reports', label: 'Pilotage & rapports', pages: [P.dashboard, P.salesReport, P.insights, P.journal] },
  { id: 'pos_plan', label: 'Plan de salle', pages: [P.designer, P.floorEditor] },
  { id: 'pos_catalog', label: 'Carte & offres', pages: [P.menu, P.offers, P.consumption] },
  { id: 'pos_clients', label: 'Clients & fidélité', pages: [P.customers, P.loyalty, P.feedback] },
  { id: 'pos_config', label: 'Réglages', pages: [P.setup, P.settings, P.rules, P.printers, P.equipment, P.recette] },
];

const ALL_HUBS = [...POS_HUBS, ...POS_ADMIN_HUBS];
export const hubPermissions = (hub: PosHub): string[] => hub.pages.flatMap((p) => (Array.isArray(p.permission) ? p.permission : [p.permission]));

const TAB_KEY = 'cn_hub_tab';
const rememberTab = (hubId: string, pageId: string) => {
  try {
    localStorage.setItem(`${TAB_KEY}:${hubId}`, pageId);
  } catch {
    /* not kept */
  }
};
const rememberedTab = (hubId: string): string | null => {
  try {
    return localStorage.getItem(`${TAB_KEY}:${hubId}`);
  } catch {
    return null;
  }
};

export const PosModule: React.FC<{ subId: string; section?: string }> = ({ subId, section = 'pos' }) => {
  const { hasPermission, logout, user } = useAuth();
  const can = (p: PosPageDef) => (Array.isArray(p.permission) ? p.permission.some(hasPermission) : hasPermission(p.permission));
  // subId is a menu entry, or a screen inside one (links from notifications). Without one, the
  // first entry of the section the person may use opens by itself.
  const sectionHubs = section === 'pos_admin' ? POS_ADMIN_HUBS : POS_HUBS;
  const hub =
    ALL_HUBS.find((h) => h.id === subId) ??
    ALL_HUBS.find((h) => h.pages.some((p) => p.id === subId)) ??
    sectionHubs.find((h) => h.pages.some(can)) ??
    ALL_HUBS.find((h) => h.pages.some(can)) ??
    POS_HUBS[0];
  const allowed = hub.pages.filter(can);
  const pick = (): PosPageDef =>
    allowed.find((p) => p.id === subId) ?? allowed.find((p) => p.id === rememberedTab(hub.id)) ?? allowed[0] ?? hub.pages[0];
  const [tabId, setTabId] = useState(() => pick().id);
  useEffect(() => setTabId(pick().id), [subId, hub.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const def = allowed.find((p) => p.id === tabId) ?? pick();
  const openTab = (id: string) => {
    setTabId(id);
    rememberTab(hub.id, id);
  };
  // The guide opens by itself the first time a person reaches a screen on this device.
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    setHelpOpen(Boolean(SCREEN_HELP[def.id]) && can(def) && !helpSeen(def.id));
  }, [def.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Full-screen screens (the Caisse) have their own "Aide" button.
  useEffect(() => {
    const open = () => setHelpOpen(true);
    window.addEventListener('cn:open-help', open);
    return () => window.removeEventListener('cn:open-help', open);
  }, []);
  if (!can(def)) {
    return (
      <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-center gap-2">
        <ShieldAlert size={16} /> Votre profil ne donne pas accès à cet écran. Demandez à la direction si vous en avez besoin.
      </div>
    );
  }
  const Component = def.component;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-1">
        {allowed.length > 1 && (
          <nav className="flex gap-1 overflow-x-auto mr-auto" aria-label={hub.label}>
            {allowed.map((p) => (
              <button
                key={p.id}
                onClick={() => openTab(p.id)}
                aria-current={p.id === def.id ? 'page' : undefined}
                className={`shrink-0 px-3 min-h-[40px] rounded-xl text-sm font-semibold border transition ${p.id === def.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'}`}
              >
                {p.label}
              </button>
            ))}
          </nav>
        )}
        {SCREEN_HELP[def.id] && (
          <button onClick={() => setHelpOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 px-2 py-1 rounded-lg hover:bg-emerald-50">
            <HelpCircle size={14} /> Aide
          </button>
        )}
        {/* Shared devices: each person works under their own account (§3.1). */}
        <button onClick={() => void logout()} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-emerald-700 px-2 py-1 rounded-lg hover:bg-gray-100">
          <UserRoundCog size={14} /> {user?.fullName} · Changer d'utilisateur
        </button>
      </div>
      <Suspense fallback={<Loading />}>
        <Component key={def.id} />
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
