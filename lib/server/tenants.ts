import "server-only";
import { DEFAULT_TENANT } from "./tenant";

// Tenant (customer organisation) records + management. Platform-operator level.
/* eslint-disable @typescript-eslint/no-explicit-any */

let _prisma: any = null;
async function prisma(): Promise<any> {
  if (!process.env.DATABASE_URL) throw new Error("Tenant management requires DATABASE_URL (Postgres).");
  if (!_prisma) {
    const mod: any = await import("@prisma/client");
    _prisma = new mod.PrismaClient();
  }
  return _prisma;
}

export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  features?: string[];
  createdAt?: Date;
}

// Feature keys that a platform operator can turn OFF per tenant (CP3 feature flags).
export const FEATURES: { key: string; label: string }[] = [
  { key: "presence", label: "Who's in (team presence)" },
  { key: "directory", label: "Directory sync" },
  { key: "digest", label: "Daily who's-in digest" },
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
  if (!process.env.DATABASE_URL || tenantId === DEFAULT_TENANT) return [];
  try {
    const p = await prisma();
    const row = await p.tenant.findUnique({ where: { slug: tenantId }, select: { features: true } });
    return (row?.features as string[]) ?? [];
  } catch {
    return [];
  }
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
