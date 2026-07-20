import { NextResponse } from "next/server";
import { getUser } from "@/lib/server/auth";
import { currentTenantId, workspaceOrigin } from "@/lib/server/tenant";
import { rateLimit } from "@/lib/server/rate-limit";
import { takeAttachment } from "@/lib/server/support-attachment";
import { createSupportRequest, listMySupportRequests, replyCounts, unreadFlags } from "@/lib/server/support";
import { sendMail } from "@/lib/server/graph";
import { emailBrand, supportRequestEmail, supportAckEmail } from "@/lib/server/email";
import { audit } from "@/lib/server/db";

// Raise a support request from the Help panel. Multipart form: subject, category, message, + one
// optional file attachment. Stores the ticket, emails OPS_EMAIL (with the file attached), and sends
// the requester an acknowledgement. Never fails the request just because email is down.
export const runtime = "nodejs";

const CATEGORIES = ["Question", "Bug", "Feature request", "Billing", "Other"];

function opsInbox(): string | null {
  const list = (process.env.OPS_EMAIL || process.env.BOOTSTRAP_ADMINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list[0] ?? null;
}

// The signed-in user's OWN requests + their replies. This is what lets a requester see the status of
// something they raised, instead of the request vanishing into an inbox they can't see.
export async function GET() {
  const me = await getUser();
  if (!me.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ requests: [] });
  const requests = await listMySupportRequests(await currentTenantId(), me.email);
  const [counts, unread] = await Promise.all([replyCounts(requests.map((r) => r.id)), unreadFlags(requests, "requester")]);
  return NextResponse.json({
    requests: requests.map((r) => ({ ...r, replyCount: counts[r.id] ?? 0, unread: Boolean(unread[r.id]) })),
    unreadCount: Object.keys(unread).length,
  });
}

export async function POST(req: Request) {
  const me = await getUser();
  if (!me.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Support isn't available on this deployment." }, { status: 503 });

  // 5 requests / 10 min per user — enough for genuine follow-ups, blocks spam/abuse.
  const rl = rateLimit(`support:${me.email.toLowerCase()}`, 5, 10 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: `Too many requests — try again in ${rl.retryAfter}s.` }, { status: 429 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form submission." }, { status: 400 });
  }

  const subject = String(form.get("subject") || "").trim();
  const message = String(form.get("message") || "").trim();
  let category = String(form.get("category") || "Question").trim();
  if (!CATEGORIES.includes(category)) category = "Other";
  if (!subject || subject.length > 160) return NextResponse.json({ error: "A subject (up to 160 chars) is required." }, { status: 400 });
  if (!message || message.length > 5000) return NextResponse.json({ error: "A message (up to 5000 chars) is required." }, { status: 400 });

  const tenantId = await currentTenantId();

  // ---- Optional attachment (shared validation with replies) --------------------------------------
  const att = await takeAttachment(form.get("file"));
  if (att.error) return NextResponse.json({ error: att.error }, { status: 400 });
  const attachmentKey = att.stored?.key ?? null;
  const attachmentName = att.stored?.name ?? null;
  const attachmentType = att.stored?.type ?? null;
  const attachmentSize = att.stored?.size ?? null;

  const ticket = await createSupportRequest({
    tenantId,
    userEmail: me.email,
    userName: me.name ?? null,
    category,
    subject,
    message,
    attachmentKey,
    attachmentName,
    attachmentType,
    attachmentSize,
  });
  await audit(me.email, "support.create", `${category}: ${subject}`);

  // ---- Notify ops + acknowledge the requester (best-effort) --------------------------------------
  const eb = await emailBrand(tenantId);
  const ops = opsInbox();
  const attachments = att.stored ? [{ filename: att.stored.name, contentType: att.stored.type, content: att.stored.buffer }] : undefined;

  if (ops) {
    const mail = supportRequestEmail(
      {
        category,
        subject,
        message,
        userName: me.name,
        userEmail: me.email,
        workspace: tenantId,
        attachmentName,
        ticketUrl: `${workspaceOrigin(tenantId)}/admin/support`,
      },
      eb,
    );
    await sendMail(ops, mail.subject, mail.html, tenantId, attachments).catch(() => false);
  }
  const ack = supportAckEmail({ subject, message }, eb);
  await sendMail(me.email, ack.subject, ack.html, tenantId).catch(() => false);

  return NextResponse.json({ ok: true, id: ticket.id, emailedOps: Boolean(ops) });
}
