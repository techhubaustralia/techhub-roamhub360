import type { Metadata } from "next";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { SignupForm } from "@/components/signup-form";
import { RoamHubMark } from "@/components/roamhub-mark";
import { brand } from "@/lib/brand";

export const metadata: Metadata = { title: `Start a free trial · ${brand.productName}` };

// Public page (allowed in auth.config). Self-serve trials are OFF unless the operator sets
// ALLOW_PUBLIC_SIGNUP=true (public tenant creation is abuse-prone) — in that state the API refuses
// every submission, so instead of a dead form we say how workspaces are actually provisioned.
export default function SignupPage() {
  const open = process.env.ALLOW_PUBLIC_SIGNUP === "true";
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-auto bg-background p-6">
      {open ? (
        <SignupForm />
      ) : (
        <div className="w-full max-w-[440px]">
          <div className="mb-6 flex flex-col items-center text-center">
            <RoamHubMark className="size-11" />
            <h1 className="font-heading mt-3 text-xl font-bold">Get {brand.productName} for your organisation</h1>
            <p className="text-sm text-txt-mute">{brand.tagline}</p>
          </div>
          <div className="rounded-2xl border bg-card p-6 shadow-lg">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary/12 text-primary"><Building2 className="size-[18px]" /></span>
              <div className="text-[13.5px] leading-relaxed">
                <p>Workspaces are set up for you by {brand.company}: your own address at <b>yourcompany.roamhub360.com</b>, your sites and floor plans, and Microsoft 365 sign-in for your team.</p>
                <p className="mt-2">Email <a href={`mailto:${brand.supportEmail}`} className="font-semibold text-primary">{brand.supportEmail}</a> and we&apos;ll have you booking desks within a day.</p>
              </div>
            </div>
          </div>
          <p className="mt-4 text-center text-[12px] text-txt-mute">
            Already have a workspace? <Link href="/signin" className="font-semibold text-primary">Sign in</Link>
          </p>
        </div>
      )}
    </div>
  );
}
