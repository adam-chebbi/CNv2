import { db } from '../db/connection.js';
import { DEFAULT_GEOMETRY, type ElementKind } from '../../src/data/floorScene.js';

// Floor designer read model: area geometry and decor elements, shared by the service plan
// (GET /api/pos/floor) and the designer routes.

export interface AreaRow {
  id: string;
  name: string;
  sort: number;
  width_cm: number | null;
  depth_cm: number | null;
  floor_material: string;
  wall_color: string;
  wall_height_cm: number;
  background_asset_id: string | null;
  background_opacity: number;
  background_scale: number;
  background_x: number;
  background_y: number;
}

export interface ElementRow {
  id: string;
  area_id: string;
  kind: ElementKind;
  label: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  elevation_cm: number;
  color: string | null;
  material: string | null;
  asset_id: string | null;
}

export const serializeArea = (a: AreaRow) => ({
  id: a.id,
  name: a.name,
  sort: a.sort,
  geometry: {
    widthCm: a.width_cm ?? DEFAULT_GEOMETRY.widthCm,
    depthCm: a.depth_cm ?? DEFAULT_GEOMETRY.depthCm,
    floorMaterial: a.floor_material,
    wallColor: a.wall_color,
    wallHeightCm: a.wall_height_cm,
    backgroundAssetId: a.background_asset_id,
    backgroundOpacity: a.background_opacity,
    backgroundScale: a.background_scale,
    backgroundX: a.background_x,
    backgroundY: a.background_y,
  },
});

export const serializeElement = (e: ElementRow) => ({
  id: e.id,
  areaId: e.area_id,
  kind: e.kind,
  label: e.label,
  x: e.x,
  y: e.y,
  width: e.width,
  height: e.height,
  rotation: e.rotation,
  elevationCm: e.elevation_cm,
  color: e.color,
  material: e.material,
  assetId: e.asset_id,
});

export const listElements = (areaId?: string) =>
  (
    (areaId
      ? db.prepare('SELECT * FROM floor_elements WHERE area_id = ? AND archived_at IS NULL ORDER BY created_at').all(areaId)
      : db.prepare('SELECT * FROM floor_elements WHERE archived_at IS NULL ORDER BY created_at').all()) as ElementRow[]
  ).map(serializeElement);
