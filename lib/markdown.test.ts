import { describe, it, expect } from "vitest";
import { renderMarkdown, markdownExcerpt } from "./markdown";

describe("renderMarkdown", () => {
  it("renders headings, bold, italic, code", () => {
    expect(renderMarkdown("# Title")).toBe("<h1>Title</h1>");
    expect(renderMarkdown("**bold**")).toContain("<strong>bold</strong>");
    expect(renderMarkdown("*it*")).toContain("<em>it</em>");
    expect(renderMarkdown("_it_")).toContain("<em>it</em>");
    expect(renderMarkdown("`code`")).toContain("<code>code</code>");
  });

  it("renders unordered and ordered lists", () => {
    expect(renderMarkdown("- a\n- b")).toBe("<ul><li>a</li><li>b</li></ul>");
    expect(renderMarkdown("1. a\n2. b")).toBe("<ol><li>a</li><li>b</li></ol>");
  });

  it("renders fenced code blocks without applying inline rules inside", () => {
    const out = renderMarkdown("```\n**not bold**\n```");
    expect(out).toContain("<pre><code>**not bold**</code></pre>");
    expect(out).not.toContain("<strong>");
  });

  it("renders paragraphs and horizontal rules", () => {
    expect(renderMarkdown("hello\n\nworld")).toBe("<p>hello</p>\n<p>world</p>");
    expect(renderMarkdown("---")).toBe("<hr/>");
  });

  it("renders safe links and neutralises unsafe schemes", () => {
    expect(renderMarkdown("[ok](https://example.com)")).toContain('href="https://example.com"');
    // javascript: scheme must NOT survive as an href
    const evil = renderMarkdown("[x](javascript:alert(1))");
    expect(evil).not.toContain("javascript:");
    expect(evil).toContain('href="#"');
  });

  it("escapes HTML so authored markup can never inject", () => {
    const out = renderMarkdown("<script>alert(1)</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("escapes HTML inside inline code and code blocks", () => {
    expect(renderMarkdown("`<b>`")).toContain("<code>&lt;b&gt;</code>");
    expect(renderMarkdown("```\n<b>\n```")).toContain("&lt;b&gt;");
  });

  it("escapes quotes inside link text and does not break out of the href attribute", () => {
    const out = renderMarkdown('[a"b](https://x.com)');
    expect(out).not.toMatch(/href="https:\/\/x\.com">[^<]*"[^<]*</); // no raw quote breaking the tag
    expect(out).toContain("&quot;");
  });
});

describe("markdownExcerpt", () => {
  it("strips markdown and truncates", () => {
    expect(markdownExcerpt("# Hello **world**")).toBe("Hello world");
    const long = markdownExcerpt("word ".repeat(60), 20);
    expect(long.length).toBeLessThanOrEqual(20);
    expect(long.endsWith("…")).toBe(true);
  });
});
