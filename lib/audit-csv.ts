import type { AuditEntry } from "./server/db";

// One CSV cell: quote it and double any embedded quotes (RFC 4180). Also neutralise a leading
// =,+,-,@ by prefixing a quote so a spreadsheet can't execute a crafted value as a formula
// (CSV injection) — audit rows carry attacker-influenced text like emails and user agents.
export function csvCell(v: string | undefined): string {
  const s = String(v ?? "");
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export const AUDIT_CSV_COLS: (keyof AuditEntry)[] = ["at", "actor", "action", "target", "detail", "before", "after", "ip", "userAgent", "requestId"];

export function auditToCsv(rows: AuditEntry[]): string {
  const header = AUDIT_CSV_COLS.join(",");
  const body = rows.map((r) => AUDIT_CSV_COLS.map((c) => csvCell(r[c] as string | undefined)).join(",")).join("\r\n");
  return `${header}\r\n${body}`;
}
