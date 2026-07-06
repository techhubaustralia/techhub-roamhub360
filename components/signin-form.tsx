"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { RoamHubMark } from "@/components/roamhub-mark";
import { brand } from "@/lib/brand";

export function SignInForm({ entraEnabled, googleEnabled }: { entraEnabled: boolean; googleEnabled: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) setError("Incorrect email or password.");
    else window.location.assign("/");
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-auto bg-background p-6">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <RoamHubMark className="size-12" />
          <h1 className="font-heading mt-3 text-xl font-bold">{brand.productName}</h1>
          <p className="text-sm text-txt-mute">{brand.tagline}</p>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-lg">
          {(entraEnabled || googleEnabled) && (
            <>
              <div className="flex flex-col gap-2">
                {googleEnabled && (
                  <button
                    type="button"
                    onClick={() => signIn("google", { callbackUrl: "/" })}
                    className="flex w-full items-center justify-center gap-2 rounded-[11px] border bg-panel-2 px-3 py-2.5 text-sm font-semibold transition-colors hover:border-primary"
                  >
                    <GoogleLogo /> Continue with Google
                  </button>
                )}
                {entraEnabled && (
                  <button
                    type="button"
                    onClick={() => signIn("microsoft-entra-id", { callbackUrl: "/" })}
                    className="flex w-full items-center justify-center gap-2 rounded-[11px] border bg-panel-2 px-3 py-2.5 text-sm font-semibold transition-colors hover:border-primary"
                  >
                    <MsLogo /> Continue with Microsoft
                  </button>
                )}
              </div>
              <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-wider text-txt-mute">
                <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-[13px] font-medium">
              Email
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="ed-input" placeholder="you@company.com" autoComplete="email" />
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-medium">
              Password
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="ed-input" placeholder="••••••••" autoComplete="current-password" />
            </label>
            {error && (
              <p className="text-[13px] text-destructive" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="mt-1 rounded-[11px] bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-orange-soft disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-[11px] text-txt-mute">A {brand.company} product</p>
      </div>
    </div>
  );
}

function MsLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden="true">
      <path fill="#f35325" d="M1 1h10v10H1z" />
      <path fill="#81bc06" d="M12 1h10v10H12z" />
      <path fill="#05a6f0" d="M1 12h10v10H1z" />
      <path fill="#ffba08" d="M12 12h10v10H12z" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#ffc107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.6 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#ff3d00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.6 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z" />
      <path fill="#4caf50" d="M24 43.5c5.5 0 10.3-1.9 13.8-5.1l-6.4-5.4C29.4 34.6 26.8 35.5 24 35.5c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 38.9 16.2 43.5 24 43.5z" />
      <path fill="#1976d2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4 5.6l6.4 5.4c-.5.4 6.8-4.9 6.8-15 0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}
