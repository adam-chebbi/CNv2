import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, AppWindow, Armchair, Box, BrickWall, Columns3, Copy, DoorOpen, Footprints, Frame, History, Image as ImageIcon, Library, PenTool, Redo2, RotateCw, Save, SquareDashed, Sprout, Store, Trash2, Undo2, Upload, Wine } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { CDN_MODELS, clamp, DEFAULT_GEOMETRY, ELEMENT_DEFAULTS, ELEMENT_KINDS, fitArea, layoutWarnings, MATERIALS, type AreaGeometry, type ElementKind, type FloorElement, type PlanTable } from '../data/floorScene';
import { usePosEvents } from '../hooks/usePosEvents';
import { posApi, type FloorAsset, type FloorDesignInput } from './api';
import { FloorCanvas2D, type Selection } from './floor/FloorCanvas2D';
import { materialOptions, modelUrl, resolveMaterial, useImageSize } from './floor/materials';
import { dragProps, isImageFile, isModelFile, type DropData } from './floor/drop';
import { Badge, Btn, Card, cx, dateTime, Empty, ErrorNote, Field, inputCls, Loading, PageHeader, useAction, useLoader } from './ui';

// Concepteur du plan de salle (amélioration 01): a CMS for the café architecture — dimensions,
// floor and wall materials, the architect's plan as a calibrated background, walls, doors, bar,
// decor and 3D objects, table placement, named versions, and a library of textures and models
// (CDN links or uploads). Editing needs `floor:manage`; the library needs `floor:assets`.

const FloorScene3D = lazy(() => import('./floor/FloorScene3D'));

type DraftTable = PlanTable & { areaId: string };
interface Draft {
  geometry: AreaGeometry;
  elements: FloorElement[];
  tables: DraftTable[];
}

const KIND_LABEL: Record<ElementKind, string> = Object.fromEntries(ELEMENT_KINDS.map((k) => [k, ELEMENT_DEFAULTS[k].label])) as Record<ElementKind, string>;
const num = (v: string, fallback = 0) => (Number.isFinite(Number(v)) && v.trim() !== '' ? Math.round(Number(v)) : fallback);

const readFile = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Lecture du fichier impossible'));
    r.readAsDataURL(file);
  });

