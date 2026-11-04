import { ArrowRight, MapPin } from 'lucide-react';
import { IMAGES } from '../config/site';
import { useSiteInfo } from '../lib/siteInfo';
import { Link } from '../lib/router';

export function Hero() {
  const info = useSiteInfo();
  return (
    <section id="accueil" className="relative scroll-mt-16 overflow-hidden lg:scroll-mt-[72px]">
      <div className="mx-auto flex max-w-[1240px] flex-col px-5 sm:px-8 lg:min-h-[560px] lg:flex-row lg:items-center lg:px-12">
        <div className="animate-fade-up relative z-10 py-12 sm:py-16 lg:w-[52%] lg:py-20">
          <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-subtle sm:text-xs">{info.tagline}</p>
          <h1 className="mt-5 font-serif text-[2.6rem] leading-[1.06] tracking-[-0.02em] text-ink sm:text-[3.4rem] lg:text-[3.75rem] xl:text-[4.25rem]">
            Plus qu’un café,
            <br />
            <em className="text-accent">une expérience.</em>
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted sm:text-[17px]">
            Au cœur de Tunis, Café Noir vous invite à savourer des cafés d’exception, des pâtisseries artisanales et une
            ambiance unique, entre modernité et tradition.
          </p>
          <Link
            to="/menu"
            className="group mt-8 inline-flex items-center gap-2.5 rounded-full bg-brand px-7 py-3.5 text-sm font-semibold text-on-brand shadow-[0_8px_24px_-10px] shadow-brand transition-[filter,transform] hover:brightness-95 active:scale-[0.98]"
          >
            Découvrir notre menu <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
          <a
            href={info.mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-9 flex w-fit items-center gap-2 text-[13px] text-muted transition-colors hover:text-ink"
          >
            <MapPin size={15} className="shrink-0 text-ink" /> {info.address}
          </a>
        </div>

        {/* Photo: bleeds off the right edge on desktop, sits under the text on smaller screens. */}
        <div
          className="animate-fade-up relative -mx-5 h-72 sm:-mx-8 sm:h-[26rem] lg:absolute lg:inset-y-0 lg:right-0 lg:mx-0 lg:h-auto lg:w-[62%]"
          style={{ animationDelay: '150ms' }}
        >
          <img
            src={IMAGES.hero}
            alt="Un cappuccino avec un joli latte art, servi sur une table en marbre"
            fetchPriority="high"
            className="h-full w-full object-cover object-[60%_50%]"
          />
          {/* Melt the photo into the page colour: from the top on small screens, from the left on desktop. */}
          <div aria-hidden className="absolute inset-0 bg-linear-to-b from-page to-transparent to-45% lg:hidden" />
          <div aria-hidden className="absolute inset-y-0 left-0 hidden w-1/2 bg-linear-to-r from-page via-page/55 to-transparent lg:block" />
        </div>
      </div>
    </section>
  );
}
