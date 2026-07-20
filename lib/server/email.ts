import "server-only";
import type { Booking } from "./db";
import { sign } from "./token";
import { escapeHtml as esc } from "../escape-html";
import { brand } from "../brand";
import { getTenantBranding } from "./tenants";
import { currentTenantId } from "./tenant";

// Brand-driven email templates. Emails can't use the app's CSS tokens or next/font, so they use a
// web-safe font stack + hex values. Each template accepts an EmailBrand so per-tenant white-label
// (G3/G6) reaches notifications; it defaults to the stock RoamHub360 brand.
const APP_URL = process.env.APP_URL || brand.defaultAppUrl;
const MAIL_FROM = process.env.MAIL_FROM || brand.defaultMailFrom;
const C = brand.colors;

export interface EmailBrand {
  productName: string;
  accent: string; // button/link colour
  appUrl: string;
}
const DEFAULT_EMAIL_BRAND: EmailBrand = { productName: brand.productName, accent: C.primary, appUrl: APP_URL };

/** Resolve a tenant's email branding (name + accent). Defaults to the stock brand / default tenant. */
export async function emailBrand(tenantId?: string): Promise<EmailBrand> {
  const b = await getTenantBranding(tenantId ?? (await currentTenantId()));
  return {
    productName: b.name || brand.productName,
    accent: b.accent && /^#[0-9a-fA-F]{6}$/.test(b.accent) ? b.accent : C.primary,
    appUrl: APP_URL,
  };
}

const shell = (title: string, body: string, b: EmailBrand = DEFAULT_EMAIL_BRAND) => `
<div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:auto;color:${C.navy}">
  <div style="background:${C.navy};color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;font-weight:700;letter-spacing:.04em">${esc(b.productName)}</div>
  <div style="border:1px solid #d7e1e7;border-top:none;border-radius:0 0 12px 12px;padding:20px">
    <h2 style="margin:0 0 8px;font-size:18px">${title}</h2>
    ${body}
    <p style="color:#7491a0;font-size:12px;margin-top:24px">Automated message from ${esc(b.productName)} · ${brand.company}. Sent from ${MAIL_FROM}.</p>
  </div>
</div>`;

const btn = (href: string, label: string, color?: string, b: EmailBrand = DEFAULT_EMAIL_BRAND) =>
  `<a href="${href}" style="display:inline-block;background:${color ?? b.accent};color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;margin-right:8px">${label}</a>`;

const when = (b: Booking) => `${esc(b.start.replace("T", " "))} → ${esc(b.end.replace("T", " "))}`;

