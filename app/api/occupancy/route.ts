import { NextResponse } from "next/server";
import { occupiedKeys } from "@/lib/server/db";
import { getUser } from "@/lib/server/auth";
import { rateLimit, tooMany, clientIp } from "@/lib/server/rate-limit";

// GET /api/occupancy?buildingId=<id>&date=2026-06-25  -> ["desk-12","room-conf",...]
// Occupancy (which spaces are taken) is needed by any signed-in user to book a space,
// so it isn't role-restricted — but it now runs in an authenticated context and is
// rate-limited to prevent enumeration. (Per-tenant scoping is added in the multi-tenant phase.)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const buildingId = url.searchParams.get("buildingId");
  const date = url.searchParams.get("date");
  if (!buildingId || !date) return NextResponse.json([], { status: 200 });
  const user = await getUser();
  const rl = rateLimit(`occ:${user.email || clientIp(req)}`, 120, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfter);
  const keys = await occupiedKeys(buildingId, `${date}T00:00`, `${date}T23:59`);
  return NextResponse.json(keys);
}
