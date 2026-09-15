// Pure shaping for the cross-site Office bookings overview (client + server safe, unit-tested).
// The route does the privileged work — tenant-scoped fetch, the hidePresence opt-out, directory
// enrichment, and deciding who may see emails — then hands everything here as plain data and
// callbacks, so the window/filter/search/sort/paginate rules are testable without a server.

import { ACTIVE_STATUSES } from "./booking-rules";
import { rootOf } from "./attendance";

export const OFFICE_BOOKINGS_MAX_DAYS = 62; // longest from..to window the route will serve
export const OFFICE_BOOKINGS_DEFAULT_DAYS = 14; // default window: today + 13 days
export const OFFICE_BOOKINGS_MAX_LIMIT = 500;

/** The subset of a stored booking the overview needs. */
export interface OfficeBookingSource {
  id: string;
  userEmail: string;
  bookedByEmail?: string | null;
  buildingId: string;
  spaceKey: string;
  spaceLabel: string;
  kind: string;
  durationType: string;
  start: string; // site-local wall-clock, YYYY-MM-DDTHH:mm
  end: string;
  status: string;
}

export interface OfficeBookingFilters {
  from: string; // YYYY-MM-DD, inclusive
  to: string;
  site?: string; // building root id
  floor?: string; // full floor id (<root>__floor-N)
  kind?: string; // desk | office | room | parking
  status?: string; // "active" (default) | "all" | an exact status
  q?: string;
  limit: number;
  offset: number;
}

/** One row as sent to the client. Name + photo only for everyone; email only when the route says
 *  the caller may see it for that building. */
export interface OfficeBookingRow {
  id?: string; // admins only
  name: string;
  photo?: string;
  isMe: boolean;
  by?: string; // display name of the booker when booked on someone's behalf
  date: string;
  start: string; // HH:mm
  end: string;
  endDate: string;
  kind: string;
  durationType: string;
  site: string;
  siteName: string;
  floor: string;
  space: string;
  status: string;
  checkedIn: boolean;
  userEmail?: string;
}

export interface OfficeBookingContext {
  meEmail: string; // lower-cased
  hidden: Set<string>; // lower-cased emails that opted out of presence
  nameOf: (email: string) => string;
  photoOf: (email: string) => string | undefined;
  siteNameOf: (root: string) => string;
  floorNameOf: (buildingId: string) => string;
  canSeeEmail: (buildingId: string) => boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (date: string, n: number): string => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86400000).toISOString().slice(0, 10);
};
const daySpan = (from: string, to: string): number => {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1;
};

/**
 * Validate + default the query. `today` is the site-local date the caller resolved (never the
 * server clock). Returns the filters, or an error message for a 400.
 */
export function parseOfficeBookingQuery(
  get: (name: string) => string | null,
  today: string,
): { filters: OfficeBookingFilters } | { error: string } {
  const from = get("from") || today;
  if (!DATE_RE.test(from)) return { error: "Dates must be YYYY-MM-DD." }; // validate before deriving `to` from it
  const to = get("to") || addDays(from, OFFICE_BOOKINGS_DEFAULT_DAYS - 1);
  if (!DATE_RE.test(to)) return { error: "Dates must be YYYY-MM-DD." };
  if (to < from) return { error: "The end date is before the start date." };
  if (daySpan(from, to) > OFFICE_BOOKINGS_MAX_DAYS) return { error: `The date range can cover at most ${OFFICE_BOOKINGS_MAX_DAYS} days.` };
  const limit = Math.min(Math.max(1, Number(get("limit")) || 100), OFFICE_BOOKINGS_MAX_LIMIT);
  const offset = Math.max(0, Number(get("offset")) || 0);
  return {
    filters: {
      from,
      to,
      site: get("site") || undefined,
      floor: get("floor") || undefined,
      kind: get("kind") || undefined,
      status: get("status") || "active",
      q: (get("q") || "").trim().toLowerCase() || undefined,
      limit,
      offset,
    },
  };
}

/** Earliest booking START date that could still overlap the window (multi-day desks/parking run
 *  at most 14 days), for the store query's lower bound. */
export const windowLowerBound = (from: string): string => addDays(from, -14);

/** Apply the window, opt-out, filters, search, sort and pagination. */
export function shapeOfficeBookings(
  bookings: OfficeBookingSource[],
  f: OfficeBookingFilters,
  ctx: OfficeBookingContext,
): { total: number; rows: OfficeBookingRow[] } {
  const wanted = bookings.filter((b) => {
    // Overlaps the window: starts on/before `to` and ends on/after `from` (multi-day aware).
    if (b.start.slice(0, 10) > f.to || b.end.slice(0, 10) < f.from) return false;
    if (f.status === "active" || !f.status) {
      if (!ACTIVE_STATUSES.includes(b.status)) return false;
    } else if (f.status !== "all" && b.status !== f.status) return false;
    const email = b.userEmail.toLowerCase();
    // Presence opt-out: never list someone who hid themselves — except to themselves.
    if (email !== ctx.meEmail && ctx.hidden.has(email)) return false;
    if (f.site && rootOf(b.buildingId) !== f.site) return false;
    if (f.floor && b.buildingId !== f.floor) return false;
    if (f.kind && b.kind !== f.kind) return false;
    if (f.q) {
      const hay = [ctx.nameOf(b.userEmail), b.spaceLabel, ctx.siteNameOf(rootOf(b.buildingId)), ctx.canSeeEmail(b.buildingId) ? b.userEmail : ""]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(f.q)) return false;
    }
    return true;
  });
  wanted.sort((a, b) => a.start.localeCompare(b.start) || ctx.nameOf(a.userEmail).localeCompare(ctx.nameOf(b.userEmail)));

  const rows = wanted.slice(f.offset, f.offset + f.limit).map((b): OfficeBookingRow => {
    const seeEmail = ctx.canSeeEmail(b.buildingId);
    const root = rootOf(b.buildingId);
    const onBehalf = !!b.bookedByEmail && b.bookedByEmail.toLowerCase() !== b.userEmail.toLowerCase();
    return {
      ...(seeEmail ? { id: b.id, userEmail: b.userEmail } : {}),
      name: ctx.nameOf(b.userEmail),
      photo: ctx.photoOf(b.userEmail),
      isMe: b.userEmail.toLowerCase() === ctx.meEmail,
      ...(onBehalf ? { by: ctx.nameOf(b.bookedByEmail as string) } : {}),
      date: b.start.slice(0, 10),
      start: b.start.slice(11),
      end: b.end.slice(11),
      endDate: b.end.slice(0, 10),
      kind: b.kind,
      durationType: b.durationType,
      site: root,
      siteName: ctx.siteNameOf(root),
      floor: ctx.floorNameOf(b.buildingId),
      space: b.spaceLabel || b.spaceKey,
      status: b.status,
      checkedIn: b.status === "Checked in",
    };
  });
  return { total: wanted.length, rows };
}
