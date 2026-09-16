import "server-only";
import type { Booking } from "./db";
import { sign } from "./token";
import { escapeHtml as esc } from "../escape-html";
import { brand } from "../brand";
import { getTenantBranding } from "./tenants";
import { currentTenantId } from "./tenant";

// Brand-driven email templates. Emails can't use the app's CSS tokens or next/font, so they use a
// web-safe font stack + hex values, and TABLE layout with inline styles so they render the same in
// Outlook desktop/web, Gmail and Apple Mail. Each template accepts an EmailBrand so per-tenant
// white-label (G3/G6) reaches notifications; it defaults to the stock RoamHub360 brand.
const APP_URL = process.env.APP_URL || brand.defaultAppUrl;
const MAIL_FROM = process.env.MAIL_FROM || brand.defaultMailFrom;
const C = brand.colors;

// Email-only palette (kept here on purpose — the app's CSS tokens don't exist in mail clients).
const FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = "#2b3a44"; // body text
const MUTE = "#7a8b96"; // secondary text
const LINE = "#e6ecf1"; // hairlines
const CANVAS = "#eef2f6"; // page background behind the card
const CARD_BORDER = "#dde5ec";

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

interface ShellOpts {
  eyebrow?: string; // small uppercase label above the title, e.g. "Invitation"
  preheader?: string; // hidden preview text shown next to the subject in the inbox
  footerNote?: string; // extra reassurance line in the footer (pre-escaped HTML allowed)
}

/**
 * The shared wrapper every email renders through: brand mark above a white card on a soft canvas,
 * an accent line across the top of the card, optional eyebrow + title + body, and a two-line footer.
 * A tenant with its own brand name is white-label: the MSP attribution ("by TechHub Australia") is
 * dropped so the email reads as entirely theirs.
 */
const shell = (title: string, body: string, b: EmailBrand = DEFAULT_EMAIL_BRAND, o: ShellOpts = {}) => {
  const whiteLabel = b.productName !== brand.productName;
  const preheader = o.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${CANVAS};font-size:1px;line-height:1px">${esc(o.preheader)}${"&nbsp;&zwnj;".repeat(40)}</div>`
    : "";
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(b.productName)}</title></head>
<body style="margin:0;padding:0;background:${CANVAS};">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
      <tr><td style="padding:0 4px 14px;font-family:${FONT};">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="width:10px;height:10px;background:${b.accent};border-radius:3px;font-size:0;line-height:0;">&nbsp;</td>
          <td style="padding-left:9px;font-size:15px;font-weight:700;letter-spacing:.02em;color:${C.navy};">${esc(b.productName)}</td>
          ${whiteLabel ? "" : `<td style="padding-left:10px;font-size:12px;color:${MUTE};">by ${esc(brand.company)}</td>`}
        </tr></table>
      </td></tr>
      <tr><td style="background:#ffffff;border:1px solid ${CARD_BORDER};border-radius:14px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="height:4px;background:${b.accent};border-radius:14px 14px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="padding:30px 36px 32px;font-family:${FONT};">
            ${o.eyebrow ? `<div style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${b.accent};margin-bottom:10px;">${esc(o.eyebrow)}</div>` : ""}
            <h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;font-weight:700;color:${C.navy};">${title}</h1>
            <div style="font-size:15px;line-height:1.6;color:${INK};">${body}</div>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:18px 36px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:#8a99a3;">
        This is an automated message from ${esc(b.productName)}${whiteLabel ? "" : ` · ${esc(brand.company)}`}, sent from ${esc(MAIL_FROM)}.<br>
        ${o.footerNote ? `${o.footerNote}<br>` : ""}
        <span style="color:#a7b3bb;">Need help? Reply to this email or open the Help centre once signed in.</span>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
};

/** Bulletproof button: a table cell carries the colour so Outlook paints it; the link inside is the
 *  click target everywhere else. Sits inline so two buttons can share a line in web clients. */
