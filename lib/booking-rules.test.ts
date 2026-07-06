import { describe, it, expect } from "vitest";
import { validateBooking, deriveTimes, overlaps, daysBetween, todayInTz, nowInTz } from "./booking-rules";

const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const nextWeekday = (start: number) => {
  for (let i = start; i <= start + 7; i++) {
    const g = new Date(Date.now() + i * 864e5).getDay();
    if (g >= 1 && g <= 5) return i;
  }
  return start;
};

describe("validateBooking — windows & limits", () => {
  it("rejects end before start", () => {
    expect(validateBooking("desk", `${day(1)}T10:00`, `${day(1)}T09:00`)).toMatch(/after start/i);
  });
  it("rejects desk span over 14 days", () => {
    const w = day(nextWeekday(1));
    expect(validateBooking("desk", `${w}T08:00`, `${day(nextWeekday(1) + 20)}T17:30`)).toMatch(/14 days/);
  });
  it("rejects office over 1 day", () => {
    const a = day(nextWeekday(1));
    expect(validateBooking("office", `${a}T08:00`, `${day(nextWeekday(1) + 2)}T17:30`)).toMatch(/cannot exceed 1 day/);
  });
  it("rejects outside office hours", () => {
    const a = day(nextWeekday(1));
    expect(validateBooking("desk", `${a}T06:00`, `${a}T07:00`)).toMatch(/office hours/i);
  });
  it("accepts a valid in-hours single-day desk booking", () => {
    const a = day(nextWeekday(1));
    expect(validateBooking("desk", `${a}T08:00`, `${a}T17:30`)).toBeNull();
  });
});

describe("validateBooking — policy", () => {
  it("blocks past dates when allowPast is false", () => {
    expect(validateBooking("desk", `${day(-2)}T08:00`, `${day(-2)}T17:30`, { allowPast: false })).toMatch(/past/i);
  });
  it("allows past dates when allowPast is true", () => {
    // past + allowPast removes the past check; other rules still apply (in-hours, single day)
    expect(validateBooking("desk", `${day(-2)}T08:00`, `${day(-2)}T17:30`, { allowPast: true })).toBeNull();
  });
  it("enforces the advance-booking limit", () => {
    expect(validateBooking("desk", `${day(20)}T08:00`, `${day(20)}T17:30`, { advanceDays: 7 })).toMatch(/at most 7 days/);
  });
  it("enforces per-room max booking hours", () => {
    const a = day(nextWeekday(1));
    expect(validateBooking("room", `${a}T09:00`, `${a}T13:00`, { maxHours: 2 })).toMatch(/at most 2 hours/);
    expect(validateBooking("room", `${a}T09:00`, `${a}T10:00`, { maxHours: 2 })).toBeNull();
  });
  it("blocks a non-bookable weekday", () => {
    // allow only Monday (index 1)
    const allowed = [false, true, false, false, false, false, false];
    // find a near non-Monday weekday-or-any day
    let off = 1;
    for (let i = 1; i <= 7; i++) { if (new Date(Date.now() + i * 864e5).getDay() !== 1) { off = i; break; } }
    const r = validateBooking("desk", `${day(off)}T08:00`, `${day(off)}T17:30`, { allowedWeekdays: allowed, allowPast: true });
    expect(r).toMatch(/not bookable/i);
  });
});

describe("deriveTimes", () => {
  it("derives full-day desk window", () => {
    const { start, end } = deriveTimes({ kind: "desk", duration: "full", startDate: "2026-06-01" });
    expect(start).toBe("2026-06-01T08:00");
    expect(end).toBe("2026-06-01T17:30");
  });
  it("derives am half-day", () => {
    const { start, end } = deriveTimes({ kind: "office", duration: "half", startDate: "2026-06-01", half: "am" });
    expect(start).toBe("2026-06-01T08:00");
    expect(end).toBe("2026-06-01T12:45");
  });
  it("derives hourly", () => {
    const { start, end } = deriveTimes({ kind: "room", duration: "hourly", startDate: "2026-06-01", startTime: "09:00", endTime: "10:00" });
    expect(start).toBe("2026-06-01T09:00");
    expect(end).toBe("2026-06-01T10:00");
  });
});

describe("overlaps & daysBetween", () => {
  it("detects overlap and non-overlap", () => {
    expect(overlaps("2026-06-01T09:00", "2026-06-01T11:00", "2026-06-01T10:00", "2026-06-01T12:00")).toBe(true);
    expect(overlaps("2026-06-01T09:00", "2026-06-01T10:00", "2026-06-01T10:00", "2026-06-01T11:00")).toBe(false);
  });
  it("counts inclusive days (DST-immune across a US spring-forward)", () => {
    expect(daysBetween("2026-06-01", "2026-06-01")).toBe(1);
    expect(daysBetween("2026-06-01", "2026-06-03")).toBe(3);
    // 2026-03-08 is a US DST transition day; calendar math must be unaffected
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(3);
  });
});

describe("past-time rejection (tz-aware)", () => {
  it("rejects a past date", () => {
    expect(validateBooking("desk", `${day(-1)}T08:00`, `${day(-1)}T17:30`, { tz: "UTC" })).toMatch(/past/i);
  });
  it("allowPast=true bypasses past checks", () => {
    expect(validateBooking("desk", `${day(-1)}T08:00`, `${day(-1)}T17:30`, { tz: "UTC", allowPast: true })).toBeNull();
  });
  it("allows a future hourly booking", () => {
    const d = day(nextWeekday(2));
    expect(validateBooking("desk", `${d}T09:00`, `${d}T10:00`, { tz: "UTC" }, "hourly")).toBeNull();
  });
  it("allows a future full-day booking", () => {
    const d = day(nextWeekday(2));
    expect(validateBooking("desk", `${d}T08:00`, `${d}T17:30`, { tz: "UTC" }, "full")).toBeNull();
  });
});

describe("timezone-aware helpers", () => {
  it("todayInTz returns a YYYY-MM-DD date for an IANA zone", () => {
    expect(todayInTz("Asia/Manila")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(todayInTz("America/New_York")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("nowInTz returns a YYYY-MM-DDTHH:mm wall-clock string", () => {
    expect(nowInTz("Europe/Rome")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
  it("different zones can report different calendar days at the same instant", () => {
    // Not asserting a specific delta (depends on run time), only that both are valid.
    const a = todayInTz("Pacific/Kiritimati"); // UTC+14
    const b = todayInTz("Pacific/Pago_Pago"); // UTC-11
    expect(a >= b).toBe(true);
  });
});

describe("maxHours is DST-immune wall-clock hours", () => {
  const w = (n: number) => {
    // a future weekday date string
    for (let i = n; i < n + 7; i++) {
      const g = new Date(Date.now() + i * 864e5).getDay();
      if (g >= 1 && g <= 5) return new Date(Date.now() + i * 864e5).toISOString().slice(0, 10);
    }
    return new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  };
  it("rejects a room booking exceeding maxHours (7h > 6h)", () => {
    const d = w(2);
    expect(validateBooking("room", `${d}T09:00`, `${d}T16:00`, { maxHours: 6 })).toMatch(/at most 6 hours/);
  });
  it("accepts a room booking within maxHours (7h <= 8h)", () => {
    const d = w(2);
    expect(validateBooking("room", `${d}T09:00`, `${d}T16:00`, { maxHours: 8 })).toBeNull();
  });
});
