"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Printer, Users, CalendarCheck, UserX, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getBuildingsMeta, type CustomBuilding } from "@/lib/plan-store";
import { brand } from "@/lib/brand";

interface Analytics {
  range: { from: string; to: string; days: number };
  totals: { bookings: number; activeUsers: number; checkInRate: number; noShowRate: number };
  byKind: { desk: number; office: number; room: number; parking: number };
  utilisation: { desk: number; office: number; room: number; parking: number };
  capacity: { desk: number; office: number; room: number; parking: number };
  daily: { date: string; count: number }[];
  weekly: { label: string; count: number }[];
  monthly: { label: string; count: number }[];
  peakHours: { hour: number; count: number }[];
  peakDays: { day: string; count: number }[];
  heatmap: number[][];
  topSpaces: { label: string; building: string; count: number }[];
  topUsers: { user: string; count: number }[];
  byBuilding: { id: string; name: string; count: number }[];
}

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

export default function InsightsPage() {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const [building, setBuilding] = useState("");
  const [weekends, setWeekends] = useState(false);
  const [grain, setGrain] = useState<"daily" | "weekly" | "monthly">("daily");
  const [live, setLive] = useState(false);
  const [buildings, setBuildings] = useState<CustomBuilding[]>([]);
  const [a, setA] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  useEffect(() => {
    // exclude hidden/removed buildings so the dropdown matches the Buildings page
    getBuildingsMeta().then((m) => setBuildings(m.custom.filter((c) => !m.hidden.includes(c.id))));
  }, []);

  const load = useCallback(() => {
    setLoading(true); setErr(false);
    const q = new URLSearchParams({ from, to, ...(building ? { building } : {}), ...(weekends ? { weekends: "1" } : {}) });
    fetch(`/api/analytics?${q}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { setA(d); setLoading(false); })
      .catch(() => { setErr(true); setLoading(false); });
  }, [from, to, building, weekends]);
  useEffect(() => { load(); }, [load]);
  // real-time: poll every 30s while Live is on
  useEffect(() => {
    if (!live) return;
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [live, load]);

  function exportCsv() {
    if (!a) return;
    const lines: string[] = [];
    lines.push(`${brand.productName} analytics,${a.range.from} to ${a.range.to}`);
    lines.push("");
    lines.push("Metric,Value");
    lines.push(`Total bookings,${a.totals.bookings}`);
    lines.push(`Active users,${a.totals.activeUsers}`);
    lines.push(`Check-in rate %,${a.totals.checkInRate}`);
    lines.push(`No-show rate %,${a.totals.noShowRate}`);
    lines.push(`Desk utilisation %,${a.utilisation.desk}`);
    lines.push(`Office utilisation %,${a.utilisation.office}`);
    lines.push(`Meeting room utilisation %,${a.utilisation.room}`);
    lines.push(`Parking utilisation %,${a.utilisation.parking}`);
    lines.push("");
    lines.push("Top spaces,Building,Bookings");
    a.topSpaces.forEach((s) => lines.push(`${csv(s.label)},${csv(s.building)},${s.count}`));
    lines.push("");
    lines.push("Most active users,Bookings");
    a.topUsers.forEach((u) => lines.push(`${csv(u.user)},${u.count}`));
    lines.push("");
    lines.push("Building,Bookings");
    a.byBuilding.forEach((b) => lines.push(`${csv(b.name)},${b.count}`));
    lines.push("");
    lines.push("Date,Bookings");
    a.daily.forEach((d) => lines.push(`${d.date},${d.count}`));
    download(`roamhub360-analytics-${a.range.from}_${a.range.to}.csv`, lines.join("\n"), "text/csv;charset=utf-8");
  }

  const summaryRows = (): (string | number)[][] => [
    ["Total bookings", a!.totals.bookings],
    ["Active users", a!.totals.activeUsers],
    ["Check-in rate %", a!.totals.checkInRate],
    ["No-show rate %", a!.totals.noShowRate],
    ["Desk utilisation %", a!.utilisation.desk],
    ["Office utilisation %", a!.utilisation.office],
    ["Meeting room utilisation %", a!.utilisation.room],
    ["Parking utilisation %", a!.utilisation.parking],
  ];

  async function exportXlsx() {
    if (!a) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const sheet = (name: string, head: string[], rows: (string | number)[][]) =>
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ...rows]), name);
    sheet("Summary", ["Metric", "Value"], summaryRows());
    sheet("Top spaces", ["Space", "Building", "Bookings"], a.topSpaces.map((s) => [s.label, s.building, s.count]));
    sheet("Active users", ["User", "Bookings"], a.topUsers.map((u) => [u.user, u.count]));
    sheet("Buildings", ["Building", "Bookings"], a.byBuilding.map((b) => [b.name, b.count]));
    sheet("Daily", ["Date", "Bookings"], a.daily.map((d) => [d.date, d.count]));
    XLSX.writeFile(wb, `roamhub360-analytics-${a.range.from}_${a.range.to}.xlsx`);
  }

  async function exportPdf() {
    if (!a) return;
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    doc.setFontSize(15);
    doc.text(`${brand.productName} — Analytics`, 14, 16);
    doc.setFontSize(10);
    doc.text(`${a.range.from} to ${a.range.to}`, 14, 22);
    let y = 28;
    const table = (head: string[], body: (string | number)[][]) => {
      autoTable(doc, { startY: y, head: [head], body: body.map((r) => r.map(String)), styles: { fontSize: 8 }, headStyles: { fillColor: [43, 125, 209] } });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    };
    table(["Metric", "Value"], summaryRows());
    table(["Space", "Building", "Bookings"], a.topSpaces.map((s) => [s.label, s.building, s.count]));
    table(["Building", "Bookings"], a.byBuilding.map((b) => [b.name, b.count]));
    doc.save(`roamhub360-analytics-${a.range.from}_${a.range.to}.pdf`);
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Analytics"
        subtitle="Workspace utilisation, attendance and booking activity"
        action={
          <div className="flex flex-wrap gap-2 print:hidden">
            <button onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-[10px] border bg-panel-2 px-3 py-2.5 text-[13px] font-semibold hover:border-primary">
              <Download className="size-4" /> CSV
            </button>
            <button onClick={exportXlsx} className="inline-flex items-center gap-1.5 rounded-[10px] border bg-panel-2 px-3 py-2.5 text-[13px] font-semibold hover:border-primary">
              <Download className="size-4" /> Excel
            </button>
            <button onClick={exportPdf} className="inline-flex items-center gap-1.5 rounded-[10px] border bg-panel-2 px-3 py-2.5 text-[13px] font-semibold hover:border-primary">
              <Printer className="size-4" /> PDF
            </button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-[14px] border bg-card p-4 shadow-sm print:hidden">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">From</span>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="ed-input" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">To</span>
          <input type="date" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} className="ed-input" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Building</span>
          <select value={building} onChange={(e) => setBuilding(e.target.value)} className="ed-input min-w-[180px]">
            <option value="">All buildings</option>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <div className="flex gap-1.5">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => { setFrom(daysAgo(d - 1)); setTo(today()); }} className="rounded-[9px] border bg-panel-2 px-2.5 py-1.5 text-[12px] font-semibold hover:border-primary">
              {d}d
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[12.5px] font-medium">
          <input type="checkbox" checked={weekends} onChange={(e) => setWeekends(e.target.checked)} className="size-4 accent-[var(--orange)]" />
          Include weekends
        </label>
        <button
          onClick={() => setLive((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5 text-[12px] font-semibold ${live ? "border-ok/40 bg-ok/10 text-ok" : "bg-panel-2 text-txt-dim hover:border-primary"}`}
        >
          <span className={`size-2 rounded-full ${live ? "animate-[pulse-dot_1.6s_infinite] bg-ok" : "bg-txt-mute"}`} /> {live ? "Live" : "Live off"}
        </button>
      </div>

      {err ? (
        <div className="rounded-[14px] border bg-card p-10 text-center shadow-sm">
          <p className="text-[14px] font-semibold">Couldn’t load analytics</p>
          <p className="mt-1 text-[12.5px] text-txt-mute">Check your connection or try a narrower range.</p>
          <button onClick={load} className="mt-4 rounded-[10px] bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground">Retry</button>
        </div>
      ) : loading || !a ? (
        <div className="rounded-[14px] border bg-card p-10 text-center text-[13px] text-txt-mute shadow-sm">Loading analytics…</div>
      ) : a.totals.bookings === 0 ? (
        <div className="rounded-[14px] border bg-card p-10 text-center shadow-sm">
          <h3 className="font-heading text-[15px] font-bold">No bookings in this range</h3>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] text-txt-dim">Widen the date range or pick another building. Metrics populate as people book.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={<CalendarCheck className="size-4" />} label="Total bookings" value={a.totals.bookings} />
            <Kpi icon={<Users className="size-4" />} label="Active users" value={a.totals.activeUsers} />
            <Kpi icon={<TrendingUp className="size-4" />} label="Check-in rate" value={`${a.totals.checkInRate}%`} />
            <Kpi icon={<UserX className="size-4" />} label="No-show rate" value={`${a.totals.noShowRate}%`} tone={a.totals.noShowRate > 30 ? "warn" : undefined} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Util label="Desk utilisation" pct={a.utilisation.desk} sub={`${a.byKind.desk} bookings · ${a.capacity.desk} desks`} />
            <Util label="Office utilisation" pct={a.utilisation.office} sub={`${a.byKind.office} bookings · ${a.capacity.office} offices`} />
            <Util label="Meeting room utilisation" pct={a.utilisation.room} sub={`${a.byKind.room} bookings · ${a.capacity.room} rooms`} />
            <Util label="Parking utilisation" pct={a.utilisation.parking} sub={`${a.byKind.parking} bookings · ${a.capacity.parking} bays`} />
          </div>

          <Panel
            title="Occupancy trend"
            action={
              <div className="flex overflow-hidden rounded-[8px] border bg-panel-2 text-[11.5px] font-semibold">
                {(["daily", "weekly", "monthly"] as const).map((g) => (
                  <button key={g} onClick={() => setGrain(g)} className={`px-2.5 py-1 capitalize ${grain === g ? "bg-primary text-primary-foreground" : "text-txt-dim"}`}>{g}</button>
                ))}
              </div>
            }
          >
            <Bars
              data={(grain === "daily" ? a.daily.map((d) => ({ label: d.date.slice(5), value: d.count })) : grain === "weekly" ? a.weekly.map((w) => ({ label: w.label.slice(5), value: w.count })) : a.monthly.map((m) => ({ label: m.label, value: m.count })))}
              thin={grain === "daily"}
            />
          </Panel>

          <Panel title="Occupancy heatmap (day × hour)">
            <Heatmap grid={a.heatmap} />
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Peak booking hours">
              <Bars data={a.peakHours.filter((h) => h.hour >= 6 && h.hour <= 21).map((h) => ({ label: `${h.hour}`, value: h.count }))} thin />
            </Panel>
            <Panel title="Peak booking days">
              <Bars data={a.peakDays.map((d) => ({ label: d.day, value: d.count }))} />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Building comparison">
              <Ranking items={a.byBuilding.map((b) => ({ label: b.name, value: b.count }))} />
            </Panel>
            <Panel title="Most active users">
              <Ranking items={a.topUsers.map((u) => ({ label: u.user, value: u.count }))} />
            </Panel>
          </div>

          <Panel title="Most used spaces (top 10)">
            <Ranking items={a.topSpaces.map((s) => ({ label: `${s.label} · ${s.building}`, value: s.count }))} />
          </Panel>
        </div>
      )}
    </div>
  );
}

