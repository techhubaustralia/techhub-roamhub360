import { NextResponse } from "next/server";
import { computeAnalytics } from "@/lib/server/analytics";
import { getUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getUser();
  if (user.role === "staff") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  const url = new URL(req.url);
  const to = url.searchParams.get("to") || new Date().toISOString().slice(0, 10);
  const from = url.searchParams.get("from") || new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
  const buildingId = url.searchParams.get("building") || undefined;
  const includeWeekends = url.searchParams.get("weekends") === "1";
  // Site Admins only see their assigned sites.
  const scoped = user.role === "site-admin" && buildingId && !(user.sites ?? []).includes(buildingId);
  const data = await computeAnalytics({ from, to, buildingId: scoped ? "__none__" : buildingId, includeWeekends });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
