import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/server/auth";
import { currentTenantId } from "@/lib/server/tenant";
import { getArticleById, updateArticle, deleteArticle } from "@/lib/server/kb";
import { audit } from "@/lib/server/db";

export const runtime = "nodejs";

const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

// Can the caller manage THIS article? Global (tenantId null) → platform operator; tenant-scoped →
// a Global Admin of the SAME workspace. Returns { me } or null.
async function canManage(id: string) {
  const article = await getArticleById(id);
  if (!article) return { article: null, me: null as null };
  const me = await getUser();
  if (article.tenantId === null) return me.platformAdmin ? { article, me } : { article, me: null };
  const sameTenant = article.tenantId === (await currentTenantId());
  return me.role === "global-admin" && sameTenant ? { article, me } : { article, me: null };
}

const UpdateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  summary: z.string().trim().max(300).nullable().optional(),
  category: z.string().trim().max(60).optional(),
  body: z.string().max(50_000).optional(),
  published: z.boolean().optional(),
  pinned: z.boolean().optional(),
  sort: z.number().int().optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { article, me } = await canManage(id);
  if (!article) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!me) return forbidden();
  const parsed = UpdateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid changes." }, { status: 400 });
  const updated = await updateArticle(id, { ...parsed.data, summary: parsed.data.summary ?? undefined });
  await audit(me.email, "kb.update", updated.slug);
  return NextResponse.json({ ok: true, article: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { article, me } = await canManage(id);
  if (!article) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!me) return forbidden();
  await deleteArticle(id);
  await audit(me.email, "kb.delete", article.slug);
  return NextResponse.json({ ok: true });
}
