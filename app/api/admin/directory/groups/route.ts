import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/server/auth";
import { currentTenantId } from "@/lib/server/tenant";
import { listEntraGroups } from "@/lib/server/directory";
import { getDirectoryGroups, setDirectoryGroups } from "@/lib/server/tenant-integration";
import { audit } from "@/lib/server/db";

// Choose WHICH Entra groups get synced, instead of pulling the customer's whole directory into a
// booking app. Empty selection = sync everything (previous behaviour, kept for compatibility).
export const runtime = "nodejs";

const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

export async function GET(req: Request) {
  const me = await getUser();
  if (me.role !== "global-admin") return forbidden();
  const search = new URL(req.url).searchParams.get("q") ?? undefined;
  const [available, selected] = await Promise.all([listEntraGroups(search), getDirectoryGroups(await currentTenantId())]);
  return NextResponse.json({ ...available, selected });
}

const Body = z.object({ groupIds: z.array(z.string().trim().min(1)).max(50) });

export async function PUT(req: Request) {
  const me = await getUser();
  if (me.role !== "global-admin") return forbidden();
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid selection." }, { status: 400 });
  const tenantId = await currentTenantId();
  await setDirectoryGroups(tenantId, parsed.data.groupIds);
  await audit(me.email, "directory.groups", parsed.data.groupIds.length ? `${parsed.data.groupIds.length} group(s)` : "whole directory");
  return NextResponse.json({ ok: true, selected: await getDirectoryGroups(tenantId) });
}
