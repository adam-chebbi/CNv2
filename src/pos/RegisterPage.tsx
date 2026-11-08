import React, { useEffect, useMemo, useState } from 'react';
import { ShoppingBag, Store, Utensils } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import type { CartLineInput } from '../data/pricing';
import { computeCart } from '../data/pricing';
import { newIdempotencyKey, usePosEvents } from '../hooks/usePosEvents';
import { posApi, type SaleDetail } from './api';
import { addLine, CartLines, ProductGrid, toPricingCatalog } from './CartComposer';
import { OpenSessionForm, SessionBar, useCashSession } from './CashSessionControls';
import { PaymentPanel } from './PaymentPanel';
import { PrintStatusBanner } from './PrintersPage';
import { isNetworkError, withCache } from './offline';
import { OfflineBanner, OfflineSaleModal } from './OfflineRegister';
import { Btn, Card, cx, ErrorNote, Loading, Money, PageHeader, useAction, useLoader } from './ui';

// Écran principal de caisse (cahier des charges §2.1 – §2.2): counter / takeaway sales. Table bills
// are collected from the floor plan. Right-click (or long press) on a product toggles its
// availability during service.

export const RegisterPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const cash = useCashSession();
  // Cached on the device so the register keeps selling without Internet (amélioration 05).
  const catalog = useLoader(() => withCache('catalog', () => posApi.catalog()), []);
  const discounts = useLoader(() => withCache('discounts', () => posApi.discounts()), []);
  const [offlineSale, setOfflineSale] = useState(false);
  const [lines, setLines] = useState<CartLineInput[]>([]);
  const [serviceType, setServiceType] = useState<'dine_in' | 'takeaway'>('takeaway');
  const [saleKey, setSaleKey] = useState(newIdempotencyKey);
  const [paying, setPaying] = useState<SaleDetail | null>(null);
  const { busy, error, setError, run } = useAction();

  usePosEvents(['catalog.changed'], () => {
    void catalog.reload();
    void discounts.reload();
  });
  usePosEvents(['cash.changed'], () => void cash.refresh(), 60_000);

  // Customer display next to the register mirrors the cart (amélioration 07).
  const registerId = cash.session?.registerId ?? null;
  const pricingForDisplay = catalog.data ? toPricingCatalog(catalog.data) : null;
  useEffect(() => {
    if (!registerId || paying) return;
    const t = window.setTimeout(() => {
      let state: Record<string, unknown> = { mode: 'idle' };
      if (lines.length > 0 && pricingForDisplay) {
        try {
          const cart = computeCart(lines, pricingForDisplay, discounts.data ?? [], { now: new Date() });
          state = { mode: 'cart', lines: cart.lines.map((l) => ({ name: l.displayName, quantity: l.quantity, totalMil: l.totalMil })), discountMil: cart.discountMil, totalMil: cart.totalMil };
        } catch {
          state = { mode: 'idle' };
        }
      }
      void posApi.publishDisplay(registerId, state).catch(() => undefined);
    }, 300);
    return () => window.clearTimeout(t);
  }, [lines, registerId, paying]); // eslint-disable-line react-hooks/exhaustive-deps

  const preview = useMemo(() => {
    if (!catalog.data || lines.length === 0) return null;
    try {
      return computeCart(lines, toPricingCatalog(catalog.data), discounts.data ?? [], { now: new Date() });
    } catch {
      return null;
    }
  }, [catalog.data, discounts.data, lines]);

  if (cash.loading || catalog.loading) return <Loading />;

  const session = cash.session;

  const validate = () =>
    run(async () => {
      if (!session) return;
      if (!navigator.onLine) {
        setOfflineSale(true);
        return;
      }
      try {
        const sale = await posApi.counterSale({ sessionId: session.id, serviceType, lines }, saleKey);
        setLines([]);
        setSaleKey(newIdempotencyKey());
        setPaying(sale);
      } catch (err) {
        // No answer from the server: the sale continues offline on this device.
        if (isNetworkError(err)) setOfflineSale(true);
        else throw err;
      }
    });

  const toggleAvailability = (articleId: string, current: string) =>
    run(async () => {
      if (!window.confirm(current === 'available' ? 'Marquer ce produit comme épuisé ?' : 'Remettre ce produit en vente ?')) return;
      await posApi.setArticle(articleId, { availability: current === 'available' ? 'unavailable' : 'available' });
      await catalog.reload();
    });

  return (
    <div className="space-y-4">
      <PageHeader icon={Store} title="Caisse" subtitle="Vente au comptoir, sur place ou à emporter" />
      <ErrorNote message={error ?? cash.error ?? catalog.error} onClose={() => setError(null)} />
      {!session ? (
        <Card title="Ouverture de la caisse">
          <OpenSessionForm registers={cash.registers} registerId={cash.registerId} onChoose={cash.chooseRegister} onOpened={(s) => cash.setSession(s)} />
        </Card>
      ) : (
        <>
          <SessionBar session={session} onChange={(s) => (s ? cash.setSession(s) : void cash.refresh())} />
          <OfflineBanner />
          <PrintStatusBanner />
          <div className="grid lg:grid-cols-[1fr_380px] gap-4 items-start">
            <Card>
              {catalog.data && (
                <ProductGrid
                  catalog={catalog.data}
                  onAdd={(line) => setLines((prev) => addLine(prev, line))}
                  onLongPress={hasPermission('pos:sell') ? (a) => void toggleAvailability(a.id, a.availability) : undefined}
                />
              )}
            </Card>
            <Card className="lg:sticky lg:top-2" title="Vente en cours">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setServiceType('takeaway')} className={cx('min-h-[48px] rounded-xl border text-sm font-semibold flex items-center justify-center gap-2', serviceType === 'takeaway' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200')}>
                  <ShoppingBag size={16} /> À emporter
                </button>
                <button onClick={() => setServiceType('dine_in')} className={cx('min-h-[48px] rounded-xl border text-sm font-semibold flex items-center justify-center gap-2', serviceType === 'dine_in' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200')}>
                  <Utensils size={16} /> Sur place
                </button>
              </div>
              {catalog.data && <CartLines catalog={catalog.data} lines={lines} onChange={setLines} />}
              {preview && (
                <div className="border-t border-gray-100 pt-2 space-y-1 text-sm">
                  {preview.discountMil > 0 && (
                    <p className="flex justify-between text-emerald-700">
                      <span>Réductions</span> <span>−<Money mil={preview.discountMil} /></span>
                    </p>
                  )}
                  <p className="flex justify-between text-lg font-bold">
                    <span>Total</span> <Money mil={preview.totalMil} />
                  </p>
                </div>
              )}
              <Btn variant="primary" size="lg" className="w-full" busy={busy} disabled={lines.length === 0 || !hasPermission('pos:sell')} onClick={validate}>
                Valider et encaisser
              </Btn>
              {lines.length > 0 && (
                <Btn variant="ghost" className="w-full" onClick={() => setLines([])}>
                  Vider la vente
                </Btn>
              )}
              <p className="text-[11px] text-gray-400">Astuce : clic droit (ou appui long) sur un produit pour le marquer épuisé.</p>
            </Card>
          </div>
        </>
      )}
      {offlineSale && session && preview && (
        <OfflineSaleModal
          cart={preview}
          lines={lines}
          serviceType={serviceType}
          sessionId={session.id}
          registerId={session.registerId}
          onClose={() => setOfflineSale(false)}
          onRecorded={() => {
            setOfflineSale(false);
            setLines([]);
            setSaleKey(newIdempotencyKey());
          }}
        />
      )}
      {paying && (
        <PaymentPanel
          sale={paying}
          sessionId={session?.id ?? null}
          registerId={session?.registerId ?? null}
          onClose={() => {
            setPaying(null);
            void cash.refresh();
          }}
        />
      )}
    </div>
  );
};
