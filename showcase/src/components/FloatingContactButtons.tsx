import { Coffee, MessageCircle } from 'lucide-react';
import { useSiteInfo } from '../lib/siteInfo';
import { Link } from '../lib/router';

/**
 * Persistent contact shortcuts, always on top of the page:
 * - Desktop (lg+): a single small round WhatsApp button, bottom-right.
 * - Mobile (below lg): a two-button bar pinned to the bottom of the screen (Menu + WhatsApp),
 *   which stays in place while the page scrolls (position: fixed, not part of page flow).
 * WhatsApp only ever shows if a real number is configured in Paramètres → Site vitrine — never a
 * made-up one.
 */
export function FloatingContactButtons() {
  const info = useSiteInfo();
  const whatsappHref = info.socials.find((s) => s.platform === 'whatsapp')?.href;

  return (
    <>
      {whatsappHref && (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Nous contacter sur WhatsApp"
          title="WhatsApp"
          className="soft-pulse-ring fixed bottom-6 right-6 z-40 hidden h-14 w-14 items-center justify-center rounded-full bg-brand text-on-brand shadow-[0_10px_30px_-8px] shadow-black/40 transition-transform duration-300 hover:scale-110 active:scale-95 lg:flex"
        >
          <MessageCircle size={24} strokeWidth={2} />
        </a>
      )}

      <div
        className="fixed inset-x-3 bottom-3 z-40 lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="bar-pop-in relative">
          {/* Soft ambient glow beneath the floating bar — reads as depth, not just a flat shadow. */}
          <div aria-hidden className="absolute inset-x-6 -bottom-2 -z-10 h-9 rounded-full bg-brand/35 blur-xl dark:bg-brand/20" />

          <div className="flex items-stretch gap-1 rounded-[22px] border border-line/70 bg-card/85 p-1.5 shadow-[0_18px_40px_-14px] shadow-black/35 backdrop-blur-xl">
            <Link
              to="/menu"
              className="group relative flex flex-1 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-[color-mix(in_srgb,var(--brand)_80%,black)] py-3.5 text-[13px] font-semibold text-on-brand transition-transform duration-200 active:scale-[0.96]"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-active:translate-x-full"
              />
              <Coffee size={17} strokeWidth={2.25} className="relative transition-transform duration-300 group-active:scale-90" />
              <span className="relative">Voir le menu</span>
            </Link>

            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-[13px] font-semibold text-ink transition-[background-color,transform] duration-200 active:scale-[0.96] active:bg-brand/10"
              >
                <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand transition-transform duration-300 group-active:scale-90">
                  <MessageCircle size={14} strokeWidth={2.4} />
                  <span aria-hidden className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
                  </span>
                </span>
                WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
