"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Search, Plus, Minus, Lock, Unlock, ShieldCheck, Upload, Trash2, Monitor, DoorClosed, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "@/components/location-context";
import { usePlan, getFloors, type FloorRoom } from "@/lib/plan-store";
import { getLocks, setLockApi, createBookingApi, createRecurringBookingApi, getOccupied, setBookingStatusApi, getPresence, type PresenceEntry } from "@/lib/api";
import { expandWeekly } from "@/lib/recurrence";
import { groupAttendance } from "@/lib/attendance";
import { deriveTimes, validateBooking, todayInTz, maxAdvanceDate, blocksWholeDay, DURATION_LABELS, type DurationType, type Kind } from "@/lib/booking-rules";
import { spaceKey, type SpaceEl, type SpaceKind, type SpaceStatus } from "@/lib/types";
import { FloorSvg } from "@/components/floorplan/floor-svg";
import { Legend } from "@/components/floorplan/legend";
import { PageHeader } from "@/components/page-header";
import { AttendanceStack } from "@/components/attendance-stack";

// One booking on a space for the selected day, as the occupant feed reports it (no emails).
interface Slot { start: string; end: string; durationType: string; name: string }

const TABS: { label: string; kind: SpaceKind }[] = [
  { label: "Desks", kind: "desk" },
  { label: "Meeting rooms", kind: "room" },
  { label: "Offices", kind: "office" },
  { label: "Parking", kind: "parking" },
];

