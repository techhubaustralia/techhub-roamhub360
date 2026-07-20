"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LifeBuoy, X, Search, ChevronRight, ArrowLeft, Paperclip, Send, LoaderCircle, BookOpen, MessageCircleQuestion, CheckCircle2, Inbox } from "lucide-react";
import { toast } from "sonner";
import {
  getKbArticles,
  getKbArticle,
  submitSupport,
  getMySupportRequests,
  getSupportThread,
  postSupportReply,
  type KbListItem,
  type SupportRequestRow,
  type SupportReplyRow,
} from "@/lib/api";
import { searchArticles } from "@/lib/kb-search";
import { BUILTIN_ARTICLES } from "@/lib/kb-content";
import { renderMarkdown, markdownExcerpt } from "@/lib/markdown";

// The built-in library, always available (no DB/seeding). Shaped like a KbListItem for the list +
// search; `text` lets search reach the body.
const BUILTIN_ITEMS: KbListItem[] = BUILTIN_ARTICLES.map((a) => ({
  id: a.id,
  slug: a.slug,
  title: a.title,
  summary: a.summary,
  category: a.category,
  pinned: a.pinned,
  scope: "global" as const,
  text: markdownExcerpt(a.body, 1200),
}));

// What the article view needs — satisfied by both a built-in (rendered locally) and a DB article.
interface ViewArticle {
  title: string;
  category: string;
  html: string;
}

type View = "list" | "article" | "support" | "sent" | "requests" | "thread";
const CATEGORIES = ["Question", "Bug", "Feature request", "Billing", "Other"];

