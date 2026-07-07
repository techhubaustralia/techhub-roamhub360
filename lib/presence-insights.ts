// Pure analytics for team presence patterns (Team Build-Up F). No server-only imports so it can
// be unit-tested. Turns per-weekday presence tallies into stats + a plain-English recommendation.

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface WeekdayStat {
  weekday: number; // 0=Sun .. 6=Sat
  label: string;
  presenceDays: number; // total person-days seen on this weekday across the window
  occurrences: number; // how many times this weekday occurred in the window
  avg: number; // average people in on this weekday
}

/** Combine raw tallies (indexed 0=Sun..6=Sat) into per-weekday stats. */
export function buildWeekdayStats(presenceByWeekday: number[], occurrencesByWeekday: number[]): WeekdayStat[] {
  return WEEKDAYS.map((label, wd) => {
    const presenceDays = presenceByWeekday[wd] ?? 0;
    const occurrences = occurrencesByWeekday[wd] ?? 0;
    return { weekday: wd, label, presenceDays, occurrences, avg: occurrences ? presenceDays / occurrences : 0 };
  });
}

export interface Recommendation {
  busiest: number[]; // weekday indices tied for busiest (workdays only)
  quietest: number | null;
  message: string;
}

/** Recommend based on the Mon–Fri pattern: which day(s) the team is usually in, and the quietest. */
export function recommend(stats: WeekdayStat[]): Recommendation {
  const workdays = stats.filter((s) => s.weekday >= 1 && s.weekday <= 5 && s.occurrences > 0);
  const withPeople = workdays.filter((s) => s.avg > 0);
  if (withPeople.length === 0) {
    return { busiest: [], quietest: null, message: "Not enough history yet to spot a pattern." };
  }
  const maxAvg = Math.max(...withPeople.map((s) => s.avg));
  const busiest = withPeople.filter((s) => s.avg >= maxAvg - 1e-9).map((s) => s.weekday);
  const minAvg = Math.min(...withPeople.map((s) => s.avg));
  const quietest = withPeople.length > 1 ? withPeople.find((s) => s.avg <= minAvg + 1e-9)?.weekday ?? null : null;

  const names = busiest.map((wd) => `${WEEKDAYS[wd]}s`);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  let message = `Your team is usually in on ${list}.`;
  if (quietest != null && !busiest.includes(quietest)) {
    message += ` ${WEEKDAYS[quietest]}s are quietest — a good day to beat the crowd.`;
  }
  return { busiest, quietest, message };
}