export default function BookPage() {
  const { office } = useLocation();
  const officeId = office?.id ?? "";

  // Floors/rooms: load the building's floors, default to the marked default floor.
  const [floors, setFloors] = useState<FloorRoom[]>([]);
  const [floorId, setFloorId] = useState("");
  useEffect(() => {
    if (!officeId) { setFloors([]); setFloorId(""); return; }
    let alive = true;
    getFloors(officeId).then((fl) => {
      if (!alive) return;
      setFloors(fl);
      setFloorId((fl.find((f) => f.isDefault) ?? fl[0])?.id ?? officeId);
    });
    return () => { alive = false; };
  }, [officeId]);

  const planId = floorId || officeId;
  const { plan, loading } = usePlan(planId);

  const [kind, setKind] = useState<SpaceKind>("desk");
  const [query, setQuery] = useState("");
  const [occupants, setOccupants] = useState<Record<string, string>>({});
  const [slots, setSlots] = useState<Record<string, Slot[]>>({});
  // admin-only: booking id + owner per occupied space, so an admin can cancel on their behalf
  const [adminBookings, setAdminBookings] = useState<Record<string, { id: string; user: string }>>({});
  const [status, setStatus] = useState<Record<string, SpaceStatus>>({});
  const [selected, setSelected] = useState<SpaceEl | null>(null);
  // Desk hover card (pointer devices only; touch falls back to tap → detail panel).
  const [hoverCard, setHoverCard] = useState<{ el: SpaceEl; x: number; y: number } | null>(null);
  const [canHover, setCanHover] = useState(false);
  useEffect(() => {
    setCanHover(typeof window !== "undefined" && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches);
  }, []);
  const [selDate, setSelDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [admin, setAdmin] = useState(false);
  const [canAdmin, setCanAdmin] = useState(false);
  const [onBehalf, setOnBehalf] = useState(""); // admin-only: book for another user (their email)
  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => setCanAdmin(u?.role === "global-admin" || u?.role === "site-admin"))
      .catch(() => {});
  }, []);

  // booking form
  const [duration, setDuration] = useState<DurationType>("full");
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  // Dates must follow the OFFICE's timezone, not the visitor's browser/UTC. When a building (and
  // its tz) loads, roll From/To forward to "today" AT THE OFFICE so you can't land on a past
  // office-day (a UTC "today" can be a day behind for offices ahead of UTC, e.g. Sydney).
  useEffect(() => {
    if (!plan?.tz) return;
    const t = todayInTz(plan.tz);
    setSelDate((d) => (d < t ? t : d));
    setEndDate((d) => (d < t ? t : d));
  }, [planId, plan?.tz]);
  const [half, setHalf] = useState<"am" | "pm">("am");
  // Repeat weekly: the same space on chosen weekdays through an end date — one single-day booking
  // per matching date, created by ONE server request (see /api/bookings/recurring).
  const [repeat, setRepeat] = useState(false);
  const [repeatDays, setRepeatDays] = useState<boolean[]>([false, false, false, false, false, false, false]);
  const [repeatUntil, setRepeatUntil] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  // whether the user has manually edited the end time (so we stop auto-defaulting it to +1h)
  const [endTimeTouched, setEndTimeTouched] = useState(false);
  useEffect(() => setEndTimeTouched(false), [selected]); // fresh space = fresh defaults

  // add one hour to HH:mm, capped at the space's closing time
  function addHour(t: string, cap: string): string {
    const [h, m] = t.split(":").map(Number);
    const [ch, cm] = cap.split(":").map(Number);
    const mins = Math.min(h * 60 + m + 60, ch * 60 + cm);
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  }
  // "From" date drives "To": default it to the same day and never let it fall behind.
  function changeFromDate(d: string) {
    setSelDate(d);
    setEndDate((prev) => (prev < d ? d : prev));
  }
  // "From" time defaults "To" to +1h unless the user has already set it.
  function changeStartTime(t: string) {
    setStartTime(t);
    // Parking is 24h; desks, offices and rooms end no later than the site's closing time.
    const cap = selected?.t === "parking" ? "23:59" : plan.closeTime || "17:30";
    if (!endTimeTouched) setEndTime(addHour(t, cap));
  }
  function changeEndTime(t: string) {
    setEndTimeTouched(true);
    setEndTime(t);
  }

  // floor-plan zoom + pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number } | null>(null);
  // Zoom with Ctrl/⌘ + wheel (and trackpad pinch, which arrives as ctrlKey) ONLY. A plain wheel
  // must scroll the page: on a large screen the map fills the viewport, and eating every wheel
  // event for zoom left people unable to scroll at all. Native non-passive listener so we can
  // preventDefault the browser's own page zoom on Ctrl+wheel.
  // Callback ref (not a mount effect): the stage only renders once the site has loaded, so a
  // one-shot effect would find nothing to attach to.
  const wheelCleanup = useRef<(() => void) | null>(null);
  const stageRef = useCallback((el: HTMLDivElement | null) => {
    wheelCleanup.current?.();
    wheelCleanup.current = null;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoom((z) => Math.min(4, Math.max(1, +(z * (e.deltaY < 0 ? 1.1 : 0.9)).toFixed(2))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    wheelCleanup.current = () => el.removeEventListener("wheel", onWheel);
  }, []);
  const zoomBy = (f: number) => setZoom((z) => Math.min(4, Math.max(1, +(z * f).toFixed(2))));
  useEffect(() => {
    if (zoom === 1) setPan({ x: 0, y: 0 });
  }, [zoom]);

  // status + bookings are scoped to the floor (planId), so floors that reuse
  // desk numbers never collide. Legacy single-floor: planId === buildingId.
  async function refreshStatus() {
    const [locks, occ] = await Promise.all([getLocks(planId), getOccupied(planId, selDate)]);
    const m: Record<string, SpaceStatus> = {};
    occ.forEach((k) => (m[k] = "booked"));
    locks.forEach((k) => (m[k] = "locked"));
    setStatus(m);
  }
  useEffect(() => {
    if (!planId) {
      setStatus({});
      return;
    }
    let alive = true;
    Promise.all([getLocks(planId), getOccupied(planId, selDate)]).then(([locks, occ]) => {
      if (!alive) return;
      const m: Record<string, SpaceStatus> = {};
      occ.forEach((k) => (m[k] = "booked"));
      locks.forEach((k) => (m[k] = "locked"));
      setStatus(m);
    });
    return () => {
      alive = false;
    };
  }, [planId, selDate]);

  // occupants for the floor+date (so search can find "where is <colleague>"), plus each space's
  // booked slots. Reloaded on every booking change (ours or anyone's, via the live bus) so the
  // panel never shows a stale "booked on this day" list after you just booked.
  useEffect(() => {
    if (!planId) { setOccupants({}); setSlots({}); return; }
    let alive = true;
    const load = () =>
      fetch(`/api/bookings?building=${encodeURIComponent(planId)}&date=${selDate}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((bk: { spaceKey: string; name?: string; userEmail?: string; id?: string; start?: string; end?: string; durationType?: string }[]) => {
          if (!alive) return;
          const m: Record<string, string> = {};
          const adm: Record<string, { id: string; user: string }> = {};
          const sl: Record<string, Slot[]> = {};
          bk.forEach((b) => {
            m[b.spaceKey] = b.name ?? b.userEmail ?? "";
            if (b.id) adm[b.spaceKey] = { id: b.id, user: b.userEmail ?? b.name ?? "" };
            if (b.start && b.end) (sl[b.spaceKey] ??= []).push({ start: b.start, end: b.end, durationType: b.durationType ?? "full", name: b.name ?? "" });
          });
          Object.values(sl).forEach((list) => list.sort((a, b) => a.start.localeCompare(b.start)));
          setOccupants(m);
          setAdminBookings(adm);
          setSlots(sl);
        })
        .catch(() => {});
    load();
    window.addEventListener("bookings:changed", load);
    return () => { alive = false; window.removeEventListener("bookings:changed", load); };
  }, [planId, selDate]);

  // "Who's coming in" to this site on the selected date — from /api/presence, which applies the
  // presence feature flag, the hidePresence opt-out and PII minimisation server-side (the map's
  // own occupant feed above does not honour the opt-out, so it is deliberately not reused here).
  // Refreshed live when anyone books, cancels or checks in.
  const [presence, setPresence] = useState<PresenceEntry[]>([]);
  useEffect(() => {
    if (!officeId) return;
    let alive = true;
    const load = () => getPresence(selDate).then((p) => { if (alive) setPresence(p.entries); });
    load();
    window.addEventListener("bookings:changed", load);
    return () => { alive = false; window.removeEventListener("bookings:changed", load); };
  }, [officeId, selDate]);
  const attendance = useMemo(() => groupAttendance(presence, officeId), [presence, officeId]);

  // What the map and panel show: a "booked" space whose bookings are all hourly is only PARTLY
  // booked (amber) — still bookable around them. Locks and whole-day bookings stay as they are.
  const statusView = useMemo(() => {
    const v: Record<string, SpaceStatus> = { ...status };
    for (const k of Object.keys(v)) if (v[k] === "booked" && slots[k] && !blocksWholeDay(slots[k])) v[k] = "partial";
    return v;
  }, [status, slots]);
  const selKey = selected ? spaceKey(selected) : null;
  const selStatus: SpaceStatus = selKey ? statusView[selKey] ?? "free" : "free";
  const locked = selStatus === "locked";

  const counts = {
    desk: plan.els.filter((e) => e.t === "desk").length,
    room: plan.els.filter((e) => e.t === "room").length,
    office: plan.els.filter((e) => e.t === "office").length,
    parking: plan.els.filter((e) => e.t === "parking").length,
  };

  function pick(el: SpaceEl) {
    setSelected(el);
    setKind(el.t);
    // A partly-booked space (hourly bookings only) can only take another hourly booking.
    if (statusView[spaceKey(el)] === "partial") setDuration("hourly");
  }
  function switchKind(k: SpaceKind) {
    setKind(k);
    setSelected(null);
  }
  function toggleLock() {
    if (!selKey) return;
    const next = !locked;
    setStatus((s) => ({ ...s, [selKey]: next ? "locked" : "free" }));
    setLockApi(planId, selKey, next);
    toast(next ? "Locked" : "Unlocked", {
      description: `${spaceLabel(selected!)} is now ${next ? "locked / disabled" : "available for booking"}`,
    });
  }

  async function doBook(el: SpaceEl) {
    const label = spaceLabel(el);
    const kindT = el.t as Kind;

    // ---- Repeat weekly: one request; the server expands the dates and applies every rule per date ----
    if (repeat) {
      const behalfR = admin && onBehalf.trim() ? onBehalf.trim() : undefined;
      if (behalfR && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(behalfR)) {
        toast.error("Invalid email", { description: "Enter a valid address to book on behalf of, or clear the field." });
        return;
      }
      const until = repeatUntil || selDate;
      const preview = expandWeekly({ startDate: selDate, until, weekdays: repeatDays });
      if ("error" in preview) {
        toast.error("Check the repeat settings", { description: preview.error });
        return;
      }
      const r = await createRecurringBookingApi({
        buildingId: planId, spaceKey: spaceKey(el), spaceLabel: label, kind: el.t, durationType: duration,
        startDate: selDate, until, weekdays: repeatDays, startTime, endTime, half, userEmail: behalfR,
      });
      const skippedText = r.skipped.length
        ? `Skipped ${r.skipped.length}: ${r.skipped.slice(0, 3).map((s) => `${s.date.slice(5)} (${s.reason.replace(/\.$/, "")})`).join("; ")}${r.skipped.length > 3 ? "…" : ""}`
        : "See My bookings.";
      if (!r.ok) {
        toast.error(r.created.length ? "Partly booked" : "Nothing booked", { description: r.error ?? skippedText });
        if (!r.created.length) return;
      } else {
        toast.success(`Booked ${r.created.length} of ${r.requested} dates`, { description: skippedText });
      }
      setSelected(null);
      refreshStatus();
      return;
    }

    const { start, end } = deriveTimes({ kind: kindT, duration, startDate: selDate, endDate, startTime, endTime, half, hours: { open: plan.openTime, close: plan.closeTime } });
    const err = validateBooking(kindT, start, end, { advanceDays: plan.advanceDays, allowedWeekdays: plan.allowedWeekdays, allowPast: plan.allowPast, maxHours: el.t === "room" ? el.maxHours : undefined, tz: plan.tz, openTime: plan.openTime, closeTime: plan.closeTime }, duration);
    if (err) {
      toast.error("Invalid booking", { description: err });
      return;
    }
    const behalf = admin && onBehalf.trim() ? onBehalf.trim() : undefined;
    if (behalf && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(behalf)) {
      toast.error("Invalid email", { description: "Enter a valid address to book on behalf of, or clear the field." });
      return;
    }
    const res = await createBookingApi({
      buildingId: planId,
      spaceKey: spaceKey(el),
      spaceLabel: label,
      kind: el.t,
      durationType: duration,
      start,
      end,
      userEmail: behalf,
    });
    if (!res.ok) {
      toast.error("Booking failed", { description: res.error });
      return;
    }
    toast.success(el.t === "room" ? "Room booked" : el.t === "office" ? "Office booked" : el.t === "parking" ? "Parking booked" : "Desk booked", {
      description: behalf
        ? `${label} booked for ${behalf}. Invite sent to them.`
        : `${label} · ${start.replace("T", " ")} → ${end.replace("T", " ")}. See My bookings.`,
    });
    setSelected(null);
    refreshStatus();
  }

  // Admin cancels the booking currently occupying a space (on the selected date).
  async function cancelBookingAdmin(el: SpaceEl) {
    const info = adminBookings[spaceKey(el)];
    if (!info) return;
    const reason = window.prompt(`Cancel ${spaceLabel(el)} booked by ${info.user}?\n\nOptional reason (shown to the user):`, "");
    if (reason === null) return; // admin dismissed the prompt
    const res = await setBookingStatusApi(info.id, "Cancelled", reason.trim() || undefined);
    if (!res.ok) {
      toast.error("Could not cancel", { description: res.error });
      return;
    }
    toast.success("Booking cancelled", { description: `${spaceLabel(el)} released — ${info.user} has been notified.` });
    setSelected(null);
    refreshStatus();
    setAdminBookings((m) => { const n = { ...m }; delete n[spaceKey(el)]; return n; });
  }

  if (!office) {
    return (
      <div className="animate-fade-up">
        <PageHeader title="Book a space" subtitle="No buildings yet" />
        <div className="rounded-[14px] border bg-card p-10 text-center shadow-sm">
          <h3 className="font-heading text-[15px] font-bold">No buildings available</h3>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] text-txt-dim">
            All buildings have been removed. Create one under <a href="/buildings" className="text-primary">Buildings</a> to start booking.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up flex h-full flex-col">
      <PageHeader
        title="Book a space"
        subtitle={`${office.b} · ${floors.find((f) => f.id === planId)?.name ?? plan.name}`}
        action={
          <div className="flex gap-2">
            {canAdmin && (
              <button
                onClick={() => setAdmin((a) => !a)}
                className={cn(
                  "flex items-center gap-1.5 rounded-[10px] border px-3 py-2.5 text-[13px] font-semibold",
                  admin ? "border-primary bg-primary/10 text-primary" : "bg-panel-2",
                )}
              >
                <ShieldCheck className="size-4" /> Admin {admin ? "on" : "off"}
              </button>
            )}
            <Link
              href="/"
              className="rounded-[10px] border bg-panel-2 px-4 py-2.5 text-[13.5px] font-semibold text-foreground"
            >
              ← Back
            </Link>
          </div>
        }
      />

      {/* On desktop the single grid row is pinned to the container's height (minmax(0,1fr)) — with the
          default `auto` row the row grew to the plan's intrinsic height, so a large plan ran past the
          bottom of the viewport instead of fitting the stage. Phones stack the panels and scroll. */}
      <div className="grid min-h-0 flex-1 gap-[15px] lg:grid-cols-[1fr_300px] lg:grid-rows-[minmax(0,1fr)]">
        {/* stage */}
        <div className="flex min-h-0 flex-col rounded-[14px] border bg-card p-[15px] shadow-sm">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-[9px] border bg-panel-2">
              {TABS.map((t) => (
                <button
                  key={t.kind}
                  onClick={() => switchKind(t.kind)}
                  className={cn(
                    "px-3 py-1.5 text-[12.5px] font-semibold",
                    kind === t.kind ? "bg-primary text-primary-foreground" : "text-txt-dim",
                  )}
                >
                  {t.label} <span className="opacity-70">{counts[t.kind]}</span>
                </button>
              ))}
            </div>
            {floors.length > 1 && (
              <select
                value={floorId}
                onChange={(e) => { setFloorId(e.target.value); setSelected(null); }}
                className="rounded-[9px] border bg-panel-2 px-2.5 py-1.5 text-[12.5px] font-semibold text-txt"
                aria-label="Floor or room"
              >
                {floors.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}{f.isDefault ? " (default)" : ""}
                  </option>
                ))}
              </select>
            )}
            <input
              type="date"
              aria-label="Date shown on the map"
              value={selDate}
              min={todayInTz(plan.tz)}
              max={maxAdvanceDate(plan.advanceDays, plan.tz)}
              onChange={(e) => e.target.value && changeFromDate(e.target.value)}
              className="rounded-[9px] border bg-panel-2 px-2.5 py-1.5 text-[12.5px] font-semibold text-txt"
            />
            <div className="relative min-w-[130px] flex-1">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-txt-mute" />
              <input
                type="search"
                aria-label="Search spaces and colleagues"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search desk, room, office or colleague…"
                className="w-full rounded-[9px] border bg-panel-2 py-1.5 pl-8 pr-3 text-[13px] outline-none"
              />
            </div>
            <AttendanceStack people={attendance} siteName={office.b} />
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ok">
              <span className="size-2 animate-[pulse-dot_1.6s_infinite] rounded-full bg-ok" /> Live
            </span>
            <button onClick={() => zoomBy(1.25)} title="Zoom in" aria-label="Zoom in" className="grid size-11 place-items-center rounded-[9px] border bg-panel-2 text-txt-dim hover:text-foreground md:size-9">
              <Plus className="size-4" />
            </button>
            <button onClick={() => zoomBy(0.8)} title="Zoom out" aria-label="Zoom out" className="grid size-11 place-items-center rounded-[9px] border bg-panel-2 text-txt-dim hover:text-foreground md:size-9">
              <Minus className="size-4" />
            </button>
            <span className="w-10 text-center text-[12px] font-semibold text-txt-mute" title="Hold Ctrl and scroll to zoom; drag to pan when zoomed in">{Math.round(zoom * 100)}%</span>
          </div>

          <div
            ref={stageRef}
            className="relative flex min-h-[360px] w-full flex-1 items-center justify-center overflow-hidden rounded-[11px] border bg-panel-2"
            onPointerDown={(e) => { if (zoom > 1) { panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }; setPanning(true); } }}
            onPointerMove={(e) => { if (panStart.current) setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y }); }}
            onPointerUp={() => { panStart.current = null; setPanning(false); }}
            onPointerLeave={() => { panStart.current = null; setPanning(false); }}
          >
            {loading ? (
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" aria-label="Loading floor plan" />
            ) : plan.els.length === 0 ? (
              <div className="max-w-sm px-6 text-center">
                <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-card">
                  <Upload className="size-6 text-txt-mute" />
                </div>
                <h3 className="font-heading text-[15px] font-bold">No floor plan yet</h3>
                <p className="mt-1.5 text-[13px] text-txt-dim">
                  Upload a floor plan for {office.b} to map its desks, offices and meeting rooms, then publish it for booking.
                </p>
              </div>
            ) : (
              // FloorSvg is a DIRECT flex child of the explicit-height stage (same
              // structure as the editor) so its fit sizing works and the whole plan
              // stays visible. The zoom/pan transform is applied to the SVG itself.
              <FloorSvg
                key={planId}
                className="max-h-full animate-fade-in"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: "center center",
                  cursor: zoom > 1 ? (panning ? "grabbing" : "grab") : "default",
                  transition: panning ? "none" : "transform .22s cubic-bezier(0.25,1,0.5,1)",
                  willChange: "transform",
                }}
                plan={plan}
                status={statusView}
                selectedKey={selKey}
                query={query}
                occupants={occupants}
                onPick={pick}
                onHoverSpace={(el, x, y) => setHoverCard(canHover && el ? { el, x, y } : null)}
              />
            )}
          </div>
        </div>

        {hoverCard && (
          <DeskHoverCard
            el={hoverCard.el}
            x={hoverCard.x}
            y={hoverCard.y}
            status={statusView[spaceKey(hoverCard.el)] ?? "free"}
            occupant={occupants[spaceKey(hoverCard.el)]}
            hours={`${plan.openTime || "08:00"}–${plan.closeTime || "17:30"}`}
          />
        )}

        {/* side — desktop: right column. mobile: a bottom sheet that slides up only when a space is
            selected, so the floor plan owns the phone screen and the booking form is reachable
            without scrolling. */}
        <div
          className={cn(
            "flex min-h-0 flex-col gap-3.5",
            selected
              ? "fixed inset-x-0 bottom-0 z-50 max-h-[82vh] overflow-auto rounded-t-2xl border-t bg-card p-4 shadow-2xl lg:static lg:z-auto lg:max-h-none lg:overflow-auto lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
              : "hidden lg:flex lg:overflow-auto",
          )}
          style={selected ? { paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" } : undefined}
        >
          {selected && (
            <div className="relative mb-1 flex items-center justify-center lg:hidden">
              <span className="h-1 w-10 rounded-full bg-line" />
              <button onClick={() => setSelected(null)} aria-label="Close" className="absolute -top-1 right-0 grid size-9 place-items-center rounded-lg text-txt-mute hover:bg-panel-2">
                <X className="size-4" />
              </button>
            </div>
          )}
          <div className="hidden lg:block">
            <Legend />
          </div>
          <div className="flex-1 rounded-[14px] lg:border lg:bg-card lg:p-[15px] lg:shadow-sm">
            {!selected ? (
              <div className="px-2.5 py-7 text-center text-[13px] text-txt-mute">
                Select a {kind === "desk" ? "desk" : kind === "room" ? "meeting room" : kind === "parking" ? "parking bay" : "office"} on the
                map to see details{admin ? " and manage locks" : " and book"}.
              </div>
            ) : (
              <div key={selKey} className="animate-fade-up">
              <Detail
                el={selected}
                spaceStatus={selStatus}
                slots={selKey ? slots[selKey] ?? [] : []}
                admin={admin}
                office={office.b}
                officeOpen={plan.openTime || "08:00"}
                officeClose={plan.closeTime || "17:30"}
                today={todayInTz(plan.tz)}
                maxDate={maxAdvanceDate(plan.advanceDays, plan.tz)}
                repeat={repeat}
                setRepeat={setRepeat}
                repeatDays={repeatDays}
                setRepeatDays={setRepeatDays}
                repeatUntil={repeatUntil}
                setRepeatUntil={setRepeatUntil}
                onToggleLock={toggleLock}
                onBook={doBook}
                adminBooking={selKey ? adminBookings[selKey] : undefined}
                onAdminCancel={() => selected && cancelBookingAdmin(selected)}
                onBehalf={onBehalf}
                setOnBehalf={setOnBehalf}
                duration={duration}
                setDuration={setDuration}
                selDate={selDate}
                setSelDate={changeFromDate}
                endDate={endDate}
                setEndDate={setEndDate}
                half={half}
                setHalf={setHalf}
                startTime={startTime}
                setStartTime={changeStartTime}
                endTime={endTime}
                setEndTime={changeEndTime}
              />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function spaceLabel(el: SpaceEl): string {
  if (el.t === "desk") return `Desk ${el.label ?? el.id}`;
  if (el.t === "parking") return `Bay ${el.label ?? el.id}`;
  if (el.t === "office") return el.name ?? `Office ${el.id}`;
  return el.name;
}

function Detail({
  el,
  spaceStatus,
  slots,
  admin,
  office,
  officeOpen,
  officeClose,
  today,
  maxDate,
  repeat,
  setRepeat,
  repeatDays,
  setRepeatDays,
  repeatUntil,
  setRepeatUntil,
  onToggleLock,
  onBook,
  adminBooking,
  onAdminCancel,
  onBehalf,
  setOnBehalf,
  duration,
  setDuration,
  selDate,
  setSelDate,
  endDate,
  setEndDate,
  half,
  setHalf,
  startTime,
  setStartTime,
  endTime,
  setEndTime,
}: {
  el: SpaceEl;
  spaceStatus: SpaceStatus;
  slots: Slot[]; // this space's bookings on the selected day (times only)
  admin: boolean;
  office: string;
  officeOpen: string;
  officeClose: string;
  today: string; // today's date in the OFFICE timezone (min selectable date)
  maxDate?: string; // latest selectable START date under the site's advance-booking window (undefined = unlimited)
  repeat: boolean;
  setRepeat: (v: boolean) => void;
  repeatDays: boolean[]; // [Sun..Sat]
  setRepeatDays: (d: boolean[]) => void;
  repeatUntil: string;
  setRepeatUntil: (d: string) => void;
  onToggleLock: () => void;
  onBook: (el: SpaceEl) => void;
  adminBooking?: { id: string; user: string };
  onAdminCancel: () => void;
  onBehalf: string;
  setOnBehalf: (v: string) => void;
  duration: DurationType;
  setDuration: (d: DurationType) => void;
  selDate: string;
  setSelDate: (d: string) => void;
  endDate: string;
  setEndDate: (d: string) => void;
  half: "am" | "pm";
  setHalf: (h: "am" | "pm") => void;
  startTime: string;
  setStartTime: (t: string) => void;
  endTime: string;
  setEndTime: (t: string) => void;
}) {
  const label = spaceLabel(el);
  const isLocked = spaceStatus === "locked";
  // "booked" on the map means SOMETHING is booked today. Only a whole-day booking takes the space
  // out; hourly bookings leave gaps, so the space stays bookable (hourly) around them and the
  // server's conflict check remains the authority on overlaps.
  const isBooked = spaceStatus === "booked"; // whole day (the page maps hourly-only days to "partial")
  const partlyBooked = spaceStatus === "partial";
  // Half-day is retired from the UI (Full Day = office hours, Hourly covers shorter slots).
  // The "half" DurationType is kept in the model so existing/historical bookings still
  // display, validate, reschedule, report and export correctly.
  const durations: DurationType[] = partlyBooked ? ["hourly"] : ["full", "hourly"]; // pick() already switched to hourly

  return (
    <>
      <h3 className="font-heading text-base">{label}</h3>
      <div className="mb-3 text-[12.5px] text-txt-dim">
        {el.t === "desk" && `Hot desk · ${office}`}
        {el.t === "office" && `Private office · ${office}`}
        {el.t === "room" && `Meeting room · Exchange resource mailbox`}
        {el.t === "parking" && `Parking bay · ${office}`}
      </div>

      {el.t === "room" ? (
        <>
          <Kv label="Capacity" value={`${el.seats ?? 6} people`} />
          <Kv label="Equipment" value="Teams Room, display" />
          <Kv label="Hours" value={`${officeOpen} – ${officeClose}`} />
        </>
      ) : el.t === "parking" ? (
        <>
          <Kv label="Type" value="Parking bay" />
          <Kv label="Max booking" value="14 days" />
          <Kv label="Hours" value="00:00 – 23:59" />
        </>
      ) : (
        <>
          <Kv label="Type" value={el.t === "office" ? "Private office" : "Hot desk"} />
          <Kv label="Max booking" value={el.t === "office" ? "1 day" : "14 days"} />
          <Kv label="Hours" value={`${officeOpen} – ${officeClose}`} />
        </>
      )}

      {isLocked ? (
        <div className="mt-4 rounded-[10px] border border-[#7d8a90]/40 bg-[#9aa7ad]/15 p-3 text-[12.5px] text-txt-dim">
          Locked / disabled by an administrator — not bookable.
        </div>
      ) : isBooked ? (
        <div className="mt-4 rounded-[10px] border border-destructive/40 bg-destructive/10 p-3 text-[12.5px] text-destructive">
          Already booked for the selected date. Pick another date or space.
        </div>
      ) : (
        <>
          {partlyBooked && (
            <div className="mt-4 rounded-[10px] border border-amber/40 bg-amber/10 p-3 text-[12.5px]">
              <div className="mb-1 font-semibold">Booked on this day</div>
              <ul className="space-y-0.5 text-txt-dim">
                {slots.map((s, i) => (
                  <li key={i}>
                    {s.start.slice(11)}–{s.end.slice(11)}
                    {s.name ? ` · ${s.name}` : ""}
                  </li>
                ))}
              </ul>
              <div className="mt-1.5 text-txt-mute">Other times are free — pick an hourly slot below.</div>
            </div>
          )}
          <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Duration</div>
          <div className="my-2 flex overflow-hidden rounded-[9px] border bg-panel-2">
            {durations.map((d) => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className={cn("flex-1 px-2 py-1.5 text-[12.5px] font-semibold", duration === d ? "bg-primary text-primary-foreground" : "text-txt-dim")}
              >
                {DURATION_LABELS[d]}
              </button>
            ))}
          </div>

          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">
            {(el.t === "desk" || el.t === "parking") && duration === "full" ? "From" : "Date"}
          </div>
          <input type="date" aria-label={(el.t === "desk" || el.t === "parking") && duration === "full" ? "From date" : "Booking date"} value={selDate} min={today} max={maxDate} onChange={(e) => setSelDate(e.target.value)} className="ed-input my-2" />

          {(el.t === "desk" || el.t === "parking") && duration === "full" && !repeat && (
            <>
              <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">To (max 14 days)</div>
              <input type="date" aria-label="To date" value={endDate} min={selDate} onChange={(e) => setEndDate(e.target.value)} className="ed-input my-2" />
            </>
          )}

          {duration === "half" && (
            <div className="my-2 flex overflow-hidden rounded-[9px] border bg-panel-2">
              {(["am", "pm"] as const).map((h) => (
                <button key={h} onClick={() => setHalf(h)} className={cn("flex-1 px-2 py-1.5 text-[12.5px] font-semibold uppercase", half === h ? "bg-primary text-primary-foreground" : "text-txt-dim")}>
                  {h}
                </button>
              ))}
            </div>
          )}

          {duration === "hourly" && (
            <div className="my-2 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] text-txt-mute">Start</span>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="ed-input" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-txt-mute">End</span>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="ed-input" />
              </label>
            </div>
          )}

          {/* Repeat weekly: the same space on chosen weekdays through an end date (one booking per date). */}
          <label className="my-2 flex items-center gap-2 text-[12.5px]">
            <input
              type="checkbox"
              checked={repeat}
              onChange={(e) => {
                const on = e.target.checked;
                setRepeat(on);
                // default to the selected date's weekday so "repeat" means "this day, every week"
                if (on && !repeatDays.some(Boolean)) {
                  const wd = new Date(`${selDate}T00:00:00Z`).getUTCDay();
                  setRepeatDays(repeatDays.map((_, i) => i === wd));
                }
              }}
              className="size-4 accent-[var(--orange)]"
            />
            Repeat weekly
          </label>
          {repeat && (
            <div className="my-2 rounded-[10px] border bg-panel-2 p-2.5">
              <div className="flex gap-1">
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={repeatDays[i]}
                    aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i]}
                    onClick={() => setRepeatDays(repeatDays.map((v, j) => (j === i ? !v : v)))}
                    className={cn("size-8 rounded-full text-[12px] font-bold", repeatDays[i] ? "bg-primary text-primary-foreground" : "bg-card text-txt-dim")}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Until</div>
              <input type="date" aria-label="Repeat until" value={repeatUntil || selDate} min={selDate} max={maxDate} onChange={(e) => setRepeatUntil(e.target.value)} className="ed-input mt-1" />
              {(() => {
                const p = expandWeekly({ startDate: selDate, until: repeatUntil || selDate, weekdays: repeatDays });
                return (
                  <div className={cn("mt-1.5 text-[11.5px]", "error" in p ? "text-destructive" : "text-txt-mute")}>
                    {"error" in p ? p.error : `${p.dates.length} booking${p.dates.length === 1 ? "" : "s"} will be made (each a single day).`}
                  </div>
                );
              })()}
            </div>
          )}

          {admin && (
            <label className="my-2 block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Book on behalf of (optional)</span>
              <input
                type="email"
                value={onBehalf}
                placeholder="colleague@company.com — blank = yourself"
                onChange={(e) => setOnBehalf(e.target.value)}
                className="ed-input"
              />
              <span className="mt-1 block text-[11px] text-txt-mute">The booking and Outlook invite go to this person; you are recorded as the booker.</span>
            </label>
          )}

          <button
            onClick={() => onBook(el)}
            className="mt-2 w-full rounded-[10px] bg-primary px-4 py-2.5 text-[13.5px] font-semibold text-primary-foreground hover:bg-orange-soft"
          >
            {repeat ? "Book all dates" : el.t === "room" ? "Book & invite via Outlook" : admin && onBehalf.trim() ? "Book for colleague" : "Confirm booking"}
          </button>
        </>
      )}

      {admin && (
        <button
          onClick={onToggleLock}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-[10px] border bg-panel-2 px-4 py-2.5 text-[13.5px] font-semibold"
        >
          {isLocked ? <Unlock className="size-4" /> : <Lock className="size-4" />}
          {isLocked ? "Unlock / enable" : "Lock / disable"}
        </button>
      )}

      {admin && adminBooking && (
        <button
          onClick={onAdminCancel}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-[10px] border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-[13.5px] font-semibold text-destructive"
        >
          <Trash2 className="size-4" /> Cancel this booking ({adminBooking.user})
        </button>
      )}
    </>
  );
}

// Lightweight desk hover card (Kadence-style). Pointer devices only — rendered fixed to the
// viewport at the cursor, pointer-events:none so it never blocks selecting/booking a desk.
const HOVER_STATUS: Record<SpaceStatus, { label: string; cls: string }> = {
  free: { label: "Bookable", cls: "bg-ok/15 text-ok" },
  booked: { label: "Booked", cls: "bg-destructive/15 text-destructive" },
  locked: { label: "Reserved", cls: "bg-[#9aa7ad]/20 text-txt-mute" },
  maintenance: { label: "Maintenance", cls: "bg-amber/15 text-amber" },
  partial: { label: "Partly booked", cls: "bg-amber/15 text-amber" },
};

function DeskHoverCard({ el, x, y, status, occupant, hours }: { el: SpaceEl; x: number; y: number; status: SpaceStatus; occupant?: string; hours: string }) {
  const W = 232;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const left = x + 16 + W > vw ? Math.max(8, x - W - 16) : x + 16;
  const top = Math.min(y + 16, vh - 150);
  const s = HOVER_STATUS[status] ?? HOVER_STATUS.free;
  const kind = el.t;
  const Icon = kind === "room" ? Users : kind === "office" ? DoorClosed : Monitor;
  const seats = kind === "room" ? (el as Extract<SpaceEl, { t: "room" }>).seats : undefined;
  const typeLabel = kind === "room" ? `Meeting room${seats ? ` · ${seats} people` : ""}` : kind === "office" ? "Private office" : "Hot desk";
  const span = kind === "desk" ? " · up to 14 days" : kind === "office" ? " · 1 day" : "";
  return (
    <div
      className="pointer-events-none fixed z-50 animate-fade-in"
      style={{ left, top, width: W }}
      role="tooltip"
    >
      <div className="rounded-[12px] border bg-card p-3 shadow-xl">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
          <b className="flex-1 truncate text-[13.5px]">{spaceLabel(el)}</b>
          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${s.cls}`}>{s.label}</span>
        </div>
        <div className="mt-2 border-t pt-2 text-[11.5px] text-txt-mute">
          <div>{typeLabel}</div>
          {status === "partial" ? (
            <div className="mt-0.5">Booked for part of the day{occupant ? ` by ${occupant}` : ""} — other hours free</div>
          ) : status === "booked" && occupant ? (
            <div className="mt-0.5">Booked by {occupant}</div>
          ) : status === "locked" ? (
            <div className="mt-0.5">Reserved / disabled by an administrator</div>
          ) : (
            <div className="mt-0.5">Site hours {hours}{span}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b py-[7px] text-[12.5px]">
      <span className="text-txt-mute">{label}</span>
      <b className="font-semibold">{value}</b>
    </div>
  );
}
