import crypto from "crypto";
import { NextResponse } from "next/server";
import { listBookings, setBookingStatus, audit, pruneAudit, type Booking } from "@/lib/server/db";
import { sendMail } from "@/lib/server/graph";
import { reminderEmail, checkInEmail, checkOutEmail, presenceDigestEmail, emailBrand } from "@/lib/server/email";
import { listCustomBuildings, listHiddenBuildings, getStoredPlan } from "@/lib/server/store";
import { getHiddenPresenceEmails, getPresenceDigestEmails } from "@/lib/server/users";
import { getDirectoryMap } from "@/lib/server/directory";
import { ACTIVE_STATUSES, DEFAULT_TZ, AUTO_RELEASE_DEFAULT, TICK_TIME_RE, autoReleaseTimeFor } from "@/lib/booking-rules";
import { visibleColleagues } from "@/lib/presence-digest";
import { runLicenseChecks } from "@/lib/server/license-notify";
import { runMonthlyReport } from "@/lib/server/reports";
import { claimJob, releaseJob, jobKey, pruneJobLedger } from "@/lib/server/job-ledger";

// Cron model: a single `tick` task runs every 30 min (UTC). For each LIVE building it computes
// its LOCAL time (from the building's saved timezone) and runs whatever is due, so every site
// fires at its own 08:00 / 09:30 / 17:00 / 17:30 / reminder. Individual task names can also be
// called manually (runs that task for every building using each building's local date/time).
//
// NOTE: bookings are keyed by floor id (`<root>` or `<root>__floor-N`); we group by the root
// building id. Sites are admin-created custom buildings (there are no built-in OFFICES), so we
// iterate the persisted building list — iterating the old empty OFFICES array did nothing.

type Task = "reminder" | "checkin" | "checkout" | "auto-release" | "auto-checkout" | "digest";
// Fixed times are :00/:30 so they can match the 30-minute tick. Sites with their own opening hours
// override `checkin` (fires at the site's opening time when it is a tick slot) and `auto-release`;
// `checkout` (reminder) and `auto-checkout` are evaluated EVERY tick against each booking's own end
// time, so a site that closes at 19:00 is handled the same as one that closes at 17:30.
const EVERY_TICK = "*";
const TARGET: Record<Task, string> = {
  digest: "07:30", // Team Build-Up D: morning "who's in" digest, before check-in reminders
  reminder: "18:00",
  checkin: "08:00", // fallback when the site's opening time is not a :00/:30 slot
  "auto-release": AUTO_RELEASE_DEFAULT, // global fallback; each site may override on a :00/:30 slot
  checkout: EVERY_TICK, // reminder ≤ 30 min before each booking ends — see runTask
  "auto-checkout": EVERY_TICK, // idempotent: only bookings that have already ended
};
/** Minutes from HH:mm `a` to HH:mm `b` on the same day. */
const minutesUntil = (a: string, b: string) => {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return m(b) - m(a);
};

