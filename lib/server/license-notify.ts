import "server-only";
import { DEFAULT_TENANT } from "./tenant";
import { listTenants } from "./tenants";
import { licenseState, getNotifiedThresholds, markNotifiedThresholds } from "./licensing";
import { listTenantAdminEmails } from "./users";
import { sendMail } from "./graph";
import { licenseExpiryEmail } from "./email";
import { pickExpiryNotice } from "../expiry-notice";

// Licence-expiry notifications (Commercial SaaS CP4). Run from the jobs tick: for each customer
// tenant, work out whether a new expiry band (90/60/30/14/7/1/0 days) is due and, if so, email the
// tenant's admins + the platform ops address, then record the band so it never resends. Sent from
// the PLATFORM (default tenant) mailbox so it works even if the customer's own Graph has lapsed.

const OPS = (process.env.OPS_EMAIL || process.env.BOOTSTRAP_ADMINS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export async function runLicenseChecks(): Promise<{ checked: number; notified: number }> {
  if (!process.env.DATABASE_URL) return { checked: 0, notified: 0 };
  let tenants: { slug: string; name: string }[];
  try {
    tenants = await listTenants();
  } catch {
    return { checked: 0, notified: 0 };
  }

  let notified = 0;
  for (const t of tenants) {
    if (t.slug === DEFAULT_TENANT) continue; // the platform's own workspace isn't billed
    const state = await licenseState(t.slug);
    const already = await getNotifiedThresholds(t.slug);
    const notice = pickExpiryNotice(state.daysLeft, already);
    if (!notice) continue;

    const expiresOn = state.expiresAt ? new Date(state.expiresAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : "—";
    const mail = licenseExpiryEmail(t.name, state.daysLeft ?? 0, expiresOn, state.tier);
    const recipients = [...new Set([...(await listTenantAdminEmails(t.slug)), ...OPS])];
    for (const to of recipients) await sendMail(to, mail.subject, mail.html, DEFAULT_TENANT);
    await markNotifiedThresholds(t.slug, notice.mark);
    notified++;
  }
  return { checked: tenants.length, notified };
}
