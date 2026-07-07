import { NextResponse } from "next/server";
import { getUser } from "@/lib/server/auth";
import { currentTenantId } from "@/lib/server/tenant";
import { licenseSummary } from "@/lib/server/licensing";
import { listCustomBuildings } from "@/lib/server/store";

// Customer-facing licence view (Commercial SaaS CP2, read-only). Shows the plan, usage vs limits,
// and expiry. Issuing/editing a licence is the TechHub Partner portal's job (CP3).
export async function GET() {
  const me = await getUser();
  if (me.role !== "global-admin" && !me.platformAdmin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  const tenantId = await currentTenantId();
  const sitesUsed = (await listCustomBuildings()).length;
  return NextResponse.json(await licenseSummary(tenantId, sitesUsed));
}
