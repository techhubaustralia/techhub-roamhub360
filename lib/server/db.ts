import "server-only";
import { prisma } from "./prisma";
import { promises as fs } from "fs";
import path from "path";
import { overlaps, ACTIVE_STATUSES } from "@/lib/booking-rules";
import { currentTenantId, DEFAULT_TENANT } from "./tenant";

// Bookings / check-ins / locks / audit. Prod: Postgres via Prisma (DATABASE_URL).
// Dev: local JSON files. @prisma/client imported lazily so local/build needs no client.
//
// MULTI-TENANCY: this module is the isolation choke-point. Every function resolves the
// current tenant (from the request host, via currentTenantId()) and scopes its query by
// tenantId — reads filter on it, writes stamp it, id-only fetches/updates become
// tenant-scoped. No caller can bypass it. Single-tenant deploys resolve to DEFAULT_TENANT,
// which is what all existing rows are backfilled to, so behaviour is unchanged.

export interface Booking {
  id: string;
  tenantId?: string;
  userEmail: string;
  bookedByEmail?: string | null;
  buildingId: string;
  spaceKey: string;
  spaceLabel: string;
  kind: string;
  durationType: string;
  start: string;
  end: string;
  status: string;
  eventId?: string | null; // Graph room-mailbox calendar event id (room bookings)
  cancelledBy?: string | null; // who cancelled; differs from owner => admin cancellation
  cancelReason?: string | null; // optional reason supplied at cancellation
}
export interface LockRow {
  spaceKey: string;
  scope: string;
  by?: string; // for permanent assignments, the person the space is reserved for
}

const useSql = Boolean(process.env.DATABASE_URL);
const DATA_DIR = path.join(process.cwd(), "data");
const F = {
  bookings: path.join(DATA_DIR, "bookings.json"),
  locks: path.join(DATA_DIR, "locks.json"),
  audit: path.join(DATA_DIR, "audit.json"),
};

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}
async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

/* eslint-disable @typescript-eslint/no-explicit-any */

// Collision-resistant id; the DB primary key enforces uniqueness as a backstop.
const rid = () => globalThis.crypto?.randomUUID?.() ?? "b_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// A file-backend record belongs to the tenant it's stamped with; legacy rows (no
// tenantId) are treated as the default tenant.
const ofTenant = (t: string) => (r: { tenantId?: string }) => (r.tenantId ?? DEFAULT_TENANT) === t;

export class ConflictError extends Error {
  constructor() {
    super("conflict");
    this.name = "ConflictError";
  }
}

// ---------- bookings ----------
// Default safety cap so no query can load an unbounded result set into memory.
const MAX_ROWS = 2000;

export async function listBookings(filter?: { userEmail?: string; buildingId?: string; from?: string; to?: string; limit?: number; offset?: number }): Promise<Booking[]> {
  const tenantId = await currentTenantId();
  const take = Math.min(filter?.limit ?? MAX_ROWS, MAX_ROWS);
  const skip = filter?.offset ?? 0;
  if (useSql) {
    const p = await prisma();
    const where: Record<string, unknown> = { tenantId };
    if (filter?.userEmail) where.userEmail = filter.userEmail;
    if (filter?.buildingId) where.buildingId = filter.buildingId;
    if (filter?.from || filter?.to) where.start = { ...(filter.from ? { gte: `${filter.from}T00:00` } : {}), ...(filter.to ? { lte: `${filter.to}T23:59` } : {}) };
    return p.booking.findMany({ where, orderBy: { createdAt: "desc" }, take, skip });
  }
  const all = await readJson<Booking[]>(F.bookings, []);
  const ue = filter?.userEmail?.toLowerCase();
  const filtered = all.filter(
    (b) =>
      ofTenant(tenantId)(b) &&
      (!ue || b.userEmail?.toLowerCase() === ue) &&
      (!filter?.buildingId || b.buildingId === filter.buildingId) &&
      (!filter?.from || b.start.slice(0, 10) >= filter.from) &&
      (!filter?.to || b.start.slice(0, 10) <= filter.to),
  );
  return filtered.slice(skip, skip + take);
}

/** Active bookings overlapping a given day in a building (for colouring the floor plan). */
export async function occupiedKeys(buildingId: string, dayStart: string, dayEnd: string): Promise<string[]> {
  const all = await listBookings({ buildingId });
  return all
    .filter((b) => ACTIVE_STATUSES.includes(b.status) && overlaps(b.start, b.end, dayStart, dayEnd))
    .map((b) => b.spaceKey);
}

