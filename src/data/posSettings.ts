// Point-of-sale settings (Paramètres → Caisse & service). Stored as text in pos_settings; a missing
// key means "use the default below".

export interface PosSettings {
  manualDiscountMaxPercent: number; // ceiling of a manual discount, in % of the ticket
  consumptionZone: 'Réserve principale' | 'Dépôt'; // stock zone that sales consume from
  googleReviewUrl: string;
  reservationDurationMinutes: number;
  reservationMaxPeople: number; // largest group bookable online
  openingTime: string; // HH:MM
  closingTime: string;
  publicAppUrl: string; // base URL printed in table QR codes, e.g. https://system.cafenoir.tn
  idleLogoutMinutes: number; // shared devices: automatic sign-out after inactivity (0 = never)
}

export const POS_SETTING_DEFAULTS: PosSettings = {
  manualDiscountMaxPercent: 20,
  consumptionZone: 'Réserve principale',
  googleReviewUrl: '',
  reservationDurationMinutes: 90,
  reservationMaxPeople: 12,
  openingTime: '07:00',
  closingTime: '23:00',
  publicAppUrl: '',
  idleLogoutMinutes: 0,
};