/** Display name from an email local-part, e.g. "abin.raju@…" -> "Abin Raju". */
function displayName(email: string): string {
  return (email.split("@")[0] || email).replace(/[._]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function officeNow(iana: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: iana,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hh = g("hour");
  if (hh === "24") hh = "00";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, hhmm: `${hh}:${g("minute")}` };
}
const nextDay = (d: string) => new Date(new Date(d + "T00:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
const rootOf = (id: string) => id.split("__")[0];

/** Live (non-hidden) buildings with their IANA timezone (from the saved plan; platform-default
 *  fallback) and their per-site auto-release time (validated tick slot, else the default). */
async function liveBuildings(): Promise<{ id: string; iana: string; name: string; releaseTime: string; checkinTime: string }[]> {
  const hidden = new Set(await listHiddenBuildings());
  const buildings = (await listCustomBuildings()).filter((b) => !hidden.has(b.id));
  const out: { id: string; iana: string; name: string; releaseTime: string; checkinTime: string }[] = [];
  for (const b of buildings) {
    const plan = await getStoredPlan(b.id);
    // The check-in reminder goes out when the site opens (if that is a tick slot), else at 08:00.
    const open = plan?.openTime;
    out.push({
      id: b.id,
      iana: plan?.tz || DEFAULT_TZ,
      name: b.name || b.id,
      releaseTime: autoReleaseTimeFor(plan?.autoReleaseTime),
      checkinTime: open && TICK_TIME_RE.test(open) ? open : TARGET.checkin,
    });
  }
  return out;
}

// Send exactly one email per (task, id, localDate) even if this job runs twice. Claims a ledger key
// first; a duplicate run finds it taken and skips. On send failure the claim is released so a later
// run retries (at-least-once, deduped on success). Returns true if an email was actually sent.
async function sendOnce(task: string, id: string, localDate: string, to: string, subject: string, html: string): Promise<boolean> {
  const key = jobKey(task, id, localDate);
  if (!(await claimJob(key, task))) return false; // already handled by an earlier/concurrent run
  const sent = await sendMail(to, subject, html);
  if (!sent) await releaseJob(key); // transport failed → let a later run retry
  return sent;
}

async function runTask(task: Task, buildingRoot: string, localDate: string, localNow: string, all: Booking[], siteName = buildingRoot, releaseTime = TARGET["auto-release"]): Promise<number> {
  const mine = all.filter((b) => rootOf(b.buildingId) === buildingRoot);
  const eb = await emailBrand(); // per-tenant email branding (G6); stock brand on the default host
  let n = 0;
  if (task === "reminder") {
    const tmr = nextDay(localDate);
    for (const b of mine.filter((b) => b.status === "Booked" && b.start.slice(0, 10) === tmr)) {
      const m = reminderEmail(b, eb);
      if (await sendOnce("reminder", b.id, localDate, b.userEmail, m.subject, m.html)) n++;
    }
  } else if (task === "checkin") {
    for (const b of mine.filter((b) => b.status === "Booked" && b.start.slice(0, 10) === localDate)) {
      const m = checkInEmail(b, localDate, eb);
      if (await sendOnce("checkin", b.id, localDate, b.userEmail, m.subject, m.html)) n++;
    }
  } else if (task === "checkout") {
    // Check-out reminder ≤ 30 minutes before the booking ends (or once it has ended), whatever the
    // site's hours. sendOnce dedupes per booking per day, so re-ticks never re-send.
    const nowHm = localNow.slice(11);
    for (const b of mine.filter((b) => b.status === "Checked in" && b.end.slice(0, 10) === localDate && minutesUntil(nowHm, b.end.slice(11)) <= 30)) {
      const m = checkOutEmail(b, localDate, eb);
      if (await sendOnce("checkout", b.id, localDate, b.userEmail, m.subject, m.html)) n++;
    }
  } else if (task === "auto-release") {
    // Not checked in by the site's auto-release time (default 09:30) → auto-cancel with a clear
    // reason (compare-and-set on the still-"Booked" status so we never clobber a check-in that
    // landed in the same tick).
    for (const b of mine.filter((b) => b.status === "Booked" && b.start.slice(0, 10) === localDate)) {
      const ok = await setBookingStatus(
        b.id,
        "Cancelled",
        { cancelledBy: "system", cancelReason: `Automatically cancelled — not checked in by ${releaseTime}.` },
        "Booked",
      );
      if (ok) {
        await audit("system", "booking.auto-cancel", `${b.spaceLabel} — no check-in by ${releaseTime}`);
        n++;
      }
    }
  } else if (task === "auto-checkout") {
    for (const b of mine.filter((b) => b.status === "Checked in" && b.end <= localNow)) {
      await setBookingStatus(b.id, "Checked out");
      await audit("system", "booking.auto-checkout", b.spaceLabel);
      n++;
    }
  } else if (task === "digest") {
    // Morning "who's in" digest: email each opted-in person the colleagues booked at this site
    // today, honouring presence opt-outs. Only sent to people who themselves have a booking today.
    const active = mine.filter((b) => ACTIVE_STATUSES.includes(b.status) && b.start.slice(0, 10) <= localDate && b.end.slice(0, 10) >= localDate);
    if (!active.length) return 0;
    const [hidden, wantDigest, dir] = await Promise.all([
      getHiddenPresenceEmails(),
      getPresenceDigestEmails(),
      getDirectoryMap(active.map((b) => b.userEmail)),
    ]);
    const nameOf = (email: string) => dir[email.toLowerCase()]?.displayName || displayName(email);
    const recipients = [...new Set(active.map((b) => b.userEmail.toLowerCase()))].filter((e) => wantDigest.has(e));
    for (const rcpt of recipients) {
      const colleagues = visibleColleagues(rcpt, active, hidden, ACTIVE_STATUSES).map((c) => ({
        name: nameOf(c.email),
        spaceLabel: c.spaceLabel,
        checkedIn: c.checkedIn,
      }));
      const m = presenceDigestEmail(nameOf(rcpt), siteName, localDate, colleagues, eb);
      // Key by recipient+site+day so a re-tick doesn't re-send, but each site's digest still sends.
      if (await sendOnce("digest", `${buildingRoot}:${rcpt}`, localDate, rcpt, m.subject, m.html)) n++;
    }
  }
  return n;
}

export async function GET(req: Request, { params }: { params: Promise<{ task: string }> }) {
  // SECURITY: fail CLOSED — with no JOBS_SECRET configured the old check compared "" === "" and
  // let anyone trigger jobs (mass emails, auto-cancellations). Also constant-time compare.
  const secret = process.env.JOBS_SECRET || "";
  const given = req.headers.get("x-jobs-secret") || "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  if (!secret || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { task } = await params;
  const all = await listBookings();
  const buildings = await liveBuildings();
  const results: Record<string, number> = {};

  if (task === "tick") {
    for (const o of buildings) {
      const { date, hhmm } = officeNow(o.iana);
      const localNow = `${date}T${hhmm}`;
      for (const t of Object.keys(TARGET) as Task[]) {
        // auto-release fires at the site's own time (default 09:30); every other task at its global
        // TARGET time. Both are :00/:30, so they can match the 30-minute tick.
        const due = t === "auto-release" ? o.releaseTime : t === "checkin" ? o.checkinTime : TARGET[t];
        if (due === EVERY_TICK || due === hhmm) results[`${o.id}:${t}`] = await runTask(t, o.id, date, localNow, all, o.name, o.releaseTime);
      }
    }
    // Tenant-level (not per-building): licence-expiry notices. Idempotent — dedupes on the bands
    // already sent, so running every tick only ever emails when a new band is crossed (CP4).
    results["_license"] = (await runLicenseChecks()).notified;
    return NextResponse.json({ task: "tick", results });
  }

  if (task === "license-check") {
    return NextResponse.json({ task, ...(await runLicenseChecks()) });
  }

  if (task === "audit-prune") {
    // Daily retention sweep: drop audit rows past AUDIT_RETENTION_DAYS and stale job-ledger rows.
    return NextResponse.json({ task, prunedAudit: await pruneAudit(), prunedLedger: await pruneJobLedger() });
  }

  if (task === "report") {
    // Monthly ROI report for the request's tenant. Trigger with its own cron (1st of the month).
    return NextResponse.json({ task, ...(await runMonthlyReport()) });
  }

  if (!(task in TARGET)) return NextResponse.json({ error: "unknown task" }, { status: 400 });
  // manual run: that task for all buildings, using each building's local date/time
  for (const o of buildings) {
    const { date, hhmm } = officeNow(o.iana);
    results[o.id] = await runTask(task as Task, o.id, date, `${date}T${hhmm}`, all, o.name, o.releaseTime);
  }
  return NextResponse.json({ task, results });
}
