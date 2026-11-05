// Training / test environment: fills the point of sale with demonstration data — one account per
// profile, a two-area floor with sections, rewards, an offer, a FAQ, allergens and an equipment —
// so the team can rehearse every workflow (cahier des charges §17.4). Never runs in production.
//
//   npm run seed:pos-demo
//
// Demo accounts log in with their CIN as identifier and "demo1234" as password.

import { randomUUID } from 'node:crypto';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusé : les données de démonstration ne doivent jamais être chargées en production.');
  process.exit(1);
}

const { prepareDatabase } = await import('../app.js');
const { db } = await import('../db/connection.js');
const { hashPassword } = await import('../lib/password.js');
const { newQrToken } = await import('../routes/floor.js');

prepareDatabase();

const FLAG = 'pos_demo_seeded';
if (db.prepare('SELECT 1 FROM pos_settings WHERE key = ?').get(FLAG)) {
  console.log('Les données de démonstration sont déjà chargées.');
  process.exit(0);
}

const now = new Date().toISOString();
const roleId = (name: string) => (db.prepare('SELECT id FROM roles WHERE name = ?').get(name) as { id: string }).id;

db.transaction(() => {
  const accounts: [string, string, string][] = [
    ['Direction Démo', '90000001', 'Direction'],
    ['Gérant Démo', '90000002', 'Gérant'],
    ['Caisse Démo', '90000003', 'Caisse'],
    ['Serveur Un Démo', '90000004', 'Serveur'],
    ['Serveur Deux Démo', '90000005', 'Serveur'],
    ['Cuisine Démo', '90000006', 'Cuisine'],
    ['Bar Démo', '90000007', 'Bar'],
  ];
  const ids: Record<string, string> = {};
  accounts.forEach(([name, cin, role]) => {
    if (db.prepare('SELECT 1 FROM users WHERE cin = ?').get(cin)) return;
    const id = randomUUID();
    ids[name] = id;
    db.prepare('INSERT INTO users (id, full_name, cin, password_hash, must_change_password, role_id, is_active, created_at) VALUES (?, ?, ?, ?, 0, ?, 1, ?)').run(id, name, cin, hashPassword('demo1234'), roleId(role), now);
  });

  const areas = [
    { name: 'Salle', tables: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'] },
    { name: 'Terrasse', tables: ['T7', 'T8', 'T9', 'T10'] },
  ];
  areas.forEach((area, ai) => {
    const areaId = randomUUID();
    db.prepare('INSERT INTO floor_areas (id, name, sort, created_at) VALUES (?, ?, ?, ?)').run(areaId, area.name, ai, now);
    const sectionId = randomUUID();
    db.prepare('INSERT INTO sections (id, name, color, created_at) VALUES (?, ?, ?, ?)').run(sectionId, `Carré ${area.name}`, ai === 0 ? '#10b981' : '#6366f1', now);
    area.tables.forEach((name, i) => {
      const id = randomUUID();
      db.prepare('INSERT INTO dining_tables (id, area_id, name, shape, capacity, x, y, width, height, qr_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        id, areaId, name, i % 3 === 0 ? 'round' : 'square', i % 2 === 0 ? 2 : 4, 40 + (i % 3) * 140, 40 + Math.floor(i / 3) * 140, 90, 90, newQrToken(), now
      );
      db.prepare('INSERT INTO section_tables (table_id, section_id) VALUES (?, ?)').run(id, sectionId);
    });
    const waiter = ai === 0 ? 'Serveur Un Démo' : 'Serveur Deux Démo';
    if (ids[waiter]) {
      db.prepare('INSERT INTO section_assignments (id, section_id, waiter_id, waiter_name, starts_at, assigned_by) VALUES (?, ?, ?, ?, ?, ?)').run(randomUUID(), sectionId, ids[waiter], waiter, now, 'Démo');
    }
  });

  const firstArticle = db.prepare("SELECT id FROM catalog_articles WHERE name = 'Express / Espresso'").get() as { id: string } | undefined;
  db.prepare("INSERT INTO loyalty_rewards (id, name, points_cost, kind, value, article_id, active, created_by, created_at) VALUES (?, 'Express offert', 50, 'product', 0, ?, 1, 'Démo', ?)").run(randomUUID(), firstArticle?.id ?? null, now);
  db.prepare("INSERT INTO loyalty_rewards (id, name, points_cost, kind, value, active, created_by, created_at) VALUES (?, '5 DT offerts', 100, 'fixed', 5000, 1, 'Démo', ?)").run(randomUUID(), now);
  db.prepare(
    `INSERT INTO discounts (id, name, kind, value, scope, categories, weekdays, start_time, end_time, stackable, active, created_by, created_at)
     VALUES (?, 'Happy hour boissons glacées', 'percent', 2000, 'items', '["Boisson glacée"]', '[1,2,3,4,5]', '15:00', '17:00', 0, 1, 'Démo', ?)`
  ).run(randomUUID(), now);
  db.prepare("INSERT INTO faq_entries (id, question, answer, sort, published, updated_by, updated_at) VALUES (?, 'Proposez-vous du lait végétal ?', 'Oui : lait d''avoine et lait d''amande, en supplément.', 0, 1, 'Démo', ?)").run(randomUUID(), now);
  db.prepare("INSERT INTO equipment (id, name, category, in_service_date, value_mil, residual_mil, duration_months, status, created_by, created_at) VALUES (?, 'Machine espresso (démo)', 'Machines', '2026-01-01', 6000000, 0, 60, 'active', 'Démo', ?)").run(randomUUID(), now);
  // A customer account to try the QR page, the customer space, loyalty and bookings.
  if (!db.prepare("SELECT 1 FROM customers WHERE email = 'client.demo@cafenoir.tn'").get()) {
    const customerId = randomUUID();
    db.prepare(
      `INSERT INTO customers (id, first_name, last_name, email, phone, password_hash, status, created_at, updated_at)
       VALUES (?, 'Client', 'Démo', 'client.demo@cafenoir.tn', '22000000', ?, 'active', ?, ?)`
    ).run(customerId, hashPassword('demo1234'), now, now);
    db.prepare("INSERT INTO loyalty_ledger (id, customer_id, type, points, reason, created_by, created_at) VALUES (?, ?, 'adjust', 120, 'Points de démonstration', 'Démo', ?)").run(randomUUID(), customerId, now);
  }

  // Address printed in the table QR codes (e.g. PUBLIC_APP_URL=https://testv2.cafenoir.tn).
  if (process.env.PUBLIC_APP_URL) {
    db.prepare(
      `INSERT INTO pos_settings (key, value, updated_at, updated_by) VALUES ('public_app_url', ?, ?, 'Démo')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(process.env.PUBLIC_APP_URL.replace(/\/$/, ''), now);
  }

  db.prepare('INSERT INTO pos_settings (key, value, updated_at) VALUES (?, ?, ?)').run(FLAG, '1', now);
})();

console.log('Données de démonstration chargées. Comptes : CIN 90000001 à 90000007, mot de passe « demo1234 ». Client : client.demo@cafenoir.tn / demo1234.');
