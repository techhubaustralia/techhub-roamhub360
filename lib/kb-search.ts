// Tokenized, ranked search for Knowledge Base articles. Pure + framework-free so the Help panel and
// tests share the exact same logic.
//
// Why not substring match? A naive `title.includes(query)` fails the moment a user types a natural
// phrase — "help for booking a desk" is not a substring of the title "Booking a desk". We instead
// split the query into words, drop filler words, and match articles that contain those words across
// their title / summary / category / body, ranked so the best hits come first.

export interface Searchable {
  title: string;
  summary?: string | null;
  category?: string;
  text?: string; // plaintext body excerpt
}

// Common filler words that shouldn't drive matching ("help me book a desk" → book, desk).
const STOP = new Set([
  "a", "an", "the", "for", "to", "of", "in", "on", "at", "is", "are", "be", "do", "does",
  "how", "i", "my", "me", "we", "with", "and", "or", "can", "cant", "please", "need", "want",
  "help", "about", "this", "that", "it", "get", "use", "using", "when", "where", "what", "s",
]);

// Lowercase and DROP apostrophes (so "who's" ↔ "whos"), then treat every other non-alphanumeric as
// a separator. Both the query and the searchable text run through this, so they always line up.
function normalize(s: string): string {
  return s.toLowerCase().replace(/['’]/g, "");
}

export function tokenize(q: string): string[] {
  return normalize(q).split(/[^a-z0-9]+/).filter(Boolean);
}

/** Returns the articles that match `query`, best first. Empty/whitespace query → original order. */
export function searchArticles<T extends Searchable>(articles: T[], query: string): T[] {
  const raw = tokenize(query);
  if (raw.length === 0) return articles;

  // Prefer meaningful tokens; if the query is ALL filler ("how do i…"), fall back to the raw tokens
  // so the user still gets something rather than nothing.
  const meaningful = raw.filter((t) => t.length > 1 && !STOP.has(t));
  const terms = meaningful.length ? meaningful : raw;

  const scored = articles.map((a, idx) => {
    const title = normalize(a.title);
    const hay = normalize(`${a.title} ${a.summary ?? ""} ${a.category ?? ""} ${a.text ?? ""}`);
    let matched = 0;
    let titleHits = 0;
    let titleStarts = 0;
    for (const t of terms) {
      if (hay.includes(t)) matched++;
      if (title.includes(t)) {
        titleHits++;
        if (new RegExp(`\\b${t}`).test(title)) titleStarts++;
      }
    }
    return { a, idx, matched, titleHits, titleStarts };
  });

  // Two tiers: articles matching EVERY term win; if none do, fall back to any-term matches so the
  // search stays forgiving. Rank by term coverage, then title relevance, then original order.
  const all = scored.filter((s) => s.matched === terms.length);
  const any = scored.filter((s) => s.matched > 0);
  const pool = all.length ? all : any;

  return pool
    .sort((x, y) => y.matched - x.matched || y.titleStarts - x.titleStarts || y.titleHits - x.titleHits || x.idx - y.idx)
    .map((s) => s.a);
}
