import React from 'react';
import type { TocEntry } from '../types';

interface TableOfContentsProps {
  toc: TocEntry[];
}

export const TableOfContents: React.FC<TableOfContentsProps> = ({ toc }) => {
  if (toc.length === 0) return null;
  return (
    <div className="sticky top-24">
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2.5 px-1">Sur cette page</p>
      <ul className="space-y-1 border-l border-gray-100">
        {toc.map((t) => (
          <li key={t.id}>
            <a
              href={`#${t.id}`}
              className={`block py-1 text-[12.5px] text-gray-500 hover:text-emerald-600 transition ${
                t.depth === 3 ? 'pl-6' : 'pl-3.5'
              } border-l-2 border-transparent hover:border-emerald-400 -ml-px`}
            >
              {t.text}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};
