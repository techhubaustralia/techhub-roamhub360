// Mask PII (email addresses) in server logs so raw addresses don't accumulate in log storage.
// Keeps enough to correlate (first char + domain) without recording the full identity.
// Full retention/access policy is operational; this is the code-level redaction (M7).

export function redactEmail(email: string | null | undefined): string {
  const e = String(email ?? "").trim();
  const at = e.indexOf("@");
  if (at < 1) return "***";
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  const head = local[0];
  return `${head}${"*".repeat(Math.max(2, local.length - 1))}@${domain}`;
}
