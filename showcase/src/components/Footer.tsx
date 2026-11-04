import { Linkedin, Mail, MapPin, MessageCircle, Phone, Youtube } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SocialPlatform } from '../../../src/data/showcaseSettingsModel';
import { CREDIT, SITE } from '../config/site';
import { phoneHref, useSiteInfo } from '../lib/siteInfo';
import { Logo } from './Logo';
import { Reveal } from './ui/Reveal';

const SOCIAL_ICONS: Record<SocialPlatform, ReactNode> = {
  instagram: (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden>
      <path d="M13.5 21v-8h2.7l.5-3.2h-3.2V7.9c0-.9.4-1.7 1.8-1.7h1.5V3.4c-.3 0-1.3-.2-2.5-.2-2.6 0-4.3 1.6-4.3 4.4v2.2H7v3.2h2.5v8h4z" />
    </svg>
  ),
  tiktok: (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden>
      <path d="M16.6 3h-3.1v11.7a2.7 2.7 0 1 1-2.7-2.7c.3 0 .6 0 .8.1V8.9a5.8 5.8 0 1 0 5 5.7V8.7a7 7 0 0 0 4 1.3V6.9A4.1 4.1 0 0 1 16.6 3z" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117Z" />
    </svg>
  ),
  youtube: <Youtube size={18} aria-hidden />,
  whatsapp: <MessageCircle size={17} aria-hidden />,
  linkedin: <Linkedin size={17} aria-hidden />,
};

const SOCIAL_LABELS: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  whatsapp: 'WhatsApp',
  x: 'X (Twitter)',
  linkedin: 'LinkedIn',
};

export function Footer() {
  const info = useSiteInfo();
  const hasSocials = info.socials.length > 0;

  return (
    <footer id="contact" className="scroll-mt-16 border-t border-line lg:scroll-mt-[72px]">
      <Reveal
        as="div"
        className={`mx-auto grid max-w-[1240px] gap-10 px-5 py-12 sm:grid-cols-2 sm:px-8 lg:gap-12 lg:px-12 lg:py-14 ${
          hasSocials ? 'lg:grid-cols-[1fr_1.05fr_0.6fr_1.7fr]' : 'lg:grid-cols-[1fr_1.05fr_1.9fr]'
        }`}
      >
        <div>
          <Logo />
          <p className="mt-3 text-sm text-subtle">{info.tagline}</p>
          <p className="mt-5 max-w-[15rem] text-[13px] leading-relaxed text-muted">{info.hours}</p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-ink">Contact</h3>
          <ul className="mt-4 space-y-3.5 text-[13px] text-muted">
            {info.phone && (
              <li className="flex items-start gap-3">
                <Phone size={14} className="mt-0.5 shrink-0 text-ink" aria-hidden />
                <a href={phoneHref(info.phone)} className="hover:text-ink">
                  {info.phone}
                </a>
              </li>
            )}
            <li className="flex items-start gap-3">
              <MapPin size={14} className="mt-0.5 shrink-0 text-ink" aria-hidden />
              <a href={info.mapUrl} target="_blank" rel="noopener noreferrer" className="max-w-[14rem] leading-relaxed hover:text-ink">
                {info.address}
              </a>
            </li>
            {info.email && (
              <li className="flex items-start gap-3">
                <Mail size={14} className="mt-0.5 shrink-0 text-ink" aria-hidden />
                <a href={`mailto:${info.email}`} className="break-all hover:text-ink">
                  {info.email}
                </a>
              </li>
            )}
          </ul>
        </div>

        {hasSocials && (
          <div>
            <h3 className="text-sm font-semibold text-ink">Suivez-nous</h3>
            <ul className="mt-4 flex flex-wrap gap-5 text-ink">
              {info.socials.map((s) => (
                <li key={s.platform}>
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={SOCIAL_LABELS[s.platform]}
                    title={SOCIAL_LABELS[s.platform]}
                    className="inline-flex transition-[color,transform] duration-300 hover:-translate-y-0.5 hover:text-accent"
                  >
                    {SOCIAL_ICONS[s.platform]}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* The interactive Google map (drag, zoom, full screen). Its address comes from the site info. */}
        <div className="h-64 overflow-hidden rounded-xl border border-line bg-section sm:col-span-2 sm:h-72 lg:col-span-1 lg:h-64">
          <iframe
            title={`Plan d’accès — ${SITE.name}`}
            src={info.mapEmbedUrl}
            loading="lazy"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="h-full w-full border-0 dark:[filter:invert(92%)_hue-rotate(180deg)_saturate(0.7)]"
          />
        </div>
      </Reveal>

      <div className="border-t border-line">
        <div className="mx-auto flex max-w-[1240px] flex-col items-center justify-between gap-1.5 px-5 py-5 text-center text-[11px] text-subtle sm:flex-row sm:px-8 sm:text-left lg:px-12">
          <p>
            © {new Date().getFullYear()} {SITE.name}. Tous droits réservés.
          </p>
          <p className="flex items-center gap-1.5">
            Site réalisé par{' '}
            <a href={CREDIT.href} target="_blank" rel="noopener noreferrer" aria-label={CREDIT.name} className="inline-flex items-center opacity-80 transition-opacity hover:opacity-100">
              <img src="/creative-comet-logo.png" alt={CREDIT.name} className="h-3.5 w-auto dark:hidden" />
              <img src="/creative-comet-logo-dark.png" alt={CREDIT.name} className="hidden h-3.5 w-auto dark:block" />
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
