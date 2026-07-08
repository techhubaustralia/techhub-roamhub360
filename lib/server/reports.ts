import "server-only";
import { currentTenantId } from "./tenant";
import { computeAnalytics } from "./analytics";
import { listTenantAdminEmails } from "./users";
import { sendMail } from "./graph";
import { utilizationReportEmail } from "./email";
import { lastMonthRange } from "../date-range";

// Monthly utilisation / ROI report (Growth G4). Emails last calendar month's occupancy,
// check-in and no-show stats to the workspace's admins — the renewal-justifying artefact that
// makes /insights visible without anyone logging in. Triggered by its own monthly cron
// (/api/jobs/report); runs for the request's tenant (the app host = the default/demo workspace).

export async function runMonthlyReport(now = new Date()): Promise<{ sent: number; period: string }> {
  const tenantId = await currentTenantId();
  const { from, to, label } = lastMonthRange(now);
  const admins = await listTenantAdminEmails(tenantId);
  if (!admins.length) return { sent: 0, period: label };

  const a = await computeAnalytics({ from, to });
  const busiestDay = a.peakDays.length ? [...a.peakDays].sort((x, y) => y.count - x.count)[0]?.day ?? null : null;
  const mail = utilizationReportEmail(label, { totals: a.totals, utilisation: a.utilisation, busiestDay });

  let sent = 0;
  for (const to of admins) {
    await sendMail(to, mail.subject, mail.html, tenantId); // from the tenant's own mailbox
    sent++;
  }
  return { sent, period: label };
}
