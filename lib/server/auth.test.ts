import { describe, it, expect } from "vitest";
import { canAccessBuilding, devIdentityFromHeaders, type Role, type ScopedUser } from "../authz";

const mk = (role: Role, sites?: string[]): ScopedUser => ({ role, sites });

describe("canAccessBuilding — site-scoped authorization", () => {
  it("global admins pass everywhere", () => {
    expect(canAccessBuilding(mk("global-admin"), "rome-abc123")).toBe(true);
    expect(canAccessBuilding(mk("global-admin"), "anything__floor-9")).toBe(true);
  });

  it("staff never pass (admin actions are not for staff)", () => {
    expect(canAccessBuilding(mk("staff"), "rome-abc123")).toBe(false);
  });

  it("site admins pass only within their assigned building roots", () => {
    const u = mk("site-admin", ["rome-abc123"]);
    expect(canAccessBuilding(u, "rome-abc123")).toBe(true);
    expect(canAccessBuilding(u, "london-def456")).toBe(false);
  });

  it("site admins are matched by building root, ignoring the floor suffix", () => {
    const u = mk("site-admin", ["rome-abc123"]);
    expect(canAccessBuilding(u, "rome-abc123__floor-2")).toBe(true);
    expect(canAccessBuilding(u, "rome-abc123__room-5")).toBe(true);
    expect(canAccessBuilding(u, "london-def456__floor-2")).toBe(false);
  });

  it("site admins with no sites pass nowhere", () => {
    expect(canAccessBuilding(mk("site-admin", []), "rome-abc123")).toBe(false);
    expect(canAccessBuilding(mk("site-admin", undefined), "rome-abc123")).toBe(false);
  });
});

describe("devIdentityFromHeaders — dev-only identity simulation", () => {
  const get = (h: Record<string, string>) => (n: string) => h[n] ?? null;

  it("is inert in production no matter what headers arrive", () => {
    expect(devIdentityFromHeaders(get({ "x-dev-user": "a@example.com", "x-dev-role": "global-admin" }), "production")).toBeNull();
  });
  it("returns null without a usable x-dev-user", () => {
    expect(devIdentityFromHeaders(get({}), "development")).toBeNull();
    expect(devIdentityFromHeaders(get({ "x-dev-role": "staff" }), "development")).toBeNull();
    expect(devIdentityFromHeaders(get({ "x-dev-user": "not-an-email" }), "development")).toBeNull();
    expect(devIdentityFromHeaders(get({ "x-dev-user": "   " }), "development")).toBeNull();
  });
  it("impersonates the named user, lower-cased, at the least-privileged role by default", () => {
    expect(devIdentityFromHeaders(get({ "x-dev-user": "Mixed.Case@Example.com" }), "development")).toEqual({ email: "mixed.case@example.com", role: "staff" });
  });
  it("honours a valid x-dev-role and falls back to staff for an invalid one", () => {
    expect(devIdentityFromHeaders(get({ "x-dev-user": "a@example.com", "x-dev-role": "site-admin" }), "test")).toEqual({ email: "a@example.com", role: "site-admin" });
    expect(devIdentityFromHeaders(get({ "x-dev-user": "a@example.com", "x-dev-role": "Global-Admin" }), "test")).toEqual({ email: "a@example.com", role: "global-admin" });
    expect(devIdentityFromHeaders(get({ "x-dev-user": "a@example.com", "x-dev-role": "superuser" }), "test")).toEqual({ email: "a@example.com", role: "staff" });
  });
});
