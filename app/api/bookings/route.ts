import { NextResponse } from "next/server";
import { listBookings, createBooking, ConflictError, audit } from "@/lib/server/db";
import { overlaps, ACTIVE_STATUSES, type Kind } from "@/lib/booking-rules";
import { checkBookingRules, createCalendarEvent } from "@/lib/server/bookings";
import { getUser, canAccessBuilding } from "@/lib/server/auth";
import { assertCanWrite } from "@/lib/server/licensing";
import { currentTenantId } from "@/lib/server/tenant";
import { publishLive } from "@/lib/server/live-bus";
import { rateLimit, clientIp, tooMany } from "@/lib/server/rate-limit";
import { sendMail } from "@/lib/server/graph";
import { confirmationEmail, emailBrand } from "@/lib/server/email";
import { sendPushToUser } from "@/lib/server/push";
import { dispatchEvent } from "@/lib/server/webhooks";
import { getStoredPlan } from "@/lib/server/store";
import { getFloorPlan } from "@/lib/floorplans";
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
    const rl = await rateLimit(`occ:ip:${clientIp(req)}`, 120, 60_000); // search endpoint throttle
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
  const ipRl = await rateLimit(`book:ip:${clientIp(req)}`, 60, 60_000);
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
  const userRl = await rateLimit(`book:user:${user.email}`, 20, 60_000);
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

  // Per-booking rules (closed site, ghost check, locks, policy, one-desk, quotas, 8h cap) —
  // shared with the recurring route in lib/server/bookings.ts.
  const rules = await checkBookingRules(
    { buildingId: b.buildingId, spaceKey: b.spaceKey, kind, durationType: b.durationType ?? "full", start: b.start, end: b.end },
    user,
    target,
    policyPlan,
  );
  if (!rules.ok) return NextResponse.json({ error: rules.error }, { status: rules.status });

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
      // Calendar event on the owner's calendar (rooms reserve the room mailbox) — shared step.
      await createCalendarEvent(rec, kind, policyPlan, eb);
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
