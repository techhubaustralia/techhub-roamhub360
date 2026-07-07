import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/server/auth";
import { listTenants, createTenant, validSlug } from "@/lib/server/tenants";
import { audit } from "@/lib/server/db";

// Tenant management — PLATFORM operators only (BOOTSTRAP_ADMINS), not per-tenant admins.
export async function GET() {
  const me = await getUser();
  if (!me.platformAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await listTenants());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unavailable" }, { status: 503 });
  }
}

const Create = z.object({ slug: z.string(), name: z.string().min(1).max(120) });

export async function POST(req: Request) {
  const me = await getUser();
  if (!me.platformAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = Create.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const slug = parsed.data.slug.toLowerCase().trim();
  if (!validSlug(slug)) {
    return NextResponse.json({ error: "Subdomain must be 3–32 lowercase letters/numbers/hyphens and not reserved." }, { status: 400 });
  }
  try {
    const t = await createTenant({ slug, name: parsed.data.name });
    await audit(me.email, "tenant.create", `${slug} (${parsed.data.name})`);
    return NextResponse.json(t, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error && /unique/i.test(e.message) ? "That subdomain is already taken." : "Could not create tenant.";
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}
