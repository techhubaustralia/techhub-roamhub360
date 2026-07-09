import "server-only";
import { purgeTenantStorage } from "./store";

// GDPR / offboarding: export or permanently delete ALL of a tenant's data. Platform-operator only
// (enforced at the route). Relational data is keyed by tenantId; floor-plan/building files are
// purged via the storage layer. Never touches the default workspace.
/* eslint-disable @typescript-eslint/no-explicit-any */

let _prisma: any = null;
async function prisma(): Promise<any> {
  if (!process.env.DATABASE_URL) throw new Error("Tenant data operations require DATABASE_URL.");
  if (!_prisma) _prisma = new (await import("@prisma/client")).PrismaClient();
  return _prisma;
}

/** A portable JSON snapshot of everything personal/operational a tenant holds. Password hashes and
 *  encrypted integration secrets are stripped. */
export async function exportTenant(slug: string): Promise<Record<string, unknown>> {
  const p = await prisma();
  const where = { tenantId: slug };
  const [tenant, users, bookings, checkins, locks, audit, license, integration, directory] = await Promise.all([
    p.tenant.findUnique({ where: { slug } }),
    p.user.findMany({ where, select: { id: true, email: true, name: true, role: true, sites: true, multiBook: true, provider: true, hidePresence: true, notifyPresence: true, createdAt: true } }),
    p.booking.findMany({ where }),
    p.checkIn.findMany({ where }),
    p.lock.findMany({ where }),
    p.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 10000 }),
    p.license.findFirst({ where }),
    p.tenantIntegration.findFirst({ where, select: { tenantId: true, azureTenantId: true, graphClientId: true, mailFrom: true } }),
    p.directoryUser.findMany({ where }),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    workspace: slug,
    tenant,
    counts: { users: users.length, bookings: bookings.length, checkins: checkins.length, locks: locks.length, directory: directory.length, audit: audit.length },
    users,
    bookings,
    checkins,
    locks,
    directory,
    license,
    integration, // secret intentionally omitted
    audit,
    note: "Floor-plan and building layout files are configuration, not personal data, and are exported separately if needed.",
  };
}

/** Permanently delete every trace of a tenant: relational rows, storage, and the tenant record. */
export async function purgeTenant(slug: string): Promise<{ deleted: Record<string, number> }> {
  const p = await prisma();
  const where = { tenantId: slug };
  // Order doesn't matter (no FKs enforced across these), but do them explicitly for an audit trail.
  const [bookings, checkins, locks, audit, directory, users, integration, license] = await Promise.all([
    p.booking.deleteMany({ where }),
    p.checkIn.deleteMany({ where }),
    p.lock.deleteMany({ where }),
    p.auditLog.deleteMany({ where }),
    p.directoryUser.deleteMany({ where }),
    p.user.deleteMany({ where }),
    p.tenantIntegration.deleteMany({ where }),
    p.license.deleteMany({ where }),
  ]);
  await purgeTenantStorage(slug);
  await p.tenant.deleteMany({ where: { slug } });
  return {
    deleted: {
      bookings: bookings.count, checkins: checkins.count, locks: locks.count, audit: audit.count,
      directory: directory.count, users: users.count, integration: integration.count, license: license.count,
    },
  };
}
