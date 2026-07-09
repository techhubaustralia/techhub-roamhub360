import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPwToken } from "@/lib/server/account-token";
import { getUserById, setUserPassword } from "@/lib/server/users";
import { audit } from "@/lib/server/db";
import { rateLimit } from "@/lib/server/rate-limit";

// Consume a set-password / reset / invite token and set a new password. PUBLIC (the token is the
// credential). Rate-limited to blunt token guessing.
export const runtime = "nodejs";

const Body = z.object({ token: z.string().min(1), password: z.string().min(8, "Password must be at least 8 characters") });

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!rateLimit(`setpw:${ip}`, 20, 15 * 60 * 1000).ok) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes." }, { status: 429 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const t = verifyPwToken(parsed.data.token);
  if (!t) return NextResponse.json({ error: "This link is invalid or has expired. Request a new one." }, { status: 400 });

  const user = await getUserById(t.uid);
  if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  await setUserPassword(user.id, parsed.data.password);
  await audit(user.email, "account.set-password", "via reset/invite link");
  return NextResponse.json({ ok: true });
}
