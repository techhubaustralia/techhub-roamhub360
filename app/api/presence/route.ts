import { NextResponse } from "next/server";
import { listBookings } from "@/lib/server/db";
import { overlaps, ACTIVE_STATUSES } from "@/lib/booking-rules";
import { getUser, canAccessBuilding } from "@/lib/server/auth";
import { rateLimit, clientIp, tooMany } from "@/lib/server/rate-limit";

// Team Build-Up A — "Who's in". Tenant-wide presence for a single day: who has an ACTIVE
// booking (Booked or Checked in) overlapping that day, so colleagues can decide when to come
// in. Isolation is automatic (listBookings is tenant-scoped). PII minimisation mirrors the
// map's colleague-search (/api/bookings?building=&date=): everyone sees a display NAME; only
// an admin for the building additionally gets the raw email. Per-user opt-out lands in C.

/** Display name from an email local-part, e.g. "abin.raju@…" -> "Abin Raju". */
function displayName(email: string): string {
  return (email.split("@")[0] || email).replace(/[._]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const rl = rateLimit(`presence:ip:${clientIp(req)}`, 120, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfter);

  const q = new URL(req.url).searchParams;
  const date = q.get("date") || new Date().toISOString().slice(0, 10);
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "Invalid date." }, { status: 400 });

  const me = await getUser();
  const admin = me.role === "global-admin" || me.role === "site-admin";

  // A booking overlaps `date` if its span crosses that day — not only if it STARTS on it
  // (multi-day desk/parking). The earliest such booking started at most MAX_DAYS (14) before.
  const [y, m, d] = date.split("-").map(Number);
  const lower = new Date(Date.UTC(y, m - 1, d) - 14 * 86400000).toISOString().slice(0, 10);
  const dayStart = `${date}T00:00`;
  const dayEnd = `${date}T23:59`;

  const rows = (await listBookings({ from: lower, to: date })).filter(
    (b) => ACTIVE_STATUSES.includes(b.status) && overlaps(b.start, b.end, dayStart, dayEnd),
  );

  const entries = rows
    .map((b) => ({
      buildingId: b.buildingId,
      spaceKey: b.spaceKey,
      spaceLabel: b.spaceLabel,
      kind: b.kind,
      start: b.start,
      end: b.end,
      checkedIn: b.status === "Checked in",
      name: displayName(b.userEmail),
      isMe: b.userEmail.toLowerCase() === me.email.toLowerCase(),
      ...(admin && canAccessBuilding(me, b.buildingId) ? { userEmail: b.userEmail } : {}),
    }))
    // Checked-in first, then by start time, then name — a stable, sensible reading order.
    .sort((a, b) => Number(b.checkedIn) - Number(a.checkedIn) || a.start.localeCompare(b.start) || a.name.localeCompare(b.name));

  return NextResponse.json({ date, entries, mySites: me.sites ?? [] });
}
