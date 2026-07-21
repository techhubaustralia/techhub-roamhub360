// Pure host → tenant mapping, shared by the edge middleware (auth.config.ts), the Node auth config
// (auth.ts, for tenant-locking sign-in), and tests. No framework imports so it's safe everywhere.
//
// A workspace lives on its own subdomain: <slug>.roamhub360.com. The main host (app / www / bare /
// an IP / localhost) maps to the DEFAULT workspace.

const RESERVED = new Set(["", "app", "www", "admin", "api", "auth", "localhost"]);

// The one apex we serve workspaces under, derived from APP_URL (e.g. "roamhub360.com"). A host is
// only interpreted as a workspace when it sits under this apex — so a spoofed Host /
// X-Forwarded-Host like "victim.evil.com" (or any domain we don't own) maps to DEFAULT instead of
// impersonating a tenant. This is the app-side half of H1; the proxy must also OVERWRITE (not
// append) X-Forwarded-Host from the real Host — see docs/RUNBOOK Caddy config.
function trustedApex(): string {
  try {
    return new URL(process.env.APP_URL || "https://app.roamhub360.com").hostname.split(".").slice(-2).join(".");
  } catch {
    return "roamhub360.com";
  }
}

/** Tenant slug for a Host header value (may include a port or an x-forwarded-host comma list). */
export function tenantFromHost(host: string): string {
  const h = (host || "").split(",")[0].trim().split(":")[0].toLowerCase();
  if (!h || h === "localhost" || h.endsWith(".localhost") || /^\d+\.\d+\.\d+\.\d+$/.test(h)) return "default";
  const apex = trustedApex();
  if (h !== apex && !h.endsWith("." + apex)) return "default"; // not a host we own → never a tenant
  const parts = h.split(".");
  const sub = parts.length > 2 ? parts[0] : "";
  return sub && !RESERVED.has(sub) ? sub : "default";
}

/** The bare host actually being visited (Caddy forwards it). x-forwarded-host wins over host. */
export function requestHost(request: { headers: { get(name: string): string | null } }): string {
  const raw = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  return raw.split(",")[0].trim();
}