export function passwordResetEmail(resetUrl: string, eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  return {
    subject: `Reset your ${eb.productName} password`,
    html: shell(
      "Reset your password",
      `<p>We received a request to reset your password. Click below to choose a new one — the link expires in 24 hours.</p>
       <p style="margin-top:16px">${btn(resetUrl, "Reset password", undefined, eb)}</p>
       <p style="color:#7491a0;font-size:12px;margin-top:16px">If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
      eb,
    ),
  };
}

export function verifyEmailEmail(verifyUrl: string, eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  return {
    subject: `Confirm your email for ${eb.productName}`,
    html: shell(
      "Confirm your email",
      `<p>Thanks for signing up. Please confirm this email address to secure your workspace — the link expires in 7 days.</p>
       <p style="margin-top:16px">${btn(verifyUrl, "Confirm email", undefined, eb)}</p>`,
      eb,
    ),
  };
}

export function inviteEmail(inviteUrl: string, opts: { workspaceName?: string; inviter?: string } = {}, eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  const who = opts.inviter ? ` by ${esc(opts.inviter)}` : "";
  const ws = opts.workspaceName ? esc(opts.workspaceName) : eb.productName;
  return {
    subject: `You've been invited to ${ws}`,
    html: shell(
      `Welcome to ${ws}`,
      `<p>You've been invited${who} to join <b>${ws}</b> on ${eb.productName}. Set your password to get started — this link expires in 24 hours.</p>
       <p style="margin-top:16px">${btn(inviteUrl, "Set your password", undefined, eb)}</p>
       <p style="color:#7491a0;font-size:12px;margin-top:16px">Once set, sign in any time with your email and password.</p>`,
      eb,
    ),
  };
}

export function confirmationEmail(b: Booking, eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  const onBehalf = b.bookedByEmail ? `<p style="color:#7491a0;font-size:13px">Booked on your behalf by ${esc(b.bookedByEmail)}.</p>` : "";
  return {
    subject: `Booking confirmed — ${b.spaceLabel}`,
    html: shell(
      "Booking confirmed",
      `<p>Your booking is confirmed.</p>
       <p><b>${esc(b.spaceLabel)}</b><br>${when(b)}</p>
       ${onBehalf}
       <p style="margin-top:16px">${btn(`${APP_URL}/mine`, "View my bookings", undefined, eb)}</p>`,
      eb,
    ),
  };
}

export function cancellationEmail(b: Booking, opts?: { byAdmin?: string; reason?: string }, eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  const note = opts?.byAdmin
    ? `<p style="color:#7491a0;font-size:13px">Cancelled by an administrator (${esc(opts.byAdmin)}).${opts.reason ? ` Reason: ${esc(opts.reason)}` : ""}</p>`
    : b.bookedByEmail
      ? `<p style="color:#7491a0;font-size:13px">Cancelled by ${esc(b.bookedByEmail)} on your behalf.</p>`
      : "";
  return {
    subject: `Booking cancelled — ${b.spaceLabel}`,
    html: shell(
      "Booking cancelled",
      `<p>The following booking has been cancelled and the space released.</p>
       <p><b>${esc(b.spaceLabel)}</b><br>${when(b)}</p>
       ${note}
       <p style="margin-top:16px">${btn(`${APP_URL}/book`, "Book another space", undefined, eb)}</p>`,
      eb,
    ),
  };
}

export function updatedEmail(b: Booking, eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  return {
    subject: `Booking updated — ${b.spaceLabel}`,
    html: shell(
      "Booking updated",
      `<p>Your booking has been updated.</p>
       <p><b>${esc(b.spaceLabel)}</b><br>${when(b)}</p>
       <p style="margin-top:16px">${btn(`${APP_URL}/mine`, "View my bookings", undefined, eb)}</p>`,
      eb,
    ),
  };
}

export function reminderEmail(b: Booking, eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  return {
    subject: `Reminder — ${b.spaceLabel} tomorrow`,
    html: shell("Booking reminder", `<p>Reminder of your booking tomorrow:</p><p><b>${esc(b.spaceLabel)}</b><br>${when(b)}</p>`, eb),
  };
}

/** Monthly utilisation / ROI report (Growth G4). Proves the value of the workspace to admins. */
export function utilizationReportEmail(
  period: string,
  data: {
    totals: { bookings: number; activeUsers: number; checkInRate: number; noShowRate: number };
    utilisation: { desk: number; office: number; room: number; parking: number };
    busiestDay: string | null;
  },
  eb: EmailBrand = DEFAULT_EMAIL_BRAND,
) {
  const stat = (label: string, value: string) =>
    `<td style="padding:10px 12px;border:1px solid #d7e1e7;border-radius:8px"><div style="font-size:22px;font-weight:700;color:${C.navy}">${value}</div><div style="font-size:11px;color:#7491a0;text-transform:uppercase;letter-spacing:.05em">${esc(label)}</div></td>`;
  const bar = (label: string, pct: number) =>
    `<tr><td style="font-size:12px;color:${C.navy};padding:3px 8px 3px 0;white-space:nowrap">${esc(label)}</td><td style="width:100%"><div style="background:#e6eef5;border-radius:5px;height:10px"><div style="background:${eb.accent};height:10px;border-radius:5px;width:${Math.max(0, Math.min(100, Math.round(pct)))}%"></div></div></td><td style="font-size:12px;color:#7491a0;padding-left:8px">${Math.round(pct)}%</td></tr>`;
  return {
    subject: `${period} workspace report — ${data.totals.bookings} bookings`,
    html: shell(
      `${period} at a glance`,
      `<table cellspacing="6" style="width:100%;margin:4px 0 10px"><tr>
         ${stat("Bookings", String(data.totals.bookings))}
         ${stat("Active users", String(data.totals.activeUsers))}
       </tr><tr>
         ${stat("Check-in rate", `${data.totals.checkInRate}%`)}
         ${stat("No-show rate", `${data.totals.noShowRate}%`)}
       </tr></table>
       <p style="font-size:13px;font-weight:600;margin:14px 0 4px">Utilisation by type</p>
       <table style="width:100%;border-collapse:collapse">
         ${bar("Desks", data.utilisation.desk)}${bar("Offices", data.utilisation.office)}${bar("Rooms", data.utilisation.room)}${bar("Parking", data.utilisation.parking)}
       </table>
       ${data.busiestDay ? `<p style="font-size:13px;color:${C.navy};margin-top:14px">Busiest day: <b>${esc(data.busiestDay)}</b>.</p>` : ""}
       <p style="margin-top:16px">${btn(`${APP_URL}/insights`, "Open full insights", undefined, eb)}</p>`,
      eb,
    ),
  };
}

/** Licence expiry notice (Commercial SaaS CP4). `daysLeft` <= 0 means already expired. */
export function licenseExpiryEmail(workspaceName: string, daysLeft: number, expiresOn: string, tier: string, eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  const expired = daysLeft <= 0;
  const headline = expired ? `Your ${eb.productName} licence has expired` : `Your ${eb.productName} licence expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
  const lead = expired
    ? `The <b>${esc(tier)}</b> licence for <b>${esc(workspaceName)}</b> expired on ${esc(expiresOn)}. The workspace is now read-only — existing bookings stay visible, but new ones are blocked until you renew.`
    : `The <b>${esc(tier)}</b> licence for <b>${esc(workspaceName)}</b> expires on <b>${esc(expiresOn)}</b>. Renew before then to avoid any interruption for your team.`;
  return {
    subject: expired ? `Action needed — ${workspaceName} licence expired` : `${workspaceName} licence expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
    html: shell(
      headline,
      `<p>${lead}</p>
       <p style="margin-top:16px">${btn(`${APP_URL}/admin/license`, "View plan & licence", expired ? C.booked : eb.accent, eb)}</p>
       <p style="color:#7491a0;font-size:12px;margin-top:16px">To renew or change your plan, reply to this email or contact TechHub Australia.</p>`,
      eb,
    ),
  };
}

