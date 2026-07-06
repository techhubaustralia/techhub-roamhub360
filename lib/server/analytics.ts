import "server-only";
import { listBookings, type Booking } from "./db";
import { listCustomBuildings, listHiddenBuildings, getStoredPlan } from "./store";

export interface Analytics {
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
  heatmap: number[][]; // [weekday 0..6][hour 0..23]
  topSpaces: { label: string; building: string; count: number }[];
  topUsers: { user: string; count: number }[];
  byBuilding: { id: string; name: string; count: number }[];
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dateOf = (s: string) => s.slice(0, 10);
const hourOf = (s: string) => Number(s.slice(11, 13)) || 0;

function businessDays(from: string, to: string, includeWeekends: boolean): number {
  let n = 0;
  const d = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (d <= end) {
    const wd = d.getUTCDay();
    if (includeWeekends || (wd !== 0 && wd !== 6)) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return Math.max(1, n);
}

// ISO week label (YYYY-Www) for weekly rollups.
function isoWeek(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const rootOf = (buildingId: string) => buildingId.split("__")[0];

export async function computeAnalytics(opts: { from: string; to: string; buildingId?: string; includeWeekends?: boolean }): Promise<Analytics> {
  // Fetch by date range only; building scoping is applied by root below so multi-floor
  // bookings (buildingId = `<root>__floor-N`) are included under their building.
  // Page through so the per-call row cap can never silently undercount the aggregation.
  const PAGE = 2000;
  const all: Booking[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const chunk = await listBookings({ from: opts.from, to: opts.to, limit: PAGE, offset });
    all.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  const hidden = new Set(await listHiddenBuildings());
  // The set of buildings that STILL EXIST. A deleted custom building is removed from this
  // list (not added to `hidden`), so filtering on "not hidden" alone left its bookings in
  // analytics — that was the stale-data bug. Filter strictly to live buildings by root id.
  const customs = (await listCustomBuildings()).filter((c) => !hidden.has(c.id));
  const nameById = new Map(customs.map((c) => [c.id, c.name]));
  const liveRoots = new Set(customs.map((c) => c.id));
  const rows = all.filter(
    (b: Booking) => liveRoots.has(rootOf(b.buildingId)) && (!opts.buildingId || rootOf(b.buildingId) === opts.buildingId),
  );
  const scope = opts.buildingId ? customs.filter((c) => c.id === opts.buildingId) : customs;
  const cap = { desk: 0, office: 0, room: 0, parking: 0 };
  for (const c of scope) {
    const plan = await getStoredPlan(c.id);
    if (!plan) continue;
    // A building's floors/rooms/parking levels are separate plans; count spaces across all of them.
    const floorPlans = [plan];
    for (const f of c.floors ?? []) {
      if (f.id === c.id) continue;
      const fp = await getStoredPlan(f.id);
      if (fp) floorPlans.push(fp);
    }
    for (const p of floorPlans) {
      for (const e of p.els) {
        if (e.t === "desk") cap.desk++;
        else if (e.t === "office") cap.office++;
        else if (e.t === "room") cap.room++;
        else if (e.t === "parking") cap.parking++;
      }
    }
  }

  const byKind = { desk: 0, office: 0, room: 0, parking: 0 };
  const users = new Map<string, number>();
  const spaces = new Map<string, { label: string; building: string; count: number }>();
  const daily = new Map<string, number>();
  const weekly = new Map<string, number>();
  const monthly = new Map<string, number>();
  const hours = new Array(24).fill(0);
  const days = new Array(7).fill(0);
  const heatmap: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const byBuilding = new Map<string, number>();
  // Attendance: someone "showed up" if they checked in OR out (checkout implies they arrived).
  // The no-show denominator excludes cancelled/declined bookings — a cancellation is not a no-show.
  let attended = 0;
  let expected = 0;

  for (const b of rows) {
    if (b.kind in byKind) byKind[b.kind as keyof typeof byKind]++;
    users.set(b.userEmail, (users.get(b.userEmail) ?? 0) + 1);
    const root = rootOf(b.buildingId);
    const sk = `${b.buildingId}:${b.spaceLabel}`;
    const s = spaces.get(sk) ?? { label: b.spaceLabel, building: nameById.get(root) ?? root, count: 0 };
    s.count++;
    spaces.set(sk, s);
    const d = dateOf(b.start);
    daily.set(d, (daily.get(d) ?? 0) + 1);
    weekly.set(isoWeek(d), (weekly.get(isoWeek(d)) ?? 0) + 1);
    monthly.set(d.slice(0, 7), (monthly.get(d.slice(0, 7)) ?? 0) + 1);
    const wd = new Date(d + "T00:00:00Z").getUTCDay();
    const hr = hourOf(b.start);
    hours[hr]++;
    days[wd]++;
    heatmap[wd][hr]++;
    byBuilding.set(root, (byBuilding.get(root) ?? 0) + 1);
    const cancelled = b.status === "Cancelled" || b.status === "Declined";
    if (!cancelled) expected++;
    if (b.status === "Checked in" || b.status === "Checked out") attended++;
  }

  const bizDays = businessDays(opts.from, opts.to, opts.includeWeekends ?? false);
  const util = (booked: number, capacity: number) => (capacity ? Math.min(100, Math.round((booked / (capacity * bizDays)) * 100)) : 0);
  const sortByLabel = (m: Map<string, number>) => [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, count]) => ({ label, count }));

  // daily series filled across the range (zeros where no bookings)
  const dailySeries: { date: string; count: number }[] = [];
  {
    const d = new Date(opts.from + "T00:00:00Z");
    const end = new Date(opts.to + "T00:00:00Z");
    while (d <= end) {
      const key = d.toISOString().slice(0, 10);
      dailySeries.push({ date: key, count: daily.get(key) ?? 0 });
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }

  return {
    range: { from: opts.from, to: opts.to, days: bizDays },
    totals: {
      bookings: rows.length,
      activeUsers: users.size,
      checkInRate: expected ? Math.round((attended / expected) * 100) : 0,
      noShowRate: expected ? 100 - Math.round((attended / expected) * 100) : 0,
    },
    byKind,
    capacity: cap,
    utilisation: {
      desk: util(byKind.desk, cap.desk),
      office: util(byKind.office, cap.office),
      room: util(byKind.room, cap.room),
      parking: util(byKind.parking, cap.parking),
    },
    daily: dailySeries,
    weekly: sortByLabel(weekly),
    monthly: sortByLabel(monthly),
    peakHours: hours.map((count, hour) => ({ hour, count })),
    peakDays: days.map((count, i) => ({ day: DOW[i], count })),
    heatmap,
    topSpaces: [...spaces.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    topUsers: [...users.entries()].map(([user, count]) => ({ user, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    byBuilding: [...byBuilding.entries()].map(([id, count]) => ({ id, name: nameById.get(id) ?? id, count })).sort((a, b) => b.count - a.count),
  };
}
