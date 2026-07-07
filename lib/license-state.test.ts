import { describe, expect, it } from "vitest";
import { computeLicenseState, type LicenseCore } from "./license-state";

const base: LicenseCore = { tier: "standard", maxSites: 3, maxFloorsPerSite: 3, status: "active", expiresAt: null, graceDays: 7 };
const NOW = Date.parse("2026-07-07T00:00:00Z");
const at = (iso: string) => ({ ...base, expiresAt: iso });

describe("computeLicenseState", () => {
  it("no expiry → active, writable, daysLeft null", () => {
    const s = computeLicenseState(base, NOW);
    expect(s).toMatchObject({ effective: "active", readOnly: false, daysLeft: null });
  });

  it("well before expiry → active", () => {
    const s = computeLicenseState(at("2026-08-01T00:00:00Z"), NOW);
    expect(s.effective).toBe("active");
    expect(s.readOnly).toBe(false);
    expect(s.daysLeft).toBe(25);
  });

  it("just past expiry but within grace → grace, still writable", () => {
    const s = computeLicenseState(at("2026-07-04T00:00:00Z"), NOW); // 3 days ago, grace 7
    expect(s.effective).toBe("grace");
    expect(s.readOnly).toBe(false);
    expect(s.daysLeft).toBe(-3);
  });

  it("past expiry + grace → expired, read-only", () => {
    const s = computeLicenseState(at("2026-06-20T00:00:00Z"), NOW); // 17 days ago > grace 7
    expect(s.effective).toBe("expired");
    expect(s.readOnly).toBe(true);
  });

  it("suspended overrides everything → read-only", () => {
    const s = computeLicenseState({ ...base, status: "suspended", expiresAt: "2027-01-01T00:00:00Z" }, NOW);
    expect(s.effective).toBe("suspended");
    expect(s.readOnly).toBe(true);
  });
});
