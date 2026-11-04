import React, { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck, Loader2, AlertCircle, Plus, Trash2, Pencil, X, Check, Lock, Users as UsersIcon, KeyRound,
  CheckCircle2, RotateCcw, UserCog, PauseCircle, PlayCircle,
} from 'lucide-react';
import {
  getPermissionCatalog, getRoles, createRole, updateRole, deleteRole, getRbacUsers, updateRbacUser,
  resetRbacUserPassword, deactivateRbacUser, reactivateRbacUser,
} from '../api/roles';
import { ApiError } from '../api/client';
import type { Role, RbacUser, PermissionModuleGroup } from '../data/rbacModel';
import { validateDraftRole } from '../data/rbacModel';
import { useAuth } from '../auth/AuthContext';

interface RolesPermissionsPageProps {
  onNavigateToDashboard: () => void;
}

const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer';
const inputBaseClass =
  'w-full px-3.5 py-2 text-xs rounded-xl border bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 transition border-gray-200 dark:border-gray-700 focus:border-emerald-500 focus:ring-emerald-500';

export const RolesPermissionsPage: React.FC<RolesPermissionsPageProps> = ({ onNavigateToDashboard }) => {
  const [tab, setTab] = useState<'roles' | 'users'>('roles');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [groups, setGroups] = useState<PermissionModuleGroup[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<RbacUser[]>([]);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [{ groups: g }, r, u] = await Promise.all([getPermissionCatalog(), getRoles(), getRbacUsers()]);
      setGroups(g);
      setRoles(r);
      setUsers(u);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de charger les rôles et permissions.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldCheck size={20} className="text-emerald-500" />
            <span>Rôles &amp; permissions</span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Gérez les rôles, leurs permissions et les comptes qui y sont rattachés.
          </p>
        </div>
        <button onClick={onNavigateToDashboard} className={secondaryButtonClass}>
          <span>Tableau de bord</span>
        </button>
      </div>

      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-gray-100 dark:bg-gray-800 w-fit">
        <button
          onClick={() => setTab('roles')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${tab === 'roles' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-2xs' : 'text-gray-500 dark:text-gray-400'}`}
        >
          <KeyRound size={13} /> Rôles
        </button>
        <button
          onClick={() => setTab('users')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${tab === 'users' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-2xs' : 'text-gray-500 dark:text-gray-400'}`}
        >
          <UsersIcon size={13} /> Utilisateurs
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2 text-xs">
          <Loader2 size={16} className="animate-spin" /> Chargement…
        </div>
      ) : error ? (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      ) : tab === 'roles' ? (
        <RolesTab groups={groups} roles={roles} onChanged={load} />
      ) : (
        <UsersTab roles={roles} users={users} onChanged={load} />
      )}
    </div>
  );
};

// --- Rôles ---------------------------------------------------------------------------------

const RolesTab: React.FC<{ groups: PermissionModuleGroup[]; roles: Role[]; onChanged: () => Promise<void> }> = ({ groups, roles, onChanged }) => {
  const [editingId, setEditingId] = useState<string | null>(null); // '' means "new role"
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const startCreate = () => {
    setEditingId('');
    setName('');
    setDescription('');
    setPermissions(new Set());
    setFormError(null);
  };

  const startEdit = (role: Role) => {
    setEditingId(role.id);
    setName(role.name);
    setDescription(role.description);
    setPermissions(new Set(role.permissions));
    setFormError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormError(null);
  };

  const togglePermission = (key: string) => {
    setPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleModule = (group: PermissionModuleGroup, enable: boolean) => {
    setPermissions((prev) => {
      const next = new Set(prev);
      group.permissions.forEach((p) => (enable ? next.add(p.key) : next.delete(p.key)));
      return next;
    });
  };

  const handleSave = async () => {
    const issues = validateDraftRole({ name }, roles, editingId || undefined);
    if (issues.length > 0) {
      setFormError(issues[0].message);
      return;
    }
    setIsSaving(true);
    setFormError(null);
    try {
      const payload = { name: name.trim(), description: description.trim(), permissions: Array.from<string>(permissions) };
      if (editingId) await updateRole(editingId, payload);
      else await createRole(payload);
      setEditingId(null);
      await onChanged();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (role: Role) => {
    if (role.isSystem) return;
    if (!window.confirm(`Supprimer le rôle « ${role.name} » ?`)) return;
    setDeletingId(role.id);
    try {
      await deleteRole(role.id);
      await onChanged();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setDeletingId(null);
    }
  };

  const isFormOpen = editingId !== null;

  return (
    <div className="space-y-4">
      {!isFormOpen && (
        <div className="flex justify-end">
          <button onClick={startCreate} className={primaryButtonClass}>
            <Plus size={14} /> Nouveau rôle
          </button>
        </div>
      )}

      {isFormOpen && (
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">{editingId ? 'Modifier le rôle' : 'Nouveau rôle'}</h2>
            <button onClick={cancelEdit} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
              <X size={15} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1">Nom du rôle</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputBaseClass} placeholder="Ex : Responsable stock" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1">Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputBaseClass} placeholder="Optionnel" />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Permissions</p>
            <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
              {groups.map((group) => {
                const groupKeys = group.permissions.map((p) => p.key);
                const allChecked = groupKeys.every((k) => permissions.has(k));
                return (
                  <div key={group.module} className="border border-gray-100 dark:border-gray-800 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-gray-800 dark:text-gray-200">{group.moduleLabel}</p>
                      <button
                        onClick={() => toggleModule(group, !allChecked)}
                        className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                      >
                        {allChecked ? 'Tout désélectionner' : 'Tout sélectionner'}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {group.permissions.map((perm) => (
                        <label key={perm.key} className="flex items-start gap-2 p-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={permissions.has(perm.key)}
                            onChange={() => togglePermission(perm.key)}
                            className="mt-0.5 accent-emerald-600"
                          />
                          <span>
                            <span className="text-xs font-medium text-gray-800 dark:text-gray-200">{perm.label}</span>
                            {perm.sensitive && <span className="ml-1.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">Sensible</span>}
                            <span className="block text-[11px] text-gray-500 dark:text-gray-400">{perm.description}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {formError && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle size={13} /> {formError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button onClick={cancelEdit} className={secondaryButtonClass}>Annuler</button>
            <button onClick={handleSave} disabled={isSaving} className={primaryButtonClass}>
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              <span>Enregistrer</span>
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {roles.map((role) => (
          <div key={role.id} className="p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                  {role.name}
                  {role.isSystem && (
                    <span title="Rôle système">
                      <Lock size={12} className="text-gray-400" />
                    </span>
                  )}
                </p>
                {role.description && <p className="text-[11px] text-gray-500 dark:text-gray-400">{role.description}</p>}
              </div>
              {!role.isSystem && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => startEdit(role)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(role)}
                    disabled={deletingId === role.id}
                    className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer disabled:opacity-50"
                  >
                    {deletingId === role.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
              <span>{role.isSystem ? 'Toutes les permissions' : `${role.permissions.length} permission(s)`}</span>
              <span>{role.userCount} utilisateur(s)</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Utilisateurs ----------------------------------------------------------------------------

// Shown once right after creating a user or resetting a password — no password value to display or
// copy: the temporary password is always the account's own CIN (see server/routes/roles.ts), which
// the Super Admin already just typed and the user already knows. Still a confirm-required modal
// (not a dismissible toast) so the rule — CIN as temporary password, forced change on next login —
// is clearly acknowledged rather than easy to miss.
const PasswordRuleConfirmation: React.FC<{ title: string; fullName: string; onConfirm: () => void }> = ({ title, fullName, onConfirm }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150" onClick={onConfirm}>
    <div className="w-full max-w-sm bg-white dark:bg-[#151D2A] rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 p-5 space-y-4 text-center" onClick={(e) => e.stopPropagation()}>
      <div className="w-11 h-11 mx-auto rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
        <CheckCircle2 size={20} />
      </div>
      <div>
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
          <strong className="text-gray-700 dark:text-gray-300">{fullName}</strong> peut se connecter avec son numéro
          CIN comme identifiant et comme mot de passe temporaire. Un changement de mot de passe lui sera demandé dès
          sa première connexion.
        </p>
      </div>
      <button onClick={onConfirm} className={`${primaryButtonClass} w-full`}>
        <Check size={14} />
        <span>Compris</span>
      </button>
    </div>
  </div>
);

// Comptes de connexion — gestion uniquement. Les comptes se créent désormais exclusivement depuis
// la fiche employé (section "Compte de connexion" de "Ajouter un employé", voir EmployeesPage.tsx),
// jamais ici — cette page ne fait plus que consulter, changer de rôle, réinitialiser un mot de
// passe, et activer/désactiver l'accès. Une ligne dont le rôle est Super Admin ne peut être
// modifiée que par un autre Super Admin — le serveur l'impose déjà (assertCanModifySuperAdminTarget,
// server/lib/userGuards.ts) ; ceci n'est que le reflet côté interface de cette même règle.
const UsersTab: React.FC<{ roles: Role[]; users: RbacUser[]; onChanged: () => Promise<void> }> = ({ roles, users, onChanged }) => {
  const { user: currentUser } = useAuth();
  const [savingRoleForId, setSavingRoleForId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [passwordNotice, setPasswordNotice] = useState<{ title: string; fullName: string } | null>(null);

  const roleNameById = useMemo(() => new Map(roles.map((r) => [r.id, r.name])), [roles]);

  const canModify = (u: RbacUser): boolean => !u.isSuperAdmin || Boolean(currentUser?.isSuperAdmin);

  const handleChangeRole = async (user: RbacUser, roleId: string) => {
    setSavingRoleForId(user.id);
    try {
      await updateRbacUser(user.id, { roleId });
      await onChanged();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setSavingRoleForId(null);
    }
  };

  const handleResetPassword = async (user: RbacUser) => {
    if (!window.confirm(`Réinitialiser le mot de passe de « ${user.fullName} » ? Son mot de passe temporaire redeviendra son numéro CIN.`)) return;
    setResettingId(user.id);
    try {
      await resetRbacUserPassword(user.id);
      setPasswordNotice({ title: 'Mot de passe réinitialisé', fullName: user.fullName });
      await onChanged();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setResettingId(null);
    }
  };

  const handleToggleActive = async (user: RbacUser) => {
    const action = user.isActive ? 'désactiver' : 'réactiver';
    if (user.isActive && !window.confirm(`Désactiver le compte de « ${user.fullName} » ? Il ne pourra plus se connecter, mais rien ne sera supprimé.`)) return;
    setTogglingId(user.id);
    try {
      if (user.isActive) await deactivateRbacUser(user.id);
      else await reactivateRbacUser(user.id);
      await onChanged();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : `Une erreur est survenue lors de la tentative de ${action} ce compte.`);
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {passwordNotice && (
        <PasswordRuleConfirmation
          title={passwordNotice.title}
          fullName={passwordNotice.fullName}
          onConfirm={() => setPasswordNotice(null)}
        />
      )}

      <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/50 text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
        <UserCog size={14} className="shrink-0 mt-0.5" />
        <span>Les comptes se créent depuis la fiche employé (Gestion du personnel → Ajouter un employé → « Compte de connexion »). Cette page ne sert qu'à gérer les comptes existants.</span>
      </div>

      <div className="rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800 text-left text-[11px] text-gray-500 dark:text-gray-400">
              <th className="px-4 py-2.5 font-semibold">Nom</th>
              <th className="px-4 py-2.5 font-semibold">Employé lié</th>
              <th className="px-4 py-2.5 font-semibold">CIN / Email / Téléphone</th>
              <th className="px-4 py-2.5 font-semibold">Rôle</th>
              <th className="px-4 py-2.5 font-semibold">Statut</th>
              <th className="px-4 py-2.5 font-semibold w-24"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const modifiable = canModify(u);
              return (
                <tr key={u.id} className={`border-b border-gray-50 dark:border-gray-800/60 last:border-0 ${!u.isActive ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-200">
                    <span className="inline-flex items-center gap-1.5">
                      {u.fullName}
                      {u.isSuperAdmin && <span title="Super Admin"><Lock size={11} className="text-gray-400" /></span>}
                    </span>
                    {u.mustChangePassword && (
                      <span
                        title="Doit changer son mot de passe à la prochaine connexion"
                        className="ml-1.5 inline-block px-1.5 py-0.5 rounded-md text-[9px] font-semibold bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 align-middle"
                      >
                        Changement requis
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">{u.employeeName ?? <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">
                    <div>{u.cin}</div>
                    {(u.email || u.phone) && (
                      <div className="text-[10px] text-gray-400">{[u.email, u.phone].filter(Boolean).join(' • ')}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={u.roleId ?? ''}
                      onChange={(e) => handleChangeRole(u, e.target.value)}
                      disabled={savingRoleForId === u.id || !modifiable}
                      title={!modifiable ? 'Seul un autre Super Admin peut modifier ce compte.' : undefined}
                      className="px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                    <span className="sr-only">{roleNameById.get(u.roleId ?? '') ?? ''}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${u.isActive ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'}`}>
                      {u.isActive ? 'Actif' : 'Désactivé'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => handleResetPassword(u)}
                      disabled={resettingId === u.id || !modifiable}
                      title={modifiable ? 'Réinitialiser le mot de passe' : 'Seul un autre Super Admin peut modifier ce compte.'}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                      {resettingId === u.id ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                    </button>
                    <button
                      onClick={() => handleToggleActive(u)}
                      disabled={togglingId === u.id || !modifiable || u.id === currentUser?.id}
                      title={
                        u.id === currentUser?.id
                          ? 'Vous ne pouvez pas désactiver votre propre compte.'
                          : !modifiable
                            ? 'Seul un autre Super Admin peut modifier ce compte.'
                            : u.isActive ? 'Désactiver' : 'Réactiver'
                      }
                      className={`p-1.5 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent ${u.isActive ? 'text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40' : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'}`}
                    >
                      {togglingId === u.id ? <Loader2 size={13} className="animate-spin" /> : u.isActive ? <PauseCircle size={13} /> : <PlayCircle size={13} />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
