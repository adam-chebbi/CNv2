import React, { useEffect, useState } from 'react';
import { ArrowLeft, KeyRound, LoaderCircle, LogOut, Mail, ShieldAlert, WifiOff } from 'lucide-react';
import { api, errorText } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { cls } from '../components/ui';

const Backdrop: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative min-h-[100dvh] w-full overflow-y-auto bg-gray-50">
    <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-emerald-100/60 blur-3xl animate-blob-float-1" />
    <div className="pointer-events-none absolute bottom-0 right-0 w-80 h-80 rounded-full bg-amber-100/40 blur-3xl animate-blob-float-2" />
    <div className="pointer-events-none absolute inset-0 opacity-[0.35] bg-[radial-gradient(#d1d5db_1px,transparent_1px)] [background-size:26px_26px] animate-grid-pan" />
    <div className="relative flex flex-col items-center px-4 pt-[max(3rem,env(safe-area-inset-top))] pb-10">
      <img src="/logo-text.png" alt="Café Noir" className="h-8 w-auto animate-fade-up" />
      <p className="mt-2 text-xs font-semibold tracking-wide text-emerald-700 uppercase">Caisse — Historique & Comptage</p>
      <div className="w-full max-w-sm mt-8 animate-fade-up">{children}</div>
    </div>
  </div>
);

const Clock: React.FC = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="mt-6 flex flex-col items-center gap-1">
      <div className="font-mono tabular-nums text-3xl font-bold text-gray-900">{now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
      <p className="text-xs text-gray-500 capitalize">{now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    </div>
  );
};

export const LoginPage: React.FC<{ message?: string; info?: string }> = ({ message, info }) => {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(message ?? null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Email et mot de passe requis.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(identifier.trim(), password);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (forgot) return <ForgotPasswordForm initialEmail={identifier.trim()} onBack={() => setForgot(false)} />;

  return (
    <Backdrop>
      <form onSubmit={submit} className="bg-white border border-gray-100 rounded-2xl shadow-xs p-6 space-y-3">
        <div className="mb-1">
          <h1 className="text-base font-bold text-gray-900">Connexion</h1>
        </div>
        {info && <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-xs text-emerald-900">{info}</div>}
        <div>
          <label htmlFor="identifier" className={cls.label}>
            Email
          </label>
          <input id="identifier" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" className={cls.input} value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="email@exemple.tn" />
        </div>
        <div>
          <label htmlFor="password" className={cls.label}>
            Mot de passe
          </label>
          <input id="password" type="password" autoComplete="current-password" className={cls.input} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <button type="submit" disabled={busy} className={`${cls.primary} w-full mt-3`}>
          {busy && <LoaderCircle size={15} className="animate-spin" />}
          Se connecter
        </button>
        <button type="button" onClick={() => setForgot(true)} className="w-full text-center text-xs font-semibold text-emerald-700 hover:underline pt-1 cursor-pointer">
          Mot de passe oublié ?
        </button>
      </form>
      <Clock />
    </Backdrop>
  );
};

// "Mot de passe oublié" — asks for the email; the answer is the same whether or not an account
// exists (the server decides silently whether to send the link).
const ForgotPasswordForm: React.FC<{ initialEmail: string; onBack: () => void }> = ({ initialEmail, onBack }) => {
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Saisissez une adresse email valide.');
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ message: string }>('/auth/forgot-password', { email: email.trim() });
      setSent(res.message);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Backdrop>
      <div className="bg-white border border-gray-100 rounded-2xl shadow-xs p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Mail size={18} className="text-emerald-600" />
          <h1 className="text-base font-bold text-gray-900">Mot de passe oublié</h1>
        </div>
        {sent ? (
          <>
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-sm text-emerald-900">{sent}</div>
            <p className="text-xs text-gray-500">Le lien reçu par email est valable 30 minutes et ne fonctionne qu’une seule fois.</p>
            <button type="button" onClick={onBack} className={`${cls.primary} w-full`}>
              Retour à la connexion
            </button>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-xs text-gray-500">Saisissez l’email de votre compte : nous vous enverrons un lien pour choisir un nouveau mot de passe.</p>
            <input type="email" inputMode="email" autoComplete="username" autoCapitalize="none" autoFocus className={cls.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemple.tn" />
            {error && <p className="text-xs text-rose-600">{error}</p>}
            <button type="submit" disabled={busy} className={`${cls.primary} w-full`}>
              {busy && <LoaderCircle size={15} className="animate-spin" />}
              Envoyer le lien
            </button>
            <button type="button" onClick={onBack} className={`${cls.ghost} w-full`}>
              <ArrowLeft size={14} /> Retour à la connexion
            </button>
          </form>
        )}
      </div>
    </Backdrop>
  );
};

// Opened from the email link (/reinitialiser?token=…): checks the link, then sets the new password.
export const ResetPasswordPage: React.FC<{ token: string; onDone: (message: string) => void }> = ({ token, onDone }) => {
  const [valid, setValid] = useState<boolean | null>(null);
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<{ valid: boolean }>(`/auth/reset-password/check?token=${encodeURIComponent(token)}`)
      .then((r) => setValid(r.valid))
      .catch(() => setValid(false));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return setError('Le nouveau mot de passe doit comporter au moins 8 caractères.');
    if (next !== confirm) return setError('Les deux mots de passe ne correspondent pas.');
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/reset-password', { token, newPassword: next });
      onDone('Mot de passe modifié. Connectez-vous avec votre nouveau mot de passe.');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Backdrop>
      <div className="bg-white border border-gray-100 rounded-2xl shadow-xs p-6 space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound size={18} className="text-emerald-600" />
          <h1 className="text-base font-bold text-gray-900">Nouveau mot de passe</h1>
        </div>
        {valid === null ? (
          <div className="flex justify-center py-6">
            <LoaderCircle size={20} className="animate-spin text-emerald-600" />
          </div>
        ) : !valid ? (
          <>
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
              Ce lien n’est plus valide : il a expiré (30 minutes) ou a déjà été utilisé. Faites une nouvelle demande depuis l’écran de connexion.
            </div>
            <button type="button" onClick={() => onDone('')} className={`${cls.primary} w-full`}>
              Retour à la connexion
            </button>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-xs text-gray-500">Choisissez votre nouveau mot de passe (8 caractères minimum). Tous vos appareils seront déconnectés.</p>
            <input type="password" autoComplete="new-password" autoFocus className={cls.input} placeholder="Nouveau mot de passe" value={next} onChange={(e) => setNext(e.target.value)} />
            <input type="password" autoComplete="new-password" className={cls.input} placeholder="Confirmer le nouveau mot de passe" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {error && <p className="text-xs text-rose-600">{error}</p>}
            <button type="submit" disabled={busy} className={`${cls.primary} w-full`}>
              {busy && <LoaderCircle size={15} className="animate-spin" />}
              Enregistrer le mot de passe
            </button>
          </form>
        )}
      </div>
    </Backdrop>
  );
};

