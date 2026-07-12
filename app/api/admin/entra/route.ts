import { NextResponse } from "next/server";
import { getUser } from "@/lib/server/auth";
import { currentTenantId } from "@/lib/server/tenant";
import { getOrgSsoStatus, clearOrgSso } from "@/lib/server/entra-sso";
import { audit } from "@/lib/server/db";

// Org sign-in status + disconnect for the admin UI. Global-admin only, tenant-scoped by host.
export const runtime = "nodejs";

const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

export async function GET() {
  const me = await getUser();
  if (me.role !== "global-admin") return forbidden();
  const status = await getOrgSsoStatus(await currentTenantId());
  return NextResponse.json({ ...status, platformReady: Boolean(process.env.AUTH_MICROSOFT_ENTRA_ID_ID) });
}

export async function DELETE() {
  const me = await getUser();
  if (me.role !== "global-admin") return forbidden();
  await clearOrgSso(await currentTenantId());
  await audit(me.email, "sso.org.disconnect", "entra");
  return NextResponse.json({ ok: true });
}
