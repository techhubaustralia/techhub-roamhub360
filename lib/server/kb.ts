import "server-only";
import { prisma } from "./prisma";
import { markdownExcerpt } from "../markdown";

// Knowledge Base data access. Articles are either GLOBAL (tenantId = null; authored by the platform
// team, visible in every workspace) or TENANT-SCOPED (authored by a workspace's Global Admin). The
// in-app viewer merges global + the current tenant's own published articles.
/* eslint-disable @typescript-eslint/no-explicit-any */

const useSql = Boolean(process.env.DATABASE_URL);


export interface KbListItem {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  category: string;
  pinned: boolean;
  scope: "global" | "tenant";
  text: string; // plaintext excerpt of the body — powers in-panel search (not shown directly)
}

export interface KbArticle extends KbListItem {
  body: string;
  published: boolean;
  sort: number;
  views: number;
  createdBy: string | null;
  updatedAt: string;
  tenantId: string | null;
}

function toItem(r: any): KbListItem {
  return { id: r.id, slug: r.slug, title: r.title, summary: r.summary ?? null, category: r.category, pinned: r.pinned, scope: r.tenantId ? "tenant" : "global", text: markdownExcerpt(r.body ?? "", 1200) };
}
function toFull(r: any): KbArticle {
  return { ...toItem(r), body: r.body, published: r.published, sort: r.sort, views: r.views, createdBy: r.createdBy ?? null, updatedAt: (r.updatedAt as Date).toISOString(), tenantId: r.tenantId ?? null };
}

// Stable ordering: pinned first, then by category, manual sort, then title.
const ORDER = [{ pinned: "desc" as const }, { category: "asc" as const }, { sort: "asc" as const }, { title: "asc" as const }];

export function slugify(s: string): string {
  return (
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "article"
  );
}

/** Published articles a workspace's user may see: global + that tenant's own. */
export async function listArticlesForViewer(tenantId: string): Promise<KbListItem[]> {
  if (!useSql) return [];
  const p = await prisma();
  const rows = await p.kbArticle.findMany({ where: { published: true, OR: [{ tenantId: null }, { tenantId }] }, orderBy: ORDER });
  return rows.map(toItem);
}

/** A single published article the viewer is allowed to read; bumps the view counter. */
export async function getViewerArticle(id: string, tenantId: string): Promise<KbArticle | null> {
  if (!useSql) return null;
  const p = await prisma();
  const row = await p.kbArticle.findUnique({ where: { id } });
  if (!row || !row.published) return null;
  if (row.tenantId && row.tenantId !== tenantId) return null; // another tenant's private article
  await p.kbArticle.update({ where: { id }, data: { views: { increment: 1 } } }).catch(() => {});
  return toFull(row);
}

/** All articles (incl. drafts) in a management scope. `global` requires a platform operator; the
 *  tenant scope is filtered to that workspace — both enforced at the route layer. */
export async function listArticlesForAdmin(scope: "global" | "tenant", tenantId: string): Promise<KbArticle[]> {
  if (!useSql) return [];
  const p = await prisma();
  const rows = await p.kbArticle.findMany({ where: { tenantId: scope === "global" ? null : tenantId }, orderBy: ORDER });
  return rows.map(toFull);
}

export async function getArticleById(id: string): Promise<KbArticle | null> {
  if (!useSql) return null;
  const p = await prisma();
  const row = await p.kbArticle.findUnique({ where: { id } });
  return row ? toFull(row) : null;
}

export interface KbInput {
  title: string;
  summary?: string | null;
  category?: string;
  body: string;
  published?: boolean;
  pinned?: boolean;
  sort?: number;
}

async function uniqueSlug(p: any, tenantId: string | null, base: string, excludeId?: string): Promise<string> {
  let slug = base;
  for (let n = 2; n < 100; n++) {
    const clash = await p.kbArticle.findFirst({ where: { tenantId, slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) } });
    if (!clash) return slug;
    slug = `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}

export async function createArticle(scope: "global" | "tenant", tenantId: string, input: KbInput, byEmail: string): Promise<KbArticle> {
  const p = await prisma();
  const tid = scope === "global" ? null : tenantId;
  const slug = await uniqueSlug(p, tid, slugify(input.title));
  const row = await p.kbArticle.create({
    data: {
      tenantId: tid,
      slug,
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      category: input.category?.trim() || "General",
      body: input.body,
      published: input.published ?? false,
      pinned: input.pinned ?? false,
      sort: input.sort ?? 0,
      createdBy: byEmail,
    },
  });
  return toFull(row);
}

export async function updateArticle(id: string, input: Partial<KbInput>): Promise<KbArticle> {
  const p = await prisma();
  const existing = await p.kbArticle.findUnique({ where: { id } });
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) {
    data.title = input.title.trim();
    data.slug = await uniqueSlug(p, existing?.tenantId ?? null, slugify(input.title), id);
  }
  if (input.summary !== undefined) data.summary = input.summary?.trim() || null;
  if (input.category !== undefined) data.category = input.category.trim() || "General";
  if (input.body !== undefined) data.body = input.body;
  if (input.published !== undefined) data.published = input.published;
  if (input.pinned !== undefined) data.pinned = input.pinned;
  if (input.sort !== undefined) data.sort = input.sort;
  const row = await p.kbArticle.update({ where: { id }, data });
  return toFull(row);
}

export async function deleteArticle(id: string): Promise<void> {
  const p = await prisma();
  await p.kbArticle.delete({ where: { id } }).catch(() => {});
}