const btn = (href: string, label: string, color?: string, b: EmailBrand = DEFAULT_EMAIL_BRAND) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;margin:0 8px 8px 0;"><tr>
     <td bgcolor="${color ?? b.accent}" style="border-radius:8px;">
       <a href="${href}" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${label} &rarr;</a>
     </td>
   </tr></table>`;

/** Key/value details card (values are pre-escaped HTML). */
const details = (rows: [string, string][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 18px;border:1px solid ${LINE};border-radius:10px;background:#f7fafc;"><tr><td style="padding:6px 16px;">
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows
       .map(
         ([k, v]) =>
           `<tr><td style="padding:8px 14px 8px 0;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${MUTE};white-space:nowrap;vertical-align:top;width:90px;">${esc(k)}</td><td style="padding:8px 0;font-size:15px;color:${C.navy};font-weight:600;">${v}</td></tr>`,
       )
       .join("")}</table>
   </td></tr></table>`;

const muted = (html: string) => `<p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:${MUTE};">${html}</p>`;

// ---- Dates: site-local wall-clock strings rendered for humans ("Tue 15 Sep 2026, 08:00 – 17:30") ----
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const prettyDate = (local: string) => {
  const [y, m, d] = local.slice(0, 10).split("-").map(Number);
  return `${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]} ${y}`;
};
const when = (b: Booking) =>
  b.start.slice(0, 10) === b.end.slice(0, 10)
    ? `${prettyDate(b.start)}, ${b.start.slice(11)} – ${b.end.slice(11)}`
    : `${prettyDate(b.start)} ${b.start.slice(11)} → ${prettyDate(b.end)} ${b.end.slice(11)}`;
const bookingDetails = (b: Booking) =>
  details([
    ["Space", esc(b.spaceLabel)],
    ["When", esc(when(b))],
    ...(b.bookedByEmail ? ([["Booked by", esc(b.bookedByEmail)]] as [string, string][]) : []),
  ]);

export function passwordResetEmail(resetUrl: string, eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  return {
    subject: `Reset your ${eb.productName} password`,
    html: shell(
      "Reset your password",
      `<p style="margin:0 0 20px;">We received a request to reset your password. Choose a new one below — the link expires in <b>24 hours</b>.</p>
       ${btn(resetUrl, "Reset password", undefined, eb)}
       ${muted("If you didn't request this, you can safely ignore this email — your password won't change.")}`,
      eb,
      { eyebrow: "Security", preheader: "Choose a new password — this link expires in 24 hours." },
    ),
  };
}

export function verifyEmailEmail(verifyUrl: string, eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  return {
    subject: `Confirm your email for ${eb.productName}`,
    html: shell(
      "Confirm your email",
      `<p style="margin:0 0 20px;">Thanks for signing up. Please confirm this email address to secure your workspace — the link expires in <b>7 days</b>.</p>
       ${btn(verifyUrl, "Confirm email", undefined, eb)}`,
      eb,
      { eyebrow: "Confirm your email", preheader: "One click to confirm your email and secure your workspace." },
    ),
  };
}

export function inviteEmail(
  inviteUrl: string,
  opts: { workspaceName?: string; inviter?: string; recipientName?: string } = {},
  eb: EmailBrand = DEFAULT_EMAIL_BRAND,
) {
  const ws = opts.workspaceName ? esc(opts.workspaceName) : esc(eb.productName);
  const first = opts.recipientName?.trim().split(/\s+/)[0];
  const greeting = first ? `<p style="margin:0 0 12px;">Hi ${esc(first)},</p>` : "";
  const who = opts.inviter ? `<b>${esc(opts.inviter)}</b> has invited you` : "You've been invited";
  return {
    subject: `You've been invited to ${opts.workspaceName ?? eb.productName}`,
    html: shell(
      `Welcome to ${ws}`,
      `${greeting}
       <p style="margin:0 0 12px;">${who} to join <b>${ws}</b> on ${esc(eb.productName)} — the workspace where your team books desks, offices, meeting rooms and parking.</p>
       <p style="margin:0 0 22px;">Set your password to activate your account. This link expires in <b>24 hours</b>.</p>
       ${btn(inviteUrl, "Set your password", undefined, eb)}
       ${muted("Once set, sign in any time with your email and password.")}
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;border-top:1px solid ${LINE};">
         <tr><td style="padding-top:18px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${MUTE};">What you can do</td></tr>
         <tr><td style="padding-top:8px;font-size:14px;line-height:1.7;color:${INK};">
           &#10003;&nbsp; Book a desk, office, meeting room or parking bay from the floor plan<br>
           &#10003;&nbsp; See who's in the office and sit near your team<br>
           &#10003;&nbsp; Check in with a tap or a QR code on the day
         </td></tr>
       </table>`,
      eb,
      {
        eyebrow: "Invitation",
        preheader: `Set your password to join ${opts.workspaceName ?? eb.productName} — the link expires in 24 hours.`,
        footerNote: "If you weren't expecting this invitation you can ignore it — no account is activated until you set a password.",
      },
    ),
  };
}