function csv(s: string) { return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function download(name: string, body: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const el = document.createElement("a");
  el.href = url; el.download = name; el.click();
  URL.revokeObjectURL(url);
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number | string; tone?: "warn" }) {
  return (
    <div className="rounded-[14px] border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-txt-mute">{icon} {label}</div>
      <div className={`mt-1.5 font-heading text-[26px] font-bold ${tone === "warn" ? "text-amber" : "text-foreground"}`}>{value}</div>
    </div>
  );
}
function Util({ label, pct, sub }: { label: string; pct: number; sub: string }) {
  return (
    <div className="rounded-[14px] border bg-card p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-[12.5px] font-semibold">{label}</span>
        <span className="font-heading text-[18px] font-bold text-primary">{pct}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel-2">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 text-[11px] text-txt-mute">{sub}</div>
    </div>
  );
}
function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-heading text-[13.5px] font-bold">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}
function Heatmap({ grid }: { grid: number[][] }) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        <div className="mb-1 flex pl-9 text-[9px] text-txt-mute">
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="flex-1 text-center">{h % 3 === 0 ? h : ""}</span>
          ))}
        </div>
        {grid.map((row, d) => (
          <div key={d} className="flex items-center">
            <span className="w-9 text-[10px] font-semibold text-txt-mute">{days[d]}</span>
            <div className="flex flex-1 gap-[2px]">
              {row.map((v, h) => (
                <div key={h} className="aspect-square flex-1 rounded-[2px]" title={`${days[d]} ${h}:00 — ${v}`} style={{ background: v ? `color-mix(in oklab, var(--orange) ${Math.round((v / max) * 100)}%, var(--panel-2))` : "var(--panel-2)" }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
function Bars({ data, thin }: { data: { label: string; value: number }[]; thin?: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-40 items-end gap-[3px]">
      {data.map((d, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col items-center justify-end" title={`${d.label}: ${d.value}`}>
          <div className="w-full rounded-t-[3px] bg-primary/80 transition-all hover:bg-primary" style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 2 : 0 }} />
          {!thin && <span className="mt-1 truncate text-[10px] text-txt-mute">{d.label}</span>}
        </div>
      ))}
    </div>
  );
}
function Ranking({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <div className="py-6 text-center text-[12.5px] text-txt-mute">No data</div>;
  return (
    <div className="flex flex-col gap-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-3 text-[12.5px]">
          <span className="w-0 flex-1 truncate">{it.label}</span>
          <div className="h-2 w-28 overflow-hidden rounded-full bg-panel-2">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(it.value / max) * 100}%` }} />
          </div>
          <b className="w-8 text-right font-semibold tabular-nums">{it.value}</b>
        </div>
      ))}
    </div>
  );
}
