import { NextResponse } from "next/server";
import { apiAuth, apiUnauthorized } from "@/lib/server/api-v1";
import { listBookings } from "@/lib/server/db";

// GET /api/v1/bookings — list bookings for the authenticated tenant.
// Query: from, to (yyyy-mm-dd), buildingId, limit (<=200).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await apiAuth(req))) return apiUnauthorized();

  const q = new URL(req.url).searchParams;
  const from = q.get("from") || undefined;
  const to = q.get("to") || undefined;
  const buildingId = q.get("buildingId") || undefined;
  const limit = Math.min(Math.max(Number(q.get("limit")) || 100, 1), 200);

  const rows = await listBookings({ from, to, buildingId, limit });
  const data = rows.map((b) => ({
    id: b.id,
    kind: b.kind,
    buildingId: b.buildingId,
    spaceKey: b.spaceKey,
    spaceLabel: b.spaceLabel,
    start: b.start,
    end: b.end,
    status: b.status,
    userEmail: b.userEmail,
    durationType: b.durationType,
  }));
  return NextResponse.json({ object: "list", count: data.length, data });
}
