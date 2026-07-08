import { NextResponse } from "next/server";
import { apiAuth, apiUnauthorized } from "@/lib/server/api-v1";
import { listCustomBuildings } from "@/lib/server/store";
import { listSpaces } from "@/lib/server/availability";

// GET /api/v1/spaces — every building in the tenant with its bookable spaces.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await apiAuth(req))) return apiUnauthorized();

  const buildings = await listCustomBuildings();
  const data = await Promise.all(
    buildings.map(async (b) => ({
      buildingId: b.id,
      name: b.name,
      spaces: await listSpaces(b.id),
    })),
  );
  return NextResponse.json({ object: "list", count: data.length, data });
}
