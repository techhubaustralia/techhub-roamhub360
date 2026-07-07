import { NextResponse } from "next/server";
import { listBookings } from "@/lib/server/db";
import { ACTIVE_STATUSES } from "@/lib/booking-rules";
import { getUser } from "@/lib/server/auth";
import { getHiddenPresenceEmails } from "@/lib/server/users";
import { buildWeekdayStats, recommend } from "@/lib/presence-insights";
import { rateLimit, clientIp, tooMany } from "@/lib/server/rate-limit";

// Team Build-Up F — presence analytics. Looks back over recent weeks (tenant-scoped) and tallies
// per-weekday presence to reveal the team's in-office pattern + a recommendation. Aggregate only;
// respects presence opt-outs (C) so hidden people don't even count towards the numbers.

const ymd = (date: string): [number, number, number] => date.slice(0, 10).split("-").map(Number) as [number, number, number];
const addDays = (date: string, n: number): string => {
  const [y, m, d] = ymd(date);
  return new Date(Date.UTC(y, m - 1, d) + n * 86400000).toISOString().slice(0, 10);
};
const weekdayOf = (date: string): number => {
  const [y, m, d] = ymd(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
const rootOf = (id: string) => id.split("__")[0];

export async function GET(req: Request) {
  const rl = rateLimit(`insights:ip:${clientIp(req)}`, 60, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfter);

  await getUser(); // auth (middleware already gates; this also resolves the tenant)
  const q = new URL(req.url).searchParams;
  const weeks = Math.min(Math.max(Number(q.get("weeks")) || 6, 1), 26);
  const site = q.get("site") && q.get("site") !== "all" ? q.get("site")! : null;

  const today = new Date().toISOString().slice(0, 10);
  const windowStart = addDays(today, -(weeks * 7 - 1)); // inclusive window of `weeks` weeks ending today

  const hidden = await getHiddenPresenceEmails();
  // Query from 14 days before the window so multi-day bookings that started earlier still count.
  const rows = (await listBookings({ from: addDays(windowStart, -14), to: today })).filter(
    (b) => ACTIVE_STATUSES.includes(b.status) && !hidden.has(b.userEmail.toLowerCase()) && (!site || rootOf(b.buildingId) === site),
  );

  const presence = new Array(7).fill(0);
  for (const b of rows) {
    // Count each day this booking covers, clamped to the window.
    let day = b.start.slice(0, 10) < windowStart ? windowStart : b.start.slice(0, 10);
    const last = b.end.slice(0, 10) > today ? today : b.end.slice(0, 10);
    for (; day <= last; day = addDays(day, 1)) presence[weekdayOf(day)]++;
  }

  const occurrences = new Array(7).fill(0);
  for (let day = windowStart; day <= today; day = addDays(day, 1)) occurrences[weekdayOf(day)]++;

  const weekdays = buildWeekdayStats(presence, occurrences);
  return NextResponse.json({ weeks, from: windowStart, to: today, weekdays, recommendation: recommend(weekdays) });
}
