import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { chairPositions, snap, type AreaGeometry, type FloorElement, type PlanTable } from '../../data/floorScene';
import type { FloorAsset } from '../api';
import { backgroundUrl, imageAssetUrl, resolveMaterial, useImageSize } from './materials';
import { accepts, readDrop, type DropData } from './drop';

// Top view of one area, to scale (1 SVG unit = 1 cm). Shared by the service plan and the designer.
// Service: tap a table. Edit: select and drag tables and decor (10 cm magnetic grid).

export interface TableLook {
  fill: string;
  stroke: string;
  halo?: string | null;
  pulse?: boolean;
  lines?: string[];
  dim?: boolean;
}

export type Selection = { type: 'table' | 'element'; id: string } | null;

interface Props {
  geometry: AreaGeometry;
  tables: PlanTable[];
  elements: FloorElement[];
  assets: FloorAsset[];
  look?: (t: PlanTable) => TableLook;
  onTable?: (id: string) => void;
  editable?: boolean;
  selection?: Selection;
  onSelect?: (s: Selection) => void;
  onMove?: (s: NonNullable<Selection>, x: number, y: number) => void;
  showBackground?: boolean;
  grid?: number;
  className?: string;
  // Designer: something dragged from the catalogue or the computer is dropped at a point of the
  // plan, possibly onto a table or an element.
  onDropItem?: (data: DropData, at: { x: number; y: number }, target: Selection) => void;
  // Thumbnails of 3D models (by asset id), drawn inside their footprint.
  modelThumbs?: Record<string, string>;
}

const DEFAULT_LOOK: TableLook = { fill: '#f5efe6', stroke: '#8b6b4a' };
const MARGIN = 60;

