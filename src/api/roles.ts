import { apiGet, apiPost, apiPut, apiDelete } from './client';
import type { Role, DraftRole, RbacUser, PermissionModuleGroup } from '../data/rbacModel';

export const getPermissionCatalog = () => apiGet<{ groups: PermissionModuleGroup[] }>('/permissions');

export const getRoles = () => apiGet<Role[]>('/roles');
export const createRole = (role: Pick<DraftRole, 'name' | 'description' | 'permissions'>) => apiPost<Role>('/roles', role);
export const updateRole = (id: string, role: Partial<Pick<DraftRole, 'name' | 'description' | 'permissions'>>) => apiPut<Role>(`/roles/${id}`, role);
export const deleteRole = (id: string) => apiDelete<void>(`/roles/${id}`);

// Accounts are created exclusively from the employee form (see hrApi.createEmployee's optional
// `account` — EmployeesPage.tsx) — this tab is management-only: role changes, password resets,
// activate/deactivate. No POST /users here any more.
export const getRbacUsers = () => apiGet<RbacUser[]>('/users');
export const updateRbacUser = (id: string, user: Partial<{ fullName: string; email: string; phone: string; roleId: string }>) =>
  apiPut<RbacUser>(`/users/${id}`, user);
// The temporary password is always the account's own CIN (see server/routes/roles.ts) — nothing to
// show or copy, the acting admin already just typed it and the user already knows their own.
export const resetRbacUserPassword = (id: string) => apiPost<void>(`/users/${id}/reset-password`);
export const deactivateRbacUser = (id: string) => apiPost<RbacUser>(`/users/${id}/deactivate`, {});
export const reactivateRbacUser = (id: string) => apiPost<RbacUser>(`/users/${id}/reactivate`, {});
