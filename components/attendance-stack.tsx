"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Avatar } from "./avatar";
import type { AttendanceBooking, AttendancePerson } from "@/lib/attendance";

const KIND: Record<string, string> = { desk: "Desk", office: "Office", room: "Meeting room", parking: "Parking" };
const timeRange = (b: AttendanceBooking) =>
  b.start.slice(0, 10) === b.end.slice(0, 10) ? `${b.start.slice(11)}–${b.end.slice(11)}` : `${b.start.slice(5, 10)} → ${b.end.slice(5, 10)}`;
const line = (b: AttendanceBooking) => `${KIND[b.kind] ?? b.kind} · ${b.space} · ${timeRange(b)}${b.checkedIn ? " · checked in" : ""}`;

/**
 * "Who's coming in" cluster for the booking map: overlapping avatars for everyone with an active
 * booking at the site on the selected date, a +N overflow and a count. Hover a face for that
 * person's bookings; click the cluster for the full list. Pure presentation — it renders whatever
 * `people` it is given (the /api/presence feed via groupAttendance), so the server's privacy rules
 * (feature flag, opt-out, no emails for non-admins) are already applied upstream.
 */
export function AttendanceStack({ people, siteName }: { people: AttendancePerson[]; siteName?: string }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close the list on an outside click or Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!people.length) return null;

  const MAX = 5;
  const shown = people.slice(0, MAX);
  const extra = people.length - shown.length;
  const label = `${people.length} coming in${siteName ? ` to ${siteName}` : ""}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${label} — show list`}
        className="flex items-center gap-2 rounded-full border bg-panel-2 py-1 pl-1 pr-2.5 hover:border-primary"
      >
        <span className="flex items-center">
          {shown.map((p, i) => (
            <span
              key={p.key}
              className="relative -ml-2 first:ml-0"
              style={{ zIndex: MAX - i }}
              onMouseEnter={() => setHover(p.key)}
              onMouseLeave={() => setHover(null)}
            >
              <Avatar name={p.name} photo={p.photo} size={28} className="ring-2 ring-card" />
              {hover === p.key && !open && (
                <span className="pointer-events-none absolute left-0 top-[calc(100%+8px)] z-30 block w-56 rounded-[12px] border bg-card p-3 text-left shadow-xl">
                  <span className="block truncate text-[13px] font-bold">{p.name}{p.isMe ? " (you)" : ""}</span>
                  {p.bookings.map((b, j) => (
                    <span key={j} className="mt-1 block text-[11.5px] text-txt-mute">{line(b)}</span>
                  ))}
                </span>
              )}
            </span>
          ))}
          {extra > 0 && (
            <span className="-ml-2 grid size-7 place-items-center rounded-full border-2 border-card bg-panel-2 text-[11px] font-bold text-txt-dim" style={{ zIndex: 0 }}>
              +{extra}
            </span>
          )}
        </span>
        <span className="whitespace-nowrap text-[12px] font-semibold text-txt-dim">{people.length} in</span>
      </button>

      {open && (
        <div role="dialog" aria-label={label} className="absolute right-0 top-[calc(100%+8px)] z-40 max-h-[60vh] w-72 overflow-auto rounded-[14px] border bg-card p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <b className="text-[13.5px]">{label}</b>
            <button onClick={() => setOpen(false)} aria-label="Close" className="grid size-7 place-items-center rounded-lg text-txt-mute hover:bg-panel-2 hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {people.map((p) => (
              <div key={p.key} className="flex items-start gap-2.5 rounded-xl border bg-panel-2 px-2.5 py-2">
                <Avatar name={p.name} photo={p.photo} size={32} />
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-[12.5px] font-semibold">{p.name}{p.isMe ? " (you)" : ""}</div>
                  {p.bookings.map((b, j) => (
                    <div key={j} className="truncate text-[11px] text-txt-mute">{line(b)}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
