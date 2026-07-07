// Pure licensing logic (Commercial SaaS CP2). No server-only imports so it can be unit-tested.
// Resolves a licence's effective state (active / grace / expired / suspended) and whether the
// workspace is read-only, from the stored fields + the current time.

export type LicenseTier = "trial" | "standard" | "professional" | "enterprise";

export interface LicenseCore {
  tier: LicenseTier;
  maxSites: number;
  maxFloorsPerSite: number;
  status: string; // active | suspended | cancelled (stored, operator-controlled)
  expiresAt: string | null; // ISO date-time, or null for no expiry
  graceDays: number; // days after expiry still writable (soft landing)
}

export type Effective = "active" | "grace" | "expired" | "suspended";

export interface LicenseState extends LicenseCore {
  effective: Effective;
  readOnly: boolean; // writes (new bookings, sites, floors) are blocked
  daysLeft: number | null; // until expiry; negative once past
}

const DAY = 86_400_000;

export function computeLicenseState(core: LicenseCore, nowMs: number): LicenseState {
  const exp = core.expiresAt ? Date.parse(core.expiresAt) : null;
  const daysLeft = exp != null ? Math.ceil((exp - nowMs) / DAY) : null;

  let effective: Effective = "active";
  let readOnly = false;
  if (core.status === "suspended" || core.status === "cancelled") {
    effective = "suspended";
    readOnly = true;
  } else if (exp != null && nowMs > exp + core.graceDays * DAY) {
    effective = "expired";
    readOnly = true;
  } else if (exp != null && nowMs > exp) {
    effective = "grace"; // past expiry but inside the grace window — still writable, warn loudly
  }
  return { ...core, effective, readOnly, daysLeft };
}

// Tier presets — sites are purchased ($2000/site/yr) so maxSites is set per licence; the
// floors-per-site cap follows the tier (≤5). Used as defaults when issuing a licence.
export const TIER_DEFAULTS: Record<LicenseTier, { maxSites: number; maxFloorsPerSite: number }> = {
  trial: { maxSites: 1, maxFloorsPerSite: 2 },
  standard: { maxSites: 3, maxFloorsPerSite: 3 },
  professional: { maxSites: 10, maxFloorsPerSite: 5 },
  enterprise: { maxSites: 100, maxFloorsPerSite: 5 },
};
