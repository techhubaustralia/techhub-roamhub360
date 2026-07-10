import { NextResponse } from "next/server";
import { z } from "zod";
import { findUserByEmail } from "@/lib/server/users";
import { signEmailToken } from "@/lib/server/account-token";
import { workspaceOrigin } from "@/lib/server/tenant";
import { sendMail } from "@/lib/server/graph";
import { verifyEmailEmail, emailBrand } from "@/lib/server/email";
import { rateLimit } from "@/lib/server/rate-limit";

// Resend the email-verification link for an unverified signup account. PUBLIC. Always returns
// { ok: true } (no account enumeration); rate-limited. Only sends if the account still needs it.
export const runtime = "nodejs";

const Body = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!rateLimit(`resendverify:${ip}`, 5, 15 * 60 * 1000).ok) return NextResponse.json({ ok: true });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: true });

  try {
    const user = await findUserByEmail(parsed.data.email.toLowerCase());
    if (user?.id && user.mustVerify && !user.emailVerified) {
      const url = `${workspaceOrigin(user.tenantId)}/verify-email?token=${encodeURIComponent(signEmailToken(user.id))}`;
      const mail = verifyEmailEmail(url, await emailBrand(user.tenantId ?? undefined));
      await sendMail(user.email, mail.subject, mail.html, user.tenantId ?? undefined);
    }
  } catch {
    /* never leak errors on this endpoint */
  }
  return NextResponse.json({ ok: true });
}
