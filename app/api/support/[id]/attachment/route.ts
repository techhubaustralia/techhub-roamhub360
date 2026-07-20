import { NextResponse } from "next/server";
import { getUser } from "@/lib/server/auth";
import { currentTenantId } from "@/lib/server/tenant";
import { getSupportRequest, getReply } from "@/lib/server/support";
import { getAsset } from "@/lib/server/store";

// Download an attachment on a support request or one of its replies.
// Allowed for the REQUESTER as well as a global-admin — previously only admins could, so a user
// couldn't even re-open the file they themselves sent.
//   /api/support/<id>/attachment            → the original request's file
//   /api/support/<id>/attachment?reply=<id> → a file attached to a reply in that thread
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser();
  if (!me.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;

  const row = await getSupportRequest(id);
  if (!row || row.tenantId !== (await currentTenantId())) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const isOwner = row.userEmail.toLowerCase() === me.email.toLowerCase();
  if (!isOwner && me.role !== "global-admin") return NextResponse.json({ error: "Not found." }, { status: 404 });

  const replyId = new URL(req.url).searchParams.get("reply");
  let name = row.attachmentName;
  let key = row.attachmentKey;
  if (replyId) {
    const reply = await getReply(replyId);
    // The reply must belong to THIS request — otherwise a valid id could read another thread's file.
    if (!reply || reply.requestId !== id || !reply.attachmentKey) return NextResponse.json({ error: "Not found." }, { status: 404 });
    name = reply.attachmentName;
    key = reply.attachmentKey;
  }
  if (!key) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const asset = await getAsset(key);
  if (!asset) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const filename = (name || "attachment").replace(/["\\]/g, "_");
  return new Response(new Uint8Array(asset.buffer), {
    headers: {
      "Content-Type": asset.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