export function HelpButton() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("list");
  // Start with the built-in library so the panel is populated instantly (before any fetch).
  const [articles, setArticles] = useState<KbListItem[]>(BUILTIN_ITEMS);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState<ViewArticle | null>(null);
  const [articleLoading, setArticleLoading] = useState(false);
  const [loadedDb, setLoadedDb] = useState(false);

  // support form
  const [cat, setCat] = useState("Question");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // "My requests" — the requester's own tickets + conversation, so a request no longer disappears
  // into an inbox they can't see.
  const [myRequests, setMyRequests] = useState<(SupportRequestRow & { replyCount?: number })[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [thread, setThread] = useState<{ request: SupportRequestRow; replies: SupportReplyRow[] } | null>(null);
  const [threadReply, setThreadReply] = useState("");

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true);
    setMyRequests(await getMySupportRequests());
    setRequestsLoading(false);
  }, []);

  async function openThread(id: string) {
    setView("thread");
    setThread(null);
    setThread(await getSupportThread(id));
  }

  async function sendThreadReply() {
    const body = threadReply.trim();
    if (!body || !thread) return;
    setSending(true);
    const res = await postSupportReply(thread.request.id, body);
    setSending(false);
    if (res.ok) {
      setThreadReply("");
      setThread(await getSupportThread(thread.request.id));
      toast.success("Sent");
    } else toast.error("Couldn't send", { description: res.error });
  }

  // Merge the built-in library with any custom DB articles. A custom article with the same title as
  // a built-in overrides it (lets an admin tailor the wording); otherwise it's added.
  const load = useCallback(async () => {
    setLoading(true);
    const db = await getKbArticles();
    const byTitle = new Map(BUILTIN_ITEMS.map((a) => [a.title.toLowerCase(), a]));
    for (const d of db) byTitle.set(d.title.toLowerCase(), d);
    setArticles([...byTitle.values()]);
    setLoadedDb(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open && !loadedDb) load().catch(() => {});
  }, [open, loadedDb, load]);

  // Esc closes; lock body scroll while the panel is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Searching → a single flat, relevance-ranked list (no category headers). Browsing → grouped by
  // category. Sections carry a nullable label so the render can hide the header when searching.
  const sections = useMemo<{ label: string | null; items: KbListItem[] }[]>(() => {
    const q = query.trim();
    if (q) {
      const results = searchArticles(articles, q);
      return results.length ? [{ label: null, items: results }] : [];
    }
    const groups = new Map<string, KbListItem[]>();
    for (const a of articles) {
      if (!groups.has(a.category)) groups.set(a.category, []);
      groups.get(a.category)!.push(a);
    }
    return [...groups.entries()].map(([label, items]) => ({ label, items }));
  }, [articles, query]);

  async function openArticle(id: string) {
    setView("article");
    // Built-in articles render instantly from bundled content (no round-trip); DB articles fetch.
    if (id.startsWith("builtin:")) {
      const a = BUILTIN_ARTICLES.find((x) => x.id === id);
      setCurrent(a ? { title: a.title, category: a.category, html: renderMarkdown(a.body) } : null);
      return;
    }
    setArticleLoading(true);
    const a = await getKbArticle(id);
    setCurrent(a ? { title: a.title, category: a.category, html: a.html } : null);
    setArticleLoading(false);
  }

  function resetSupport() {
    setCat("Question");
    setSubject("");
    setMessage("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function sendSupport(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return toast.error("Add a subject and a message.");
    if (file && file.size > 10 * 1024 * 1024) return toast.error("Attachment is larger than 10 MB.");
    setSending(true);
    const fd = new FormData();
    fd.set("category", cat);
    fd.set("subject", subject.trim());
    fd.set("message", message.trim());
    if (file) fd.set("file", file);
    const res = await submitSupport(fd);
    setSending(false);
    if (res.ok) {
      resetSupport();
      setView("sent");
    } else {
      toast.error("Couldn't send", { description: res.error });
    }
  }

  const close = () => {
    setOpen(false);
    // reset to the list for next open, but keep loaded articles cached
    setTimeout(() => {
      setView("list");
      setCurrent(null);
      setQuery("");
    }, 200);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Help & support"
        aria-label="Help and support"
        className="grid size-11 shrink-0 place-items-center rounded-[9px] border bg-panel-2 text-txt-dim hover:text-foreground md:size-9"
      >
        <LifeBuoy className="size-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={close} aria-hidden />
          <aside
            className="pop-in fixed right-0 top-0 z-50 flex h-full w-full max-w-[430px] flex-col border-l bg-card shadow-2xl"
            style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
            role="dialog"
            aria-label="Help and support"
          >
            {/* Header */}
            <div className="flex items-center gap-2 border-b px-4 py-3">
              {(view === "article" || view === "support" || view === "requests" || view === "thread") && (
                <button onClick={() => setView(view === "thread" ? "requests" : "list")} className="grid size-8 place-items-center rounded-[8px] hover:bg-panel-2" aria-label="Back">
                  <ArrowLeft className="size-4" />
                </button>
              )}
              <div className="flex items-center gap-2 font-heading text-[15px] font-bold">
                <LifeBuoy className="size-4 text-primary" />
                {view === "support" ? "Contact support"
                  : view === "sent" ? "Request sent"
                  : view === "article" ? "Help article"
                  : view === "requests" ? "My requests"
                  : view === "thread" ? "Request" : "Help & support"}
              </div>
              <button onClick={close} className="ml-auto grid size-8 place-items-center rounded-[8px] hover:bg-panel-2" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-auto">
              {/* LIST */}
              {view === "list" && (
                <div className="flex h-full flex-col">
                  <div className="border-b p-3">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-txt-mute" />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search help articles…"
                        className="ed-input pl-9 text-[13.5px]"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="flex-1 overflow-auto p-3">
                    {loading ? (
                      <div className="grid place-items-center py-16 text-txt-mute"><LoaderCircle className="size-5 animate-spin" /></div>
                    ) : sections.length === 0 ? (
                      <div className="px-2 py-10 text-center text-[13px] text-txt-mute">
                        <BookOpen className="mx-auto mb-2 size-6 opacity-50" />
                        {articles.length === 0 ? "No help articles yet." : `No articles match "${query.trim()}".`}
                        <div className="mt-1">Still stuck? Contact support below.</div>
                      </div>
                    ) : (
                      sections.map((section, si) => (
                        <div key={section.label ?? `results-${si}`} className="mb-4">
                          {section.label && <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">{section.label}</div>}
                          <div className="flex flex-col gap-1">
                            {section.items.map((a) => (
                              <button
                                key={a.id}
                                onClick={() => openArticle(a.id)}
                                className="group flex items-start gap-2 rounded-[10px] border border-transparent px-2.5 py-2 text-left hover:border-line hover:bg-panel-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="text-[13.5px] font-semibold leading-snug">{a.title}</div>
                                  {a.summary && <div className="mt-0.5 line-clamp-2 text-[12px] text-txt-mute">{a.summary}</div>}
                                </div>
                                <ChevronRight className="mt-0.5 size-4 shrink-0 text-txt-mute group-hover:text-foreground" />
                              </button>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* ARTICLE */}
              {view === "article" && (
                <div className="p-5">
                  {articleLoading || !current ? (
                    <div className="grid place-items-center py-16 text-txt-mute"><LoaderCircle className="size-5 animate-spin" /></div>
                  ) : (
                    <>
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-primary">{current.category}</div>
                      <h1 className="font-heading text-[19px] font-bold leading-tight">{current.title}</h1>
                      <div className="kb-prose mt-4 text-[13.5px]" dangerouslySetInnerHTML={{ __html: current.html }} />
                    </>
                  )}
                </div>
              )}

              {/* SUPPORT FORM */}
              {view === "support" && (
                <form onSubmit={sendSupport} className="flex flex-col gap-3 p-4">
                  <p className="text-[12.5px] text-txt-mute">Tell us what's going on and we'll get back to you by email. You can attach a screenshot or file.</p>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Type</span>
                    <select value={cat} onChange={(e) => setCat(e.target.value)} className="ed-input text-[13.5px]">
                      {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Subject</span>
                    <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} placeholder="Short summary" className="ed-input text-[13.5px]" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Message</span>
                    <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={5000} rows={6} placeholder="Describe the issue or question in detail…" className="ed-input text-[13.5px]" />
                  </label>
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Attachment (optional)</span>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      className="hidden"
                    />
                    <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full items-center gap-2 rounded-[10px] border border-dashed px-3 py-2.5 text-[13px] text-txt-dim hover:border-primary hover:text-foreground">
                      <Paperclip className="size-4" />
                      {file ? <span className="truncate">{file.name} · {(file.size / 1024).toFixed(0)} KB</span> : "Attach a screenshot or file (max 10 MB)"}
                    </button>
                    {file && <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }} className="mt-1 text-[12px] text-txt-mute hover:text-destructive">Remove attachment</button>}
                  </div>
                  <button type="submit" disabled={sending} className="mt-1 flex items-center justify-center gap-2 rounded-[10px] bg-primary px-4 py-2.5 text-[13.5px] font-semibold text-primary-foreground hover:bg-orange-soft disabled:opacity-50">
                    {sending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
                    {sending ? "Sending…" : "Send request"}
                  </button>
                </form>
              )}

              {/* SENT confirmation */}
              {view === "sent" && (
                <div className="grid place-items-center px-6 py-16 text-center">
                  <CheckCircle2 className="mb-3 size-12 text-ok" />
                  <div className="font-heading text-[16px] font-bold">Thanks — we've got it</div>
                  <p className="mt-1.5 max-w-[280px] text-[13px] text-txt-mute">Your request has been sent to our team. We'll reply by email, and you can follow it under <b>My requests</b>.</p>
                  <div className="mt-5 flex gap-2">
                    <button onClick={() => { setView("requests"); loadRequests(); }} className="rounded-[10px] bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-orange-soft">My requests</button>
                    <button onClick={() => setView("list")} className="rounded-[10px] border bg-panel-2 px-4 py-2 text-[13px] font-semibold hover:border-primary">Back to help</button>
                  </div>
                </div>
              )}

              {/* MY REQUESTS — status of everything this user has raised */}
              {view === "requests" && (
                <div className="p-3">
                  {requestsLoading ? (
                    <div className="grid place-items-center py-16 text-txt-mute"><LoaderCircle className="size-5 animate-spin" /></div>
                  ) : myRequests.length === 0 ? (
                    <div className="px-2 py-12 text-center text-[13px] text-txt-mute">
                      <MessageCircleQuestion className="mx-auto mb-2 size-6 opacity-50" />
                      You haven&apos;t raised any requests yet.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {myRequests.map((r) => (
                        <button key={r.id} onClick={() => openThread(r.id)} className="rounded-[10px] border px-3 py-2.5 text-left hover:border-primary">
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${r.status === "open" ? "bg-primary/15 text-primary" : "bg-ok/15 text-ok"}`}>{r.status}</span>
                            <span className="truncate text-[13.5px] font-semibold">{r.subject}</span>
                          </div>
                          <div className="mt-0.5 text-[11.5px] text-txt-mute">
                            {new Date(r.createdAt).toLocaleDateString()} · {r.category}
                            {r.replyCount ? ` · ${r.replyCount} repl${r.replyCount === 1 ? "y" : "ies"}` : ""}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* THREAD — the conversation on one request */}
              {view === "thread" && (
                !thread ? (
                  <div className="grid place-items-center py-16 text-txt-mute"><LoaderCircle className="size-5 animate-spin" /></div>
                ) : (
                  <div className="p-4">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${thread.request.status === "open" ? "bg-primary/15 text-primary" : "bg-ok/15 text-ok"}`}>{thread.request.status}</span>
                      <span className="text-[11.5px] text-txt-mute">{thread.request.category}</span>
                    </div>
                    <h2 className="mt-1.5 font-heading text-[15.5px] font-bold leading-snug">{thread.request.subject}</h2>
                    <div className="mt-3 rounded-[10px] bg-panel-2/50 px-3 py-2 text-[13px]">
                      <div className="mb-0.5 text-[11.5px] text-txt-mute">You · {new Date(thread.request.createdAt).toLocaleString()}</div>
                      <div className="whitespace-pre-wrap leading-relaxed">{thread.request.message}</div>
                    </div>
                    {thread.replies.map((r) => (
                      <div key={r.id} className={`mt-2 rounded-[10px] px-3 py-2 text-[13px] ${r.fromAdmin ? "border border-primary/25 bg-primary/8" : "bg-panel-2/50"}`}>
                        <div className="mb-0.5 text-[11.5px] text-txt-mute">{r.fromAdmin ? (r.authorName || "Support") : "You"} · {new Date(r.createdAt).toLocaleString()}</div>
                        <div className="whitespace-pre-wrap leading-relaxed">{r.body}</div>
                      </div>
                    ))}
                    <textarea value={threadReply} onChange={(e) => setThreadReply(e.target.value)} rows={3} maxLength={5000} placeholder="Add a message…" className="ed-input mt-3 text-[13px]" />
                    <button onClick={sendThreadReply} disabled={sending || !threadReply.trim()} className="mt-2 flex items-center gap-1.5 rounded-[10px] bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-orange-soft disabled:opacity-50">
                      <Send className="size-3.5" /> {sending ? "Sending…" : "Send"}
                    </button>
                  </div>
                )
              )}
            </div>

            {/* Footer: contact support CTA (hidden on the form/sent views) */}
            {(view === "list" || view === "article") && (
              <div className="flex gap-2 border-t p-3">
                <button
                  onClick={() => setView("support")}
                  className="flex flex-1 items-center justify-center gap-2 rounded-[10px] border bg-panel-2 px-3 py-2.5 text-[13px] font-semibold hover:border-primary"
                >
                  <MessageCircleQuestion className="size-4 text-primary" />
                  Contact support
                </button>
                <button
                  onClick={() => { setView("requests"); loadRequests(); }}
                  className="flex items-center justify-center gap-2 rounded-[10px] border bg-panel-2 px-3 py-2.5 text-[13px] font-semibold hover:border-primary"
                  title="Requests you've raised, and their status"
                >
                  <Inbox className="size-4 text-primary" />
                  My requests
                </button>
              </div>
            )}
          </aside>
        </>
      )}
    </>
  );
}
