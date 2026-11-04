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
