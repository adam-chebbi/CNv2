import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, LayoutDashboard, Plus, Printer, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { posApi, type FloorState, type FloorTable, type TableInput } from './api';
import { Badge, Btn, Card, cx, dateTime, Empty, ErrorNote, Field, inputCls, Loading, Modal, PageHeader, useAction, useLoader } from './ui';

// Plan de salle 2D, carrés et affectations, QR codes (cahier des charges §6.1, §6.4, §17.3).
// A functional plan — not an architectural drawing: drag tables, set shape and capacity.

const GRID = 10;
const snap = (v: number) => Math.max(0, Math.round(v / GRID) * GRID);

const qrUrl = (base: string, token: string) => `${base.replace(/\/$/, '')}/t/${token}`;

const printQrSheet = async (tables: FloorTable[], base: string) => {
  const cards = await Promise.all(
    tables
      .filter((t) => t.qrToken)
      .map(async (t) => {
        const url = qrUrl(base, t.qrToken!);
        const img = await QRCode.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: 'M' });
        return `<div class="card"><p class="brand">Café Noir</p><img src="${img}" alt=""><p class="t">Table ${t.name.replace(/</g, '')}</p><p class="s">Scannez pour voir le menu et commander</p><p class="u">${url}</p></div>`;
      })
  );
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>QR codes des tables</title><style>
@page { size: A4; margin: 10mm; } body { font-family: Arial, sans-serif; margin: 0; }
.grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8mm; }
.card { border: 1px dashed #999; border-radius: 6mm; padding: 6mm; text-align: center; break-inside: avoid; }
.card img { width: 55mm; height: 55mm; } .brand { font: bold 18px Georgia, serif; margin: 0 0 2mm; } .t { font-size: 22px; font-weight: bold; margin: 2mm 0 0; }
.s { font-size: 12px; color: #444; margin: 1mm 0; } .u { font-size: 9px; color: #777; word-break: break-all; margin: 0; }
</style></head><body><div class="grid">${cards.join('')}</div></body></html>`;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.onload = () => w.print();
};

const TableForm: React.FC<{ areaId: string; table?: FloorTable; onClose: () => void; onSaved: () => void }> = ({ areaId, table, onClose, onSaved }) => {
  const [form, setForm] = useState<TableInput>(
    table ?? { areaId, name: '', shape: 'square', capacity: 2, x: 20, y: 20, width: 80, height: 80, rotation: 0 }
  );
  const { busy, error, run } = useAction();
  return (
    <Modal
      title={table ? `Table ${table.name}` : 'Nouvelle table'}
      onClose={onClose}
      footer={
        <>
          {table && (
            <Btn variant="danger" busy={busy} onClick={() => run(async () => { if (window.confirm('Retirer cette table du plan ? Son historique est conservé.')) { await posApi.archiveTable(table.id); onSaved(); } })}>
              <Trash2 size={14} /> Retirer
            </Btn>
          )}
          <Btn variant="primary" busy={busy} disabled={!form.name.trim()} onClick={() => run(async () => { if (table) await posApi.updateTable(table.id, form); else await posApi.createTable(form); onSaved(); })}>
            Enregistrer
          </Btn>
        </>
      }
    >
      <ErrorNote message={error} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Nom ou numéro">
          <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="T7" />
        </Field>
        <Field label="Capacité (places)">
          <input className={inputCls} inputMode="numeric" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value.replace(/\D/g, '')) || 1 })} />
        </Field>
        <Field label="Forme">
          <select
            className={inputCls}
            value={form.shape}
            onChange={(e) => {
              const shape = e.target.value as TableInput['shape'];
              setForm({ ...form, shape, width: shape === 'rect' ? 160 : form.width, height: 80 });
            }}
          >
            <option value="square">Carrée</option>
            <option value="round">Ronde</option>
            <option value="rect">Rectangulaire</option>
          </select>
        </Field>
        <Field label="Rotation (°)">
          <input className={inputCls} inputMode="numeric" value={form.rotation} onChange={(e) => setForm({ ...form, rotation: Math.min(359, Number(e.target.value.replace(/\D/g, '')) || 0) })} />
        </Field>
        <Field label="Largeur">
          <input className={inputCls} inputMode="numeric" value={form.width} onChange={(e) => setForm({ ...form, width: Math.max(30, Number(e.target.value.replace(/\D/g, '')) || 30) })} />
        </Field>
        <Field label="Hauteur">
          <input className={inputCls} inputMode="numeric" value={form.height} onChange={(e) => setForm({ ...form, height: Math.max(30, Number(e.target.value.replace(/\D/g, '')) || 30) })} />
        </Field>
      </div>
    </Modal>
  );
};

const SectionsCard: React.FC<{ floor: FloorState; onChanged: () => void }> = ({ floor, onChanged }) => {
  const waiters = useLoader(() => posApi.waiters(), []);
  const [editing, setEditing] = useState<{ id?: string; name: string; color: string; tableIds: string[] } | null>(null);
  const [history, setHistory] = useState<{ name: string; rows: Awaited<ReturnType<typeof posApi.sectionHistory>> } | null>(null);
  const { busy, error, run } = useAction();
  return (
    <Card title="Carrés et affectations" actions={<Btn size="sm" onClick={() => setEditing({ name: '', color: '#10b981', tableIds: [] })}><Plus size={14} /> Carré</Btn>}>
      <ErrorNote message={error ?? waiters.error} />
      {floor.sections.length === 0 ? (
        <Empty>Aucun carré. Un carré regroupe des tables confiées à un serveur.</Empty>
      ) : (
        <ul className="space-y-2">
          {floor.sections.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-3 h-3 rounded-full" style={{ background: s.color }} />
              <span className="font-semibold">{s.name}</span>
              <span className="text-gray-500">{s.tableIds.map((id) => floor.tables.find((t) => t.id === id)?.name).filter(Boolean).join(', ') || 'aucune table'}</span>
              <span className="flex-1" />
              <select
                className={cx(inputCls, 'w-48 min-h-[38px] py-1')}
                value={s.waiterId ?? ''}
                disabled={busy}
                onChange={(e) => run(async () => { await posApi.assignSection(s.id, e.target.value || null); onChanged(); })}
                aria-label={`Serveur du ${s.name}`}
              >
                <option value="">— Aucun serveur —</option>
                {(waiters.data ?? []).map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              <Btn size="sm" variant="ghost" onClick={() => run(async () => setHistory({ name: s.name, rows: await posApi.sectionHistory(s.id) }))}>Historique</Btn>
              <Btn size="sm" onClick={() => setEditing({ id: s.id, name: s.name, color: s.color, tableIds: s.tableIds })}>Modifier</Btn>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <Modal
          title={editing.id ? 'Modifier le carré' : 'Nouveau carré'}
          onClose={() => setEditing(null)}
          footer={
            <>
              {editing.id && <Btn variant="danger" busy={busy} onClick={() => run(async () => { await posApi.archiveSection(editing.id!); setEditing(null); onChanged(); })}>Supprimer</Btn>}
              <Btn variant="primary" busy={busy} disabled={!editing.name.trim()} onClick={() => run(async () => { if (editing.id) await posApi.updateSection(editing.id, editing); else await posApi.createSection(editing); setEditing(null); onChanged(); })}>
                Enregistrer
              </Btn>
            </>
          }
        >
          <Field label="Nom">
            <input className={inputCls} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Carré terrasse" />
          </Field>
          <Field label="Couleur">
            <input type="color" className="h-11 w-20 rounded-lg border border-gray-200" value={editing.color} onChange={(e) => setEditing({ ...editing, color: e.target.value })} />
          </Field>
          <p className="text-xs font-semibold text-gray-600">Tables</p>
          <div className="grid grid-cols-3 gap-2">
            {floor.tables.map((t) => {
              const other = floor.sections.find((s) => s.id !== editing.id && s.tableIds.includes(t.id));
              const on = editing.tableIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => setEditing({ ...editing, tableIds: on ? editing.tableIds.filter((x) => x !== t.id) : [...editing.tableIds, t.id] })}
                  className={cx('min-h-[44px] rounded-xl border text-sm', on ? 'border-emerald-500 bg-emerald-50 font-semibold' : 'border-gray-200')}
                  title={other ? `Actuellement dans ${other.name}` : undefined}
                >
                  {t.name}
                  {other && !on && <span className="block text-[10px] text-gray-400">{other.name}</span>}
                </button>
              );
            })}
          </div>
        </Modal>
      )}
      {history && (
        <Modal title={`Affectations — ${history.name}`} onClose={() => setHistory(null)}>
          {history.rows.length === 0 ? <Empty>Aucune affectation.</Empty> : (
            <ul className="text-sm space-y-1">
              {history.rows.map((h, i) => (
                <li key={i}>
                  <strong>{h.waiter}</strong> depuis {dateTime(h.startsAt)}{h.endsAt ? ` jusqu'à ${dateTime(h.endsAt)}` : ' (en cours)'}
                  <span className="block text-xs text-gray-500">par {h.assignedBy}{h.previousWaiter ? `, remplace ${h.previousWaiter}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </Card>
  );
};

export const FloorEditorPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const floor = useLoader(() => posApi.floor(), []);
  const settings = useLoader(() => posApi.settings(), []);
  const [areaId, setAreaId] = useState('');
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [editing, setEditing] = useState<FloorTable | 'new' | null>(null);
  const [newArea, setNewArea] = useState('');
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const { busy, error, setError, run } = useAction();

  useEffect(() => {
    if (!areaId && floor.data?.areas[0]) setAreaId(floor.data.areas[0].id);
  }, [floor.data, areaId]);

  if (floor.loading) return <Loading />;
  const data = floor.data!;
  const tables = data.tables.filter((t) => t.areaId === areaId).map((t) => ({ ...t, ...(positions[t.id] ?? {}) }));
  const dirty = Object.keys(positions).length > 0;
  const base = settings.data?.publicAppUrl || window.location.origin;

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !canvas.current) return;
    const rect = canvas.current.getBoundingClientRect();
    const { id, dx, dy } = drag.current;
    setPositions((p) => ({ ...p, [id]: { x: snap(e.clientX - rect.left - dx + canvas.current!.scrollLeft), y: snap(e.clientY - rect.top - dy + canvas.current!.scrollTop) } }));
  };

  const saveLayout = () =>
    run(async () => {
      await posApi.saveLayout(data.tables.filter((t) => positions[t.id]).map((t) => ({ id: t.id, x: positions[t.id].x, y: positions[t.id].y, width: t.width, height: t.height, rotation: t.rotation })));
      setPositions({});
      await floor.reload();
    });

  return (
    <div className="space-y-4">
      <PageHeader
        icon={LayoutDashboard}
        title="Plan de salle"
        subtitle="Glissez les tables pour les placer ; cliquez pour modifier. Représentation fonctionnelle, pas un plan coté."
        actions={
          <>
            {dirty && <Btn variant="primary" busy={busy} onClick={saveLayout}><Save size={14} /> Enregistrer les positions</Btn>}
            <Btn onClick={() => void printQrSheet(data.tables, base)} disabled={data.tables.length === 0}><Printer size={14} /> Imprimer les QR codes</Btn>
          </>
        }
      />
      <ErrorNote message={error ?? floor.error} onClose={() => setError(null)} />
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          {data.areas.map((a) => (
            <button key={a.id} onClick={() => setAreaId(a.id)} className={cx('px-4 min-h-[40px] rounded-full text-sm font-semibold border', a.id === areaId ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-200')}>
              {a.name}
            </button>
          ))}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void run(async () => { const r = await posApi.createArea(newArea.trim()); setNewArea(''); setAreaId(r.id); await floor.reload(); }); }}>
            <input className={cx(inputCls, 'w-40 min-h-[40px] py-1')} placeholder="Nouvel espace" value={newArea} onChange={(e) => setNewArea(e.target.value)} />
            <Btn size="sm" type="submit" disabled={!newArea.trim()}><Plus size={14} /></Btn>
          </form>
          {areaId && <Btn size="sm" variant="primary" onClick={() => setEditing('new')}><Plus size={14} /> Table</Btn>}
        </div>
        {!areaId ? (
          <Empty>Créez d'abord un espace (salle, terrasse…).</Empty>
        ) : (
          <div
            ref={canvas}
            className="relative overflow-auto rounded-xl border border-gray-200 bg-[length:10px_10px] bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] touch-none"
            style={{ height: 480 }}
            onPointerMove={onPointerMove}
            onPointerUp={() => (drag.current = null)}
            onPointerLeave={() => (drag.current = null)}
          >
            <div style={{ width: 1600, height: 1000 }} />
            {tables.map((t) => (
              <div
                key={t.id}
                role="button"
                tabIndex={0}
                onPointerDown={(e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  drag.current = { id: t.id, dx: e.clientX - rect.left, dy: e.clientY - rect.top };
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                }}
                onDoubleClick={() => setEditing(t)}
                onKeyDown={(e) => e.key === 'Enter' && setEditing(t)}
                className={cx('absolute border-2 border-emerald-600 bg-white flex flex-col items-center justify-center text-xs font-bold cursor-move select-none shadow', t.shape === 'round' ? 'rounded-full' : 'rounded-lg', positions[t.id] && 'ring-2 ring-amber-400')}
                style={{ left: t.x, top: t.y, width: t.width, height: t.height, transform: t.rotation ? `rotate(${t.rotation}deg)` : undefined }}
              >
                {t.name}
                <span className="font-normal text-[10px]">{t.capacity} pl.</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-500">Double-cliquez sur une table pour la modifier.</p>
      </Card>

      {hasPermission('tables:assign') && <SectionsCard floor={data} onChanged={() => void floor.reload()} />}

      <Card title="QR codes des tables">
        <p className="text-xs text-gray-500">Chaque QR ouvre {base}/t/… Vérifiez chaque QR imprimé (scannez-le : le bon nom de table doit s'afficher) puis cochez-le.</p>
        <ul className="divide-y divide-gray-100">
          {data.tables.map((t) => (
            <li key={t.id} className="py-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="w-16 font-semibold">{t.name}</span>
              {t.qrCheckedAt ? <Badge tone="green"><CheckCircle2 size={12} /> Vérifié</Badge> : <Badge tone="amber">À vérifier</Badge>}
              <span className="flex-1 text-xs text-gray-400 truncate">{t.qrToken && qrUrl(base, t.qrToken)}</span>
              {!t.qrCheckedAt && <Btn size="sm" busy={busy} onClick={() => run(async () => { await posApi.qrChecked(t.id); await floor.reload(); })}>Marquer vérifié</Btn>}
              <Btn size="sm" variant="ghost" busy={busy} onClick={() => run(async () => { if (window.confirm(`Remplacer le QR de ${t.name} ? L'ancien ne fonctionnera plus.`)) { await posApi.regenerateQr(t.id); await floor.reload(); } })}>
                <RefreshCw size={13} /> Nouveau QR
              </Btn>
            </li>
          ))}
        </ul>
      </Card>

      {editing && (
        <TableForm
          areaId={areaId}
          table={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void floor.reload();
          }}
        />
      )}
    </div>
  );
};