/** Transient DB errors that warrant a retry under Serializable isolation.
 *  Postgres: serialization_failure (40001), deadlock_detected (40P01).
 *  (Legacy SQL Server codes 1205/3960 kept so the check stays engine-agnostic.) */
function isTransientSql(e: unknown): boolean {
  const s = JSON.stringify((e as { message?: string; meta?: unknown })?.message ?? e ?? "") + JSON.stringify((e as { meta?: unknown })?.meta ?? "");
  return /\b1205\b|\b3960\b|\b40001\b|40P01|deadlock|serializ|could not serialize/i.test(s);
}

export async function createBooking(input: Omit<Booking, "id" | "status"> & { status?: string }): Promise<Booking> {
  const tenantId = await currentTenantId();
  const rec: Booking = { ...input, id: rid(), status: input.status ?? "Booked", tenantId };
  // Overlap on the same resource = existing.start < new.end AND existing.end > new.start
  // (ISO-local strings compare chronologically). Active statuses only. Scoped to the tenant.
  if (useSql) {
    const p = await prisma();
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await p.$transaction(
          async (tx: any) => {
            const clash = await tx.booking.findFirst({
              where: {
                tenantId,
                buildingId: input.buildingId,
                spaceKey: input.spaceKey,
                status: { in: ACTIVE_STATUSES },
                start: { lt: input.end },
                end: { gt: input.start },
              },
            });
            if (clash) throw new ConflictError();
            return tx.booking.create({ data: rec });
          },
          { isolationLevel: "Serializable" },
        );
      } catch (e) {
        if (e instanceof ConflictError) throw e;
        if (!isTransientSql(e)) throw e;
        lastErr = e; // serialization/deadlock — retry a few times before giving up
      }
    }
    throw lastErr;
  }
  // File backend (single-process dev): read-check-write, tenant-scoped.
  const all = await readJson<Booking[]>(F.bookings, []);
  const clash = all.some(
    (b) => ofTenant(tenantId)(b) && b.buildingId === input.buildingId && b.spaceKey === input.spaceKey && ACTIVE_STATUSES.includes(b.status) && overlaps(b.start, b.end, input.start, input.end),
  );
  if (clash) throw new ConflictError();
  all.unshift(rec);
  await writeJson(F.bookings, all);
  return rec;
}

/** Cancel all ACTIVE bookings for the given spaces in a building/floor. Used when an admin
 *  removes a desk/office/room from a plan so those reservations don't become orphans that
 *  still count in occupancy/analytics. Returns how many were cancelled. */
export async function cancelBookingsForSpaces(buildingId: string, spaceKeys: string[]): Promise<number> {
  if (!spaceKeys.length) return 0;
  const tenantId = await currentTenantId();
  if (useSql) {
    const p = await prisma();
    const res = await p.booking.updateMany({
      where: { tenantId, buildingId, spaceKey: { in: spaceKeys }, status: { in: ACTIVE_STATUSES } },
      data: { status: "Cancelled" },
    });
    return res.count as number;
  }
  const all = await readJson<Booking[]>(F.bookings, []);
  let n = 0;
  const next = all.map((b) => {
    if (ofTenant(tenantId)(b) && b.buildingId === buildingId && spaceKeys.includes(b.spaceKey) && ACTIVE_STATUSES.includes(b.status)) {
      n++;
      return { ...b, status: "Cancelled" };
    }
    return b;
  });
  if (n) await writeJson(F.bookings, next);
  return n;
}

/** Cancel every ACTIVE booking across all floors of a building (root id). Used when a building
 *  is removed so its reservations don't linger as "active" in My bookings with a dead building
 *  reference. Bookings are keyed by floor id (`<root>` or `<root>__floor-N`). Returns the count. */
