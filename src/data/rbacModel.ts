// RBAC (Rôles & Permissions) domain model — shared between client and server, following the same
// convention as every other *Model.ts file in this app: pure data/types/pure functions, no
// React/DOM/Express imports.
//
// Permissions are a FIXED CATALOG defined here in code, not a database table — adding a new
// permission later is just appending an entry to PERMISSIONS below (with its module/label/
// description) and, where it should actually gate something, adding a `requirePermission(...)`
// check server-side and a `hasPermission(...)` check client-side. No migration is ever needed to
// add a permission; only the ASSIGNMENT of a permission to a role is persisted, in role_permissions.
//
// Two roles are seeded by default (server/rbac/bootstrap.ts): "Super Admin" (is_system — protected
// from rename/edit/delete, and always has every permission regardless of what's stored in
// role_permissions, so the catalog can grow without ever needing to re-sync it) and
// "Compte Saisie" (an ordinary, fully editable role pre-seeded with a minimal data-entry starter
// set — dashboard/sales/stock viewing + creating a sale — that a Super Admin can freely adjust).

export interface Role {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: string[]; // permission keys, see PERMISSIONS below
  userCount: number;
  createdAt: string;
}

export interface DraftRole {
  id: string;
  name: string;
  description: string;
  permissions: string[];
}

export const SUPER_ADMIN_ROLE_NAME = 'Super Admin';
export const COMPTE_SAISIE_ROLE_NAME = 'Compte Saisie';

// The one permission that itself governs access to the Roles & Permissions screen — kept as its
// own named constant since a handful of call sites (the header dropdown link, the route guard)
// need to check specifically this one rather than iterate the catalog.
export const MANAGE_ROLES_PERMISSION = 'roles:manage';

// Gate for the separate Historique & Comptage app (historique/) — it calls GET /api/auth/me and
// lets a user in only if their role carries this key (or they are Super Admin).
export const HISTORIQUE_ACCESS_PERMISSION = 'historique:access';
export const GERANT_ROLE_NAME = 'Gérant';
export const DIRECTION_ROLE_NAME = 'Direction';
export const CAISSE_ROLE_NAME = 'Caisse';
export const SERVEUR_ROLE_NAME = 'Serveur';
export const CUISINE_ROLE_NAME = 'Cuisine';
export const BAR_ROLE_NAME = 'Bar';
export const HISTORIQUE_URL = 'https://historique.cafenoir.tn';

export interface PermissionDef {
  key: string;
  module: string; // grouping key, stable, used as a React key — e.g. 'sales'
  moduleLabel: string; // e.g. 'Gestion des ventes'
  label: string; // e.g. 'Rembourser une vente'
  description: string;
  sensitive?: boolean; // financial / otherwise sensitive action — flagged distinctly in the UI
}

