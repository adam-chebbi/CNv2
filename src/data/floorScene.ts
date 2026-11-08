// Floor plan scene model shared by the 2D plan, the 3D view, the designer and the server.
// Pure functions, no DOM. Every distance is in centimetres (1 plan unit = 1 cm).

export type ElementKind = 'wall' | 'door' | 'window' | 'counter' | 'bar' | 'column' | 'bench' | 'plant' | 'stairs' | 'zone' | 'decor' | 'model';
export const ELEMENT_KINDS: ElementKind[] = ['wall', 'door', 'window', 'counter', 'bar', 'column', 'bench', 'plant', 'stairs', 'zone', 'decor', 'model'];

export interface AreaGeometry {
  widthCm: number;
  depthCm: number;
  floorMaterial: string;
  wallColor: string;
  wallHeightCm: number;
  backgroundAssetId: string | null;
  backgroundOpacity: number;
  /** centimetres per background image pixel (set by calibration) */
  backgroundScale: number;
  backgroundX: number;
  backgroundY: number;
}

export interface FloorElement {
  id: string;
  areaId: string;
  kind: ElementKind;
  label: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  /** height of the object in 3D */
  elevationCm: number;
  color: string | null;
  material: string | null;
  assetId: string | null;
}

export interface PlanTable {
  id: string;
  name: string;
  shape: 'round' | 'square' | 'rect';
  capacity: number;
  chairs?: number | null;
  material?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

export const DEFAULT_GEOMETRY: AreaGeometry = {
  widthCm: 1200,
  depthCm: 800,
  floorMaterial: 'parquet',
  wallColor: '#e9e1d6',
  wallHeightCm: 280,
  backgroundAssetId: null,
  backgroundOpacity: 0.5,
  backgroundScale: 1,
  backgroundX: 0,
  backgroundY: 0,
};

export const ELEMENT_DEFAULTS: Record<ElementKind, { label: string; width: number; height: number; elevationCm: number; color: string }> = {
  wall: { label: 'Mur', width: 300, height: 15, elevationCm: 280, color: '#d8cfc4' },
  door: { label: 'Porte', width: 90, height: 15, elevationCm: 210, color: '#8b5e3c' },
  window: { label: 'Fenêtre', width: 150, height: 15, elevationCm: 140, color: '#9fd3e6' },
  counter: { label: 'Comptoir', width: 300, height: 70, elevationCm: 110, color: '#5b3a29' },
  bar: { label: 'Bar', width: 400, height: 60, elevationCm: 115, color: '#3b2a20' },
  column: { label: 'Poteau', width: 40, height: 40, elevationCm: 280, color: '#bdb5aa' },
  bench: { label: 'Banquette', width: 200, height: 55, elevationCm: 45, color: '#7a4b3a' },
  plant: { label: 'Plante', width: 50, height: 50, elevationCm: 120, color: '#3f7d4e' },
  stairs: { label: 'Escalier', width: 120, height: 250, elevationCm: 20, color: '#a89f94' },
  zone: { label: 'Zone', width: 300, height: 200, elevationCm: 0, color: '#f3d9a4' },
  decor: { label: 'Décor', width: 60, height: 60, elevationCm: 80, color: '#c08a5b' },
  model: { label: 'Objet 3D', width: 80, height: 80, elevationCm: 90, color: '#999999' },
};

// Materials: a texture served by a public CDN plus a colour used while it loads, offline, or if
// the CDN is unreachable. Custom textures from the asset library are referenced as "asset:<id>".
const THREE_TEXTURES = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r169/examples/textures/';
export interface Material {
  key: string;
  label: string;
  color: string;
  textureUrl: string | null;
  /** real-world size of one texture tile, in cm */
  tileCm: number;
  use: 'floor' | 'surface' | 'both';
}
export const MATERIALS: Material[] = [
  { key: 'parquet', label: 'Parquet chêne', color: '#b07a4f', textureUrl: `${THREE_TEXTURES}hardwood2_diffuse.jpg`, tileCm: 200, use: 'both' },
  { key: 'tiles', label: 'Carreaux de ciment', color: '#d9d4cc', textureUrl: `${THREE_TEXTURES}floors/FloorsCheckerboard_S_Diffuse.jpg`, tileCm: 120, use: 'floor' },
  { key: 'brick', label: 'Brique', color: '#9c5a3c', textureUrl: `${THREE_TEXTURES}brick_diffuse.jpg`, tileCm: 150, use: 'both' },
  { key: 'concrete', label: 'Béton ciré', color: '#a7a49f', textureUrl: `${THREE_TEXTURES}disturb.jpg`, tileCm: 300, use: 'both' },
  { key: 'grass', label: 'Gazon (terrasse)', color: '#6d9b4f', textureUrl: `${THREE_TEXTURES}terrain/grasslight-big.jpg`, tileCm: 400, use: 'floor' },
  { key: 'terrace', label: 'Terrasse bois', color: '#8d6a4a', textureUrl: null, tileCm: 100, use: 'floor' },
  { key: 'marble', label: 'Marbre blanc', color: '#ecebe7', textureUrl: null, tileCm: 100, use: 'both' },
  { key: 'walnut', label: 'Noyer foncé', color: '#5a3d2b', textureUrl: null, tileCm: 100, use: 'surface' },
  { key: 'metal', label: 'Métal noir', color: '#2f2f33', textureUrl: null, tileCm: 100, use: 'surface' },
];
export const materialOf = (key: string | null | undefined): Material => MATERIALS.find((m) => m.key === key) ?? MATERIALS[0];

// Ready-to-use 3D models offered from a CDN (decor only; tables and chairs are drawn by the app).
export const CDN_MODELS: { key: string; label: string; url: string; widthCm: number; heightCm: number }[] = [
  { key: 'chair-sheen', label: 'Fauteuil velours', url: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r169/examples/models/gltf/SheenChair.glb', widthCm: 70, heightCm: 90 },
  { key: 'flower', label: 'Fleur en pot', url: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r169/examples/models/gltf/Flower/Flower.glb', widthCm: 40, heightCm: 60 },
];

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
export const snap = (v: number, grid = 10): number => Math.round(v / grid) * grid;

/** Axis-aligned bounds of a (possibly rotated) rectangle; rotation around its centre, degrees. */
export const bounds = (r: Rect): { minX: number; minY: number; maxX: number; maxY: number } => {
  const a = (((r.rotation ?? 0) % 180) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(a));
  const sin = Math.abs(Math.sin(a));
  const w = r.width * cos + r.height * sin;
  const h = r.width * sin + r.height * cos;
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  return { minX: cx - w / 2, minY: cy - h / 2, maxX: cx + w / 2, maxY: cy + h / 2 };
};

/** Gap between two rectangles' bounds (0 when they touch or overlap; negative = overlap depth). */
export const gapBetween = (a: Rect, b: Rect): number => {
  const p = bounds(a);
  const q = bounds(b);
  const dx = Math.max(q.minX - p.maxX, p.minX - q.maxX);
  const dy = Math.max(q.minY - p.maxY, p.minY - q.maxY);
  if (dx < 0 && dy < 0) return Math.max(dx, dy);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
};

export const overlaps = (a: Rect, b: Rect): boolean => gapBetween(a, b) < 0;

/** Table pairs that overlap, and pairs leaving less than `minPassageCm` to walk between them. */
export const layoutWarnings = (tables: (PlanTable | (Rect & { name: string }))[], minPassageCm = 80): { kind: 'overlap' | 'narrow'; a: string; b: string; gapCm: number }[] => {
  const out: { kind: 'overlap' | 'narrow'; a: string; b: string; gapCm: number }[] = [];
  for (let i = 0; i < tables.length; i += 1) {
    for (let j = i + 1; j < tables.length; j += 1) {
      const gap = gapBetween(tables[i], tables[j]);
      if (gap < 0) out.push({ kind: 'overlap', a: tables[i].name, b: tables[j].name, gapCm: Math.round(gap) });
      else if (gap < minPassageCm) out.push({ kind: 'narrow', a: tables[i].name, b: tables[j].name, gapCm: Math.round(gap) });
    }
  }
  return out;
};

/** Chairs drawn around a table: positions relative to the table centre (cm), facing it. */
export const chairPositions = (t: Pick<PlanTable, 'shape' | 'capacity' | 'chairs' | 'width' | 'height'>): { x: number; y: number; angle: number }[] => {
  const n = clamp(t.chairs ?? t.capacity, 0, 16);
  if (n === 0) return [];
  const offset = 22;
  if (t.shape === 'round') {
    const r = Math.max(t.width, t.height) / 2 + offset;
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r, angle: (a * 180) / Math.PI + 90 };
    });
  }
  // Rectangles: long sides first, then the ends when there are more chairs than the sides hold.
  const horizontal = t.width >= t.height;
  const long = horizontal ? t.width : t.height;
  const perSide = Math.max(1, Math.floor(long / 55));
  const sides = Math.min(n, perSide * 2);
  const ends = n - sides;
  const out: { x: number; y: number; angle: number }[] = [];
  const a = Math.ceil(sides / 2);
  const b = sides - a;
  const place = (count: number, side: 1 | -1) => {
    for (let i = 0; i < count; i += 1) {
      const along = ((i + 0.5) / count - 0.5) * long;
      const across = side * ((horizontal ? t.height : t.width) / 2 + offset);
      out.push(horizontal ? { x: along, y: across, angle: side === 1 ? 180 : 0 } : { x: across, y: along, angle: side === 1 ? 90 : 270 });
    }
  };
  place(a, -1);
  place(b, 1);
  for (let i = 0; i < ends; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const across = side * (long / 2 + offset);
    out.push(horizontal ? { x: across, y: 0, angle: side === -1 ? 90 : 270 } : { x: 0, y: across, angle: side === -1 ? 180 : 0 });
  }
  return out;
};

/** Background calibration: two points picked on the image and the real distance between them. */
export const calibrateScale = (p1: { x: number; y: number }, p2: { x: number; y: number }, realCm: number): number => {
  const px = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (px <= 0 || realCm <= 0) throw new Error('Points de calibrage invalides');
  return realCm / px;
};

/** Area size that fits everything drawn on it (used when an old plan has no dimensions yet). */
export const fitArea = (items: Rect[], geometry: Pick<AreaGeometry, 'widthCm' | 'depthCm'>, margin = 40): { widthCm: number; depthCm: number } => {
  let w = geometry.widthCm;
  let d = geometry.depthCm;
  for (const r of items) {
    const b = bounds(r);
    w = Math.max(w, Math.ceil(b.maxX + margin));
    d = Math.max(d, Math.ceil(b.maxY + margin));
  }
  return { widthCm: w, depthCm: d };
};
