import "server-only";
import { headers } from "next/headers";

// Tenant resolution. Every customer organisation is a tenant, identified by the
// request's subdomain: <slug>.roamhub360.com -> "<slug>". The marketing/app host
// and local/dev resolve to the single DEFAULT_TENANT (which is also what every
// existing row is backfilled to). Query-level ENFORCEMENT is wired in MT2 — this
// module only resolves the id; nothing scopes on it yet.

export const DEFAULT_TENANT = "default";

// Subdomains that are NOT customer tenants (app shell, marketing, infra).
const RESERVED = new Set(["", "app", "www", "admin", "api", "auth", "localhost"]);

/** The tenant slug for the current request, from the Host subdomain. */
export async function currentTenantId(): Promise<string> {
  try {
    const h = await headers();
    const host = (h.get("x-forwarded-host") || h.get("host") || "").split(":")[0].toLowerCase();
    if (!host || host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return DEFAULT_TENANT;
    const parts = host.split(".");
    const sub = parts.length > 2 ? parts[0] : ""; // sub.domain.tld => "sub"
    return sub && !RESERVED.has(sub) ? sub : DEFAULT_TENANT;
  } catch {
    // Called outside a request (e.g. a job/CLI) — caller passes the tenant explicitly.
    return DEFAULT_TENANT;
  }
}

/** Absolute origin for a workspace, e.g. "https://acme.roamhub360.com" (or the main app host for the
 *  default workspace). Used to build links (invites, resets) that land on the RIGHT subdomain — not
 *  wherever the request happened to originate. Derived from APP_URL's apex. */
export function workspaceOrigin(slug?: string | null): string {
  const base = process.env.APP_URL || "https://app.roamhub360.com";
  try {
    const host = new URL(base).host;
    const apex = host.split(".").slice(1).join(".") || host;
    return !slug || slug === DEFAULT_TENANT ? base.replace(/\/+$/, "") : `https://${slug}.${apex}`;
  } catch {
    return !slug || slug === DEFAULT_TENANT ? "https://app.roamhub360.com" : `https://${slug}.roamhub360.com`;
  }
}
