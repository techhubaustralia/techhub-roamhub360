// Shared booking rules (client + server). Times are ISO-local strings "YYYY-MM-DDTHH:mm".

export type Kind = "desk" | "office" | "room" | "parking";
export type DurationType = "hourly" | "half" | "full";

export const OFFICE_OPEN = "08:00";
export const OFFICE_CLOSE = "17:30";
export const ROOM_OPEN = "00:00";
export const ROOM_CLOSE = "23:59";

// Multi-day model: a desk booking is a single CONTINUOUS block (start..end) capped at
// MAX_DAYS; it holds the desk for the whole span and is checked in per day (CheckIn is
// unique per booking+date). Offices/rooms are single-day. This is consistent across the
// conflict check (overlaps), occupancy, and validation below.
export const MAX_DAYS: Record<Kind, number> = { desk: 14, office: 1, room: 1, parking: 14 };

export const DURATION_LABELS: Record<DurationType, string> = {
  hourly: "Hourly",
  half: "Half day",
  full: "Full day",
};

export function windowFor(kind: Kind, hours?: { open?: string; close?: string }): { open: string; close: string } {
  // Parking is bookable around the clock (people arrive/leave at any hour).
  // Meeting rooms default to the office's configured opening hours (falling back to the
  // standard office window); desks and offices follow the standard office hours.
  if (kind === "parking") return { open: ROOM_OPEN, close: ROOM_CLOSE };
  if (kind === "room") return { open: hours?.open || OFFICE_OPEN, close: hours?.close || OFFICE_CLOSE };
  return { open: OFFICE_OPEN, close: OFFICE_CLOSE };
}

const iso = (date: string, time: string) => `${date}T${time}`;

// ---- timezone / DST-safe date arithmetic ----
// Booking times are wall-clock strings in the office's local timezone. All date math
// below is done on the calendar components via Date.UTC (never local Date parsing),
// so it is immune to the server timezone and to DST transitions.
const ymd = (date: string): [number, number, number] => {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return [y, m, d];
};
const addDays = (date: string, n: number): string => {
  const [y, m, d] = ymd(date);
  return new Date(Date.UTC(y, m - 1, d) + n * 86400000).toISOString().slice(0, 10);
};
export const daysBetween = (startDate: string, endDate: string): number => {
  const [y1, m1, d1] = ymd(startDate);
  const [y2, m2, d2] = ymd(endDate);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1;
};

/** Today's calendar date (YYYY-MM-DD) in the given IANA timezone. Falls back to the
 *  server's date only when no timezone is supplied. */
