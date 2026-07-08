"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { RoamHubMark } from "@/components/roamhub-mark";
import { brand } from "@/lib/brand";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function SignupPage() {
  const [company, setCompany] = useState("");
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ url: string; trialDays: number } | null>(null);

  const slugOk = SLUG_RE.test(slug);
  const canSubmit = company.trim().length >= 2 && slugOk && name.trim() && EMAIL_RE.test(email) && password.length >= 8 && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: company.trim(), slug: slug.toLowerCase().trim(), name: name.trim(), email: email.trim(), password }),
      });
      const body = await r.json().catch(() => ({}));
      if (r.ok) setDone({ url: body.url, trialDays: body.trialDays });
      else setError(body.error ?? "Could not create your workspace.");
    } catch {
      setError("Network error — please try again.");
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-auto bg-background p-6">
      <div className="w-full max-w-[440px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <RoamHubMark className="size-11" />
          <h1 className="font-heading mt-3 text-xl font-bold">Start your free trial</h1>
          <p className="text-sm text-txt-mute">{brand.productName} · {brand.tagline}</p>
        </div>

        {done ? (
          <div className="rounded-2xl border bg-card p-6 text-center shadow-lg">
            <CheckCircle2 className="mx-auto size-10 text-ok" />
            <h2 className="mt-3 font-heading text-[17px] font-bold">Your workspace is ready</h2>
            <p className="mt-1 text-[13px] text-txt-dim">You&apos;ve got a {done.trialDays}-day trial. Sign in to set it up.</p>
            <a href={done.url} className="mt-4 inline-flex items-center gap-1.5 rounded-[11px] bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-orange-soft">
              Go to your workspace <ArrowRight className="size-4" />
            </a>
            <p className="mt-3 break-all text-[11.5px] text-txt-mute">{done.url}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="rounded-2xl border bg-card p-6 shadow-lg">
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-[13px] font-medium">
                Company name
                <input value={company} onChange={(e) => setCompany(e.target.value)} className="ed-input" placeholder="Acme Corporation" />
              </label>
              <label className="flex flex-col gap-1 text-[13px] font-medium">
                Workspace address
                <div className="flex items-center gap-1.5">
                  <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} className="ed-input" placeholder="acme" />
                  <span className="whitespace-nowrap text-[12.5px] text-txt-mute">.roamhub360.com</span>
                </div>
                {slug.length > 0 && !slugOk && <span className="text-[11px] text-destructive">3–32 lowercase letters, numbers or hyphens.</span>}
              </label>
              <div className="my-1 h-px bg-border" />
              <label className="flex flex-col gap-1 text-[13px] font-medium">
                Your name
                <input value={name} onChange={(e) => setName(e.target.value)} className="ed-input" placeholder="Alex Taylor" autoComplete="name" />
              </label>
              <label className="flex flex-col gap-1 text-[13px] font-medium">
                Work email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="ed-input" placeholder="you@company.com" autoComplete="email" />
              </label>
              <label className="flex flex-col gap-1 text-[13px] font-medium">
                Password
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="ed-input" placeholder="At least 8 characters" autoComplete="new-password" />
              </label>
              {error && <p className="text-[13px] text-destructive" role="alert">{error}</p>}
              <button type="submit" disabled={!canSubmit} className="mt-1 rounded-[11px] bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground hover:bg-orange-soft disabled:opacity-60">
                {busy ? "Creating your workspace…" : "Create workspace"}
              </button>
            </div>
          </form>
        )}

        <p className="mt-4 text-center text-[12px] text-txt-mute">
          Already have a workspace? <Link href="/signin" className="font-semibold text-primary">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
