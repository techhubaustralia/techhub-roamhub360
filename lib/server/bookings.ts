import "server-only";
import { listBookings, listLocks, setBookingEventId, type Booking } from "./db";
import { validateBooking, overlaps, nowInTz, ACTIVE_STATUSES, type Kind } from "@/lib/booking-rules";
import { createBookingEvent, roomMailboxFor } from "./graph";
import type { EmailBrand } from "./email";
import type { AppUser } from "./auth";
import { getStoredPlan } from "./store";
import { getFloorPlan } from "@/lib/floorplans";
import { officeWinTz } from "@/lib/data";
import { spaceKey, type FloorPlan, type SpaceEl } from "@/lib/types";

// The per-booking server-side rules and the calendar-event step, shared by the single-booking
// route (POST /api/bookings) and the recurring route (POST /api/bookings/recurring) so a rule can
// never apply to one and not the other. Extracted verbatim from the create route: same order,
// same messages, same status codes. Request-level concerns (rate limits, zod, licence, on-behalf
// authorisation) stay in the routes.

export interface BookingRuleInput {
  buildingId: string;
  spaceKey: string;
  kind: Kind;
  durationType: "full" | "half" | "hourly";
  start: string;
  end: string;
}

export type BookingRuleResult = { ok: true; spaceEl: SpaceEl } | { ok: false; status: number; error: string };

/**
 * Closed site → space exists with matching kind → lock/assignment → building policy → desk-only
 * one-desk rule + per-site quotas → staff 8h hourly cap. `target` is the person the booking is
 * for (the caller, or the on-behalf target); `plan` is the authoritative floor plan.
 */
export async function checkBookingRules(b: BookingRuleInput, user: AppUser, target: string, policyPlan: FloorPlan): Promise<BookingRuleResult> {
  const kind = b.kind;

  // Closed sites are not bookable (the editor "Status: Closed" must be enforced server-side,
  // not just hidden in the UI).
  if (policyPlan.status === "closed") {
    return { ok: false, status: 409, error: "This site is currently closed for booking." };
  }

  // Ghost-booking prevention: the space must actually exist on this floor's plan
  // AND its type must match the requested kind. Rejects unknown/orphan references.
  const spaceEl = policyPlan.els.find(
    (e): e is SpaceEl =>
      (e.t === "desk" || e.t === "office" || e.t === "room" || e.t === "parking") && e.t === kind && spaceKey(e) === b.spaceKey,
  );
  if (!spaceEl) {
    return { ok: false, status: 400, error: "That space does not exist on this floor." };
  }

  // Server-side lock/assignment enforcement (never trust the client's colour state).
  // Temporary/maintenance locks block everyone; a permanent assignment blocks everyone
  // except the person it is reserved for.
  const lock = (await listLocks(b.buildingId)).find((l) => l.spaceKey === b.spaceKey);
  if (lock) {
    const reservedForTarget = lock.scope === "permanent" && !!lock.by && lock.by.toLowerCase() === target.toLowerCase();
    if (!reservedForTarget) {
      return { ok: false, status: 403, error: "This space is not available for booking (locked or reserved)." };
    }
  }

  // enforce the building's booking policy server-side (advance limit, weekdays, past, per-room max)
  const roomEl = kind === "room" && spaceEl.t === "room" ? spaceEl : undefined;
  const err = validateBooking(
    kind,
    b.start,
    b.end,
    {
      advanceDays: policyPlan.advanceDays,
      allowedWeekdays: policyPlan.allowedWeekdays,
      allowPast: policyPlan.allowPast,
      maxHours: roomEl?.maxHours,
      tz: policyPlan.tz, // office-local "today"/past checks (DST-safe)
      openTime: policyPlan.openTime, // meeting-room window follows office hours
      closeTime: policyPlan.closeTime,
    },
    b.durationType, // hourly bookings must start in the future
  );
  if (err) return { ok: false, status: 400, error: err };

  // Desk-only rules. Offices and meeting rooms are exempt (a user may hold several).
  // Office Managers (multiBook permission) may also hold multiple desks per day, so they
  // bypass the one-desk rule and per-building desk quota. Normal staff are unaffected.
  if (kind === "desk" && !user.multiBook) {
    const myDesks = (await listBookings({ userEmail: target })).filter(
      (x) => x.kind === "desk" && ACTIVE_STATUSES.includes(x.status),
    );
    // GLOBAL rule: one desk per person at any given time, across ALL buildings/regions.
    if (myDesks.some((x) => overlaps(x.start, x.end, b.start, b.end))) {
      return { ok: false, status: 409, error: "You already have a desk booked during this time. Only one desk per person at a time." };
    }
    // Per-building quota (per user). 0/undefined disables a given limit.
    const maxPerDay = policyPlan.maxDeskPerDay ?? 1;
    const maxConcurrent = policyPlan.maxConcurrent ?? 10;
    if (maxPerDay > 0 || maxConcurrent > 0) {
      const root = b.buildingId.split("__")[0];
      const startDate = b.start.slice(0, 10);
      const now = nowInTz(policyPlan.tz);
      const sameBuilding = myDesks.filter((x) => x.buildingId.split("__")[0] === root);
      if (maxPerDay > 0 && sameBuilding.filter((x) => overlaps(x.start, x.end, `${startDate}T00:00`, `${startDate}T23:59`)).length >= maxPerDay) {
        return { ok: false, status: 409, error: `You can hold at most ${maxPerDay} desk booking${maxPerDay === 1 ? "" : "s"} per day at this site.` };
      }
      if (maxConcurrent > 0 && sameBuilding.filter((x) => x.end >= now).length >= maxConcurrent) {
        return { ok: false, status: 409, error: `You have reached the limit of ${maxConcurrent} active desk bookings at this site.` };
      }
    }
  }

  // Staff may book at most 8 hours of HOURLY desk time per day (across all sites). A single
  // full-day booking represents the standard business day and is exempt; Site/Global Admins
  // (and Office Managers, who are site-admins) are exempt by role. Enforced server-side.
  if (kind === "desk" && user.role === "staff" && b.durationType === "hourly") {
    const day = b.start.slice(0, 10);
    const toMin = (iso: string) => {
      const [h, m] = iso.slice(11).split(":").map(Number);
      return h * 60 + m;
    };
    const newHours = (toMin(b.end) - toMin(b.start)) / 60;
    const used = (await listBookings({ userEmail: target }))
      .filter((x) => x.kind === "desk" && x.durationType === "hourly" && ACTIVE_STATUSES.includes(x.status) && x.start.slice(0, 10) === day)
      .reduce((s, x) => s + (toMin(x.end) - toMin(x.start)) / 60, 0);
    if (used + newHours > 8 + 1e-6) {
      return { ok: false, status: 409, error: `You can book at most 8 hours of desk time per day. You already have ${used.toFixed(1)}h booked that day.` };
    }
  }

  return { ok: true, spaceEl };
}

