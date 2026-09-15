import { describe, it, expect } from "vitest";
import {
  parseOfficeBookingQuery,
  shapeOfficeBookings,
  windowLowerBound,
  OFFICE_BOOKINGS_MAX_DAYS,
  type OfficeBookingContext,
  type OfficeBookingFilters,
  type OfficeBookingSource,
} from "./office-bookings";

const get = (o: Record<string, string>) => (n: string) => o[n] ?? null;
const TODAY = "2026-09-15";

const src = (o: Partial<OfficeBookingSource> & { id: string; userEmail: string }): OfficeBookingSource => ({
  buildingId: "syd-hq",
  spaceKey: "desk-1",
  spaceLabel: "Desk 1",
  kind: "desk",
  durationType: "full",
  start: "2026-09-16T08:00",
  end: "2026-09-16T17:30",
  status: "Booked",
  ...o,
});
const filters = (o: Partial<OfficeBookingFilters> = {}): OfficeBookingFilters => ({ from: "2026-09-15", to: "2026-09-28", limit: 100, offset: 0, ...o });
const ctx = (o: Partial<OfficeBookingContext> = {}): OfficeBookingContext => ({
  meEmail: "me@example.com",
  hidden: new Set(),
  nameOf: (e) => e.split("@")[0],
  photoOf: () => undefined,
  siteNameOf: (r) => r.toUpperCase(),
  floorNameOf: (id) => (id.includes("__") ? "Level 2" : ""),
  canSeeEmail: () => false,
  ...o,
});

describe("parseOfficeBookingQuery", () => {
  it("defaults to today + 13 days in the caller's zone", () => {
    const r = parseOfficeBookingQuery(get({}), TODAY);
    expect("filters" in r && r.filters.from).toBe(TODAY);
    expect("filters" in r && r.filters.to).toBe("2026-09-28");
    expect("filters" in r && r.filters.status).toBe("active");
  });
  it("rejects malformed and inverted dates", () => {
    expect(parseOfficeBookingQuery(get({ from: "15/09/2026" }), TODAY)).toHaveProperty("error");
    expect(parseOfficeBookingQuery(get({ from: "2026-09-20", to: "2026-09-19" }), TODAY)).toHaveProperty("error");
  });
  it("caps the window at 62 days inclusive", () => {
    // 1 Jan → 3 Mar 2026 = 31 + 28 + 3 = 62 days (allowed); 4 Mar makes it 63 (refused).
    expect(parseOfficeBookingQuery(get({ from: "2026-01-01", to: "2026-03-03" }), TODAY)).toHaveProperty("filters");
    expect(parseOfficeBookingQuery(get({ from: "2026-01-01", to: "2026-03-04" }), TODAY)).toHaveProperty("error");
    expect(OFFICE_BOOKINGS_MAX_DAYS).toBe(62);
  });
  it("clamps limit/offset and lower-cases the search", () => {
    const r = parseOfficeBookingQuery(get({ limit: "9999", offset: "-5", q: "  AdA " }), TODAY);
    expect("filters" in r && r.filters.limit).toBe(500);
    expect("filters" in r && r.filters.offset).toBe(0);
    expect("filters" in r && r.filters.q).toBe("ada");
  });
  it("window lower bound reaches back the maximum multi-day span", () => {
    expect(windowLowerBound("2026-09-15")).toBe("2026-09-01");
  });
});

