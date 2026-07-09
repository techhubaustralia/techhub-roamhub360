import { redirect } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/server/auth";
import { getTenantBySlug } from "@/lib/server/tenants";
import { DEFAULT_TENANT } from "@/lib/server/tenant";
import { signHandoffToken } from "@/lib/server/account-token";
import { brand } from "@/lib/brand";

// Central-auth relay (main host). After OAuth completes here (fixed, registered redirect URI), we
// hand the verified identity to the target tenant subdomain — but ONLY if this user is a member of
// that workspace (or a platform admin). Otherwise we refuse: OAuth alone must not grant access to a
// customer's workspace.
export const dynamic = "force-dynamic";

function apex(): string {
  try {
    return new URL(process.env.APP_URL || "https://app.roamhub360.com").host.split(".").slice(1).join(".") || "roamhub360.com";
  } catch {
    return "roamhub360.com";
  }
}

export default async function SsoRelay({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const { to } = await searchParams;
  const me = await getUser();
  if (!me.email) redirect("/signin");

  const slug = (to || "").toLowerCase();
  const validSlug = /^[a-z0-9-]{1,32}$/.test(slug);
  if (!validSlug || slug === DEFAULT_TENANT || !(await getTenantBySlug(slug))) {
    redirect("/"); // unknown/invalid target → stay on the main host, already signed in
  }

  // Membership gate: the OAuth identity must belong to this workspace (or be a platform admin).
  const member = me.platformAdmin || (me.homeTenant ?? DEFAULT_TENANT) === slug;
  if (!member) {
    return (
      <div className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center px-6 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/15 text-4xl">⚠️</div>
        <h1 className="mt-5 text-2xl font-semibold">Not a member of this workspace</h1>
        <p className="mt-2 text-muted-foreground">Your account isn&apos;t part of <span className="font-medium text-foreground">{slug}</span>. Ask that workspace&apos;s administrator to invite you.</p>
        <Link href="/" className="mt-6 inline-block w-full rounded-[12px] bg-primary px-4 py-3 text-[15px] font-semibold text-primary-foreground">Continue</Link>
        <p className="mt-10 text-xs text-muted-foreground">{brand.productName}</p>
      </div>
    );
  }

  const token = signHandoffToken(me.email);
  redirect(`https://${slug}.${apex()}/sso/handoff?token=${encodeURIComponent(token)}`);
}
