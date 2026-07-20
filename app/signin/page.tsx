import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, Users, ShieldCheck, PlugZap, Building2 } from "lucide-react";
import { SignInForm } from "@/components/signin-form";
import { RoamHubMark } from "@/components/roamhub-mark";
import { brand } from "@/lib/brand";
import { workspaceOrigin } from "@/lib/server/tenant";

export const metadata: Metadata = {
  title: `Sign in · ${brand.productName}`,
  description: "Smart desk, office, meeting-room and parking booking for hybrid teams — by TechHub Australia.",
};

const FEATURES = [
  { icon: CalendarCheck, title: "Book any space", body: "Desks, offices, meeting rooms and parking — with check-in, and one-tap from Microsoft Teams." },
  { icon: Users, title: "See who's in", body: "Plan your week around your team's presence, with directory names, photos and smart patterns." },
  { icon: PlugZap, title: "Microsoft 365 native", body: "Sign in with Microsoft or Google, sync your directory, and get calendar invites automatically." },
  { icon: ShieldCheck, title: "Isolated & encrypted", body: "Every organisation's data is fully separated, and your credentials are encrypted at rest." },
];

const SLUG_OK = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

// Public page (allowed in auth.config). Full-screen landing that covers the app chrome behind it.
// `?workspace=<slug>` is set by the middleware when a signed-in session belongs to a DIFFERENT
// workspace — we show a link to theirs rather than auto-bouncing them across tenancies.
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  const entraEnabled = Boolean(process.env.AUTH_MICROSOFT_ENTRA_ID_ID);
  const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID);
  const raw = (await searchParams)?.workspace;
  // Validate before echoing into the page (never render an unvalidated query param as a link).
  const otherWorkspace = raw && SLUG_OK.test(raw) && raw !== "default" ? raw : null;
  return (
    <div className="fixed inset-0 z-[100] overflow-auto bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col lg:flex-row">
        {/* Marketing */}
        <div className="flex flex-1 flex-col justify-center gap-8 p-8 lg:p-14">
          <div className="flex items-center gap-3">
            <RoamHubMark className="size-11" />
            <div>
              <div className="font-heading text-[20px] font-bold leading-none">{brand.productName}</div>
              <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-txt-mute">by {brand.company}</div>
            </div>
          </div>

          <div>
            <h1 className="font-heading text-[30px] font-bold leading-[1.15] sm:text-[36px]">
              Smart workspace booking<br />for hybrid teams.
            </h1>
            <p className="mt-3 max-w-md text-[15px] text-txt-dim">{brand.tagline} Reserve desks, offices, rooms and parking — and see who&apos;s coming in.</p>
          </div>

          <div className="grid max-w-xl gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-3">
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary/12 text-primary"><f.icon className="size-[18px]" /></span>
                <div>
                  <div className="text-[13.5px] font-semibold">{f.title}</div>
                  <p className="mt-0.5 text-[12.5px] text-txt-mute">{f.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-txt-mute">
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
            <span>© {brand.company}</span>
          </div>
        </div>

        {/* Sign-in */}
        <div className="flex flex-1 flex-col items-center justify-center border-t p-8 lg:border-l lg:border-t-0">
          {otherWorkspace && (
            <div className="mb-4 w-full max-w-[380px] rounded-[12px] border border-primary/40 bg-primary/10 px-4 py-3 text-[13px]">
              <div className="flex items-start gap-2">
                <Building2 className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <div className="font-semibold">You&apos;re signing in to the wrong workspace</div>
                  <p className="mt-0.5 text-txt-dim">
                    That account belongs to <b>{otherWorkspace}</b>. Continue at{" "}
                    <a href={workspaceOrigin(otherWorkspace)} className="font-semibold text-primary underline underline-offset-2">
                      {new URL(workspaceOrigin(otherWorkspace)).host}
                    </a>
                    .
                  </p>
                </div>
              </div>
            </div>
          )}
          <SignInForm entraEnabled={entraEnabled} googleEnabled={googleEnabled} bare />
          <p className="mt-4 text-center text-[12.5px] text-txt-mute">
            New to {brand.productName}? <Link href="/signup" className="font-semibold text-primary">Start a free trial</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