export async function cancelActiveBookingsForBuilding(rootId: string, by: string, reason: string): Promise<number> {
  const tenantId = await currentTenantId();
  if (useSql) {
    const p = await prisma();
    const res = await p.booking.updateMany({
      where: { tenantId, status: { in: ACTIVE_STATUSES }, OR: [{ buildingId: rootId }, { buildingId: { startsWith: `${rootId}__` } }] },
      data: { status: "Cancelled", cancelledBy: by, cancelReason: reason },
    });
    return res.count as number;
  }
  const all = await readJson<Booking[]>(F.bookings, []);
  let n = 0;
  const next = all.map((b) => {
    if (ofTenant(tenantId)(b) && (b.buildingId === rootId || b.buildingId.startsWith(`${rootId}__`)) && ACTIVE_STATUSES.includes(b.status)) {
      n++;
      return { ...b, status: "Cancelled", cancelledBy: by, cancelReason: reason };
    }
    return b;
  });
  if (n) await writeJson(F.bookings, next);
  return n;
}

/** Move a booking to a new time window, re-checking for a conflict on the SAME space
 *  (excluding this booking) inside a SERIALIZABLE transaction. Throws ConflictError on overlap. */
export async function updateBookingTimes(id: string, buildingId: string, spaceKey: string, start: string, end: string, durationType: string): Promise<Booking> {
  const tenantId = await currentTenantId();
  if (useSql) {
    const p = await prisma();
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await p.$transaction(
          async (tx: any) => {
            const clash = await tx.booking.findFirst({
              where: { tenantId, buildingId, spaceKey, id: { not: id }, status: { in: ACTIVE_STATUSES }, start: { lt: end }, end: { gt: start } },
            });
            if (clash) throw new ConflictError();
            const res = await tx.booking.updateMany({ where: { id, tenantId }, data: { start, end, durationType } });
            if (!res.count) throw new Error("booking not found");
            return tx.booking.findFirst({ where: { id, tenantId } });
          },
          { isolationLevel: "Serializable" },
        );
      } catch (e) {
        if (e instanceof ConflictError) throw e;
        if (!isTransientSql(e)) throw e;
        lastErr = e;
      }
    }
    throw lastErr;
  }
  const all = await readJson<Booking[]>(F.bookings, []);
  const clash = all.some((b) => ofTenant(tenantId)(b) && b.id !== id && b.buildingId === buildingId && b.spaceKey === spaceKey && ACTIVE_STATUSES.includes(b.status) && overlaps(b.start, b.end, start, end));
  if (clash) throw new ConflictError();
  let updated: Booking | undefined;
  const next = all.map((b) => (b.id === id && ofTenant(tenantId)(b) ? (updated = { ...b, start, end, durationType }) : b));
  await writeJson(F.bookings, next);
  return updated!;
}

/** Update a booking's status. When `expectStatus` is given, the write is CONDITIONAL on the
 *  stored status still matching it (optimistic concurrency). Returns true on success. */
export async function setBookingStatus(
  id: string,
  status: string,
  meta?: { cancelledBy?: string | null; cancelReason?: string | null },
  expectStatus?: string,
): Promise<boolean> {
  const tenantId = await currentTenantId();
  const data: Record<string, unknown> = { status };
  if (meta && "cancelledBy" in meta) data.cancelledBy = meta.cancelledBy ?? null;
  if (meta && "cancelReason" in meta) data.cancelReason = meta.cancelReason ?? null;
  if (useSql) {
    const p = await prisma();
    const where: Record<string, unknown> = { id, tenantId };
    if (expectStatus !== undefined) where.status = expectStatus; // atomic compare-and-set
    const res = await p.booking.updateMany({ where, data });
    return (res.count as number) > 0;
  }
  const all = await readJson<Booking[]>(F.bookings, []);
  let ok = false;
  const next = all.map((b) => {
    if (b.id !== id || !ofTenant(tenantId)(b)) return b;
    if (expectStatus !== undefined && b.status !== expectStatus) return b;
    ok = true;
    return { ...b, ...data };
  });
  if (ok) await writeJson(F.bookings, next);
  return ok;
}

/** Store the Graph calendar event id after a room reservation is created, so it can be cancelled later. */
export async function setBookingEventId(id: string, eventId: string | null): Promise<void> {
  const tenantId = await currentTenantId();
  if (useSql) {
    const p = await prisma();
    await p.booking.updateMany({ where: { id, tenantId }, data: { eventId } });
    return;
  }
  const all = await readJson<Booking[]>(F.bookings, []);
  await writeJson(F.bookings, all.map((b) => (b.id === id && ofTenant(tenantId)(b) ? { ...b, eventId } : b)));
}

