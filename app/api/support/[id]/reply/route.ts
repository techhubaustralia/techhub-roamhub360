import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/server/auth";
import { currentTenantId, workspaceOrigin } from "@/lib/server/tenant";
import { rateLimit } from "@/lib/server/rate-limit";
import { getSupportRequest, listReplies, addReply, updateSupportRequest } from "@/lib/server/support";
import { sendMail } from "@/lib/server/graph";
import { emailBrand, supportReplyEmail, supportFollowUpEmail } from "@/lib/server/email";

// Conversation on a support request. ONE endpoint for both directions:
//   • the requester adding a follow-up      → notifies the ops inbox
//   • a global-admin of the workspace answering → emails the requester
// Anyone else (including another user in the same workspace) is refused.
export const runtime = "nodejs";

const Body = z.object({ body: z.string().trim().min(1).max(5000) });

function opsInbox(): string | null {
  const list = (process.env.OPS_EMAIL || process.env.BOOTSTRAP_ADMINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return list[0] ?? null;
}

/** GET — the thread, for whoever is allowed to see it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser();
  if (!me.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  const reqRow = await getSupportRequest(id);
  const tenantId = await currentTenantId();
  const isOwner = reqRow?.userEmail?.toLowerCase() === me.email.toLowerCase();
  const isAdmin = me.role === "global-admin";
  if (!reqRow || reqRow.tenantId !== tenantId || (!isOwner && !isAdmin)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ request: reqRow, replies: await listReplies(id) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser();
  if (!me.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!rateLimit(`support-reply:${me.email.toLowerCase()}`, 20, 10 * 60 * 1000).ok) {
    return NextResponse.json({ error: "Too many messages — try again shortly." }, { status: 429 });
  }
  const { id } = await params;
  const reqRow = await getSupportRequest(id);
  const tenantId = await currentTenantId();
  const isOwner = reqRow?.userEmail?.toLowerCase() === me.email.toLowerCase();
  const isAdmin = me.role === "global-admin";
  if (!reqRow || reqRow.tenantId !== tenantId || (!isOwner && !isAdmin)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Write a message first." }, { status: 400 });

  // An admin who is ALSO the requester (they raised it themselves) counts as the requester.
  const fromAdmin = isAdmin && !isOwner;
  const reply = await addReply({ requestId: id, authorEmail: me.email, authorName: me.name, fromAdmin, body: parsed.data.body });

  // A staff answer re-opens a closed request so it doesn't get lost.
  if (fromAdmin && reqRow.status === "closed") await updateSupportRequest(id, { status: "open" }).catch(() => {});

  const eb = await emailBrand(tenantId);
  if (fromAdmin) {
    const mail = supportReplyEmail({ subject: reqRow.subject, body: parsed.data.body, fromName: me.name, url: `${workspaceOrigin(tenantId)}/` }, eb);
    const sent = await sendMail(reqRow.userEmail, mail.subject, mail.html, tenantId).catch(() => false);
    console.log(`[support] admin reply on ${id} → ${reqRow.userEmail}: ${sent ? "emailed" : "NOT emailed"}`);
  } else {
    const ops = opsInbox();
    if (ops) {
      const mail = supportFollowUpEmail({ subject: reqRow.subject, body: parsed.data.body, userEmail: me.email, workspace: tenantId, ticketUrl: `${workspaceOrigin(tenantId)}/admin/support` }, eb);
      await sendMail(ops, mail.subject, mail.html, tenantId).catch(() => false);
    }
    console.log(`[support] follow-up on ${id} from ${me.email}`);
  }

  return NextResponse.json({ ok: true, reply });
}
