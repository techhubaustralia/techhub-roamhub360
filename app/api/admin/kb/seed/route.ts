import { NextResponse } from "next/server";
import { getUser } from "@/lib/server/auth";
import { seedGlobalArticles } from "@/lib/server/kb";
import { audit } from "@/lib/server/db";

// One-click starter global articles. Platform operators only; no-op if any global article exists.
export const runtime = "nodejs";

export async function POST() {
  const me = await getUser();
  if (!me.platformAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  const added = await seedGlobalArticles(me.email);
  if (added) await audit(me.email, "kb.seed", `${added} starter articles`);
  return NextResponse.json({ ok: true, added });
}
