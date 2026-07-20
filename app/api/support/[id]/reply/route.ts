import { NextResponse } from "next/server";
import { getUser } from "@/lib/server/auth";
import { currentTenantId, workspaceOrigin } from "@/lib/server/tenant";
import { rateLimit } from "@/lib/server/rate-limit";
import { getSupportRequest, listReplies, addReply, updateSupportRequest, markSupportRead } from "@/lib/server/support";
import { takeAttachment } from "@/lib/server/support-attachment";
import { sendMail } from "@/lib/server/graph";
import { emailBrand, supportReplyEmail, supportFollowUpEmail } from "@/lib/server/email";

// Conversation on a support request. ONE endpoint for both directions:
//   • the requester adding a follow-up      → notifies the ops inbox
//   • a global-admin of the workspace answering → emails the requester
// Anyone else (including another user in the same workspace) is refused.
export const runtime = "nodejs";

function opsInbox(): string | null {
  const list = (process.env.OPS_EMAIL || process.env.BOOTSTRAP_ADMINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return list[0] ?? null;
}

/** Who is allowed to see/act on this request, and in which role. */
async function access(id: string) {
  const me = await getUser();
  if (!me.email) return { me: null, row: null, isOwner: false, isAdmin: false };
  const row = await getSupportRequest(id);
  const tenantId = await currentTenantId();
  if (!row || row.tenantId !== tenantId) return { me, row: null, isOwner: false, isAdmin: false };
  const isOwner = row.userEmail.toLowerCase() === me.email.toLowerCase();
  const isAdmin = me.role === "global-admin";
  return { me, row: isOwner || isAdmin ? row : null, isOwner, isAdmin };
}

/** GET — the thread. Also marks it read for whichever side is looking, clearing their NEW badge. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { me, row, isOwner, isAdmin } = await access(id);
  if (!me?.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  // An admin who raised the request themselves reads as the requester.
  await markSupportRead(id, isOwner ? "requester" : "admin");
  return NextResponse.json({ request: row, replies: await listReplies(id), isAdmin: isAdmin && !isOwner });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { me, row, isOwner, isAdmin } = await access(id);
  if (!me?.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!rateLimit(`support-reply:${me.email.toLowerCase()}`, 20, 10 * 60 * 1000).ok) {
    return NextResponse.json({ error: "Too many messages — try again shortly." }, { status: 429 });
  }

  // Accept multipart (message + optional file) or plain JSON (message only).
  let body = "";
  let file: FormDataEntryValue | null = null;
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Invalid form submission." }, { status: 400 });
    body = String(form.get("body") || "").trim();
    file = form.get("file");
  } else {
    const j = (await req.json().catch(() => ({}))) as { body?: unknown };
    body = String(j.body ?? "").trim();
  }
  if (!body || body.length > 5000) return NextResponse.json({ error: "Write a message first (up to 5000 characters)." }, { status: 400 });

  const att = await takeAttachment(file);
  if (att.error) return NextResponse.json({ error: att.error }, { status: 400 });

  const fromAdmin = isAdmin && !isOwner;
  const reply = await addReply({
    requestId: id,
    authorEmail: me.email,
    authorName: me.name,
    fromAdmin,
    body,
    attachmentName: att.stored?.name ?? null,
    attachmentType: att.stored?.type ?? null,
    attachmentKey: att.stored?.key ?? null,
    attachmentSize: att.stored?.size ?? null,
  });

  // Posting counts as reading everything before it, and a staff answer re-opens a closed request.
  await markSupportRead(id, fromAdmin ? "admin" : "requester");
  if (fromAdmin && row.status === "closed") await updateSupportRequest(id, { status: "open" }).catch(() => {});

  const tenantId = await currentTenantId();
  const eb = await emailBrand(tenantId);
  const attachments = att.stored ? [{ filename: att.stored.name, contentType: att.stored.type, content: att.stored.buffer }] : undefined;

  if (fromAdmin) {
    const mail = supportReplyEmail({ subject: row.subject, body, fromName: me.name, url: `${workspaceOrigin(tenantId)}/support` }, eb);
    const sent = await sendMail(row.userEmail, mail.subject, mail.html, tenantId, attachments).catch(() => false);
    console.log(`[support] admin reply on ${id} → ${row.userEmail}: ${sent ? "emailed" : "NOT emailed"}`);
  } else {
    const ops = opsInbox();
    if (ops) {
      const mail = supportFollowUpEmail({ subject: row.subject, body, userEmail: me.email, workspace: tenantId, ticketUrl: `${workspaceOrigin(tenantId)}/admin/support` }, eb);
      await sendMail(ops, mail.subject, mail.html, tenantId, attachments).catch(() => false);
    }
    console.log(`[support] follow-up on ${id} from ${me.email}`);
  }

  return NextResponse.json({ ok: true, reply });
}