export const ChangePasswordPage: React.FC = () => {
  const { changePassword, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return setError('Le nouveau mot de passe doit comporter au moins 8 caractères.');
    if (next !== confirm) return setError('Les deux mots de passe ne correspondent pas.');
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Backdrop>
      <form onSubmit={submit} className="bg-white border border-gray-100 rounded-2xl shadow-xs p-6 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound size={18} className="text-emerald-600" />
          <h1 className="text-base font-bold text-gray-900">Choisissez votre mot de passe</h1>
        </div>
        <p className="text-xs text-gray-500">Vous vous êtes connecté avec un mot de passe temporaire. Choisissez-en un personnel pour continuer.</p>
        <input type="password" autoComplete="current-password" className={cls.input} placeholder="Mot de passe actuel (temporaire)" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <input type="password" autoComplete="new-password" className={cls.input} placeholder="Nouveau mot de passe (8 caractères min.)" value={next} onChange={(e) => setNext(e.target.value)} />
        <input type="password" autoComplete="new-password" className={cls.input} placeholder="Confirmer le nouveau mot de passe" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <button type="submit" disabled={busy} className={`${cls.primary} w-full`}>
          {busy && <LoaderCircle size={15} className="animate-spin" />}
          Enregistrer et continuer
        </button>
        <button type="button" onClick={() => void logout()} className={`${cls.ghost} w-full`}>
          Se déconnecter
        </button>
      </form>
    </Backdrop>
  );
};

export const NoAccessPage: React.FC<{ message: string }> = ({ message }) => {
  const { logout } = useAuth();
  return (
    <Backdrop>
      <div className="bg-white border border-gray-100 rounded-2xl shadow-xs p-6 text-center">
        <span className="mx-auto w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mb-3">
          <ShieldAlert size={22} className="text-amber-600" />
        </span>
        <h1 className="text-base font-bold text-gray-900">Accès non autorisé</h1>
        <p className="text-xs text-gray-500 mt-2">{message}</p>
        <button onClick={() => void logout()} className={`${cls.secondary} w-full mt-5`}>
          <LogOut size={14} /> Changer de compte
        </button>
      </div>
    </Backdrop>
  );
};

export const OfflinePage: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <Backdrop>
    <div className="bg-white border border-gray-100 rounded-2xl shadow-xs p-6 text-center">
      <span className="mx-auto w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
        <WifiOff size={22} className="text-gray-500" />
      </span>
      <h1 className="text-base font-bold text-gray-900">Pas de connexion</h1>
      <p className="text-xs text-gray-500 mt-2">Impossible de joindre le serveur. Vérifiez le Wi-Fi ou les données mobiles, puis réessayez.</p>
      <button onClick={onRetry} className={`${cls.primary} w-full mt-5`}>
        Réessayer
      </button>
    </div>
  </Backdrop>
);
