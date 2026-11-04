import { ArrowRight } from 'lucide-react';
import { IMAGES } from '../config/site';
import { Reveal } from './ui/Reveal';

export function Story() {
  return (
    <section id="histoire" className="scroll-mt-16 lg:scroll-mt-[72px]">
      <div className="mx-auto grid max-w-[1240px] items-center gap-10 px-5 py-14 sm:px-8 sm:py-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:px-12 lg:py-20">
        <Reveal className="overflow-hidden rounded-2xl shadow-[0_24px_60px_-28px] shadow-black/40">
          <img
            src={IMAGES.story}
            alt="Le comptoir de Café Noir, ses plantes et sa grande baie vitrée"
            loading="lazy"
            decoding="async"
            className="media-zoom aspect-[2/1] w-full object-cover"
          />
        </Reveal>

        <Reveal delay={120}>
          <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-subtle">Notre histoire</p>
          <h2 className="mt-4 font-serif text-[2.1rem] leading-[1.12] tracking-[-0.015em] text-ink sm:text-[2.5rem]">Un lieu, une passion</h2>
          <p className="mt-5 max-w-lg text-[15px] leading-[1.85] text-muted">
            Café Noir est né d’une simple idée : créer un espace où le bon goût rencontre la convivialité. Depuis notre
            ouverture, nous mettons un point d’honneur à offrir des produits de qualité, dans un cadre élégant et apaisant,
            au cœur de Tunis.
          </p>
          <a
            href="#contact"
            className="group mt-7 inline-flex items-center gap-2.5 rounded-full border border-brand px-6 py-3 text-[13px] font-semibold text-ink transition-colors hover:bg-brand hover:text-on-brand"
          >
            En savoir plus <ArrowRight size={15} className="transition-transform duration-300 group-hover:translate-x-1" />
          </a>

          <div className="mt-8 flex items-end justify-end gap-3 text-accent sm:mt-4 sm:pr-4">
            <svg aria-hidden viewBox="0 0 90 30" className="mb-1 h-7 w-20 shrink-0 opacity-80" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
              <path d="M2 24 C 22 22, 46 20, 84 12" />
              <path d="M76 10.5 L 85 11.8 L 79 18.5" />
            </svg>
            <p className="-rotate-[7deg] font-serif text-xl italic leading-tight sm:text-2xl">
              Le bon café
              <br />
              rapproche les gens
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
