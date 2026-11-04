import React, { useEffect, useState } from 'react';
import { Monitor, LogOut, Eye, ShieldCheck, History as HistoryIcon, Loader2, AlertCircle } from 'lucide-react';
import { getSessions, revokeSession, ActiveSessionInfo, SessionHistoryEvent } from '../api/auth';
import { ApiError } from '../api/client';

interface SessionsPageProps {
  fullName: string;
  onNavigateToDashboard: () => void;
  onCurrentSessionRevoked: () => void;
}

const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const SessionsPage: React.FC<SessionsPageProps> = ({ fullName, onNavigateToDashboard, onCurrentSessionRevoked }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveSessionInfo[]>([]);
  const [history, setHistory] = useState<SessionHistoryEvent[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getSessions();
      setActive(res.active);
      setHistory(res.history);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de charger les sessions.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRevoke = async (session: ActiveSessionInfo) => {
    if (revokingId) return;
    const confirmed = window.confirm(
      session.isCurrent
        ? 'Voulez-vous vous déconnecter de cette session (celle utilisée actuellement) ?'
        : `Voulez-vous déconnecter l'appareil « ${session.device} » ?`
    );
    if (!confirmed) return;

    setRevokingId(session.id);
    try {
      const res = await revokeSession(session.id);
      if (res.revokedCurrentSession) {
        onCurrentSessionRevoked();
        return;
      }
      await load();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Page Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldCheck size={20} className="text-emerald-500" />
            <span>Sessions &amp; appareils</span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">{fullName}</p>
        </div>
        <button
          onClick={onNavigateToDashboard}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700/80 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition active:scale-98 cursor-pointer"
        >
          <span>Tableau de bord</span>
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2 text-xs">
          <Loader2 size={16} className="animate-spin" /> Chargement…
        </div>
      ) : error ? (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      ) : (
        <>
          {/* Sessions actives */}
          <section className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-3">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
              <Monitor size={15} className="text-emerald-500" />
              Sessions actives
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                {active.length}
              </span>
            </h2>
            <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[640px]">
                  <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400">
                    <tr>
                      <th className="text-left font-semibold px-3 py-2">Utilisateur</th>
                      <th className="text-left font-semibold px-3 py-2">Activité</th>
                      <th className="text-left font-semibold px-3 py-2">Date</th>
                      <th className="text-left font-semibold px-3 py-2">Localisation</th>
                      <th className="text-left font-semibold px-3 py-2">Appareil</th>
                      <th className="text-right font-semibold px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {active.map((s) => (
                      <React.Fragment key={s.id}>
                        <tr className={s.isCurrent ? 'bg-emerald-50/40 dark:bg-emerald-950/10' : ''}>
                          <td className="px-3 py-2.5 font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">{fullName}</td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                              {s.isCurrent ? 'Session actuelle' : 'Active'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDateTime(s.loginTime)}</td>
                          <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400">{s.location}</td>
                          <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400">{s.device}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer"
                                title="Voir les détails"
                              >
                                <Eye size={14} />
                              </button>
                              <button
                                onClick={() => handleRevoke(s)}
                                disabled={revokingId === s.id}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer disabled:opacity-50"
                                title="Déconnecter"
                              >
                                {revokingId === s.id ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expandedId === s.id && (
                          <tr>
                            <td colSpan={6} className="px-3 pb-3 pt-0 bg-gray-50/60 dark:bg-gray-900/40">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 p-3 rounded-lg bg-white dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700 text-[11px]">
                                <div>
                                  <span className="text-gray-400">Adresse IP : </span>
                                  <span className="font-semibold text-gray-700 dark:text-gray-200">{s.ipAddress}</span>
                                </div>
                                <div>
                                  <span className="text-gray-400">Appareil / navigateur : </span>
                                  <span className="font-semibold text-gray-700 dark:text-gray-200">{s.device}</span>
                                </div>
                                <div>
                                  <span className="text-gray-400">Localisation approximative : </span>
                                  <span className="font-semibold text-gray-700 dark:text-gray-200">{s.location}</span>
                                </div>
                                <div>
                                  <span className="text-gray-400">Connexion le : </span>
                                  <span className="font-semibold text-gray-700 dark:text-gray-200">{formatDateTime(s.loginTime)}</span>
                                </div>
                                <div>
                                  <span className="text-gray-400">Dernière activité : </span>
                                  <span className="font-semibold text-gray-700 dark:text-gray-200">{formatDateTime(s.lastSeenAt)}</span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                    {active.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                          Aucune session active.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Historique des connexions */}
          <section className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-3">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
              <HistoryIcon size={15} className="text-gray-400" />
              Historique des connexions
            </h2>
            <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[640px]">
                  <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400">
                    <tr>
                      <th className="text-left font-semibold px-3 py-2">Utilisateur</th>
                      <th className="text-left font-semibold px-3 py-2">Activité</th>
                      <th className="text-left font-semibold px-3 py-2">Date</th>
                      <th className="text-left font-semibold px-3 py-2">Localisation</th>
                      <th className="text-left font-semibold px-3 py-2">Appareil</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {history.map((h, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">{fullName}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`text-[11px] font-semibold ${
                              h.activity === 'Connexion' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'
                            }`}
                          >
                            {h.activity}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDateTime(h.date)}</td>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{h.location}</td>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{h.device}</td>
                      </tr>
                    ))}
                    {history.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                          Aucun historique pour le moment.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
