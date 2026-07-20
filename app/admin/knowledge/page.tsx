"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Plus, Pencil, Trash2, Eye, EyeOff, Pin, Globe, Building2, LoaderCircle, ChevronDown, ChevronRight, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { renderMarkdown } from "@/lib/markdown";
import { BUILTIN_ARTICLES } from "@/lib/kb-content";
import { getAdminKb, createKbArticle, updateKbArticle, deleteKbArticle, type KbArticleFull } from "@/lib/api";

type Scope = "tenant" | "global";
type Editing = (Partial<KbArticleFull> & { isNew?: boolean }) | null;

export default function KnowledgePage() {
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [scope, setScope] = useState<Scope>("tenant");
  const [articles, setArticles] = useState<KbArticleFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Editing>(null);
  const [showBuiltin, setShowBuiltin] = useState(false);
  const [preview, setPreview] = useState<{ title: string; category: string; html: string } | null>(null);

  useEffect(() => {
    fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).then((me) => setPlatformAdmin(!!me?.platformAdmin)).catch(() => {});
  }, []);

  const load = useCallback(async (s: Scope) => {
    setLoading(true);
    setArticles(await getAdminKb(s));
    setLoading(false);
  }, []);

  useEffect(() => { load(scope).catch(() => {}); }, [scope, load]);

  async function remove(a: KbArticleFull) {
    if (!confirm(`Delete "${a.title}"? This can't be undone.`)) return;
    const res = await deleteKbArticle(a.id);
    if (res.ok) { toast.success("Deleted"); load(scope); }
    else toast.error("Could not delete", { description: res.error });
  }

  async function togglePublish(a: KbArticleFull) {
    const res = await updateKbArticle(a.id, { published: !a.published });
    if (res.ok) { toast.success(a.published ? "Unpublished" : "Published"); load(scope); }
    else toast.error("Could not update", { description: res.error });
  }

  if (editing) {
    return <Editor scope={scope} initial={editing} onDone={() => { setEditing(null); load(scope); }} onCancel={() => setEditing(null)} />;
  }

  return (
    <div className="animate-fade-up max-w-3xl">
      <PageHeader
        title="Knowledge base"
        subtitle="A built-in help library is always shown in the Help panel. Add your own extra articles here (Markdown)."
        action={<button onClick={() => setEditing({ isNew: true, category: "General", body: "", published: false })} className="flex items-center gap-1.5 rounded-[10px] bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-orange-soft"><Plus className="size-4" /> New article</button>}
      />

      {/* Scope switch (platform operators can also edit the shared global KB) */}
      {platformAdmin && (
        <div className="mb-4 inline-flex rounded-[10px] border bg-panel-2 p-1 text-[13px]">
          <button onClick={() => setScope("tenant")} className={`flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 font-semibold ${scope === "tenant" ? "bg-card shadow-sm" : "text-txt-mute"}`}><Building2 className="size-3.5" /> This workspace</button>
          <button onClick={() => setScope("global")} className={`flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 font-semibold ${scope === "global" ? "bg-card shadow-sm" : "text-txt-mute"}`}><Globe className="size-3.5" /> Global (all workspaces)</button>
        </div>
      )}

      {/* The shipped library. Without this the page looks empty and it seems there's no help for
          customers at all — when in fact these are already live behind the Help button. */}
      <div className="mb-4 rounded-[14px] border bg-card shadow-sm">
        <button onClick={() => setShowBuiltin((s) => !s)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-ok/12 text-ok"><BookOpen className="size-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold">{BUILTIN_ARTICLES.length} built-in help articles — already live</span>
            <span className="mt-0.5 block text-[12px] text-txt-mute">Everyone in this workspace can read these from the Help (life-buoy) button. Written and kept up to date by TechHub Australia — add your own below.</span>
          </span>
          {showBuiltin ? <ChevronDown className="size-4 shrink-0 text-txt-mute" /> : <ChevronRight className="size-4 shrink-0 text-txt-mute" />}
        </button>
        {showBuiltin && (
          <div className="max-h-[320px] overflow-auto border-t px-4 py-3">
            {[...new Set(BUILTIN_ARTICLES.map((a) => a.category))].map((cat) => (
              <div key={cat} className="mb-3 last:mb-0">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">{cat}</div>
                <ul className="flex flex-col gap-0.5">
                  {BUILTIN_ARTICLES.filter((a) => a.category === cat).map((a) => (
                    <li key={a.id}>
                      {/* Clickable: an admin listing articles should be able to READ them. Built-in
                          content is bundled client-side, so this opens instantly with no fetch. */}
                      <button
                        onClick={() => setPreview({ title: a.title, category: a.category, html: renderMarkdown(a.body) })}
                        className="flex w-full items-center gap-2 rounded-[6px] px-1 py-0.5 text-left text-[13px] hover:bg-panel-2"
                      >
                        <Eye className="size-3.5 shrink-0 text-ok" aria-hidden />
                        <span className="truncate underline-offset-2 hover:underline">{a.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid place-items-center py-16 text-txt-mute"><LoaderCircle className="size-5 animate-spin" /></div>
      ) : articles.length === 0 ? (
        <div className="rounded-[14px] border border-dashed bg-card p-8 text-center">
          <BookOpen className="mx-auto mb-2 size-7 text-txt-mute" />
          <div className="text-[14px] font-semibold">No articles of your own yet</div>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-txt-mute">Nothing is missing — the {BUILTIN_ARTICLES.length} built-in articles above are already available to everyone in this workspace. Add your own only for company-specific guidance, e.g. &quot;Where to park at Head Office&quot;.</p>
          <div className="mt-4 flex justify-center gap-2">
            <button onClick={() => setEditing({ isNew: true, category: "General", body: "", published: false })} className="rounded-[10px] bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-orange-soft">New article</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {articles.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-[12px] border bg-card px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {a.pinned && <Pin className="size-3.5 text-primary" />}
                  <span className="truncate text-[14px] font-semibold">{a.title}</span>
                  {!a.published && <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-txt-mute">Draft</span>}
                </div>
                <div className="mt-0.5 text-[12px] text-txt-mute">{a.category} · {a.views} views</div>
              </div>
              <button onClick={() => togglePublish(a)} title={a.published ? "Unpublish" : "Publish"} className="grid size-8 place-items-center rounded-[8px] hover:bg-panel-2">{a.published ? <Eye className="size-4 text-ok" /> : <EyeOff className="size-4 text-txt-mute" />}</button>
              <button onClick={() => setEditing(a)} title="Edit" className="grid size-8 place-items-center rounded-[8px] hover:bg-panel-2"><Pencil className="size-4" /></button>
              <button onClick={() => remove(a)} title="Delete" className="grid size-8 place-items-center rounded-[8px] hover:bg-panel-2 hover:text-destructive"><Trash2 className="size-4" /></button>
            </div>
          ))}
        </div>
      )}

      {/* Read-only preview of a built-in article — exactly what a user sees in the Help panel. */}
      {preview && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setPreview(null)}>
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-[14px] border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-2 border-b px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-primary">{preview.category}</div>
                <h2 className="mt-1 font-heading text-[17px] font-bold leading-snug">{preview.title}</h2>
              </div>
              <button onClick={() => setPreview(null)} className="grid size-8 place-items-center rounded-[8px] hover:bg-panel-2" aria-label="Close"><X className="size-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
              <div className="kb-prose text-[13.5px]" dangerouslySetInnerHTML={{ __html: preview.html }} />
            </div>
            <div className="border-t px-5 py-3 text-[11.5px] text-txt-mute">Built-in article — shown to everyone in this workspace.</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Editor({ scope, initial, onDone, onCancel }: { scope: Scope; initial: Editing; onDone: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState(initial?.category ?? "General");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [published, setPublished] = useState(initial?.published ?? false);
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [saving, setSaving] = useState(false);
  const isNew = !!initial?.isNew;

  async function save() {
    if (!title.trim()) return toast.error("A title is required.");
    setSaving(true);
    const payload = { title: title.trim(), category: category.trim() || "General", summary: summary.trim() || null, body, published, pinned };
    const res = isNew ? await createKbArticle({ scope, ...payload }) : await updateKbArticle(initial!.id!, payload);
    setSaving(false);
    if (res.ok) { toast.success(isNew ? "Article created" : "Saved"); onDone(); }
    else toast.error("Could not save", { description: res.error });
  }

  return (
    <div className="animate-fade-up max-w-3xl">
      <PageHeader
        title={isNew ? "New article" : "Edit article"}
        subtitle={scope === "global" ? "Global — shown in every workspace's Help panel." : "This workspace only."}
        action={<div className="flex gap-2"><button onClick={onCancel} className="rounded-[10px] border bg-panel-2 px-3.5 py-2 text-[13px] font-semibold hover:border-primary">Cancel</button><button onClick={save} disabled={saving} className="rounded-[10px] bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-orange-soft disabled:opacity-50">{saving ? "Saving…" : "Save"}</button></div>}
      />

      <div className="flex flex-col gap-4 rounded-[14px] border bg-card p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} className="ed-input text-[14px]" placeholder="How to book a desk" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Category</span>
            <input value={category} onChange={(e) => setCategory(e.target.value)} maxLength={60} className="ed-input text-[13.5px]" placeholder="Getting started" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Summary (optional)</span>
            <input value={summary ?? ""} onChange={(e) => setSummary(e.target.value)} maxLength={300} className="ed-input text-[13.5px]" placeholder="One-line blurb for the list" />
          </label>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Body (Markdown)</span>
            <div className="inline-flex rounded-[8px] border bg-panel-2 p-0.5 text-[12px]">
              <button onClick={() => setTab("write")} className={`rounded-[6px] px-2.5 py-1 font-semibold ${tab === "write" ? "bg-card shadow-sm" : "text-txt-mute"}`}>Write</button>
              <button onClick={() => setTab("preview")} className={`rounded-[6px] px-2.5 py-1 font-semibold ${tab === "preview" ? "bg-card shadow-sm" : "text-txt-mute"}`}>Preview</button>
            </div>
          </div>
          {tab === "write" ? (
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={16} maxLength={50000} className="ed-input font-mono text-[13px]" placeholder={"# Heading\n\nWrite with **bold**, *italic*, lists:\n\n- one\n- two\n\n1. first\n2. second\n\n[a link](https://example.com)"} />
          ) : (
            <div className="kb-prose min-h-[240px] rounded-[10px] border bg-panel-2/40 p-4 text-[13.5px]" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) || "<p style='opacity:.6'>Nothing to preview yet.</p>" }} />
          )}
        </div>

        <div className="flex flex-wrap gap-4 border-t pt-4">
          <label className="flex items-center gap-2 text-[13px] font-medium"><input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} className="size-4 accent-[var(--primary)]" /> Published (visible in Help)</label>
          <label className="flex items-center gap-2 text-[13px] font-medium"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="size-4 accent-[var(--primary)]" /> Pin to top of its category</label>
        </div>
      </div>
    </div>
  );
}