/** Daily "who's in" digest (Team Build-Up D): who from your workspace is booked at your site today. */
export function presenceDigestEmail(
  recipientName: string,
  siteName: string,
  date: string,
  colleagues: { name: string; spaceLabel: string; checkedIn: boolean }[],
  eb: EmailBrand = DEFAULT_EMAIL_BRAND,
) {
  const pretty = new Date(date + "T00:00:00Z").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const first = esc(recipientName.split(/\s+/)[0] || recipientName);
  const list = colleagues.length
    ? `<ul style="padding-left:18px;line-height:1.85;margin:10px 0 0">${colleagues
        .map((c) => `<li><b>${esc(c.name)}</b> · ${esc(c.spaceLabel)}${c.checkedIn ? ` <span style="color:${C.available};font-weight:600">✓ in</span>` : ""}</li>`)
        .join("")}</ul>`
    : `<p style="color:#7491a0">No one else is booked at ${esc(siteName)} yet today.</p>`;
  return {
    subject: `Who's in at ${siteName} today — ${colleagues.length} ${colleagues.length === 1 ? "colleague" : "colleagues"}`,
    html: shell(
      "Who's in today",
      `<p>Morning ${first}, here's who's booked at <b>${esc(siteName)}</b> for ${esc(pretty)}:</p>
       ${list}
       <p style="margin-top:18px">${btn(`${APP_URL}/team`, "Open Who's in", undefined, eb)}</p>
       <p style="color:#7491a0;font-size:12px;margin-top:14px">You're getting this because you turned on the daily digest. Manage it under <a href="${APP_URL}/settings" style="color:${eb.accent}">Settings</a>.</p>`,
      eb,
    ),
  };
}

export function checkInEmail(b: Booking, day: string, eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  const url = `${APP_URL}/api/checkin?token=${sign({ bookingId: b.id, action: "checkin", date: day })}`;
  return {
    subject: `Check in — ${b.spaceLabel}`,
    html: shell(
      "Time to check in",
      `<p>Check in for your booking to keep it. Bookings not checked in by 09:30 are automatically cancelled.</p>
       <p><b>${esc(b.spaceLabel)}</b><br>${when(b)}</p>
       <p style="margin-top:16px">${btn(url, "Check in", undefined, eb)}</p>`,
      eb,
    ),
  };
}

// ---- Support requests (Help centre) --------------------------------------------------------------
export interface SupportEmailFields {
  category: string;
  subject: string;
  message: string;
  userName?: string | null;
  userEmail: string;
  workspace: string; // tenant slug/name for context
  attachmentName?: string | null;
  ticketUrl?: string; // admin deep-link into the queue
}

/** Sent to the ops inbox (OPS_EMAIL) when a user raises a support request. */
export function supportRequestEmail(f: SupportEmailFields, eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  const rows = [
    ["Workspace", f.workspace],
    ["From", `${f.userName ? esc(f.userName) + " " : ""}&lt;${esc(f.userEmail)}&gt;`],
    ["Category", esc(f.category)],
    ["Attachment", f.attachmentName ? esc(f.attachmentName) : "—"],
  ]
    .map(([k, v]) => `<tr><td style="padding:3px 12px 3px 0;color:#7491a0;font-size:12px;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:3px 0;font-size:13px">${v}</td></tr>`)
    .join("");
  return {
    subject: `[Support] ${f.subject}`,
    html: shell(
      "New support request",
      `<table style="border-collapse:collapse;margin-bottom:12px">${rows}</table>
       <div style="border-top:1px solid #e3ebf0;padding-top:12px">
         <div style="font-weight:600;font-size:14px;margin-bottom:4px">${esc(f.subject)}</div>
         <div style="white-space:pre-wrap;font-size:13px;color:#334;line-height:1.6">${esc(f.message)}</div>
       </div>
       ${f.attachmentName ? `<p style="color:#7491a0;font-size:12px;margin-top:12px">📎 ${esc(f.attachmentName)} attached to this email.</p>` : ""}
       ${f.ticketUrl ? `<p style="margin-top:16px">${btn(f.ticketUrl, "Open in support queue", undefined, eb)}</p>` : ""}
       <p style="color:#7491a0;font-size:12px;margin-top:14px">Reply directly to <a href="mailto:${esc(f.userEmail)}" style="color:${eb.accent}">${esc(f.userEmail)}</a> to respond to the requester.</p>`,
      eb,
    ),
  };
}

