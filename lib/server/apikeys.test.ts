import { describe, it, expect } from "vitest";
import { isExpired, hasScope } from "./apikeys";

describe("isExpired", () => {
  const now = Date.parse("2026-07-22T00:00:00.000Z");
  it("treats no-expiry as never expired", () => {
    expect(isExpired(null, now)).toBe(false);
    expect(isExpired(undefined, now)).toBe(false);
  });
  it("expires at or before now", () => {
    expect(isExpired("2026-07-21T00:00:00.000Z", now)).toBe(true); // past
    expect(isExpired("2026-07-22T00:00:00.000Z", now)).toBe(true); // exactly now → expired
    expect(isExpired("2026-07-23T00:00:00.000Z", now)).toBe(false); // future
  });
  it("never expires on an unparseable value (fail-open on garbage, not fail-shut)", () => {
    expect(isExpired("not-a-date", now)).toBe(false);
  });
});

describe("hasScope", () => {
  it("grants only when the scope is present", () => {
    expect(hasScope(["read"], "read")).toBe(true);
    expect(hasScope(["read"], "write")).toBe(false);
    expect(hasScope(["read", "write"], "write")).toBe(true);
  });
  it("denies on empty/invalid scope lists", () => {
    expect(hasScope([], "read")).toBe(false);
    expect(hasScope(null, "read")).toBe(false);
    expect(hasScope(undefined, "write")).toBe(false);
  });
});
