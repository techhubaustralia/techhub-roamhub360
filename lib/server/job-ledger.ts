import "server-only";
import { prisma } from "./prisma";

// Idempotency ledger for background jobs (H8). Pattern: claim → do work → release-on-failure.
//   if (await claimJob(key, task)) {
//     const ok = await doWork();
//     if (!ok) await releaseJob(key); // let a later run retry
//   }
// The unique constraint on JobLedger.key makes the claim atomic across concurrent/duplicate runs.
// Without a database (dev JSON mode) there is no ledger, so claimJob returns true (best-effort).

const useSql = Boolean(process.env.DATABASE_URL);

/** Stable idempotency key for one unit of job work, e.g. jobKey("checkin", bookingId, "2026-07-22"). */
export function jobKey(task: string, id: string, localDate: string): string {
  return `${task}:${id}:${localDate}`;
}

/** Atomically claim a unit of work. Returns true if THIS caller won the claim (do the work), false
 *  if it was already claimed (skip — another run did it). */
export async function claimJob(key: string, task: string): Promise<boolean> {
  if (!useSql) return true; // no ledger without a DB; dev best-effort
  const p = await prisma();
  try {
    await p.jobLedger.create({ data: { key, task } });
    return true;
  } catch {
    return false; // unique-constraint violation → already claimed
  }
}

/** Release a claim so a later run can retry (call only when the work failed). */
export async function releaseJob(key: string): Promise<void> {
  if (!useSql) return;
  const p = await prisma();
  await p.jobLedger.deleteMany({ where: { key } }).catch(() => {});
}

/** Retention: drop ledger rows older than `days` (default 30). The ledger only needs to remember
 *  recent runs to dedupe same-day retries — old rows are dead weight. */
export async function pruneJobLedger(days = Number(process.env.JOB_LEDGER_RETENTION_DAYS) || 30): Promise<number> {
  if (!useSql) return 0;
  const p = await prisma();
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const res = await p.jobLedger.deleteMany({ where: { at: { lt: cutoff } } });
  return res.count as number;
}
