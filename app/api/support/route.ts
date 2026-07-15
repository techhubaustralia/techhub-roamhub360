import { NextResponse } from "next/server";
import crypto from "crypto";
import { getUser } from "@/lib/server/auth";
import { currentTenantId, workspaceOrigin } from "@/lib/server/tenant";
import { rateLimit } from "@/lib/server/rate-limit";
import { putAsset } from "@/lib/server/store";
import { createSupportRequest } from "@/lib/server/support";
import { sendMail } from "@/lib/server/graph";
import { emailBrand, supportRequestEmail, supportAckEmail } from "@/lib/server/email";
import { audit } from "@/lib/server/db";

// Raise a support request from the Help panel. Multipart form: subject, category, message, + one
// optional file attachment. Stores the ticket, emails OPS_EMAIL (with the file attached), and sends
// the requester an acknowledgement. Never fails the request just because email is down.
export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp", "application/pdf", "text/plain"]);
const CATEGORIES = ["Question", "Bug", "Feature request", "Billing", "Other"];

function opsInbox(): string | null {
  const list = (process.env.OPS_EMAIL || process.env.BOOTSTRAP_ADMINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list[0] ?? null;
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

  // ---- Optional attachment -----------------------------------------------------------------------
  let attachmentKey: string | null = null;
  let attachmentName: string | null = null;
  let attachmentType: string | null = null;
  let attachmentSize: number | null = null;
  let attachmentBuf: Buffer | null = null;

  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    const type = (file.type || "").toLowerCase();
    if (!ALLOWED.has(type)) return NextResponse.json({ error: "Attachment must be an image, PDF, or text file." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Attachment is larger than 10 MB." }, { status: 400 });
    attachmentBuf = Buffer.from(await file.arrayBuffer());
    attachmentType = type;
    // Sanitise the display name; the storage key is a uuid so the filename never touches the path.
    attachmentName = (file.name || "attachment").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
    attachmentSize = file.size;
    attachmentKey = crypto.randomUUID();
    await putAsset(attachmentKey, attachmentBuf, attachmentType);
  }

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
  const attachments = attachmentBuf && attachmentName && attachmentType ? [{ filename: attachmentName, contentType: attachmentType, content: attachmentBuf }] : undefined;

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
