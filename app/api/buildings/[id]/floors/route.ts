import { NextResponse } from "next/server";
import { listFloors, setFloors, type FloorRoom } from "@/lib/server/store";
import { getUser } from "@/lib/server/auth";
import { audit } from "@/lib/server/db";
import { checkFloorCount } from "@/lib/server/licensing";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json(await listFloors(id), { headers: { "Cache-Control": "no-store" } });
}

// Replace a building's floor list (global-admin; floors are layout configuration).
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (user.role !== "global-admin") {
    return NextResponse.json({ error: "Only a Global Admin can manage floors." }, { status: 403 });
  }
  const { id } = await params;
  const floors = (await req.json()) as FloorRoom[];
  if (!Array.isArray(floors)) return NextResponse.json({ error: "floors array required" }, { status: 400 });
  // Licence enforcement (CP2): the tier caps floors-per-site (and blocks all edits when expired).
  const lic = await checkFloorCount(floors.length);
  if (!lic.ok) return NextResponse.json({ error: lic.error }, { status: 402 });
  await setFloors(id, floors);
  await audit(user.email, "building.floors.set", `${id}:${floors.length}`);
  return NextResponse.json({ ok: true });
}
