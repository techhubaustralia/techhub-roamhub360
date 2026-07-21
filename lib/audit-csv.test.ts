import { describe, it, expect } from "vitest";
import { csvCell, auditToCsv } from "./audit-csv";

describe("csvCell", () => {
  it("quotes and escapes embedded quotes", () => {
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell("plain")).toBe('"plain"');
    expect(csvCell(undefined)).toBe('""');
  });
  it("neutralises formula-injection leaders (=+-@)", () => {
    expect(csvCell("=cmd()")).toBe(`"'=cmd()"`);
    expect(csvCell("+1")).toBe(`"'+1"`);
    expect(csvCell("-2")).toBe(`"'-2"`);
    expect(csvCell("@x")).toBe(`"'@x"`);
    expect(csvCell("safe=later")).toBe('"safe=later"'); // only a LEADING leader is dangerous
  });
});

describe("auditToCsv", () => {
  it("emits a header row + one CRLF-terminated line per entry", () => {
    const csv = auditToCsv([
      { at: "2026-07-21T00:00:00.000Z", actor: "admin@x.io", action: "user.update", target: "u@x.io", before: '{"role":"staff"}', after: '{"role":"global-admin"}' },
    ]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("at,actor,action,target,detail,before,after,ip,userAgent,requestId");
    expect(lines[1]).toContain('"user.update"');
    expect(lines[1]).toContain('"admin@x.io"');
    expect(lines[1]).toContain('"{""role"":""global-admin""}"');
  });
});
