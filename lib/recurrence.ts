// Weekly recurrence expansion for "Repeat weekly" bookings (client + server safe, unit-tested).
// Turns a start date, an end date and a set of weekdays into the discrete dates to book — one
// single-day booking per date. The server is authoritative (it re-expands and applies every
// booking rule per date); the client uses the same function only to preview the count.

export const MAX_OCCURRENCES = 60;
const MAX_SPAN_DAYS = 366; // never scan more than a year, whatever the inputs

export interface WeeklyRecurrence {
  startDate: string; // YYYY-MM-DD, first candidate date (inclusive)
  until: string; // YYYY-MM-DD, last candidate date (inclusive)
  weekdays: boolean[]; // [Sun..Sat]
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ymd = (d: string) => d.split("-").map(Number) as [number, number, number];
const addDay = (date: string): string => {
  const [y, m, d] = ymd(date);
  return new Date(Date.UTC(y, m - 1, d) + 86400000).toISOString().slice(0, 10);
};
const utcDow = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();
const spanDays = (from: string, to: string): number => {
  const [y1, m1, d1] = ymd(from);
  const [y2, m2, d2] = ymd(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1;
};

/** Every date from `startDate` to `until` whose weekday is selected, or a clear error. Refuses
 *  (rather than silently truncating) when more than `max` dates would result. */
export function expandWeekly(r: WeeklyRecurrence, max = MAX_OCCURRENCES): { dates: string[] } | { error: string } {
  if (!DATE_RE.test(r.startDate) || !DATE_RE.test(r.until)) return { error: "Dates must be YYYY-MM-DD." };
  if (r.until < r.startDate) return { error: "The repeat-until date is before the start date." };
  if (r.weekdays.length !== 7 || !r.weekdays.some(Boolean)) return { error: "Choose at least one weekday to repeat on." };
  if (spanDays(r.startDate, r.until) > MAX_SPAN_DAYS) return { error: "Repeat at most a year ahead." };
  const dates: string[] = [];
  for (let d = r.startDate; d <= r.until; d = addDay(d)) {
    if (!r.weekdays[utcDow(d)]) continue;
    dates.push(d);
    if (dates.length > max) return { error: `That would create more than ${max} bookings — shorten the range or pick fewer days.` };
  }
  if (!dates.length) return { error: "None of the selected weekdays fall in that range." };
  return { dates };
}
