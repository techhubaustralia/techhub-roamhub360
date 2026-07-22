import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/server/auth";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/server/apikeys";
import { audit } from "@/lib/server/db";

// Admin management of the tenant's public-API keys. Global-admin only.
export const runtime = "nodejs";

async function guard() {
  const me = await getUser();
  if (me.role !== "global-admin") return null;
  return me;
}

export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ keys: await listApiKeys() });
}

const CreateKey = z.object({
  name: z.string().max(60).optional(),
  scopes: z.array(z.enum(["read", "write"])).optional(),
  // 0 / omitted = never expires; otherwise days until expiry (capped at 2 years).
  expiresInDays: z.number().int().min(0).max(730).optional(),
});

export async function POST(req: Request) {
  const me = await guard();
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = CreateKey.safeParse(await req.json().catch(() => ({})));
  const d = parsed.success ? parsed.data : {};
  const created = await createApiKey(d.name ?? "", me.email, { scopes: d.scopes, expiresInDays: d.expiresInDays || null });
  await audit(me.email, "apikey.create", `${created.record.name} (${created.record.prefix}…) scopes=[${created.record.scopes.join(",")}] expires=${created.record.expiresAt ?? "never"}`);
  return NextResponse.json(created, { status: 201 }); // full key returned ONCE
}

export async function DELETE(req: Request) {
  const me = await guard();
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const id = (typeof body?.id === "string" && body.id) || new URL(req.url).searchParams.get("id") || "";
  if (id) {
    await revokeApiKey(id);
    await audit(me.email, "apikey.revoke", id);
  }
  return NextResponse.json({ ok: true });
}
