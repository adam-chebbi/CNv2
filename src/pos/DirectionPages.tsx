import React, { useState } from 'react';
import { Download, FileDown, History, LayoutDashboard, Table2 } from 'lucide-react';
import Papa from 'papaparse';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { apiGet } from '../api/client';
import { formatDt } from '../data/money';
import { tunisClock } from '../data/pricing';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '../data/cashSession';
import { formatMinutes } from '../data/timeclock';
import { usePosEvents } from '../hooks/usePosEvents';
import { Badge, Btn, Card, cx, dateTime, Empty, ErrorNote, Field, inputCls, Loading, Money, PageHeader, useLoader } from './ui';

// Tableau de bord de la direction, rapport des ventes et journal détaillé (cahier des charges §16).

interface Dashboard {
  from: string;
  to: string;
  live: { openTables: number; averageOpenMinutes: number; pendingQrOrders: number; billsRequested: number; waiterCalls: number; reservationsToHandle: number; pendingCancellations: number; openBills: number; openBillsDueMil: number; openSessions: number };
  revenue: { registerMil: number; manualMil: number; totalMil: number; creditNotesMil: number };
  tickets: number;
  averageTicketMil: number;
  covers: number;
  visitsClosed: number;
  averagePerCoverMil: number;
  visitsWithoutCovers: number;
  paymentsByMethod: Record<PaymentMethod, number>;
  refundsMil: number;
  sessions: { count: number; totalDifferenceMil: number; withDifference: number; list: { id: string; openedAt: string; openedBy: string; status: string; differenceMil: number | null }[] };
  discounts: { manual: number; offer: number; loyalty: number };
  cancellations: Record<string, { count: number; amountMil: number }>;
  loyalty: { earned: number; redeemed: number };
  qrOrders: number;
  depreciationMil: number;
  waiters: { userId: string | null; name: string; visitsServed: number; covers: number; revenueMil: number; workedMinutes: number }[];
}

const today = () => tunisClock(new Date()).date;
const daysAgo = (n: number) => tunisClock(new Date(Date.now() - n * 86_400_000)).date;

const Period: React.FC<{ value: { from: string; to: string }; onChange: (v: { from: string; to: string }) => void }> = ({ value, onChange }) => (
  <div className="flex flex-wrap gap-2 items-end">
    <Field label="Du"><input type="date" className={inputCls} value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} /></Field>
    <Field label="Au"><input type="date" className={inputCls} value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} /></Field>
    <Btn size="sm" onClick={() => onChange({ from: today(), to: today() })}>Jour</Btn>
    <Btn size="sm" onClick={() => onChange({ from: daysAgo(6), to: today() })}>Semaine</Btn>
    <Btn size="sm" onClick={() => onChange({ from: `${today().slice(0, 8)}01`, to: today() })}>Mois</Btn>
  </div>
);

const Kpi: React.FC<{ label: string; children: React.ReactNode; hint?: string; tone?: 'red' | 'amber' }> = ({ label, children, hint, tone }) => (
  <div className={cx('rounded-2xl border p-3 bg-white', tone === 'red' ? 'border-red-200' : tone === 'amber' ? 'border-amber-200' : 'border-gray-100')}>
    <p className="text-xs text-gray-500">{label}</p>
    <p className="text-xl font-bold">{children}</p>
    {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
  </div>
);

const exportPdf = (d: Dashboard) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFontSize(16);
  doc.text('Café Noir — Rapport de période', 14, 16);
  doc.setFontSize(10);
  doc.text(`Du ${d.from} au ${d.to} · généré le ${new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Tunis' })}`, 14, 23);
  const rows: [string, string][] = [
    ["Chiffre d'affaires caisse (net des avoirs)", formatDt(d.revenue.registerMil)],
    ['Ventes saisies ou importées', formatDt(d.revenue.manualMil)],
    ["Chiffre d'affaires total", formatDt(d.revenue.totalMil)],
    ['Tickets', String(d.tickets)],
    ['Panier moyen par ticket', formatDt(d.averageTicketMil)],
    ['Couverts', String(d.covers)],
    ['Dépense moyenne par couvert', formatDt(d.averagePerCoverMil)],
    ...(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m): [string, string] => [`Encaissements ${PAYMENT_METHOD_LABELS[m]}`, formatDt(d.paymentsByMethod[m])]),
    ['Remboursements', formatDt(d.refundsMil)],
    ['Sessions de caisse (écart cumulé)', `${d.sessions.count} (${formatDt(d.sessions.totalDifferenceMil)})`],
    ['Remises manuelles', formatDt(d.discounts.manual)],
    ['Offres', formatDt(d.discounts.offer)],
    ['Avantages fidélité', formatDt(d.discounts.loyalty)],
    ['Annulations acceptées', `${d.cancellations.approved?.count ?? 0} (${formatDt(d.cancellations.approved?.amountMil ?? 0)})`],
    ['Points fidélité acquis / utilisés', `${d.loyalty.earned} / ${d.loyalty.redeemed}`],
    ['Commandes QR', String(d.qrOrders)],
    ['Dotation aux amortissements', formatDt(d.depreciationMil)],
  ];
  autoTable(doc, { startY: 28, head: [['Indicateur', 'Valeur']], body: rows, styles: { fontSize: 9 }, headStyles: { fillColor: [5, 150, 105] } });
  autoTable(doc, {
    head: [['Serveur', 'Tables', 'Couverts', 'CA attribué', 'Heures']],
    body: d.waiters.map((w) => [w.userId ? w.name : 'Non attribué', String(w.visitsServed), String(w.covers), formatDt(w.revenueMil), formatMinutes(w.workedMinutes)]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [5, 150, 105] },
  });
  doc.save(`rapport-cafe-noir-${d.from}-${d.to}.pdf`);
};