export function todayInTz(tz?: string): string {
  if (!tz) return new Date().toISOString().slice(0, 10);
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Current wall-clock minute (YYYY-MM-DDTHH:mm) in the given IANA timezone. */
export function nowInTz(tz?: string): string {
  const d = new Date();
  if (!tz) return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
    const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
    const hh = g("hour") === "24" ? "00" : g("hour");
    return `${g("year")}-${g("month")}-${g("day")}T${hh}:${g("minute")}`;
  } catch {
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
}

/** Build start/end ISO-local strings from the picker inputs. */
export function deriveTimes(opts: {
  kind: Kind;
  duration: DurationType;
  startDate: string;
  endDate?: string; // desk multi-day full-day only
  startTime?: string; // hourly
  endTime?: string; // hourly
  half?: "am" | "pm";
  hours?: { open?: string; close?: string }; // office hours (rooms default to these)
}): { start: string; end: string } {
  const { kind, duration, startDate } = opts;
  const w = windowFor(kind, opts.hours);
  if (duration === "hourly") {
    return { start: iso(startDate, opts.startTime || w.open), end: iso(startDate, opts.endTime || w.close) };
  }
  if (duration === "half") {
    const mid = kind === "room" || kind === "parking" ? "12:00" : "12:45";
    return opts.half === "pm"
      ? { start: iso(startDate, mid), end: iso(startDate, w.close) }
      : { start: iso(startDate, w.open), end: iso(startDate, mid) };
  }
  // full day (desk/parking may span multiple days to endDate)
  const last = (kind === "desk" || kind === "parking") && opts.endDate ? opts.endDate : startDate;
  return { start: iso(startDate, w.open), end: iso(last, w.close) };
}

export interface BookingPolicy {
  advanceDays?: number;
  allowedWeekdays?: boolean[]; // [Sun..Sat]
  allowPast?: boolean;
  maxHours?: number; // per-room max booking duration (hours)
  tz?: string; // office IANA timezone, for "today" / past checks
  openTime?: string; // office opening time — meeting-room booking window start
  closeTime?: string; // office closing time — meeting-room booking window end
}
const minutesOfDay = (iso: string) => {
  const [h, m] = iso.slice(11).split(":").map(Number);
  return h * 60 + m;
};
/** Wall-clock hours between two local strings — DST-immune (pure calendar math). */
const wallClockHours = (start: string, end: string) => (daysBetween(start, end) - 1) * 24 + (minutesOfDay(end) - minutesOfDay(start)) / 60;
const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Returns an error string, or null if valid. */
export function validateBooking(kind: Kind, start: string, end: string, policy?: BookingPolicy, durationType?: DurationType): string | null {
  if (!start || !end) return "Pick a date and time.";
  if (end <= start) return "End must be after start.";
  const startDate = start.slice(0, 10);
  const endDate = end.slice(0, 10);

  if (policy) {
    const todayStr = todayInTz(policy.tz); // office-local "today", not the server's
    if (!policy.allowPast) {
      const now = nowInTz(policy.tz); // office-local "now" (YYYY-MM-DDTHH:mm), DST-safe
      if (startDate < todayStr) return "That date is in the past.";
      // A slot that has already fully elapsed is never bookable (any duration type).
      if (end <= now) return "That time has already passed. Pick a later slot.";
      // Hourly bookings must START in the future. (Full/half-day start at the fixed office-open
      // time, so they stay bookable for the rest of today as long as they haven't ended.)
      if (durationType === "hourly" && start < now) return "That start time has already passed. Pick a later slot.";
    }
    if (policy.advanceDays && policy.advanceDays > 0 && startDate > addDays(todayStr, policy.advanceDays)) {
      return `Bookings can be made at most ${policy.advanceDays} day${policy.advanceDays === 1 ? "" : "s"} ahead.`;
    }
    if (policy.allowedWeekdays && policy.allowedWeekdays.length === 7) {
      const [y, m, d] = ymd(startDate);
      const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      if (!policy.allowedWeekdays[wd]) return `${WD[wd]} is not bookable at this site.`;
    }
    if (kind === "room" && policy.maxHours && policy.maxHours > 0 && wallClockHours(start, end) > policy.maxHours + 1e-6) {
      return `This room can be booked for at most ${policy.maxHours} hour${policy.maxHours === 1 ? "" : "s"}.`;
    }
  }

  const span = daysBetween(startDate, endDate);
  if (span > MAX_DAYS[kind]) {
    return kind === "desk"
      ? "Desk bookings cannot exceed 14 days."
      : `${kind === "office" ? "Office" : "Meeting room"} bookings cannot exceed 1 day.`;
  }
  const w = windowFor(kind, { open: policy?.openTime, close: policy?.closeTime });
  const startTime = start.slice(11);
  const endTime = end.slice(11);
  if (startTime < w.open || endTime > w.close) {
    if (kind === "parking") return "Outside parking hours (00:00–23:59).";
    if (kind === "room") return `Outside room hours (${w.open}–${w.close}).`;
    return "Outside office hours (08:00–17:30).";
  }
  return null;
}

/** Two [start,end) intervals overlap (ISO-local strings compare chronologically). */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export const ACTIVE_STATUSES = ["Booked", "Checked in"];