describe("shapeOfficeBookings", () => {
  it("keeps bookings overlapping the window, including multi-day ones that started before it", () => {
    const { rows } = shapeOfficeBookings(
      [
        src({ id: "a", userEmail: "ada@example.com", start: "2026-09-10T08:00", end: "2026-09-16T17:30" }), // spans into window
        src({ id: "b", userEmail: "bob@example.com", start: "2026-09-01T08:00", end: "2026-09-02T17:30" }), // before
        src({ id: "c", userEmail: "cy@example.com", start: "2026-10-05T08:00", end: "2026-10-05T17:30" }), // after
      ],
      filters(),
      ctx(),
    );
    expect(rows.map((r) => r.name)).toEqual(["ada"]);
  });

  it("defaults to active bookings; status=all and exact status work", () => {
    const data = [
      src({ id: "a", userEmail: "ada@example.com", status: "Booked" }),
      src({ id: "b", userEmail: "bob@example.com", status: "Cancelled" }),
      src({ id: "c", userEmail: "cy@example.com", status: "Checked in" }),
    ];
    expect(shapeOfficeBookings(data, filters(), ctx()).rows.map((r) => r.name)).toEqual(["ada", "cy"]);
    expect(shapeOfficeBookings(data, filters({ status: "all" }), ctx()).total).toBe(3);
    expect(shapeOfficeBookings(data, filters({ status: "Cancelled" }), ctx()).rows.map((r) => r.name)).toEqual(["bob"]);
  });

  it("hides people who opted out of presence — except from themselves", () => {
    const data = [src({ id: "a", userEmail: "ada@example.com" }), src({ id: "m", userEmail: "me@example.com" })];
    const hidden = new Set(["ada@example.com", "me@example.com"]);
    const { rows } = shapeOfficeBookings(data, filters(), ctx({ hidden }));
    expect(rows.map((r) => r.name)).toEqual(["me"]);
    expect(rows[0].isMe).toBe(true);
  });

  it("filters by site root, exact floor and kind", () => {
    const data = [
      src({ id: "a", userEmail: "ada@example.com", buildingId: "syd-hq__floor-2" }),
      src({ id: "b", userEmail: "bob@example.com", buildingId: "syd-hq", kind: "room", spaceLabel: "Boardroom" }),
      src({ id: "c", userEmail: "cy@example.com", buildingId: "mel-office" }),
    ];
    expect(shapeOfficeBookings(data, filters({ site: "syd-hq" }), ctx()).total).toBe(2);
    expect(shapeOfficeBookings(data, filters({ floor: "syd-hq__floor-2" }), ctx()).rows[0].floor).toBe("Level 2");
    expect(shapeOfficeBookings(data, filters({ kind: "room" }), ctx()).rows[0].space).toBe("Boardroom");
  });

  it("search matches name, space and site — and email only when the caller may see it", () => {
    const data = [src({ id: "a", userEmail: "ada.lovelace@example.com", spaceLabel: "Desk 7" })];
    expect(shapeOfficeBookings(data, filters({ q: "ada.lovelace" }), ctx()).total).toBe(1); // name (local-part)
    expect(shapeOfficeBookings(data, filters({ q: "desk 7" }), ctx()).total).toBe(1);
    expect(shapeOfficeBookings(data, filters({ q: "syd-hq" }), ctx()).total).toBe(1); // site name
    expect(shapeOfficeBookings(data, filters({ q: "@example.com" }), ctx()).total).toBe(0); // email hidden
    expect(shapeOfficeBookings(data, filters({ q: "@example.com" }), ctx({ canSeeEmail: () => true })).total).toBe(1);
  });

  it("exposes id + userEmail only where the caller may see them, and never for staff", () => {
    const data = [src({ id: "a", userEmail: "ada@example.com", buildingId: "syd-hq" }), src({ id: "b", userEmail: "bob@example.com", buildingId: "mel-office" })];
    const staff = shapeOfficeBookings(data, filters(), ctx()).rows;
    expect(staff.every((r) => r.userEmail === undefined && r.id === undefined)).toBe(true);
    const siteAdmin = shapeOfficeBookings(data, filters(), ctx({ canSeeEmail: (id) => id.startsWith("syd-hq") })).rows;
    expect(siteAdmin.find((r) => r.name === "ada")?.userEmail).toBe("ada@example.com");
    expect(siteAdmin.find((r) => r.name === "bob")?.userEmail).toBeUndefined();
  });

  it("marks on-behalf bookings with the booker's name and flags checked-in rows", () => {
    const { rows } = shapeOfficeBookings(
      [src({ id: "a", userEmail: "ada@example.com", bookedByEmail: "admin@example.com", status: "Checked in" })],
      filters(),
      ctx(),
    );
    expect(rows[0].by).toBe("admin");
    expect(rows[0].checkedIn).toBe(true);
    expect(rows[0].date).toBe("2026-09-16");
    expect(rows[0].start).toBe("08:00");
  });

  it("sorts by start then name, and paginates with a stable total", () => {
    const data = [
      src({ id: "z", userEmail: "zed@example.com", start: "2026-09-16T09:00", end: "2026-09-16T10:00" }),
      src({ id: "a", userEmail: "ada@example.com", start: "2026-09-16T09:00", end: "2026-09-16T10:00" }),
      src({ id: "e", userEmail: "eve@example.com", start: "2026-09-15T09:00", end: "2026-09-15T10:00" }),
    ];
    const all = shapeOfficeBookings(data, filters(), ctx());
    expect(all.rows.map((r) => r.name)).toEqual(["eve", "ada", "zed"]);
    const page = shapeOfficeBookings(data, filters({ limit: 1, offset: 1 }), ctx());
    expect(page.total).toBe(3);
    expect(page.rows.map((r) => r.name)).toEqual(["ada"]);
  });
});
