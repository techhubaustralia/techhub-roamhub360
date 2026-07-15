import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/server/auth";
import { currentTenantId } from "@/lib/server/tenant";
import { listArticlesForAdmin, createArticle } from "@/lib/server/kb";
import { audit } from "@/lib/server/db";

// Manage knowledge-base articles. Two scopes:
//   scope=global → platform operators only (the shared KB every workspace sees)
//   scope=tenant → this workspace's Global Admin (articles only their workspace sees)
export const runtime = "nodejs";

const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

/** Returns the caller if allowed to manage the given scope, else null. */
async function allow(scope: "global" | "tenant") {
  const me = await getUser();
  if (scope === "global") return me.platformAdmin ? me : null;
  return me.role === "global-admin" ? me : null;
}

function readScope(v: string | null): "global" | "tenant" {
  return v === "global" ? "global" : "tenant";
}

export async function GET(req: Request) {
  const scope = readScope(new URL(req.url).searchParams.get("scope"));
  if (!(await allow(scope))) return forbidden();
  if (!process.env.DATABASE_URL) return NextResponse.json({ articles: [] });
  const articles = await listArticlesForAdmin(scope, await currentTenantId());
  return NextResponse.json({ articles });
}

const CreateSchema = z.object({
  scope: z.enum(["global", "tenant"]).default("tenant"),
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().max(300).optional(),
  category: z.string().trim().max(60).optional(),
  body: z.string().max(50_000),
  published: z.boolean().optional(),
  pinned: z.boolean().optional(),
  sort: z.number().int().optional(),
});

export async function POST(req: Request) {
  const parsed = CreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid article." }, { status: 400 });
  const { scope, ...input } = parsed.data;
  const me = await allow(scope);
  if (!me) return forbidden();
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  const article = await createArticle(scope, await currentTenantId(), input, me.email);
  await audit(me.email, "kb.create", `${scope}:${article.slug}`);
  return NextResponse.json({ ok: true, article });
}
