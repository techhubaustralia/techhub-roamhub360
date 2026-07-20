"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { LifeBuoy, Plus, Paperclip, Send, LoaderCircle, CircleDot, CheckCircle2, ArrowLeft, MessageCircleQuestion } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import {
  getMySupportRequests,
  getSupportThread,
  postSupportReply,
  submitSupport,
  type SupportRequestRow,
  type SupportReplyRow,
} from "@/lib/api";

// Support Centre — the full experience for everyone (not just admins): raise a request, track its
// status, and hold a conversation. The Help slide-over is the quick entry point; this is the home
// for anything you've raised.
const CATEGORIES = ["Question", "Bug", "Feature request", "Billing", "Other"];

type View = "list" | "new" | "thread";

export default function SupportPage() {
  const [view, setView] = useState<View>("list");
  const [rows, setRows] = useState<(SupportRequestRow & { replyCount?: number })[]>([]);
  const [loading, setLoading] = useState(true);

  // new request
  const [cat, setCat] = useState("Question");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  // thread
  const [thread, setThread] = useState<{ request: SupportRequestRow; replies: SupportReplyRow[] } | null>(null);
  const [reply, setReply] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setRows(await getMySupportRequests());
    setLoading(false);
  }, []);
  useEffect(() => { load().catch(() => {}); }, [load]);

  async function create(e: React.FormEvent) {
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
    if (!res.ok) return toast.error("Couldn't send", { description: res.error });
    setCat("Question"); setSubject(""); setMessage(""); setFile(null);
    toast.success("Request sent", { description: "We'll reply by email and here." });
    setView("list");
    load();
  }

  async function open(id: string) {
    setView("thread");
    setThread(null);
    setThread(await getSupportThread(id));
  }

  async function send() {
    const body = reply.trim();
    if (!body || !thread) return;
    setSending(true);
    const res = await postSupportReply(thread.request.id, body);
    setSending(false);
    if (res.ok) {
      setReply("");
      setThread(await getSupportThread(thread.request.id));
      load();
    } else toast.error("Couldn't send", { description: res.error });
  }

  // ---- New request -------------------------------------------------------------------------------
  if (view === "new") {
    return (
      <div className="animate-fade-up max-w-2xl">
        <PageHeader title="New support request" subtitle="Tell us what's going on. You can attach a screenshot." />
        <form onSubmit={create} className="flex flex-col gap-4 rounded-[14px] border bg-card p-5 shadow-sm">
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
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={7} maxLength={5000} placeholder="Describe the issue or question…" className="ed-input text-[13.5px]" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Attachment (optional)</span>
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[13px] text-txt-dim" />
            {file && <span className="mt-1 block text-[11.5px] text-txt-mute"><Paperclip className="mr-1 inline size-3" />{file.name} · {(file.size / 1024).toFixed(0)} KB</span>}
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={sending} className="flex items-center gap-2 rounded-[10px] bg-primary px-4 py-2.5 text-[13.5px] font-semibold text-primary-foreground hover:bg-orange-soft disabled:opacity-50">
              {sending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />} {sending ? "Sending…" : "Send request"}
            </button>
            <button type="button" onClick={() => setView("list")} className="rounded-[10px] border bg-panel-2 px-4 py-2.5 text-[13.5px] font-semibold hover:border-primary">Cancel</button>
          </div>
        </form>
      </div>
    );
  }

  // ---- One request -------------------------------------------------------------------------------
  if (view === "thread") {
    return (
      <div className="animate-fade-up max-w-2xl">
        <button onClick={() => { setView("list"); load(); }} className="mb-3 flex items-center gap-1.5 text-[13px] font-semibold text-txt-dim hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to my requests
        </button>
        {!thread ? (
          <div className="grid place-items-center py-16 text-txt-mute"><LoaderCircle className="size-5 animate-spin" /></div>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2">
              <StatusPill status={thread.request.status} />
              <span className="text-[12px] text-txt-mute">{thread.request.category} · raised {new Date(thread.request.createdAt).toLocaleString()}</span>
            </div>
            <h1 className="font-heading text-[20px] font-bold leading-snug">{thread.request.subject}</h1>

            <div className="mt-4 flex flex-col gap-2">
              <Bubble who="You" when={thread.request.createdAt} body={thread.request.message} mine />
              {thread.request.attachmentName && (
                <div className="text-[12px] text-txt-mute"><Paperclip className="mr-1 inline size-3" />{thread.request.attachmentName}</div>
              )}
              {thread.replies.map((r) => (
                <Bubble key={r.id} who={r.fromAdmin ? (r.authorName || "Support") : "You"} when={r.createdAt} body={r.body} mine={!r.fromAdmin} />
              ))}
            </div>

            <div className="mt-4 rounded-[14px] border bg-card p-4 shadow-sm">
              <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} maxLength={5000} placeholder="Add a message…" className="ed-input text-[13.5px]" />
              <button onClick={send} disabled={sending || !reply.trim()} className="mt-2 flex items-center gap-2 rounded-[10px] bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-orange-soft disabled:opacity-50">
                <Send className="size-3.5" /> {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ---- My requests -------------------------------------------------------------------------------
  return (
    <div className="animate-fade-up max-w-2xl">
      <PageHeader
        title="Support"
        subtitle="Raise a request and follow it here — you'll also get replies by email."
        action={
          <button onClick={() => setView("new")} className="flex items-center gap-1.5 rounded-[10px] bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-orange-soft">
            <Plus className="size-4" /> New request
          </button>
        }
      />

      {loading ? (
        <div className="grid place-items-center py-16 text-txt-mute"><LoaderCircle className="size-5 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-[14px] border border-dashed bg-card p-10 text-center">
          <LifeBuoy className="mx-auto mb-2 size-7 text-txt-mute" />
          <div className="text-[14px] font-semibold">No requests yet</div>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-txt-mute">Stuck on something? Check the Help button first — there are {""}built-in guides — or raise a request and we&apos;ll get back to you.</p>
          <button onClick={() => setView("new")} className="mt-4 rounded-[10px] bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-orange-soft">New request</button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <button key={r.id} onClick={() => open(r.id)} className="flex items-center gap-3 rounded-[12px] border bg-card px-4 py-3 text-left hover:border-primary">
              <StatusIcon status={r.status} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold">{r.subject}</div>
                <div className="mt-0.5 text-[12px] text-txt-mute">
                  {r.category} · {new Date(r.createdAt).toLocaleDateString()}
                  {r.replyCount ? ` · ${r.replyCount} repl${r.replyCount === 1 ? "y" : "ies"}` : " · no reply yet"}
                </div>
              </div>
              <StatusPill status={r.status} />
            </button>
          ))}
        </div>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-[12.5px] text-txt-mute">
        <MessageCircleQuestion className="size-4" /> Looking for how-to guides? Open the Help (life-buoy) button in the top bar.
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const open = status === "open";
  return <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${open ? "bg-primary/15 text-primary" : "bg-ok/15 text-ok"}`}>{open ? "Open" : "Closed"}</span>;
}
function StatusIcon({ status }: { status: string }) {
  return status === "open" ? <CircleDot className="size-4 shrink-0 text-primary" /> : <CheckCircle2 className="size-4 shrink-0 text-ok" />;
}
function Bubble({ who, when, body, mine }: { who: string; when: string; body: string; mine?: boolean }) {
  return (
    <div className={`rounded-[12px] px-3.5 py-2.5 text-[13.5px] ${mine ? "bg-panel-2/60" : "border border-primary/25 bg-primary/8"}`}>
      <div className="mb-0.5 text-[11.5px] text-txt-mute">{who} · {new Date(when).toLocaleString()}</div>
      <div className="whitespace-pre-wrap leading-relaxed">{body}</div>
    </div>
  );
}
