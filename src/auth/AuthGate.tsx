import React, { useEffect, useRef } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useAuth } from './AuthContext';
import { LoginPage } from '../components/LoginPage';
import { ChangePasswordPage } from '../components/ChangePasswordPage';

const LOGIN_PATH = '/login';

export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isReady } = useAuth();
  // Remembers where an unauthenticated visitor was trying to go, so a successful login can
  // send them back there instead of always landing on '/'.
  const intendedPath = useRef<string | null>(null);

  useEffect(() => {
    if (!isReady) return;

    const enforce = () => {
      const { pathname, search, hash } = window.location;
      if (!user && pathname !== LOGIN_PATH) {
        intendedPath.current = `${pathname}${search}${hash}` || '/';
        window.history.replaceState(window.history.state, '', LOGIN_PATH);
      } else if (user && pathname === LOGIN_PATH) {
        const target = intendedPath.current && intendedPath.current !== LOGIN_PATH ? intendedPath.current : '/';
        intendedPath.current = null;
        window.history.replaceState(window.history.state, '', target);
      }
    };

    enforce();
    window.addEventListener('popstate', enforce);
    return () => window.removeEventListener('popstate', enforce);
  }, [user, isReady]);

  if (!isReady) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
        <LoaderCircle size={22} className="text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  if (user.mustChangePassword) return <ChangePasswordPage />;

  return <>{children}</>;
};
