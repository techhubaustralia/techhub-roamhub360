import { NextResponse } from "next/server";
import { getUser } from "@/lib/server/auth";
import { currentTenantId } from "@/lib/server/tenant";
import { audit } from "@/lib/server/db";
import { getIntegrationStatus, saveIntegration, recordTest } from "@/lib/server/tenant-integration";
import { testTenantGraph } from "@/lib/server/graph";
import { encryptionAvailable } from "@/lib/server/crypto";
import { rateLimit, clientIp, tooMany } from "@/lib/server/rate-limit";
import { z } from "zod";

// Customer Admin Portal — Microsoft integration (Commercial SaaS CP1). A customer's Global Admin
// configures THEIR OWN Entra app here. The client secret is write-only (encrypted at rest, never
// returned). Platform operators may manage any tenant; customer admins only their own.
function adminOnly(me: { role: string; platformAdmin?: boolean }): boolean {
  return me.role === "global-admin" || Boolean(me.platformAdmin);
}

export async function GET() {
  const me = await getUser();
  if (!adminOnly(me)) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const tenantId = await currentTenantId();
  return NextResponse.json({ status: await getIntegrationStatus(tenantId), encryptionAvailable: encryptionAvailable() });
}

const Save = z.object({
  azureTenantId: z.string().trim().max(100).optional(),
  graphClientId: z.string().trim().max(100).optional(),
  secret: z.string().min(1).max(500).optional(), // omit to keep the existing secret
});

export async function PUT(req: Request) {
  const me = await getUser();
  if (!adminOnly(me)) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "A database is required." }, { status: 503 });
  if (!encryptionAvailable()) return NextResponse.json({ error: "Secret storage is not available — set CREDENTIAL_KEY on the server." }, { status: 503 });

  const parsed = Save.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const tenantId = await currentTenantId();
  await saveIntegration(tenantId, parsed.data);
  // Audit WITHOUT the secret — only what changed.
  const changed = Object.keys(parsed.data).filter((k) => k !== "secret");
  if (parsed.data.secret) changed.push("secret");
  await audit(me.email, "integration.update", `tenant=${tenantId} fields=${changed.join(",") || "none"}`);
  return NextResponse.json({ status: await getIntegrationStatus(tenantId) });
}

export async function POST(req: Request) {
  const me = await getUser();
  if (!adminOnly(me)) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const rl = rateLimit(`integ-test:${me.email || clientIp(req)}`, 10, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfter);

  const tenantId = await currentTenantId();
  const result = await testTenantGraph(tenantId);
  await recordTest(tenantId, result.ok, result.error);
  await audit(me.email, "integration.test", `tenant=${tenantId} ok=${result.ok}${result.error ? ` error=${result.error}` : ""}`);
  return NextResponse.json({ result, status: await getIntegrationStatus(tenantId) });
}
