import { NextResponse } from "next/server";
import { z } from "zod";
import { findUserByEmail } from "@/lib/server/users";
import { signPwToken, pwFingerprint } from "@/lib/server/account-token";
import { workspaceOrigin } from "@/lib/server/tenant";
import { sendMail } from "@/lib/server/graph";
import { passwordResetEmail, emailBrand } from "@/lib/server/email";
import { rateLimit, clientIp } from "@/lib/server/rate-limit";

// Request a password-reset link. PUBLIC. Always returns { ok: true } regardless of whether the
// email exists — no account enumeration. Rate-limited. Only local (password) accounts get a link;
// SSO-only users manage their password with their identity provider.
export const runtime = "nodejs";

const Body = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const rl = rateLimit(`forgot:${clientIp(req)}`, 5, 15 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ ok: true }); // silently rate-limit (still no signal)

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: true });

  const email = parsed.data.email.toLowerCase();
  try {
    const user = await findUserByEmail(email);
    if (!user?.id) {
      // No such account. Response stays generic (no enumeration) but the log says why nothing sent.
      console.warn(`[forgot] no email sent — no account for ${email}`);
    } else {
      // Send for ANY existing account, including one with no password yet (invited user who never
      // completed setup, or an SSO account adding a password). Previously this required an existing
      // passwordHash, so invited/SSO users silently got nothing — the "reset email never arrives" bug.
      // pwFingerprint(null) is the documented invited-user fingerprint, so the token stays single-use.
      const url = `${workspaceOrigin(user.tenantId)}/set-password?token=${encodeURIComponent(signPwToken(user.id, pwFingerprint(user.passwordHash ?? null)))}`;
      const mail = passwordResetEmail(url, await emailBrand(user.tenantId ?? undefined));
      const sent = await sendMail(user.email, mail.subject, mail.html, user.tenantId ?? undefined);
      console.log(`[forgot] reset link for ${email} (workspace "${user.tenantId ?? "default"}", hasPassword=${Boolean(user.passwordHash)}) → ${sent ? "SENT" : "NOT SENT (mail transport failed — see [mail] log above)"}`);
    }
  } catch (e) {
    // Still never leak to the client, but make the failure visible in the server log.
    console.error(`[forgot] unexpected error for ${email}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return NextResponse.json({ ok: true });
}
