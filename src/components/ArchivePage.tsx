import React, { useEffect, useMemo, useState } from 'react';
import { Archive, Search, FilterX, ArchiveRestore, Loader2, Users, UserCog, AlertCircle } from 'lucide-react';
import { getRbacUsers, reactivateRbacUser } from '../api/roles';
import { ApiError } from '../api/client';
import type { RbacUser } from '../data/rbacModel';
import type { Employee } from '../data/hrModel';
import { getEmployeeFullName, formatDisplayDate } from '../data/hrModel';

interface ArchivePageProps {
  employees: Employee[];
  onReactivateEmployee: (employeeId: string) => void;
  onNavigateToDashboard: () => void;
  isDarkMode?: boolean;
}

type ArchiveRow =
  | { kind: 'Employé'; id: string; name: string; detail: string; archivedOn: string }
  | { kind: 'Utilisateur'; id: string; name: string; detail: string; archivedOn: string };

const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer';

// Everything archived/deactivated anywhere in the app, in one place — currently just employees
// (Inactif, see EmployeesPage's "Archiver") and login accounts (is_active=0, see
// RolesPermissionsPage's Users tab) since those are the only two archivable entities the app has
// today. Nothing shown here was ever deleted — it's all still fully intact and reactivable.
export const ArchivePage: React.FC<ArchivePageProps> = ({ employees, onReactivateEmployee, onNavigateToDashboard }) => {
  const [users, setUsers] = useState<RbacUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);

  const loadUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      setUsers(await getRbacUsers());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de charger les comptes.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'Employé' | 'Utilisateur'>('all');

  const archivedEmployees = useMemo(() => employees.filter((e) => e.status === 'Inactif'), [employees]);
  const deactivatedUsers = useMemo(() => users.filter((u) => !u.isActive), [users]);

  const rows = useMemo<ArchiveRow[]>(() => {
    const employeeRows: ArchiveRow[] = archivedEmployees.map((e) => ({
      kind: 'Employé',
      id: e.id,
      name: getEmployeeFullName(e),
      detail: e.poste,
      archivedOn: e.departureDate ?? '',
    }));
    const userRows: ArchiveRow[] = deactivatedUsers.map((u) => ({
      kind: 'Utilisateur',
      id: u.id,
      name: u.fullName,
      detail: u.employeeName ? `Lié à ${u.employeeName}` : (u.roleName ?? '—'),
      archivedOn: '',
    }));
    return [...employeeRows, ...userRows];
  }, [archivedEmployees, deactivatedUsers]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (typeFilter !== 'all' && r.kind !== typeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        if (!r.name.toLowerCase().includes(q) && !r.detail.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, typeFilter, searchQuery]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
  };

  const handleReactivateUser = async (user: RbacUser) => {
    setReactivatingId(user.id);
    try {
      await reactivateRbacUser(user.id);
      await loadUsers();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setReactivatingId(null);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <Archive size={20} className="text-gray-500" />
            <span>Archive</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              Rapports et analyses
            </span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Employés et comptes archivés/désactivés — rien n'a été supprimé, tout reste consultable et réactivable ici.
          </p>
        </div>
        <button onClick={onNavigateToDashboard} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700/80 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition active:scale-98 cursor-pointer">
          <span>Tableau de bord</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Employés archivés</span>
            <span className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">{archivedEmployees.length}</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 shrink-0"><Users size={22} /></div>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block">Comptes désactivés</span>
            <span className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">{deactivatedUsers.length}</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 shrink-0"><UserCog size={22} /></div>
        </div>
      </div>

      <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Nom, poste, rôle..."
              className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)} className="appearance-none px-3.5 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer">
            <option value="all">Tous les types</option>
            <option value="Employé">Employés</option>
            <option value="Utilisateur">Utilisateurs</option>
          </select>
          <button onClick={handleResetFilters} className={secondaryButtonClass}>
            <FilterX size={14} className="text-gray-500" />
            <span>Réinitialiser</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2 text-xs">
          <Loader2 size={16} className="animate-spin" /> Chargement…
        </div>
      ) : error ? (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 text-[11px] font-bold text-gray-400 dark:text-gray-500 bg-gray-50/50 dark:bg-gray-800/30">
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Nom</th>
                  <th className="py-3 px-4">Détail</th>
                  <th className="py-3 px-4">Archivé le</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 text-xs">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-14 text-gray-400">
                      <div className="max-w-sm mx-auto space-y-2">
                        <Archive className="w-9 h-9 mx-auto text-gray-300 dark:text-gray-600" />
                        <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">Rien d'archivé pour ces filtres</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r) => (
                    <tr key={`${r.kind}-${r.id}`} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="py-2.5 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700">{r.kind}</span>
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-gray-900 dark:text-white whitespace-nowrap">{r.name}</td>
                      <td className="py-2.5 px-4 text-gray-600 dark:text-gray-300">{r.detail}</td>
                      <td className="py-2.5 px-4 text-gray-500 dark:text-gray-400 whitespace-nowrap">{r.archivedOn ? formatDisplayDate(r.archivedOn) : '—'}</td>
                      <td className="py-2.5 px-4 text-center">
                        {r.kind === 'Employé' ? (
                          <button onClick={() => onReactivateEmployee(r.id)} title="Réactiver" className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer">
                            <ArchiveRestore size={14} />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReactivateUser(users.find((u) => u.id === r.id)!)}
                            disabled={reactivatingId === r.id}
                            title="Réactiver"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer disabled:opacity-50"
                          >
                            {reactivatingId === r.id ? <Loader2 size={14} className="animate-spin" /> : <ArchiveRestore size={14} />}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {filteredRows.length > 0 && (
            <div className="p-4 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400">
              sur un total de {rows.length} élément{rows.length > 1 ? 's' : ''} archivé{rows.length > 1 ? 's' : ''}{filteredRows.length !== rows.length ? ' (filtrés)' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
