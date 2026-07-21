"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Sparkles, X, Send, CalendarCheck } from "lucide-react";
import { assistantConfigured, askAssistant, createBookingApi, notifyBookingsChanged, type BookingProposal } from "@/lib/api";
import { deriveTimes, type DurationType, type Kind } from "@/lib/booking-rules";

interface Msg {
  role: "user" | "assistant";
  content: string;
  proposal?: BookingProposal;
  booked?: boolean;
}

const SUGGESTIONS = ["Book me a desk tomorrow", "Who's in on Friday?", "Find a meeting room for 4 this afternoon", "What are my bookings?"];

export function AssistantWidget() {
  const [available, setAvailable] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", content: "Hi, I'm Hubbi 👋 I can find and book spaces, or tell you who's in. What do you need?" }]);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Show only when configured AND not disabled for this tenant.
    Promise.all([assistantConfigured(), fetch("/api/me").then((r) => (r.ok ? r.json() : null)).catch(() => null)]).then(([cfg, me]) => {
      const disabled = (me?.disabledFeatures ?? []).includes("assistant");
      setAvailable(cfg.configured && !disabled);
      setProvider(cfg.provider);
    });
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs, open]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    const history = next.filter((m) => !m.booked).map((m) => ({ role: m.role, content: m.content }));
    const res = await askAssistant(history);
    setBusy(false);
    if (res.error) {
      setMsgs((m) => [...m, { role: "assistant", content: res.error! }]);
      return;
    }
    setMsgs((m) => [...m, { role: "assistant", content: res.reply, proposal: res.proposal }]);
  }

  async function confirm(idx: number, p: BookingProposal) {
    const { start, end } = deriveTimes({
      kind: p.kind as Kind,
      duration: p.durationType as DurationType,
      startDate: p.date,
      startTime: p.startTime,
      endTime: p.endTime,
      half: "am",
    });
    const res = await createBookingApi({ buildingId: p.buildingId, spaceKey: p.spaceKey, spaceLabel: p.spaceLabel, kind: p.kind, durationType: p.durationType, start, end });
    if (res.ok) {
      notifyBookingsChanged();
      toast.success("Booked", { description: `${p.spaceLabel} · ${p.date}` });
      setMsgs((m) => m.map((mm, i) => (i === idx ? { ...mm, booked: true } : mm)));
      setMsgs((m) => [...m, { role: "assistant", content: `Done — ${p.spaceLabel} is booked for ${p.date}. Anything else?` }]);
    } else {
      toast.error("Couldn't book", { description: res.error });
      setMsgs((m) => [...m, { role: "assistant", content: `I couldn't book that: ${res.error}` }]);
    }
  }

  if (!available) return null;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open Hubbi, the booking assistant"
          className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-[13.5px] font-bold text-primary-foreground shadow-lg hover:bg-orange-soft md:bottom-5 md:right-5"
        >
          <Sparkles className="size-4" /> Ask Hubbi
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-50 flex h-[540px] max-h-[85vh] w-[380px] max-w-[92vw] flex-col overflow-hidden rounded-[16px] border bg-card shadow-2xl">
          <header className="flex items-center gap-2 border-b bg-primary/[0.06] px-4 py-3">
            <Sparkles className="size-4 text-primary" />
            <div className="flex-1 text-[14px] font-bold">Hubbi</div>
            <button aria-label="Close" onClick={() => setOpen(false)} className="grid size-7 place-items-center rounded-lg text-txt-mute hover:bg-panel-2"><X className="size-4" /></button>
          </header>

          <div ref={scroller} className="flex-1 space-y-3 overflow-auto px-3.5 py-3.5">
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[85%] rounded-[13px] px-3 py-2 text-[13px] leading-relaxed ${m.role === "user" ? "bg-primary text-primary-foreground" : "border bg-panel-2"}`}>
                  <div className="whitespace-pre-wrap">{m.content}</div>
                  {m.proposal && !m.booked && (
                    <div className="mt-2 rounded-[10px] border bg-card p-2.5">
                      <div className="text-[12.5px] font-semibold">{m.proposal.spaceLabel}</div>
                      <div className="text-[11.5px] text-txt-mute">{m.proposal.kind} · {m.proposal.date} · {m.proposal.durationType === "full" ? "full day" : m.proposal.durationType === "half" ? "half day" : `${m.proposal.startTime}–${m.proposal.endTime}`}</div>
                      <button onClick={() => confirm(i, m.proposal!)} className="mt-2 inline-flex items-center gap-1.5 rounded-[9px] bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground hover:bg-orange-soft">
                        <CalendarCheck className="size-3.5" /> Confirm booking
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && <div className="flex justify-start"><div className="rounded-[13px] border bg-panel-2 px-3 py-2 text-[13px] text-txt-mute">Thinking…</div></div>}
            {msgs.length <= 1 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-full border bg-card px-2.5 py-1 text-[11.5px] hover:border-primary">{s}</button>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="flex items-center gap-2 border-t p-2.5"
          >
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask Hubbi to book, or who's in…" disabled={busy} className="ed-input flex-1 text-[13px]" />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary text-primary-foreground hover:bg-orange-soft disabled:opacity-50">
              <Send className="size-4" />
            </button>
          </form>
          {/* Data-processing disclosure (M8): name where conversations are processed. */}
          <p className="border-t px-3 py-1.5 text-center text-[10.5px] leading-tight text-txt-mute">
            Messages are sent to {provider ?? "an AI provider"} to generate replies. Hubbi only suggests bookings — you confirm each one.
          </p>
        </div>
      )}
    </>
  );
}
