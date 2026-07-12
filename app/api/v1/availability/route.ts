import { NextResponse } from "next/server";
import { apiGuard, apiUser } from "@/lib/server/api-v1";
import { findAvailability } from "@/lib/server/availability";
import type { SpaceKind } from "@/lib/types";

// GET /api/v1/availability?date=yyyy-mm-dd&kind=desk&buildingId=&limit= — free spaces on a date.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set(["desk", "office", "room", "parking"]);

export async function GET(req: Request) {
  const g = await apiGuard(req);
  if ("res" in g) return g.res;

  const q = new URL(req.url).searchParams;
  const date = q.get("date") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Provide ?date=yyyy-mm-dd." }, { status: 400 });
  }
  const kindParam = q.get("kind") || "";
  const kind = KINDS.has(kindParam) ? (kindParam as SpaceKind) : undefined;
  const buildingQuery = q.get("buildingId") || undefined;
  const limit = Math.min(Math.max(Number(q.get("limit")) || 100, 1), 200);

  const free = await findAvailability({ date, kind, buildingQuery, limit }, await apiUser());
  return NextResponse.json({ object: "list", date, count: free.length, data: free });
}
