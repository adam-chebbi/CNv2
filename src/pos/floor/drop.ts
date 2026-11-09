import type React from 'react';
import type { ElementKind } from '../../data/floorScene';

// What can be dragged onto the plan (2D or 3D): an element of the catalogue, a 3D model, a
// material, or files from the computer (.glb models, images).

export type DropData =
  | { kind: 'element'; value: ElementKind }
  | { kind: 'model'; assetId: string }
  | { kind: 'material'; key: string }
  | { kind: 'files'; files: File[] };

const MIME = 'application/x-cafenoir-floor';

export const dragProps = (data: Exclude<DropData, { kind: 'files' }>) => ({
  draggable: true,
  onDragStart: (e: React.DragEvent) => {
    e.dataTransfer.setData(MIME, JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'copy';
  },
});

export const accepts = (e: React.DragEvent): boolean => e.dataTransfer.types.includes(MIME) || e.dataTransfer.types.includes('Files');

export const readDrop = (e: React.DragEvent): DropData | null => {
  const raw = e.dataTransfer.getData(MIME);
  if (raw) {
    try {
      return JSON.parse(raw) as DropData;
    } catch {
      return null;
    }
  }
  const files = [...e.dataTransfer.files].filter((f) => isModelFile(f) || isImageFile(f));
  return files.length ? { kind: 'files', files } : null;
};

export const isModelFile = (f: File): boolean => /\.glb$/i.test(f.name);
export const isImageFile = (f: File): boolean => /^image\/(png|jpeg|webp)$/.test(f.type);
