export type DeskStatus = "free" | "booked" | "occ" | "perm";
export type Zone = "North" | "South";

export interface Desk {
  id: number;
  x: number;
  y: number;
  s: DeskStatus;
  z: Zone;
  t?: boolean; // near IT team
}

export interface Room {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  sub: string;
  kind: "meet" | "exec" | "kitchen";
  cap?: number;
}

export interface Office {
  id: string;
  b: string;
  sub: string;
  open: boolean;
  active?: boolean;
}

// ---- floor plan engine ----
export type SpaceKind = "desk" | "room" | "office" | "parking";
// Desk glyph variants. All behave identically (rotatable, resizable via `size`, bookable);
// only the drawing differs. Add new variants here + a glyph in DeskShape + an editor option.
export type DeskShapeKind = "L" | "round" | "rect" | "double" | "exec";
// runtime status; everything defaults to "free" (bookable). Admin can set "locked".
export type SpaceStatus = "free" | "locked" | "booked" | "maintenance";

// structural (non-interactive) elements
export type StructEl =
  | { t: "wall"; d: string }
  | { t: "label"; x: number; y: number; text: string; rot?: number; size?: number; color?: string }
  | { t: "fixture"; x: number; y: number; w: number; h: number; label?: string; rot?: number; lx?: number; ly?: number; fill?: string };

// interactive (bookable) spaces
export type SpaceEl =
  | { t: "desk"; id: number; x: number; y: number; rot?: number; label?: string; shape?: DeskShapeKind; numIn?: boolean; size?: number }
  | { t: "parking"; id: number; x: number; y: number; rot?: number; label?: string; size?: number }
  | { t: "office"; id: number; x: number; y: number; w: number; h: number; name?: string; rot?: number }
  | {
      t: "room";
      rid: string;
      name: string;
      x: number;
      y: number;
      w: number;
      h: number;
      shape?: "rect" | "oval";
      seats?: number;
      rot?: number;
      mailbox?: string; // Microsoft 365 room resource mailbox
      notes?: string;
      maxHours?: number; // per-room max booking duration (hours); 0/undefined = building default
    };

export type FloorEl = StructEl | SpaceEl;

export function spaceKey(el: SpaceEl): string {
  return el.t === "room" ? `room-${el.rid}` : `${el.t}-${el.id}`;
}

export interface FloorPlan {
  id: string;
  name: string;
  viewBox: string;
  open: boolean;
  els: FloorEl[];
  /** when set, render this background image with the interactive els overlaid as hotspots */
  image?: string;
  /** draft vs published; booking view prefers published */
  published?: boolean;
  // ---- building details (set in the editor; used for tz, hours, listing) ----
  region?: string;
  country?: string;
  tz?: string; // IANA, e.g. America/New_York
  winTz?: string; // Windows tz for Microsoft Graph, e.g. Eastern Standard Time
  openTime?: string; // "08:00"
  closeTime?: string; // "17:30"
  status?: "open" | "closed";
  // ---- booking policy (configurable booking controls) ----
  advanceDays?: number; // max days ahead a booking may start (0/undefined = unlimited)
  allowedWeekdays?: boolean[]; // [Sun..Sat]; undefined = all days allowed
  allowPast?: boolean; // permit booking dates in the past (default false)
  // ---- quota (per user, this building) ----
  maxDeskPerDay?: number; // max active desk bookings per user per day (0 = unlimited; default 1)
  maxConcurrent?: number; // max active future desk bookings per user (0 = unlimited; default 10)
  // ---- optimistic concurrency ----
  rev?: number; // bumped on every save; stale writes are rejected with 409
}

export interface Country {
  name: string;
  flag: string;
  offices: Office[];
}

export interface Region {
  region: string;
  countries: Country[];
}

export interface Booking {
  id: string;
  space: string;
  type: "Desk" | "Meeting room" | "Office";
  building: string;
  when: string;
  status: "Booked" | "Upcoming" | "Checked in" | "Recurring";
  action?: "checkin" | "cancel";
}

export interface BuildingRow {
  id: string;
  name: string;
  address: string;
  country: string;
  tz: string;
  desks: string;
  hours: string;
  status: "Open" | "Closed now";
}

export interface Assignment {
  space: string;
  person: string;
  role: string;
  building: string;
  since: string;
}

export interface OccupancyRow {
  building: string;
  detail: string;
  booked: number;
  ci: number;
  nci: number;
}
