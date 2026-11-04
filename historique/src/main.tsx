import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startOutboxSync } from './api/outbox';
import { AuthProvider } from './auth/AuthContext';
import { ToastProvider } from './components/ui';
import { initPwa } from './lib/pwa';
import './index.css';

initPwa();
startOutboxSync();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ToastProvider>
  </React.StrictMode>
);
