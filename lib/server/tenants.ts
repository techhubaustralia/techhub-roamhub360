import "server-only";
import { prisma } from "./prisma";
import { DEFAULT_TENANT } from "./tenant";

// Tenant (customer organisation) records + management. Platform-operator level.


export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  features?: string[];
  brandName?: string | null;
  brandAccent?: string | null;
  brandLogo?: string | null;
  createdAt?: Date;
}

// Feature keys that a platform operator can turn OFF per tenant (CP3 feature flags).
export const FEATURES: { key: string; label: string }[] = [
  { key: "presence", label: "Who's in (team presence)" },
  { key: "directory", label: "Directory sync" },
  { key: "digest", label: "Daily who's-in digest" },
  { key: "assistant", label: "Hubbi (AI booking assistant)" },
];

// Subdomain rules: 3–32 chars, lowercase alphanumeric + hyphens, not reserved.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
const RESERVED_SLUGS = new Set([DEFAULT_TENANT, "app", "www", "admin", "api", "auth", "mail", "static"]);
export function validSlug(s: string): boolean {
  return SLUG_RE.test(s) && !RESERVED_SLUGS.has(s);
}

/** Idempotently ensure the built-in default tenant row exists. */
export async function ensureDefaultTenant(): Promise<void> {
  const p = await prisma();
  await p.tenant.upsert({ where: { slug: DEFAULT_TENANT }, create: { slug: DEFAULT_TENANT, name: "Default workspace" }, update: {} });
}

export async function listTenants(): Promise<TenantRow[]> {
  const p = await prisma();
  return p.tenant.findMany({ orderBy: { createdAt: "asc" } });
}

export async function getTenantBySlug(slug: string): Promise<TenantRow | null> {
  const p = await prisma();
  return (await p.tenant.findUnique({ where: { slug } })) ?? null;
}

export async function createTenant(input: { slug: string; name: string }): Promise<TenantRow> {
  const p = await prisma();
  return p.tenant.create({ data: { slug: input.slug.toLowerCase(), name: input.name } });
}

/** Removes the Tenant record only. NOTE: tenant-owned rows/blobs are not cascade-purged
 *  (tenantId is a plain column, no FK) — a full purge is a separate operation. */
export async function deleteTenant(id: string): Promise<void> {
  const p = await prisma();
  await p.tenant.delete({ where: { id } });
}

export async function setTenantStatus(id: string, status: string): Promise<void> {
  const p = await prisma();
  await p.tenant.update({ where: { id }, data: { status } });
}

export async function setTenantFeatures(id: string, features: string[]): Promise<void> {
  const p = await prisma();
  await p.tenant.update({ where: { id }, data: { features } });
}

/** Disabled-feature keys for a tenant (empty for the default tenant / no DB, so nothing is gated). */
export async function tenantDisabledFeatures(tenantId: string): Promise<string[]> {
  return (await getTenantContext(tenantId)).features;
}

export interface TenantBrand {
  name: string | null;
  accent: string | null;
  logo: string | null;
}
const NO_BRAND: TenantBrand = { name: null, accent: null, logo: null };

/** Feature flags + white-label branding for a tenant in ONE lookup (used by getUser). Empty for
 *  the default tenant / no DB so the demo is never re-queried and stays on the stock brand. */
export async function getTenantContext(tenantId: string): Promise<{ features: string[]; brand: TenantBrand }> {
  if (!process.env.DATABASE_URL || tenantId === DEFAULT_TENANT) return { features: [], brand: { ...NO_BRAND } };
  try {
    const p = await prisma();
    const row = await p.tenant.findUnique({ where: { slug: tenantId }, select: { features: true, brandName: true, brandAccent: true, brandLogo: true } });
    return {
      features: (row?.features as string[]) ?? [],
      brand: { name: row?.brandName ?? null, accent: row?.brandAccent ?? null, logo: row?.brandLogo ?? null },
    };
  } catch {
    return { features: [], brand: { ...NO_BRAND } };
  }
}

/** Just the branding — used by the root layout to inject the accent colour before paint. */
export async function getTenantBranding(tenantId: string): Promise<TenantBrand> {
  return (await getTenantContext(tenantId)).brand;
}

export async function setTenantBranding(id: string, brand: { name?: string | null; accent?: string | null; logo?: string | null }): Promise<void> {
  const p = await prisma();
  const data: Record<string, unknown> = {};
  if (brand.name !== undefined) data.brandName = brand.name || null;
  if (brand.accent !== undefined) data.brandAccent = brand.accent || null;
  if (brand.logo !== undefined) data.brandLogo = brand.logo || null;
  if (Object.keys(data).length) await p.tenant.update({ where: { id }, data });
}

/** Lightweight monitoring counts for a tenant (by slug = the tenantId stamped on rows). */
export async function tenantStats(slug: string): Promise<{ users: number; bookings: number; directory: number }> {
  const p = await prisma();
  const [users, bookings, directory] = await Promise.all([
    p.user.count({ where: { tenantId: slug } }),
    p.booking.count({ where: { tenantId: slug } }),
    p.directoryUser.count({ where: { tenantId: slug } }),
  ]);
  return { users, bookings, directory };
}
