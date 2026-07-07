import { NextResponse } from "next/server";
import { getTenantBySlug } from "@/lib/server/tenants";

// Caddy on-demand-TLS "ask" endpoint. Caddy calls GET ?domain=<sni-host> before
// issuing a certificate; we return 200 only for known workspace subdomains (and the
// app host), so nobody can point an arbitrary domain at the droplet to mint certs.
// PUBLIC (see auth.config) — no session required.
export async function GET(req: Request) {
  const domain = (new URL(req.url).searchParams.get("domain") || "").toLowerCase();
  const m = domain.match(/^([a-z0-9-]+)\.roamhub360\.com$/);
  const slug = m?.[1];
  if (!slug) return new NextResponse("no", { status: 404 });
  if (slug === "app" || slug === "www") return new NextResponse("ok", { status: 200 });
  try {
    const t = await getTenantBySlug(slug);
    return t ? new NextResponse("ok", { status: 200 }) : new NextResponse("no", { status: 404 });
  } catch {
    return new NextResponse("no", { status: 404 });
  }
}
