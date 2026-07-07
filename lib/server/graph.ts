import "server-only";
import { brand } from "../brand";

// Microsoft Graph (app-only / client credentials). Sends mail from the brand mailbox
// and reserves room mailboxes. No-ops until GRAPH_* env vars are set (post admin-consent).

const TENANT = process.env.AZURE_TENANT_ID || process.env.GRAPH_TENANT_ID;
const CLIENT_ID = process.env.GRAPH_CLIENT_ID;
const CLIENT_SECRET = process.env.GRAPH_CLIENT_SECRET;
const MAIL_FROM = process.env.MAIL_FROM || brand.defaultMailFrom;
const TZ = process.env.GRAPH_TIMEZONE || "AUS Eastern Standard Time";

export const graphConfigured = Boolean(TENANT && CLIENT_ID && CLIENT_SECRET);

let cached: { token: string; exp: number } | null = null;
async function token(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const body = new URLSearchParams({
    client_id: CLIENT_ID!,
    client_secret: CLIENT_SECRET!,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, { method: "POST", body });
  const j = await r.json();
  if (!r.ok) throw new Error("graph token: " + JSON.stringify(j));
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached.token;
}

async function gfetch(path: string, init: RequestInit) {
  const t = await token();
  const r = await fetch("https://graph.microsoft.com/v1.0" + path, {
    ...init,
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`graph ${path}: ${r.status} ${text}`);
  // sendMail (202) and cancel/delete (202/204) return an empty body — don't JSON-parse nothing.
  return text ? JSON.parse(text) : null;
}

/** Generic authenticated GET returning parsed JSON. Used by the directory sync (Team Build-Up B).
 *  `path` is relative to the Graph v1.0 base (e.g. "/users?$select=..."). */
export async function graphJson(path: string): Promise<unknown> {
  return gfetch(path, { method: "GET" });
}

/** A user's 48×48 profile photo as a `data:` URL, or null when they have none (404 is common).
 *  `userKey` is the user's id, mail or userPrincipalName. */
export async function graphPhotoDataUrl(userKey: string): Promise<string | null> {
  if (!graphConfigured) return null;
  try {
    const t = await token();
    const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userKey)}/photos/48x48/$value`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!r.ok) return null; // 404 = no photo set (very common); other errors → skip the photo
    const ct = r.headers.get("content-type") || "image/jpeg";
    const b64 = Buffer.from(await r.arrayBuffer()).toString("base64");
    return `data:${ct};base64,${b64}`;
  } catch {
    return null;
  }
}

export async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  if (!graphConfigured) return false;
  await gfetch(`/users/${encodeURIComponent(MAIL_FROM)}/sendMail`, {
    method: "POST",
    body: JSON.stringify({
      message: { subject, body: { contentType: "HTML", content: html }, toRecipients: [{ emailAddress: { address: to } }] },
      saveToSentItems: false,
    }),
  });
  return true;
}

interface BookingEventOpts {
  ownerEmail: string; // organizer — the booking owner (the on-behalf target, not the admin)
  subject: string;
  startLocal: string; // "YYYY-MM-DDTHH:mm"
  endLocal: string;
  timeZone?: string; // Windows tz of the office; defaults to GRAPH_TIMEZONE
  roomMailbox?: string; // added as a resource attendee → Exchange reserves it (auto accept/decline by availability)
  attendees?: string[]; // additional required attendees
  online?: boolean; // attach a Teams online meeting
  bodyHtml?: string;
  allDay?: boolean; // full-day booking → all-day calendar event (start/end at midnight)
  showAs?: "free" | "busy"; // availability; full-day bookings use "free" so they don't block the calendar
}

// Graph all-day events require midnight start and an EXCLUSIVE end date (day after the last day).
function allDayRange(startLocal: string, endLocal: string): { start: string; end: string } {
  const startDate = startLocal.slice(0, 10);
  const [y, m, d] = endLocal.slice(0, 10).split("-").map(Number);
  const endExclusive = new Date(Date.UTC(y, m - 1, d) + 86400000).toISOString().slice(0, 10);
  return { start: `${startDate}T00:00:00`, end: `${endExclusive}T00:00:00` };
}

/** Create the meeting on the OWNER's calendar so it lands in their Outlook/Teams.
 *  The room is added as a `resource` attendee, so Exchange reserves it and accepts or
 *  declines per its availability. Returns the Graph event id (stored for later cancel). */
export async function createBookingEvent(opts: BookingEventOpts): Promise<string | null> {
  if (!graphConfigured) return null;
  const tz = opts.timeZone || TZ;
  const attendees: { emailAddress: { address: string }; type: string }[] = [];
  if (opts.roomMailbox) attendees.push({ emailAddress: { address: opts.roomMailbox }, type: "resource" });
  for (const a of opts.attendees || []) {
    if (a && a !== opts.ownerEmail) attendees.push({ emailAddress: { address: a }, type: "required" });
  }
  const range = opts.allDay ? allDayRange(opts.startLocal, opts.endLocal) : { start: opts.startLocal, end: opts.endLocal };
  const ev = await gfetch(`/users/${encodeURIComponent(opts.ownerEmail)}/events`, {
    method: "POST",
    body: JSON.stringify({
      subject: opts.subject,
      body: opts.bodyHtml ? { contentType: "HTML", content: opts.bodyHtml } : undefined,
      isAllDay: opts.allDay || undefined,
      showAs: opts.showAs, // "free" for full-day bookings so they don't block the calendar
      start: { dateTime: range.start, timeZone: tz },
      end: { dateTime: range.end, timeZone: tz },
      location: opts.roomMailbox ? { displayName: opts.subject, locationEmailAddress: opts.roomMailbox } : undefined,
      attendees,
      isOnlineMeeting: opts.online || undefined,
      onlineMeetingProvider: opts.online ? "teamsForBusiness" : undefined,
      allowNewTimeProposals: false,
    }),
  });
  return (ev as { id?: string })?.id ?? null;
}

/** Cancel the booking's meeting: sends cancellations to attendees and releases the room.
 *  Falls back to a hard delete if /cancel is rejected (e.g. no attendees). */
export async function cancelBookingEvent(ownerEmail: string, eventId: string): Promise<boolean> {
  if (!graphConfigured) return false;
  try {
    await gfetch(`/users/${encodeURIComponent(ownerEmail)}/events/${encodeURIComponent(eventId)}/cancel`, {
      method: "POST",
      body: JSON.stringify({ comment: `This booking was cancelled in ${brand.productName}.` }),
    });
  } catch {
    await gfetch(`/users/${encodeURIComponent(ownerEmail)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
  }
  return true;
}

/** Update an existing booking meeting in place (time and/or subject). Used when a booking is edited. */
export async function updateBookingEvent(
  ownerEmail: string,
  eventId: string,
  opts: { startLocal: string; endLocal: string; timeZone?: string; subject?: string; allDay?: boolean; showAs?: "free" | "busy" },
): Promise<boolean> {
  if (!graphConfigured) return false;
  const tz = opts.timeZone || TZ;
  const range = opts.allDay ? allDayRange(opts.startLocal, opts.endLocal) : { start: opts.startLocal, end: opts.endLocal };
  await gfetch(`/users/${encodeURIComponent(ownerEmail)}/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      subject: opts.subject,
      isAllDay: opts.allDay || undefined,
      showAs: opts.showAs,
      start: { dateTime: range.start, timeZone: tz },
      end: { dateTime: range.end, timeZone: tz },
    }),
  });
  return true;
}

/** Map a room spaceKey -> resource mailbox via ROOM_MAILBOXES env JSON. */
export function roomMailboxFor(spaceKey: string): string | null {
  try {
    const map = JSON.parse(process.env.ROOM_MAILBOXES || "{}") as Record<string, string>;
    return map[spaceKey] ?? null;
  } catch {
    return null;
  }
}

/** Read-only health probe for Step-1 verification. Acquires a token and reads the
 *  sender mailbox (and an optional room mailbox). Never sends mail or writes events. */
export async function probeGraph(roomMailbox?: string): Promise<{
  configured: boolean;
  env: { tenant: boolean; clientId: boolean; secret: boolean; mailFrom: string };
  token: { ok: boolean; error?: string };
  senderMailbox: { ok: boolean; displayName?: string; error?: string };
  roomMailbox?: { address: string; ok: boolean; displayName?: string; error?: string };
}> {
  const out = {
    configured: graphConfigured,
    env: { tenant: Boolean(TENANT), clientId: Boolean(CLIENT_ID), secret: Boolean(CLIENT_SECRET), mailFrom: MAIL_FROM },
    token: { ok: false } as { ok: boolean; error?: string },
    senderMailbox: { ok: false } as { ok: boolean; displayName?: string; error?: string },
    roomMailbox: undefined as undefined | { address: string; ok: boolean; displayName?: string; error?: string },
  };
  if (!graphConfigured) return out;
  try {
    await token();
    out.token.ok = true;
  } catch (e) {
    out.token.error = e instanceof Error ? e.message : String(e);
    return out;
  }
  try {
    const u = await gfetch(`/users/${encodeURIComponent(MAIL_FROM)}?$select=displayName,mail`, { method: "GET" });
    out.senderMailbox = { ok: true, displayName: (u as { displayName?: string })?.displayName };
  } catch (e) {
    out.senderMailbox = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (roomMailbox) {
    try {
      const r = await gfetch(`/users/${encodeURIComponent(roomMailbox)}?$select=displayName,mail`, { method: "GET" });
      out.roomMailbox = { address: roomMailbox, ok: true, displayName: (r as { displayName?: string })?.displayName };
    } catch (e) {
      out.roomMailbox = { address: roomMailbox, ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return out;
}

/** Step-1 write test: create then immediately delete an event on a mailbox's calendar.
 *  Proves Calendars.ReadWrite works end-to-end without leaving anything behind. */
export async function testCalendarRoundTrip(mailbox: string): Promise<{ ok: boolean; eventId?: string; error?: string }> {
  if (!graphConfigured) return { ok: false, error: "Graph not configured" };
  try {
    const ev = await gfetch(`/users/${encodeURIComponent(mailbox)}/events`, {
      method: "POST",
      body: JSON.stringify({
        subject: `${brand.productName} connectivity test (auto-deleted)`,
        start: { dateTime: "2099-01-01T09:00", timeZone: TZ },
        end: { dateTime: "2099-01-01T09:15", timeZone: TZ },
      }),
    });
    const id = (ev as { id?: string })?.id;
    if (id) await gfetch(`/users/${encodeURIComponent(mailbox)}/events/${encodeURIComponent(id)}`, { method: "DELETE" });
    return { ok: true, eventId: id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
