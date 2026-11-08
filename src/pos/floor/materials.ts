import { useEffect, useState } from 'react';
import { CDN_MODELS, materialOf, MATERIALS } from '../../data/floorScene';
import type { FloorAsset } from '../api';

// Resolves a material key ("parquet", or "asset:<id>" for a texture of the library) to what the
// 2D and 3D renderers need. Unknown keys fall back to the first built-in material.

export interface ResolvedMaterial {
  key: string;
  label: string;
  color: string;
  url: string | null;
  tileCm: number;
}

export const resolveMaterial = (key: string | null | undefined, assets: FloorAsset[]): ResolvedMaterial => {
  if (key?.startsWith('asset:')) {
    const a = assets.find((x) => x.id === key.slice(6));
    if (a) return { key, label: a.name, color: '#b9a48f', url: a.url, tileCm: a.tileCm ?? 100 };
  }
  const m = materialOf(key);
  return { key: m.key, label: m.label, color: m.color, url: m.textureUrl, tileCm: m.tileCm };
};

export const materialOptions = (assets: FloorAsset[], use: 'floor' | 'surface'): { key: string; label: string }[] => [
  ...MATERIALS.filter((m) => m.use === use || m.use === 'both').map((m) => ({ key: m.key, label: m.label })),
  ...assets.filter((a) => a.kind === 'texture').map((a) => ({ key: `asset:${a.id}`, label: `${a.name} (bibliothèque)` })),
];

/** Model URL of a decor element: "cdn:<key>" for the built-in catalogue or a library asset id. */
export const modelUrl = (assetId: string | null, assets: FloorAsset[]): string | null => {
  if (!assetId) return null;
  if (assetId.startsWith('cdn:')) return CDN_MODELS.find((m) => m.key === assetId.slice(4))?.url ?? null;
  return assets.find((a) => a.id === assetId && a.kind === 'model')?.url ?? null;
};

export const backgroundUrl = (assetId: string | null, assets: FloorAsset[]): string | null => (assetId ? (assets.find((a) => a.id === assetId)?.url ?? null) : null);

export const useImageSize = (url: string | null): { width: number; height: number } | null => {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    setSize(null);
    if (!url) return;
    const img = new Image();
    img.onload = () => setSize({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = url;
  }, [url]);
  return size;
};
