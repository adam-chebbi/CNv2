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
  // Café identity printed on customer tickets (never a Wi-Fi password).
  legalName: string;
  address: string;
  phone: string;
  website: string;
  taxId: string; // matricule fiscal
  tradeRegister: string; // registre de commerce
  receiptThanks: string;
  openingHoursText: string;
  // Caisse behaviour
  autoPrintReceipt: boolean; // print the ticket as soon as a sale is paid
  releaseTableAfterPayment: boolean; // free the table once its bill is fully paid
  returnToPlanAfterSend: boolean; // back to the floor plan after "Envoyer en préparation"
  counterNextSaleSeconds: number; // comptoir: new sale opens by itself after the success screen (0 = never)
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
  legalName: 'Café Noir',
  address: 'Menzah 9 — Tunis',
  phone: '',
  website: '',
  taxId: '',
  tradeRegister: '',
  receiptThanks: 'Merci et à bientôt !',
  openingHoursText: '',
  autoPrintReceipt: false,
  releaseTableAfterPayment: false,
  returnToPlanAfterSend: true,
  counterNextSaleSeconds: 4,
};
