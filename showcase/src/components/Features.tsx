import { Coffee, Croissant, Leaf, Users } from 'lucide-react';
import { Reveal } from './ui/Reveal';

const FEATURES = [
  { icon: Coffee, title: 'Cafés d’exception', text: 'Des grains soigneusement sélectionnés' },
  { icon: Croissant, title: 'Pâtisseries artisanales', text: 'Des créations fraîches chaque jour' },
  { icon: Leaf, title: 'Produits locaux', text: 'Des saveurs authentiques de Tunisie' },
  { icon: Users, title: 'Une ambiance unique', text: 'Un lieu chaleureux et inspirant' },
];

export function Features() {
  return (
    <section aria-label="Nos engagements" className="border-t border-line">
      <ul className="mx-auto grid max-w-[1240px] grid-cols-2 px-5 py-8 sm:px-8 lg:grid-cols-4 lg:px-12 lg:py-12">
        {FEATURES.map(({ icon: Icon, title, text }, i) => (
          <Reveal
            key={title}
            as="li"
            delay={i * 90}
            className="flex flex-col items-center border-l border-line px-3 py-5 text-center odd:max-lg:border-l-0 lg:px-6 lg:first:border-l-0"
          >
            <Icon size={34} strokeWidth={1.3} className="text-accent" aria-hidden />
            <h3 className="mt-4 text-sm font-semibold text-ink sm:text-[15px]">{title}</h3>
            <p className="mt-1.5 max-w-[11rem] text-xs leading-relaxed text-muted sm:text-[13px]">{text}</p>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
