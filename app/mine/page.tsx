"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { getBookings, setBookingStatusApi, editBookingApi, isActiveBooking, displayStatus, type Booking } from "@/lib/api";
import { getBuildingsMeta } from "@/lib/plan-store";
import { deriveTimes, type DurationType, type Kind } from "@/lib/booking-rules";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";

const KIND_LABEL: Record<string, string> = { desk: "Desk", room: "Meeting room", office: "Office", parking: "Parking" };

export default function MinePage() {
  const [rows, setRows] = useState<Booking[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [editing, setEditing] = useState<Booking | null>(null);

  async function load() {
    setRows(await getBookings());
    setLoading(false);
  }
  useEffect(() => {
    load();
    getBuildingsMeta().then((m) => setNames(Object.fromEntries(m.custom.map((c) => [c.id, c.name]))));
  }, []);

  const bName = (id: string) => names[id] ?? names[id.split("__")[0]] ?? id;

  const active = useMemo(() => rows.filter((r) => isActiveBooking(r)).sort((a, b) => a.start.localeCompare(b.start)), [rows]);
  const history = useMemo(() => rows.filter((r) => !isActiveBooking(r)).sort((a, b) => b.start.localeCompare(a.start)), [rows]);
  const shown = showHistory ? history : active;

  async function checkIn(id: string) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: "Checked in" } : r)));
    await setBookingStatusApi(id, "Checked in");
    toast.success("Checked in", { description: "Booking confirmed" });
  }
  async function checkOut(id: string) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: "Checked out" } : r)));
    await setBookingStatusApi(id, "Checked out");
    toast("Checked out", { description: "Space released" });
  }
  async function cancel(id: string) {
    const row = rows.find((r) => r.id === id);
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: "Cancelled" } : r)));
    await setBookingStatusApi(id, "Cancelled");
    toast("Cancelled", { description: `${row?.spaceLabel} released` });
  }

  const pill = (b: Booking) => {
    const s = displayStatus(b);
    if (s === "Checked in" || s === "Completed" || s === "Checked out") return <StatusPill variant="ok">{s}</StatusPill>;
    if (s.startsWith("Cancelled") || s.startsWith("Declined") || s === "Expired") return <StatusPill variant="bad">{s}</StatusPill>;
    return <StatusPill variant="soon">{s}</StatusPill>;
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="My bookings"
        subtitle="Manage, reschedule or cancel your reservations"
        action={
          <div className="flex gap-2">
            <button onClick={() => setShowHistory((v) => !v)} className="rounded-[10px] border bg-panel-2 px-3 py-2.5 text-[13px] font-semibold hover:border-primary">
              {showHistory ? "Active bookings" : "History"}
            </button>
            <Link href="/book" className="rounded-[10px] bg-primary px-4 py-2.5 text-[13.5px] font-semibold text-primary-foreground hover:bg-orange-soft">
              + New booking
            </Link>
          </div>
        }
      />

      {/* Desktop: table. Mobile: card list (below) — a 6-col table can't fit a phone. */}
      <div className="hidden overflow-hidden rounded-[14px] border bg-card shadow-sm md:block">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-[0.05em] text-txt-mute">
              <th className="border-b px-3 py-2.5">Space</th>
              <th className="border-b px-3 py-2.5">Type</th>
              <th className="border-b px-3 py-2.5">Building</th>
              <th className="border-b px-3 py-2.5">When</th>
              <th className="border-b px-3 py-2.5">Status</th>
              <th className="border-b px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {loading || shown.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-txt-mute">
                  {loading ? "Loading…" : showHistory ? "No past bookings." : <>No active bookings. <Link href="/book" className="text-primary">Book a space</Link>.</>}
                </td>
              </tr>
            ) : (
              shown.map((r) => (
                <tr key={r.id} className="hover:bg-panel-2">
                  <td className="border-b px-3 py-3 font-semibold">{r.spaceLabel}</td>
                  <td className="border-b px-3 py-3">{KIND_LABEL[r.kind] ?? r.kind}</td>
                  <td className="border-b px-3 py-3">{bName(r.buildingId)}</td>
                  <td className="border-b px-3 py-3">{r.start.replace("T", " ")}<span className="text-txt-mute"> → {r.end.slice(11) || r.end}</span></td>
                  <td className="border-b px-3 py-3">{pill(r)}</td>
                  <td className="border-b px-3 py-3 text-right whitespace-nowrap">
                    {isActiveBooking(r) ? (
                      <>
                        <button onClick={() => setEditing(r)} className="mr-3 font-semibold text-primary hover:underline">Edit</button>
                        {r.status === "Booked" && (
                          <button onClick={() => checkIn(r.id)} className="mr-3 font-semibold text-primary hover:underline">Check in</button>
                        )}
                        {r.status === "Checked in" && (
                          <button onClick={() => checkOut(r.id)} className="mr-3 font-semibold text-ok hover:underline">Check out</button>
                        )}
                        <button onClick={() => cancel(r.id)} className="font-semibold text-destructive hover:underline">Cancel</button>
                      </>
                    ) : (
                      <span className="text-txt-mute">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="flex flex-col gap-3 md:hidden">
        {loading ? (
          <div className="rounded-[14px] border bg-card p-8 text-center text-[13px] text-txt-mute">Loading…</div>
        ) : shown.length === 0 ? (
          <div className="rounded-[14px] border bg-card p-8 text-center text-[13px] text-txt-mute">
            {showHistory ? "No past bookings." : <>No active bookings. <Link href="/book" className="font-semibold text-primary">Book a space</Link>.</>}
          </div>
        ) : (
          shown.map((r) => (
            <div key={r.id} className="rounded-[14px] border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="text-[15px] font-bold">{r.spaceLabel}</div>
                {pill(r)}
              </div>
              <div className="mt-1 text-[12.5px] text-txt-mute">{KIND_LABEL[r.kind] ?? r.kind} · {bName(r.buildingId)}</div>
              <div className="mt-1 text-[12.5px]">{r.start.replace("T", " ")}<span className="text-txt-mute"> → {r.end.slice(11) || r.end}</span></div>
              {isActiveBooking(r) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => setEditing(r)} className="rounded-[9px] border px-3 py-2 text-[12.5px] font-semibold hover:border-primary">Edit</button>
                  {r.status === "Booked" && <button onClick={() => checkIn(r.id)} className="rounded-[9px] bg-primary px-3 py-2 text-[12.5px] font-semibold text-primary-foreground">Check in</button>}
                  {r.status === "Checked in" && <button onClick={() => checkOut(r.id)} className="rounded-[9px] border border-ok/50 px-3 py-2 text-[12.5px] font-semibold text-ok">Check out</button>}
                  <button onClick={() => cancel(r.id)} className="rounded-[9px] border border-destructive/50 px-3 py-2 text-[12.5px] font-semibold text-destructive">Cancel</button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {editing && (
        <EditModal
          b={editing}
          buildingName={bName(editing.buildingId)}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function EditModal({ b, buildingName, onClose, onSaved }: { b: Booking; buildingName: string; onClose: () => void; onSaved: () => void }) {
  const kind = b.kind as Kind;
  const dur = b.durationType as DurationType;
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(b.start.slice(0, 10));
  const [endDate, setEndDate] = useState(b.end.slice(0, 10));
  const [startTime, setStartTime] = useState(b.start.slice(11) || "09:00");
  const [endTime, setEndTime] = useState(b.end.slice(11) || "10:00");
  const [half, setHalf] = useState<"am" | "pm">(b.start.slice(11) < "12:30" ? "am" : "pm");
  const [saving, setSaving] = useState(false);

  async function save() {
    const { start, end } = deriveTimes({ kind, duration: dur, startDate, endDate: kind === "desk" && dur === "full" ? endDate : undefined, startTime, endTime, half });
    setSaving(true);
    const res = await editBookingApi(b.id, { start, end, durationType: dur });
    setSaving(false);
    if (!res.ok) {
      toast.error("Could not reschedule", { description: res.error });
      return;
    }
    toast.success("Booking updated", { description: `${b.spaceLabel} → ${start.replace("T", " ")}` });
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-[14px] border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-heading text-[16px] font-bold">Reschedule booking</h2>
        <p className="mt-0.5 text-[12.5px] text-txt-mute">{b.spaceLabel} · {buildingName} · currently {b.start.replace("T", " ")} → {b.end.slice(11)}</p>

        <div className="mt-4 flex flex-col gap-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">{kind === "desk" && dur === "full" ? "From date" : "Date"}</span>
            <input type="date" value={startDate} min={today} onChange={(e) => setStartDate(e.target.value)} className="ed-input" />
          </label>

          {kind === "desk" && dur === "full" && (
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">To date (max 14 days)</span>
              <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className="ed-input" />
            </label>
          )}

          {dur === "half" && (
            <div className="flex overflow-hidden rounded-[9px] border bg-panel-2">
              {(["am", "pm"] as const).map((h) => (
                <button key={h} onClick={() => setHalf(h)} className={`flex-1 px-2 py-1.5 text-[12.5px] font-semibold uppercase ${half === h ? "bg-primary text-primary-foreground" : "text-txt-dim"}`}>{h}</button>
              ))}
            </div>
          )}

          {dur === "hourly" && (
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="mb-1 block text-[11px] text-txt-mute">Start</span><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="ed-input" /></label>
              <label className="block"><span className="mb-1 block text-[11px] text-txt-mute">End</span><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="ed-input" /></label>
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-[10px] border bg-panel-2 px-4 py-2.5 text-[13px] font-semibold">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 rounded-[10px] bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground hover:bg-orange-soft disabled:opacity-60">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
