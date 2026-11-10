import React, { useState } from 'react';
import { ArrowRightLeft, Merge, Split } from 'lucide-react';
import { posApi, type VisitDetail } from './api';
import { Btn, cx, Empty, ErrorNote, Loading, Modal, Money, useAction, useLoader } from './ui';

// Move a party to a free table, merge it into another occupied table (amélioration 02), or
// separate chosen items to a free table with their own bill (fork). All are journalled server side
// and need the `tables:transfer` permission.

type Mode = 'transfer' | 'merge' | 'fork';

export const TableTransferModal: React.FC<{ visit: VisitDetail; initialMode?: Mode; onClose: () => void; onDone: (v: VisitDetail) => void }> = ({ visit, initialMode = 'transfer', onClose, onDone }) => {
  const floor = useLoader(() => posApi.floor(), []);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const billLines = (visit.sales.find((x) => x.status === 'open')?.orders ?? []).filter((o) => o.status === 'validated').flatMap((o) => o.lines.filter((l) => l.status === 'active'));
  const [target, setTarget] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const candidates = (floor.data?.tables ?? []).filter((t) => t.accessible && t.id !== visit.tableId && (mode === 'merge' ? t.visit?.status === 'open' : !t.visit));
  const areaName = (id: string) => floor.data?.areas.find((a) => a.id === id)?.name ?? '';
  const chosen = candidates.find((t) => t.id === target);

  const confirm = () =>
    run(async () => {
      if (!chosen) return;
      const v =
        mode === 'transfer' ? await posApi.transferVisit(visit.id, chosen.id) : mode === 'merge' ? await posApi.mergeVisit(visit.id, chosen.visit!.id) : await posApi.forkVisit(visit.id, chosen.id, [...picked]);
      onDone(v);
    });

  return (
    <Modal
      title={`Table ${visit.table.name} — déplacer, fusionner ou séparer`}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Annuler</Btn>
          <Btn variant="primary" busy={busy} disabled={!chosen || (mode === 'fork' && (picked.size === 0 || picked.size === billLines.length))} onClick={confirm}>
            {mode === 'transfer' ? `Déplacer vers ${chosen?.name ?? '…'}` : mode === 'merge' ? `Fusionner dans ${chosen?.name ?? '…'}` : `Séparer vers ${chosen?.name ?? '…'}`}
          </Btn>
        </>
      }
    >
      <ErrorNote message={error ?? floor.error} />
      <div className="grid grid-cols-3 gap-2">
        {(['transfer', 'merge', 'fork'] as const).map((m) => (
          <button key={m} onClick={() => { setMode(m); setTarget(null); }} className={cx('min-h-[44px] rounded-xl border text-sm font-semibold flex items-center justify-center gap-2', mode === m ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200')}>
            {m === 'transfer' ? <><ArrowRightLeft size={15} /> Déplacer</> : m === 'merge' ? <><Merge size={15} /> Fusionner</> : <><Split size={15} /> Séparer</>}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500">
        {mode === 'transfer'
          ? 'Les clients, la commande et l’addition suivent la table.'
          : mode === 'merge'
            ? 'Les commandes rejoignent l’addition de l’autre table ; cette table est libérée. Impossible si un règlement a déjà été fait.'
            : 'Cochez les articles qui partent, puis choisissez une table libre : elle aura sa propre addition.'}
      </p>
      {mode === 'fork' && (
        <ul className="rounded-xl border border-gray-100 divide-y divide-gray-100 max-h-48 overflow-y-auto">
          {billLines.length === 0 && <li className="p-3 text-sm text-gray-400">Aucun article envoyé sur cette table.</li>}
          {billLines.map((l) => (
            <li key={l.id}>
              <label className="flex items-center gap-3 px-3 min-h-[48px] text-sm cursor-pointer">
                <input type="checkbox" className="w-5 h-5" checked={picked.has(l.id)} onChange={(e) => { const n = new Set(picked); if (e.target.checked) n.add(l.id); else n.delete(l.id); setPicked(n); }} />
                <span className="flex-1">{l.quantity} × {l.displayName}</span>
                <Money mil={l.totalMil} />
              </label>
            </li>
          ))}
        </ul>
      )}
      {floor.loading ? (
        <Loading />
      ) : candidates.length === 0 ? (
        <Empty>{mode === 'merge' ? 'Aucune autre table occupée.' : 'Aucune table libre dans vos carrés.'}</Empty>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-72 overflow-y-auto">
          {candidates.map((t) => (
            <button key={t.id} onClick={() => setTarget(t.id)} className={cx('min-h-[56px] rounded-xl border-2 text-sm font-bold flex flex-col items-center justify-center', target === t.id ? 'border-emerald-600 bg-emerald-50' : 'border-gray-200')}>
              {t.name}
              <span className="text-[10px] font-normal text-gray-500">{areaName(t.areaId)} · {t.capacity} pl.</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
};
