import "server-only";
import { prisma } from "./prisma";
import { purgeTenantStorage } from "./store";

// GDPR / offboarding: export or permanently delete ALL of a tenant's data. Platform-operator only
// (enforced at the route). Relational data is keyed by tenantId; floor-plan/building files are
// purged via the storage layer. Never touches the default workspace.
/* eslint-disable @typescript-eslint/no-explicit-any */


/** A portable JSON snapshot of everything personal/operational a tenant holds. Password hashes and
 *  encrypted integration secrets are stripped. */
export async function exportTenant(slug: string): Promise<Record<string, unknown>> {
  const p = await prisma();
  const where = { tenantId: slug };
  const [tenant, users, bookings, checkins, locks, audit, license, integration, directory, supportRequests, kbArticles] = await Promise.all([
    p.tenant.findUnique({ where: { slug } }),
    p.user.findMany({ where, select: { id: true, email: true, name: true, role: true, sites: true, multiBook: true, provider: true, hidePresence: true, notifyPresence: true, createdAt: true } }),
    p.booking.findMany({ where }),
    p.checkIn.findMany({ where }),
    p.lock.findMany({ where }),
    p.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 10000 }),
    p.license.findFirst({ where }),
    p.tenantIntegration.findFirst({ where, select: { tenantId: true, azureTenantId: true, graphClientId: true, mailFrom: true } }),
    p.directoryUser.findMany({ where }),
    p.supportRequest.findMany({ where }),
    p.kbArticle.findMany({ where }), // this workspace's own articles only (global ones aren't its data)
  ]);
  // SupportReply carries no tenantId — it belongs to a request. Pull replies for this tenant's requests.
  const reqIds = supportRequests.map((r: { id: string }) => r.id);
  const supportReplies = reqIds.length ? await p.supportReply.findMany({ where: { requestId: { in: reqIds } } }) : [];
  return {
    exportedAt: new Date().toISOString(),
    workspace: slug,
    tenant,
    counts: {
      users: users.length, bookings: bookings.length, checkins: checkins.length, locks: locks.length,
      directory: directory.length, audit: audit.length, supportRequests: supportRequests.length,
      supportReplies: supportReplies.length, kbArticles: kbArticles.length,
    },
    users,
    bookings,
    checkins,
    locks,
    directory,
    license,
    integration, // secret intentionally omitted
    audit,
    supportRequests,
    supportReplies,
    kbArticles,
    note: "Floor-plan/building layout and support attachment files are stored separately from this JSON; attachment metadata (names) is included above.",
  };
}

/** Permanently delete every trace of a tenant: relational rows, storage, and the tenant record.
 *  ALL rows are deleted atomically in one transaction, children before parents, so a mid-purge
 *  failure rolls back rather than leaving a half-deleted tenant. Storage (attachments + floor-plan
 *  files) is a filesystem/blob op and runs after the DB commit. The caller records the returned
 *  counts to the operator's (durable) audit log. */
export async function purgeTenant(slug: string): Promise<{ deleted: Record<string, number> }> {
  const p = await prisma();
  const where = { tenantId: slug };

  const deleted = await p.$transaction(async (tx: any) => {
    // SupportReply has no tenantId — it hangs off a request; delete replies first, then requests.
    const reqIds = (await tx.supportRequest.findMany({ where, select: { id: true } })).map((r: { id: string }) => r.id);
    const supportReplies = reqIds.length ? await tx.supportReply.deleteMany({ where: { requestId: { in: reqIds } } }) : { count: 0 };
    const supportRequests = await tx.supportRequest.deleteMany({ where });
    // CheckIn references Booking (real FK) → delete children first.
    const checkins = await tx.checkIn.deleteMany({ where });
    const bookings = await tx.booking.deleteMany({ where });
    const locks = await tx.lock.deleteMany({ where });
    const audit = await tx.auditLog.deleteMany({ where });
    const directory = await tx.directoryUser.deleteMany({ where });
    // Only this workspace's own KB articles; global (tenantId=null) articles are not its data.
    const kbArticles = await tx.kbArticle.deleteMany({ where });
    const users = await tx.user.deleteMany({ where });
    const integration = await tx.tenantIntegration.deleteMany({ where });
    const license = await tx.license.deleteMany({ where });
    const tenant = await tx.tenant.deleteMany({ where: { slug } });
    return {
      supportReplies: supportReplies.count, supportRequests: supportRequests.count,
      checkins: checkins.count, bookings: bookings.count, locks: locks.count, audit: audit.count,
      directory: directory.count, kbArticles: kbArticles.count, users: users.count,
      integration: integration.count, license: license.count, tenant: tenant.count,
    };
  });

  // Files (support attachments live under the same tenant dir, so this removes them too).
  await purgeTenantStorage(slug);
  return { deleted };
}
