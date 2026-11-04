import { Router } from 'express';
import { db } from '../db/connection.js';
import { fromJson } from '../db/json.js';
import { asyncHandler } from '../middleware/errors.js';
import { requireAnyPermission, requireAuth } from '../middleware/auth.js';
import { readPosSettings } from './posCatalog.js';
import { loadPricingCatalog } from '../lib/posCatalog.js';
import { BAR_ROLE_NAME, CAISSE_ROLE_NAME, CUISINE_ROLE_NAME, DIRECTION_ROLE_NAME, GERANT_ROLE_NAME, SERVEUR_ROLE_NAME } from '../../src/data/rbacModel.js';

// Mise en service (cahier des charges §17.1, §20.3): what is configured and what is still missing
// before going live, computed from the actual data — never a manual checklist that drifts.

export const setupStatusRouter = Router();
setupStatusRouter.use(requireAuth);

type Status = 'ok' | 'todo' | 'check';

interface Item {
  id: string;
  label: string;
  status: Status;
  detail: string;
  screen?: string; // where to fix it
  list?: string[];
}

const n = (sql: string, ...args: unknown[]): number => (db.prepare(sql).get(...args) as { n: number }).n;

export const computeSetupStatus = (): Item[] => {
  const settings = readPosSettings();
  const items: Item[] = [];

  const profiles = [DIRECTION_ROLE_NAME, GERANT_ROLE_NAME, CAISSE_ROLE_NAME, SERVEUR_ROLE_NAME, CUISINE_ROLE_NAME, BAR_ROLE_NAME];
  const perProfile = profiles.map((p) => ({ p, count: n('SELECT COUNT(*) AS n FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = ? AND u.is_active = 1', p) }));
  const missing = perProfile.filter((x) => x.count === 0 && [CAISSE_ROLE_NAME, SERVEUR_ROLE_NAME].includes(x.p));
  items.push({
    id: 'accounts',
    label: 'Comptes et profils',
    status: missing.length ? 'todo' : 'ok',
    detail: perProfile.map((x) => `${x.p} : ${x.count}`).join(' · '),
    screen: 'Rôles & permissions / Employés',
  });

  items.push({ id: 'registers', label: 'Caisse', status: n('SELECT COUNT(*) AS n FROM cash_registers WHERE active = 1') ? 'ok' : 'todo', detail: `${n('SELECT COUNT(*) AS n FROM cash_registers WHERE active = 1')} poste(s), remise manuelle plafonnée à ${settings.manualDiscountMaxPercent} %`, screen: 'Paramètres caisse' });

  const tables = n('SELECT COUNT(*) AS n FROM dining_tables WHERE archived_at IS NULL');
  items.push({ id: 'floor', label: 'Plan de salle', status: tables ? 'ok' : 'todo', detail: `${n('SELECT COUNT(*) AS n FROM floor_areas WHERE archived_at IS NULL')} espace(s), ${tables} table(s)`, screen: 'Plan de salle & QR codes' });

  const sections = db
    .prepare(
      `SELECT s.name, sa.waiter_name FROM sections s LEFT JOIN section_assignments sa ON sa.section_id = s.id AND sa.ends_at IS NULL WHERE s.archived_at IS NULL`
    )
    .all() as { name: string; waiter_name: string | null }[];
  const unassignedTables = (db
    .prepare('SELECT t.name FROM dining_tables t LEFT JOIN section_tables st ON st.table_id = t.id WHERE t.archived_at IS NULL AND st.section_id IS NULL ORDER BY t.name')
    .all() as { name: string }[]).map((r) => r.name);
  items.push({
    id: 'sections',
    label: 'Carrés et affectations',
    status: sections.length === 0 || unassignedTables.length > 0 || sections.some((s) => !s.waiter_name) ? 'todo' : 'ok',
    detail: `${sections.length} carré(s), ${sections.filter((s) => !s.waiter_name).length} sans serveur, ${unassignedTables.length} table(s) hors carré`,
    screen: 'Plan de salle & QR codes',
    list: unassignedTables,
  });

  const unchecked = (db.prepare('SELECT name FROM dining_tables WHERE archived_at IS NULL AND qr_checked_at IS NULL ORDER BY name').all() as { name: string }[]).map((r) => r.name);
  items.push({ id: 'qr', label: 'QR codes imprimés et vérifiés', status: tables && unchecked.length === 0 ? 'ok' : 'todo', detail: `${tables - unchecked.length}/${tables} vérifié(s)`, screen: 'Plan de salle & QR codes', list: unchecked });
  items.push({ id: 'public-url', label: "Adresse publique (QR codes)", status: settings.publicAppUrl ? 'ok' : 'todo', detail: settings.publicAppUrl || 'Non renseignée', screen: 'Paramètres caisse' });

  const articles = [...loadPricingCatalog().articles.values()].filter((a) => a.availability !== 'hidden');
  const byDest = { kitchen: 0, bar: 0, none: 0 } as Record<string, number>;
  articles.forEach((a) => (byDest[a.prepDestination] += 1));
  items.push({ id: 'destinations', label: 'Destinations cuisine / bar', status: 'check', detail: `Cuisine ${byDest.kitchen} · Bar ${byDest.bar} · Servi direct ${byDest.none}`, screen: 'Carte & disponibilités' });

  // Products sold without a recipe consume nothing: the theoretical stock would be wrong.
  const recipes = db.prepare("SELECT id, name, recipe FROM catalog_articles WHERE availability != 'hidden'").all() as { id: string; name: string; recipe: string | null }[];
  const withoutRecipe = recipes.filter((r) => fromJson<unknown[]>(r.recipe, []).length === 0).map((r) => r.name);
  items.push({ id: 'recipes', label: 'Fiches techniques (recettes)', status: withoutRecipe.length ? 'todo' : 'ok', detail: `${withoutRecipe.length} produit(s) en vente sans recette`, screen: 'Gestion des produits', list: withoutRecipe });

  const noAllergens = articles.filter((a) => !n('SELECT COUNT(*) AS n FROM product_allergens WHERE article_id = ?', a.id)).map((a) => a.name);
  items.push({ id: 'allergens', label: 'Allergènes', status: noAllergens.length ? 'check' : 'ok', detail: `${noAllergens.length} produit(s) sans information (affichés « demandez à l'équipe »)`, screen: 'Carte & disponibilités', list: noAllergens });

  items.push({ id: 'faq', label: 'FAQ et lien Google', status: n('SELECT COUNT(*) AS n FROM faq_entries WHERE published = 1') && settings.googleReviewUrl ? 'ok' : 'todo', detail: `${n('SELECT COUNT(*) AS n FROM faq_entries WHERE published = 1')} question(s) · lien Google ${settings.googleReviewUrl ? 'renseigné' : 'manquant'}`, screen: 'FAQ & avis clients / Paramètres caisse' });
  items.push({ id: 'reservations', label: 'Réservations', status: 'check', detail: `Ouverture ${settings.openingTime}–${settings.closingTime}, durée ${settings.reservationDurationMinutes} min, groupe max ${settings.reservationMaxPeople}`, screen: 'Paramètres caisse' });
  items.push({ id: 'loyalty', label: 'Fidélité', status: n('SELECT COUNT(*) AS n FROM loyalty_rewards WHERE active = 1') ? 'ok' : 'todo', detail: `${n('SELECT COUNT(*) AS n FROM loyalty_rewards WHERE active = 1')} récompense(s) active(s)`, screen: 'Fidélité' });
  items.push({ id: 'offers', label: 'Prix, remises et cumuls', status: 'check', detail: `${n('SELECT COUNT(*) AS n FROM discounts WHERE active = 1 AND customer_ids IS NULL')} offre(s) active(s)`, screen: 'Réductions & offres' });
  items.push({ id: 'zone', label: 'Zone de consommation', status: 'check', detail: settings.consumptionZone, screen: 'Paramètres caisse' });
  items.push({ id: 'equipment', label: 'Équipements et amortissement', status: n("SELECT COUNT(*) AS n FROM equipment WHERE status = 'active'") ? 'ok' : 'todo', detail: `${n("SELECT COUNT(*) AS n FROM equipment WHERE status = 'active'")} équipement(s)`, screen: 'Machines & amortissement' });

  const lastBackup = (db.prepare("SELECT value FROM pos_settings WHERE key = 'last_backup_at'").get() as { value: string } | undefined)?.value;
  const lastRestoreCheck = (db.prepare("SELECT value FROM pos_settings WHERE key = 'last_restore_check_at'").get() as { value: string } | undefined)?.value;
  items.push({
    id: 'backup',
    label: 'Sauvegarde et test de restauration',
    status: lastBackup && lastRestoreCheck && Date.now() - Date.parse(lastBackup) < 2 * 86_400_000 ? 'ok' : 'todo',
    detail: `Dernière sauvegarde : ${lastBackup ?? 'aucune'} · dernier test de restauration : ${lastRestoreCheck ?? 'aucun'}`,
    screen: 'Serveur (npm run backup / npm run backup:verify)',
  });
  return items;
};

setupStatusRouter.get('/setup-status', requireAnyPermission('pos:settings', 'roles:manage'), asyncHandler((_req, res) => {
  const items = computeSetupStatus();
  res.json({ items, ready: items.every((i) => i.status !== 'todo') });
}));
