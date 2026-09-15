"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { getOfficeBookings, type OfficeBookings } from "@/lib/api";
import type { OfficeBookingRow } from "@/lib/office-bookings";
import { getBuildingsMeta, type CustomBuilding } from "@/lib/plan-store";
import { todayInTz } from "@/lib/booking-rules";
import { OFFICE_BOOKINGS_DEFAULT_DAYS } from "@/lib/office-bookings";
import { PageHeader } from "@/components/page-header";
import { Avatar } from "@/components/avatar";
import { cn } from "@/lib/utils";

// Cross-site "Office bookings" overview — who has booked what, where and when across every site,
// for a date range. Three views over the same rows: List (table), Daily (cards per day), Weekly
// (a column per day). Data comes only from /api/office-bookings, which applies tenant scoping, the
// presence opt-out, and returns emails solely to admins — so this page never decides who may see
// what; it only renders what it is given.

const KIND_LABEL: Record<string, string> = { desk: "Desk", room: "Meeting room", office: "Office", parking: "Parking" };
const PAGE = 100;

const addDays = (date: string, n: number): string => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * 86400000).toISOString().slice(0, 10);
};
const weekStart = (date: string): string => {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, dow === 0 ? -6 : 1 - dow); // Monday
};
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dow = (date: string) => DOW[new Date(`${date}T00:00:00Z`).getUTCDay()];
const dispDate = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
const timeOf = (r: OfficeBookingRow) => (r.date === r.endDate ? `${r.start}–${r.end}` : `${r.start} → ${dispDate(r.endDate)} ${r.end}`);
const datesBetween = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 70; d = addDays(d, 1)) out.push(d);
  return out;
};

function StatusChip({ status }: { status: string }) {
  const cls =
    status === "Checked in" ? "bg-ok/12 text-ok" : status === "Booked" ? "bg-primary/12 text-primary" : "bg-panel-2 text-txt-mute";
  return <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold", cls)}>{status}</span>;
}

function Person({ r }: { r: OfficeBookingRow }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar name={r.name} photo={r.photo} size={30} />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[12.5px] font-semibold">
          {r.name}
          {r.isMe && <span className="ml-1 text-[11px] font-normal text-txt-mute">(you)</span>}
        </div>
        {r.by && <div className="truncate text-[11px] text-txt-mute">booked by {r.by}</div>}
      </div>
    </div>
  );
}

