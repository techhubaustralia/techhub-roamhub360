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

export async function POST(req: Request) {
  const me = await guard();
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = z.object({ name: z.string().max(60).optional() }).safeParse(await req.json().catch(() => ({})));
  const name = parsed.success ? parsed.data.name ?? "" : "";
  const created = await createApiKey(name, me.email);
  await audit(me.email, "apikey.create", `${created.record.name} (${created.record.prefix}…)`);
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