export function confirmationEmail(b: Booking, eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  return {
    subject: `Booking confirmed — ${b.spaceLabel}`,
    html: shell(
      "Booking confirmed",
      `<p style="margin:0;">Your booking is confirmed.</p>
       ${bookingDetails(b)}
       ${btn(`${APP_URL}/mine`, "View my bookings", undefined, eb)}`,
      eb,
      { eyebrow: "Booking confirmed", preheader: `${b.spaceLabel} · ${when(b)}` },
    ),
  };
}

/** One confirmation for a "Repeat weekly" series: every date booked, plus any that were skipped and
 *  why. Replaces the per-booking confirmation for the series (one email, not one per date). */
export function recurringConfirmationEmail(created: Booking[], skipped: { date: string; reason: string }[], eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  const first = created[0];
  const rows = created.map((b) => `<li style="margin:2px 0;">${esc(when(b))}</li>`).join("");
  const skippedRows = skipped.length
    ? `<p style="margin:16px 0 4px;font-size:13px;color:${MUTE};"><b>Not booked (${skipped.length}):</b></p>
       <ul style="margin:0;padding-left:18px;font-size:13px;color:${MUTE};">${skipped.map((s) => `<li style="margin:2px 0;">${esc(prettyDate(s.date))} — ${esc(s.reason)}</li>`).join("")}</ul>`
    : "";
  return {
    subject: `${created.length} booking${created.length === 1 ? "" : "s"} confirmed — ${first?.spaceLabel ?? "Recurring booking"}`,
    html: shell(
      "Recurring booking confirmed",
      `<p style="margin:0;">Your repeat booking is confirmed for the dates below.</p>
       ${details([
         ["Space", esc(first?.spaceLabel ?? "")],
         ["Dates", `<ul style="margin:0;padding-left:18px;font-weight:400;">${rows}</ul>`],
         ...(first?.bookedByEmail ? ([["Booked by", esc(first.bookedByEmail)]] as [string, string][]) : []),
       ])}
       ${skippedRows}
       <div style="margin-top:18px;">${btn(`${APP_URL}/mine`, "View my bookings", undefined, eb)}</div>`,
      eb,
      { eyebrow: "Recurring booking", preheader: `${created.length} dates booked for ${first?.spaceLabel ?? "your space"}.` },
    ),
  };
}

export function cancellationEmail(b: Booking, opts?: { byAdmin?: string; reason?: string }, eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  const note = opts?.byAdmin
    ? muted(`Cancelled by an administrator (${esc(opts.byAdmin)}).${opts.reason ? ` Reason: ${esc(opts.reason)}` : ""}`)
    : b.bookedByEmail
      ? muted(`Cancelled by ${esc(b.bookedByEmail)} on your behalf.`)
      : "";
  return {
    subject: `Booking cancelled — ${b.spaceLabel}`,
    html: shell(
      "Booking cancelled",
      `<p style="margin:0;">The following booking has been cancelled and the space released.</p>
       ${bookingDetails(b)}
       ${btn(`${APP_URL}/book`, "Book another space", undefined, eb)}
       ${note}`,
      eb,
      { eyebrow: "Booking cancelled", preheader: `${b.spaceLabel} · ${when(b)} has been cancelled.` },
    ),
  };
}

