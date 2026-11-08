import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { asyncHandler, ApiError, notFound } from '../middleware/errors.js';
import { requireAnyPermission, requireAuth, requirePermission } from '../middleware/auth.js';
import { recordActivity } from '../lib/activity.js';
import { emitPosEvent } from '../lib/events.js';
import { listElements, serializeArea, type AreaRow } from '../lib/floorDesign.js';
import { ELEMENT_KINDS, layoutWarnings } from '../../src/data/floorScene.js';

// Floor designer (amélioration 01): a small CMS for the café plan. Architecture and decor are
// edited by `floor:manage`; the texture / 3D model library by `floor:assets`; everyone who sees
// the plan can read it. Each save is one transaction and one journal entry.

export const floorDesignRouter = Router();
floorDesignRouter.use(requireAuth);

const VIEW = ['floor:view', 'floor:manage', 'floor:assets', 'pos:sell'];
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const cm = (max: number) => z.number().int().min(0).max(max);

const geometrySchema = z.object({
  widthCm: z.number().int().min(200).max(5000),
  depthCm: z.number().int().min(200).max(5000),
  floorMaterial: z.string().min(1).max(80),
  wallColor: hex,
  wallHeightCm: z.number().int().min(150).max(800),
  backgroundAssetId: z.string().nullable(),
  backgroundOpacity: z.number().min(0).max(1),
  backgroundScale: z.number().positive().max(100),
  backgroundX: z.number().int().min(-5000).max(5000),
  backgroundY: z.number().int().min(-5000).max(5000),
});

const elementSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(ELEMENT_KINDS as [string, ...string[]]),
  label: z.string().trim().max(60).nullable(),
  x: cm(5000),
  y: cm(5000),
  width: z.number().int().min(5).max(5000),
  height: z.number().int().min(5).max(5000),
  rotation: z.number().int().min(0).max(359),
  elevationCm: cm(800),
  color: hex.nullable(),
  material: z.string().max(80).nullable(),
  assetId: z.string().max(80).nullable(),
});

const tablePlacementSchema = z.object({
  id: z.string(),
  x: cm(5000),
  y: cm(5000),
  width: z.number().int().min(30).max(600),
  height: z.number().int().min(30).max(600),
  rotation: z.number().int().min(0).max(359),
  shape: z.enum(['round', 'square', 'rect']),
  chairs: z.number().int().min(0).max(16).nullable(),
  material: z.string().max(80).nullable(),
});

const designSchema = z.object({
  geometry: geometrySchema,
  elements: z.array(elementSchema).max(500),
  tables: z.array(tablePlacementSchema).max(300),
  allowOverlap: z.boolean().optional(),
});
type Design = z.infer<typeof designSchema>;

const getArea = (id: string): AreaRow => {
  const a = db.prepare('SELECT * FROM floor_areas WHERE id = ? AND archived_at IS NULL').get(id) as AreaRow | undefined;
  if (!a) throw notFound('Espace');
  return a;
};

const assertAsset = (id: string | null): void => {
  if (id && !id.startsWith('cdn:') && !db.prepare('SELECT 1 FROM floor_assets WHERE id = ? AND archived_at IS NULL').get(id)) throw new ApiError(400, 'Élément de bibliothèque introuvable.');
};

