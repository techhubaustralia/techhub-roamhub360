import { NextResponse } from "next/server";
import { z } from "zod";
import { createTenant, getTenantBySlug, validSlug } from "@/lib/server/tenants";
import { saveLicense } from "@/lib/server/licensing";
import { findUserByEmail, createUser } from "@/lib/server/users";
import { rateLimit, clientIp, tooMany } from "@/lib/server/rate-limit";

// Self-serve trial signup (Growth G5). Provisions a NEW isolated workspace: tenant + 14-day trial
// licence + first Global Admin. PUBLIC, but OFF by default — the operator opts in with
// ALLOW_PUBLIC_SIGNUP=true (public tenant creation is abuse-prone). Hard IP rate-limit either way.
// Requires a DB. On success the prospect signs in at their own <slug>.roamhub360.com.

const TRIAL_DAYS = 14;

const Body = z.object({
  company: z.string().trim().min(2).max(80),
  slug: z.string().trim().toLowerCase().min(3).max(32),
  name: z.string().trim().min(1).max(80),
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
});

function workspaceUrl(slug: string): string {
  try {
    const host = new URL(process.env.APP_URL || "https://app.roamhub360.com").host;
    const apex = host.split(".").slice(1).join(".") || host;
    return `https://${slug}.${apex}`;
  } catch {
    return `https://${slug}.roamhub360.com`;
  }
}

export async function POST(req: Request) {
  if (process.env.ALLOW_PUBLIC_SIGNUP !== "true") {
    return NextResponse.json({ error: "Self-serve signup is not enabled. Contact TechHub Australia to get started." }, { status: 403 });
  }
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Signup is unavailable right now." }, { status: 503 });

  const rl = rateLimit(`signup:ip:${clientIp(req)}`, 5, 3_600_000); // 5 per hour per IP
  if (!rl.ok) return tooMany(rl.retryAfter);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid details." }, { status: 400 });
  const { company, slug, name, email, password } = parsed.data;

  if (!validSlug(slug)) return NextResponse.json({ error: "That address isn't available — use 3–32 letters, numbers or hyphens." }, { status: 400 });
  if (await getTenantBySlug(slug)) return NextResponse.json({ error: "That workspace address is already taken." }, { status: 409 });
  if (await findUserByEmail(email)) return NextResponse.json({ error: "That email already has an account." }, { status: 409 });

  // Provision: workspace → trial licence → first admin (all scoped to the new tenant).
  await createTenant({ slug, name: company });
  const expiresAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString();
  await saveLicense(slug, { tier: "trial", maxSites: 1, maxFloorsPerSite: 2, status: "active", expiresAt, graceDays: 7 });
  await createUser({ email, name, password, role: "global-admin", tenantId: slug });

  return NextResponse.json({ ok: true, url: workspaceUrl(slug), trialDays: TRIAL_DAYS });
}
