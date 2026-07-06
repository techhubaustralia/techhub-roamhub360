import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { overlaps, ACTIVE_STATUSES } from "@/lib/booking-rules";

// Bookings / check-ins / locks / audit. Prod: Azure SQL via Prisma (DATABASE_URL).
// Dev: local JSON files. @prisma/client imported lazily so local/build needs no client.

export interface Booking {
  id: string;
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
let _prisma: any = null;
async function prisma(): Promise<any> {
  if (!_prisma) {
    const mod: any = await import("@prisma/client");
    _prisma = new mod.PrismaClient();
  }
  return _prisma;
}

// Collision-resistant id; the DB primary key enforces uniqueness as a backstop.
const rid = () => globalThis.crypto?.randomUUID?.() ?? "b_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

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
  const take = Math.min(filter?.limit ?? MAX_ROWS, MAX_ROWS);
  const skip = filter?.offset ?? 0;
  if (useSql) {
    const p = await prisma();
    // Push filters + pagination to the DB so analytics/large ranges don't load every row.
    const where: Record<string, unknown> = {};
    if (filter?.userEmail) where.userEmail = filter.userEmail;
    if (filter?.buildingId) where.buildingId = filter.buildingId;
    if (filter?.from || filter?.to) where.start = { ...(filter.from ? { gte: `${filter.from}T00:00` } : {}), ...(filter.to ? { lte: `${filter.to}T23:59` } : {}) };
    return p.booking.findMany({ where, orderBy: { createdAt: "desc" }, take, skip });
  }
  const all = await readJson<Booking[]>(F.bookings, []);
  const ue = filter?.userEmail?.toLowerCase();
  const filtered = all.filter(
    (b) =>
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
  const rec: Booking = { ...input, id: rid(), status: input.status ?? "Booked" };
  // Overlap on the same resource = existing.start < new.end AND existing.end > new.start
  // (ISO-local strings compare chronologically). Active statuses only.
  if (useSql) {
    const p = await prisma();
    // Re-check + insert inside ONE SERIALIZABLE transaction. Under Serializable,
    // the conflict SELECT takes key-range locks on the (buildingId, spaceKey) index,
    // so a concurrent booking for the same space/time cannot insert a phantom row
    // between our check and insert — guaranteeing at most one booking wins.
    // Default READ COMMITTED would let both transactions pass the check and double-book.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await p.$transaction(
          async (tx: any) => {
            const clash = await tx.booking.findFirst({
              where: {
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
  // File backend (single-process dev): read-check-write.
  const all = await readJson<Booking[]>(F.bookings, []);
  const clash = all.some(
    (b) => b.buildingId === input.buildingId && b.spaceKey === input.spaceKey && ACTIVE_STATUSES.includes(b.status) && overlaps(b.start, b.end, input.start, input.end),
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
  if (useSql) {
    const p = await prisma();
    const res = await p.booking.updateMany({
      where: { buildingId, spaceKey: { in: spaceKeys }, status: { in: ACTIVE_STATUSES } },
      data: { status: "Cancelled" },
    });
    return res.count as number;
  }
  const all = await readJson<Booking[]>(F.bookings, []);
  let n = 0;
  const next = all.map((b) => {
    if (b.buildingId === buildingId && spaceKeys.includes(b.spaceKey) && ACTIVE_STATUSES.includes(b.status)) {
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
  if (useSql) {
    const p = await prisma();
    const res = await p.booking.updateMany({
      where: { status: { in: ACTIVE_STATUSES }, OR: [{ buildingId: rootId }, { buildingId: { startsWith: `${rootId}__` } }] },
      data: { status: "Cancelled", cancelledBy: by, cancelReason: reason },
    });
    return res.count as number;
  }
  const all = await readJson<Booking[]>(F.bookings, []);
  let n = 0;
  const next = all.map((b) => {
    if ((b.buildingId === rootId || b.buildingId.startsWith(`${rootId}__`)) && ACTIVE_STATUSES.includes(b.status)) {
      n++;
      return { ...b, status: "Cancelled", cancelledBy: by, cancelReason: reason };
    }
    return b;
  });
  if (n) await writeJson(F.bookings, next);
  return n;
}

/** Update a booking's status. When `expectStatus` is given, the write is CONDITIONAL on the
 *  stored status still matching it (optimistic concurrency) — returns false if it changed
 *  under us, so two racing transitions (e.g. admin cancel vs user check-in) resolve to exactly
 *  one winner instead of a silent last-write-wins. Returns true on success. */
/** Move a booking to a new time window, re-checking for a conflict on the SAME space
 *  (excluding this booking) inside a SERIALIZABLE transaction. Throws ConflictError on overlap. */
export async function updateBookingTimes(id: string, buildingId: string, spaceKey: string, start: string, end: string, durationType: string): Promise<Booking> {
  if (useSql) {
    const p = await prisma();
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await p.$transaction(
          async (tx: any) => {
            const clash = await tx.booking.findFirst({
              where: { buildingId, spaceKey, id: { not: id }, status: { in: ACTIVE_STATUSES }, start: { lt: end }, end: { gt: start } },
            });
            if (clash) throw new ConflictError();
            return tx.booking.update({ where: { id }, data: { start, end, durationType } });
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
  const clash = all.some((b) => b.id !== id && b.buildingId === buildingId && b.spaceKey === spaceKey && ACTIVE_STATUSES.includes(b.status) && overlaps(b.start, b.end, start, end));
  if (clash) throw new ConflictError();
  let updated: Booking | undefined;
  const next = all.map((b) => (b.id === id ? (updated = { ...b, start, end, durationType }) : b));
  await writeJson(F.bookings, next);
  return updated!;
}

export async function setBookingStatus(
  id: string,
  status: string,
  meta?: { cancelledBy?: string | null; cancelReason?: string | null },
  expectStatus?: string,
): Promise<boolean> {
  const data: Record<string, unknown> = { status };
  if (meta && "cancelledBy" in meta) data.cancelledBy = meta.cancelledBy ?? null;
  if (meta && "cancelReason" in meta) data.cancelReason = meta.cancelReason ?? null;
  if (useSql) {
    const p = await prisma();
    if (expectStatus !== undefined) {
      const res = await p.booking.updateMany({ where: { id, status: expectStatus }, data }); // atomic compare-and-set
      return (res.count as number) > 0;
    }
    await p.booking.update({ where: { id }, data });
    return true;
  }
  const all = await readJson<Booking[]>(F.bookings, []);
  let ok = true;
  const next = all.map((b) => {
    if (b.id !== id) return b;
    if (expectStatus !== undefined && b.status !== expectStatus) { ok = false; return b; }
    return { ...b, ...data };
  });
  if (ok) await writeJson(F.bookings, next);
  return ok;
}

/** Store the Graph calendar event id after a room reservation is created, so it can be cancelled later. */
export async function setBookingEventId(id: string, eventId: string | null): Promise<void> {
  if (useSql) {
    const p = await prisma();
    await p.booking.update({ where: { id }, data: { eventId } });
    return;
  }
  const all = await readJson<Booking[]>(F.bookings, []);
  await writeJson(F.bookings, all.map((b) => (b.id === id ? { ...b, eventId } : b)));
}

export async function getBooking(id: string): Promise<Booking | null> {
  if (useSql) {
    const p = await prisma();
    return (await p.booking.findUnique({ where: { id } })) ?? null; // indexed PK lookup, no table scan
  }
  const all = await readJson<Booking[]>(F.bookings, []);
  return all.find((b) => b.id === id) ?? null;
}

// ---------- locks ----------
type LockMap = Record<string, Record<string, { scope: string; by?: string }>>;

export async function listLocks(buildingId: string): Promise<LockRow[]> {
  if (useSql) {
    const p = await prisma();
    const rows = await p.lock.findMany({ where: { buildingId } });
    return rows.map((r: any) => ({ spaceKey: r.spaceKey, scope: r.scope, by: r.lockedBy ?? undefined }));
  }
  const map = await readJson<LockMap>(F.locks, {});
  return Object.entries(map[buildingId] ?? {}).map(([spaceKey, v]) => ({ spaceKey, scope: v.scope, by: v.by }));
}

export async function setLock(buildingId: string, spaceKey: string, locked: boolean, scope = "temporary", by?: string): Promise<void> {
  if (useSql) {
    const p = await prisma();
    if (locked)
      await p.lock.upsert({
        where: { buildingId_spaceKey: { buildingId, spaceKey } },
        create: { buildingId, spaceKey, scope, lockedBy: by },
        update: { scope, lockedBy: by },
      });
    else await p.lock.deleteMany({ where: { buildingId, spaceKey } });
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
    if (useSql) {
      const p = await prisma();
      await p.auditLog.create({ data: { actor, action, detail } });
      return;
    }
    const log = await readJson<{ at: string; actor: string; action: string; detail?: string }[]>(F.audit, []);
    log.unshift({ at: new Date().toISOString(), actor, action, detail });
    await writeJson(F.audit, log.slice(0, 1000));
  } catch (e) {
    console.error("audit failed (non-fatal)", e);
  }
}

/** Diagnostic: probe the audit backend directly (surfacing errors that audit() swallows).
 *  Writes one probe row, then reads the count — so we can tell missing-table vs write-fail
 *  vs read-fail vs file-backend, with the exact Prisma error. */
export async function auditSelfTest(): Promise<{ useSql: boolean; ok: boolean; count?: number; wrote?: boolean; error?: string }> {
  const out = { useSql, ok: false } as { useSql: boolean; ok: boolean; count?: number; wrote?: boolean; error?: string };
  try {
    if (useSql) {
      const p = await prisma();
      await p.auditLog.create({ data: { actor: "diag", action: "diag.selftest", detail: "connectivity probe" } });
      out.wrote = true;
      out.count = (await p.auditLog.count()) as number;
    } else {
      const log = await readJson<AuditEntry[]>(F.audit, []);
      log.unshift({ at: new Date().toISOString(), actor: "diag", action: "diag.selftest", detail: "probe" });
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

export interface AuditEntry { at: string; actor: string; action: string; detail?: string }
export async function listAudit(limit = 200): Promise<AuditEntry[]> {
  if (useSql) {
    const p = await prisma();
    const rows = await p.auditLog.findMany({ orderBy: { at: "desc" }, take: limit });
    return rows.map((r: any) => ({ at: (r.at as Date).toISOString(), actor: r.actor, action: r.action, detail: r.detail ?? undefined }));
  }
  const log = await readJson<AuditEntry[]>(F.audit, []);
  return log.slice(0, limit);
}
