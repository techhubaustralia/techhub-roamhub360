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

// ---- Partner control-plane (Commercial SaaS CP3, platform operators) ----
export interface TenantDetail {
  tenant: { id: string; slug: string; name: string; status: string; features?: string[]; brandName?: string | null; brandAccent?: string | null; brandLogo?: string | null };
  license: LicenseSummary;
  stats: { users: number; bookings: number; directory: number };
  workspaceUrl: string;
}
export interface TenantPatch {
  status?: "active" | "suspended";
  features?: string[];
  license?: { tier?: string; maxSites?: number; maxFloorsPerSite?: number; status?: string; expiresAt?: string | null; graceDays?: number };
  branding?: { name?: string | null; accent?: string | null; logo?: string | null };
}
export async function getTenantDetail(slug: string): Promise<TenantDetail | null> {
  try {
    const r = await fetch(`/api/admin/tenants/${slug}`, { cache: "no-store" });
    return r.ok ? ((await r.json()) as TenantDetail) : null;
  } catch {
    return null;
  }
}
export async function patchTenant(slug: string, patch: TenantPatch): Promise<{ ok: boolean; detail?: TenantDetail; error?: string }> {
  try {
    const r = await fetch(`/api/admin/tenants/${slug}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const body = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, detail: body as TenantDetail } : { ok: false, error: (body as { error?: string }).error ?? "Update failed" };
  } catch {
    return { ok: false, error: "Network error" };
  }
}
export async function impersonateTenant(slug: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const r = await fetch(`/api/admin/tenants/${slug}`, { method: "POST" });
    const body = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, url: (body as { url: string }).url } : { ok: false, error: (body as { error?: string }).error ?? "Failed" };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

// ---- Control-plane user management for a specific client workspace (platform admin) ----
export interface TenantUser { id: string; email: string; name?: string | null; role: string; sites?: string[]; multiBook?: boolean; provider?: string | null }
export async function getTenantUsers(slug: string): Promise<TenantUser[]> {
  try {
    const r = await fetch(`/api/admin/tenants/${slug}/users`, { cache: "no-store" });
    return r.ok ? (((await r.json()) as { users: TenantUser[] }).users ?? []) : [];
  } catch {
    return [];
  }
}
export async function createTenantUser(
  slug: string,
  input: { email: string; name?: string; password?: string; role: string; invite?: boolean },
): Promise<{ ok: boolean; user?: TenantUser; error?: string }> {
  try {
    const r = await fetch(`/api/admin/tenants/${slug}/users`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const body = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, user: body as TenantUser } : { ok: false, error: (body as { error?: string }).error ?? "Could not create user" };
  } catch {
    return { ok: false, error: "Network error" };
  }
}
export function tenantExportUrl(slug: string): string {
  return `/api/admin/tenants/${slug}/export`;
}
export async function deleteTenant(slug: string, confirm: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`/api/admin/tenants/${slug}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm }) });
    const body = await r.json().catch(() => ({}));
    return r.ok ? { ok: true } : { ok: false, error: (body as { error?: string }).error ?? "Could not delete" };
  } catch {
    return { ok: false, error: "Network error" };
  }
}
export async function deleteTenantUser(slug: string, id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`/api/admin/tenants/${slug}/users`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const body = await r.json().catch(() => ({}));
    return r.ok ? { ok: true } : { ok: false, error: (body as { error?: string }).error ?? "Could not delete" };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

// ---- Licensing (Commercial SaaS CP2, admin) ----
export interface LicenseSummary {
  tier: string;
  maxSites: number;
  maxFloorsPerSite: number;
  status: string;
  expiresAt: string | null;
  graceDays: number;
  effective: "active" | "grace" | "expired" | "suspended";
  readOnly: boolean;
  daysLeft: number | null;
  sitesUsed: number;
  billing?: { provider: string; configured: boolean };
}
export async function getLicense(): Promise<LicenseSummary | null> {
  try {
    const r = await fetch(`/api/admin/license`, { cache: "no-store" });
    return r.ok ? ((await r.json()) as LicenseSummary) : null;
  } catch {
    return null;
  }
}

// ---- Customer Microsoft integration (Commercial SaaS CP1, admin) ----
export interface IntegrationStatus {
  configured: boolean;
  azureTenantId: string | null;
  graphClientId: string | null;
  mailFrom: string | null;
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
export async function saveIntegrationApi(input: { azureTenantId?: string; graphClientId?: string; mailFrom?: string; secret?: string }): Promise<{ ok: boolean; status?: IntegrationStatus; error?: string }> {
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

// ---- AI booking concierge (Next level) ----
export interface BookingProposal {
  buildingId: string;
  spaceKey: string;
  spaceLabel: string;
  kind: string;
  date: string;
  durationType: "full" | "half" | "hourly";
  startTime?: string;
  endTime?: string;
}
export async function assistantConfigured(): Promise<boolean> {
  try {
    const r = await fetch(`/api/assistant`, { cache: "no-store" });
    return r.ok ? Boolean((await r.json()).configured) : false;
  } catch {
    return false;
  }
}
export async function askAssistant(messages: { role: "user" | "assistant"; content: string }[]): Promise<{ reply: string; proposal?: BookingProposal; error?: string }> {
  try {
    const r = await fetch(`/api/assistant`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages }) });
    const body = await r.json().catch(() => ({}));
    if (r.ok) return { reply: (body as { reply: string }).reply, proposal: (body as { proposal?: BookingProposal }).proposal };
    return { reply: "", error: (body as { error?: string }).error ?? "The assistant is unavailable." };
  } catch {
    return { reply: "", error: "Network error." };
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

// ---- Knowledge base + support (Help centre) ------------------------------------------------------
export interface KbListItem {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  category: string;
  pinned: boolean;
  scope: "global" | "tenant";
  text?: string; // plaintext body excerpt used for in-panel search
}
export interface KbArticleFull extends KbListItem {
  body: string;
  html: string;
  published: boolean;
  sort: number;
  views: number;
  createdBy: string | null;
  updatedAt: string;
  tenantId: string | null;
}
export interface SupportRequestRow {
  id: string;
  tenantId: string;
  userEmail: string;
  userName: string | null;
  category: string;
  subject: string;
  message: string;
  status: string;
  priority: string;
  attachmentName: string | null;
  attachmentType: string | null;
  attachmentSize: number | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Published articles for the Help panel (global + this workspace). */
export async function getKbArticles(): Promise<KbListItem[]> {
  try {
    const r = await fetch("/api/kb", { cache: "no-store" });
    const b = await r.json().catch(() => ({}));
    return Array.isArray(b.articles) ? b.articles : [];
  } catch {
    return [];
  }
}

export async function getKbArticle(id: string): Promise<KbArticleFull | null> {
  try {
    const r = await fetch(`/api/kb/${id}`, { cache: "no-store" });
    if (!r.ok) return null;
    const b = await r.json().catch(() => ({}));
    return b.article ?? null;
  } catch {
    return null;
  }
}

/** Submit a support request (multipart, optional file). */
export async function submitSupport(form: FormData): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch("/api/support", { method: "POST", body: form });
    const b = await r.json().catch(() => ({}));
    return r.ok ? { ok: true } : { ok: false, error: b.error ?? "Could not send your request." };
  } catch {
    return { ok: false, error: "Network error — please try again." };
  }
}

// ---- Admin: knowledge base ----
export async function getAdminKb(scope: "global" | "tenant"): Promise<KbArticleFull[]> {
  try {
    const r = await fetch(`/api/admin/kb?scope=${scope}`, { cache: "no-store" });
    const b = await r.json().catch(() => ({}));
    return Array.isArray(b.articles) ? b.articles : [];
  } catch {
    return [];
  }
}

export interface KbInputApi {
  scope?: "global" | "tenant";
  title?: string;
  summary?: string | null;
  category?: string;
  body?: string;
  published?: boolean;
  pinned?: boolean;
  sort?: number;
}

export async function createKbArticle(input: KbInputApi): Promise<{ ok: boolean; error?: string; article?: KbArticleFull }> {
  const r = await fetch("/api/admin/kb", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const b = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, article: b.article } : { ok: false, error: b.error ?? "Could not save." };
}

export async function updateKbArticle(id: string, input: KbInputApi): Promise<{ ok: boolean; error?: string; article?: KbArticleFull }> {
  const r = await fetch(`/api/admin/kb/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const b = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, article: b.article } : { ok: false, error: b.error ?? "Could not save." };
}

export async function deleteKbArticle(id: string): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(`/api/admin/kb/${id}`, { method: "DELETE" });
  const b = await r.json().catch(() => ({}));
  return r.ok ? { ok: true } : { ok: false, error: b.error ?? "Could not delete." };
}


// ---- Admin: support queue ----
export async function getSupportQueue(status?: "open" | "closed"): Promise<{ requests: SupportRequestRow[]; openCount: number }> {
  try {
    const r = await fetch(`/api/admin/support${status ? `?status=${status}` : ""}`, { cache: "no-store" });
    const b = await r.json().catch(() => ({}));
    return { requests: Array.isArray(b.requests) ? b.requests : [], openCount: b.openCount ?? 0 };
  } catch {
    return { requests: [], openCount: 0 };
  }
}

export async function updateSupportRequestApi(id: string, patch: { status?: string; priority?: string; adminNote?: string | null }): Promise<{ ok: boolean; error?: string; request?: SupportRequestRow }> {
  const r = await fetch(`/api/admin/support/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
  const b = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, request: b.request } : { ok: false, error: b.error ?? "Could not update." };
}

// ---- Support conversation (closing the loop) -----------------------------------------------------
export interface SupportReplyRow {
  id: string;
  requestId: string;
  authorEmail: string;
  authorName: string | null;
  fromAdmin: boolean;
  body: string;
  createdAt: string;
}

/** The signed-in user's own requests (with reply counts) — powers "My requests" in Help. */
export async function getMySupportRequests(): Promise<(SupportRequestRow & { replyCount?: number })[]> {
  try {
    const r = await fetch("/api/support", { cache: "no-store" });
    const b = await r.json().catch(() => ({}));
    return Array.isArray(b.requests) ? b.requests : [];
  } catch {
    return [];
  }
}

export async function getSupportThread(id: string): Promise<{ request: SupportRequestRow; replies: SupportReplyRow[] } | null> {
  try {
    const r = await fetch(`/api/support/${id}/reply`, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export async function postSupportReply(id: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(`/api/support/${id}/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  const b = await r.json().catch(() => ({}));
  return r.ok ? { ok: true } : { ok: false, error: b.error ?? "Could not send." };
}
