import "server-only";

// Central transactional email. When RESEND_API_KEY is set, all app email (password reset, invites,
// booking confirmations, digests…) goes through Resend — a dedicated ESP with a verified sender
// domain, reliable and independent of any customer's Microsoft 365. Without it, callers fall back
// to the Microsoft Graph mailbox path (lib/server/graph.ts). Uses plain fetch — no SDK dependency.

const RESEND_KEY = process.env.RESEND_API_KEY?.trim();
// A verified sender on your own domain, e.g. "RoamHub360 <noreply@roamhub360.com>".
const RESEND_FROM = process.env.RESEND_FROM?.trim() || process.env.MAIL_FROM?.trim() || "";

export const espConfigured = Boolean(RESEND_KEY && RESEND_FROM);

// A file to attach to an outgoing email (e.g. a support-request screenshot). `content` is raw bytes;
// each transport base64-encodes it as required.
export interface MailAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

/** Send via the ESP. Returns false (never throws) when unconfigured or on failure, so callers can
 *  fall back to Graph. */
export async function sendViaEsp(to: string, subject: string, html: string, from?: string, attachments?: MailAttachment[]): Promise<boolean> {
  if (!RESEND_KEY || !RESEND_FROM) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: from || RESEND_FROM,
        to,
        subject,
        html,
        ...(attachments?.length
          ? { attachments: attachments.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })) }
          : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    return r.ok;
  } catch {
    return false;
  }
}
