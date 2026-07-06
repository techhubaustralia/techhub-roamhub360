import "server-only";
import type { Booking } from "./db";
import { sign } from "./token";
import { escapeHtml as esc } from "../escape-html";
import { brand } from "../brand";

// Brand-driven email templates. Emails can't use the app's CSS tokens or next/font,
// so they use a web-safe font stack and the brand hex values from lib/brand.ts.
const APP_URL = process.env.APP_URL || brand.defaultAppUrl;
const MAIL_FROM = process.env.MAIL_FROM || brand.defaultMailFrom;
const C = brand.colors;

const shell = (title: string, body: string) => `
<div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:auto;color:${C.navy}">
  <div style="background:${C.navy};color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;font-weight:700;letter-spacing:.04em">${brand.productName}</div>
  <div style="border:1px solid #d7e1e7;border-top:none;border-radius:0 0 12px 12px;padding:20px">
    <h2 style="margin:0 0 8px;font-size:18px">${title}</h2>
    ${body}
    <p style="color:#7491a0;font-size:12px;margin-top:24px">Automated message from ${brand.productName} · ${brand.company}. Sent from ${MAIL_FROM}.</p>
  </div>
</div>`;

const btn = (href: string, label: string, color: string = C.primary) =>
  `<a href="${href}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;margin-right:8px">${label}</a>`;

const when = (b: Booking) => `${esc(b.start.replace("T", " "))} → ${esc(b.end.replace("T", " "))}`;

export function confirmationEmail(b: Booking) {
  const onBehalf = b.bookedByEmail ? `<p style="color:#7491a0;font-size:13px">Booked on your behalf by ${esc(b.bookedByEmail)}.</p>` : "";
  return {
    subject: `Booking confirmed — ${b.spaceLabel}`,
    html: shell(
      "Booking confirmed",
      `<p>Your booking is confirmed.</p>
       <p><b>${esc(b.spaceLabel)}</b><br>${when(b)}</p>
       ${onBehalf}
       <p style="margin-top:16px">${btn(`${APP_URL}/mine`, "View my bookings")}</p>`,
    ),
  };
}

export function cancellationEmail(b: Booking, opts?: { byAdmin?: string; reason?: string }) {
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
       <p style="margin-top:16px">${btn(`${APP_URL}/book`, "Book another space")}</p>`,
    ),
  };
}

export function updatedEmail(b: Booking) {
  return {
    subject: `Booking updated — ${b.spaceLabel}`,
    html: shell(
      "Booking updated",
      `<p>Your booking has been updated.</p>
       <p><b>${esc(b.spaceLabel)}</b><br>${when(b)}</p>
       <p style="margin-top:16px">${btn(`${APP_URL}/mine`, "View my bookings")}</p>`,
    ),
  };
}

export function reminderEmail(b: Booking) {
  return {
    subject: `Reminder — ${b.spaceLabel} tomorrow`,
    html: shell("Booking reminder", `<p>Reminder of your booking tomorrow:</p><p><b>${esc(b.spaceLabel)}</b><br>${when(b)}</p>`),
  };
}

export function checkInEmail(b: Booking, day: string) {
  const url = `${APP_URL}/api/checkin?token=${sign({ bookingId: b.id, action: "checkin", date: day })}`;
  return {
    subject: `Check in — ${b.spaceLabel}`,
    html: shell(
      "Time to check in",
      `<p>Check in for your booking to keep it. Bookings not checked in by 09:30 are automatically cancelled.</p>
       <p><b>${esc(b.spaceLabel)}</b><br>${when(b)}</p>
       <p style="margin-top:16px">${btn(url, "Check in")}</p>`,
    ),
  };
}

export function checkOutEmail(b: Booking, day: string) {
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
         <li><b>Stay a little longer</b> — extend the end time under <a href="${APP_URL}/mine" style="color:${C.primary}">My bookings</a> (where permitted).</li>
         <li><b>Book another day</b> — reserve your next visit.</li>
       </ul>
       <p style="margin-top:4px">${btn(url, "Check out", C.available)}${btn(`${APP_URL}/book`, "Book another day")}</p>
       <p style="color:#7491a0;font-size:12px;margin-top:14px">If we don't hear from you, you'll be checked out automatically at 17:30.</p>`,
    ),
  };
}
