import type { SearchEntry } from './types';

export interface SearchResult {
  entry: SearchEntry;
  snippet: string;
  score: number;
}

const normalize = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Builds a short excerpt of `text` centered on the first match of `query`, so results show *why*
// they matched, not just the title — matters most for a knowledge base where the answer to "avance
// salaire" might be three paragraphs into an article never mentioning those exact words together.
const buildSnippet = (text: string, query: string, radius = 60): string => {
  const idx = normalize(text).indexOf(query);
  if (idx === -1) return text.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
};

// Simple, deliberately non-fuzzy substring search across title/description/body — a knowledge
// base this size (a few dozen articles) doesn't need a real search engine, and plain substring
// matching is predictable and easy for a non-technical user to reason about ("why didn't my
// search find X" always has a literal answer).
export const search = (index: SearchEntry[], rawQuery: string, limit = 8): SearchResult[] => {
  const query = normalize(rawQuery.trim());
  if (query.length < 2) return [];

  const results: SearchResult[] = [];
  for (const entry of index) {
    const title = normalize(entry.title);
    const description = normalize(entry.description);
    const text = normalize(entry.text);

    let score = 0;
    if (title === query) score = 100;
    else if (title.startsWith(query)) score = 80;
    else if (title.includes(query)) score = 60;
    else if (description.includes(query)) score = 40;
    else if (text.includes(query)) score = 20;

    if (score === 0) continue;

    const snippetSource = description.includes(query) ? entry.description : entry.text;
    results.push({ entry, score, snippet: buildSnippet(snippetSource, query) });
  }

  results.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, 'fr'));
  return results.slice(0, limit);
};
