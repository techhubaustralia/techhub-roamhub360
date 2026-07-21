import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/server/auth";
import { currentTenantId } from "@/lib/server/tenant";
import { getSupportRequest, updateSupportRequest, markSupportRead } from "@/lib/server/support";
import { redactEmail } from "@/lib/redact";

// Let the REQUESTER resolve their own request (or reopen it) — without this, only an admin could
// close anything, so a user who solved their own problem had no way to say so.
// Status only: priority and internal notes stay admin-only (/api/admin/support/[id]).
export const runtime = "nodejs";

const Body = z.object({ status: z.enum(["open", "closed"]) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser();
  if (!me.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const row = await getSupportRequest(id);
  if (!row || row.tenantId !== (await currentTenantId())) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (row.userEmail.toLowerCase() !== me.email.toLowerCase()) {
    // Not their request — admins use the admin route, everyone else gets nothing.
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid status." }, { status: 400 });

  const updated = await updateSupportRequest(id, { status: parsed.data.status });
  await markSupportRead(id, "requester");
  console.log(`[support] ${redactEmail(me.email)} set own request ${id} → ${parsed.data.status}`);
  return NextResponse.json({ ok: true, request: updated });
}