export default function OfficeBookingPage() {
  const today = todayInTz(); // platform-default zone, never the browser's or server's clock
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, OFFICE_BOOKINGS_DEFAULT_DAYS - 1));
  const [site, setSite] = useState("");
  const [floor, setFloor] = useState("");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("active");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"list" | "daily" | "weekly">("list");
  const [buildings, setBuildings] = useState<CustomBuilding[]>([]);
  const [data, setData] = useState<OfficeBookings>({ enabled: true, isAdmin: false, total: 0, rows: [] });
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(0); // bumped by bookings:changed → refetch from the top

  useEffect(() => {
    getBuildingsMeta().then((m) => setBuildings(m.custom.filter((c) => !m.hidden.includes(c.id))));
  }, []);

  // Live refresh: any booking change anywhere restarts from page one (never re-appends page one
  // under already-loaded pages).
  useEffect(() => {
    const onChange = () => { setOffset(0); setTick((t) => t + 1); };
    window.addEventListener("bookings:changed", onChange);
    return () => window.removeEventListener("bookings:changed", onChange);
  }, []);

  // Fetch on any filter/page change (search debounced). offset > 0 appends the next page.
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      getOfficeBookings({ from, to, site, floor, kind, status, q, limit: PAGE, offset }).then((d) => {
        if (!alive) return;
        setData((prev) => (offset > 0 ? { ...d, rows: [...prev.rows, ...d.rows] } : d));
        setLoading(false);
      });
    }, q ? 250 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [from, to, site, floor, kind, status, q, offset, tick]);

  // Any filter change restarts paging from the top.
  const setFilter = <T,>(setter: (v: T) => void) => (v: T) => { setOffset(0); setter(v); };
  const preset = (f: string, t: string) => { setOffset(0); setFrom(f); setTo(t); };

  const floors = useMemo(() => buildings.find((b) => b.id === site)?.floors ?? [], [buildings, site]);
  const byDate = useMemo(() => {
    const m = new Map<string, OfficeBookingRow[]>();
    for (const r of data.rows) (m.get(r.date) ?? m.set(r.date, []).get(r.date)!).push(r);
    return m;
  }, [data.rows]);
  const range = useMemo(() => datesBetween(from, to), [from, to]);
  const isPreset = (f: string, t: string) => from === f && to === t;
  const thisWeek: [string, string] = [weekStart(today), addDays(weekStart(today), 6)];
  const next14: [string, string] = [today, addDays(today, OFFICE_BOOKINGS_DEFAULT_DAYS - 1)];

  if (!data.enabled) {
    return (
      <div>
        <PageHeader title="Office bookings" subtitle="Cross-site overview" />
        <div className="rounded-[14px] border bg-card p-8 text-center text-[13px] text-txt-mute">Office bookings is turned off for this workspace.</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col">
      <PageHeader
        title="Office bookings"
        subtitle={`${data.total} booking${data.total === 1 ? "" : "s"} · ${dispDate(from)} → ${dispDate(to)}`}
        action={
          <div className="flex overflow-hidden rounded-[9px] border bg-panel-2">
            {(["list", "daily", "weekly"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={cn("px-3 py-1.5 text-[12.5px] font-semibold capitalize", view === v ? "bg-primary text-primary-foreground" : "text-txt-dim")}>
                {v}
              </button>
            ))}
          </div>
        }
      />

      {/* filters */}
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="flex overflow-hidden rounded-[9px] border bg-panel-2">
          {[
            { label: "Today", f: today, t: today },
            { label: "This week", f: thisWeek[0], t: thisWeek[1] },
            { label: "Next 14 days", f: next14[0], t: next14[1] },
          ].map((p) => (
            <button key={p.label} onClick={() => preset(p.f, p.t)} className={cn("px-3 py-1.5 text-[12.5px] font-semibold", isPreset(p.f, p.t) ? "bg-primary text-primary-foreground" : "text-txt-dim")}>
              {p.label}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">From</span>
          <input type="date" value={from} max={to} onChange={(e) => e.target.value && preset(e.target.value, to < e.target.value ? e.target.value : to)} className="ed-input" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">To</span>
          <input type="date" value={to} min={from} onChange={(e) => e.target.value && preset(from, e.target.value)} className="ed-input" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Site</span>
          <select value={site} onChange={(e) => { setFilter(setSite)(e.target.value); setFloor(""); }} className="ed-input">
            <option value="">All sites</option>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        {floors.length > 1 && (
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Floor</span>
            <select value={floor} onChange={(e) => setFilter(setFloor)(e.target.value)} className="ed-input">
              <option value="">All floors</option>
              {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Type</span>
          <select value={kind} onChange={(e) => setFilter(setKind)(e.target.value)} className="ed-input">
            <option value="">All types</option>
            {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Status</span>
          <select value={status} onChange={(e) => setFilter(setStatus)(e.target.value)} className="ed-input">
            <option value="active">Active</option>
            <option value="Booked">Booked</option>
            <option value="Checked in">Checked in</option>
            <option value="all">All (incl. cancelled)</option>
          </select>
        </label>
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-txt-mute" />
          <input
            type="search"
            aria-label="Search people, spaces or sites"
            value={q}
            onChange={(e) => setFilter(setQ)(e.target.value)}
            placeholder={data.isAdmin ? "Search name, email, space or site…" : "Search name, space or site…"}
            className="w-full rounded-[9px] border bg-panel-2 py-1.5 pl-8 pr-3 text-[13px] outline-none"
          />
        </div>
      </div>

      {loading ? (
        <div className="rounded-[14px] border bg-card p-8 text-center text-[13px] text-txt-mute">Loading…</div>
      ) : data.rows.length === 0 ? (
        <div className="rounded-[14px] border bg-card p-8 text-center text-[13px] text-txt-mute">No bookings match.</div>
      ) : view === "list" ? (
        <div className="overflow-x-auto rounded-[14px] border bg-card shadow-sm">
          <table className="w-full text-[13px]">
            <thead className="text-left text-[11px] uppercase tracking-[0.05em] text-txt-mute">
              <tr>
                <th className="px-3 py-2.5">Person</th>
                {data.isAdmin && <th className="px-3 py-2.5">Email</th>}
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Time</th>
                <th className="px-3 py-2.5">Site</th>
                <th className="px-3 py-2.5">Space</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={r.id ?? `${r.date}-${r.space}-${i}`} className="hover:bg-panel-2">
                  <td className="border-b px-3 py-2.5"><Person r={r} /></td>
                  {data.isAdmin && <td className="border-b px-3 py-2.5 text-txt-dim">{r.userEmail ?? "—"}</td>}
                  <td className="whitespace-nowrap border-b px-3 py-2.5">{dow(r.date)} {dispDate(r.date)}</td>
                  <td className="whitespace-nowrap border-b px-3 py-2.5 text-txt-dim">{timeOf(r)}</td>
                  <td className="border-b px-3 py-2.5">{r.siteName}{r.floor ? <span className="text-txt-mute"> · {r.floor}</span> : null}</td>
                  <td className="border-b px-3 py-2.5 font-semibold">{r.space}</td>
                  <td className="border-b px-3 py-2.5 text-txt-dim">{KIND_LABEL[r.kind] ?? r.kind}</td>
                  <td className="border-b px-3 py-2.5"><StatusChip status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : view === "daily" ? (
        <div className="flex flex-col gap-4">
          {[...byDate.entries()].map(([date, list]) => (
            <div key={date} className="rounded-[14px] border bg-card p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <b className="text-[14px]">{dow(date)}, {dispDate(date)}</b>
                <span className="text-[12px] text-txt-mute">{list.length} booking{list.length === 1 ? "" : "s"}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((r, i) => (
                  <div key={r.id ?? `${r.space}-${i}`} className="flex items-center gap-2.5 rounded-xl border bg-panel-2 px-3 py-2">
                    <Avatar name={r.name} photo={r.photo} size={30} />
                    <div className="min-w-0 leading-tight">
                      <div className="truncate text-[12.5px] font-semibold">{r.name}{r.isMe ? " (you)" : ""}</div>
                      <div className="truncate text-[11px] text-txt-mute">{r.space} · {r.siteName}{r.floor ? ` · ${r.floor}` : ""} · {timeOf(r)}</div>
                    </div>
                    <div className="ml-auto"><StatusChip status={r.status} /></div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {range.map((date) => {
            const list = byDate.get(date) ?? [];
            return (
              <div key={date} className={cn("w-56 shrink-0 rounded-[14px] border bg-card p-3 shadow-sm", date === today && "border-primary")}>
                <div className="mb-2 border-b pb-2 text-center">
                  <div className="text-[12px] font-bold">{dow(date)}</div>
                  <div className="text-[11px] text-txt-mute">{dispDate(date)}</div>
                  <div className="mt-0.5 text-[11px] text-primary">{list.length} in</div>
                </div>
                <div className="flex flex-col gap-1.5">
                  {list.map((r, i) => (
                    <div key={r.id ?? `${r.space}-${i}`} className="flex items-center gap-2" title={`${r.name} · ${r.space} · ${r.siteName} · ${timeOf(r)}`}>
                      <Avatar name={r.name} photo={r.photo} size={24} />
                      <span className="truncate text-[12px]">{r.name}</span>
                    </div>
                  ))}
                  {list.length === 0 && <div className="py-2 text-center text-[11px] text-txt-mute">—</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data.rows.length < data.total && (
        <div className="mt-3 text-center">
          <button onClick={() => setOffset((o) => o + PAGE)} className="rounded-[9px] border px-4 py-2 text-[12.5px] font-semibold hover:border-primary">
            Load more ({data.total - data.rows.length} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
