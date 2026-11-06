import React, { useState } from 'react';
import { ExternalLink, MonitorSmartphone } from 'lucide-react';
import { posApi } from './api';
import { Btn, Card, ErrorNote, useAction, useLoader } from './ui';

// Écrans clients (amélioration 07): pairing a customer display with a register, and the link of
// the public "commandes prêtes" board.
export const DisplayLinks: React.FC = () => {
  const registers = useLoader(() => posApi.registers(), []);
  const [links, setLinks] = useState<Record<string, string>>({});
  const { busy, error, run } = useAction();
  const origin = window.location.origin;
  return (
    <Card title={<span className="flex items-center gap-2"><MonitorSmartphone size={16} /> Écrans clients</span>}>
      <ErrorNote message={error ?? registers.error} />
      <div className="text-sm space-y-1">
        <p className="font-semibold">Écran « commandes prêtes » (vente à emporter)</p>
        <p className="text-xs text-gray-500">À ouvrir en plein écran sur une télévision : affiche uniquement les numéros de retrait.</p>
        <a className="inline-flex items-center gap-1 text-emerald-700 underline" href={`${origin}/commandes-pretes`} target="_blank" rel="noreferrer">
          {origin}/commandes-pretes <ExternalLink size={13} />
        </a>
      </div>
      <div className="text-sm space-y-2 pt-2">
        <p className="font-semibold">Écran client à côté de la caisse</p>
        <p className="text-xs text-gray-500">Le client voit ses articles, le total et la monnaie à rendre. Générer un nouveau lien désactive l'ancien.</p>
        {(registers.data ?? []).map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2">
            <span className="w-40">{r.name}</span>
            <Btn size="sm" busy={busy} onClick={() => run(async () => { const p = await posApi.pairDisplay(r.id); setLinks({ ...links, [r.id]: `${origin}${p.path}` }); })}>
              Générer le lien
            </Btn>
            {links[r.id] && <a className="text-xs text-emerald-700 underline break-all" href={links[r.id]} target="_blank" rel="noreferrer">{links[r.id]}</a>}
          </div>
        ))}
      </div>
    </Card>
  );
};
