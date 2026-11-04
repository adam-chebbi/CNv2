import { X } from 'lucide-react';
import { useState } from 'react';
import { GALLERY, IMAGES } from '../config/site';
import { Dialog } from './Dialog';
import { Reveal } from './ui/Reveal';

export function Ambiance() {
  const [open, setOpen] = useState(false);

  return (
    <section id="galerie" className="relative isolate scroll-mt-16 overflow-hidden lg:scroll-mt-[72px]">
      <img src={IMAGES.ambiance} alt="" loading="lazy" decoding="async" className="absolute inset-0 -z-20 h-full w-full object-cover" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-black/25" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.5),transparent_75%)]" />

      <Reveal className="mx-auto flex max-w-[1240px] flex-col items-center px-5 py-16 text-center sm:px-8 sm:py-20 lg:py-24">
        <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-white/70">L’ambiance</p>
        <h2 className="mt-3 font-serif text-4xl leading-tight text-white sm:text-5xl">Un cadre qui inspire</h2>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-white/85 sm:text-[15px]">
          Design épuré, lumière naturelle et touches de verdure… Café Noir est bien plus qu’un café, c’est un lieu de vie.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-7 rounded-full bg-white px-7 py-3 text-[13px] font-semibold text-[#0F1A17] transition-colors hover:bg-brand hover:text-on-brand"
        >
          Découvrir la galerie
        </button>
      </Reveal>

      <Dialog open={open} onClose={() => setOpen(false)} label="Galerie">
        <div className="flex max-h-[92dvh] flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 sm:px-8">
            <h3 className="font-serif text-3xl text-ink">La galerie</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer la galerie"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-ink transition-colors hover:border-brand"
            >
              <X size={18} />
            </button>
          </div>
          <div className="overflow-y-auto overscroll-contain p-4 sm:p-6">
            <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
              {GALLERY.map((img, i) => (
                <li
                  key={img.src}
                  className={`overflow-hidden rounded-2xl bg-section ${i === 0 ? 'col-span-2' : ''} ${i === GALLERY.length - 1 ? 'md:col-span-2' : ''}`}
                >
                  <img src={img.src} alt={img.alt} loading="lazy" decoding="async" className="media-zoom h-40 w-full object-cover sm:h-52 md:h-60" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
