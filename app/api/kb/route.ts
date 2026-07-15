import { NextResponse } from "next/server";
import { getUser } from "@/lib/server/auth";
import { currentTenantId } from "@/lib/server/tenant";
import { listArticlesForViewer } from "@/lib/server/kb";

// Knowledge-base list for the in-app Help panel: published global + this workspace's own articles.
export const runtime = "nodejs";

export async function GET() {
  const me = await getUser();
  if (!me.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ articles: [] });
  const articles = await listArticlesForViewer(await currentTenantId());
  return NextResponse.json({ articles });
}
