// Furnishes the demonstration plan (areas "Salle" and "Terrasse") for the floor designer:
// dimensions, materials, walls, bar, door, windows, decor and tables placed to scale.
// Idempotent: an area that already has decor is left untouched. Run: npm run seed:floor-demo

import { randomUUID } from 'node:crypto';

const { prepareDatabase } = await import('../app.js');
const { db } = await import('../db/connection.js');
prepareDatabase();

type El = [kind: string, label: string | null, x: number, y: number, w: number, h: number, rot: number, elev: number, color: string, material: string | null, asset?: string | null];

const PLANS: Record<string, { geometry: [w: number, d: number, floor: string, wall: string]; elements: El[]; tables: [x: number, y: number, w: number, h: number][] }> = {
  Salle: {
    geometry: [1200, 800, 'parquet', '#efe6da'],
    elements: [
      ['bar', 'Bar', 80, 60, 520, 70, 0, 115, '#3b2a20', 'walnut'],
      ['counter', 'Comptoir', 640, 60, 260, 70, 0, 110, '#5b3a29', 'marble'],
      ['wall', null, 0, 0, 1200, 15, 0, 280, '#d8cfc4', 'brick'],
      ['door', 'Entrée', 980, 785, 120, 15, 0, 210, '#8b5e3c', null],
      ['window', 'Vitrine', 0, 260, 15, 260, 0, 140, '#9fd3e6', null],
      ['window', 'Vitrine', 0, 560, 15, 160, 0, 140, '#9fd3e6', null],
      ['column', null, 590, 400, 40, 40, 0, 280, '#bdb5aa', 'concrete'],
      ['plant', 'Plante', 1110, 60, 60, 60, 0, 130, '#3f7d4e', null],
      ['plant', 'Plante', 40, 710, 50, 50, 0, 110, '#3f7d4e', null],
      ['bench', 'Banquette', 1120, 220, 55, 420, 0, 45, '#7a4b3a', null],
      ['model', 'Fauteuil', 860, 700, 70, 70, 200, 90, '#7a6a8a', null, 'cdn:chair-sheen'],
      ['zone', 'Attente à emporter', 640, 160, 260, 120, 0, 0, '#f3d9a4', null],
    ],
    tables: [
      [140, 330, 90, 90],
      [380, 330, 80, 80],
      [780, 360, 120, 80],
      [140, 560, 90, 90],
      [380, 560, 80, 80],
      [780, 570, 120, 80],
    ],
  },
  Terrasse: {
    geometry: [1000, 600, 'terrace', '#f2ede6'],
    elements: [
      ['zone', 'Parasols', 60, 60, 880, 220, 0, 0, '#f6e7c1', null],
      ['plant', null, 30, 30, 60, 60, 0, 140, '#3f7d4e', null],
      ['plant', null, 910, 30, 60, 60, 0, 140, '#3f7d4e', null],
      ['plant', null, 30, 510, 60, 60, 0, 140, '#3f7d4e', null],
      ['plant', null, 910, 510, 60, 60, 0, 140, '#3f7d4e', null],
      ['model', 'Fleurs', 480, 520, 40, 40, 0, 60, '#c45c8a', null, 'cdn:flower'],
      ['bench', 'Banc', 300, 520, 160, 45, 0, 45, '#8d6a4a', null],
    ],
    tables: [
      [150, 120, 90, 90],
      [420, 120, 80, 80],
      [690, 120, 90, 90],
      [420, 350, 140, 80],
    ],
  },
};

const now = new Date().toISOString();
let done = 0;
db.transaction(() => {
  for (const [name, plan] of Object.entries(PLANS)) {
    const area = db.prepare('SELECT id FROM floor_areas WHERE name = ? AND archived_at IS NULL').get(name) as { id: string } | undefined;
    if (!area || db.prepare('SELECT 1 FROM floor_elements WHERE area_id = ?').get(area.id)) continue;
    const [w, d, floor, wall] = plan.geometry;
    db.prepare('UPDATE floor_areas SET width_cm = ?, depth_cm = ?, floor_material = ?, wall_color = ? WHERE id = ?').run(w, d, floor, wall, area.id);
    const insert = db.prepare(
      `INSERT INTO floor_elements (id, area_id, kind, label, x, y, width, height, rotation, elevation_cm, color, material, asset_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const [kind, label, x, y, ew, eh, rot, elev, color, material, asset] of plan.elements) insert.run(randomUUID(), area.id, kind, label, x, y, ew, eh, rot, elev, color, material, asset ?? null, now, now);
    const tables = db.prepare('SELECT id FROM dining_tables WHERE area_id = ? AND archived_at IS NULL ORDER BY name').all(area.id) as { id: string }[];
    const place = db.prepare("UPDATE dining_tables SET x = ?, y = ?, width = ?, height = ?, shape = CASE WHEN ? > ? THEN 'rect' ELSE shape END WHERE id = ?");
    tables.forEach((t, i) => {
      const p = plan.tables[i];
      if (p) place.run(p[0], p[1], p[2], p[3], p[2], p[3], t.id);
    });
    done += 1;
  }
})();
console.log(done ? `Plan de démonstration meublé (${done} espace(s)).` : 'Rien à faire : les espaces ont déjà un décor.');
