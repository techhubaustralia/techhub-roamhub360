import { NextResponse } from "next/server";
import { listBookings } from "@/lib/server/db";
import { getUser, canAccessBuilding } from "@/lib/server/auth";
import { getDirectoryMap } from "@/lib/server/directory";
import { getHiddenPresenceEmails } from "@/lib/server/users";
import { listCustomBuildings } from "@/lib/server/store";
import { rateLimit, clientIp, tooMany } from "@/lib/server/rate-limit";
import { todayInTz } from "@/lib/booking-rules";
import { rootOf } from "@/lib/attendance";
import { parseOfficeBookingQuery, shapeOfficeBookings, windowLowerBound } from "@/lib/office-bookings";

// Cross-site "Office bookings" overview: every booking in the workspace for a date window, feeding
// the List / Daily / Weekly views. Same privacy posture as /api/presence, which shows the same
// people for a single day: tenant-scoped (listBookings), the hidePresence opt-out honoured (a user
// always sees their own rows), names + photos from the synced directory, and emails only for
// admins who can access that building. Gated on the `presence` flag (it IS presence data) and on
// its own `office-booking` flag so an operator can switch the page off per tenant.

/** Display name from an email local-part, e.g. "abin.raju@…" -> "Abin Raju". */
function displayName(email: string): string {
  return (email.split("@")[0] || email).replace(/[._]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function GET(req: Request) {
  const rl = await rateLimit(`office-bookings:ip:${clientIp(req)}`, 120, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfter);

  const me = await getUser();
  if (!me.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const off = me.disabledFeatures ?? [];
  if (off.includes("presence") || off.includes("office-booking")) {
    return NextResponse.json({ enabled: false, isAdmin: false, total: 0, rows: [] });
  }

  // Default window anchors on the platform-default zone's "today" — never the server clock (H7).
  const q = new URL(req.url).searchParams;
  const parsed = parseOfficeBookingQuery((n) => q.get(n), todayInTz());
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const f = parsed.filters;

  const [bookings, hidden, buildings] = await Promise.all([
    listBookings({ from: windowLowerBound(f.from), to: f.to }), // lower bound covers multi-day spans
    getHiddenPresenceEmails(),
    listCustomBuildings(),
  ]);
  const emails = [...new Set(bookings.flatMap((b) => [b.userEmail, b.bookedByEmail ?? ""]).filter(Boolean))];
  const dir = await getDirectoryMap(emails);
  const siteName = new Map(buildings.map((b) => [b.id, b.name]));
  const floorName = (id: string) => buildings.find((b) => b.id === rootOf(id))?.floors?.find((fl) => fl.id === id)?.name ?? "";
  const isAdmin = me.role === "global-admin" || me.role === "site-admin";

  const { total, rows } = shapeOfficeBookings(bookings, f, {
    meEmail: me.email.toLowerCase(),
    hidden,
    nameOf: (e) => dir[e.toLowerCase()]?.displayName || displayName(e),
    photoOf: (e) => dir[e.toLowerCase()]?.photo,
    siteNameOf: (root) => siteName.get(root) ?? root,
    floorNameOf: floorName,
    canSeeEmail: (buildingId) => isAdmin && canAccessBuilding(me, buildingId),
  });
  return NextResponse.json({ enabled: true, isAdmin, total, rows, from: f.from, to: f.to });
}
