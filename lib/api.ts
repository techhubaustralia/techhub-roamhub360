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
