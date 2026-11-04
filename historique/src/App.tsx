import React, { useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useAuth } from './auth/AuthContext';
import { ChangePasswordPage, LoginPage, NoAccessPage, OfflinePage, ResetPasswordPage } from './pages/AuthScreens';
import { Terminal } from './pages/Terminal';

export const App: React.FC = () => {
  const { state, reload } = useAuth();
  // The "mot de passe oublié" email links to /reinitialiser?token=… — handled before anything else,
  // whatever the current session state.
  const [resetToken, setResetToken] = useState(() =>
    window.location.pathname.replace(/\/+$/, '') === '/reinitialiser' ? new URLSearchParams(window.location.search).get('token') : null
  );
  const [loginMessage, setLoginMessage] = useState<string | undefined>();

  if (resetToken)
    return (
      <ResetPasswordPage
        token={resetToken}
        onDone={(message) => {
          window.history.replaceState(null, '', '/');
          setResetToken(null);
          setLoginMessage(message || undefined);
          void reload();
        }}
      />
    );

  if (state.kind === 'loading')
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50">
        <LoaderCircle size={22} className="text-emerald-600 animate-spin" />
      </div>
    );
  if (state.kind === 'anonymous') return <LoginPage message={state.message} info={loginMessage} />;
  if (state.kind === 'no_access') return <NoAccessPage message={state.message} />;
  if (state.kind === 'offline') return <OfflinePage onRetry={() => void reload()} />;
  if (state.user.mustChangePassword) return <ChangePasswordPage />;
  return <Terminal />;
};
