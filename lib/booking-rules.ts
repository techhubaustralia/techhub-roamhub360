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
  // Parking is bookable around the clock (people arrive/leave at any hour). Desks, offices and
  // meeting rooms all follow the SITE's configured opening hours (editor → Opening hours); the
  // standard 08:00–17:30 window is only the fallback for a site that has none set.
  if (kind === "parking") return { open: ROOM_OPEN, close: ROOM_CLOSE };
  return { open: hours?.open || OFFICE_OPEN, close: hours?.close || OFFICE_CLOSE };
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

// Platform default timezone. Every "now"/"today" comparison is site-local; when a site hasn't set
// its own IANA zone we resolve to THIS business timezone, never the server's (the droplet runs UTC,
// which is hours off for a real site and silently corrupts past/today/check-in checks). Configurable
// per deployment via APP_DEFAULT_TZ; defaults to the primary market (Australia/Sydney).
export const DEFAULT_TZ = process.env.APP_DEFAULT_TZ || "Australia/Sydney";

/** Today's calendar date (YYYY-MM-DD) in the given IANA timezone, or the platform default when the
 *  site has no zone. Never falls back to the server's clock. */
export function todayInTz(tz?: string): string {
  const zone = tz || DEFAULT_TZ;
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }
}

/** Current wall-clock minute (YYYY-MM-DDTHH:mm) in the given IANA timezone, or the platform default
 *  when the site has no zone. Never falls back to the server's clock. */
export function nowInTz(tz?: string): string {
  const d = new Date();
  const fmt = (zone: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
    const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
    const hh = g("hour") === "24" ? "00" : g("hour");
    return `${g("year")}-${g("month")}-${g("day")}T${hh}:${g("minute")}`;
  };
  try {
    return fmt(tz || DEFAULT_TZ);
  } catch {
    return fmt(DEFAULT_TZ);
  }
}

// Auto-release of un-checked-in bookings runs from the 30-minute jobs tick, so a per-site time is
// only honoured when it lands on a :00/:30 slot — anything else would never equal the tick's hhmm
// and silently never fire. Single source of truth for the default and the rule.
export const AUTO_RELEASE_DEFAULT = "09:30";
export const TICK_TIME_RE = /^([01]\d|2[0-3]):(00|30)$/;
/** The effective auto-release time for a site: its configured value when it is a valid tick slot,
 *  else the platform default. */
export function autoReleaseTimeFor(configured?: string): string {
  return configured && TICK_TIME_RE.test(configured) ? configured : AUTO_RELEASE_DEFAULT;
}

/** Latest date (YYYY-MM-DD) a booking may START under the site's advance-booking window, in the
 *  site's zone (platform default when unset). Undefined = no limit (advanceDays 0/undefined). Lets
 *  date pickers disable out-of-window days up front instead of rejecting after the click; mirrors
 *  the advanceDays rule in validateBooking, which stays authoritative. */
export function maxAdvanceDate(advanceDays?: number, tz?: string): string | undefined {
  if (!advanceDays || advanceDays <= 0) return undefined;
  return addDays(todayInTz(tz), advanceDays);
}

/** Whether a booking may be checked in RIGHT NOW, evaluated in the site's zone (platform default
 *  when unset — never the server clock). Check-in is only valid inside the booking's own date span:
 *  not before its start date (an early check-in counts someone as present who isn't, and shields a
 *  no-show from auto-release) and not after it has ended. When `openTime` (HH:mm) is set, check-in
 *  on the start day additionally cannot begin before that time; unset/malformed = from 00:00 (date
 *  only). Multi-day desks: any day within the span is valid. Returns an error string, or null when
 *  check-in is allowed. One rule shared by the UI hint, the PATCH route, and the signed email link. */
export function checkInWindowError(startLocal: string, endLocal: string, tz?: string, openTime?: string): string | null {
  const startDate = startLocal.slice(0, 10);
  const endDate = endLocal.slice(0, 10);
  if (todayInTz(tz) > endDate) return "This booking has ended and can no longer be checked in.";
  // Earliest permitted instant = start date at the gate time. Comparing the site's wall-clock "now"
  // against it covers "before the booking date" and "before open time today" in one check, and a
  // later day of a multi-day span is already past the start-day gate.
  const gate = openTime && /^\d{2}:\d{2}$/.test(openTime) ? openTime : "00:00";
  if (nowInTz(tz) < `${startDate}T${gate}`) {
    return gate === "00:00"
      ? "You can only check in on the day of your booking."
      : `Check-in for this booking opens at ${gate} on ${startDate}.`;
  }
  return null;
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
  hours?: { open?: string; close?: string }; // the site's opening hours (desks, offices and rooms all use them)
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
  openTime?: string; // site opening time — booking window start for desks, offices and rooms
  closeTime?: string; // site closing time — booking window end
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
    return `Outside site hours (${w.open}–${w.close}).`;
  }
  return null;
}

/** Two [start,end) intervals overlap (ISO-local strings compare chronologically). */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export const ACTIVE_STATUSES = ["Booked", "Checked in"];

/**
 * Does the set of bookings already on a space for one day take the WHOLE day? Only a full-day (or
 * legacy half-day) booking does; hourly bookings leave gaps, so the space stays bookable — hourly —
 * around them and the server's overlap check decides each attempt. An empty list means the caller
 * has no slot data (older feed), so it stays conservative and treats "booked" as the whole day.
 */
export function blocksWholeDay(slots: { durationType: string }[]): boolean {
  return slots.length === 0 || slots.some((s) => s.durationType !== "hourly");
}
