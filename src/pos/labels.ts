import type { PrepStatus } from './api';

export const PREP_LABELS: Record<PrepStatus, string> = {
  none: 'Servi direct',
  to_prepare: 'À préparer',
  in_progress: 'En préparation',
  ready: 'Prête',
  served: 'Servie',
};

export const PREP_TONES: Record<PrepStatus, 'gray' | 'amber' | 'blue' | 'green' | 'violet'> = {
  none: 'gray',
  to_prepare: 'amber',
  in_progress: 'blue',
  ready: 'green',
  served: 'gray',
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending_validation: 'En attente de validation',
  awaiting_customer: 'En attente du client',
  validated: 'Validée',
  rejected: 'Refusée',
  cancelled: 'Annulée',
};

export const RESERVATION_LABELS: Record<string, string> = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  rejected: 'Refusée',
  cancelled: 'Annulée',
  arrived: 'Client arrivé',
  no_show: 'Non présenté',
  completed: 'Terminée',
};

export const TREATMENT_LABELS: Record<string, string> = {
  restored: 'Remis en stock',
  loss: 'Perte',
  offered: 'Produit offert',
  prep_error: 'Erreur de préparation',
  other: 'Autre',
  none: 'Aucun',
};
