import { ApiError } from '../middleware/errors.js';
import type { AuthedUser } from '../middleware/auth.js';

// The one server-side gate behind "Autoriser la sélection d'un employé" (hr:select_employee) — the
// client-side EmployeePicker component already locks the field in the UI when this is missing, but
// that's UX only; a direct API call could still submit any name, so every write route that accepts
// a "who did this" employee name calls this first. Mirrors the app-wide convention (see
// requirePermission) that Super Admin, and anyone holding the permission, passes through unchanged.
export const resolveEffectiveEmployeeName = (user: AuthedUser, submittedName: string): string => {
  const canSelectFreely = user.isSuperAdmin || user.permissions.includes('hr:select_employee');
  if (canSelectFreely) return submittedName;

  // No linked employee (the original Super Admin, or any admin/IT-only account) still needs to be
  // able to attribute a record to themselves — see EmployeePicker's "moi" option.
  const allowedName = user.employeeName ?? user.fullName;
  if (submittedName !== allowedName) {
    throw new ApiError(403, `Vous n'êtes pas autorisé à enregistrer cette action au nom d'un autre employé — seul « ${allowedName} » est accepté.`);
  }
  return submittedName;
};
