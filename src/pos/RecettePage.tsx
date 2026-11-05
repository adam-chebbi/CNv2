import React, { useState } from 'react';
import { ClipboardCheck, Printer } from 'lucide-react';
import { apiGet, apiPut } from '../api/client';
import type { RecetteScenario } from '../data/recette';
import { Badge, Btn, Card, cx, dateTime, ErrorNote, inputCls, Loading, PageHeader, useAction, useLoader } from './ui';

// Feuille de recette (cahier des charges §20.2): tick each scenario while testing, note the
// anomalies, print the summary for the procès-verbal.

interface Row extends RecetteScenario {
  status: 'todo' | 'ok' | 'ko';
  note: string;
  checkedBy: string | null;
  checkedAt: string | null;
}

const ScenarioRow: React.FC<{ row: Row; index: number; onSaved: () => void }> = ({ row, index, onSaved }) => {
  const [note, setNote] = useState(row.note);
  const { busy, error, run } = useAction();
  const save = (status: Row['status']) => run(async () => { await apiPut(`/pos/recette/${row.id}`, { status, note }); onSaved(); });
  return (
    <li className="py-3 space-y-2">
      <div className="flex flex-wrap items-start gap-2">
        <span className="w-6 text-sm font-bold text-gray-400">{index + 1}</span>
        <div className="flex-1 min-w-[220px]">
          <p className="text-sm font-semibold">{row.fonction}</p>
          <p className="text-sm">{row.attendu}</p>
          <p className="text-xs text-gray-500">Comment tester : {row.comment} — <em>{row.ecran}</em></p>
        </div>
        <Badge tone={row.status === 'ok' ? 'green' : row.status === 'ko' ? 'red' : 'gray'}>{row.status === 'ok' ? 'Conforme' : row.status === 'ko' ? 'Anomalie' : 'À tester'}</Badge>
      </div>
      <ErrorNote message={error} />
      <div className="flex flex-wrap gap-2 pl-8">
        <input className={cx(inputCls, 'flex-1 min-w-[200px] min-h-[38px] py-1')} placeholder="Remarque / anomalie constatée" value={note} onChange={(e) => setNote(e.target.value)} />
        <Btn size="sm" variant="primary" busy={busy} onClick={() => save('ok')}>Conforme</Btn>
        <Btn size="sm" variant="danger" busy={busy} disabled={!note.trim()} onClick={() => save('ko')}>Anomalie</Btn>
        <Btn size="sm" variant="ghost" busy={busy} onClick={() => save('todo')}>À refaire</Btn>
      </div>
      {row.checkedBy && <p className="pl-8 text-[11px] text-gray-400">Dernière mise à jour : {row.checkedBy}, {dateTime(row.checkedAt!)}</p>}
    </li>
  );
};

export const RecettePage: React.FC = () => {
  const rows = useLoader(() => apiGet<Row[]>('/pos/recette'), []);
  const data = rows.data ?? [];
  const ok = data.filter((r) => r.status === 'ok').length;
  const ko = data.filter((r) => r.status === 'ko');
  return (
    <div className="space-y-4">
      <PageHeader icon={ClipboardCheck} title="Recette" subtitle="Scénarios de vérification du cahier des charges (§20.2)" actions={<Btn onClick={() => window.print()}><Printer size={14} /> Imprimer</Btn>} />
      <ErrorNote message={rows.error} />
      {rows.loading ? <Loading /> : (
        <>
          <Card>
            <p className="text-lg font-bold">{ok} / {data.length} scénarios conformes{ko.length > 0 && <span className="text-red-600"> · {ko.length} anomalie(s)</span>}</p>
            {ko.length > 0 && <ul className="text-sm text-red-700 list-disc pl-5">{ko.map((r) => <li key={r.id}>{r.fonction} : {r.note}</li>)}</ul>}
          </Card>
          <Card>
            <ul className="divide-y divide-gray-100">{data.map((r, i) => <ScenarioRow key={r.id} row={r} index={i} onSaved={() => void rows.reload()} />)}</ul>
          </Card>
        </>
      )}
    </div>
  );
};
