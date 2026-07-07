"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, LayoutGrid, DoorClosed, Users, Car, UserCheck, type LucideIcon } from "lucide-react";
import { getPresence, type PresenceEntry } from "@/lib/api";
import { getBuildingsMeta } from "@/lib/plan-store";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";

const KIND: Record<string, { label: string; icon: LucideIcon }> = {
  desk: { label: "Desk", icon: LayoutGrid },
  office: { label: "Office", icon: DoorClosed },
  room: { label: "Meeting room", icon: Users },
  parking: { label: "Parking", icon: Car },
};

// Local calendar date (YYYY-MM-DD), and DST-safe day arithmetic on the date components.
function todayLocal(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function shiftDay(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86400000).toISOString().slice(0, 10);
}
function prettyDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
const timeRange = (start: string, end: string) => {
  const sameDay = start.slice(0, 10) === end.slice(0, 10);
  return sameDay ? `${start.slice(11)}–${end.slice(11)}` : `${start.slice(5, 10)} → ${end.slice(5, 10)}`;
};

export default function TeamPage() {
  const [date, setDate] = useState(todayLocal());
  const [entries, setEntries] = useState<PresenceEntry[]>([]);
  const [mySites, setMySites] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [site, setSite] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBuildingsMeta().then((m) => setNames(Object.fromEntries(m.custom.map((c) => [c.id, c.name]))));
  }, []);

  useEffect(() => {
    let live = true;
    setLoading(true);
    getPresence(date).then((p) => {
      if (!live) return;
      setEntries(p.entries);
      setMySites(p.mySites);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [date]);

  const rootId = (id: string) => id.split("__")[0];
  const bName = (id: string) => names[id] ?? names[rootId(id)] ?? rootId(id);

  // Buildings that have someone in today (root ids), ordered with the user's own sites first.
  const buildings = useMemo(() => {
    const ids = [...new Set(entries.map((e) => rootId(e.buildingId)))];
    return ids.sort((a, b) => {
      const am = mySites.includes(a) ? 0 : 1;
      const bm = mySites.includes(b) ? 0 : 1;
      return am - bm || bName(a).localeCompare(bName(b));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, mySites, names]);

  const shown = useMemo(() => (site === "all" ? entries : entries.filter((e) => rootId(e.buildingId) === site)), [entries, site]);
  const grouped = useMemo(() => {
    const g = new Map<string, PresenceEntry[]>();
    for (const e of shown) {
      const k = rootId(e.buildingId);
      (g.get(k) ?? g.set(k, []).get(k)!).push(e);
    }
    return [...g.entries()].sort((a, b) => buildings.indexOf(a[0]) - buildings.indexOf(b[0]));
  }, [shown, buildings]);

  const total = shown.length;
  const checkedIn = shown.filter((e) => e.checkedIn).length;
  const isToday = date === todayLocal();

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Who's in"
        subtitle="See who from your workspace is booked or checked in — pick a day to plan around your team."
        action={
          <div className="flex items-center gap-1 rounded-[10px] border bg-card p-1">
            <button aria-label="Previous day" onClick={() => setDate((d) => shiftDay(d, -1))} className="grid size-9 place-items-center rounded-lg hover:bg-panel-2">
              <ChevronLeft className="size-4" />
            </button>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayLocal())} className="ed-input !w-auto border-0 bg-transparent px-1 text-[13px] font-semibold" />
            <button aria-label="Next day" onClick={() => setDate((d) => shiftDay(d, 1))} className="grid size-9 place-items-center rounded-lg hover:bg-panel-2">
              <ChevronRight className="size-4" />
            </button>
          </div>
        }
      />

      {/* Summary */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-[15px] font-bold">{prettyDate(date)}{isToday && <span className="ml-2 text-[12px] font-semibold text-primary">Today</span>}</span>
        <span className="ml-auto flex items-center gap-2 text-[13px] text-txt-dim">
          <UserCheck className="size-4 text-ok" /> <b className="text-ok">{checkedIn}</b> checked in
          <span className="text-txt-mute">·</span>
          <b>{total}</b> {total === 1 ? "person" : "people"} in
        </span>
      </div>

      {/* Site filter */}
      {buildings.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {["all", ...buildings].map((id) => {
            const active = site === id;
            const label = id === "all" ? "All sites" : bName(id);
            return (
              <button
                key={id}
                onClick={() => setSite(id)}
                className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary"}`}
              >
                {label}
                {id !== "all" && mySites.includes(id) && <span className={`ml-1.5 ${active ? "opacity-80" : "text-primary"}`}>• your site</span>}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="rounded-[14px] border bg-card px-3 py-14 text-center text-txt-mute">Loading…</div>
      ) : total === 0 ? (
        <div className="rounded-[14px] border bg-card px-3 py-14 text-center text-txt-mute">
          Nobody is booked {isToday ? "today" : "on this day"} yet. <Link href="/book" className="font-semibold text-primary">Book a space</Link>.
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {grouped.map(([bid, people]) => (
            <section key={bid} className="overflow-hidden rounded-[14px] border bg-card shadow-sm">
              <header className="flex items-center justify-between gap-3 border-b bg-panel-2/60 px-4 py-3">
                <h2 className="font-heading text-[15px] font-bold">
                  {bName(bid)}
                  {mySites.includes(bid) && <span className="ml-2 rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-bold text-primary">Your site</span>}
                </h2>
                <span className="text-[12px] text-txt-mute">{people.filter((p) => p.checkedIn).length} in · {people.length} booked</span>
              </header>
              <ul className="divide-y">
                {people.map((p, i) => {
                  const k = KIND[p.kind] ?? KIND.desk;
                  const Icon = k.icon;
                  return (
                    <li key={`${p.spaceKey}-${p.start}-${i}`} className={`flex items-center gap-3 px-4 py-3 ${p.isMe ? "bg-primary/5" : ""}`}>
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-panel-2 text-txt-dim"><Icon className="size-[18px]" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold">{p.name}</span>
                          {p.isMe && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">You</span>}
                        </div>
                        <div className="truncate text-[12.5px] text-txt-mute">{p.spaceLabel} · {k.label} · {timeRange(p.start, p.end)}</div>
                      </div>
                      {p.checkedIn ? <StatusPill variant="ok">Checked in</StatusPill> : <StatusPill variant="soon">Booked</StatusPill>}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="mt-5 text-[12px] text-txt-mute">
        Only people in your workspace are shown. Names and where they're sitting are visible to colleagues; contact details are not.
      </p>
    </div>
  );
}
