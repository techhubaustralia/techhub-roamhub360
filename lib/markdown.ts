import { escapeHtml } from "./escape-html";

// Tiny, dependency-free, XSS-safe Markdown → HTML renderer for Knowledge Base articles.
//
// SAFETY MODEL: every character of the source is HTML-escaped FIRST (escapeHtml), so no author
// input can ever reach the DOM as markup. We then re-introduce ONLY the small set of tags this
// function itself emits (h1-3, p, ul/ol/li, strong, em, code, pre, blockquote, hr, a, br). Link
// hrefs are additionally restricted to http(s)/mailto and re-escaped. The output is therefore safe
// to pass to dangerouslySetInnerHTML even for semi-trusted authors (customer Global Admins).
//
// Supported: # ## ### headings, **bold**, *italic*/_italic_, `code`, ``` fenced blocks,
// - / * bullet lists, 1. ordered lists, > blockquotes, --- horizontal rule, [text](url) links,
// blank-line-separated paragraphs. Deliberately minimal — no tables/images/raw HTML.

/** Escape then apply inline formatting (bold, italic, code, links) to a single line/segment. */
function inline(src: string): string {
  let s = escapeHtml(src);
  // `code` first so its contents aren't further transformed (the backticks survive escaping).
  s = s.replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`);
  // [text](href) — href sanitized to safe schemes; text may contain already-escaped chars.
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, href: string) => {
    const safe = /^(https?:\/\/|mailto:|\/)/i.test(href) ? href : "#";
    // href came through escapeHtml already (quotes → &quot;), so it's attribute-safe.
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer nofollow">${text}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, (_m, b) => `<strong>${b}</strong>`);
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, (_m, pre, i) => `${pre}<em>${i}</em>`);
  s = s.replace(/(^|[^_])_([^_\n]+)_/g, (_m, pre, i) => `${pre}<em>${i}</em>`);
  return s;
}

export function renderMarkdown(md: string): string {
  const lines = String(md ?? "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${para.map(inline).join("<br/>")}</p>`);
      para = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block ```
    if (/^```/.test(line.trim())) {
      flushPara();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      out.push(`<pre><code>${escapeHtml(buf.join("\n"))}</code></pre>`);
      continue;
    }

    // Horizontal rule
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      flushPara();
      out.push("<hr/>");
      i++;
      continue;
    }

    // Headings
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote (consecutive > lines)
    if (/^\s*>\s?/.test(line)) {
      flushPara();
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${buf.map(inline).join("<br/>")}</blockquote>`);
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    // Blank line → paragraph break
    if (line.trim() === "") {
      flushPara();
      i++;
      continue;
    }

    // Accumulate into the current paragraph
    para.push(line);
    i++;
  }
  flushPara();
  return out.join("\n");
}

/** Plain-text excerpt (for list summaries / meta) — strips markdown syntax, no HTML. */
export function markdownExcerpt(md: string, max = 160): string {
  const text = String(md ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~-]/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