// Writes a whole area design: geometry, decor (missing elements are archived) and table placement.
const writeDesign = (areaId: string, body: Design): void => {
  const g = body.geometry;
  assertAsset(g.backgroundAssetId);
  body.elements.forEach((e) => assertAsset(e.assetId));
  db.prepare(
    `UPDATE floor_areas SET width_cm = ?, depth_cm = ?, floor_material = ?, wall_color = ?, wall_height_cm = ?, background_asset_id = ?,
       background_opacity = ?, background_scale = ?, background_x = ?, background_y = ? WHERE id = ?`
  ).run(g.widthCm, g.depthCm, g.floorMaterial, g.wallColor, g.wallHeightCm, g.backgroundAssetId, g.backgroundOpacity, g.backgroundScale, g.backgroundX, g.backgroundY, areaId);

  const now = new Date().toISOString();
  const existing = new Map((db.prepare('SELECT id, area_id FROM floor_elements').all() as { id: string; area_id: string }[]).map((r) => [r.id, r.area_id]));
  const update = db.prepare(
    `UPDATE floor_elements SET kind=?, label=?, x=?, y=?, width=?, height=?, rotation=?, elevation_cm=?, color=?, material=?, asset_id=?, archived_at=NULL, updated_at=? WHERE id=?`
  );
  const insert = db.prepare(
    `INSERT INTO floor_elements (id, area_id, kind, label, x, y, width, height, rotation, elevation_cm, color, material, asset_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const e of body.elements) {
    const owner = existing.get(e.id);
    if (owner && owner !== areaId) throw new ApiError(409, 'Un élément appartient à un autre espace.');
    const values = [e.kind, e.label, e.x, e.y, e.width, e.height, e.rotation, e.elevationCm, e.color, e.material, e.assetId] as const;
    if (owner) update.run(...values, now, e.id);
    else insert.run(e.id, areaId, ...values, now, now);
  }
  const kept = new Set(body.elements.map((e) => e.id));
  const archive = db.prepare('UPDATE floor_elements SET archived_at = ? WHERE id = ?');
  (db.prepare('SELECT id FROM floor_elements WHERE area_id = ? AND archived_at IS NULL').all(areaId) as { id: string }[]).filter((r) => !kept.has(r.id)).forEach((r) => archive.run(now, r.id));

  const areaTables = new Set((db.prepare('SELECT id FROM dining_tables WHERE area_id = ? AND archived_at IS NULL').all(areaId) as { id: string }[]).map((r) => r.id));
  const place = db.prepare('UPDATE dining_tables SET x=?, y=?, width=?, height=?, rotation=?, shape=?, chairs=?, material=? WHERE id=?');
  for (const t of body.tables) {
    if (!areaTables.has(t.id)) throw new ApiError(400, 'Une table ne fait pas partie de cet espace.');
    place.run(t.x, t.y, t.width, t.height, t.rotation, t.shape, t.chairs, t.material, t.id);
  }
};

floorDesignRouter.put('/floor/areas/:id/design', requirePermission('floor:manage'), asyncHandler((req, res) => {
  const body = designSchema.parse(req.body);
  const area = getArea(req.params.id);
  if (!body.allowOverlap) {
    const names = new Map((db.prepare('SELECT id, name FROM dining_tables WHERE area_id = ?').all(area.id) as { id: string; name: string }[]).map((r) => [r.id, r.name]));
    const clash = layoutWarnings(body.tables.map((t) => ({ ...t, name: names.get(t.id) ?? '?' }))).find((w) => w.kind === 'overlap');
    if (clash) throw new ApiError(409, `Les tables ${clash.a} et ${clash.b} se chevauchent.`);
  }
  db.transaction(() => {
    writeDesign(area.id, body);
    recordActivity('Salle', 'Plan modifié', `${area.name} : ${body.elements.length} éléments, ${body.tables.length} tables`, req.user!.fullName, {
      userId: req.user!.id,
      entityType: 'floor_area',
      entityId: area.id,
      after: { geometry: body.geometry, elements: body.elements.length, tables: body.tables.length },
    });
  })();
  emitPosEvent({ type: 'floor.changed' });
  res.json({ area: serializeArea(getArea(area.id)), elements: listElements(area.id) });
}));

// --- Asset library ---------------------------------------------------------------------------------

interface AssetRow {
  id: string;
  kind: 'texture' | 'model' | 'background';
  name: string;
  url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  tile_cm: number | null;
  created_by: string;
  created_at: string;
}
const serializeAsset = (a: AssetRow) => ({
  id: a.id,
  kind: a.kind,
  name: a.name,
  url: a.url ?? `/api/pos/floor/assets/${a.id}/file`,
  source: a.url ? 'cdn' : 'upload',
  mimeType: a.mime_type,
  sizeBytes: a.size_bytes,
  tileCm: a.tile_cm,
  createdBy: a.created_by,
  createdAt: a.created_at,
});

const LIMITS: Record<AssetRow['kind'], { mimes: string[]; maxBytes: number }> = {
  texture: { mimes: ['image/png', 'image/jpeg', 'image/webp'], maxBytes: 5 * 1024 * 1024 },
  background: { mimes: ['image/png', 'image/jpeg', 'image/webp'], maxBytes: 5 * 1024 * 1024 },
  model: { mimes: ['model/gltf-binary', 'application/octet-stream'], maxBytes: 10 * 1024 * 1024 },
};

floorDesignRouter.get('/floor/assets', requireAnyPermission(...VIEW), asyncHandler((_req, res) => {
  const rows = db.prepare('SELECT id, kind, name, url, mime_type, size_bytes, tile_cm, created_by, created_at FROM floor_assets WHERE archived_at IS NULL ORDER BY created_at DESC').all() as AssetRow[];
  res.json(rows.map(serializeAsset));
}));

floorDesignRouter.post('/floor/assets', requireAnyPermission('floor:assets', 'floor:manage'), asyncHandler((req, res) => {
  const body = z
    .object({
      kind: z.enum(['texture', 'model', 'background']),
      name: z.string().trim().min(1).max(80),
      url: z.string().url().startsWith('https://').max(500).optional(),
      dataUrl: z.string().max(15 * 1024 * 1024).optional(),
      tileCm: z.number().int().min(10).max(1000).optional(),
    })
    .refine((b) => Boolean(b.url) !== Boolean(b.dataUrl), 'Donnez un lien CDN ou un fichier.')
    .parse(req.body);
  const user = req.user!;
  // Backgrounds belong to the plan (floor:manage); textures and models to the library (floor:assets).
  const allowed = user.isSuperAdmin || user.permissions.includes(body.kind === 'background' ? 'floor:manage' : 'floor:assets') || user.permissions.includes('floor:assets');
  if (!allowed) throw new ApiError(403, 'Accès refusé.');
  let data: Buffer | null = null;
  let mime: string | null = null;
  if (body.dataUrl) {
    const m = /^data:([\w/+.-]+);base64,(.+)$/s.exec(body.dataUrl);
    if (!m) throw new ApiError(400, 'Fichier illisible.');
    mime = m[1];
    data = Buffer.from(m[2], 'base64');
    const limit = LIMITS[body.kind];
    if (!limit.mimes.includes(mime)) throw new ApiError(400, body.kind === 'model' ? 'Modèle 3D attendu au format .glb.' : 'Image PNG, JPEG ou WebP attendue.');
    if (body.kind === 'model' && data.subarray(0, 4).toString('latin1') !== 'glTF') throw new ApiError(400, 'Fichier .glb invalide.');
    if (data.length > limit.maxBytes) throw new ApiError(413, `Fichier trop lourd (max ${limit.maxBytes / 1024 / 1024} Mo).`);
  }
  const id = randomUUID();
  db.prepare('INSERT INTO floor_assets (id, kind, name, url, mime_type, size_bytes, data, tile_cm, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    id,
    body.kind,
    body.name,
    body.url ?? null,
    mime,
    data?.length ?? null,
    data,
    body.tileCm ?? null,
    user.fullName,
    new Date().toISOString()
  );
  recordActivity('Salle', 'Bibliothèque : ajout', `${body.kind} « ${body.name} »`, user.fullName, { userId: user.id, entityType: 'floor_asset', entityId: id });
  res.status(201).json(serializeAsset(db.prepare('SELECT * FROM floor_assets WHERE id = ?').get(id) as AssetRow));
}));

floorDesignRouter.post('/floor/assets/:id/archive', requirePermission('floor:assets'), asyncHandler((req, res) => {
  const a = db.prepare('SELECT id, name FROM floor_assets WHERE id = ? AND archived_at IS NULL').get(req.params.id) as { id: string; name: string } | undefined;
  if (!a) throw notFound('Élément');
  db.prepare('UPDATE floor_assets SET archived_at = ? WHERE id = ?').run(new Date().toISOString(), a.id);
  recordActivity('Salle', 'Bibliothèque : retrait', a.name, req.user!.fullName, { userId: req.user!.id, entityType: 'floor_asset', entityId: a.id });
  res.json({ ok: true });
}));

// Uploaded files never change for a given id, so browsers may keep them.
floorDesignRouter.get('/floor/assets/:id/file', requireAnyPermission(...VIEW), asyncHandler((req, res) => {
  const a = db.prepare('SELECT mime_type, data, url FROM floor_assets WHERE id = ?').get(req.params.id) as { mime_type: string | null; data: Buffer | null; url: string | null } | undefined;
  if (!a) throw notFound('Fichier');
  if (!a.data) return res.redirect(a.url!);
  res.setHeader('Content-Type', a.mime_type ?? 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(a.data);
}));

// --- Plan versions -----------------------------------------------------------------------------------

const snapshot = () => ({
  areas: (db.prepare('SELECT * FROM floor_areas WHERE archived_at IS NULL').all() as AreaRow[]).map((a) => ({
    id: a.id,
    geometry: serializeArea(a).geometry,
    elements: listElements(a.id),
    tables: db.prepare('SELECT id, x, y, width, height, rotation, shape, chairs, material FROM dining_tables WHERE area_id = ? AND archived_at IS NULL').all(a.id) as Design['tables'],
  })),
});

floorDesignRouter.get('/floor/versions', requirePermission('floor:manage'), asyncHandler((_req, res) => {
  res.json(db.prepare('SELECT id, name, created_by AS createdBy, created_at AS createdAt, applied_at AS appliedAt FROM floor_versions ORDER BY created_at DESC').all());
}));

floorDesignRouter.post('/floor/versions', requirePermission('floor:manage'), asyncHandler((req, res) => {
  const { name } = z.object({ name: z.string().trim().min(1).max(60) }).parse(req.body);
  const id = randomUUID();
  db.prepare('INSERT INTO floor_versions (id, name, snapshot, created_by, created_at) VALUES (?, ?, ?, ?, ?)').run(id, name, JSON.stringify(snapshot()), req.user!.fullName, new Date().toISOString());
  recordActivity('Salle', 'Version du plan enregistrée', name, req.user!.fullName, { userId: req.user!.id, entityType: 'floor_version', entityId: id });
  res.status(201).json({ id, name });
}));

// Re-applies a saved version. Refused during service so no seated table moves under a waiter.
floorDesignRouter.post('/floor/versions/:id/apply', requirePermission('floor:manage'), asyncHandler((req, res) => {
  const v = db.prepare('SELECT id, name, snapshot FROM floor_versions WHERE id = ?').get(req.params.id) as { id: string; name: string; snapshot: string } | undefined;
  if (!v) throw notFound('Version');
  if (db.prepare("SELECT 1 FROM visits WHERE status = 'open' LIMIT 1").get()) throw new ApiError(409, 'Des tables sont occupées : appliquez la version hors service.');
  const snap = JSON.parse(v.snapshot) as ReturnType<typeof snapshot>;
  db.transaction(() => {
    for (const a of snap.areas) {
      if (!db.prepare('SELECT 1 FROM floor_areas WHERE id = ? AND archived_at IS NULL').get(a.id)) continue;
      const liveTables = new Set((db.prepare('SELECT id FROM dining_tables WHERE area_id = ? AND archived_at IS NULL').all(a.id) as { id: string }[]).map((r) => r.id));
      writeDesign(a.id, designSchema.parse({ geometry: a.geometry, elements: a.elements, tables: a.tables.filter((t) => liveTables.has(t.id)) }));
    }
    db.prepare('UPDATE floor_versions SET applied_at = ? WHERE id = ?').run(new Date().toISOString(), v.id);
    recordActivity('Salle', 'Version du plan appliquée', v.name, req.user!.fullName, { userId: req.user!.id, entityType: 'floor_version', entityId: v.id });
  })();
  emitPosEvent({ type: 'floor.changed' });
  res.json({ ok: true });
}));
