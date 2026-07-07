import { describe, expect, it, vi } from "vitest";

// directory.ts is server-only; stub the marker so it can be imported under vitest (node).
vi.mock("server-only", () => ({}));

import { graphUserEmail, stripGraphBase } from "./directory";

describe("graphUserEmail", () => {
  it("prefers mail, lowercased and trimmed", () => {
    expect(graphUserEmail({ mail: "  Priya.Sharma@Acme.com ", userPrincipalName: "psharma@acme.onmicrosoft.com" })).toBe("priya.sharma@acme.com");
  });
  it("falls back to userPrincipalName when mail is missing", () => {
    expect(graphUserEmail({ mail: null, userPrincipalName: "PSharma@acme.com" })).toBe("psharma@acme.com");
  });
  it("returns null when neither is present", () => {
    expect(graphUserEmail({})).toBeNull();
    expect(graphUserEmail(null)).toBeNull();
    expect(graphUserEmail({ mail: "  " })).toBeNull();
  });
});

describe("stripGraphBase", () => {
  it("turns an absolute @odata.nextLink into a relative Graph path", () => {
    const next = "https://graph.microsoft.com/v1.0/users?$select=id&$skiptoken=abc123";
    expect(stripGraphBase(next)).toBe("/users?$select=id&$skiptoken=abc123");
  });
  it("returns null when there is no next page", () => {
    expect(stripGraphBase(undefined)).toBeNull();
    expect(stripGraphBase("")).toBeNull();
  });
});
