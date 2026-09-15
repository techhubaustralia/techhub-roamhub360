import { NextResponse } from "next/server";
import { z } from "zod";
import { createBooking, ConflictError, audit, type Booking } from "@/lib/server/db";
import { deriveTimes, type Kind } from "@/lib/booking-rules";
import { expandWeekly, MAX_OCCURRENCES } from "@/lib/recurrence";
import { checkBookingRules, createCalendarEvent } from "@/lib/server/bookings";
import { getUser, canAccessBuilding } from "@/lib/server/auth";
import { assertCanWrite } from "@/lib/server/licensing";
import { currentTenantId } from "@/lib/server/tenant";
import { publishLive } from "@/lib/server/live-bus";
import { rateLimit, clientIp, tooMany } from "@/lib/server/rate-limit";
import { sendMail } from "@/lib/server/graph";
import { recurringConfirmationEmail, emailBrand } from "@/lib/server/email";
import { sendPushToUser } from "@/lib/server/push";
import { dispatchEvent } from "@/lib/server/webhooks";
import { getStoredPlan } from "@/lib/server/store";
import { getFloorPlan } from "@/lib/floorplans";

// "Repeat weekly": ONE request books the same space on every selected weekday from startDate to
// until (≤ MAX_OCCURRENCES single-day bookings). Request-level checks run once; the per-booking
// rules (lib/server/bookings.ts — the very same code the single-booking route uses) run per date,
// and each date is created independently so one conflict never blocks the rest. The caller gets
// exactly what was booked and, per skipped date, the real reason. Per-booking things stay
// per-booking (audit line, calendar event, webhook); what was noise is batched: ONE summary
// email, ONE push, ONE live publish — instead of the 60 of each a client-side loop would send.

const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "must be HH:mm");
const RecurringInput = z.object({
  buildingId: z.string().min(1),
  spaceKey: z.string().min(1),
  spaceLabel: z.string().max(120).optional(),
  kind: z.enum(["desk", "office", "room", "parking"]).default("desk"),
  durationType: z.enum(["full", "half", "hourly"]).default("full"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  weekdays: z.array(z.boolean()).length(7),
  startTime: hhmm.optional(),
  endTime: hhmm.optional(),
  half: z.enum(["am", "pm"]).optional(),
  userEmail: z.string().email().optional(),
});

export interface RecurringResult {
  created: Booking[];
  skipped: { date: string; reason: string }[];
  requested: number;
}

export async function POST(req: Request) {
  // Tighter buckets than single bookings: one request can create up to 60 bookings.
  const ipRl = await rateLimit(`book:recurring:ip:${clientIp(req)}`, 10, 60_000);
  if (!ipRl.ok) return tooMany(ipRl.retryAfter);

  const parsed = RecurringInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  const b = parsed.data;
  const kind = b.kind as Kind;
  const user = await getUser();

  // Licence gate (CP2): an expired/suspended workspace is read-only — no new bookings.
  const lic = await assertCanWrite();
  if (!lic.ok) return NextResponse.json({ error: lic.error }, { status: 402 });
  const userRl = await rateLimit(`book:recurring:user:${user.email}`, 5, 60_000);
  if (!userRl.ok) return tooMany(userRl.retryAfter);

  // Same on-behalf rule as a single booking: admins only, site admins only within their sites.
  const onBehalf = b.userEmail?.trim().toLowerCase();
  const isOnBehalf = !!onBehalf && onBehalf !== user.email;
  const target = onBehalf || user.email;
  if (isOnBehalf && (user.role === "staff" || !canAccessBuilding(user, b.buildingId))) {
    return NextResponse.json({ error: "Not authorized to book on behalf of others here." }, { status: 403 });
  }

  const expanded = expandWeekly({ startDate: b.startDate, until: b.until, weekdays: b.weekdays }, MAX_OCCURRENCES);
  if ("error" in expanded) return NextResponse.json({ error: expanded.error }, { status: 400 });
  const dates = expanded.dates;

  // Load the authoritative plan once; the rules re-check it per date (closed site etc.).
  const plan = (await getStoredPlan(b.buildingId)) ?? getFloorPlan(b.buildingId);
  const eb = await emailBrand();

  const created: Booking[] = [];
  const skipped: { date: string; reason: string }[] = [];
  for (const date of dates) {
    // Each occurrence is a single-day booking (no multi-day "To"), timed like a single booking.
    const { start, end } = deriveTimes({
      kind,
      duration: b.durationType,
      startDate: date,
      startTime: b.startTime,
      endTime: b.endTime,
      half: b.half,
      hours: { open: plan.openTime, close: plan.closeTime },
    });
    // Evaluated sequentially against live state, so the one-desk rule and quotas see the dates
    // already created earlier in this batch — the same result as booking them one at a time.
    const rules = await checkBookingRules({ buildingId: b.buildingId, spaceKey: b.spaceKey, kind, durationType: b.durationType, start, end }, user, target, plan);
    if (!rules.ok) {
      skipped.push({ date, reason: rules.error });
      continue;
    }
    try {
      const rec = await createBooking({
        userEmail: target,
        bookedByEmail: isOnBehalf ? user.email : null,
        buildingId: b.buildingId,
        spaceKey: b.spaceKey,
        spaceLabel: b.spaceLabel ?? b.spaceKey,
        kind,
        durationType: b.durationType,
        start,
        end,
      });
      created.push(rec);
      await audit(
        user.email,
        "booking.create",
        `${rec.buildingId}/${rec.spaceKey} (${rec.spaceLabel}) ${rec.start}..${rec.end} for ${rec.userEmail}${rec.bookedByEmail ? ` by ${rec.bookedByEmail}` : ""} (recurring ${created.length}/${dates.length})`,
      );
      try {
        await createCalendarEvent(rec, kind, plan, eb); // best-effort, never fails the booking
      } catch (e) {
        console.error("recurring calendar event failed", e);
      }
      void dispatchEvent("booking.created", {
        id: rec.id, kind: rec.kind, buildingId: rec.buildingId, spaceKey: rec.spaceKey,
        spaceLabel: rec.spaceLabel, start: rec.start, end: rec.end, status: rec.status, userEmail: rec.userEmail,
      }).catch(() => {});
    } catch (e) {
      if (e instanceof ConflictError) {
        skipped.push({ date, reason: "That space is already booked for the selected time." });
        continue;
      }
      throw e;
    }
  }

  if (created.length) {
    // One summary notification for the whole series (never fail the bookings over it).
    try {
      const mail = recurringConfirmationEmail(created, skipped, eb);
      await sendMail(target, mail.subject, mail.html);
      await sendPushToUser(target, {
        title: `${created.length} booking${created.length === 1 ? "" : "s"} confirmed · ${eb.productName}`,
        body: `${created[0].spaceLabel} — ${created.length} of ${dates.length} dates`,
        url: "/mine",
        tag: `booking-series-${created[0].id}`,
      });
    } catch (e) {
      console.error("recurring notify failed", e);
    }
    publishLive(await currentTenantId(), "bookings");
  }

  const result: RecurringResult = { created, skipped, requested: dates.length };
  // 201 when anything was booked; 409 when every date was refused (the reasons say why).
  return NextResponse.json(result, { status: created.length ? 201 : 409 });
}
