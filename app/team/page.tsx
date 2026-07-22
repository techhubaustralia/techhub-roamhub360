"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, LayoutGrid, DoorClosed, Users, Car, UserCheck, Lightbulb, type LucideIcon } from "lucide-react";
import { getPresence, getPresenceInsights, type PresenceEntry, type PresenceInsights } from "@/lib/api";
import { getBuildingsMeta } from "@/lib/plan-store";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";

const KIND: Record<string, { label: string; icon: LucideIcon }> = {
  desk: { label: "Desk", icon: LayoutGrid },
  office: { label: "Office", icon: DoorClosed },
  room: { label: "Meeting room", icon: Users },
  parking: { label: "Parking", icon: Car },
};
const NO_DEPT = "No department";

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
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

function Avatar({ name, photo }: { name: string; photo?: string }) {
  if (photo) return <img src={photo} alt="" className="size-9 shrink-0 rounded-full object-cover" />;
  return <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/12 text-[12px] font-bold text-primary">{initials(name)}</span>;
}

export default function TeamPage() {
  const [date, setDate] = useState(todayLocal());
  const [entries, setEntries] = useState<PresenceEntry[]>([]);
  const [mySites, setMySites] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [site, setSite] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<"site" | "dept">("site");
  const [insights, setInsights] = useState<PresenceInsights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBuildingsMeta().then((m) => setNames(Object.fromEntries(m.custom.map((c) => [c.id, c.name]))));
  }, []);

  // Team patterns recompute when the site filter changes (analytics are site-scoped).
  useEffect(() => {
    let live = true;
    getPresenceInsights(site).then((i) => live && setInsights(i));
    return () => {
      live = false;
    };
  }, [site]);

  // Real-time: refresh the board when anyone in the workspace books/cancels/checks in (SSE).
  useEffect(() => {
    const onChange = () => getPresence(date).then((p) => { setEntries(p.entries); setMySites(p.mySites); });
    window.addEventListener("bookings:changed", onChange);
    return () => window.removeEventListener("bookings:changed", onChange);
  }, [date]);

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

  const hasDepartments = useMemo(() => entries.some((e) => e.department), [entries]);
  const shown = useMemo(() => (site === "all" ? entries : entries.filter((e) => rootId(e.buildingId) === site)), [entries, site]);

  // Group by the chosen axis: physical site, or Entra department (once the directory is synced).
  const grouped = useMemo(() => {
    const byDept = groupBy === "dept" && hasDepartments;
    const g = new Map<string, PresenceEntry[]>();
    for (const e of shown) {
      const k = byDept ? e.department || NO_DEPT : rootId(e.buildingId);
      (g.get(k) ?? g.set(k, []).get(k)!).push(e);
    }
    const sections = [...g.entries()].map(([key, people]) => ({
      key,
      label: byDept ? key : bName(key),
      isMySite: !byDept && mySites.includes(key),
      people,
    }));
    sections.sort((a, b) =>
      byDept
        ? (a.key === NO_DEPT ? 1 : 0) - (b.key === NO_DEPT ? 1 : 0) || a.label.localeCompare(b.label)
        : buildings.indexOf(a.key) - buildings.indexOf(b.key),
    );
    return sections;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, groupBy, hasDepartments, buildings, mySites, names]);

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
            <button aria-label="Previous day" onClick={() => setDate((d) => shiftDay(d, -1))} className="grid size-11 place-items-center rounded-lg hover:bg-panel-2 md:size-9">
              <ChevronLeft className="size-4" />
            </button>
            <input type="date" aria-label="Select date" value={date} onChange={(e) => setDate(e.target.value || todayLocal())} className="ed-input !w-auto border-0 bg-transparent px-1 text-[13px] font-semibold" />
            <button aria-label="Next day" onClick={() => setDate((d) => shiftDay(d, 1))} className="grid size-11 place-items-center rounded-lg hover:bg-panel-2 md:size-9">
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

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {buildings.length > 1 &&
          ["all", ...buildings].map((id) => {
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
        {hasDepartments && (
          <div className="ml-auto flex overflow-hidden rounded-full border bg-card text-[12.5px] font-semibold">
            {(["site", "dept"] as const).map((g) => (
              <button key={g} onClick={() => setGroupBy(g)} className={`px-3 py-1.5 ${groupBy === g ? "bg-primary text-primary-foreground" : "hover:bg-panel-2"}`}>
                By {g === "site" ? "site" : "department"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Team patterns (Team Build-Up F) — only shown once there's a discernible pattern. */}
      {insights && insights.recommendation.busiest.length > 0 && (
        <div className="mb-4 rounded-[14px] border bg-card p-4 shadow-sm">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-primary/12 text-primary"><Lightbulb className="size-[18px]" /></span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold">{insights.recommendation.message}</div>
              <div className="mt-3 grid grid-cols-5 gap-2">
                {insights.weekdays.filter((w) => w.weekday >= 1 && w.weekday <= 5).map((w) => {
                  const max = Math.max(1, ...insights.weekdays.filter((x) => x.weekday >= 1 && x.weekday <= 5).map((x) => x.avg));
                  const pct = Math.round((w.avg / max) * 100);
                  const hot = insights.recommendation.busiest.includes(w.weekday);
                  return (
                    <div key={w.weekday} className="flex flex-col items-center gap-1">
                      <div className="flex h-16 w-full items-end justify-center">
                        <div className={`w-6 rounded-t ${hot ? "bg-primary" : "bg-primary/30"}`} style={{ height: `${Math.max(pct, 4)}%` }} title={`${w.avg.toFixed(1)} avg`} />
                      </div>
                      <span className={`text-[11px] ${hot ? "font-bold text-primary" : "text-txt-mute"}`}>{w.label.slice(0, 3)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 text-[11px] text-txt-mute">Average people in per weekday · last {insights.weeks} weeks{site !== "all" ? ` · ${bName(site)}` : ""}</div>
            </div>
          </div>
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
          {grouped.map((sec) => (
            <section key={sec.key} className="overflow-hidden rounded-[14px] border bg-card shadow-sm">
              <header className="flex items-center justify-between gap-3 border-b bg-panel-2/60 px-4 py-3">
                <h2 className="font-heading text-[15px] font-bold">
                  {sec.label}
                  {sec.isMySite && <span className="ml-2 rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-bold text-primary">Your site</span>}
                </h2>
                <span className="text-[12px] text-txt-mute">{sec.people.filter((p) => p.checkedIn).length} in · {sec.people.length} booked</span>
              </header>
              <ul className="divide-y">
                {sec.people.map((p, i) => {
                  const k = KIND[p.kind] ?? KIND.desk;
                  const meta = [p.jobTitle, groupBy === "site" ? p.department : null].filter(Boolean).join(" · ");
                  return (
                    <li key={`${p.spaceKey}-${p.start}-${i}`} className={`flex items-center gap-3 px-4 py-3 ${p.isMe ? "bg-primary/5" : ""}`}>
                      <Avatar name={p.name} photo={p.photo} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold">{p.name}</span>
                          {p.isMe && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">You</span>}
                          {meta && <span className="truncate text-[12px] text-txt-mute">· {meta}</span>}
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
        Only people in your workspace are shown. Names and where they’re sitting are visible to colleagues; contact details are not.{" "}
        <Link href="/settings" className="font-semibold text-primary">Manage your visibility</Link>.
      </p>
    </div>
  );
}
