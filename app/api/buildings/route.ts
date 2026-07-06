import { NextResponse } from "next/server";
import { listCustomBuildings, addCustomBuilding, listHiddenBuildings, getStoredPlan, type CustomBuilding } from "@/lib/server/store";
import { getUser } from "@/lib/server/auth";

export async function GET() {
  const [custom, hidden] = await Promise.all([listCustomBuildings(), listHiddenBuildings()]);
  // Enrich each custom building with details from its saved plan (the building-id
  // plan = default floor), so the Buildings list shows real tz/hours/desks/status.
  const enriched = await Promise.all(
    custom.map(async (b) => {
      const plan = await getStoredPlan(b.id);
      const desks = plan ? plan.els.filter((e) => e.t === "desk").length : 0;
      const hours = plan?.openTime && plan?.closeTime ? `${plan.openTime}–${plan.closeTime}` : "—";
      return {
        ...b,
        tz: plan?.tz || "—",
        hours,
        desks: desks ? String(desks) : "—",
        status: plan?.status === "closed" ? "Closed now" : "Open",
      };
    }),
  );
  return NextResponse.json({ custom: enriched, hidden });
}

export async function POST(req: Request) {
  const { role } = await getUser();
  if (role !== "global-admin") {
    return NextResponse.json({ error: "Only a Global Admin can create buildings." }, { status: 403 });
  }
  const body = (await req.json()) as CustomBuilding;
  if (!body?.id || !body?.name) {
    return NextResponse.json({ error: "id and name required" }, { status: 400 });
  }
  // Backstop against cross-site overwrite: never let a create clobber a DIFFERENT
  // existing building that happens to share this id. Same-name re-POST (a retry of
  // the same building) is allowed and is an idempotent no-op.
  const existing = (await listCustomBuildings()).find((b) => b.id === body.id);
  if (existing && existing.name !== body.name) {
    return NextResponse.json({ error: "A different building already uses this id. Please retry — a new id will be assigned." }, { status: 409 });
  }
  await addCustomBuilding({ id: body.id, name: body.name, region: body.region, country: body.country });
  return NextResponse.json({ ok: true });
}
