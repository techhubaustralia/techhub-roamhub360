"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusPill } from "@/components/status-pill";
import { BookingItem } from "@/components/booking-item";
import { SetupChecklist } from "@/components/setup-checklist";
import { UpgradeNudge } from "@/components/upgrade-nudge";
import { getBookings, setBookingStatusApi, isActiveBooking, type Booking } from "@/lib/api";
import { getBuildingsMeta } from "@/lib/plan-store";

const kindTag = (k: string) => (k === "room" ? "room" : k === "office" ? "office" : k === "parking" ? "parking" : "desk") as "desk" | "room" | "office" | "parking";

export default function HomePage() {
  const [user, setUser] = useState<{ name: string }>({ name: "there" });
  const [rows, setRows] = useState<Booking[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [sites, setSites] = useState(0);
  const [loading, setLoading] = useState(true);
  // Set on the client only, with a fixed locale, so SSR and hydration agree
  // (an `undefined` locale + the server timezone caused a hydration mismatch).
  const [today, setToday] = useState("");

  async function load() {
    setRows(await getBookings());
    setLoading(false);
  }
  useEffect(() => {
    fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then((u) => u && setUser({ name: u.name?.split(" ")[0] ?? "there" })).catch(() => {});
    load();
    getBuildingsMeta().then((m) => {
      const visible = m.custom.filter((c) => !m.hidden.includes(c.id));
      setNames(Object.fromEntries(m.custom.map((c) => [c.id, c.name])));
      setSites(visible.length);
    });
    setToday(new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }));
  }, []);

  const bName = (id: string) => names[id] ?? names[id.split("__")[0]] ?? id;

  // Active = live, non-cancelled, not yet ended. Past/cancelled/declined live in My bookings → History.
  const active = useMemo(
    () => rows.filter((r) => isActiveBooking(r)).sort((a, b) => a.start.localeCompare(b.start)),
    [rows],
  );
  const total = active.length;
  const checkedIn = active.filter((r) => r.status === "Checked in").length;
  const pending = total - checkedIn;

  async function checkIn(id: string) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: "Checked in" } : r)));
    await setBookingStatusApi(id, "Checked in");
    toast.success("Checked in", { description: "Booking confirmed" });
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        title={`Welcome, ${user.name}`}
        subtitle={today}
        action={
          <Link href="/book" className="rounded-[10px] bg-primary px-4 py-2.5 text-[13.5px] font-semibold text-primary-foreground hover:bg-orange-soft">
            + Book a space
          </Link>
        }
      />

      <UpgradeNudge />
      <SetupChecklist />

      <div className="mb-[15px] grid gap-[15px] sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active bookings" value={String(total)} delta="upcoming" deltaType="flat" />
        <StatCard label="Checked in" value={String(checkedIn)} delta="confirmed" />
        <StatCard label="Pending check-in" value={String(pending)} delta="awaiting" deltaType="flat" />
        <StatCard label="Sites" value={String(sites)} delta="bookable buildings" deltaType="flat" />
      </div>

      <Card className="p-[17px]">
        <div className="mb-3.5 flex items-center justify-between font-heading text-[15px] font-bold">
          Your upcoming bookings
          <Link href="/mine" className="text-[12.5px] font-semibold text-primary">View all</Link>
        </div>

        {loading ? (
          <p className="py-6 text-center text-[13px] text-txt-mute">Loading…</p>
        ) : total === 0 ? (
          <div className="py-8 text-center">
            <p className="text-[13px] text-txt-dim">No upcoming bookings.</p>
            <Link href="/book" className="mt-3 inline-block rounded-[10px] bg-primary px-4 py-2.5 text-[13.5px] font-semibold text-primary-foreground hover:bg-orange-soft">
              Book a space
            </Link>
          </div>
        ) : (
          active.slice(0, 5).map((r) => (
            <BookingItem
              key={r.id}
              kind={kindTag(r.kind)}
              tag={r.spaceLabel.slice(0, 8)}
              title={`${r.spaceLabel} · ${bName(r.buildingId)}`}
              sub={`${r.start.replace("T", " ")} · ${r.kind}`}
              trailing={
                r.status === "Checked in" ? (
                  <StatusPill variant="ok">Checked in</StatusPill>
                ) : (
                  <button onClick={() => checkIn(r.id)} className="rounded-[10px] bg-primary px-3 py-1.5 text-[13px] font-semibold text-primary-foreground hover:bg-orange-soft">
                    Check in
                  </button>
                )
              }
            />
          ))
        )}
      </Card>
    </div>
  );
}
