import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Globe,
  Loader2,
  MapPin,
  Plus,
  RotateCcw,
  Save,
  Share2,
  Trash2,
  Undo2,
} from 'lucide-react';
import { getShowcaseSettings, resetShowcaseSettings, saveShowcaseSettings, type ShowcaseSettingsResponse } from '../api/showcaseSettings';
import {
  SOCIAL_PLATFORMS,
  extractEmbedUrl,
  isGoogleEmbedUrl,
  validateShowcaseSiteInfo,
  type ShowcaseSiteInfo,
  type SocialPlatform,
} from '../data/showcaseSettingsModel';
import { useUnsavedWorkGuard } from '../hooks/useUnsavedWorkGuard';

const SITE_ADDRESS = 'https://cafenoir.tn';

const inputClass =
  'w-full px-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:border-emerald-500 focus:ring-emerald-500 transition';
const labelClass = 'text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1.5 block';
const hintClass = 'text-[11px] text-gray-400 mt-1';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-2xs transition active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';

const sameInfo = (a: ShowcaseSiteInfo, b: ShowcaseSiteInfo): boolean => JSON.stringify(a) === JSON.stringify(b);

const formatWhen = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div>
    <label className={labelClass}>{label}</label>
    {children}
    {hint && <p className={hintClass}>{hint}</p>}
  </div>
);

const errorText = (err: unknown): string => (err instanceof Error && err.message ? err.message : "Une erreur est survenue. Réessayez.");

/**
 * Paramètres → "Site vitrine": everything the public site (cafenoir.tn) shows besides the menu —
 * contact details, opening hours, social links and the Google map. The catalogue itself is managed
 * in Gestion des produits; the "Site réalisé par Creative Comet" credit is fixed in the site.
 */
