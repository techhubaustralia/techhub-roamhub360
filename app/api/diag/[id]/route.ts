import { NextResponse } from "next/server";
import { getStoredPlan } from "@/lib/server/store";
import { getFloorPlan } from "@/lib/floorplans";
import { getUser } from "@/lib/server/auth";
import { APP_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

// Production diagnostic: shows the live build version + the exact plan data the
// server returns for a building, flagging spaces with invalid coordinates that
// would render invisibly. Open /api/_diag/<buildingId> in prod to compare with
// what Book a space shows.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { role } = await getUser();
  if (role === "staff") return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const { id } = await params;
  const stored = await getStoredPlan(id);
  const plan = stored ?? getFloorPlan(id);
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);

  const els = (plan.els ?? []).map((e) => {
    const x = (e as { x?: number }).x;
    const y = (e as { y?: number }).y;
    const w = (e as { w?: number }).w;
    const h = (e as { h?: number }).h;
    const needsBox = e.t === "office" || e.t === "room" || e.t === "fixture";
    const renderable = e.t === "wall" ? true : num(x) && num(y) && (!needsBox || (num(w) && num(h)));
    return {
      t: e.t,
      name: (e as { name?: string; label?: string; text?: string }).name ?? (e as { label?: string }).label ?? (e as { text?: string }).text,
      x, y, w, h,
      shape: (e as { shape?: string }).shape,
      rot: (e as { rot?: number }).rot,
      renderable,
    };
  });

  return NextResponse.json(
    {
      version: APP_VERSION,
      source: stored ? "store" : "built-in-fallback",
      id,
      viewBox: plan.viewBox,
      hasImage: Boolean(plan.image),
      counts: {
        desk: els.filter((e) => e.t === "desk").length,
        office: els.filter((e) => e.t === "office").length,
        room: els.filter((e) => e.t === "room").length,
        parking: els.filter((e) => e.t === "parking").length,
      },
      rooms: els.filter((e) => e.t === "room"),
      notRenderable: els.filter((e) => !e.renderable),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
