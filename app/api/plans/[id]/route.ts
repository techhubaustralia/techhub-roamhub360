import { NextResponse } from "next/server";
import type { FloorPlan, SpaceEl } from "@/lib/types";
import { spaceKey } from "@/lib/types";
import { getFloorPlan } from "@/lib/floorplans";
import { getStoredPlan, putPlan, deletePlan, syncCustomBuildingMeta } from "@/lib/server/store";
import { getUser } from "@/lib/server/auth";
import { rateLimit, tooMany } from "@/lib/server/rate-limit";
import { cancelBookingsForSpaces, audit } from "@/lib/server/db";

const spaceKeysOf = (p: { els?: FloorPlan["els"] } | null) =>
  new Set(
    (p?.els ?? [])
      .filter((e): e is SpaceEl => e.t === "desk" || e.t === "office" || e.t === "room" || e.t === "parking")
      .map((e) => spaceKey(e)),
  );

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plan = (await getStoredPlan(id)) ?? getFloorPlan(id);
  return NextResponse.json(plan);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { role, email } = await getUser();
  if (role !== "global-admin") return NextResponse.json({ error: "Only a Global Admin can edit floor plans." }, { status: 403 });
  const rl = await rateLimit(`admin:plan:${email}`, 120, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfter);
  const { id } = await params;
  const body = (await req.json()) as FloorPlan;

  // Optimistic concurrency: if the client loaded rev N, reject when the stored rev has
  // moved on (another admin saved in the meantime) so we never silently lose an update.
  const stored = await getStoredPlan(id);
  if (stored && typeof body.rev === "number" && typeof stored.rev === "number" && body.rev !== stored.rev) {
    return NextResponse.json(
      { error: "This site was changed by someone else. Reload and reapply your edits.", current: stored.rev },
      { status: 409 },
    );
  }
  const plan: FloorPlan = { ...body, id, rev: (stored?.rev ?? 0) + 1 };
  await putPlan(plan);
  await syncCustomBuildingMeta(plan);

  // A space removed from the plan leaves its active bookings orphaned (they'd still show in
  // occupancy/analytics). Cancel them so state stays consistent. (A dragged/edited desk keeps
  // its id, so only genuine removals — delete or floor-move — trigger this.)
  const prev = spaceKeysOf(stored);
  const nextKeys = spaceKeysOf(plan);
  const removed = [...prev].filter((k) => !nextKeys.has(k));
  if (removed.length) {
    const n = await cancelBookingsForSpaces(id, removed);
    if (n) await audit(email, "space.remove", `${id}: cancelled ${n} orphaned booking(s) for ${removed.join(", ")}`);
  }
  return NextResponse.json(plan);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { role } = await getUser();
  if (role !== "global-admin") return NextResponse.json({ error: "Only a Global Admin can edit floor plans." }, { status: 403 });
  const { id } = await params;
  await deletePlan(id);
  return NextResponse.json(getFloorPlan(id));
}
