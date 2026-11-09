import React, { useEffect, useState } from 'react';
import { Settings2, Check } from 'lucide-react';
import type { PosSettings } from '../data/posSettings';
import { posApi } from './api';
import { DisplayLinks } from './DisplayLinks';
import { Btn, Card, ErrorNote, Field, inputCls, Loading, PageHeader, useAction, useLoader } from './ui';

// Paramètres de la caisse et du service (cahier des charges §17.1, §20.3).

export const PosSettingsPage: React.FC = () => {
  const loaded = useLoader(() => posApi.settings(), []);
  const [s, setS] = useState<PosSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  useEffect(() => {
    if (loaded.data && !s) setS(loaded.data);
  }, [loaded.data, s]);
  if (!s) return loaded.error ? <ErrorNote message={loaded.error} /> : <Loading />;
  const set = (patch: Partial<PosSettings>) => {
    setSaved(false);
    setS({ ...s, ...patch });
  };
  return (
    <div className="space-y-4">
      <PageHeader
        icon={Settings2}
        title="Paramètres caisse & service"
        actions={<Btn variant="primary" busy={busy} onClick={() => run(async () => { setS(await posApi.saveSettings(s)); setSaved(true); })}>{saved ? <><Check size={14} /> Enregistré</> : 'Enregistrer'}</Btn>}
      />
      <ErrorNote message={error} />
      <Card title="Caisse">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Plafond d'une remise manuelle (% du ticket)">
            <input className={inputCls} inputMode="numeric" value={s.manualDiscountMaxPercent} onChange={(e) => set({ manualDiscountMaxPercent: Math.min(100, Number(e.target.value.replace(/\D/g, '')) || 0) })} />
          </Field>
          <Field label="Déconnexion automatique après inactivité (minutes, 0 = jamais)" hint="Recommandé sur les postes partagés (caisse, tablettes).">
            <input className={inputCls} inputMode="numeric" value={s.idleLogoutMinutes} onChange={(e) => set({ idleLogoutMinutes: Math.min(720, Number(e.target.value.replace(/\D/g, '')) || 0) })} />
          </Field>
          <Field label="Zone de stock consommée par les ventes">
            <select className={inputCls} value={s.consumptionZone} onChange={(e) => set({ consumptionZone: e.target.value as PosSettings['consumptionZone'] })}>
              <option>Réserve principale</option>
              <option>Dépôt</option>
            </select>
          </Field>
        </div>
      </Card>
      <Card title="Clients & QR codes">
        <Field label="Adresse publique de l'application" hint="Imprimée dans les QR codes des tables, ex. https://system.cafenoir.tn. Laisser vide pour utiliser l'adresse actuelle.">
          <input className={inputCls} value={s.publicAppUrl} onChange={(e) => set({ publicAppUrl: e.target.value.trim() })} />
        </Field>
        <Field label="Lien de la page d'avis Google">
          <input className={inputCls} value={s.googleReviewUrl} onChange={(e) => set({ googleReviewUrl: e.target.value.trim() })} placeholder="https://g.page/r/…/review" />
        </Field>
      </Card>
      <DisplayLinks />
      <Card title="Réservations">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Ouverture"><input type="time" className={inputCls} value={s.openingTime} onChange={(e) => set({ openingTime: e.target.value })} /></Field>
          <Field label="Fermeture"><input type="time" className={inputCls} value={s.closingTime} onChange={(e) => set({ closingTime: e.target.value })} /></Field>
          <Field label="Durée d'une réservation (minutes)"><input className={inputCls} inputMode="numeric" value={s.reservationDurationMinutes} onChange={(e) => set({ reservationDurationMinutes: Number(e.target.value.replace(/\D/g, '')) || 15 })} /></Field>
          <Field label="Groupe maximum réservable en ligne"><input className={inputCls} inputMode="numeric" value={s.reservationMaxPeople} onChange={(e) => set({ reservationMaxPeople: Number(e.target.value.replace(/\D/g, '')) || 1 })} /></Field>
        </div>
      </Card>
    </div>
  );
};
