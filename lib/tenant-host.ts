// Pure host → tenant mapping, shared by the edge middleware (auth.config.ts), the Node auth config
// (auth.ts, for tenant-locking sign-in), and tests. No framework imports so it's safe everywhere.
//
// A workspace lives on its own subdomain: <slug>.roamhub360.com. The main host (app / www / bare /
// an IP / localhost) maps to the DEFAULT workspace.

const RESERVED = new Set(["", "app", "www", "admin", "api", "auth", "localhost"]);

/** Tenant slug for a Host header value (may include a port or an x-forwarded-host comma list). */
export function tenantFromHost(host: string): string {
  const h = (host || "").split(",")[0].trim().split(":")[0].toLowerCase();
  if (!h || h === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(h)) return "default";
  const parts = h.split(".");
  const sub = parts.length > 2 ? parts[0] : "";
  return sub && !RESERVED.has(sub) ? sub : "default";
}

/** The bare host actually being visited (Caddy forwards it). x-forwarded-host wins over host. */
export function requestHost(request: { headers: { get(name: string): string | null } }): string {
  const raw = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  return raw.split(",")[0].trim();
}