export const FloorCanvas2D: React.FC<Props> = ({ geometry, tables, elements, assets, look, onTable, editable, selection, onSelect, onMove, showBackground = editable, grid = 10, className, onDropItem, modelThumbs }) => {
  const [dropping, setDropping] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const fit = useMemo(() => ({ x: -MARGIN, y: -MARGIN, w: geometry.widthCm + MARGIN * 2, h: geometry.depthCm + MARGIN * 2 }), [geometry.widthCm, geometry.depthCm]);
  const [view, setView] = useState(fit);
  useEffect(() => setView(fit), [fit]);
  const drag = useRef<{ kind: 'pan' | 'item'; sel?: NonNullable<Selection>; start: { x: number; y: number }; origin: { x: number; y: number }; moved: boolean } | null>(null);

  const toPlan = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };

  const zoom = (factor: number, center?: { x: number; y: number }) =>
    setView((v) => {
      const w = Math.min(Math.max(v.w * factor, 150), fit.w * 4);
      const h = (w / v.w) * v.h;
      const c = center ?? { x: v.x + v.w / 2, y: v.y + v.h / 2 };
      return { x: c.x - ((c.x - v.x) * w) / v.w, y: c.y - ((c.y - v.y) * h) / v.h, w, h };
    });

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, toPlan(e));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const startItem = (e: React.PointerEvent, sel: NonNullable<Selection>, origin: { x: number; y: number }) => {
    e.stopPropagation();
    if (!editable) return;
    onSelect?.(sel);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { kind: 'item', sel, start: toPlan(e), origin, moved: false };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (editable) onSelect?.(null);
    drag.current = { kind: 'pan', start: { x: e.clientX, y: e.clientY }, origin: { x: view.x, y: view.y }, moved: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan') {
      const rect = svgRef.current!.getBoundingClientRect();
      const k = view.w / rect.width;
      if (Math.abs(e.clientX - d.start.x) + Math.abs(e.clientY - d.start.y) > 4) d.moved = true;
      setView((v) => ({ ...v, x: d.origin.x - (e.clientX - d.start.x) * k, y: d.origin.y - (e.clientY - d.start.y) * k }));
      return;
    }
    const p = toPlan(e);
    const x = Math.max(0, snap(d.origin.x + p.x - d.start.x, grid));
    const y = Math.max(0, snap(d.origin.y + p.y - d.start.y, grid));
    d.moved = true;
    onMove?.(d.sel!, x, y);
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const materials = new Map<string, ReturnType<typeof resolveMaterial>>();
  const fillOf = (key: string | null | undefined, fallback: string) => {
    if (!key) return fallback;
    const m = resolveMaterial(key, assets);
    materials.set(m.key, m);
    return `url(#mat-${cssId(m.key)})`;
  };
  const floorFill = fillOf(geometry.floorMaterial, '#efe7dc');
  const bgUrl = showBackground ? backgroundUrl(geometry.backgroundAssetId, assets) : null;
  const bgSize = useImageSize(bgUrl);
  const selected = (type: 'table' | 'element', id: string) => selection?.type === type && selection.id === id;

  const elementShapes = elements.map((el) => {
    const isSel = selected('element', el.id);
    const color = el.color ?? '#bbb';
    const fill = el.material ? fillOf(el.material, color) : color;
    const common = { onPointerDown: (e: React.PointerEvent) => startItem(e, { type: 'element', id: el.id }, { x: el.x, y: el.y }), style: { cursor: editable ? 'move' : 'default' } };
    const w = el.width;
    const h = el.height;
    let body: React.ReactNode;
    switch (el.kind) {
      case 'zone':
        body = <rect width={w} height={h} rx={12} fill={color} fillOpacity={0.35} stroke={color} strokeDasharray="12 8" strokeWidth={3} />;
        break;
      case 'door':
        body = (
          <>
            <rect width={w} height={h} fill="#fff" stroke={color} strokeWidth={2} />
            <path d={`M ${w} 0 A ${w} ${w} 0 0 0 0 ${-w} L 0 0`} fill="none" stroke={color} strokeWidth={2} strokeDasharray="6 5" />
          </>
        );
        break;
      case 'window':
        body = (
          <>
            <rect width={w} height={h} fill={color} fillOpacity={0.6} stroke="#5b8fa3" strokeWidth={2} />
            <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="#5b8fa3" strokeWidth={2} />
          </>
        );
        break;
      case 'column':
        body = w === h ? <circle cx={w / 2} cy={h / 2} r={w / 2} fill={fill} stroke="#7d756c" strokeWidth={2} /> : <rect width={w} height={h} fill={fill} stroke="#7d756c" strokeWidth={2} />;
        break;
      case 'plant':
        body = (
          <>
            <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) / 2} fill={color} />
            {[0, 72, 144, 216, 288].map((a) => (
              <ellipse key={a} cx={w / 2} cy={h / 2 - Math.min(w, h) / 4} rx={Math.min(w, h) / 8} ry={Math.min(w, h) / 4} fill="#5fa36f" transform={`rotate(${a} ${w / 2} ${h / 2})`} />
            ))}
          </>
        );
        break;
      case 'model': {
        const thumb = el.assetId ? modelThumbs?.[el.assetId] : undefined;
        body = (
          <>
            <rect width={w} height={h} rx={8} fill={color} fillOpacity={0.18} stroke={color} strokeWidth={2} strokeDasharray="6 4" />
            {thumb && <image href={thumb} width={w} height={h} preserveAspectRatio="xMidYMid meet" />}
          </>
        );
        break;
      }
      case 'decor': {
        // A picture from the library (rug, sign, logo…) is drawn stretched over the footprint.
        const img = imageAssetUrl(el.assetId, assets);
        body = img ? <image href={img} width={w} height={h} preserveAspectRatio="none" /> : <rect width={w} height={h} rx={6} fill={fill} stroke="#00000033" strokeWidth={2} />;
        break;
      }
      case 'stairs':
        body = (
          <>
            <rect width={w} height={h} fill={fill} stroke="#6f675e" strokeWidth={2} />
            {Array.from({ length: Math.max(2, Math.floor(h / 28)) }, (_, i) => (
              <line key={i} x1={0} x2={w} y1={(i + 1) * (h / (Math.floor(h / 28) + 1))} y2={(i + 1) * (h / (Math.floor(h / 28) + 1))} stroke="#6f675e" strokeWidth={1.5} />
            ))}
          </>
        );
        break;
      default:
        body = <rect width={w} height={h} rx={el.kind === 'wall' ? 0 : 6} fill={fill} stroke={el.kind === 'wall' ? 'none' : '#00000033'} strokeWidth={2} />;
    }
    return (
      <g key={el.id} data-sel={`element:${el.id}`} transform={`translate(${el.x} ${el.y}) rotate(${el.rotation} ${w / 2} ${h / 2})`} {...common}>
        {body}
        {el.label && el.kind !== 'wall' && Math.min(w, h) >= 40 && (
          <text x={w / 2} y={h / 2} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(18, h / 2.5)} fill="#3b2f26" style={{ pointerEvents: 'none' }}>
            {el.label}
          </text>
        )}
        {isSel && <rect x={-6} y={-6} width={w + 12} height={h + 12} fill="none" stroke="#059669" strokeWidth={3} strokeDasharray="8 6" />}
      </g>
    );
  });

  const tableShapes = tables.map((t) => {
    const l = look?.(t) ?? DEFAULT_LOOK;
    const top = t.material ? fillOf(t.material, l.fill) : l.fill;
    const cx = t.x + t.width / 2;
    const cy = t.y + t.height / 2;
    const isSel = selected('table', t.id);
    return (
      <g
        key={t.id}
        data-sel={`table:${t.id}`}
        transform={`translate(${cx} ${cy})`}
        opacity={l.dim ? 0.45 : 1}
        onPointerDown={(e) => startItem(e, { type: 'table', id: t.id }, { x: t.x, y: t.y })}
        onClick={(e) => {
          e.stopPropagation();
          if (!editable) onTable?.(t.id);
        }}
        style={{ cursor: editable ? 'move' : 'pointer' }}
        role={editable ? undefined : 'button'}
        aria-label={`Table ${t.name}`}
      >
        <g transform={`rotate(${t.rotation})`}>
          {l.halo && (
            <rect x={-t.width / 2 - 34} y={-t.height / 2 - 34} width={t.width + 68} height={t.height + 68} rx={t.shape === 'round' ? (t.width + 68) / 2 : 24} fill={l.halo} fillOpacity={0.28} className={l.pulse ? 'animate-pulse' : undefined} />
          )}
          {chairPositions(t).map((c, i) => (
            <rect key={i} x={c.x - 18} y={c.y - 16} width={36} height={32} rx={8} fill="#6b4f3a" fillOpacity={0.85} transform={`rotate(${c.angle} ${c.x} ${c.y})`} />
          ))}
          {t.shape === 'round' ? (
            <ellipse rx={t.width / 2} ry={t.height / 2} fill={top} stroke={l.stroke} strokeWidth={4} />
          ) : (
            <rect x={-t.width / 2} y={-t.height / 2} width={t.width} height={t.height} rx={8} fill={top} stroke={l.stroke} strokeWidth={4} />
          )}
        </g>
        <text textAnchor="middle" y={l.lines?.length ? -6 : 0} dominantBaseline="central" fontSize={Math.min(26, t.height / 2.6)} fontWeight={700} fill="#1f2937" style={{ pointerEvents: 'none' }}>
          {t.name}
        </text>
        {l.lines?.map((line, i) => (
          <text key={i} textAnchor="middle" y={14 + i * 14} fontSize={12} fill="#374151" style={{ pointerEvents: 'none' }}>
            {line}
          </text>
        ))}
        {isSel && <rect x={-t.width / 2 - 8} y={-t.height / 2 - 8} width={t.width + 16} height={t.height + 16} fill="none" stroke="#059669" strokeWidth={3} strokeDasharray="8 6" transform={`rotate(${t.rotation})`} />}
      </g>
    );
  });

  return (
    <div
      className={`relative ${className ?? ''}`}
      onDragOver={(e) => {
        if (!onDropItem || !accepts(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(e) => {
        setDropping(false);
        if (!onDropItem) return;
        e.preventDefault();
        const data = readDrop(e);
        if (!data) return;
        const hit = (document.elementFromPoint(e.clientX, e.clientY) as Element | null)?.closest('[data-sel]')?.getAttribute('data-sel');
        const target: Selection = hit ? { type: hit.split(':')[0] as 'table' | 'element', id: hit.slice(hit.indexOf(':') + 1) } : null;
        onDropItem(data, toPlan(e), target);
      }}
    >
      {dropping && (
        <div className="absolute inset-0 z-10 rounded-xl border-2 border-dashed border-emerald-500 bg-emerald-500/10 pointer-events-none flex items-start justify-center pt-3">
          <span className="rounded-full bg-emerald-600 text-white text-xs font-semibold px-3 py-1">Déposez pour placer ici</span>
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        className="w-full h-full touch-none select-none bg-stone-100 rounded-xl"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          {[...materials.values()].map((m) => (
            <pattern key={m.key} id={`mat-${cssId(m.key)}`} patternUnits="userSpaceOnUse" width={m.tileCm} height={m.tileCm}>
              <rect width={m.tileCm} height={m.tileCm} fill={m.color} />
              {m.url && <image href={m.url} width={m.tileCm} height={m.tileCm} preserveAspectRatio="none" />}
            </pattern>
          ))}
          {editable && (
            <pattern id="grid-50" patternUnits="userSpaceOnUse" width={50} height={50}>
              <path d="M50 0H0V50" fill="none" stroke="#00000014" strokeWidth={1} />
            </pattern>
          )}
        </defs>
        <rect x={0} y={0} width={geometry.widthCm} height={geometry.depthCm} fill={floorFill} />
        {bgUrl && bgSize && <image href={bgUrl} x={geometry.backgroundX} y={geometry.backgroundY} width={bgSize.width * geometry.backgroundScale} height={bgSize.height * geometry.backgroundScale} opacity={geometry.backgroundOpacity} style={{ pointerEvents: 'none' }} />}
        {editable && <rect x={0} y={0} width={geometry.widthCm} height={geometry.depthCm} fill="url(#grid-50)" style={{ pointerEvents: 'none' }} />}
        <rect x={-8} y={-8} width={geometry.widthCm + 16} height={geometry.depthCm + 16} fill="none" stroke={shade(geometry.wallColor)} strokeWidth={16} />
        {elementShapes.filter((_, i) => elements[i].kind === 'zone')}
        {elementShapes.filter((_, i) => elements[i].kind !== 'zone')}
        {tableShapes}
      </svg>
      <div className="absolute right-2 bottom-2 flex flex-col gap-1">
        <button type="button" onClick={() => zoom(1 / 1.25)} className="w-9 h-9 rounded-lg bg-white/90 shadow border border-gray-200 flex items-center justify-center" aria-label="Zoomer">
          <Plus size={16} />
        </button>
        <button type="button" onClick={() => zoom(1.25)} className="w-9 h-9 rounded-lg bg-white/90 shadow border border-gray-200 flex items-center justify-center" aria-label="Dézoomer">
          <Minus size={16} />
        </button>
        <button type="button" onClick={() => setView(fit)} className="w-9 h-9 rounded-lg bg-white/90 shadow border border-gray-200 flex items-center justify-center" aria-label="Recentrer">
          <Maximize2 size={15} />
        </button>
      </div>
    </div>
  );
};

const cssId = (key: string) => key.replace(/[^a-zA-Z0-9_-]/g, '_');

/** Darker tone of a #rrggbb colour, for the outline of the walls. */
const shade = (hex: string, k = 0.7): string => {
  const n = Number.parseInt(hex.slice(1), 16);
  if (Number.isNaN(n)) return '#9c8f80';
  const c = (s: number) => Math.round(((n >> s) & 255) * k).toString(16).padStart(2, '0');
  return `#${c(16)}${c(8)}${c(0)}`;
};
