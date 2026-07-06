import { describe, it, expect } from "vitest";
import { escapeHtml } from "./escape-html";

describe("escapeHtml — email/HTML injection prevention", () => {
  it("neutralizes script and tag injection", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(escapeHtml("<script>evil()</script>")).toBe("&lt;script&gt;evil()&lt;/script&gt;");
  });
  it("escapes quotes and ampersands so attributes/links cannot break out", () => {
    expect(escapeHtml(`a&b"'`)).toBe("a&amp;b&quot;&#39;");
  });
  it("handles null/undefined safely", () => {
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(null)).toBe("");
  });
  it("leaves ordinary labels intact", () => {
    expect(escapeHtml("Desk 16")).toBe("Desk 16");
  });
});
