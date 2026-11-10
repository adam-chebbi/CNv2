import React, { useEffect, useState } from 'react';
import { CheckCircle2, Store } from 'lucide-react';
import { setReceiptIdentityProvider } from '../data/receipts';
import type { DiscountRule } from '../data/pricing';
import { usePosEvents } from '../hooks/usePosEvents';
import { posApi } from './api';
import { CaisseShell } from './caisse/CaisseShell';
import { OrderScreen, type OrderTarget } from './caisse/OrderScreen';
import { PlanScreen } from './caisse/PlanScreen';
import { OpenSessionForm, SessionBar, useCashSession } from './CashSessionControls';
import { OfflineBanner } from './OfflineRegister';
import { PrintStatusBanner } from './PrintersPage';
import { withCache } from './offline';
import { Card, ErrorNote, Loading, Modal, useLoader } from './ui';

// La Caisse (plan "Café Noir — Caisse implementation plan"): full screen, opens on the floor plan.
// A table opens its order screen; "Comptoir" opens a takeaway sale. Flow 1: no cash session →
// open it first.

export const RegisterPage: React.FC = () => {
  const cash = useCashSession();
  const catalog = useLoader(() => withCache('catalog', () => posApi.catalog()), []);
  const discounts = useLoader(() => withCache('discounts', () => posApi.discounts()), []);
  const floor = useLoader(() => posApi.floor(), []);
  const assets = useLoader(() => posApi.floorAssets().catch(() => []), []);
  const favorites = useLoader(() => posApi.favorites().catch(() => [] as string[]), []);
  const settings = useLoader(() => withCache('settings', () => posApi.settings()), []);
  const [target, setTarget] = useState<OrderTarget | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sessionPanel, setSessionPanel] = useState(false);

  usePosEvents(['catalog.changed'], () => {
    void catalog.reload();
    void discounts.reload();
  });
  usePosEvents(['cash.changed'], () => void cash.refresh(), 60_000);
  usePosEvents(['floor.changed', 'orders.changed', 'actions.changed', 'prep.changed', 'reservations.changed'], () => void floor.reload(), 15_000);

  // Receipts printed from this device (offline included) carry the café's identity too.
  useEffect(() => {
    const s = settings.data;
    if (s) setReceiptIdentityProvider(() => ({ name: s.legalName, address: s.address, phone: s.phone, website: s.website, taxId: s.taxId, tradeRegister: s.tradeRegister, thanks: s.receiptThanks, openingHours: s.openingHoursText }));
  }, [settings.data]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  // F3: comptoir from anywhere in the Caisse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F3' && !document.querySelector('[role="dialog"]')) {
        e.preventDefault();
        setTarget({ kind: 'counter' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const session = cash.session;
  const back = (message?: string) => {
    setTarget(null);
    void floor.reload();
    if (message) setToast(message);
  };

  let content: React.ReactNode;
  if (cash.loading || catalog.loading) content = <Loading />;
  else if (!session)
    content = (
      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex items-start justify-center">
        <Card title="Ouverture de la caisse" className="w-full max-w-lg mt-6">
          <p className="text-sm text-gray-600">Comptez l’argent du tiroir (fond de caisse), tapez le montant, puis « Ouvrir ».</p>
          <OpenSessionForm registers={cash.registers} registerId={cash.registerId} onChoose={cash.chooseRegister} onOpened={(s) => cash.setSession(s)} />
        </Card>
      </div>
    );
  else if (!catalog.data) content = <ErrorNote message={catalog.error ?? 'Carte indisponible.'} />;
  else if (target)
    content = (
      <OrderScreen
        key={target.kind === 'table' ? target.visitId : 'counter'}
        target={target}
        catalog={catalog.data}
        discounts={(discounts.data ?? []) as unknown as DiscountRule[]}
        favorites={favorites.data ?? []}
        session={session}
        settings={settings.data}
        onBack={back}
        onSessionChanged={() => void cash.refresh()}
      />
    );
  else
    content = (
      <PlanScreen
        floor={floor.data}
        assets={assets.data ?? []}
        error={floor.error}
        onOpen={(visitId, opts) => setTarget({ kind: 'table', visitId, ...opts })}
        onCounter={() => setTarget({ kind: 'counter' })}
      />
    );

  return (
    <CaisseShell session={session} onSession={() => setSessionPanel(true)}>
      <div className="shrink-0 empty:hidden">
        <OfflineBanner />
        <PrintStatusBanner />
      </div>
      {content}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-2xl bg-gray-900 text-white px-5 py-3 text-sm font-semibold shadow-xl flex items-center gap-2" role="status">
          <CheckCircle2 size={18} className="text-emerald-400" /> {toast}
        </div>
      )}
      {sessionPanel && (
        <Modal title="Session de caisse" onClose={() => setSessionPanel(false)} wide>
          {session ? (
            <SessionBar
              session={session}
              onChange={(s) => {
                if (s) cash.setSession(s);
                else {
                  void cash.refresh();
                  setSessionPanel(false);
                }
              }}
            />
          ) : (
            <p className="text-sm text-gray-600 flex items-center gap-2">
              <Store size={16} /> La caisse est fermée : ouvrez-la pour encaisser.
            </p>
          )}
        </Modal>
      )}
    </CaisseShell>
  );
};
