import { NextResponse } from "next/server";
import { getBooking, setBookingStatus, updateBookingTimes, listBookings, ConflictError, audit } from "@/lib/server/db";
import { getUser, canAccessBuilding } from "@/lib/server/auth";
import { cancelBookingEvent, updateBookingEvent, sendMail } from "@/lib/server/graph";
import { cancellationEmail, updatedEmail } from "@/lib/server/email";
import { validateBooking, overlaps, ACTIVE_STATUSES, type Kind } from "@/lib/booking-rules";
import { getStoredPlan } from "@/lib/server/store";
import { getFloorPlan } from "@/lib/floorplans";
import { officeWinTz } from "@/lib/data";
import { spaceKey as keyOf } from "@/lib/types";

const ALLOWED = new Set(["Booked", "Checked in", "Checked out", "Cancelled", "Declined"]);
// Legal status transitions. Cancelled/Declined/Checked out are TERMINAL — a cancelled booking
// can never be resurrected (which would double-book a slot someone else has since taken).
const TRANSITIONS: Record<string, string[]> = {
  Booked: ["Checked in", "Cancelled", "Declined"],
  "Checked in": ["Checked out", "Cancelled", "Declined"],
  "Checked out": [],
  Cancelled: [],
  Declined: [],
};
const isoLocal = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await req.json().catch(() => ({}));

  const booking = await getBooking(id);
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  // Only the owner, the person who booked on their behalf, or a site-scoped admin may change it.
  const me = await getUser();
  // Case-insensitive owner match: identities are canonical-lowercase, but bookings created
  // before that normalisation may hold mixed-case emails.
  const meEmail = me.email.toLowerCase();
  const isOwner = booking.userEmail?.toLowerCase() === meEmail || booking.bookedByEmail?.toLowerCase() === meEmail;
  const isAdmin = canAccessBuilding(me, booking.buildingId); // global = always; site = own sites; staff = never
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Not authorized to modify this booking." }, { status: 403 });
  }

  // ---- EDIT MODE: change the booking's time window (re-validates every rule) ----
  if (isoLocal(parsed?.start) && isoLocal(parsed?.end)) {
    if (!ACTIVE_STATUSES.includes(booking.status)) {
      return NextResponse.json({ error: "Only an active booking can be rescheduled." }, { status: 409 });
    }
    const start = parsed.start as string;
    const end = parsed.end as string;
    const durationType = typeof parsed.durationType === "string" ? parsed.durationType : booking.durationType;
    const kind = booking.kind as Kind;
    const plan = (await getStoredPlan(booking.buildingId)) ?? getFloorPlan(booking.buildingId);
    if (plan.status === "closed") return NextResponse.json({ error: "This site is currently closed for booking." }, { status: 409 });
    const roomEl = plan.els.find((e) => e.t === "room" && keyOf(e) === booking.spaceKey) as { maxHours?: number } | undefined;
    const err = validateBooking(kind, start, end, {
      advanceDays: plan.advanceDays,
      allowedWeekdays: plan.allowedWeekdays,
      allowPast: plan.allowPast,
      maxHours: roomEl?.maxHours,
      tz: plan.tz,
      openTime: plan.openTime, // meeting-room window follows office hours
      closeTime: plan.closeTime,
    }, durationType);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    // Global one-desk rule (excluding this booking) — same guarantee as on create.
    // Office Managers (multiBook) are exempt, matching the create path.
    if (kind === "desk" && !me.multiBook) {
      const myDesks = (await listBookings({ userEmail: booking.userEmail })).filter(
        (x) => x.id !== id && x.kind === "desk" && ACTIVE_STATUSES.includes(x.status),
      );
      if (myDesks.some((x) => overlaps(x.start, x.end, start, end))) {
        return NextResponse.json({ error: "You already have a desk booked during this time. Only one desk per person at a time." }, { status: 409 });
      }
    }
    try {
      const rec = await updateBookingTimes(id, booking.buildingId, booking.spaceKey, start, end, durationType);
      await audit(me.email, "booking.edit", `${booking.buildingId}/${booking.spaceKey} (${booking.spaceLabel}) ${booking.start}..${booking.end} -> ${start}..${end}`);
      try {
        // Any booking that has a calendar event (room/desk/office) keeps it in sync on
        // reschedule, including the all-day/free vs timed/busy shape.
        if (booking.eventId) {
          const allDay = durationType === "full";
          await updateBookingEvent(booking.userEmail, booking.eventId, {
            startLocal: start,
            endLocal: end,
            timeZone: plan.winTz || officeWinTz(booking.buildingId),
            subject: `${booking.spaceLabel} (RoamHub360)`,
            allDay,
            showAs: allDay ? "free" : "busy",
          });
        }
        const mail = updatedEmail(rec);
        await sendMail(rec.userEmail, mail.subject, mail.html);
      } catch (e) {
        console.error("edit notify failed", e);
      }
      return NextResponse.json({ ok: true, booking: rec });
    } catch (e) {
      if (e instanceof ConflictError) return NextResponse.json({ error: "That time overlaps an existing booking for this space." }, { status: 409 });
      throw e;
    }
  }

  // ---- STATUS MODE ----
  const status = parsed?.status;
  const reason = typeof parsed?.reason === "string" ? parsed.reason.trim().slice(0, 500) : undefined;
  if (!status || !ALLOWED.has(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  // State-machine enforcement. Same-status is a no-op; otherwise the transition must be legal.
  if (status !== booking.status) {
    const legal = TRANSITIONS[booking.status] ?? [];
    if (!legal.includes(status)) {
      return NextResponse.json(
        { error: `Cannot change a ${booking.status.toLowerCase()} booking to ${status.toLowerCase()}.` },
        { status: 409 },
      );
    }
  }

  const isCancel = status === "Cancelled" || status === "Declined";
  // Admin cancellation = a scoped admin cancelling someone else's booking (not their own).
  const isAdminCancel = isCancel && isAdmin && !isOwner;
  // Conditional on the status we validated against — if a concurrent request changed it first,
  // this returns false and we reject, so racing transitions resolve to a single winner.
  const updated = await setBookingStatus(id, status, isCancel ? { cancelledBy: me.email, cancelReason: reason ?? null } : undefined, booking.status);
  if (!updated) {
    return NextResponse.json({ error: "This booking was just updated by someone else. Refresh and try again." }, { status: 409 });
  }
  await audit(
    me.email,
    isAdminCancel ? "booking.admin-cancel" : "booking.status",
    `${booking.buildingId}/${booking.spaceKey} (${booking.spaceLabel}) -> ${status}${isAdminCancel ? ` (admin cancel of ${booking.userEmail})` : ""}${reason ? ` — reason: ${reason}` : ""}`,
  );

  // On cancel/decline: retract the Exchange meeting (releases the room + notifies attendees)
  // and email the owner. Best-effort — never fail the cancel if Graph is down/unconfigured.
  if (isCancel) {
    try {
      // Retract the calendar event for any booking that has one (room OR desk).
      if (booking.eventId) {
        await cancelBookingEvent(booking.userEmail, booking.eventId);
      }
      const mail = cancellationEmail(booking, { byAdmin: isAdminCancel ? me.email : undefined, reason });
      await sendMail(booking.userEmail, mail.subject, mail.html);
    } catch (e) {
      console.error("cancel notify failed", e);
    }
  }
  return NextResponse.json({ ok: true, cancelledBy: isCancel ? me.email : undefined, adminCancel: isAdminCancel });
}
