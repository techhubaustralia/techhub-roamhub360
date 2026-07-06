import { describe, it, expect } from "vitest";
import { canAccessBuilding, type Role, type ScopedUser } from "../authz";

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
