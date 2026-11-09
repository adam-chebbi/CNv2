import React, { useState } from 'react';
import { History, Lock, SlidersHorizontal } from 'lucide-react';
import { apiGet, apiPut } from '../api/client';
import type { RuleDef } from '../data/businessRules';
import { Badge, Btn, Card, cx, dateTime, ErrorNote, Field, inputCls, Loading, Modal, PageHeader, useAction, useLoader } from './ui';

// Operating rules (configuration engine): current value, default, a badge when it differs, the
// impact before saving, a required reason and the change history.

type RuleRow = RuleDef & {
  value: number | boolean;
  isDefault: boolean;
  canEdit: boolean;
  history: { oldValue: number | boolean; newValue: number | boolean; by: string; at: string; reason: string }[];
};

const show = (r: RuleDef, v: number | boolean) => (r.type === 'toggle' ? (v ? 'Activé' : 'Désactivé') : `${v}${r.unit ? ` ${r.unit}` : ''}`);

export const RulesPage: React.FC = () => {
  const rules = useLoader(() => apiGet<RuleRow[]>('/pos/rules'), []);
  const [editing, setEditing] = useState<RuleRow | null>(null);
  const [historyOf, setHistoryOf] = useState<RuleRow | null>(null);
  if (!rules.data) return rules.error ? <ErrorNote message={rules.error} /> : <Loading />;
  const modules = [...new Set(rules.data.map((r) => r.module))];
  return (
    <div className="space-y-4">
      <PageHeader icon={SlidersHorizontal} title="Règles de fonctionnement" subtitle="Chaque changement s’applique aux nouvelles opérations seulement et reste inscrit dans l’historique." />
      {modules.map((m) => (
        <Card key={m} title={m}>
          <ul className="divide-y divide-gray-100">
            {rules.data!.filter((r) => r.module === m).map((r) => (
              <li key={r.key} className="py-3 flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-[220px]">
                  <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    {r.label} {!r.isDefault && <Badge tone="amber">Modifié</Badge>}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{r.description}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Par défaut : {show(r, r.default)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cx('text-sm font-bold', r.type === 'toggle' && !r.value ? 'text-gray-500' : 'text-emerald-700')}>{show(r, r.value)}</span>
                  {r.canEdit ? (
                    <Btn size="sm" onClick={() => setEditing(r)}>Modifier</Btn>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-400" title="Réservé à la direction"><Lock size={12} /> Direction</span>
                  )}
                  {r.history.length > 0 && (
                    <Btn size="sm" variant="ghost" aria-label="Historique" onClick={() => setHistoryOf(r)}><History size={14} /></Btn>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      {editing && <RuleEditor rule={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void rules.reload(); }} />}
      {historyOf && (
        <Modal title={`Historique — ${historyOf.label}`} onClose={() => setHistoryOf(null)}>
          <ul className="space-y-2 text-sm">
            {historyOf.history.map((h, i) => (
              <li key={i} className="border-b border-gray-100 pb-2">
                <p className="font-semibold">{show(historyOf, h.oldValue)} → {show(historyOf, h.newValue)}</p>
                <p className="text-xs text-gray-500">{dateTime(h.at)} · {h.by} · « {h.reason} »</p>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
};

const RuleEditor: React.FC<{ rule: RuleRow; onClose: () => void; onSaved: () => void }> = ({ rule, onClose, onSaved }) => {
  const [value, setValue] = useState<number | boolean>(rule.value);
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  const changed = value !== rule.value;
  return (
    <Modal
      title={rule.label}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Annuler</Btn>
          <Btn variant="primary" busy={busy} disabled={!changed || reason.trim().length < 3} onClick={() => run(async () => { await apiPut(`/pos/rules/${rule.key}`, { value, reason: reason.trim() }); onSaved(); })}>
            Enregistrer
          </Btn>
        </>
      }
    >
      <ErrorNote message={error} />
      <p className="text-sm text-gray-600">{rule.description}</p>
      {rule.type === 'toggle' ? (
        <div className="grid grid-cols-2 gap-2">
          {[true, false].map((v) => (
            <button key={String(v)} onClick={() => setValue(v)} className={cx('min-h-[48px] rounded-xl border text-sm font-semibold', value === v ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-gray-200')}>
              {v ? 'Activé' : 'Désactivé'}
            </button>
          ))}
        </div>
      ) : (
        <Field label={`Valeur${rule.unit ? ` (${rule.unit})` : ''}`} hint={`Entre ${rule.min} et ${rule.max}.`}>
          <input className={inputCls} inputMode="numeric" value={String(value)} onChange={(e) => setValue(Number(e.target.value.replace(/\D/g, '')) || 0)} />
        </Field>
      )}
      {changed && <p className="text-sm rounded-xl bg-amber-50 border border-amber-200 text-amber-900 p-3">{rule.impact}</p>}
      <Field label="Raison du changement (obligatoire)">
        <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex. rush du samedi soir" />
      </Field>
    </Modal>
  );
};
