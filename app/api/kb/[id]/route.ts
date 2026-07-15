import { NextResponse } from "next/server";
import { getUser } from "@/lib/server/auth";
import { currentTenantId } from "@/lib/server/tenant";
import { getViewerArticle } from "@/lib/server/kb";
import { renderMarkdown } from "@/lib/markdown";

// A single knowledge-base article for the Help panel — returns the source plus server-rendered,
// sanitised HTML so the client can inject it directly.
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser();
  if (!me.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  const article = await getViewerArticle(id, await currentTenantId());
  if (!article) return NextResponse.json({ error: "Article not found." }, { status: 404 });
  return NextResponse.json({ article: { ...article, html: renderMarkdown(article.body) } });
}
