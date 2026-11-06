import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { apiGet } from '../api/client';
import { formatDt } from '../data/money';

// Écrans tournés vers les clients (amélioration 07). Read-only, full screen, large type.

const usePoll = <T,>(url: string, intervalMs: number): { data: T | null; error: string | null } => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      apiGet<T>(url)
        .then((d) => {
          if (alive) {
            setData(d);
            setError(null);
          }
        })
        .catch((e: Error) => alive && setError(e.message));
    load();
    const t = window.setInterval(load, intervalMs);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [url, intervalMs]);
  return { data, error };
};

const chime = () => {
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = f;
      osc.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.16);
    });
  } catch {
    // no audio: the board still updates
  }
};

// "Commandes prêtes": pickup numbers only — no name, no amount, no table.
export const ReadyBoardPage: React.FC = () => {
  const { data } = usePoll<{ preparing: number[]; ready: number[] }>('/client/ready-board', 4000);
  const previous = useRef<Set<number>>(new Set());
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (!data) return;
    const added = data.ready.filter((n) => !previous.current.has(n));
    if (previous.current.size > 0 && added.length) chime();
    previous.current = new Set(data.ready);
    setFresh(new Set(added));
    const t = window.setTimeout(() => setFresh(new Set()), 6000);
    return () => window.clearTimeout(t);
  }, [data]);
  return (
    <div className="fixed inset-0 bg-gray-950 text-white grid grid-cols-2" onClick={() => void document.documentElement.requestFullscreen?.()}>
      <section className="p-8 border-r border-gray-800">
        <h1 className="text-3xl font-bold text-amber-300 mb-6">En préparation</h1>
        <div className="flex flex-wrap gap-4">
          {(data?.preparing ?? []).map((n) => <span key={n} className="text-5xl font-black tabular-nums text-gray-300 w-28 text-center">{n}</span>)}
        </div>
      </section>
      <section className="p-8">
        <h1 className="text-3xl font-bold text-emerald-400 mb-6">Prêtes — à récupérer</h1>
        <div className="flex flex-wrap gap-4">
          {(data?.ready ?? []).map((n) => (
            <span key={n} className={`text-7xl font-black tabular-nums w-40 text-center rounded-2xl ${fresh.has(n) ? 'bg-emerald-500 text-gray-950 animate-pulse' : 'text-emerald-400'}`}>{n}</span>
          ))}
        </div>
      </section>
      <p className="absolute bottom-4 inset-x-0 text-center text-gray-500 text-lg">Café Noir — votre numéro est imprimé sur votre ticket</p>
    </div>
  );
};

interface DisplayResponse {
  state: {
    mode: 'idle' | 'cart' | 'payment' | 'thanks';
    lines: { name: string; quantity: number; totalMil: number }[];
    discountMil: number;
    totalMil: number;
    paidMil: number;
    dueMil: number;
    changeMil: number;
    pickupNumber: number | null;
    customerName: string | null;
    points: number | null;
  };
  idle: { offers: { name: string; kind: 'percent' | 'fixed'; value: number }[]; googleReviewUrl: string | null };
}

// Second screen next to the register: the customer follows the sale, the total and the change.
export const CustomerDisplayPage: React.FC<{ registerId: string }> = ({ registerId }) => {
  const key = new URLSearchParams(window.location.search).get('k') ?? '';
  const { data, error } = usePoll<DisplayResponse>(`/client/display/${encodeURIComponent(registerId)}?k=${encodeURIComponent(key)}`, 1000);
  const [qr, setQr] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    if (data?.idle.googleReviewUrl) void QRCode.toDataURL(data.idle.googleReviewUrl, { margin: 1, width: 260 }).then(setQr);
  }, [data?.idle.googleReviewUrl]);
  useEffect(() => {
    const t = window.setInterval(() => setSlide((s) => s + 1), 7000);
    return () => window.clearInterval(t);
  }, []);
  if (error) return <div className="fixed inset-0 bg-gray-950 text-white flex items-center justify-center text-2xl p-8 text-center">{error}</div>;
  if (!data) return <div className="fixed inset-0 bg-gray-950" />;
  const s = data.state;
  if (s.mode === 'idle') {
    const offers = data.idle.offers;
    const offer = offers.length ? offers[slide % offers.length] : null;
    return (
      <div className="fixed inset-0 bg-[#1c1410] text-amber-50 flex flex-col items-center justify-center gap-8 p-10 text-center" onClick={() => void document.documentElement.requestFullscreen?.()}>
        <p className="font-serif text-7xl font-bold">Café Noir</p>
        {offer && (
          <p className="text-4xl">
            {offer.name} <span className="text-amber-300 font-bold">{offer.kind === 'percent' ? `−${offer.value / 100} %` : `−${formatDt(offer.value)}`}</span>
          </p>
        )}
        {qr && (
          <div className="flex items-center gap-6">
            <img src={qr} alt="" className="w-40 h-40 rounded-xl bg-white p-2" />
            <p className="text-2xl text-left">Votre avis compte !<br /><span className="text-amber-300">Scannez pour nous noter</span></p>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="fixed inset-0 bg-[#1c1410] text-amber-50 grid grid-cols-[1.4fr_1fr]">
      <section className="p-10 overflow-hidden">
        <p className="font-serif text-4xl font-bold mb-6">Café Noir</p>
        <ul className="space-y-3 text-3xl">
          {s.lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-4"><span>{l.quantity} × {l.name}</span><span className="tabular-nums">{formatDt(l.totalMil, false)}</span></li>
          ))}
        </ul>
      </section>
      <section className="p-10 bg-black/30 flex flex-col justify-center gap-6 text-right">
        {s.discountMil > 0 && <p className="text-3xl text-emerald-300">Réductions −{formatDt(s.discountMil)}</p>}
        <p className="text-6xl font-black tabular-nums">{formatDt(s.totalMil)}</p>
        {s.mode === 'payment' && s.paidMil > 0 && <p className="text-3xl">Réglé {formatDt(s.paidMil)} · reste <strong>{formatDt(s.dueMil)}</strong></p>}
        {s.mode === 'thanks' && (
          <>
            {s.changeMil > 0 && <p className="text-5xl font-black text-amber-300">Monnaie : {formatDt(s.changeMil)}</p>}
            {s.pickupNumber && <p className="text-4xl">Votre numéro : <strong className="text-6xl">{s.pickupNumber}</strong></p>}
            <p className="text-4xl">Merci de votre visite !</p>
          </>
        )}
        {s.customerName && <p className="text-2xl text-amber-200">Bonjour {s.customerName}{s.points !== null && ` · ${s.points} points`}</p>}
      </section>
    </div>
  );
};
