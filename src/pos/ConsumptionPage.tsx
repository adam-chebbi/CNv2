import React, { useState } from 'react';
import { Download, FlaskConical } from 'lucide-react';
import Papa from 'papaparse';
import { apiGet } from '../api/client';
import { formatDt } from '../data/money';
import { tunisClock } from '../data/pricing';
import { TREATMENT_LABELS } from './labels';
import { Btn, Card, Empty, ErrorNote, Field, inputCls, Loading, Money, PageHeader, useLoader } from './ui';

// Fiche de consommation des matières (cahier des charges §14.5). "Théorique" = what the recipes
// of the register's validated sales say was used; it is shown next to losses, adjustments and the
// differences found at inventory, never merged with them.

interface Report {
  from: string;
  to: string;
  ingredients: {
    productId: string;
    name: string;
    unit: string;
    theoretical: number;
    importedSales: number;
    internal: number;
    losses: number;
    adjustments: number;
    inventoryGap: number;
    estimatedCostMil: number;
    lossCostMil: number;
    inventoryGapValueMil: number;
  }[];
  products: { articleId: string; name: string; quantity: number }[];
  cancellationTreatments: { treatment: string | null; n: number; amount: number }[];
  totals: { estimatedCostMil: number; lossCostMil: number; inventoryGapValueMil: number };
}

const qty = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString('fr-FR');

export const ConsumptionPage: React.FC = () => {
  const today = tunisClock(new Date()).date;
  const [range, setRange] = useState({ from: `${today.slice(0, 8)}01`, to: today });
  const report = useLoader(() => apiGet<Report>(`/pos/reports/consumption?from=${range.from}&to=${range.to}`), [range]);

  const exportCsv = () => {
    if (!report.data) return;
    const csv = Papa.unparse(
      report.data.ingredients.map((i) => ({
        Ingrédient: i.name,
        Unité: i.unit,
        'Consommation théorique (caisse)': qty(i.theoretical),
        'Ventes importées': qty(i.importedSales),
        'Consommation interne': qty(i.internal),
        Pertes: qty(i.losses),
        Ajustements: qty(i.adjustments),
        'Écart inventaire': qty(i.inventoryGap),
        'Coût matière estimé (DT)': formatDt(i.estimatedCostMil, false),
      })),
      { delimiter: ';' }
    );
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `consommation-${range.from}-${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <PageHeader icon={FlaskConical} title="Fiche de consommation" subtitle="Consommation théorique des ventes, distincte de la consommation constatée à l'inventaire" actions={<Btn onClick={exportCsv} disabled={!report.data}><Download size={14} /> Export CSV</Btn>} />
      <div className="flex gap-2 items-end">
        <Field label="Du"><input type="date" className={inputCls} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
        <Field label="Au"><input type="date" className={inputCls} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
      </div>
      <ErrorNote message={report.error} />
      {report.loading || !report.data ? <Loading /> : (
        <>
          <div className="grid sm:grid-cols-3 gap-3">
            <Card><p className="text-xs text-gray-500">Coût matière estimé des ventes</p><p className="text-xl font-bold"><Money mil={report.data.totals.estimatedCostMil} /></p></Card>
            <Card><p className="text-xs text-gray-500">Pertes valorisées</p><p className="text-xl font-bold"><Money mil={report.data.totals.lossCostMil} /></p></Card>
            <Card><p className="text-xs text-gray-500">Écarts d'inventaire valorisés</p><p className="text-xl font-bold"><Money mil={report.data.totals.inventoryGapValueMil} /></p></Card>
          </div>
          <Card title="Par ingrédient">
            {report.data.ingredients.length === 0 ? <Empty>Aucun mouvement sur la période.</Empty> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-500 text-left">
                    <tr><th className="py-1">Ingrédient</th><th>Théorique (caisse)</th><th>Ventes importées</th><th>Interne</th><th>Pertes</th><th>Ajustements</th><th>Écart inventaire</th><th>Coût estimé</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.data.ingredients.map((i) => (
                      <tr key={i.productId}>
                        <td className="py-1.5">{i.name} <span className="text-xs text-gray-400">({i.unit})</span></td>
                        <td className="font-semibold">{qty(i.theoretical)}</td>
                        <td>{qty(i.importedSales)}</td>
                        <td>{qty(i.internal)}</td>
                        <td>{qty(i.losses)}</td>
                        <td>{qty(i.adjustments)}</td>
                        <td className={i.inventoryGap < 0 ? 'text-red-600' : ''}>{qty(i.inventoryGap)}</td>
                        <td><Money mil={i.estimatedCostMil} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <div className="grid md:grid-cols-2 gap-4">
            <Card title="Produits vendus (caisse)">
              {report.data.products.length === 0 ? <Empty>—</Empty> : (
                <ul className="text-sm divide-y divide-gray-100">{report.data.products.map((p) => <li key={p.articleId} className="py-1 flex justify-between"><span>{p.name}</span><strong>{p.quantity}</strong></li>)}</ul>
              )}
            </Card>
            <Card title="Annulations acceptées">
              {report.data.cancellationTreatments.length === 0 ? <Empty>—</Empty> : (
                <ul className="text-sm">{report.data.cancellationTreatments.map((t) => <li key={t.treatment ?? 'x'} className="flex justify-between"><span>{TREATMENT_LABELS[t.treatment ?? ''] ?? '—'} ({t.n})</span><Money mil={t.amount} /></li>)}</ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
};