export const FloorDesignerPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('floor:manage');
  const canLibrary = hasPermission('floor:assets');
  const floor = useLoader(() => posApi.floor(), []);
  const assets = useLoader(() => posApi.floorAssets(), []);
  const [areaId, setAreaId] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [view, setView] = useState<'2d' | '3d'>('2d');
  const [tab, setTab] = useState<'plan' | 'versions' | 'library'>(canEdit ? 'plan' : 'library');
  const { busy, error, setError, run } = useAction();
  const lib = assets.data ?? [];
  usePosEvents(['floor.changed'], () => {
    if (!dirty) void floor.reload();
  });

  useEffect(() => {
    if (!areaId && floor.data?.areas[0]) setAreaId(floor.data.areas[0].id);
  }, [floor.data, areaId]);

  // (Re)build the draft from the server copy whenever the area changes or a save lands.
  useEffect(() => {
    const data = floor.data;
    const area = data?.areas.find((a) => a.id === areaId);
    if (!data || !area || dirty) return;
    const tables = data.tables.filter((t) => t.areaId === areaId);
    const elements = data.elements.filter((e) => e.areaId === areaId);
    const size = fitArea([...tables, ...elements], area.geometry);
    setDraft({ geometry: { ...DEFAULT_GEOMETRY, ...area.geometry, ...size }, elements, tables });
  }, [floor.data, areaId, dirty]);

  // Undo / redo (Ctrl+Z, Ctrl+Y). A drag is one step: changes closer than 400 ms are merged.
  const past = useRef<Draft[]>([]);
  const future = useRef<Draft[]>([]);
  const lastPush = useRef(0);
  const [, setHistoryTick] = useState(0);
  const update = useCallback((fn: (d: Draft) => Draft) => {
    setDraft((d) => {
      if (!d) return d;
      if (Date.now() - lastPush.current > 400) {
        past.current = [...past.current.slice(-49), d];
        future.current = [];
        setHistoryTick((n) => n + 1);
      }
      lastPush.current = Date.now();
      return fn(d);
    });
    setDirty(true);
  }, []);
  const undo = () => {
    const prev = past.current.pop();
    if (!prev || !draft) return;
    future.current.push(draft);
    lastPush.current = 0;
    setDraft(prev);
    setDirty(true);
    setHistoryTick((n) => n + 1);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next || !draft) return;
    past.current.push(draft);
    lastPush.current = 0;
    setDraft(next);
    setDirty(true);
    setHistoryTick((n) => n + 1);
  };

  const selectedElement = selection?.type === 'element' ? draft?.elements.find((e) => e.id === selection.id) : undefined;
  const selectedTable = selection?.type === 'table' ? draft?.tables.find((t) => t.id === selection.id) : undefined;
  const setElement = (id: string, patch: Partial<FloorElement>) => update((d) => ({ ...d, elements: d.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  const setTable = (id: string, patch: Partial<DraftTable>) => update((d) => ({ ...d, tables: d.tables.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const warnings = useMemo(() => (draft ? layoutWarnings(draft.tables) : []), [draft]);

  const addElement = (kind: ElementKind, at?: { x: number; y: number }, patch: Partial<FloorElement> = {}): FloorElement | null => {
    if (!draft) return null;
    const def = ELEMENT_DEFAULTS[kind];
    const width = patch.width ?? def.width;
    const height = patch.height ?? def.height;
    const center = at ?? { x: draft.geometry.widthCm / 2, y: draft.geometry.depthCm / 2 };
    const el: FloorElement = {
      id: crypto.randomUUID(),
      areaId,
      kind,
      label: kind === 'wall' ? null : def.label,
      width,
      height,
      rotation: 0,
      elevationCm: def.elevationCm,
      color: def.color,
      material: kind === 'counter' || kind === 'bar' ? 'walnut' : null,
      assetId: kind === 'model' ? `cdn:${CDN_MODELS[0].key}` : null,
      ...patch,
      x: Math.max(0, Math.round((center.x - width / 2) / 10) * 10),
      y: Math.max(0, Math.round((center.y - height / 2) / 10) * 10),
    };
    update((d) => ({ ...d, elements: [...d.elements, el] }));
    setSelection({ type: 'element', id: el.id });
    return el;
  };

  // A 3D model arrives at the drop point, then takes its real size read from the file.
  const placeModel = async (assetId: string, at: { x: number; y: number }, url?: string, fileName?: string) => {
    const name = fileName ?? assetId.startsWith('cdn:') ? CDN_MODELS.find((m) => `cdn:${m.key}` === assetId)?.label : lib.find((a) => a.id === assetId)?.name;
    const el = addElement('model', at, { assetId, label: name ?? 'Objet 3D' });
    const src = url ?? modelUrl(assetId, lib);
    if (!el || !src) return;
    try {
      const size = await (await import('./floor/modelTools')).modelSizeCm(src);
      setElement(el.id, { width: size.width, height: size.depth, elevationCm: size.height, x: Math.max(0, Math.round(at.x - size.width / 2)), y: Math.max(0, Math.round(at.y - size.depth / 2)) });
    } catch {
      /* unreadable model: keeps the default footprint */
    }
  };

  // A picture (rug, sign, logo) keeps its proportions, 2 m wide by default.
  const placePicture = async (assetId: string, url: string, name: string, at: { x: number; y: number }) => {
    const ratio = await new Promise<number>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalHeight / Math.max(1, img.naturalWidth));
      img.onerror = () => resolve(1);
      img.src = url;
    });
    addElement('decor', at, { assetId, label: name, width: 200, height: Math.max(20, Math.round(200 * ratio)), elevationCm: 1, material: null });
  };

  const applyMaterial = (key: string, target: Selection) => {
    if (target?.type === 'element') setElement(target.id, { material: key });
    else if (target?.type === 'table') setTable(target.id, { material: key });
    else update((d) => ({ ...d, geometry: { ...d.geometry, floorMaterial: key } }));
  };

  const onDropItem = (data: DropData, at: { x: number; y: number }, target: Selection) =>
    run(async () => {
      if (data.kind === 'element') addElement(data.value, at);
      else if (data.kind === 'model') await placeModel(data.assetId, at);
      else if (data.kind === 'material') applyMaterial(data.key, target);
      else {
        for (const file of data.files) {
          if (!canLibrary) throw new Error('Ajouter un fichier à la bibliothèque demande le droit « Bibliothèque 3D ».');
          const name = file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 80) || 'Sans nom';
          if (isModelFile(file)) {
            const a = await posApi.addFloorAsset({ kind: 'model', name, dataUrl: await readFile(file) });
            await assets.reload();
            await placeModel(a.id, at, a.url, name);
          } else if (isImageFile(file)) {
            const a = await posApi.addFloorAsset({ kind: 'texture', name, dataUrl: await readFile(file), tileCm: 100 });
            await assets.reload();
            // On a table or an object: becomes its material. Elsewhere: a picture on the floor.
            if (target) applyMaterial(`asset:${a.id}`, target);
            else await placePicture(a.id, a.url, name, at);
          }
        }
      }
    });

  // Thumbnails of the 3D models (catalogue, library, 2D plan), rendered once in the browser.
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const modelIds = useMemo(() => [...CDN_MODELS.map((m) => `cdn:${m.key}`), ...(assets.data ?? []).filter((a) => a.kind === 'model').map((a) => a.id)], [assets.data]);
  useEffect(() => {
    let alive = true;
    void import('./floor/modelTools').then(({ modelThumbnail }) =>
      modelIds.forEach((id) => {
        const url = modelUrl(id, assets.data ?? []);
        if (url) void modelThumbnail(url).then((src) => alive && setThumbs((t) => (t[id] ? t : { ...t, [id]: src }))).catch(() => undefined);
      })
    );
    return () => {
      alive = false;
    };
  }, [modelIds, assets.data]);

  const removeSelected = () => {
    if (selection?.type !== 'element') return;
    update((d) => ({ ...d, elements: d.elements.filter((e) => e.id !== selection.id) }));
    setSelection(null);
  };
  const duplicateSelected = () => {
    if (!selectedElement) return;
    const copy = { ...selectedElement, id: crypto.randomUUID(), x: selectedElement.x + 30, y: selectedElement.y + 30 };
    update((d) => ({ ...d, elements: [...d.elements, copy] }));
    setSelection({ type: 'element', id: copy.id });
  };
  const rotateSelected = (deg: number) => {
    if (selectedElement) setElement(selectedElement.id, { rotation: (selectedElement.rotation + deg + 360) % 360 });
    if (selectedTable) setTable(selectedTable.id, { rotation: (selectedTable.rotation + deg + 360) % 360 });
  };

  // Keyboard: arrows nudge (Shift = 1 cm), R rotates, Delete removes, Ctrl+D duplicates.
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
        return;
      }
      if (!selection) return;
      const step = e.shiftKey ? 1 : 10;
      const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (move) {
        e.preventDefault();
        const item = selectedElement ?? selectedTable;
        if (!item) return;
        const patch = { x: Math.max(0, item.x + move[0]), y: Math.max(0, item.y + move[1]) };
        if (selectedElement) setElement(selectedElement.id, patch);
        else setTable(selectedTable!.id, patch);
      } else if (e.key === 'r' || e.key === 'R') rotateSelected(e.shiftKey ? -15 : 15);
      else if (e.key === 'Delete' || e.key === 'Backspace') removeSelected();
      else if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        duplicateSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const save = (allowOverlap = false) =>
    run(async () => {
      if (!draft) return;
      const body: FloorDesignInput = {
        geometry: draft.geometry,
        elements: draft.elements.map(({ areaId: _a, ...e }) => e), // eslint-disable-line @typescript-eslint/no-unused-vars
        tables: draft.tables.map((t) => ({ id: t.id, x: t.x, y: t.y, width: t.width, height: t.height, rotation: t.rotation, shape: t.shape, chairs: t.chairs ?? null, material: t.material ?? null })),
        allowOverlap,
      };
      await posApi.saveDesign(areaId, body);
      past.current = [];
      future.current = [];
      setDirty(false);
      await floor.reload();
    });

  const switchArea = (id: string) => {
    if (dirty && !window.confirm('Des modifications ne sont pas enregistrées. Les abandonner ?')) return;
    setDirty(false);
    setSelection(null);
    past.current = [];
    future.current = [];
    setAreaId(id);
  };

  if (floor.loading) return <Loading />;
  const areas = floor.data?.areas ?? [];

  return (
    <div className="space-y-4">
      <PageHeader icon={PenTool} title="Concepteur du plan" subtitle="Architecture, matériaux, décor 3D et versions du plan de salle" />
      <ErrorNote message={error ?? floor.error ?? assets.error} onClose={() => setError(null)} />
      <div className="flex flex-wrap gap-2">
        {canEdit && (
          <>
            <TabBtn active={tab === 'plan'} onClick={() => setTab('plan')} icon={<PenTool size={15} />} label="Plan" />
            <TabBtn active={tab === 'versions'} onClick={() => setTab('versions')} icon={<History size={15} />} label="Versions" />
          </>
        )}
        {(canLibrary || canEdit) && <TabBtn active={tab === 'library'} onClick={() => setTab('library')} icon={<Library size={15} />} label="Bibliothèque" />}
      </div>

      {tab === 'library' && <LibraryPanel assets={lib} thumbs={thumbs} canManage={canLibrary} onChanged={() => void assets.reload()} />}
      {tab === 'versions' && canEdit && <VersionsPanel dirty={dirty} />}

      {tab === 'plan' && canEdit && (
        <>
          {areas.length === 0 ? (
            <Card>
              <Empty>Créez d’abord un espace (salle, terrasse…) dans « Plan de salle & QR codes ».</Empty>
            </Card>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {areas.map((a) => (
                <button key={a.id} onClick={() => switchArea(a.id)} className={cx('px-4 min-h-[40px] rounded-full text-sm font-semibold border', a.id === areaId ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-200 bg-white')}>
                  {a.name}
                </button>
              ))}
              <span className="flex-1" />
              {dirty && <Badge tone="amber">Modifications non enregistrées</Badge>}
              <Btn variant="primary" busy={busy} disabled={!dirty} onClick={() => save()}>
                <Save size={15} /> Enregistrer
              </Btn>
            </div>
          )}
          {draft && (
            <div className="grid xl:grid-cols-[1fr_320px] gap-4 items-start">
              <Card>
                <Palette assets={lib} thumbs={thumbs} onAdd={(d) => void onDropItem(d, { x: draft.geometry.widthCm / 2, y: draft.geometry.depthCm / 2 }, selection)} />
                <div className="flex flex-wrap items-center gap-1.5">
                  <Btn size="sm" variant="ghost" disabled={past.current.length === 0} onClick={undo} aria-label="Annuler" title="Annuler (Ctrl+Z)">
                    <Undo2 size={15} />
                  </Btn>
                  <Btn size="sm" variant="ghost" disabled={future.current.length === 0} onClick={redo} aria-label="Rétablir" title="Rétablir (Ctrl+Y)">
                    <Redo2 size={15} />
                  </Btn>
                  {busy && <span className="text-xs text-gray-500">Import en cours…</span>}
                  <span className="flex-1" />
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
                    {(['2d', '3d'] as const).map((v) => (
                      <button key={v} onClick={() => setView(v)} className={cx('px-3 py-1.5', view === v ? 'bg-emerald-600 text-white' : 'text-gray-700')}>
                        {v.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                {view === '2d' ? (
                  <FloorCanvas2D
                    className="h-[64vh] min-h-[380px]"
                    geometry={draft.geometry}
                    tables={draft.tables}
                    elements={draft.elements}
                    assets={lib}
                    editable
                    selection={selection}
                    onSelect={setSelection}
                    onDropItem={onDropItem}
                    modelThumbs={thumbs}
                    onMove={(s, x, y) => (s.type === 'table' ? setTable(s.id, { x, y }) : setElement(s.id, { x, y }))}
                  />
                ) : (
                  <Suspense fallback={<Loading />}>
                    <FloorScene3D className="h-[64vh] min-h-[380px]" geometry={draft.geometry} tables={draft.tables} elements={draft.elements} assets={lib} onTable={(id) => { setSelection({ type: 'table', id }); setView('2d'); }} onDropItem={onDropItem} />
                  </Suspense>
                )}
                <p className="text-[11px] text-gray-500">
                  Glissez un élément, un objet 3D ou une matière sur le plan (2D ou 3D), ou déposez vos fichiers .glb et images depuis l’ordinateur · flèches : ajuster (Maj = 1 cm) · R : pivoter · Suppr : retirer · Ctrl+D : dupliquer · Ctrl+Z / Ctrl+Y : annuler / rétablir
                </p>
                {warnings.length > 0 && (
                  <div className="rounded-lg bg-amber-50 text-amber-900 text-xs p-2 space-y-0.5">
                    {warnings.slice(0, 6).map((w) => (
                      <p key={`${w.a}-${w.b}`} className="flex items-center gap-1.5">
                        <AlertTriangle size={12} /> {w.kind === 'overlap' ? `Tables ${w.a} et ${w.b} se chevauchent` : `Passage de ${w.gapCm} cm entre ${w.a} et ${w.b} (80 cm conseillés)`}
                      </p>
                    ))}
                    {warnings.some((w) => w.kind === 'overlap') && (
                      <Btn size="sm" variant="ghost" busy={busy} disabled={!dirty} onClick={() => save(true)}>
                        Enregistrer quand même
                      </Btn>
                    )}
                  </div>
                )}
              </Card>
              <div className="space-y-4">
                {selectedElement ? (
                  <ElementPanel el={selectedElement} assets={lib} onChange={(p) => setElement(selectedElement.id, p)} onRotate={rotateSelected} onDuplicate={duplicateSelected} onRemove={removeSelected} />
                ) : selectedTable ? (
                  <TablePanel t={selectedTable} assets={lib} onChange={(p) => setTable(selectedTable.id, p)} onRotate={rotateSelected} />
                ) : (
                  <AreaPanel geometry={draft.geometry} assets={lib} onChange={(g) => update((d) => ({ ...d, geometry: { ...d.geometry, ...g } }))} onUploaded={() => void assets.reload()} />
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const TabBtn: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({ active, onClick, icon, label }) => (
  <button onClick={onClick} className={cx('px-4 min-h-[40px] rounded-xl text-sm font-semibold border flex items-center gap-1.5', active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200')}>
    {icon} {label}
  </button>
);

const NumField: React.FC<{ label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; suffix?: string }> = ({ label, value, onChange, min = 0, max = 5000, suffix = 'cm' }) => (
  <Field label={`${label} (${suffix})`}>
    <input className={inputCls} inputMode="numeric" value={value} onChange={(e) => onChange(clamp(num(e.target.value, value), min, max))} />
  </Field>
);

const MaterialSelect: React.FC<{ label: string; value: string | null | undefined; assets: FloorAsset[]; use: 'floor' | 'surface'; onChange: (v: string | null) => void; allowNone?: boolean }> = ({ label, value, assets, use, onChange, allowNone }) => (
  <Field label={label}>
    <select className={inputCls} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      {allowNone && <option value="">Couleur unie</option>}
      {materialOptions(assets, use).map((m) => (
        <option key={m.key} value={m.key}>
          {m.label}
        </option>
      ))}
    </select>
  </Field>
);

const AreaPanel: React.FC<{ geometry: AreaGeometry; assets: FloorAsset[]; onChange: (g: Partial<AreaGeometry>) => void; onUploaded: () => void }> = ({ geometry: g, assets, onChange, onUploaded }) => {
  const backgrounds = assets.filter((a) => a.kind === 'background');
  const bg = backgrounds.find((a) => a.id === g.backgroundAssetId);
  const size = useImageSize(bg?.url ?? null);
  const [realWidth, setRealWidth] = useState('');
  const { busy, error, run } = useAction();
  const upload = (file: File) =>
    run(async () => {
      const a = await posApi.addFloorAsset({ kind: 'background', name: file.name.slice(0, 80), dataUrl: await readFile(file) });
      onUploaded();
      onChange({ backgroundAssetId: a.id, backgroundScale: 1, backgroundX: 0, backgroundY: 0 });
    });
  return (
    <Card title="Espace">
      <ErrorNote message={error} />
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Largeur" value={g.widthCm} min={200} onChange={(v) => onChange({ widthCm: v })} />
        <NumField label="Profondeur" value={g.depthCm} min={200} onChange={(v) => onChange({ depthCm: v })} />
      </div>
      <MaterialSelect label="Sol" value={g.floorMaterial} assets={assets} use="floor" onChange={(v) => onChange({ floorMaterial: v ?? 'parquet' })} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Couleur des murs">
          <input type="color" className="h-10 w-full rounded-lg border border-gray-200" value={g.wallColor} onChange={(e) => onChange({ wallColor: e.target.value })} />
        </Field>
        <NumField label="Hauteur murs" value={g.wallHeightCm} min={150} max={800} onChange={(v) => onChange({ wallHeightCm: v })} />
      </div>
      <div className="border-t border-gray-100 pt-3 space-y-2">
        <p className="text-sm font-semibold flex items-center gap-1.5">
          <ImageIcon size={15} /> Plan d’architecte (calque)
        </p>
        <select className={inputCls} value={g.backgroundAssetId ?? ''} onChange={(e) => onChange({ backgroundAssetId: e.target.value || null })}>
          <option value="">Aucun</option>
          {backgrounds.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-emerald-700 font-semibold cursor-pointer">
          <Upload size={14} /> {busy ? 'Envoi…' : 'Importer une image (PNG, JPEG, WebP, 5 Mo)'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
        </label>
        {g.backgroundAssetId && (
          <>
            <Field label={`Opacité : ${Math.round(g.backgroundOpacity * 100)} %`}>
              <input type="range" min={0} max={1} step={0.05} value={g.backgroundOpacity} onChange={(e) => onChange({ backgroundOpacity: Number(e.target.value) })} className="w-full" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <NumField label="Décalage X" value={g.backgroundX} min={-5000} onChange={(v) => onChange({ backgroundX: v })} />
              <NumField label="Décalage Y" value={g.backgroundY} min={-5000} onChange={(v) => onChange({ backgroundY: v })} />
            </div>
            <Field label="Calibrage : largeur réelle couverte par l’image (cm)" hint={size ? `Image de ${size.width} px · échelle actuelle ${g.backgroundScale.toFixed(3)} cm/px` : undefined}>
              <div className="flex gap-2">
                <input className={inputCls} inputMode="numeric" value={realWidth} onChange={(e) => setRealWidth(e.target.value.replace(/\D/g, ''))} placeholder="ex. 1250" />
                <Btn disabled={!size || !realWidth} onClick={() => size && onChange({ backgroundScale: Number(realWidth) / size.width })}>
                  Appliquer
                </Btn>
              </div>
            </Field>
          </>
        )}
      </div>
    </Card>
  );
};

const ElementPanel: React.FC<{ el: FloorElement; assets: FloorAsset[]; onChange: (p: Partial<FloorElement>) => void; onRotate: (deg: number) => void; onDuplicate: () => void; onRemove: () => void }> = ({ el, assets, onChange, onRotate, onDuplicate, onRemove }) => {
  const models = [...CDN_MODELS.map((m) => ({ id: `cdn:${m.key}`, name: `${m.label} (CDN)` })), ...assets.filter((a) => a.kind === 'model').map((a) => ({ id: a.id, name: a.name }))];
  return (
    <Card title={KIND_LABEL[el.kind]}>
      <Field label="Nom affiché">
        <input className={inputCls} value={el.label ?? ''} maxLength={60} onChange={(e) => onChange({ label: e.target.value || null })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <NumField label="X" value={el.x} onChange={(v) => onChange({ x: v })} />
        <NumField label="Y" value={el.y} onChange={(v) => onChange({ y: v })} />
        <NumField label="Longueur" value={el.width} min={5} onChange={(v) => onChange({ width: v })} />
        <NumField label="Épaisseur" value={el.height} min={5} onChange={(v) => onChange({ height: v })} />
        <NumField label="Hauteur 3D" value={el.elevationCm} max={800} onChange={(v) => onChange({ elevationCm: v })} />
        <NumField label="Rotation" suffix="°" value={el.rotation} max={359} onChange={(v) => onChange({ rotation: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Couleur">
          <input type="color" className="h-10 w-full rounded-lg border border-gray-200" value={el.color ?? '#bbbbbb'} onChange={(e) => onChange({ color: e.target.value })} />
        </Field>
        {el.kind !== 'zone' && el.kind !== 'window' && el.kind !== 'model' && <MaterialSelect label="Matériau" value={el.material} assets={assets} use="surface" allowNone onChange={(v) => onChange({ material: v })} />}
      </div>
      {el.kind === 'model' && (
        <Field label="Modèle 3D" hint="La taille réelle du modèle est reprise à l’import ; ajustez-la ci-dessus si besoin.">
          <select className={inputCls} value={el.assetId ?? ''} onChange={(e) => onChange({ assetId: e.target.value || null })}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="flex flex-wrap gap-2">
        <Btn size="sm" onClick={() => onRotate(15)}>
          <RotateCw size={14} /> 15°
        </Btn>
        <Btn size="sm" onClick={() => onRotate(90)}>
          <RotateCw size={14} /> 90°
        </Btn>
        <Btn size="sm" onClick={onDuplicate}>
          <Copy size={14} /> Dupliquer
        </Btn>
        <Btn size="sm" variant="danger" onClick={onRemove}>
          <Trash2 size={14} /> Retirer
        </Btn>
      </div>
    </Card>
  );
};

const TablePanel: React.FC<{ t: DraftTable; assets: FloorAsset[]; onChange: (p: Partial<DraftTable>) => void; onRotate: (deg: number) => void }> = ({ t, assets, onChange, onRotate }) => (
  <Card title={`Table ${t.name}`}>
    <p className="text-xs text-gray-500">Nom, capacité et QR code se modifient dans « Plan de salle & QR codes ».</p>
    <Field label="Forme">
      <select className={inputCls} value={t.shape} onChange={(e) => onChange({ shape: e.target.value as DraftTable['shape'] })}>
        <option value="round">Ronde</option>
        <option value="square">Carrée</option>
        <option value="rect">Rectangulaire</option>
      </select>
    </Field>
    <div className="grid grid-cols-2 gap-2">
      <NumField label="Largeur" value={t.width} min={30} max={600} onChange={(v) => onChange({ width: v })} />
      <NumField label="Profondeur" value={t.height} min={30} max={600} onChange={(v) => onChange({ height: v })} />
      <NumField label="Rotation" suffix="°" value={t.rotation} max={359} onChange={(v) => onChange({ rotation: v })} />
      <NumField label="Chaises" suffix="nb" value={t.chairs ?? t.capacity} max={16} onChange={(v) => onChange({ chairs: v })} />
    </div>
    <MaterialSelect label="Plateau" value={t.material} assets={assets} use="surface" allowNone onChange={(v) => onChange({ material: v })} />
    <Btn size="sm" onClick={() => onRotate(15)}>
      <RotateCw size={14} /> Pivoter 15°
    </Btn>
  </Card>
);

const VersionsPanel: React.FC<{ dirty: boolean }> = ({ dirty }) => {
  const versions = useLoader(() => posApi.floorVersions(), []);
  const [name, setName] = useState('');
  const { busy, error, run } = useAction();
  return (
    <Card title="Versions du plan">
      <p className="text-xs text-gray-500">Ex. « Été avec terrasse » / « Hiver ». Une version mémorise tous les espaces : dimensions, décor et emplacement des tables.</p>
      <ErrorNote message={error ?? versions.error} />
      {dirty && <p className="text-sm text-amber-700">Enregistrez d’abord le plan en cours pour l’inclure dans la version.</p>}
      <div className="flex gap-2">
        <input className={inputCls} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Nom de la version" />
        <Btn variant="primary" busy={busy} disabled={!name.trim()} onClick={() => run(async () => { await posApi.saveFloorVersion(name.trim()); setName(''); await versions.reload(); })}>
          Mémoriser
        </Btn>
      </div>
      {(versions.data ?? []).length === 0 ? (
        <Empty>Aucune version enregistrée.</Empty>
      ) : (
        <ul className="divide-y divide-gray-100">
          {versions.data!.map((v) => (
            <li key={v.id} className="py-2 flex items-center gap-2 text-sm">
              <span className="flex-1">
                <strong>{v.name}</strong>
                <span className="block text-xs text-gray-500">
                  {v.createdBy} · {dateTime(v.createdAt)}
                  {v.appliedAt ? ` · appliquée le ${dateTime(v.appliedAt)}` : ''}
                </span>
              </span>
              <Btn size="sm" busy={busy} onClick={() => run(async () => { if (window.confirm(`Appliquer « ${v.name} » ? Le plan actuel sera remplacé (pensez à le mémoriser).`)) { await posApi.applyFloorVersion(v.id); await versions.reload(); } })}>
                Appliquer
              </Btn>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const LibraryPanel: React.FC<{ assets: FloorAsset[]; thumbs: Record<string, string>; canManage: boolean; onChanged: () => void }> = ({ assets, thumbs, canManage, onChanged }) => {
  const [over, setOver] = useState(false);
  const [form, setForm] = useState({ kind: 'texture' as FloorAsset['kind'], name: '', url: '', tileCm: '100' });
  const { busy, error, run } = useAction();
  // The type of a dropped or chosen file is detected: .glb is a 3D model, an image a texture.
  const add = (file?: File) =>
    run(async () => {
      const kind: FloorAsset['kind'] = file ? (isModelFile(file) ? 'model' : form.kind === 'background' ? 'background' : 'texture') : form.kind;
      await posApi.addFloorAsset({
        kind,
        name: (form.name.trim() || file?.name.replace(/\.[a-z0-9]+$/i, '') || 'Sans nom').slice(0, 80),
        ...(file ? { dataUrl: await readFile(file) } : { url: form.url.trim() }),
        ...(kind === 'texture' ? { tileCm: clamp(num(form.tileCm, 100), 10, 1000) } : {}),
      });
      setForm((f) => ({ ...f, name: '', url: '' }));
      onChanged();
    });
  const accept = '.glb,model/gltf-binary,image/png,image/jpeg,image/webp';
  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-4 items-start">
      <Card title="Bibliothèque du plan">
        <p className="text-xs text-gray-500">Textures de sol et de surfaces, modèles 3D (.glb) et plans d’architecte.</p>
        {canManage && (
          <div
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('Files')) {
                e.preventDefault();
                setOver(true);
              }
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              [...e.dataTransfer.files].filter((f) => isModelFile(f) || isImageFile(f)).forEach((f) => void add(f));
            }}
            className={cx('rounded-xl border-2 border-dashed p-4 text-center text-sm', over ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-gray-200 text-gray-500')}
          >
            <Upload size={18} className="mx-auto mb-1" />
            Déposez ici vos fichiers : modèles 3D (.glb, 10 Mo) et images (PNG, JPEG, WebP, 5 Mo). Le type est reconnu tout seul.
          </div>
        )}
        <ErrorNote message={error} />
        {assets.length === 0 ? (
          <Empty>La bibliothèque est vide : les matériaux et objets offerts ci-dessous sont déjà disponibles.</Empty>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-2">
            {assets.map((a) => (
              <li key={a.id} className="rounded-xl border border-gray-100 p-2 flex gap-2 items-center">
                {a.kind === 'model' ? (
                  thumbs[a.id] ? (
                    <img src={thumbs[a.id]} alt="" className="w-14 h-14 rounded-lg object-contain bg-gray-50" />
                  ) : (
                    <span className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Box size={22} className="text-gray-500" />
                    </span>
                  )
                ) : (
                  <img src={a.url} alt="" className="w-14 h-14 rounded-lg object-cover bg-gray-100" loading="lazy" />
                )}
                <span className="flex-1 min-w-0 text-sm">
                  <strong className="block truncate">{a.name}</strong>
                  <span className="text-xs text-gray-500">
                    {{ texture: 'Texture', model: 'Modèle 3D', background: 'Plan' }[a.kind]} · {a.source === 'cdn' ? 'CDN' : `${Math.round((a.sizeBytes ?? 0) / 1024)} Ko`}
                  </span>
                </span>
                {canManage && (
                  <Btn size="sm" variant="ghost" busy={busy} onClick={() => run(async () => { if (window.confirm(`Retirer « ${a.name} » de la bibliothèque ?`)) { await posApi.archiveFloorAsset(a.id); onChanged(); } })} aria-label="Retirer">
                    <Trash2 size={14} />
                  </Btn>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-gray-100 pt-3">
          <p className="text-sm font-semibold">Offerts (CDN, toujours disponibles)</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {MATERIALS.map((m) => (
              <span key={m.key} className="flex items-center gap-1.5 text-xs rounded-full border border-gray-200 pl-1 pr-2 py-1">
                <span className="w-5 h-5 rounded-full border border-black/10" style={{ background: m.textureUrl ? `center/cover url(${m.textureUrl}), ${m.color}` : m.color }} />
                {m.label}
              </span>
            ))}
            {CDN_MODELS.map((m) => (
              <span key={m.key} className="flex items-center gap-1.5 text-xs rounded-full border border-gray-200 pl-1 pr-2 py-1">
                {thumbs[`cdn:${m.key}`] ? <img src={thumbs[`cdn:${m.key}`]} alt="" className="w-5 h-5 object-contain" /> : <Box size={12} />} {m.label}
              </span>
            ))}
          </div>
        </div>
      </Card>
      {canManage ? (
        <Card title="Ajouter à la bibliothèque">
          <Field label="Type">
            <select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as FloorAsset['kind'] })}>
              <option value="texture">Texture (sol, plateau, mur)</option>
              <option value="model">Modèle 3D (.glb)</option>
              <option value="background">Plan d’architecte</option>
            </select>
          </Field>
          <Field label="Nom">
            <input className={inputCls} value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ex. Carrelage terrasse" />
          </Field>
          {form.kind === 'texture' && (
            <Field label="Taille réelle d’un motif (cm)">
              <input className={inputCls} inputMode="numeric" value={form.tileCm} onChange={(e) => setForm({ ...form, tileCm: e.target.value.replace(/\D/g, '') })} />
            </Field>
          )}
          <Field label="Lien CDN (https://…)" hint="Le serveur du lien doit autoriser l’affichage depuis un autre site (CORS).">
            <div className="flex gap-2">
              <input className={inputCls} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://cdn…/texture.jpg" />
              <Btn busy={busy} disabled={!form.url.startsWith('https://') || !form.name.trim()} onClick={() => add()}>
                Ajouter
              </Btn>
            </div>
          </Field>
          <label className="inline-flex items-center gap-2 text-sm text-emerald-700 font-semibold cursor-pointer">
            <Upload size={14} /> {busy ? 'Envoi…' : `Ou importer un fichier (${form.kind === 'model' ? '.glb, 10 Mo' : 'image, 5 Mo'})`}
            <input type="file" accept={accept} className="hidden" onChange={(e) => e.target.files?.[0] && void add(e.target.files[0])} />
          </label>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-gray-600">Consultation seule : l’ajout à la bibliothèque est réservé aux personnes ayant le droit « Bibliothèque 3D ».</p>
        </Card>
      )}
    </div>
  );
};

// --- Catalogue: drag onto the plan (or click to add in the middle) ---------------------------------

const KIND_ICON: Record<ElementKind, React.ComponentType<{ size?: number; className?: string }>> = {
  wall: BrickWall,
  door: DoorOpen,
  window: AppWindow,
  counter: Store,
  bar: Wine,
  column: Columns3,
  bench: Armchair,
  plant: Sprout,
  stairs: Footprints,
  zone: SquareDashed,
  decor: Frame,
  model: Box,
};

const Tile: React.FC<{ data: Exclude<DropData, { kind: 'files' }>; label: string; onAdd: (d: DropData) => void; children: React.ReactNode }> = ({ data, label, onAdd, children }) => (
  <button
    type="button"
    {...dragProps(data)}
    onClick={() => onAdd(data)}
    title={`${label} — glisser sur le plan ou cliquer`}
    className="shrink-0 w-[76px] rounded-xl border border-gray-200 bg-white p-1.5 flex flex-col items-center gap-1 hover:border-emerald-400 active:scale-[0.97] cursor-grab"
  >
    <span className="w-12 h-12 rounded-lg bg-gray-50 flex items-center justify-center overflow-hidden">{children}</span>
    <span className="text-[11px] leading-tight text-center text-gray-700 line-clamp-2">{label}</span>
  </button>
);

const Palette: React.FC<{ assets: FloorAsset[]; thumbs: Record<string, string>; onAdd: (d: DropData) => void }> = ({ assets, thumbs, onAdd }) => {
  const [group, setGroup] = useState<'elements' | 'models' | 'materials'>('elements');
  const models = [...CDN_MODELS.map((m) => ({ id: `cdn:${m.key}`, name: m.label })), ...assets.filter((a) => a.kind === 'model').map((a) => ({ id: a.id, name: a.name }))];
  const materials = [...MATERIALS.map((m) => m.key), ...assets.filter((a) => a.kind === 'texture').map((a) => `asset:${a.id}`)].map((key) => resolveMaterial(key, assets));
  return (
    <div className="space-y-2">
      <div className="flex gap-1 text-xs font-semibold">
        {([['elements', 'Éléments'], ['models', `Objets 3D (${models.length})`], ['materials', `Matières (${materials.length})`]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setGroup(id)} className={cx('px-3 py-1.5 rounded-lg border', group === id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-700')}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {group === 'elements' &&
          ELEMENT_KINDS.map((k) => {
            const Icon = KIND_ICON[k];
            return (
              <Tile key={k} data={{ kind: 'element', value: k }} label={KIND_LABEL[k]} onAdd={onAdd}>
                <Icon size={22} className="text-gray-600" />
              </Tile>
            );
          })}
        {group === 'models' &&
          models.map((m) => (
            <Tile key={m.id} data={{ kind: 'model', assetId: m.id }} label={m.name} onAdd={onAdd}>
              {thumbs[m.id] ? <img src={thumbs[m.id]} alt="" className="w-full h-full object-contain" /> : <Box size={22} className="text-gray-400" />}
            </Tile>
          ))}
        {group === 'materials' &&
          materials.map((m) => (
            <Tile key={m.key} data={{ kind: 'material', key: m.key }} label={m.label} onAdd={onAdd}>
              <span className="w-full h-full" style={{ background: m.url ? `center/cover url(${m.url}), ${m.color}` : m.color }} />
            </Tile>
          ))}
      </div>
      <p className="text-[11px] text-gray-500">
        {group === 'materials' ? 'Déposez une matière sur une table, un objet ou le sol. Un clic l’applique à la sélection, ou au sol.' : 'Glissez sur le plan à l’endroit voulu, ou cliquez pour placer au centre.'}
      </p>
    </div>
  );
};