/**
 * Calendar event for a freshly created booking, on the owner's calendar. Full-day bookings become
 * an all-day event shown as "Free" (so they don't block the user's calendar); hourly bookings are
 * normal timed "Busy" events. Rooms add the room mailbox as a resource attendee (so Exchange
 * reserves it) plus a Teams link; desks/offices get a plain event; parking gets none. Best-effort —
 * the caller wraps it so a Graph failure never fails the booking. Stores the eventId on success.
 */
export async function createCalendarEvent(rec: Booking, kind: Kind, policyPlan: FloorPlan, eb: EmailBrand): Promise<void> {
  const allDay = rec.durationType === "full";
  const showAs: "free" | "busy" = allDay ? "free" : "busy";
  if (kind === "room") {
    const plan = (await getStoredPlan(rec.buildingId)) ?? getFloorPlan(rec.buildingId);
    const roomEl = plan.els.find((e) => e.t === "room" && spaceKey(e) === rec.spaceKey) as { mailbox?: string } | undefined;
    const mailbox = roomEl?.mailbox || roomMailboxFor(rec.spaceKey) || undefined;
    const tz = plan.winTz || officeWinTz(rec.buildingId);
    // Create the meeting on the owner's calendar (so it shows in their Outlook/Teams),
    // with the room as a resource attendee so Exchange reserves it and a Teams link attached.
    const eventId = await createBookingEvent({
      ownerEmail: rec.userEmail,
      subject: `${rec.spaceLabel} (${eb.productName})`,
      startLocal: rec.start,
      endLocal: rec.end,
      timeZone: tz,
      roomMailbox: mailbox,
      online: true,
      allDay,
      showAs,
    });
    if (eventId) await setBookingEventId(rec.id, eventId);
  } else if (kind === "desk" || kind === "office") {
    // Desk & office bookings also land on the owner's calendar (no room resource, no Teams
    // link). Update/cancel sync through the same eventId path as rooms.
    const tz = policyPlan.winTz || officeWinTz(rec.buildingId);
    const eventId = await createBookingEvent({
      ownerEmail: rec.userEmail,
      subject: `${rec.spaceLabel} (${eb.productName})`,
      startLocal: rec.start,
      endLocal: rec.end,
      timeZone: tz,
      online: false,
      allDay,
      showAs,
    });
    if (eventId) await setBookingEventId(rec.id, eventId);
  }
}