export function updatedEmail(b: Booking, eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  return {
    subject: `Booking updated — ${b.spaceLabel}`,
    html: shell(
      "Booking updated",
      `<p style="margin:0;">Your booking has been updated.</p>
       ${bookingDetails(b)}
       ${btn(`${APP_URL}/mine`, "View my bookings", undefined, eb)}`,
      eb,
      { eyebrow: "Booking updated", preheader: `${b.spaceLabel} · now ${when(b)}` },
    ),
  };
}

export function reminderEmail(b: Booking, eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  return {
    subject: `Reminder — ${b.spaceLabel} tomorrow`,
    html: shell(
      "Your booking is tomorrow",
      `<p style="margin:0;">A reminder of your booking tomorrow.</p>
       ${bookingDetails(b)}
       ${btn(`${APP_URL}/mine`, "View my bookings", undefined, eb)}`,
      eb,
      { eyebrow: "Reminder", preheader: `Tomorrow: ${b.spaceLabel} · ${when(b)}` },
    ),
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
    `<td style="padding:12px 14px;border:1px solid ${LINE};border-radius:10px;background:#f7fafc;"><div style="font-size:24px;font-weight:700;color:${C.navy};">${value}</div><div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:${MUTE};text-transform:uppercase;">${esc(label)}</div></td>`;
  const bar = (label: string, pct: number) =>
    `<tr><td style="font-size:13px;color:${C.navy};padding:4px 10px 4px 0;white-space:nowrap;">${esc(label)}</td><td style="width:100%;"><div style="background:#e6eef5;border-radius:5px;height:10px;"><div style="background:${eb.accent};height:10px;border-radius:5px;width:${Math.max(0, Math.min(100, Math.round(pct)))}%;"></div></div></td><td style="font-size:13px;color:${MUTE};padding-left:10px;">${Math.round(pct)}%</td></tr>`;
  return {
    subject: `${period} workspace report — ${data.totals.bookings} bookings`,
    html: shell(
      `${period} at a glance`,
      `<table role="presentation" cellspacing="6" cellpadding="0" border="0" style="width:100%;margin:4px 0 12px;"><tr>
         ${stat("Bookings", String(data.totals.bookings))}
         ${stat("Active users", String(data.totals.activeUsers))}
       </tr><tr>
         ${stat("Check-in rate", `${data.totals.checkInRate}%`)}
         ${stat("No-show rate", `${data.totals.noShowRate}%`)}
       </tr></table>
       <p style="margin:16px 0 6px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${MUTE};">Utilisation by type</p>
       <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
         ${bar("Desks", data.utilisation.desk)}${bar("Offices", data.utilisation.office)}${bar("Rooms", data.utilisation.room)}${bar("Parking", data.utilisation.parking)}
       </table>
       ${data.busiestDay ? `<p style="margin:16px 0 0;">Busiest day: <b>${esc(data.busiestDay)}</b>.</p>` : ""}
       <div style="margin-top:20px;">${btn(`${APP_URL}/insights`, "Open full insights", undefined, eb)}</div>`,
      eb,
      { eyebrow: "Monthly report", preheader: `${data.totals.bookings} bookings, ${data.totals.checkInRate}% check-in rate.` },
    ),
  };
}

/** Licence expiry notice (Commercial SaaS CP4). `daysLeft` <= 0 means already expired. */
export function licenseExpiryEmail(workspaceName: string, daysLeft: number, expiresOn: string, tier: string, eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  const expired = daysLeft <= 0;
  const headline = expired ? `Your ${esc(eb.productName)} licence has expired` : `Your ${esc(eb.productName)} licence expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
  const lead = expired
    ? `The <b>${esc(tier)}</b> licence for <b>${esc(workspaceName)}</b> expired on ${esc(expiresOn)}. The workspace is now read-only — existing bookings stay visible, but new ones are blocked until you renew.`
    : `The <b>${esc(tier)}</b> licence for <b>${esc(workspaceName)}</b> expires on <b>${esc(expiresOn)}</b>. Renew before then to avoid any interruption for your team.`;
  return {
    subject: expired ? `Action needed — ${workspaceName} licence expired` : `${workspaceName} licence expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
    html: shell(
      headline,
      `<p style="margin:0 0 20px;">${lead}</p>
       ${btn(`${APP_URL}/admin/license`, "View plan & licence", expired ? C.booked : eb.accent, eb)}
       ${muted(`To renew or change your plan, reply to this email or contact ${esc(brand.company)}.`)}`,
      eb,
      { eyebrow: expired ? "Action needed" : "Licence", preheader: expired ? `${workspaceName} is read-only until the licence is renewed.` : `${workspaceName} licence expires on ${expiresOn}.` },
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
    ? `<ul style="padding-left:18px;line-height:1.85;margin:10px 0 0;">${colleagues
        .map((c) => `<li><b>${esc(c.name)}</b> · ${esc(c.spaceLabel)}${c.checkedIn ? ` <span style="color:${C.available};font-weight:600;">✓ in</span>` : ""}</li>`)
        .join("")}</ul>`
    : muted(`No one else is booked at ${esc(siteName)} yet today.`);
  return {
    subject: `Who's in at ${siteName} today — ${colleagues.length} ${colleagues.length === 1 ? "colleague" : "colleagues"}`,
    html: shell(
      "Who's in today",
      `<p style="margin:0;">Morning ${first}, here's who's booked at <b>${esc(siteName)}</b> for ${esc(pretty)}:</p>
       ${list}
       <div style="margin-top:20px;">${btn(`${APP_URL}/team`, "Open Who's in", undefined, eb)}</div>
       ${muted(`You're getting this because you turned on the daily digest. Manage it under <a href="${APP_URL}/settings" style="color:${eb.accent};">Settings</a>.`)}`,
      eb,
      { eyebrow: "Who's in", preheader: `${colleagues.length} ${colleagues.length === 1 ? "colleague is" : "colleagues are"} booked at ${siteName} today.` },
    ),
  };
}

export function checkInEmail(b: Booking, day: string, eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  const url = `${APP_URL}/api/checkin?token=${sign({ bookingId: b.id, action: "checkin", date: day })}`;
  return {
    subject: `Check in — ${b.spaceLabel}`,
    html: shell(
      "Time to check in",
      `<p style="margin:0;">Check in to keep your booking — bookings not checked in by the site's release time are cancelled automatically.</p>
       ${bookingDetails(b)}
       ${btn(url, "Check in", undefined, eb)}`,
      eb,
      { eyebrow: "Check-in", preheader: `Check in to keep ${b.spaceLabel} today.` },
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

const quote = (html: string, accent: string) =>
  `<div style="border-left:3px solid ${accent};padding:6px 0 6px 14px;margin:14px 0;white-space:pre-wrap;font-size:14px;color:${INK};line-height:1.6;">${html}</div>`;

/** Sent to the ops inbox (OPS_EMAIL) when a user raises a support request. */
export function supportRequestEmail(f: SupportEmailFields, eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  return {
    subject: `[Support] ${f.subject}`,
    html: shell(
      "New support request",
      `${details([
        ["Workspace", esc(f.workspace)],
        ["From", `${f.userName ? esc(f.userName) + " " : ""}&lt;${esc(f.userEmail)}&gt;`],
        ["Category", esc(f.category)],
        ["Attachment", f.attachmentName ? esc(f.attachmentName) : "—"],
      ])}
       <div style="font-weight:700;font-size:15px;margin-bottom:4px;">${esc(f.subject)}</div>
       ${quote(esc(f.message), eb.accent)}
       ${f.attachmentName ? muted(`📎 ${esc(f.attachmentName)} is attached to this email.`) : ""}
       ${f.ticketUrl ? `<div style="margin-top:18px;">${btn(f.ticketUrl, "Open in support queue", undefined, eb)}</div>` : ""}
       ${muted(`Reply directly to <a href="mailto:${esc(f.userEmail)}" style="color:${eb.accent};">${esc(f.userEmail)}</a> to respond to the requester.`)}`,
      eb,
      { eyebrow: "Support", preheader: `${f.workspace}: ${f.subject}` },
    ),
  };
}

/** Confirmation sent to the person who raised the request. */
export function supportAckEmail(f: { subject: string; message: string }, eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  return {
    subject: `We received your request — ${f.subject}`,
    html: shell(
      "Thanks — we've got your request",
      `<p style="margin:0;">Our team has received your message and will get back to you by email as soon as we can.</p>
       <div style="border:1px solid ${LINE};border-radius:10px;padding:14px 16px;margin:16px 0;background:#f7fafc;">
         <div style="font-weight:700;font-size:15px;margin-bottom:4px;">${esc(f.subject)}</div>
         <div style="white-space:pre-wrap;font-size:14px;color:${INK};line-height:1.6;">${esc(f.message)}</div>
       </div>
       ${muted("You don't need to do anything further — just reply to this email if you'd like to add more detail.")}`,
      eb,
      { eyebrow: "Support", preheader: "We've received your request and will reply by email." },
    ),
  };
}

/** Sent to the REQUESTER when a member of staff answers their support request. */
export function supportReplyEmail(f: { subject: string; body: string; fromName?: string | null; url?: string }, eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  return {
    subject: `Re: ${f.subject}`,
    html: shell(
      "There's a reply to your request",
      `<p style="margin:0;">${f.fromName ? `${esc(f.fromName)} replied` : "Our team replied"} to <b>${esc(f.subject)}</b>:</p>
       ${quote(esc(f.body), eb.accent)}
       ${f.url ? `<div style="margin-top:18px;">${btn(f.url, "View in " + esc(eb.productName), undefined, eb)}</div>` : ""}
       ${muted(`You can reply to this email, or open the Help panel in ${esc(eb.productName)} to continue the conversation.`)}`,
      eb,
      { eyebrow: "Support", preheader: `${f.fromName ? `${f.fromName} replied` : "A reply"} to ${f.subject}.` },
    ),
  };
}

/** Sent to the ops inbox when the requester adds a follow-up to an existing request. */
export function supportFollowUpEmail(f: { subject: string; body: string; userEmail: string; workspace: string; ticketUrl?: string }, eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  return {
    subject: `[Support] Re: ${f.subject}`,
    html: shell(
      "Follow-up on a support request",
      `<p style="margin:0;"><b>${esc(f.userEmail)}</b> (workspace ${esc(f.workspace)}) added to <b>${esc(f.subject)}</b>:</p>
       ${quote(esc(f.body), eb.accent)}
       ${f.ticketUrl ? `<div style="margin-top:18px;">${btn(f.ticketUrl, "Open in support queue", undefined, eb)}</div>` : ""}`,
      eb,
      { eyebrow: "Support", preheader: `${f.userEmail} added to ${f.subject}.` },
    ),
  };
}

export function checkOutEmail(b: Booking, day: string, eb: EmailBrand = DEFAULT_EMAIL_BRAND) {
  const url = `${APP_URL}/api/checkout?token=${sign({ bookingId: b.id, action: "checkout", date: day })}`;
  return {
    subject: `Check out — ${b.spaceLabel}`,
    html: shell(
      "Time to check out?",
      `<p style="margin:0;">It's the end of the day for your booking.</p>
       ${bookingDetails(b)}
       <p style="margin:0 0 8px;">Choose what you'd like to do:</p>
       <ul style="font-size:14px;line-height:1.7;padding-left:18px;margin:0 0 18px;">
         <li><b>Check out now</b> — release the space for others.</li>
         <li><b>Stay a little longer</b> — extend the end time under <a href="${APP_URL}/mine" style="color:${eb.accent};">My bookings</a> (where permitted).</li>
         <li><b>Book another day</b> — reserve your next visit.</li>
       </ul>
       ${btn(url, "Check out", C.available, eb)}${btn(`${APP_URL}/book`, "Book another day", undefined, eb)}
       ${muted("If we don't hear from you, you'll be checked out automatically at the site's close of day.")}`,
      eb,
      { eyebrow: "Check-out", preheader: `End of day for ${b.spaceLabel} — check out or stay longer.` },
    ),
  };
}
