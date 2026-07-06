"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CalendarClock } from "lucide-react";
import { isActiveBooking, type Booking } from "@/lib/api";

interface Bk { id: string; spaceLabel: string; start: string; buildingId: string; status: string }

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Bk[]>([]);

  const load = useCallback(async () => {
    const me = await (await fetch("/api/me", { cache: "no-store" })).json().catch(() => null);
    if (!me?.email) return;
    const bk: Bk[] = await (await fetch(`/api/bookings?user=${encodeURIComponent(me.email)}`, { cache: "no-store" })).json().catch(() => []);
    const now = new Date().toISOString().slice(0, 16);
    // upcoming = active (not cancelled/declined/ended) and starting in the future
    setItems(bk.filter((b) => isActiveBooking(b as Booking) && b.start >= now).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 8));
  }, []);

  useEffect(() => {
    load().catch(() => {});
    // Re-fetch whenever a booking changes (create/cancel/check-in) or the tab regains focus,
    // so the badge + list never go stale after an action elsewhere in the app.
    const onChange = () => load().catch(() => {});
    window.addEventListener("bookings:changed", onChange);
    window.addEventListener("focus", onChange);
    return () => {
      window.removeEventListener("bookings:changed", onChange);
      window.removeEventListener("focus", onChange);
    };
  }, [load]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => { if (!o) load().catch(() => {}); return !o; })}
        title="Notifications"
        aria-label={`Notifications${items.length ? ` — ${items.length} upcoming` : ""}`}
        className="relative grid size-9 place-items-center rounded-[9px] border bg-panel-2 text-txt-dim hover:text-foreground"
      >
        <Bell className="size-4" />
        {items.length > 0 && (
          <span className="absolute -right-1 -top-1 grid min-w-[16px] place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-[16px] text-primary-foreground">
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="pop-in absolute right-0 top-11 z-50 w-[300px] overflow-hidden rounded-[12px] border bg-card shadow-xl">
            <div className="border-b px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Upcoming bookings</div>
            {items.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12.5px] text-txt-mute">No upcoming bookings.</div>
            ) : (
              <ul className="max-h-[320px] overflow-auto">
                {items.map((b) => (
                  <li key={b.id} className="flex items-start gap-2.5 border-b px-4 py-2.5 last:border-b-0">
                    <CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold">{b.spaceLabel}</div>
                      <div className="text-[11.5px] text-txt-mute">{b.start.replace("T", " ")} · {b.status}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/mine" onClick={() => setOpen(false)} className="block border-t px-4 py-2.5 text-center text-[12.5px] font-semibold text-primary hover:bg-panel-2">
              View all bookings
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
