import "server-only";
import { occupiedKeys, listLocks, listBookings } from "./db";
import { getStoredPlan, listCustomBuildings } from "./store";
import { getFloorPlan } from "../floorplans";
import { canAccessBuilding, type AppUser } from "./auth";
import { overlaps, ACTIVE_STATUSES } from "../booking-rules";
import { spaceKey, type SpaceEl, type SpaceKind } from "../types";

// Availability search powering the AI concierge. Tenant-scoped (via db/store) and permission-aware
// (only buildings the user may access). Optionally ranks free desks by proximity to a colleague's
// booking that day — "find me a desk near my team" becomes a real, grounded answer.

function spaceLabel(el: SpaceEl): string {
  if (el.t === "desk") return el.label || `Desk ${el.id}`;
  if (el.t === "parking") return el.label || `Bay ${el.id}`;
  if (el.t === "office") return el.name || `Office ${el.id}`;
  return el.name || "Meeting room";
}
const isSpace = (t: string): t is SpaceKind => t === "desk" || t === "office" || t === "room" || t === "parking";

export interface FreeSpace {
  buildingId: string;
  buildingName: string;
  spaceKey: string;
  spaceLabel: string;
  kind: SpaceKind;
  nearby?: boolean; // ranked as close to the requested colleague
}

// Every bookable space in a building — used to print QR desk check-in labels.
export async function listSpaces(buildingId: string): Promise<{ key: string; label: string; kind: SpaceKind }[]> {
  const plan = (await getStoredPlan(buildingId)) ?? getFloorPlan(buildingId);
  if (!plan) return [];
  return plan.els
    .filter((e) => isSpace(e.t))
    .map((e) => ({ key: spaceKey(e as SpaceEl), label: spaceLabel(e as SpaceEl), kind: (e as SpaceEl).t }));
}

/** The canonical label for a space (e.g. "Desk 1"), derived from the plan — not the model. */
export async function resolveSpaceLabel(buildingId: string, key: string): Promise<string | null> {
  const plan = (await getStoredPlan(buildingId)) ?? getFloorPlan(buildingId);
  if (!plan) return null;
  const el = plan.els.find((e) => isSpace(e.t) && spaceKey(e as SpaceEl) === key);
  return el ? spaceLabel(el as SpaceEl) : null;
}

export async function findAvailability(
  opts: { date: string; kind?: SpaceKind; buildingQuery?: string; nearEmail?: string; limit?: number },
  user: AppUser,
): Promise<FreeSpace[]> {
  const all = await listCustomBuildings();
  let targets = all.filter((b) => canAccessBuilding(user, b.id));
  if (opts.buildingQuery) {
    const q = opts.buildingQuery.toLowerCase();
    const matched = targets.filter((b) => b.name.toLowerCase().includes(q) || b.id.toLowerCase().includes(q));
    if (matched.length) targets = matched;
  }

  const dayStart = `${opts.date}T00:00`;
  const dayEnd = `${opts.date}T23:59`;
  const out: (FreeSpace & { dist?: number })[] = [];

  for (const b of targets.slice(0, 6)) {
    const plan = (await getStoredPlan(b.id)) ?? getFloorPlan(b.id);
    if (!plan || plan.status === "closed") continue;
    const [occ, locks, dayBookings] = await Promise.all([
      occupiedKeys(b.id, dayStart, dayEnd),
      listLocks(b.id),
      opts.nearEmail ? listBookings({ buildingId: b.id }) : Promise.resolve([]),
    ]);
    const taken = new Set([...occ, ...locks.map((l) => l.spaceKey)]);

    // Anchor for proximity ranking: the colleague's booked space that day, if any.
    let anchor: { x: number; y: number } | null = null;
    if (opts.nearEmail) {
      const their = dayBookings.find(
        (x) => x.userEmail.toLowerCase() === opts.nearEmail!.toLowerCase() && ACTIVE_STATUSES.includes(x.status) && overlaps(x.start, x.end, dayStart, dayEnd),
      );
      const el = their && plan.els.find((e) => isSpace(e.t) && spaceKey(e as SpaceEl) === their.spaceKey);
      if (el && "x" in el) anchor = { x: el.x, y: el.y };
    }

    for (const el of plan.els) {
      if (!isSpace(el.t)) continue;
      if (opts.kind && el.t !== opts.kind) continue;
      const key = spaceKey(el as SpaceEl);
      if (taken.has(key)) continue;
      const dist = anchor && "x" in el ? Math.hypot(el.x - anchor.x, el.y - anchor.y) : undefined;
      out.push({ buildingId: b.id, buildingName: b.name, spaceKey: key, spaceLabel: spaceLabel(el as SpaceEl), kind: el.t, dist });
    }
  }

  if (opts.nearEmail) {
    out.sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity));
    out.slice(0, 3).forEach((s) => (s.nearby = s.dist !== undefined));
  }
  return out.slice(0, opts.limit ?? 10).map(({ dist: _dist, ...s }) => s);
}
