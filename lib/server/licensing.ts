import "server-only";
import { DEFAULT_TENANT, currentTenantId } from "./tenant";
import { computeLicenseState, TIER_DEFAULTS, type LicenseCore, type LicenseState, type LicenseTier } from "../license-state";

// Licence resolution + enforcement (Commercial SaaS CP2). The DEFAULT/demo tenant and any dev
// (no DB) run unlimited so the live single-tenant demo is never restricted. A customer tenant
// with no licence row gets an implicit trial. All the pure state logic lives in ../license-state.
/* eslint-disable @typescript-eslint/no-explicit-any */

const useSql = Boolean(process.env.DATABASE_URL);

let _prisma: any = null;
async function prisma(): Promise<any> {
  if (!_prisma) {
    const mod: any = await import("@prisma/client");
    _prisma = new mod.PrismaClient();
  }
  return _prisma;
}

const UNLIMITED: LicenseCore = { tier: "enterprise", maxSites: 9999, maxFloorsPerSite: 99, status: "active", expiresAt: null, graceDays: 0 };
const IMPLICIT_TRIAL: LicenseCore = { tier: "trial", maxSites: TIER_DEFAULTS.trial.maxSites, maxFloorsPerSite: TIER_DEFAULTS.trial.maxFloorsPerSite, status: "active", expiresAt: null, graceDays: 14 };

async function coreFor(tenantId: string): Promise<LicenseCore> {
  if (tenantId === DEFAULT_TENANT || !useSql) return UNLIMITED;
  const p = await prisma();
  const row = await p.license.findUnique({ where: { tenantId } });
  if (!row) return IMPLICIT_TRIAL;
  return {
    tier: row.tier as LicenseTier,
    maxSites: row.maxSites,
    maxFloorsPerSite: row.maxFloorsPerSite,
    status: row.status,
    expiresAt: row.expiresAt ? (row.expiresAt as Date).toISOString() : null,
    graceDays: row.graceDays,
  };
}

export async function licenseState(tenantId?: string): Promise<LicenseState> {
  const t = tenantId ?? (await currentTenantId());
  return computeLicenseState(await coreFor(t), Date.now());
}

export interface Check {
  ok: boolean;
  error?: string;
}

const readOnlyError = (s: LicenseState): string =>
  s.effective === "suspended"
    ? "This workspace is suspended. Contact TechHub Australia to reactivate it."
    : "This workspace's licence has expired. Renew it to make changes — existing bookings remain visible.";

/** Gate any write (new booking, site, floor) on the licence being live. */
export async function assertCanWrite(tenantId?: string): Promise<Check> {
  const s = await licenseState(tenantId);
  return s.readOnly ? { ok: false, error: readOnlyError(s) } : { ok: true };
}

export async function checkAddSite(currentCount: number, tenantId?: string): Promise<Check> {
  const s = await licenseState(tenantId);
  if (s.readOnly) return { ok: false, error: readOnlyError(s) };
  if (currentCount >= s.maxSites) {
    return { ok: false, error: `Your ${s.tier} licence covers ${s.maxSites} site${s.maxSites === 1 ? "" : "s"}. Contact TechHub Australia to add more.` };
  }
  return { ok: true };
}

export async function checkFloorCount(count: number, tenantId?: string): Promise<Check> {
  const s = await licenseState(tenantId);
  if (s.readOnly) return { ok: false, error: readOnlyError(s) };
  if (count > s.maxFloorsPerSite) {
    return { ok: false, error: `Your ${s.tier} licence allows ${s.maxFloorsPerSite} floor${s.maxFloorsPerSite === 1 ? "" : "s"} per site.` };
  }
  return { ok: true };
}

export interface LicenseSummary extends LicenseState {
  sitesUsed: number;
}
export async function licenseSummary(tenantId: string, sitesUsed: number): Promise<LicenseSummary> {
  return { ...(await licenseState(tenantId)), sitesUsed };
}

/** Upsert a licence — used by the TechHub Partner portal (CP3). */
export async function saveLicense(
  tenantId: string,
  patch: { tier?: LicenseTier; maxSites?: number; maxFloorsPerSite?: number; status?: string; expiresAt?: string | null; graceDays?: number; notes?: string },
): Promise<void> {
  const p = await prisma();
  const data: Record<string, unknown> = {};
  if (patch.tier !== undefined) data.tier = patch.tier;
  if (patch.maxSites !== undefined) data.maxSites = patch.maxSites;
  if (patch.maxFloorsPerSite !== undefined) data.maxFloorsPerSite = patch.maxFloorsPerSite;
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.expiresAt !== undefined) data.expiresAt = patch.expiresAt ? new Date(patch.expiresAt) : null;
  if (patch.graceDays !== undefined) data.graceDays = patch.graceDays;
  if (patch.notes !== undefined) data.notes = patch.notes;
  await p.license.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
}
