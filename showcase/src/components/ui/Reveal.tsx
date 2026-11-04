import type { ReactNode } from 'react';
import { useInView } from '../../lib/useInView';

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger delay in ms, for a row of siblings revealing one after another. */
  delay?: number;
  as?: 'div' | 'li';
}

/** Fades/slides an element up once it scrolls into view — the shared scroll-reveal building block
 * used across every section of the showcase (see lib/useInView.ts). */
export function Reveal({ children, className = '', delay = 0, as = 'div' }: RevealProps) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const Tag = as;
  return (
    <Tag ref={ref as never} className={`reveal ${inView ? 'is-visible' : ''} ${className}`} style={delay ? { animationDelay: `${delay}ms` } : undefined}>
      {children}
    </Tag>
  );
}
