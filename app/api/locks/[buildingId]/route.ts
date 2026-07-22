import { NextResponse } from "next/server";
import { listLocks, setLock, audit } from "@/lib/server/db";
import { getUser, canAccessBuilding } from "@/lib/server/auth";
import { rateLimit, tooMany } from "@/lib/server/rate-limit";

export async function GET(_req: Request, { params }: { params: Promise<{ buildingId: string }> }) {
  const { buildingId } = await params;
  const user = await getUser();
  const locks = await listLocks(buildingId);
  // Everyone signed in may see WHICH spaces are locked (needed to hide them when booking),
  // but the assignee identity is admin-only. Non-admins get spaceKey/scope without lockedBy.
  if (canAccessBuilding(user, buildingId)) return NextResponse.json(locks);
  return NextResponse.json(locks.map((l) => ({ spaceKey: l.spaceKey, scope: l.scope })));
}

export async function PUT(req: Request, { params }: { params: Promise<{ buildingId: string }> }) {
  const { buildingId } = await params;
  const { spaceKey, locked, scope } = await req.json();
  if (!spaceKey) return NextResponse.json({ error: "spaceKey required" }, { status: 400 });
  const user = await getUser();
  const rl = await rateLimit(`admin:lock:${user.email}`, 120, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfter);
  // Site-scoped: global admins anywhere; site admins only within their own sites; staff never.
  if (!canAccessBuilding(user, buildingId)) {
    return NextResponse.json({ error: "Not authorized to lock resources at this site." }, { status: 403 });
  }
  await setLock(buildingId, spaceKey, Boolean(locked), scope ?? "temporary", user.email);
  await audit(user.email, locked ? "lock.set" : "lock.clear", `${buildingId}/${spaceKey} (${scope ?? "temporary"})`);
  return NextResponse.json({ ok: true });
}
