// Reads every .md file under docs-site/content/**, and turns it into the docs site's entire
// navigation + content + search index. This is the ONLY place page structure comes from — there
// is no hardcoded route list or nav config anywhere else in this app. Dropping a new .md file
// under content/ (with frontmatter) and re-running this script (wired into `predev`/`prebuild`,
// see package.json) makes it show up as a new page, in its category, in the sidebar, in search —
// automatically.
//
// Frontmatter fields (only `title` and `category` are required):
//   title            string   — page title, also the sidebar/search label
//   description      string   — one-line summary, used on category cards and in search results
//   category         string   — sidebar section this page belongs to (created automatically the
//                                first time a page uses a new name — no need to register it)
//   categoryIcon     string   — lucide-react icon name for the category (set on any one page in
//                                that category; last one wins if several disagree)
//   order            number   — sort position within its category (default 100)
//   categoryOrder    number   — sort position of the category itself among all categories
//                                (default 100; the category's value is the lowest set by any of
//                                its pages)
//   featured         boolean  — include this page in the homepage's "Par où commencer ?" list
//   featuredOrder    number   — sort position within that list (default 100)
//
// Output (git-ignored, regenerated every build): src/generated/manifest.json,
// src/generated/pages/<slug>.json, src/generated/search-index.json.

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content');
const OUT_DIR = path.join(ROOT, 'src', 'generated');
const PAGES_OUT_DIR = path.join(OUT_DIR, 'pages');

const slugify = (s) =>
  s
    .toString()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents (é -> e)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

// Renders headings with a stable slug id (so the table of contents can link to them) and collects
// them for the returned `toc` array — marked's renderer runs synchronously per-token, so a plain
// closure-captured array is enough, no need for a second parse pass.
const buildMarked = (tocSink) => {
  const marked = new Marked(
    markedHighlight({
      langPrefix: 'hljs language-',
      highlight(code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
      },
    })
  );
  const usedIds = new Set();
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const plain = tokens.map((t) => ('text' in t ? t.text : '')).join('');
        let id = slugify(plain);
        if (usedIds.has(id)) {
          let n = 2;
          while (usedIds.has(`${id}-${n}`)) n += 1;
          id = `${id}-${n}`;
        }
        usedIds.add(id);
        if (depth === 2 || depth === 3) tocSink.push({ id, text: plain, depth });
        return `<h${depth} id="${id}">${text}</h${depth}>\n`;
      },
      // Numbered step-by-step instructions get the connected-badge "steps" layout (styled in
      // index.css, .docs-article ol.steps) instead of a plain decimal list — every ordered list
      // in this app's content IS a sequence of steps to follow (never, say, a ranked top-10), so
      // there's no separate markdown syntax to opt in: any "1. 2. 3." list gets it automatically.
      // Unordered lists fall through to marked's own default rendering (returning `false` is
      // marked's documented way to say "use the built-in renderer for this token").
      list(token) {
        if (!token.ordered) return false;
        const items = token.items
          .map((item, i) => {
            const body = this.parser.parse(item.tokens);
            return `<li class="step"><span class="step-num">${i + 1}</span><div class="step-body">${body}</div></li>`;
          })
          .join('');
        return `<ol class="steps">${items}</ol>\n`;
      },
    },
  });
  return marked;
};

// Strips markdown/HTML down to plain text, for the search index (never shown, only matched
// against) — deliberately crude (regex, not a real parser) since it only needs to be searchable,
// not readable.
const toPlainText = (md) =>
  md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.md')) out.push(full);
  }
  return out;
};

const main = () => {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(PAGES_OUT_DIR, { recursive: true });

  const files = walk(CONTENT_DIR).sort();
  if (files.length === 0) {
    throw new Error(`Aucun fichier .md trouvé sous ${CONTENT_DIR}`);
  }

  const pages = [];
  const slugsSeen = new Set();

  for (const file of files) {
    const raw = readFileSync(file, 'utf-8');
    const { data, content } = matter(raw);
    if (!data.title || !data.category) {
      throw new Error(`${path.relative(ROOT, file)} : "title" et "category" sont obligatoires dans le frontmatter.`);
    }
    // Strip an optional leading "NN-" sort prefix from the filename before slugifying, so authors
    // can name files "01-premiers-pas.md" for filesystem ordering without it leaking into the URL.
    const base = path.basename(file, '.md').replace(/^\d+-/, '');
    const slug = slugify(base);
    if (slugsSeen.has(slug)) {
      throw new Error(`Slug en double : "${slug}" (depuis ${path.relative(ROOT, file)}). Chaque nom de fichier doit être unique.`);
    }
    slugsSeen.add(slug);

    const toc = [];
    const html = buildMarked(toc).parse(content);

    pages.push({
      slug,
      title: String(data.title),
      description: data.description ? String(data.description) : '',
      category: String(data.category),
      categoryIcon: data.categoryIcon ? String(data.categoryIcon) : undefined,
      order: typeof data.order === 'number' ? data.order : 100,
      categoryOrder: typeof data.categoryOrder === 'number' ? data.categoryOrder : 100,
      featured: Boolean(data.featured),
      featuredOrder: typeof data.featuredOrder === 'number' ? data.featuredOrder : 100,
      html,
      toc,
      searchText: toPlainText(content),
    });
  }

  pages.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'fr'));

  // --- Category grouping (manifest) ---
  const categoriesByName = new Map();
  for (const p of pages) {
    let cat = categoriesByName.get(p.category);
    if (!cat) {
      cat = { name: p.category, icon: undefined, order: p.categoryOrder, pages: [] };
      categoriesByName.set(p.category, cat);
    }
    if (p.categoryIcon) cat.icon = p.categoryIcon;
    cat.order = Math.min(cat.order, p.categoryOrder);
    cat.pages.push({ slug: p.slug, title: p.title, description: p.description });
  }
  const categories = [...categoriesByName.values()].sort(
    (a, b) => a.order - b.order || a.name.localeCompare(b.name, 'fr')
  );

  const featured = pages
    .filter((p) => p.featured)
    .sort((a, b) => a.featuredOrder - b.featuredOrder)
    .map((p) => ({ slug: p.slug, title: p.title, description: p.description, category: p.category }));

  const manifest = {
    categories: categories.map((c) => ({ name: c.name, icon: c.icon ?? null, pages: c.pages })),
    featured,
    pageCount: pages.length,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const searchIndex = pages.map((p) => ({
    slug: p.slug,
    title: p.title,
    description: p.description,
    category: p.category,
    text: p.searchText,
  }));
  writeFileSync(path.join(OUT_DIR, 'search-index.json'), JSON.stringify(searchIndex));

  for (const p of pages) {
    const { searchText, ...pageOut } = p;
    void searchText;
    writeFileSync(path.join(PAGES_OUT_DIR, `${p.slug}.json`), JSON.stringify(pageOut));
  }

  console.log(`[build-content] ${pages.length} page(s), ${categories.length} catégorie(s), ${featured.length} en vedette.`);
};

main();
