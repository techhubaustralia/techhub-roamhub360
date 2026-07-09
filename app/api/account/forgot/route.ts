import { NextResponse } from "next/server";
import { z } from "zod";
import { findUserByEmail } from "@/lib/server/users";
import { signPwToken, requestOrigin } from "@/lib/server/account-token";
import { sendMail } from "@/lib/server/graph";
import { passwordResetEmail, emailBrand } from "@/lib/server/email";
import { rateLimit } from "@/lib/server/rate-limit";

// Request a password-reset link. PUBLIC. Always returns { ok: true } regardless of whether the
// email exists — no account enumeration. Rate-limited. Only local (password) accounts get a link;
// SSO-only users manage their password with their identity provider.
export const runtime = "nodejs";

const Body = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const rl = rateLimit(`forgot:${ip}`, 5, 15 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ ok: true }); // silently rate-limit (still no signal)

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: true });

  const email = parsed.data.email.toLowerCase();
  try {
    const user = await findUserByEmail(email);
    if (user?.passwordHash && user.id) {
      const url = `${requestOrigin(req)}/set-password?token=${encodeURIComponent(signPwToken(user.id))}`;
      const mail = passwordResetEmail(url, await emailBrand(user.tenantId ?? undefined));
      await sendMail(user.email, mail.subject, mail.html, user.tenantId ?? undefined);
    }
  } catch {
    /* never leak errors on this endpoint */
  }
  return NextResponse.json({ ok: true });
}
