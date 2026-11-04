import React, { useState } from 'react';
import { LoaderCircle, KeyRound, LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';

// Rendered by AuthGate in place of the app whenever user.mustChangePassword is true (after
// logging in with a temporary password) — the server refuses every other route in the meantime
// (see server/middleware/auth.ts's requireAuth), so this is the only screen reachable until the
// password is actually changed.
export const ChangePasswordPage: React.FC = () => {
  const { user, changePassword, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('Le nouveau mot de passe doit comporter au moins 8 caractères.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setIsSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue. Réessayez.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white border border-gray-100 rounded-2xl shadow-xs p-6">
        <div className="flex flex-col items-center text-center gap-2 mb-5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <KeyRound size={20} />
          </div>
          <h1 className="text-base font-bold text-gray-900">Changement de mot de passe requis</h1>
          <p className="text-xs text-gray-500">
            {user?.fullName ? `Bonjour ${user.fullName} — vous` : 'Vous'} devez définir un nouveau mot de passe avant
            de continuer.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="cp-current" className="block text-xs font-semibold text-gray-700 mb-1.5">
              Mot de passe actuel (temporaire)
            </label>
            <input
              id="cp-current"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="cp-new" className="block text-xs font-semibold text-gray-700 mb-1.5">
              Nouveau mot de passe
            </label>
            <input
              id="cp-new"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="8 caractères minimum"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="cp-confirm" className="block text-xs font-semibold text-gray-700 mb-1.5">
              Confirmer le nouveau mot de passe
            </label>
            <input
              id="cp-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
            />
          </div>

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition cursor-pointer"
          >
            {isSubmitting && <LoaderCircle size={15} className="animate-spin" />}
            Valider le nouveau mot de passe
          </button>
        </form>

        <button
          onClick={logout}
          className="mt-4 w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
        >
          <LogOut size={12} /> Se déconnecter
        </button>
      </div>
    </div>
  );
};
