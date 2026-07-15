import { NextResponse } from "next/server";
import { getUser } from "@/lib/server/auth";
import { currentTenantId } from "@/lib/server/tenant";
import { getSupportRequest } from "@/lib/server/support";
import { getAsset } from "@/lib/server/store";

// Stream a support-request attachment to the admin who's triaging it. Global-admin + same-tenant
// only. Content-Disposition: attachment so it downloads rather than executing inline.
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser();
  if (me.role !== "global-admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const reqRow = await getSupportRequest(id);
  if (!reqRow || reqRow.tenantId !== (await currentTenantId()) || !reqRow.attachmentKey) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const asset = await getAsset(reqRow.attachmentKey);
  if (!asset) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const filename = (reqRow.attachmentName || "attachment").replace(/["\\]/g, "_");
  return new Response(new Uint8Array(asset.buffer), {
    headers: {
      "Content-Type": asset.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