export const DirectionDashboardPage: React.FC = () => {
  const [range, setRange] = useState({ from: today(), to: today() });
  const d = useLoader(() => apiGet<Dashboard>(`/pos/dashboard?from=${range.from}&to=${range.to}`), [range]);
  usePosEvents(['floor.changed', 'orders.changed', 'cash.changed', 'actions.changed', 'reservations.changed'], () => void d.reload(), 30_000);
  const data = d.data;
  return (
    <div className="space-y-4">
      <PageHeader icon={LayoutDashboard} title="Tableau de bord de la direction" actions={data && <Btn onClick={() => exportPdf(data)}><FileDown size={14} /> Rapport PDF</Btn>} />
      <ErrorNote message={d.error} />
      {!data ? <Loading /> : (
        <>
          <Card title="En ce moment">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              <Kpi label="Tables ouvertes" hint={data.live.openTables ? `${data.live.averageOpenMinutes} min en moyenne` : undefined}>{data.live.openTables}</Kpi>
              <Kpi label="Commandes QR à valider" tone={data.live.pendingQrOrders ? 'amber' : undefined}>{data.live.pendingQrOrders}</Kpi>
              <Kpi label="Appels serveur" tone={data.live.waiterCalls ? 'red' : undefined}>{data.live.waiterCalls}</Kpi>
              <Kpi label="Additions demandées" tone={data.live.billsRequested ? 'amber' : undefined}>{data.live.billsRequested}</Kpi>
              <Kpi label="Annulations à décider" tone={data.live.pendingCancellations ? 'amber' : undefined}>{data.live.pendingCancellations}</Kpi>
              <Kpi label="Réservations à traiter">{data.live.reservationsToHandle}</Kpi>
              <Kpi label="Additions ouvertes" hint="Non comptées dans le CA">{data.live.openBills}</Kpi>
              <Kpi label="Reste à encaisser"><Money mil={data.live.openBillsDueMil} /></Kpi>
            </div>
          </Card>
          <Period value={range} onChange={setRange} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Chiffre d'affaires" hint={`Caisse ${formatDt(data.revenue.registerMil)} · saisies ${formatDt(data.revenue.manualMil)}`}><Money mil={data.revenue.totalMil} /></Kpi>
            <Kpi label="Panier moyen par ticket" hint={`${data.tickets} ticket(s)`}><Money mil={data.averageTicketMil} /></Kpi>
            <Kpi label="Dépense moyenne par couvert" hint={`${data.covers} couvert(s)${data.visitsWithoutCovers ? ` · ${data.visitsWithoutCovers} visite(s) sans couverts exclue(s)` : ''}`}><Money mil={data.averagePerCoverMil} /></Kpi>
            <Kpi label="Avoirs / remboursements" hint={`Remboursé ${formatDt(data.refundsMil)}`}><Money mil={data.revenue.creditNotesMil} /></Kpi>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <Card title="Encaissements par mode">
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => <p key={m} className="text-sm flex justify-between"><span>{PAYMENT_METHOD_LABELS[m]}</span><Money mil={data.paymentsByMethod[m]} /></p>)}
            </Card>
            <Card title="Remises et avantages">
              <p className="text-sm flex justify-between"><span>Remises manuelles</span><Money mil={data.discounts.manual} /></p>
              <p className="text-sm flex justify-between"><span>Offres</span><Money mil={data.discounts.offer} /></p>
              <p className="text-sm flex justify-between"><span>Fidélité</span><Money mil={data.discounts.loyalty} /></p>
              <p className="text-xs text-gray-500">Points acquis {data.loyalty.earned} · utilisés {data.loyalty.redeemed}</p>
            </Card>
            <Card title="Caisse, annulations, équipements">
              <p className="text-sm flex justify-between"><span>Sessions</span><span>{data.sessions.count}</span></p>
              <p className={cx('text-sm flex justify-between', data.sessions.totalDifferenceMil ? 'text-red-600' : '')}><span>Écarts cumulés ({data.sessions.withDifference})</span><Money mil={data.sessions.totalDifferenceMil} /></p>
              <p className="text-sm flex justify-between"><span>Annulations acceptées</span><span>{data.cancellations.approved?.count ?? 0} · <Money mil={data.cancellations.approved?.amountMil ?? 0} /></span></p>
              <p className="text-sm flex justify-between"><span>Commandes QR</span><span>{data.qrOrders}</span></p>
              <p className="text-sm flex justify-between"><span>Dotation aux amortissements</span><Money mil={data.depreciationMil} /></p>
            </Card>
          </div>
          <Card title="Activité des serveurs">
            {data.waiters.length === 0 ? <Empty>Aucune activité sur la période.</Empty> : (
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 text-left"><tr><th className="py-1">Serveur</th><th>Tables</th><th>Couverts</th><th>CA attribué</th><th>Heures</th></tr></thead>
                <tbody className="divide-y divide-gray-100">{data.waiters.map((w) => <tr key={w.userId ?? 'none'}><td className="py-1.5">{w.userId ? w.name : <em>Non attribué</em>}</td><td>{w.visitsServed}</td><td>{w.covers}</td><td><Money mil={w.revenueMil} /></td><td>{formatMinutes(w.workedMinutes)}</td></tr>)}</tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
};

interface SalesReport {
  rows: { ticketNumber: string | null; saleStatus: string; at: string; table: string; waiter: string; category: string; product: string; quantity: number; grossMil: number; discountMil: number; totalMil: number; lineStatus: string }[];
  waiters: string[];
  categories: string[];
  sessions: { id: string; openedAt: string; openedBy: string }[];
}

export const SalesReportPage: React.FC = () => {
  const [f, setF] = useState({ from: daysAgo(6), to: today(), waiter: '', category: '', status: 'completed', sessionId: '' });
  const query = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  const report = useLoader(() => apiGet<SalesReport>(`/pos/reports/sales?${query}`), [query]);
  const rows = report.data?.rows ?? [];
  const download = (kind: 'csv' | 'xlsx') => {
    const data = rows.map((r) => ({ Ticket: r.ticketNumber ?? '', Date: dateTime(r.at), Table: r.table, Serveur: r.waiter, Catégorie: r.category, Produit: r.product, Quantité: r.quantity, 'Brut (DT)': formatDt(r.grossMil, false), 'Remise (DT)': formatDt(r.discountMil, false), 'Total (DT)': formatDt(r.totalMil, false), État: r.lineStatus === 'active' ? 'Vendu' : 'Annulé' }));
    if (kind === 'csv') {
      const url = URL.createObjectURL(new Blob([`﻿${Papa.unparse(data, { delimiter: ';' })}`], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `ventes-${f.from}-${f.to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      void import('xlsx').then((XLSX) => {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Ventes');
        XLSX.writeFile(wb, `ventes-${f.from}-${f.to}.xlsx`);
      });
    }
  };
  const active = rows.filter((r) => r.lineStatus === 'active');
  return (
    <div className="space-y-4">
      <PageHeader icon={Table2} title="Rapport des ventes (caisse)" actions={<><Btn onClick={() => download('csv')} disabled={!rows.length}><Download size={14} /> CSV</Btn><Btn onClick={() => download('xlsx')} disabled={!rows.length}><Download size={14} /> Excel</Btn></>} />
      <Card>
        <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <Field label="Du"><input type="date" className={inputCls} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
          <Field label="Au"><input type="date" className={inputCls} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
          <Field label="Serveur"><select className={inputCls} value={f.waiter} onChange={(e) => setF({ ...f, waiter: e.target.value })}><option value="">Tous</option>{(report.data?.waiters ?? []).map((w) => <option key={w}>{w}</option>)}</select></Field>
          <Field label="Catégorie"><select className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">Toutes</option>{(report.data?.categories ?? []).map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="État"><select className={inputCls} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="completed">Réglées</option><option value="open">Ouvertes</option><option value="">Toutes</option></select></Field>
          <Field label="Session"><select className={inputCls} value={f.sessionId} onChange={(e) => setF({ ...f, sessionId: e.target.value })}><option value="">Toutes</option>{(report.data?.sessions ?? []).map((s) => <option key={s.id} value={s.id}>{dateTime(s.openedAt)} — {s.openedBy}</option>)}</select></Field>
        </div>
      </Card>
      <ErrorNote message={report.error} />
      <Card title={`${active.reduce((s, r) => s + r.quantity, 0)} article(s) · ${formatDt(active.reduce((s, r) => s + r.totalMil, 0))} (avant remises de ticket)`}>
        {report.loading ? <Loading /> : rows.length === 0 ? <Empty>Aucune vente.</Empty> : (
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 text-left sticky top-0 bg-white"><tr><th className="py-1">Ticket</th><th>Date</th><th>Table</th><th>Serveur</th><th>Produit</th><th>Qté</th><th>Total</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, i) => (
                  <tr key={i} className={r.lineStatus !== 'active' ? 'text-gray-400 line-through' : ''}>
                    <td className="py-1 font-mono text-xs">{r.ticketNumber ?? '—'}</td><td>{dateTime(r.at)}</td><td>{r.table}</td><td>{r.waiter}</td><td>{r.product}</td><td>{r.quantity}</td><td><Money mil={r.totalMil} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

interface JournalRow { id: string; at: string; user: string; module: string; action: string; description: string; entity: string | null; before: unknown; after: unknown }

export const JournalPage: React.FC = () => {
  const [f, setF] = useState({ from: daysAgo(6), to: today(), module: '' });
  const [open, setOpen] = useState<string | null>(null);
  const journal = useLoader(() => apiGet<{ rows: JournalRow[]; modules: string[] }>(`/pos/journal?from=${f.from}&to=${f.to}${f.module ? `&module=${encodeURIComponent(f.module)}` : ''}`), [f]);
  return (
    <div className="space-y-4">
      <PageHeader icon={History} title="Journal détaillé" subtitle="Non modifiable. Valeurs avant / après des opérations sensibles. Les secrets ne sont jamais enregistrés." />
      <div className="flex flex-wrap gap-2 items-end">
        <Field label="Du"><input type="date" className={inputCls} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="Au"><input type="date" className={inputCls} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        <Field label="Module"><select className={inputCls} value={f.module} onChange={(e) => setF({ ...f, module: e.target.value })}><option value="">Tous</option>{(journal.data?.modules ?? []).map((m) => <option key={m}>{m}</option>)}</select></Field>
      </div>
      <ErrorNote message={journal.error} />
      <Card>
        {journal.loading ? <Loading /> : (journal.data?.rows ?? []).length === 0 ? <Empty>Aucune entrée.</Empty> : (
          <ul className="divide-y divide-gray-100 text-sm">
            {journal.data!.rows.map((r) => (
              <li key={r.id} className="py-1.5">
                <button className="w-full text-left flex flex-wrap gap-2 items-center" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <span className="text-xs text-gray-500 w-32">{dateTime(r.at)}</span>
                  <Badge>{r.module}</Badge>
                  <span className="font-semibold">{r.action}</span>
                  <span className="flex-1 text-gray-700">{r.description}</span>
                  <span className="text-xs text-gray-500">{r.user}</span>
                </button>
                {open === r.id && (r.before !== null || r.after !== null) && (
                  <div className="grid md:grid-cols-2 gap-2 mt-2 text-xs">
                    <pre className="bg-gray-50 rounded-lg p-2 overflow-x-auto">Avant : {JSON.stringify(r.before, null, 2)}</pre>
                    <pre className="bg-emerald-50 rounded-lg p-2 overflow-x-auto">Après : {JSON.stringify(r.after, null, 2)}</pre>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};