// One entry per module, grouped in display order. Every key follows "<module>:<action>". Actions
// used across the catalog: view, create, edit, delete, manage (create+edit+delete bundled for a
// sub-area where splitting further isn't worth the extra checkboxes), import, plus module-specific
// sensitive actions (refund, cancel, approve, pay, financial...).
export const PERMISSIONS: PermissionDef[] = [
  // --- Tableau de bord --------------------------------------------------------------------------
  { key: 'dashboard:view', module: 'dashboard', moduleLabel: 'Tableau de bord', label: 'Consulter', description: 'Voir le tableau de bord et ses indicateurs.' },
  { key: 'dashboard:manage', module: 'dashboard', moduleLabel: 'Tableau de bord', label: 'Gérer', description: 'Définir les objectifs mensuels de ventes.' },

  // --- Notifications & Alertes -------------------------------------------------------------------
  { key: 'notifications:view', module: 'notifications', moduleLabel: 'Notifications & Alertes', label: 'Consulter', description: 'Voir les alertes opérationnelles.' },
  { key: 'notifications:manage', module: 'notifications', moduleLabel: 'Notifications & Alertes', label: 'Traiter', description: 'Marquer une alerte comme traitée ou non traitée.' },

  // --- Gestion des ventes ------------------------------------------------------------------------
  { key: 'sales:view', module: 'sales', moduleLabel: 'Gestion des ventes', label: 'Consulter', description: 'Voir la liste des ventes.' },
  { key: 'sales:create', module: 'sales', moduleLabel: 'Gestion des ventes', label: 'Saisir', description: 'Ajouter des ventes manuellement ou par import Excel/CSV.' },
  { key: 'sales:refund', module: 'sales', moduleLabel: 'Gestion des ventes', label: 'Rembourser', description: "Rembourser une vente (réintègre le stock, annule la dépense de TVA associée).", sensitive: true },
  { key: 'sales:cash_check', module: 'sales', moduleLabel: 'Gestion des ventes', label: 'Calcul du quotidien', description: "Réaliser et confirmer la réconciliation de caisse de fin de journée, et saisir / modifier / supprimer les chiffres d'affaires manuels.", sensitive: true },

  // --- Stock ---------------------------------------------------------------------------------
  { key: 'stock:view', module: 'stock', moduleLabel: 'Stock', label: 'Consulter', description: 'Voir le stock, les mouvements, les lots.' },
  { key: 'stock:manage', module: 'stock', moduleLabel: 'Stock', label: 'Gérer', description: 'Créer des mouvements, pertes/ajustements, gérer les unités.' },
  { key: 'stock:import', module: 'stock', moduleLabel: 'Stock', label: 'Importer', description: 'Importer mouvements, nouveaux ingrédients ou inventaires par Excel/CSV.' },
  { key: 'stock:inventory', module: 'stock', moduleLabel: 'Stock', label: 'Inventaires', description: 'Réaliser un inventaire et ajuster le stock théorique.' },

  // --- Gestion des produits ------------------------------------------------------------------------
  { key: 'products:view', module: 'products', moduleLabel: 'Gestion des produits', label: 'Consulter', description: 'Voir le catalogue produits, sous-recettes et catégories.' },
  { key: 'products:manage', module: 'products', moduleLabel: 'Gestion des produits', label: 'Gérer', description: 'Créer/modifier/supprimer produits, sous-recettes, catégories, suppléments.' },
  { key: 'products:import', module: 'products', moduleLabel: 'Gestion des produits', label: 'Importer', description: 'Importer des produits ou des sous-recettes par Excel/CSV.' },

  // --- Gestion des dépenses ------------------------------------------------------------------------
  { key: 'expenses:view', module: 'expenses', moduleLabel: 'Gestion des dépenses', label: 'Consulter', description: 'Voir les dépenses et leurs catégories.' },
  { key: 'expenses:create', module: 'expenses', moduleLabel: 'Gestion des dépenses', label: 'Saisir', description: 'Créer ou modifier une dépense.' },
  { key: 'expenses:approve', module: 'expenses', moduleLabel: 'Gestion des dépenses', label: 'Approuver', description: 'Changer le statut d’une dépense (Approuvé/Rejeté).', sensitive: true },
  { key: 'expenses:delete', module: 'expenses', moduleLabel: 'Gestion des dépenses', label: 'Supprimer', description: 'Supprimer une dépense.', sensitive: true },
  { key: 'expenses:categories', module: 'expenses', moduleLabel: 'Gestion des dépenses', label: 'Catégories', description: 'Créer/modifier/supprimer les catégories de dépenses.' },

  // --- Gestion des achats ------------------------------------------------------------------------
  { key: 'purchases:view', module: 'purchases', moduleLabel: 'Gestion des achats', label: 'Consulter', description: 'Voir les commandes, fournisseurs et factures.' },
  { key: 'purchases:create', module: 'purchases', moduleLabel: 'Gestion des achats', label: 'Créer', description: 'Créer une commande d’achat.' },
  { key: 'purchases:edit', module: 'purchases', moduleLabel: 'Gestion des achats', label: 'Modifier', description: 'Modifier une commande d’achat (Brouillon uniquement).' },
  { key: 'purchases:cancel', module: 'purchases', moduleLabel: 'Gestion des achats', label: 'Annuler / Commander', description: 'Changer le statut d’une commande (Commandée, Annulée...).', sensitive: true },
  { key: 'purchases:receive', module: 'purchases', moduleLabel: 'Gestion des achats', label: 'Réceptionner', description: 'Enregistrer la réception d’une commande.' },
  { key: 'purchases:delete', module: 'purchases', moduleLabel: 'Gestion des achats', label: 'Supprimer', description: 'Supprimer une commande, un fournisseur ou une facture.', sensitive: true },
  { key: 'purchases:suppliers', module: 'purchases', moduleLabel: 'Gestion des achats', label: 'Fournisseurs', description: 'Créer/modifier la liste des fournisseurs.' },
  { key: 'purchases:invoices', module: 'purchases', moduleLabel: 'Gestion des achats', label: 'Factures', description: 'Créer/modifier une facture fournisseur.' },
  { key: 'purchases:pay', module: 'purchases', moduleLabel: 'Gestion des achats', label: 'Paiement', description: 'Enregistrer un paiement sur une facture fournisseur.', sensitive: true },
  { key: 'purchases:import', module: 'purchases', moduleLabel: 'Gestion des achats', label: 'Importer', description: 'Importer achats, fournisseurs ou factures par Excel/CSV.' },
  { key: 'purchases:ocr', module: 'purchases', moduleLabel: 'Gestion des achats', label: 'OCR des factures', description: 'Utiliser la reconnaissance automatique de factures scannées.' },

  // --- Rapports de gestion ------------------------------------------------------------------------
  { key: 'reports:view', module: 'reports', moduleLabel: 'Rapports de gestion', label: 'Consulter', description: 'Voir les rapports ventes/achats/dépenses/stock.' },
  { key: 'reports:financial', module: 'reports', moduleLabel: 'Rapports de gestion', label: 'Rapports financier & fiscal', description: 'Voir le rapport financier et le rapport fiscal (données sensibles).', sensitive: true },

  // --- Gestion du personnel ------------------------------------------------------------------------
  { key: 'hr:view', module: 'hr', moduleLabel: 'Gestion du personnel', label: 'Consulter', description: 'Voir les employés et le planning.' },
  { key: 'hr:manage', module: 'hr', moduleLabel: 'Gestion du personnel', label: 'Gérer', description: 'Créer/modifier employés, shifts, planning.' },
  { key: 'hr:financial', module: 'hr', moduleLabel: 'Gestion du personnel', label: 'Suivi financier', description: 'Voir et saisir les salaires (données sensibles).', sensitive: true },
  { key: 'hr:select_employee', module: 'hr', moduleLabel: 'Gestion du personnel', label: "Sélection libre de l'employé", description: "Choisir manuellement l'employé sur une vente, un achat, un mouvement de stock... Sans cette permission, l'employé est automatiquement celui lié à votre compte." },

  // --- Journal d'activité -----------------------------------------------------------------------
  { key: 'activity_log:view', module: 'activity_log', moduleLabel: "Journal d'activité", label: 'Consulter', description: "Voir l'historique des actions effectuées dans l'application." },

  // --- Historique & Comptage (historique.cafenoir.tn) ---------------------------------------------
  // A separate app with its own database (see historique/README.md) — only its logins and these
  // grants live here. historique:access is all the café staff need; supervise is for the owner.
  { key: HISTORIQUE_ACCESS_PERMISSION, module: 'historique', moduleLabel: 'Historique & Comptage', label: 'Accès & saisie', description: "Se connecter à historique.cafenoir.tn (terminal de caisse) et saisir, par service, le chiffre d'affaires, les dépenses payées avec la caisse et le comptage (TPE, ticket resto, espèces)." },
  { key: 'historique:supervise', module: 'historique', moduleLabel: 'Historique & Comptage', label: 'Superviser', description: 'Corriger la caisse de n’importe quelle date passée (sans cette permission, seuls les 3 derniers jours sont modifiables).', sensitive: true },
  { key: 'historique:settings', module: 'historique', moduleLabel: 'Historique & Comptage', label: 'Paramétrer', description: 'Réservé aux réglages futurs de l’application Historique.', sensitive: true },

  // --- Caisse (point de vente) ----------------------------------------------------------------
  { key: 'pos:sell', module: 'pos', moduleLabel: 'Caisse', label: 'Vendre', description: "Utiliser l'écran de caisse : composer une vente au comptoir, sur place ou à emporter." },
  { key: 'pos:collect', module: 'pos', moduleLabel: 'Caisse', label: 'Encaisser', description: "Enregistrer les règlements (espèces, TPE, ticket restaurant) d'une vente ou d'une addition." },
  { key: 'pos:discount', module: 'pos', moduleLabel: 'Caisse', label: 'Remise manuelle', description: 'Appliquer une remise manuelle sur un ticket (dans la limite du plafond paramétré).', sensitive: true },
  { key: 'pos:history', module: 'pos', moduleLabel: 'Caisse', label: 'Historique des tickets', description: 'Rechercher et consulter les tickets (numéro, date, table).' },
  { key: 'pos:reprint', module: 'pos', moduleLabel: 'Caisse', label: 'Réimprimer', description: 'Réimprimer un ticket (duplicata, sans créer de vente).' },
  { key: 'pos:correct', module: 'pos', moduleLabel: 'Caisse', label: 'Corriger une vente encaissée', description: 'Annuler ou corriger une vente déjà réglée par un avoir, avec remboursement éventuel.', sensitive: true },
  { key: 'pos:settings', module: 'pos', moduleLabel: 'Caisse', label: 'Paramétrer', description: "Régler la caisse : plafond de remise, zone de consommation, FAQ, lien d'avis Google.", sensitive: true },

  // --- Sessions de caisse ------------------------------------------------------------------------
  { key: 'cash:view', module: 'cash', moduleLabel: 'Sessions de caisse', label: 'Consulter', description: 'Voir les sessions de caisse, leurs mouvements et récapitulatifs de clôture.' },
  { key: 'cash:open', module: 'cash', moduleLabel: 'Sessions de caisse', label: 'Ouvrir', description: 'Ouvrir une session de caisse avec son fond initial.' },
  { key: 'cash:movement', module: 'cash', moduleLabel: 'Sessions de caisse', label: "Entrées / sorties d'espèces", description: "Enregistrer un mouvement d'espèces hors vente.", sensitive: true },
  { key: 'cash:close', module: 'cash', moduleLabel: 'Sessions de caisse', label: 'Clôturer', description: 'Compter les espèces et clôturer une session de caisse.', sensitive: true },
  { key: 'cash:session_correct', module: 'cash', moduleLabel: 'Sessions de caisse', label: 'Corriger une session clôturée', description: "Corriger le comptage d'une session déjà clôturée (la valeur initiale reste visible).", sensitive: true },

  // --- Salle & tables ----------------------------------------------------------------------------
  { key: 'floor:view', module: 'floor', moduleLabel: 'Salle & tables', label: 'Consulter le plan', description: "Voir le plan de salle et l'état de ses tables." },
  { key: 'floor:manage', module: 'floor', moduleLabel: 'Salle & tables', label: 'Éditer le plan', description: 'Créer des espaces, ajouter, déplacer ou retirer des tables, imprimer les QR codes.' },
  { key: 'tables:all', module: 'floor', moduleLabel: 'Salle & tables', label: 'Toutes les tables', description: 'Agir sur toutes les tables (sans cette permission : uniquement les tables de ses carrés).' },
  { key: 'tables:assign', module: 'floor', moduleLabel: 'Salle & tables', label: 'Carrés & affectations', description: 'Définir les carrés et y affecter les serveurs, y compris pendant le service.' },
  { key: 'visits:manage', module: 'floor', moduleLabel: 'Salle & tables', label: 'Ouvrir / libérer une table', description: 'Ouvrir une visite (code client), saisir les couverts, libérer la table.' },

  // --- Commandes & préparation ------------------------------------------------------------------
  { key: 'orders:take', module: 'orders', moduleLabel: 'Commandes & préparation', label: 'Prendre une commande', description: 'Saisir une commande pour une table.' },
  { key: 'orders:validate', module: 'orders', moduleLabel: 'Commandes & préparation', label: 'Valider les commandes QR', description: 'Accepter, refuser ou faire modifier une commande envoyée par un client.' },
  { key: 'prep:kitchen', module: 'orders', moduleLabel: 'Commandes & préparation', label: 'Écran cuisine', description: 'Voir les préparations destinées à la cuisine.' },
  { key: 'prep:bar', module: 'orders', moduleLabel: 'Commandes & préparation', label: 'Écran bar', description: 'Voir les préparations destinées au bar.' },
  { key: 'prep:update', module: 'orders', moduleLabel: 'Commandes & préparation', label: 'Faire avancer une préparation', description: 'Passer une préparation à « en préparation », « prête » ou « servie ».' },
  { key: 'actions:view', module: 'orders', moduleLabel: 'Commandes & préparation', label: 'Actions à traiter', description: 'Voir et traiter la file : commandes à valider, appels serveur, additions, annulations, réservations, avis.' },

  // --- Annulations --------------------------------------------------------------------------------
  { key: 'cancel:request', module: 'cancel', moduleLabel: 'Annulations', label: 'Demander une annulation', description: "Demander l'annulation d'un article, d'une commande ou d'une visite, avec un motif." },
  { key: 'cancel:approve', module: 'cancel', moduleLabel: 'Annulations', label: 'Décider des annulations', description: "Accepter ou refuser les demandes d'annulation (jamais les siennes).", sensitive: true },

  // --- Offres -------------------------------------------------------------------------------------
  { key: 'offers:manage', module: 'offers', moduleLabel: 'Réductions & offres', label: 'Gérer', description: 'Créer et modifier les réductions, offres et règles de cumul.', sensitive: true },

  // --- Réservations -------------------------------------------------------------------------------
  { key: 'reservations:view', module: 'reservations', moduleLabel: 'Réservations', label: 'Consulter', description: 'Voir les réservations et demandes en ligne.' },
  { key: 'reservations:manage', module: 'reservations', moduleLabel: 'Réservations', label: 'Gérer', description: 'Créer, confirmer, refuser, modifier une réservation et lui attribuer une table.' },

  // --- Clients & fidélité ---------------------------------------------------------------------
  { key: 'customers:view', module: 'customers', moduleLabel: 'Clients & fidélité', label: 'Consulter les clients', description: 'Identifier un client en caisse et consulter sa fiche (visites, achats, fidélité).' },
  { key: 'customers:manage', module: 'customers', moduleLabel: 'Clients & fidélité', label: 'Gérer les clients', description: "Modifier la fiche d'un client." },
  { key: 'feedback:manage', module: 'customers', moduleLabel: 'Clients & fidélité', label: 'Traiter les avis', description: 'Consulter et traiter les avis internes laissés par les clients.' },
  { key: 'loyalty:manage', module: 'customers', moduleLabel: 'Clients & fidélité', label: 'Paramétrer la fidélité', description: 'Régler le barème, les récompenses et les offres ciblées.', sensitive: true },
  { key: 'loyalty:adjust', module: 'customers', moduleLabel: 'Clients & fidélité', label: 'Ajuster des points', description: 'Ajouter ou retirer des points manuellement, avec un motif.', sensitive: true },

  // --- Paramètres ------------------------------------------------------------------------------
  { key: 'settings:manage', module: 'settings', moduleLabel: 'Paramètres', label: 'Gérer', description: 'Modifier les réglages généraux (seuils d’alerte, taux, marges...).', sensitive: true },

  // --- Rôles & permissions -----------------------------------------------------------------------
  { key: MANAGE_ROLES_PERMISSION, module: 'roles', moduleLabel: 'Rôles & permissions', label: 'Gérer', description: 'Créer/modifier/supprimer des rôles, assigner des permissions et des utilisateurs.', sensitive: true },
];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);
const PERMISSION_KEY_SET = new Set(PERMISSION_KEYS);
export const isKnownPermissionKey = (key: string): boolean => PERMISSION_KEY_SET.has(key);