export const ShowcaseSettingsSection: React.FC = () => {
  const [saved, setSaved] = useState<ShowcaseSettingsResponse | null>(null);
  const [draft, setDraft] = useState<ShowcaseSiteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [busyReset, setBusyReset] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [savedNotice, setSavedNotice] = useState(false);
  const [newPlatform, setNewPlatform] = useState<SocialPlatform | ''>('');

  const load = async () => {
    setLoadError(null);
    try {
      const res = await getShowcaseSettings();
      setSaved(res);
      setDraft(res.info);
    } catch (err) {
      setLoadError(errorText(err));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const isDirty = useMemo(() => Boolean(saved && draft && !sameInfo(saved.info, draft)), [saved, draft]);
  useUnsavedWorkGuard(isDirty);

  const update = (patch: Partial<ShowcaseSiteInfo>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setErrors([]);
    setSavedNotice(false);
  };

  const setSocialHref = (platform: SocialPlatform, href: string) =>
    update({ socials: (draft?.socials ?? []).map((s) => (s.platform === platform ? { ...s, href } : s)) });
  const removeSocial = (platform: SocialPlatform) => update({ socials: (draft?.socials ?? []).filter((s) => s.platform !== platform) });
  const addSocial = () => {
    if (!newPlatform || !draft) return;
    update({ socials: [...draft.socials, { platform: newPlatform, href: '' }] });
    setNewPlatform('');
  };

  if (loadError) {
    return (
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-3">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white inline-flex items-center gap-2">
          <Globe size={15} className="text-emerald-500" /> Site vitrine
        </h2>
        <p className="text-xs text-red-600 dark:text-red-400 inline-flex items-center gap-2">
          <AlertCircle size={13} /> {loadError}
        </p>
        <button onClick={() => void load()} className={secondaryButtonClass}>
          <RotateCcw size={13} /> Réessayer
        </button>
      </div>
    );
  }

  if (!draft || !saved) {
    return (
      <div className="p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex items-center gap-2 text-xs text-gray-500">
        <Loader2 size={14} className="animate-spin" /> Chargement des informations du site vitrine…
      </div>
    );
  }

  const usedPlatforms = new Set(draft.socials.map((s) => s.platform));
  const availablePlatforms = SOCIAL_PLATFORMS.filter((p) => !usedPlatforms.has(p.id));
  const embedOk = isGoogleEmbedUrl(draft.mapEmbedUrl);

  const handleSave = async () => {
    const problems = validateShowcaseSiteInfo(draft);
    if (problems.length > 0) {
      setErrors(problems);
      return;
    }
    setIsSaving(true);
    setErrors([]);
    try {
      const res = await saveShowcaseSettings(draft);
      setSaved(res);
      setDraft(res.info);
      setSavedNotice(true);
    } catch (err) {
      setErrors([errorText(err)]);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setBusyReset(true);
    setErrors([]);
    try {
      const res = await resetShowcaseSettings();
      setSaved(res);
      setDraft(res.info);
      setConfirmReset(false);
      setSavedNotice(true);
    } catch (err) {
      setErrors([errorText(err)]);
    } finally {
      setBusyReset(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white inline-flex items-center gap-2">
              <Globe size={15} className="text-emerald-500" /> Site vitrine — cafenoir.tn
            </h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 max-w-2xl">
              Coordonnées, horaires, réseaux sociaux et plan affichés sur le site public. Les modifications apparaissent sur le
              site en quelques secondes, sans rien redéployer. Les produits et catégories, eux, se gèrent dans « Gestion des
              produits ». Le crédit « Site réalisé par Creative Comet » est fixe.
            </p>
          </div>
          <a
            href={SITE_ADDRESS}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline shrink-0"
          >
            Ouvrir le site <ExternalLink size={12} />
          </a>
        </div>

        {/* Coordonnées */}
        <section className="space-y-3.5">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">Coordonnées et horaires</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field label="Phrase d’accroche *" hint="Sous le logo du pied de page et au-dessus du titre d’accueil.">
              <input className={inputClass} value={draft.tagline} maxLength={80} onChange={(e) => update({ tagline: e.target.value })} />
            </Field>
            <Field label="Adresse *">
              <input className={inputClass} value={draft.address} maxLength={200} onChange={(e) => update({ address: e.target.value })} />
            </Field>
            <Field label="Téléphone" hint="Laissez vide pour ne pas l’afficher.">
              <input className={inputClass} inputMode="tel" value={draft.phone} maxLength={30} placeholder="+216 71 000 000" onChange={(e) => update({ phone: e.target.value })} />
            </Field>
            <Field label="E-mail" hint="Laissez vide pour ne pas l’afficher.">
              <input className={inputClass} type="email" value={draft.email} maxLength={120} placeholder="contact@cafenoir.tn" onChange={(e) => update({ email: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Horaires (texte affiché) *">
                <input className={inputClass} value={draft.hours} maxLength={200} onChange={(e) => update({ hours: e.target.value })} />
              </Field>
            </div>
            <Field label="Ouverture (pour Google)" hint="Tous les jours, de l’ouverture à la fermeture.">
              <input className={inputClass} type="time" value={draft.opensAt} onChange={(e) => update({ opensAt: e.target.value })} />
            </Field>
            <Field label="Fermeture (pour Google)">
              <input className={inputClass} type="time" value={draft.closesAt} onChange={(e) => update({ closesAt: e.target.value })} />
            </Field>
            <Field label="Ville (pour Google) *">
              <input className={inputClass} value={draft.city} maxLength={80} onChange={(e) => update({ city: e.target.value })} />
            </Field>
            <Field label="Code postal (pour Google)">
              <input className={inputClass} value={draft.postalCode} maxLength={12} onChange={(e) => update({ postalCode: e.target.value })} />
            </Field>
          </div>
        </section>

        {/* Réseaux sociaux */}
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 inline-flex items-center gap-1.5">
            <Share2 size={12} /> Réseaux sociaux
          </h3>
          <p className={hintClass + ' !mt-0'}>Un réseau sans adresse n’est pas affiché sur le site. Les adresses doivent commencer par https://.</p>
          {draft.socials.length === 0 && <p className="text-xs text-gray-400">Aucun réseau. Ajoutez-en un ci-dessous.</p>}
          <ul className="space-y-2">
            {draft.socials.map((s) => {
              const meta = SOCIAL_PLATFORMS.find((p) => p.id === s.platform);
              return (
                <li key={s.platform} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-xs font-semibold text-gray-700 dark:text-gray-200">{meta?.label ?? s.platform}</span>
                  <input
                    className={inputClass}
                    value={s.href}
                    inputMode="url"
                    placeholder={meta?.placeholder}
                    aria-label={`Adresse ${meta?.label ?? s.platform}`}
                    onChange={(e) => setSocialHref(s.platform, e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => removeSocial(s.platform)}
                    title="Retirer ce réseau"
                    aria-label={`Retirer ${meta?.label ?? s.platform}`}
                    className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
          {availablePlatforms.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <select
                value={newPlatform}
                onChange={(e) => setNewPlatform(e.target.value as SocialPlatform | '')}
                aria-label="Réseau à ajouter"
                className={`${inputClass} !w-auto cursor-pointer`}
              >
                <option value="">Ajouter un réseau…</option>
                {availablePlatforms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <button type="button" onClick={addSocial} disabled={!newPlatform} className={secondaryButtonClass}>
                <Plus size={13} /> Ajouter
              </button>
            </div>
          )}
        </section>

        {/* Plan Google Maps */}
        <section className="space-y-3.5">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 inline-flex items-center gap-1.5">
            <MapPin size={12} /> Plan Google Maps
          </h3>
          <Field
            label="Plan interactif (code d’intégration) *"
            hint="Google Maps → Partager → Intégrer une carte → copiez le code HTML ; vous pouvez le coller en entier, seule l’adresse (src) est conservée."
          >
            <textarea
              rows={3}
              className={`${inputClass} font-mono !text-[11px]`}
              value={draft.mapEmbedUrl}
              onChange={(e) => update({ mapEmbedUrl: e.target.value })}
              onBlur={(e) => {
                const extracted = extractEmbedUrl(e.target.value);
                if (extracted !== e.target.value) update({ mapEmbedUrl: extracted });
              }}
              spellCheck={false}
            />
          </Field>
          <Field label="Lien du lieu sur Google Maps (bouton « Nous trouver ») *" hint="L’adresse de la fiche du lieu, ouverte dans un nouvel onglet.">
            <input className={inputClass} value={draft.mapUrl} inputMode="url" onChange={(e) => update({ mapUrl: e.target.value })} />
          </Field>
          <div>
            <p className={labelClass}>Aperçu (interactif, comme sur le site)</p>
            {embedOk ? (
              <div className="h-56 sm:h-64 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                <iframe
                  title="Aperçu du plan"
                  src={extractEmbedUrl(draft.mapEmbedUrl)}
                  className="h-full w-full border-0"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-400 inline-flex items-center gap-1.5">
                <AlertCircle size={13} /> Collez le code d’intégration Google Maps pour voir l’aperçu.
              </p>
            )}
          </div>
        </section>
      </div>

      {errors.length > 0 && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60" role="alert">
          <p className="text-sm font-bold text-red-700 dark:text-red-300 inline-flex items-center gap-2 mb-1.5">
            <AlertCircle size={16} /> {errors.length > 1 ? `${errors.length} points à corriger` : 'Enregistrement impossible'}
          </p>
          <ul className="text-xs text-red-600 dark:text-red-400 space-y-1 list-disc list-inside">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="p-4 rounded-2xl bg-white dark:bg-[#151D2A] border border-gray-100 dark:border-gray-800 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
          {savedNotice && !isDirty && (
            <p className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
              <CheckCircle2 size={13} /> Informations du site enregistrées.
            </p>
          )}
          {isDirty && <p className="text-amber-600 dark:text-amber-400 font-semibold">Modifications non enregistrées.</p>}
          <p>
            {saved.updatedAt
              ? `Dernière modification par ${saved.updatedBy ?? '—'} le ${formatWhen(saved.updatedAt)}.`
              : 'Jamais modifié : le site affiche les valeurs par défaut.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {confirmReset ? (
            <span className="inline-flex items-center gap-2 text-xs">
              <span className="text-red-600 dark:text-red-400 font-semibold">Tout remettre aux valeurs par défaut ?</span>
              <button type="button" onClick={handleReset} disabled={busyReset} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold cursor-pointer disabled:opacity-60">
                {busyReset ? <Loader2 size={12} className="animate-spin" /> : 'Oui, réinitialiser'}
              </button>
              <button type="button" onClick={() => setConfirmReset(false)} disabled={busyReset} className={secondaryButtonClass}>
                Non
              </button>
            </span>
          ) : (
            <>
              <button type="button" onClick={() => setConfirmReset(true)} className={secondaryButtonClass}>
                <RotateCcw size={13} /> Valeurs par défaut
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(saved.info);
                  setErrors([]);
                  setSavedNotice(false);
                }}
                disabled={!isDirty}
                className={secondaryButtonClass}
              >
                <Undo2 size={13} /> Annuler les modifications
              </button>
              <button type="button" onClick={handleSave} disabled={isSaving || !isDirty} className={primaryButtonClass}>
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                <span>{isSaving ? 'Enregistrement…' : 'Enregistrer'}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
