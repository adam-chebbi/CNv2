import React, { useEffect, useMemo } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';

interface EmployeePickerProps {
  value: string;
  onChange: (value: string) => void;
  employees: string[]; // Actif employee full names
  className?: string;
  id?: string;
}

// The one "who did this" picker used everywhere a sale/stock movement/purchase/etc. needs to
// attribute an employee — replaces a raw <select> of employee names. Behavior depends on the
// logged-in account (see AuthContext):
//   - hr:select_employee (or Super Admin, which always bypasses) → normal, free <select>. If the
//     account has no employee record linked to it (e.g. the original Super Admin), its own account
//     name is added to the list so it always has a valid, self-attributable option.
//   - Without the permission: locked to the account's own linked employee (or, if none, its own
//     account name) — rendered as a disabled field, never a live picker. The server enforces this
//     independently (see resolveEffectiveEmployeeName in server/lib/employeeSelection.ts) — this
//     component is the UX side of that same rule, not the actual gate.
export const EmployeePicker: React.FC<EmployeePickerProps> = ({ value, onChange, employees, className, id }) => {
  const { user, canSelectEmployee } = useAuth();
  const ownName = user?.employeeName ?? user?.fullName ?? '';

  const lockedName = canSelectEmployee ? null : (user?.employeeName ?? ownName);

  // Auto-propagate the locked value into the form the moment it's known (or changes) — the field
  // never sits empty/unsubmittable just because the picker itself is disabled.
  useEffect(() => {
    if (lockedName && value !== lockedName) onChange(lockedName);
  }, [lockedName, value, onChange]);

  const options = useMemo(() => {
    if (user?.employeeName || !ownName) return employees;
    return employees.includes(ownName) ? employees : [ownName, ...employees];
  }, [employees, ownName, user?.employeeName]);

  if (lockedName) {
    return (
      <div
        id={id}
        className={`${className ?? ''} flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 cursor-not-allowed`}
        title="Déterminé automatiquement par votre compte — voir Rôles & permissions pour l'autoriser à changer."
      >
        <Lock size={11} className="shrink-0" />
        <span className="truncate">{lockedName}</span>
      </div>
    );
  }

  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">Sélectionner un employé</option>
      {options.map((name) => (
        <option key={name} value={name}>{name}</option>
      ))}
    </select>
  );
};
