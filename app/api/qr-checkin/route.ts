import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser, canAccessBuilding } from "@/lib/server/auth";
import { listBookings, setBookingStatus, audit } from "@/lib/server/db";
import { getStoredPlan } from "@/lib/server/store";
import { getFloorPlan } from "@/lib/floorplans";
import { resolveSpaceLabel } from "@/lib/server/availability";
import { currentTenantId } from "@/lib/server/tenant";
import { publishLive } from "@/lib/server/live-bus";
import { ACTIVE_STATUSES } from "@/lib/booking-rules";

// Scan-a-QR-at-your-desk check-in. The sticker on a desk is STATIC — it encodes the space, not a
// person — so this finds the signed-in scanner's own active booking for that space *today* and
// checks them in. Requires a session (middleware enforces it; the QR link routes through /checkin,
// which prompts sign-in first). Distinct path from the public token flow at /api/checkin.
const Body = z.object({ buildingId: z.string().min(1), spaceKey: z.string().min(1) });

// Today's yyyy-mm-dd in the building's own timezone (a booking's start is local wall-clock).
function todayInTz(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export async function POST(req: Request) {
  const me = await getUser();
  if (!me.email) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid QR." }, { status: 400 });
  const { buildingId, spaceKey } = parsed.data;

  if (!canAccessBuilding(me, buildingId)) {
    return NextResponse.json({ error: "You don't have access to this site." }, { status: 403 });
  }

  const plan = (await getStoredPlan(buildingId)) ?? getFloorPlan(buildingId);
  const label = (await resolveSpaceLabel(buildingId, spaceKey)) ?? "this space";
  const today = todayInTz(plan?.tz ?? "UTC");

  // The scanner's own bookings for this exact space today (any active status).
  const mine = (await listBookings({ userEmail: me.email, buildingId }))
    .filter((b) => b.spaceKey === spaceKey && b.start.slice(0, 10) === today && ACTIVE_STATUSES.includes(b.status))
    .sort((a, b) => a.start.localeCompare(b.start));

  if (!mine.length) {
    return NextResponse.json({ error: `You have no booking for ${label} today. Book it first, then scan again.`, spaceLabel: label }, { status: 404 });
  }
  const booking = mine[0];

  if (booking.status === "Checked in") {
    return NextResponse.json({ ok: true, already: true, spaceLabel: label, message: `You're already checked in to ${label}.` });
  }

  // Atomic compare-and-set from Booked — guards the race with the 09:30 auto-cancel job and any
  // concurrent admin cancel (a terminal booking can never be resurrected).
  const ok = await setBookingStatus(booking.id, "Checked in", undefined, "Booked");
  if (!ok) {
    return NextResponse.json({ error: `${label} could not be checked in — it may have been cancelled.`, spaceLabel: label }, { status: 409 });
  }
  await audit(me.email, "booking.checkin", `${label} via desk QR (${today})`);
  publishLive(await currentTenantId(), "bookings");
  return NextResponse.json({ ok: true, spaceLabel: label, message: `Checked in to ${label}. Enjoy your day.` });
}