export interface PermissionModuleGroup {
  module: string;
  moduleLabel: string;
  permissions: PermissionDef[];
}

// Groups the flat catalog by module, preserving the declaration order above — what the Roles &
// Permissions matrix renders one section per.
export const groupPermissionsByModule = (): PermissionModuleGroup[] => {
  const groups: PermissionModuleGroup[] = [];
  const byModule = new Map<string, PermissionModuleGroup>();
  PERMISSIONS.forEach((p) => {
    let group = byModule.get(p.module);
    if (!group) {
      group = { module: p.module, moduleLabel: p.moduleLabel, permissions: [] };
      byModule.set(p.module, group);
      groups.push(group);
    }
    group.permissions.push(p);
  });
  return groups;
};

// --- Users (RBAC-facing view — the fuller Employee record lives in hrModel.ts and is unrelated:
// a login account is not necessarily a staff member with an HR file, and vice versa) -------------

export interface RbacUser {
  id: string;
  fullName: string;
  cin: string;
  email: string;
  phone: string;
  roleId: string | null;
  roleName: string | null;
  isSuperAdmin: boolean;
  // True right after a password reset, until the user actually logs in and sets their own password
  // (see server/routes/auth.ts's POST /change-password). Accounts are now created exclusively from
  // the employee form (EmployeesPage.tsx), never from here.
  mustChangePassword: boolean;
  // Set only for accounts created from an employee's "Compte de connexion" section — null for
  // accounts with no HR record behind them.
  employeeId: string | null;
  employeeName: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface RbacValidationIssue {
  field: string;
  message: string;
}

export const validateDraftRole = (draft: Pick<DraftRole, 'name'>, existingRoles: Role[], editingId?: string): RbacValidationIssue[] => {
  const issues: RbacValidationIssue[] = [];
  const trimmed = draft.name.trim();
  if (!trimmed) {
    issues.push({ field: 'name', message: 'Le nom du rôle est obligatoire.' });
  } else {
    const duplicate = existingRoles.find((r) => r.name.trim().toLowerCase() === trimmed.toLowerCase() && r.id !== editingId);
    if (duplicate) issues.push({ field: 'name', message: 'Ce nom de rôle est déjà utilisé.' });
  }
  return issues;
};

// --- Staff profiles (pre-configured roles) ------------------------------------------------------
// Starter grants created once at boot (server/rbac/bootstrap.ts); the direction adjusts them
// afterwards from Rôles & permissions. Direction gets the whole catalog.

const SERVICE_BASE = ['floor:view', 'orders:take', 'orders:validate', 'visits:manage', 'cancel:request', 'actions:view', 'products:view'];

export const PROFILE_STARTER_PERMISSIONS: Record<string, string[]> = {
  [GERANT_ROLE_NAME]: [
    ...SERVICE_BASE,
    'dashboard:view', 'notifications:view', 'sales:view',
    'pos:sell', 'pos:collect', 'pos:discount', 'pos:history', 'pos:reprint', 'pos:correct',
    'cash:view', 'cash:open', 'cash:movement', 'cash:close',
    'tables:all', 'tables:assign', 'prep:kitchen', 'prep:bar', 'prep:update', 'cancel:approve',
    'reservations:view', 'reservations:manage', 'customers:view', 'customers:manage', 'feedback:manage',
    'stock:view', 'activity_log:view',
  ],
  [CAISSE_ROLE_NAME]: [
    ...SERVICE_BASE,
    'pos:sell', 'pos:collect', 'pos:history', 'pos:reprint',
    'cash:view', 'cash:open', 'cash:movement', 'cash:close',
    'tables:all', 'reservations:view', 'customers:view',
  ],
  [SERVEUR_ROLE_NAME]: [...SERVICE_BASE, 'prep:update'],
  [CUISINE_ROLE_NAME]: ['prep:kitchen', 'prep:update'],
  [BAR_ROLE_NAME]: ['prep:bar', 'prep:update'],
};

export const PROFILE_DESCRIPTIONS: Record<string, string> = {
  [DIRECTION_ROLE_NAME]: 'Direction de Café Noir : administration complète (caisse, paramètres, utilisateurs, salle, clients, équipe, stocks, rapports).',
  [CAISSE_ROLE_NAME]: 'Caisse : ventes, additions, règlements, mouvements et sessions de caisse.',
  [SERVEUR_ROLE_NAME]: "Serveur : tables de ses carrés, commandes correspondantes, demandes d'annulation.",
  [CUISINE_ROLE_NAME]: 'Cuisine : écran des préparations cuisine.',
  [BAR_ROLE_NAME]: 'Bar : écran des préparations bar.',
};
