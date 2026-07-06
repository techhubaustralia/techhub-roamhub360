import { NextResponse } from "next/server";
import { listLocks, setLock, audit } from "@/lib/server/db";
import { listCustomBuildings, listHiddenBuildings, listFloors, getStoredPlan } from "@/lib/server/store";
import { getUser, type AppUser } from "@/lib/server/auth";
import { spaceKey, type SpaceEl } from "@/lib/types";

export const dynamic = "force-dynamic";

const canManage = (u: AppUser, buildingId: string) =>
  u.role === "global-admin" || (u.role === "site-admin" && (u.sites ?? []).includes(buildingId));

const labelFor = (el: SpaceEl) =>
  el.t === "desk" ? `Desk ${el.label ?? el.id}` : el.t === "parking" ? `Bay ${el.label ?? el.id}` : el.t === "office" ? el.name ?? `Office ${el.id}` : el.name;

// GET — all permanent assignments across active buildings/floors the user can see.
export async function GET() {
  const user = await getUser();
  if (user.role === "staff") return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const hidden = new Set(await listHiddenBuildings());
  const buildings = (await listCustomBuildings()).filter((b) => !hidden.has(b.id) && canManage(user, b.id));
  const out: { floorId: string; building: string; floor: string; spaceKey: string; label: string; assignee: string }[] = [];
  for (const b of buildings) {
    const floors = await listFloors(b.id);
    for (const f of floors) {
      const locks = (await listLocks(f.id)).filter((l) => l.scope === "permanent");
      if (!locks.length) continue;
      const plan = await getStoredPlan(f.id);
      const byKey = new Map((plan?.els ?? []).filter((e): e is SpaceEl => e.t === "desk" || e.t === "office" || e.t === "room" || e.t === "parking").map((e) => [spaceKey(e), labelFor(e)]));
      for (const l of locks) {
        out.push({ floorId: f.id, building: b.name, floor: f.name, spaceKey: l.spaceKey, label: byKey.get(l.spaceKey) ?? l.spaceKey, assignee: l.by ?? "" });
      }
    }
  }
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}

// POST { floorId, spaceKey, assignee } — reserve a space for a person (permanent lock).
export async function POST(req: Request) {
  const user = await getUser();
  const b = await req.json();
  const buildingRoot = String(b.floorId || "").split("__")[0];
  if (!b.floorId || !b.spaceKey || !canManage(user, buildingRoot)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  if (!String(b.assignee || "").trim()) return NextResponse.json({ error: "Assignee required." }, { status: 400 });
  await setLock(b.floorId, b.spaceKey, true, "permanent", String(b.assignee).trim());
  await audit(user.email, "desk.assign", `${b.floorId}/${b.spaceKey} -> ${b.assignee}`);
  return NextResponse.json({ ok: true });
}

// DELETE ?floorId=&spaceKey= — release a permanent assignment.
export async function DELETE(req: Request) {
  const user = await getUser();
  const url = new URL(req.url);
  const floorId = url.searchParams.get("floorId") || "";
  const spaceKey = url.searchParams.get("spaceKey") || "";
  if (!floorId || !spaceKey || !canManage(user, floorId.split("__")[0])) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  await setLock(floorId, spaceKey, false);
  await audit(user.email, "desk.unassign", `${floorId}/${spaceKey}`);
  return NextResponse.json({ ok: true });
}
