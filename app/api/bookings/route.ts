import { NextResponse } from "next/server";
import { listBookings, createBooking, setBookingEventId, listLocks, ConflictError, audit } from "@/lib/server/db";
import { validateBooking, overlaps, nowInTz, ACTIVE_STATUSES, type Kind } from "@/lib/booking-rules";
import { getUser, canAccessBuilding } from "@/lib/server/auth";
import { assertCanWrite } from "@/lib/server/licensing";
import { currentTenantId } from "@/lib/server/tenant";
import { publishLive } from "@/lib/server/live-bus";
import { rateLimit, clientIp, tooMany } from "@/lib/server/rate-limit";
import { sendMail, createBookingEvent, roomMailboxFor } from "@/lib/server/graph";
import { confirmationEmail, emailBrand } from "@/lib/server/email";
import { sendPushToUser } from "@/lib/server/push";
import { dispatchEvent } from "@/lib/server/webhooks";
import { officeWinTz } from "@/lib/data";
import { getStoredPlan } from "@/lib/server/store";
import { getFloorPlan } from "@/lib/floorplans";
import { spaceKey, type SpaceEl } from "@/lib/types";
import { z } from "zod";

const isoLocal = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "must be YYYY-MM-DDTHH:mm");
const BookingInput = z.object({
  buildingId: z.string().min(1),
  spaceKey: z.string().min(1),
  spaceLabel: z.string().max(120).optional(),
  kind: z.enum(["desk", "office", "room", "parking"]).default("desk"),
  durationType: z.enum(["full", "half", "hourly"]).default("full"),
  start: isoLocal,
  end: isoLocal,
  userEmail: z.string().email().optional(),
});