export async function getBooking(id: string): Promise<Booking | null> {
  const tenantId = await currentTenantId();
  if (useSql) {
    const p = await prisma();
    return (await p.booking.findFirst({ where: { id, tenantId } })) ?? null; // tenant-scoped PK lookup
  }
  const all = await readJson<Booking[]>(F.bookings, []);
  return all.find((b) => b.id === id && ofTenant(tenantId)(b)) ?? null;
}

// ---------- locks ----------
type LockMap = Record<string, Record<string, { scope: string; by?: string }>>;

export async function listLocks(buildingId: string): Promise<LockRow[]> {
  const tenantId = await currentTenantId();
  if (useSql) {
    const p = await prisma();
    const rows = await p.lock.findMany({ where: { tenantId, buildingId } });
    return rows.map((r: any) => ({ spaceKey: r.spaceKey, scope: r.scope, by: r.lockedBy ?? undefined }));
  }
  const map = await readJson<LockMap>(F.locks, {});
  return Object.entries(map[buildingId] ?? {}).map(([spaceKey, v]) => ({ spaceKey, scope: v.scope, by: v.by }));
}

export async function setLock(buildingId: string, spaceKey: string, locked: boolean, scope = "temporary", by?: string): Promise<void> {
  const tenantId = await currentTenantId();
  if (useSql) {
    const p = await prisma();
    if (locked)
      await p.lock.upsert({
        where: { tenantId_buildingId_spaceKey: { tenantId, buildingId, spaceKey } },
        create: { tenantId, buildingId, spaceKey, scope, lockedBy: by },
        update: { scope, lockedBy: by },
      });
    else await p.lock.deleteMany({ where: { tenantId, buildingId, spaceKey } });
    return;
  }
  const map = await readJson<LockMap>(F.locks, {});
  map[buildingId] = map[buildingId] ?? {};
  if (locked) map[buildingId][spaceKey] = { scope, by };
  else delete map[buildingId][spaceKey];
  await writeJson(F.locks, map);
}

// ---------- audit ----------
export async function audit(actor: string, action: string, detail?: string): Promise<void> {
  // audit logging must never break the underlying operation
  try {
    const tenantId = await currentTenantId();
    if (useSql) {
      const p = await prisma();
      await p.auditLog.create({ data: { tenantId, actor, action, detail } });
      return;
    }
    const log = await readJson<AuditEntry[]>(F.audit, []);
    log.unshift({ at: new Date().toISOString(), tenantId, actor, action, detail });
    await writeJson(F.audit, log.slice(0, 1000));
  } catch (e) {
    console.error("audit failed (non-fatal)", e);
  }
}

/** Diagnostic: probe the audit backend directly (surfacing errors that audit() swallows). */
export async function auditSelfTest(): Promise<{ useSql: boolean; ok: boolean; count?: number; wrote?: boolean; error?: string }> {
  const out = { useSql, ok: false } as { useSql: boolean; ok: boolean; count?: number; wrote?: boolean; error?: string };
  try {
    const tenantId = await currentTenantId();
    if (useSql) {
      const p = await prisma();
      await p.auditLog.create({ data: { tenantId, actor: "diag", action: "diag.selftest", detail: "connectivity probe" } });
      out.wrote = true;
      out.count = (await p.auditLog.count({ where: { tenantId } })) as number;
    } else {
      const log = await readJson<AuditEntry[]>(F.audit, []);
      log.unshift({ at: new Date().toISOString(), tenantId, actor: "diag", action: "diag.selftest", detail: "probe" });
      await writeJson(F.audit, log);
      out.wrote = true;
      out.count = log.length;
    }
    out.ok = true;
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }
  return out;
}

export interface AuditEntry { at: string; tenantId?: string; actor: string; action: string; detail?: string }
export async function listAudit(limit = 200): Promise<AuditEntry[]> {
  const tenantId = await currentTenantId();
  if (useSql) {
    const p = await prisma();
    const rows = await p.auditLog.findMany({ where: { tenantId }, orderBy: { at: "desc" }, take: limit });
    return rows.map((r: any) => ({ at: (r.at as Date).toISOString(), actor: r.actor, action: r.action, detail: r.detail ?? undefined }));
  }
  const log = await readJson<AuditEntry[]>(F.audit, []);
  return log.filter(ofTenant(tenantId)).slice(0, limit);
}
