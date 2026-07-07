"use client";

import type { Booking } from "./server/db";

export type { Booking };

export interface BookingInput {
  buildingId: string;
  spaceKey: string;
  spaceLabel: string;
  kind: string;
  durationType: string;
  start: string;
  end: string;
  userEmail?: string; // set when booking on behalf
}

export async function getLocks(buildingId: string): Promise<string[]> {
  try {
    const r = await fetch(`/api/locks/${buildingId}`, { cache: "no-store" });
    if (!r.ok) return [];
    const rows = (await r.json()) as { spaceKey: string }[];
    return rows.map((x) => x.spaceKey);
  } catch {
    return [];
  }
}

export async function setLockApi(buildingId: string, spaceKey: string, locked: boolean, scope = "temporary"): Promise<void> {
  await fetch(`/api/locks/${buildingId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spaceKey, locked, scope }),
  });
}

export async function getOccupied(buildingId: string, date: string): Promise<string[]> {
  try {
    const r = await fetch(`/api/occupancy?buildingId=${buildingId}&date=${date}`, { cache: "no-store" });
    return r.ok ? ((await r.json()) as string[]) : [];
  } catch {
    return [];
  }
}

// ---- booking lifecycle (shared view logic) ----
// Stored start/end are local strings "YYYY-MM-DDTHH:mm"; compare against local now.
export function localNowMinute(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
const ACTIVE_STATUS = ["Booked", "Checked in"];
/** Active = a live, non-cancelled reservation that hasn't ended yet. */
export function isActiveBooking(b: Booking, now = localNowMinute()): boolean {
  return ACTIVE_STATUS.includes(b.status) && b.end >= now;
}
/** Display status, resolving expiry/completion for ended bookings and distinguishing an
 *  admin cancellation (cancelledBy differs from the owner / on-behalf booker). */
export function displayStatus(b: Booking, now = localNowMinute()): string {
  if (b.status === "Cancelled" || b.status === "Declined") {
    const owner = (b.userEmail ?? "").toLowerCase();
    const booker = (b.bookedByEmail ?? "").toLowerCase();
    const by = (b.cancelledBy ?? "").toLowerCase();
    if (by === "system") return "Cancelled — no check-in"; // 09:30 auto-cancel
    return by && by !== owner && by !== booker ? `${b.status} by admin` : b.status;
  }
  if (b.status === "Checked out") return "Checked out"; // terminal, released early
  if (b.end < now) return b.status === "Checked in" ? "Completed" : "Expired";
  return b.status;
}

export async function getBookings(user?: string): Promise<Booking[]> {
  try {
    const r = await fetch(`/api/bookings${user ? `?user=${encodeURIComponent(user)}` : ""}`, { cache: "no-store" });
    return r.ok ? ((await r.json()) as Booking[]) : [];
  } catch {
    return [];
  }
}

// ---- Team presence ("Who's in", Team Build-Up A) ----
export interface PresenceEntry {
  buildingId: string;
  spaceKey: string;
  spaceLabel: string;
  kind: string;
  start: string;
  end: string;
  checkedIn: boolean;
  name: string;
  department?: string; // from the Entra directory (Team Build-Up B), when synced
  jobTitle?: string;
  photo?: string; // data: URL thumbnail
  isMe: boolean;
  userEmail?: string; // admins only
}
export interface Presence {
  date: string;
  entries: PresenceEntry[];
  mySites: string[];
}
/** Who from your workspace has an active booking on the given day (grouped/rendered client-side). */
export async function getPresence(date: string): Promise<Presence> {
  try {
    const r = await fetch(`/api/presence?date=${date}`, { cache: "no-store" });
    if (!r.ok) return { date, entries: [], mySites: [] };
    return (await r.json()) as Presence;
  } catch {
    return { date, entries: [], mySites: [] };
  }
}

// ---- Presence analytics (Team Build-Up F) ----
export interface WeekdayStat {
  weekday: number;
  label: string;
  presenceDays: number;
  occurrences: number;
  avg: number;
}
export interface PresenceInsights {
  weeks: number;
  from: string;
  to: string;
  weekdays: WeekdayStat[];
  recommendation: { busiest: number[]; quietest: number | null; message: string };
}
export async function getPresenceInsights(site?: string): Promise<PresenceInsights | null> {
  try {
    const qs = site && site !== "all" ? `?site=${encodeURIComponent(site)}` : "";
    const r = await fetch(`/api/presence/insights${qs}`, { cache: "no-store" });
    return r.ok ? ((await r.json()) as PresenceInsights) : null;
  } catch {
    return null;
  }
}

// ---- Customer Microsoft integration (Commercial SaaS CP1, admin) ----
export interface IntegrationStatus {
  configured: boolean;
  azureTenantId: string | null;
  graphClientId: string | null;
  hasSecret: boolean;
  lastTestOk: boolean | null;
  lastTestAt: string | null;
  lastTestError: string | null;
}
export async function getIntegration(): Promise<{ status: IntegrationStatus; encryptionAvailable: boolean } | null> {
  try {
    const r = await fetch(`/api/admin/integration`, { cache: "no-store" });
    return r.ok ? ((await r.json()) as { status: IntegrationStatus; encryptionAvailable: boolean }) : null;
  } catch {
    return null;
  }
}
export async function saveIntegrationApi(input: { azureTenantId?: string; graphClientId?: string; secret?: string }): Promise<{ ok: boolean; status?: IntegrationStatus; error?: string }> {
  try {
    const r = await fetch(`/api/admin/integration`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const body = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, status: (body as { status: IntegrationStatus }).status } : { ok: false, error: (body as { error?: string }).error ?? "Save failed" };
  } catch {
    return { ok: false, error: "Network error" };
  }
}
export async function testIntegrationApi(): Promise<{ ok: boolean; result?: { ok: boolean; sampleName?: string; error?: string }; status?: IntegrationStatus; error?: string }> {
  try {
    const r = await fetch(`/api/admin/integration`, { method: "POST" });
    const body = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, ...(body as object) } : { ok: false, error: (body as { error?: string }).error ?? "Test failed" };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

// ---- Microsoft Entra directory (Team Build-Up B, admin) ----
export interface DirectoryEntry {
  email: string;
  displayName?: string;
  jobTitle?: string;
  department?: string;
  officeLocation?: string;
  managerEmail?: string;
  photo?: string;
}
export interface DirectoryStatus {
  configured: boolean;
  hasDb: boolean;
  count: number;
  lastSync: string | null;
}
export async function getDirectory(): Promise<{ status: DirectoryStatus; entries: DirectoryEntry[] }> {
  try {
    const r = await fetch(`/api/directory`, { cache: "no-store" });
    if (!r.ok) return { status: { configured: false, hasDb: false, count: 0, lastSync: null }, entries: [] };
    return (await r.json()) as { status: DirectoryStatus; entries: DirectoryEntry[] };
  } catch {
    return { status: { configured: false, hasDb: false, count: 0, lastSync: null }, entries: [] };
  }
}
export async function syncDirectoryApi(): Promise<{ ok: boolean; synced: number; photos: number; error?: string }> {
  try {
    const r = await fetch(`/api/directory`, { method: "POST" });
    return (await r.json()) as { ok: boolean; synced: number; photos: number; error?: string };
  } catch {
    return { ok: false, synced: 0, photos: 0, error: "Network error" };
  }
}

// ---- Self-service preferences (Team Build-Up C privacy + D notifications) ----
export interface UserPrefs {
  hidePresence: boolean;
  notifyPresence: boolean;
}
export async function getPrefs(): Promise<UserPrefs | null> {
  try {
    const r = await fetch(`/api/me/prefs`, { cache: "no-store" });
    return r.ok ? ((await r.json()) as UserPrefs) : null;
  } catch {
    return null;
  }
}
export async function updatePrefs(patch: Partial<UserPrefs>): Promise<{ ok: boolean; prefs?: UserPrefs; error?: string }> {
  try {
    const r = await fetch(`/api/me/prefs`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = await r.json().catch(() => ({}));
    if (r.ok) return { ok: true, prefs: body as UserPrefs };
    return { ok: false, error: (body as { error?: string }).error ?? "Update failed" };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

/** Tell other components (e.g. the notifications bell) that bookings changed, so they re-fetch. */
export function notifyBookingsChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("bookings:changed"));
}

export async function createBookingApi(payload: BookingInput): Promise<{ ok: boolean; error?: string; booking?: Booking }> {
  try {
    const r = await fetch(`/api/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (r.ok) {
      notifyBookingsChanged();
      return { ok: true, booking: (await r.json()) as Booking };
    }
    const body = await r.json().catch(() => ({}));
    return { ok: false, error: body.error ?? "Booking failed" };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

/** Reschedule a booking (change its time window). Server re-validates every rule. */
export async function editBookingApi(id: string, payload: { start: string; end: string; durationType: string }): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(`/api/bookings/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  notifyBookingsChanged();
  if (r.ok) return { ok: true };
  const b = await r.json().catch(() => ({}));
  return { ok: false, error: b.error ?? "Update failed" };
}

export async function setBookingStatusApi(id: string, status: string, reason?: string): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(`/api/bookings/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, ...(reason ? { reason } : {}) }),
  });
  notifyBookingsChanged();
  if (r.ok) return { ok: true };
  const b = await r.json().catch(() => ({}));
  return { ok: false, error: b.error ?? "Update failed" };
}