/** Display name from an email local-part, e.g. "abin.raju@…" -> "Abin Raju". */
function displayName(email: string): string {
  return (email.split("@")[0] || email).replace(/[._]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const user = q.get("user")?.trim().toLowerCase() || undefined; // canonical identity
  const building = q.get("building") ?? undefined;
  const date = q.get("date") ?? undefined;
  // building+date -> active occupants for that floor/day (for colleague search on the map).
  // PII minimisation: non-admins get only { spaceKey, name }; never raw emails. A site-scoped
  // admin additionally gets userEmail for that building.
  if (building && date) {
    const me = await getUser();
    const adminHere = canAccessBuilding(me, building);
    // Match the floor-plan colouring (occupiedKeys): a booking counts for this day if it
    // OVERLAPS the day, not only if it STARTS on it. Filtering by start date alone hid
    // multi-day desk/parking bookings here — they showed as booked on the map but had no
    // occupant name and (for admins) no cancel action on the covered days.
    const dayStart = `${date}T00:00`;
    const dayEnd = `${date}T23:59`;
    const rows = (await listBookings({ buildingId: building })).filter(
      (b) => ACTIVE_STATUSES.includes(b.status) && overlaps(b.start, b.end, dayStart, dayEnd),
    );
    const rl = rateLimit(`occ:ip:${clientIp(req)}`, 120, 60_000); // search endpoint throttle
    if (!rl.ok) return tooMany(rl.retryAfter);
    return NextResponse.json(
      // Admins additionally get the booking id + email so they can cancel on the user's behalf.
      rows.map((b) => ({ spaceKey: b.spaceKey, name: displayName(b.userEmail), ...(adminHere ? { id: b.id, userEmail: b.userEmail } : {}) })),
    );
  }
  // Otherwise return the signed-in user's own bookings (My bookings / Home / bell).
  const me = await getUser();
  // Reading ANOTHER user's bookings is an admin action. Global admins may read anyone;
  // site admins may read another user but only the bookings within their own sites;
  // staff are always scoped to themselves (no cross-user reads).
  const limit = Math.min(Number(q.get("limit")) || 0, 500) || undefined;
  const offset = Number(q.get("offset")) || undefined;
  if (user && user !== me.email) {
    if (me.role === "global-admin") {
      return NextResponse.json(await listBookings({ userEmail: user, limit, offset }));
    }
    if (me.role === "site-admin") {
      const rows = await listBookings({ userEmail: user, limit, offset });
      return NextResponse.json(rows.filter((b) => canAccessBuilding(me, b.buildingId)));
    }
    return NextResponse.json({ error: "Not authorized to read other users' bookings." }, { status: 403 });
  }
  return NextResponse.json(await listBookings({ userEmail: me.email, limit, offset }));
}

export async function POST(req: Request) {
  // Throttle booking creation per IP (cheap guard against retry storms / spam) before any work.
  const ipRl = rateLimit(`book:ip:${clientIp(req)}`, 60, 60_000);
  if (!ipRl.ok) return tooMany(ipRl.retryAfter);

  const parsed = BookingInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  const b = parsed.data;
  const kind = b.kind as Kind;
  const user = await getUser();

  // Licence gate (CP2): an expired/suspended workspace is read-only — no new bookings.
  const lic = await assertCanWrite();
  if (!lic.ok) return NextResponse.json({ error: lic.error }, { status: 402 });
  // Per-user throttle (in addition to the per-IP guard above).
  const userRl = rateLimit(`book:user:${user.email}`, 20, 60_000);
  if (!userRl.ok) return tooMany(userRl.retryAfter);

  // Booking on behalf of someone else is an admin action; site admins may only do it
  // within their own sites. Staff can only book for themselves. Normalise the target email
  // to the same canonical (lowercase) form as identities so the target user can see it.
  const onBehalf = b.userEmail?.trim().toLowerCase();
  const isOnBehalf = !!onBehalf && onBehalf !== user.email;
  const target = onBehalf || user.email;
  if (isOnBehalf) {
    if (user.role === "staff" || !canAccessBuilding(user, b.buildingId)) {
      return NextResponse.json({ error: "Not authorized to book on behalf of others here." }, { status: 403 });
    }
  }

  // Load the authoritative plan for this floor (server is the source of truth).
  const policyPlan = (await getStoredPlan(b.buildingId)) ?? getFloorPlan(b.buildingId);

  // Closed sites are not bookable (the editor "Status: Closed" must be enforced server-side,
  // not just hidden in the UI).
  if (policyPlan.status === "closed") {
    return NextResponse.json({ error: "This site is currently closed for booking." }, { status: 409 });
  }

  // Ghost-booking prevention: the space must actually exist on this floor's plan
  // AND its type must match the requested kind. Rejects unknown/orphan references.
  const spaceEl = policyPlan.els.find(
    (e): e is SpaceEl =>
      (e.t === "desk" || e.t === "office" || e.t === "room" || e.t === "parking") && e.t === kind && spaceKey(e) === b.spaceKey,
  );
  if (!spaceEl) {
    return NextResponse.json({ error: "That space does not exist on this floor." }, { status: 400 });
  }

  // Server-side lock/assignment enforcement (never trust the client's colour state).
  // Temporary/maintenance locks block everyone; a permanent assignment blocks everyone
  // except the person it is reserved for.
  const lock = (await listLocks(b.buildingId)).find((l) => l.spaceKey === b.spaceKey);
  if (lock) {
    const reservedForTarget = lock.scope === "permanent" && !!lock.by && lock.by.toLowerCase() === target.toLowerCase();
    if (!reservedForTarget) {
      return NextResponse.json({ error: "This space is not available for booking (locked or reserved)." }, { status: 403 });
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
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  // Desk-only rules. Offices and meeting rooms are exempt (a user may hold several).
  // Office Managers (multiBook permission) may also hold multiple desks per day, so they
  // bypass the one-desk rule and per-building desk quota. Normal staff are unaffected.
  if (kind === "desk" && !user.multiBook) {
    const myDesks = (await listBookings({ userEmail: target })).filter(
      (x) => x.kind === "desk" && ACTIVE_STATUSES.includes(x.status),
    );
    // GLOBAL rule: one desk per person at any given time, across ALL buildings/regions.
    if (myDesks.some((x) => overlaps(x.start, x.end, b.start, b.end))) {
      return NextResponse.json(
        { error: "You already have a desk booked during this time. Only one desk per person at a time." },
        { status: 409 },
      );
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
        return NextResponse.json({ error: `You can hold at most ${maxPerDay} desk booking${maxPerDay === 1 ? "" : "s"} per day at this site.` }, { status: 409 });
      }
      if (maxConcurrent > 0 && sameBuilding.filter((x) => x.end >= now).length >= maxConcurrent) {
        return NextResponse.json({ error: `You have reached the limit of ${maxConcurrent} active desk bookings at this site.` }, { status: 409 });
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
      return NextResponse.json(
        { error: `You can book at most 8 hours of desk time per day. You already have ${used.toFixed(1)}h booked that day.` },
        { status: 409 },
      );
    }
  }

  try {
    const rec = await createBooking({
      userEmail: target,
      bookedByEmail: isOnBehalf ? user.email : null,
      buildingId: b.buildingId,
      spaceKey: b.spaceKey,
      spaceLabel: b.spaceLabel ?? b.spaceKey,
      kind,
      durationType: b.durationType ?? "full",
      start: b.start,
      end: b.end,
    });
    await audit(
      user.email,
      "booking.create",
      `${rec.buildingId}/${rec.spaceKey} (${rec.spaceLabel}) ${rec.start}..${rec.end} for ${rec.userEmail}${rec.bookedByEmail ? ` by ${rec.bookedByEmail}` : ""}`,
    );
    // notifications (no-op until Graph is configured; never fail the booking)
    try {
      const eb = await emailBrand(); // per-tenant product name for the email + calendar subject (G6)
      const mail = confirmationEmail(rec, eb);
      await sendMail(rec.userEmail, mail.subject, mail.html);
      await sendPushToUser(rec.userEmail, {
        title: `Booking confirmed · ${eb.productName}`,
        body: `${rec.spaceLabel} — ${rec.start.replace("T", " ")}`,
        url: "/mine",
        tag: `booking-${rec.id}`,
      });
      // Full-day bookings become an all-day calendar event shown as "Free" (so they don't
      // block the user's calendar); hourly bookings are normal timed "Busy" events.
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
    } catch (e) {
      console.error("notify failed", e);
    }
    publishLive(await currentTenantId(), "bookings"); // real-time: notify other clients live
    void dispatchEvent("booking.created", {
      id: rec.id, kind: rec.kind, buildingId: rec.buildingId, spaceKey: rec.spaceKey,
      spaceLabel: rec.spaceLabel, start: rec.start, end: rec.end, status: rec.status, userEmail: rec.userEmail,
    }).catch(() => {}); // outbound webhooks / Slack (best-effort)
    return NextResponse.json(rec, { status: 201 });
  } catch (e) {
    if (e instanceof ConflictError) return NextResponse.json({ error: "That space is already booked for the selected time." }, { status: 409 });
    throw e;
  }
}
