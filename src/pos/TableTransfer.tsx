import React, { useState } from 'react';
import { ArrowRightLeft, Merge } from 'lucide-react';
import { posApi, type VisitDetail } from './api';
import { Btn, cx, Empty, ErrorNote, Loading, Modal, useAction, useLoader } from './ui';

// Move a party to a free table, or merge it into another occupied table (amélioration 02).
// Both are journalled server side and need the `tables:transfer` permission.

export const TableTransferModal: React.FC<{ visit: VisitDetail; onClose: () => void; onDone: (v: VisitDetail) => void }> = ({ visit, onClose, onDone }) => {
  const floor = useLoader(() => posApi.floor(), []);
  const [mode, setMode] = useState<'transfer' | 'merge'>('transfer');
  const [target, setTarget] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const candidates = (floor.data?.tables ?? []).filter((t) => t.accessible && t.id !== visit.tableId && (mode === 'transfer' ? !t.visit : t.visit?.status === 'open'));
  const areaName = (id: string) => floor.data?.areas.find((a) => a.id === id)?.name ?? '';
  const chosen = candidates.find((t) => t.id === target);

  const confirm = () =>
    run(async () => {
      if (!chosen) return;
      const v = mode === 'transfer' ? await posApi.transferVisit(visit.id, chosen.id) : await posApi.mergeVisit(visit.id, chosen.visit!.id);
      onDone(v);
    });

  return (
    <Modal
      title={`Table ${visit.table.name} — déplacer ou fusionner`}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Annuler</Btn>
          <Btn variant="primary" busy={busy} disabled={!chosen} onClick={confirm}>
            {mode === 'transfer' ? `Déplacer vers ${chosen?.name ?? '…'}` : `Fusionner dans ${chosen?.name ?? '…'}`}
          </Btn>
        </>
      }
    >
      <ErrorNote message={error ?? floor.error} />
      <div className="grid grid-cols-2 gap-2">
        {(['transfer', 'merge'] as const).map((m) => (
          <button key={m} onClick={() => { setMode(m); setTarget(null); }} className={cx('min-h-[44px] rounded-xl border text-sm font-semibold flex items-center justify-center gap-2', mode === m ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200')}>
            {m === 'transfer' ? <><ArrowRightLeft size={15} /> Vers une table libre</> : <><Merge size={15} /> Fusionner</>}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500">
        {mode === 'transfer' ? 'Les clients, la commande et l’addition suivent la table.' : 'Les commandes rejoignent l’addition de l’autre table ; cette table est libérée. Impossible si un règlement a déjà été fait.'}
      </p>
      {floor.loading ? (
        <Loading />
      ) : candidates.length === 0 ? (
        <Empty>{mode === 'transfer' ? 'Aucune table libre dans vos carrés.' : 'Aucune autre table occupée.'}</Empty>
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
