"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LifeBuoy, X, Search, ChevronRight, ArrowLeft, Paperclip, Send, LoaderCircle, BookOpen, MessageCircleQuestion, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { getKbArticles, getKbArticle, submitSupport, type KbListItem, type KbArticleFull } from "@/lib/api";
import { searchArticles } from "@/lib/kb-search";

type View = "list" | "article" | "support" | "sent";
const CATEGORIES = ["Question", "Bug", "Feature request", "Billing", "Other"];

export function HelpButton() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("list");
  const [articles, setArticles] = useState<KbListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState<KbArticleFull | null>(null);
  const [articleLoading, setArticleLoading] = useState(false);

  // support form
  const [cat, setCat] = useState("Question");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setArticles(await getKbArticles());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open && articles.length === 0) load().catch(() => {});
  }, [open, articles.length, load]);

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
    setArticleLoading(true);
    setView("article");
    setCurrent(await getKbArticle(id));
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
              {(view === "article" || view === "support") && (
                <button onClick={() => setView("list")} className="grid size-8 place-items-center rounded-[8px] hover:bg-panel-2" aria-label="Back">
                  <ArrowLeft className="size-4" />
                </button>
              )}
              <div className="flex items-center gap-2 font-heading text-[15px] font-bold">
                <LifeBuoy className="size-4 text-primary" />
                {view === "support" ? "Contact support" : view === "sent" ? "Request sent" : view === "article" ? "Help article" : "Help & support"}
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
                  <p className="mt-1.5 max-w-[280px] text-[13px] text-txt-mute">Your request has been sent to our team. We'll reply to your email address. A confirmation is on its way to your inbox.</p>
                  <button onClick={() => setView("list")} className="mt-5 rounded-[10px] border bg-panel-2 px-4 py-2 text-[13px] font-semibold hover:border-primary">Back to help</button>
                </div>
              )}
            </div>

            {/* Footer: contact support CTA (hidden on the form/sent views) */}
            {(view === "list" || view === "article") && (
              <div className="border-t p-3">
                <button
                  onClick={() => setView("support")}
                  className="flex w-full items-center justify-center gap-2 rounded-[10px] border bg-panel-2 px-4 py-2.5 text-[13.5px] font-semibold hover:border-primary"
                >
                  <MessageCircleQuestion className="size-4 text-primary" />
                  Still need help? Contact support
                </button>
              </div>
            )}
          </aside>
        </>
      )}
    </>
  );
}