/** Confirmation sent to the person who raised the request. */
export function supportAckEmail(f: { subject: string; message: string }, eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  return {
    subject: `We received your request — ${f.subject}`,
    html: shell(
      "Thanks — we've got your request",
      `<p>Our team has received your message and will get back to you by email as soon as we can.</p>
       <div style="border:1px solid #e3ebf0;border-radius:10px;padding:12px 14px;margin:14px 0;background:#f7fafc">
         <div style="font-weight:600;font-size:14px;margin-bottom:4px">${esc(f.subject)}</div>
         <div style="white-space:pre-wrap;font-size:13px;color:#334;line-height:1.6">${esc(f.message)}</div>
       </div>
       <p style="color:#7491a0;font-size:12px">You don't need to do anything further — just reply to this email if you'd like to add more detail.</p>`,
      eb,
    ),
  };
}

/** Sent to the REQUESTER when a member of staff answers their support request. */
export function supportReplyEmail(f: { subject: string; body: string; fromName?: string | null; url?: string }, eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  return {
    subject: `Re: ${f.subject}`,
    html: shell(
      "There's a reply to your request",
      `<p>${f.fromName ? `${esc(f.fromName)} replied` : "Our team replied"} to <b>${esc(f.subject)}</b>:</p>
       <div style="border-left:3px solid ${eb.accent};padding:4px 0 4px 12px;margin:14px 0;white-space:pre-wrap;font-size:13px;color:#334;line-height:1.6">${esc(f.body)}</div>
       ${f.url ? `<p style="margin-top:16px">${btn(f.url, "View in " + esc(eb.productName), undefined, eb)}</p>` : ""}
       <p style="color:#7491a0;font-size:12px;margin-top:14px">You can reply to this email, or open the Help panel in ${esc(eb.productName)} to continue the conversation.</p>`,
      eb,
    ),
  };
}

/** Sent to the ops inbox when the requester adds a follow-up to an existing request. */
export function supportFollowUpEmail(f: { subject: string; body: string; userEmail: string; workspace: string; ticketUrl?: string }, eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  return {
    subject: `[Support] Re: ${f.subject}`,
    html: shell(
      "Follow-up on a support request",
      `<p><b>${esc(f.userEmail)}</b> (workspace ${esc(f.workspace)}) added to <b>${esc(f.subject)}</b>:</p>
       <div style="border-left:3px solid ${eb.accent};padding:4px 0 4px 12px;margin:14px 0;white-space:pre-wrap;font-size:13px;color:#334;line-height:1.6">${esc(f.body)}</div>
       ${f.ticketUrl ? `<p style="margin-top:16px">${btn(f.ticketUrl, "Open in support queue", undefined, eb)}</p>` : ""}`,
      eb,
    ),
  };
}

export function checkOutEmail(b: Booking, day: string, eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  const url = `${APP_URL}/api/checkout?token=${sign({ bookingId: b.id, action: "checkout", date: day })}`;
  return {
    subject: `Check out — ${b.spaceLabel}`,
    html: shell(
      "Time to check out?",
      `<p>End of day for your booking:</p>
       <p><b>${esc(b.spaceLabel)}</b><br>${when(b)}</p>
       <p style="margin-top:8px">Choose what you'd like to do:</p>
       <ul style="color:#334;font-size:13px;line-height:1.7;padding-left:18px;margin:6px 0 14px">
         <li><b>Check out now</b> — release the space for others.</li>
         <li><b>Stay a little longer</b> — extend the end time under <a href="${APP_URL}/mine" style="color:${eb.accent}">My bookings</a> (where permitted).</li>
         <li><b>Book another day</b> — reserve your next visit.</li>
       </ul>
       <p style="margin-top:4px">${btn(url, "Check out", C.available, eb)}${btn(`${APP_URL}/book`, "Book another day", undefined, eb)}</p>
       <p style="color:#7491a0;font-size:12px;margin-top:14px">If we don't hear from you, you'll be checked out automatically at 17:30.</p>`,
      eb,
    ),
  };
}
