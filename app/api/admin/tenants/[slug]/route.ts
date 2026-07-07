import { NextResponse } from "next/server";
import { getUser } from "@/lib/server/auth";
import { DEFAULT_TENANT } from "@/lib/server/tenant";
import { getTenantBySlug, setTenantStatus, setTenantFeatures, tenantStats } from "@/lib/server/tenants";
import { licenseState, saveLicense } from "@/lib/server/licensing";
import { audit } from "@/lib/server/db";
import { z } from "zod";

// TechHub Partner / Control-Plane portal (Commercial SaaS CP3). Platform operators only.
// Manage a customer's licence, suspension and feature flags, view monitoring, and open (impersonate)
// their workspace — every action audited.
function operator(me: { platformAdmin?: boolean }): boolean {
  return Boolean(me.platformAdmin);
}

/** customer workspace URL from APP_URL's apex, e.g. app.roamhub360.com -> acme.roamhub360.com */
function workspaceUrl(slug: string): string {
  try {
    const host = new URL(process.env.APP_URL || "https://app.roamhub360.com").host;
    const apex = host.split(".").slice(1).join(".") || host;
    return `https://${slug}.${apex}`;
  } catch {
    return `https://${slug}.roamhub360.com`;
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const me = await getUser();
  if (!operator(me)) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  const [license, stats] = await Promise.all([licenseState(slug), tenantStats(slug)]);
  return NextResponse.json({ tenant, license, stats, workspaceUrl: workspaceUrl(slug) });
}

const Patch = z.object({
  status: z.enum(["active", "suspended"]).optional(),
  features: z.array(z.string().max(40)).max(20).optional(),
  license: z
    .object({
      tier: z.enum(["trial", "standard", "professional", "enterprise"]).optional(),
      maxSites: z.number().int().min(0).max(9999).optional(),
      maxFloorsPerSite: z.number().int().min(1).max(99).optional(),
      status: z.enum(["active", "suspended", "cancelled"]).optional(),
      expiresAt: z.string().datetime().nullable().optional(),
      graceDays: z.number().int().min(0).max(365).optional(),
      notes: z.string().max(500).optional(),
    })
    .optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const me = await getUser();
  if (!operator(me)) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const { slug } = await params;
  if (slug === DEFAULT_TENANT) return NextResponse.json({ error: "The default workspace can't be modified here." }, { status: 400 });
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });

  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { status, features, license } = parsed.data;

  if (status) {
    // Suspension drives licence enforcement (read-only) AND the tenant's display status.
    await setTenantStatus(tenant.id, status);
    await saveLicense(slug, { status: status === "suspended" ? "suspended" : "active" });
    await audit(me.email, "tenant.status", `${slug} -> ${status}`);
  }
  if (features) {
    await setTenantFeatures(tenant.id, features);
    await audit(me.email, "tenant.features", `${slug}: [${features.join(",")}]`);
  }
  if (license) {
    await saveLicense(slug, license);
    await audit(me.email, "tenant.license", `${slug}: ${JSON.stringify(license)}`);
  }

  const [next, ls, stats] = await Promise.all([getTenantBySlug(slug), licenseState(slug), tenantStats(slug)]);
  return NextResponse.json({ tenant: next, license: ls, stats, workspaceUrl: workspaceUrl(slug) });
}

// Impersonate: platform operators already have cross-tenant access (membership-guard bypass);
// this records the intent to view the customer's workspace and returns its URL.
export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const me = await getUser();
  if (!operator(me)) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  await audit(me.email, "tenant.impersonate", `${me.email} opened ${slug} workspace`);
  return NextResponse.json({ url: workspaceUrl(slug) });
}
