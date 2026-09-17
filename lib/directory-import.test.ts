import { describe, it, expect } from "vitest";
import { pendingDirectoryEntries, matchesImportQuery, summariseImport } from "./directory-import";

const dir = [
  { email: "Zed@Example.com", displayName: "Zed Zane", jobTitle: "Engineer", department: "Product" },
  { email: "ada@example.com", displayName: "Ada Lovelace", jobTitle: "Analyst", department: "Finance" },
  { email: "bob@example.com" },
  { email: "ada@example.com", displayName: "Ada (dup)" },
  { email: "" },
];

describe("pendingDirectoryEntries", () => {
  it("drops existing users (case-insensitively), duplicates and blanks; sorts by name then email", () => {
    const out = pendingDirectoryEntries(dir, ["ADA@example.com"]);
    expect(out.map((e) => e.email)).toEqual(["bob@example.com", "Zed@Example.com"]);
  });
  it("returns everything when nobody is a user yet", () => {
    expect(pendingDirectoryEntries(dir, [])).toHaveLength(3);
  });
});

describe("matchesImportQuery", () => {
  it("matches name, email, title and department; empty query matches all", () => {
    expect(matchesImportQuery(dir[1], "love")).toBe(true);
    expect(matchesImportQuery(dir[1], "ADA@")).toBe(true);
    expect(matchesImportQuery(dir[1], "analyst")).toBe(true);
    expect(matchesImportQuery(dir[1], "finance")).toBe(true);
    expect(matchesImportQuery(dir[1], "engineer")).toBe(false);
    expect(matchesImportQuery(dir[2], "   ")).toBe(true);
  });
});

describe("summariseImport", () => {
  it("counts skipped rows by reason", () => {
    const s = summariseImport({ created: 2, skipped: [{ email: "a", reason: "Already a user" }, { email: "b", reason: "Already a user" }, { email: "c", reason: "Not in the synced directory" }] });
    expect(s.title).toBe("Imported 2 users");
    expect(s.description).toBe("3 skipped: 2 already a user, 1 not in the synced directory.");
  });
  it("singular + clean success line", () => {
    expect(summariseImport({ created: 1, skipped: [] })).toEqual({ title: "Imported 1 user", description: "They can sign in with Microsoft straight away." });
  });
});
