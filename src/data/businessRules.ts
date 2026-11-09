// Operating rules the Direction changes without code ("Additional requirements & business rules",
// configuration engine). Each rule has a French label, a description, a default, the impact shown
// before saving, and who may change it. Only rules the application actually applies are listed:
// a setting that does nothing is not shipped.

export type RuleType = 'toggle' | 'number';

export interface RuleDef {
  key: string;
  module: string;
  label: string;
  description: string;
  type: RuleType;
  default: number | boolean;
  min?: number;
  max?: number;
  unit?: string;
  impact: string;
  // Changed with pos:settings (Direction); rules marked `service` may also be changed by people
  // holding rules:service (the Gérant's limited list).
  service?: boolean;
}

export const BUSINESS_RULES: RuleDef[] = [
  {
    key: 'qr_ordering',
    module: 'Commandes QR',
    label: 'Commande depuis le téléphone',
    description: 'Les clients peuvent envoyer une commande depuis le QR code de leur table. Le bouton « Appeler un serveur » reste toujours disponible.',
    type: 'toggle',
    default: true,
    impact: 'Désactivé : le menu reste consultable, mais aucune nouvelle commande ne peut être envoyée par téléphone.',
    service: true,
  },
  {
    key: 'qr_add_after_order',
    module: 'Commandes QR',
    label: 'Ajouter des articles après une commande',
    description: 'Une table peut envoyer une nouvelle commande après sa première commande.',
    type: 'toggle',
    default: true,
    impact: 'Désactivé : après une première commande, les ajouts passent par un serveur.',
    service: true,
  },
  {
    key: 'qr_max_pending',
    module: 'Commandes QR',
    label: 'Demandes QR en attente par table',
    description: 'Nombre maximum de commandes QR en attente de validation pour une même table.',
    type: 'number',
    default: 3,
    min: 1,
    max: 20,
    unit: 'commandes',
    impact: 'Au-delà, le client voit « Veuillez patienter, l’équipe arrive ».',
    service: true,
  },
  {
    key: 'qr_bill',
    module: 'Commandes QR',
    label: 'Demander l’addition depuis le téléphone',
    description: 'Le client peut prévenir l’équipe qu’il souhaite régler.',
    type: 'toggle',
    default: true,
    impact: 'Désactivé : le client voit son addition mais demande le règlement à un serveur.',
    service: true,
  },
  {
    key: 'qr_feedback',
    module: 'Commandes QR',
    label: 'Avis client depuis le téléphone',
    description: 'Le client peut laisser une note et un commentaire privés à Café Noir.',
    type: 'toggle',
    default: true,
    impact: 'Désactivé : seul le lien vers les avis Google reste proposé.',
    service: true,
  },
  {
    key: 'prep_late_bar',
    module: 'Préparation',
    label: 'Commande en retard au bar après',
    description: 'Pour les articles sans délai propre : délai après lequel une commande du bar passe en rouge (orange à mi-délai).',
    type: 'number',
    default: 10,
    min: 2,
    max: 120,
    unit: 'min',
    impact: 'Change la couleur des cartes sur l’écran bar pour les commandes en cours et à venir.',
  },
  {
    key: 'prep_late_kitchen',
    module: 'Préparation',
    label: 'Commande en retard en cuisine après',
    description: 'Pour les articles sans délai propre : délai après lequel une commande de la cuisine passe en rouge (orange à mi-délai).',
    type: 'number',
    default: 20,
    min: 2,
    max: 180,
    unit: 'min',
    impact: 'Change la couleur des cartes sur l’écran cuisine pour les commandes en cours et à venir.',
  },
];

export type RuleValues = Record<string, number | boolean>;

export const RULE_DEFAULTS: RuleValues = Object.fromEntries(BUSINESS_RULES.map((r) => [r.key, r.default]));

export const parseRuleValue = (def: RuleDef, raw: string | null | undefined): number | boolean => {
  if (raw === null || raw === undefined) return def.default;
  if (def.type === 'toggle') return raw === '1';
  const n = Number(raw);
  return Number.isFinite(n) ? n : def.default;
};

export const serializeRuleValue = (def: RuleDef, value: number | boolean): string => (def.type === 'toggle' ? (value ? '1' : '0') : String(value));

export const validateRuleValue = (def: RuleDef, value: unknown): string | null => {
  if (def.type === 'toggle') return typeof value === 'boolean' ? null : 'Valeur attendue : oui ou non.';
  if (typeof value !== 'number' || !Number.isInteger(value)) return 'Valeur attendue : un nombre entier.';
  if (def.min !== undefined && value < def.min) return `Minimum : ${def.min}.`;
  if (def.max !== undefined && value > def.max) return `Maximum : ${def.max}.`;
  return null;
};
