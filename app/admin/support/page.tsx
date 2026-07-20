"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { LifeBuoy, Paperclip, X, LoaderCircle, CircleDot, CheckCircle2, AlertTriangle, Send } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getSupportQueue, updateSupportRequestApi, getSupportThread, postSupportReply, type SupportRequestRow, type SupportReplyRow } from "@/lib/api";

type Filter = "open" | "closed" | "all";

const PRIORITY_STYLE: Record<string, string> = {
  high: "text-destructive",
  normal: "text-txt-mute",
  low: "text-txt-mute",
};

function rel(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function SupportQueuePage() {
  const [filter, setFilter] = useState<Filter>("open");
  const [rows, setRows] = useState<(SupportRequestRow & { unread?: boolean })[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SupportRequestRow | null>(null);

  const load = useCallback(async (f: Filter) => {
    setLoading(true);
    const { requests, openCount } = await getSupportQueue(f === "all" ? undefined : f);
    setRows(requests);
    setOpenCount(openCount);
    setLoading(false);
  }, []);

  useEffect(() => { load(filter).catch(() => {}); }, [filter, load]);

  async function patch(id: string, p: { status?: string; priority?: string; adminNote?: string | null }) {
    const res = await updateSupportRequestApi(id, p);
    if (res.ok && res.request) {
      setSelected(res.request);
      setRows((rs) => rs.map((r) => (r.id === id ? res.request! : r)));
      load(filter);
      toast.success("Updated");
    } else toast.error("Could not update", { description: res.error });
  }

  return (
    <div className="animate-fade-up max-w-3xl">
      <PageHeader title="Support requests" subtitle="Requests raised by your people. Reply here — they see it in Support and get an email." />

      <div className="mb-4 inline-flex rounded-[10px] border bg-panel-2 p-1 text-[13px]">
        {(["open", "closed", "all"] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-[8px] px-3.5 py-1.5 font-semibold capitalize ${filter === f ? "bg-card shadow-sm" : "text-txt-mute"}`}>
            {f}{f === "open" && openCount > 0 ? ` (${openCount})` : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid place-items-center py-16 text-txt-mute"><LoaderCircle className="size-5 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-[14px] border border-dashed bg-card p-10 text-center">
          <LifeBuoy className="mx-auto mb-2 size-7 text-txt-mute" />
          <div className="text-[14px] font-semibold">Nothing here</div>
          <p className="mt-1 text-[13px] text-txt-mute">{filter === "open" ? "No open requests — you're all caught up." : "No requests to show."}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <button key={r.id} onClick={() => setSelected(r)} className="flex items-center gap-3 rounded-[12px] border bg-card px-4 py-3 text-left hover:border-primary">
              {r.status === "open" ? <CircleDot className="size-4 shrink-0 text-primary" /> : <CheckCircle2 className="size-4 shrink-0 text-ok" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[14px] font-semibold">{r.subject}</span>
                  {/* The customer has written since we last opened it — this one is waiting on US. */}
                  {r.unread && <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">Awaiting reply</span>}
                  {r.priority === "high" && <AlertTriangle className="size-3.5 shrink-0 text-destructive" />}
                  {r.attachmentName && <Paperclip className="size-3.5 shrink-0 text-txt-mute" />}
                </div>
                <div className="mt-0.5 truncate text-[12px] text-txt-mute">{r.category} · {r.userName || r.userEmail} · {rel(r.createdAt)}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && <Detail row={selected} onClose={() => setSelected(null)} onPatch={patch} />}
    </div>
  );
}

function Detail({ row, onClose, onPatch }: { row: SupportRequestRow; onClose: () => void; onPatch: (id: string, p: { status?: string; priority?: string; adminNote?: string | null }) => void }) {
  const [note, setNote] = useState(row.adminNote ?? "");
  const [replies, setReplies] = useState<SupportReplyRow[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [replyFile, setReplyFile] = useState<File | null>(null);

  const loadThread = useCallback(async () => {
    const t = await getSupportThread(row.id);
    if (t) setReplies(t.replies);
  }, [row.id]);
  useEffect(() => { loadThread().catch(() => {}); }, [loadThread]);

  async function send() {
    if (!reply.trim()) return;
    setSending(true);
    const res = await postSupportReply(row.id, reply.trim(), replyFile);
    setSending(false);
    if (res.ok) {
      setReply("");
      setReplyFile(null);
      loadThread();
      toast.success("Reply sent", { description: `Emailed to ${row.userEmail}` });
    } else toast.error("Could not send", { description: res.error });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-[14px] border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-2 border-b px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${row.status === "open" ? "bg-primary/15 text-primary" : "bg-ok/15 text-ok"}`}>{row.status}</span>
              <span className="text-[12px] text-txt-mute">{row.category}</span>
            </div>
            <h2 className="mt-1.5 font-heading text-[16px] font-bold leading-snug">{row.subject}</h2>
            <div className="mt-1 text-[12px] text-txt-mute">From {row.userName ? `${row.userName} · ` : ""}<a href={`mailto:${row.userEmail}`} className="text-primary hover:underline">{row.userEmail}</a> · {new Date(row.createdAt).toLocaleString()}</div>
          </div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-[8px] hover:bg-panel-2" aria-label="Close"><X className="size-4" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <div className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-txt-dim">{row.message}</div>

          {row.attachmentName && (
            <a href={`/api/support/${row.id}/attachment`} className="mt-4 inline-flex items-center gap-2 rounded-[10px] border bg-panel-2 px-3 py-2 text-[13px] font-semibold hover:border-primary" download>
              <Paperclip className="size-4 text-primary" />
              <span className="truncate">{row.attachmentName}</span>
              {row.attachmentSize ? <span className="text-txt-mute">· {(row.attachmentSize / 1024).toFixed(0)} KB</span> : null}
            </a>
          )}

          {/* Conversation — the requester sees these in their Help panel and by email. */}
          <div className="mt-5 border-t pt-4">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Conversation</span>
            {replies.length === 0 ? (
              <p className="text-[12.5px] text-txt-mute">No replies yet. Your reply is emailed to the requester and shown in their Help panel.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {replies.map((r) => (
                  <div key={r.id} className={`rounded-[10px] border px-3 py-2 text-[13px] ${r.fromAdmin ? "bg-primary/8 border-primary/25" : "bg-panel-2/50"}`}>
                    <div className="mb-0.5 text-[11.5px] text-txt-mute">{r.fromAdmin ? (r.authorName || "Support") : (r.authorName || r.authorEmail)} · {new Date(r.createdAt).toLocaleString()}</div>
                    <div className="whitespace-pre-wrap leading-relaxed">{r.body}</div>
                    {r.attachmentName && (
                      <a href={`/api/support/${row.id}/attachment?reply=${r.id}`} download className="mt-1.5 inline-flex items-center gap-1.5 rounded-[8px] border bg-card px-2.5 py-1 text-[12px] font-semibold hover:border-primary">
                        <Paperclip className="size-3 text-primary" /> {r.attachmentName}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} maxLength={5000} placeholder={`Reply to ${row.userName || row.userEmail}…`} className="ed-input mt-2 text-[13px]" />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button onClick={send} disabled={sending || !reply.trim()} className="flex items-center gap-1.5 rounded-[10px] bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-orange-soft disabled:opacity-50">
                <Send className="size-3.5" /> {sending ? "Sending…" : "Send reply"}
              </button>
              <label className="flex cursor-pointer items-center gap-1.5 rounded-[10px] border px-3 py-2 text-[12.5px] font-semibold text-txt-dim hover:border-primary hover:text-foreground">
                <Paperclip className="size-3.5" />
                {replyFile ? `${replyFile.name} · ${(replyFile.size / 1024).toFixed(0)} KB` : "Attach a file"}
                <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain" onChange={(e) => setReplyFile(e.target.files?.[0] ?? null)} className="hidden" />
              </label>
              {replyFile && <button onClick={() => setReplyFile(null)} className="text-[12px] text-txt-mute hover:text-destructive">Remove</button>}
            </div>
          </div>

          <div className="mt-5 border-t pt-4">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Priority</span>
            <div className="inline-flex rounded-[9px] border bg-panel-2 p-0.5 text-[12.5px]">
              {(["low", "normal", "high"] as const).map((p) => (
                <button key={p} onClick={() => onPatch(row.id, { priority: p })} className={`rounded-[7px] px-3 py-1 font-semibold capitalize ${row.priority === p ? "bg-card shadow-sm" : "text-txt-mute"} ${p === "high" ? PRIORITY_STYLE.high : ""}`}>{p}</button>
              ))}
            </div>
          </div>

          <label className="mt-4 block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Internal note</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (row.adminNote ?? "") && onPatch(row.id, { adminNote: note })} rows={3} maxLength={2000} className="ed-input text-[13px]" placeholder="Private note for your team (not sent to the requester)" />
          </label>
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
          <a href={`mailto:${row.userEmail}?subject=${encodeURIComponent("Re: " + row.subject)}`} className="rounded-[10px] border bg-panel-2 px-4 py-2 text-[13px] font-semibold hover:border-primary">Reply by email</a>
          {row.status === "open" ? (
            <button onClick={() => onPatch(row.id, { status: "closed" })} className="rounded-[10px] bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-orange-soft">Mark as closed</button>
          ) : (
            <button onClick={() => onPatch(row.id, { status: "open" })} className="rounded-[10px] border bg-panel-2 px-4 py-2 text-[13px] font-semibold hover:border-primary">Reopen</button>
          )}
        </div>
      </div>
    </div>
  );
}
